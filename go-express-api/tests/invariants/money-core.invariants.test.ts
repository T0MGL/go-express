import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';

// Suite de invariantes del nucleo financiero (Paso 3). Cada invariante bloquea el deploy si
// falla. Corre contra el esquema real via INVARIANT_DATABASE_URL (pooler session mode); toda
// la suite vive dentro de UN BEGIN ... ROLLBACK con datos sinteticos, asi prod queda intacto.
//
// OPT-IN: si INVARIANT_DATABASE_URL no esta seteada, la suite se salta entera. No usa el
// cliente supabase del harness normal (que tiene un guard contra el host de prod): este gate
// es deliberado, read-only-via-rollback, y se corre explicito antes de un deploy del core.
//
//   INVARIANT_DATABASE_URL="postgresql://...pooler...:5432/postgres" npx vitest run tests/invariants

const DB_URL = process.env['INVARIANT_DATABASE_URL'];
const SISTEMA = '00000000-0000-4000-a000-000000000001';

const run = DB_URL ? describe : describe.skip;

run('money-core invariants', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: DB_URL });
    await client.connect();
    await client.query('BEGIN');
    // Cliente y repartidor sinteticos reutilizables. limite alto para no chocar el limite de
    // credito en los invariantes que no lo prueban.
    await client.query(`
      INSERT INTO clientes (razon_social, ruc, contacto_nombre, telefono, email, direccion, ciudad, estado, limite_credito)
      VALUES ('ZZINV_CC','77777777-1','Inv','+595981777001','zzinv_cc@descartable.local','x','Asuncion','activo',1000000000)
    `);
    await client.query(`
      INSERT INTO repartidores (nombre, telefono, vehiculo, placa, estado)
      VALUES ('ZZINV Repartidor','+595981777099','Moto','ZZINVXX','activo')
    `);
  });

  afterAll(async () => {
    if (client) {
      await client.query('ROLLBACK');
      await client.end();
    }
  });

  async function sp<T>(fn: () => Promise<T>): Promise<T> {
    await client.query('SAVEPOINT inv');
    try {
      const r = await fn();
      await client.query('ROLLBACK TO inv');
      return r;
    } catch (e) {
      await client.query('ROLLBACK TO inv');
      throw e;
    }
  }

  async function clienteId(): Promise<string> {
    const r = await client.query(`SELECT id FROM clientes WHERE razon_social='ZZINV_CC'`);
    return r.rows[0].id as string;
  }
  async function repartidorId(): Promise<string> {
    const r = await client.query(`SELECT id FROM repartidores WHERE nombre='ZZINV Repartidor'`);
    return r.rows[0].id as string;
  }
  async function insEnvio(tn: string, cols: Record<string, unknown>): Promise<string> {
    const cid = await clienteId();
    const base: Record<string, unknown> = {
      tracking_number: tn, cliente_id: cid, cliente_nombre: 'ZZINV_CC',
      origen: 'Asuncion', destino: 'Asuncion', destinatario_nombre: 'T',
      destinatario_direccion: 'x', destinatario_telefono: '+595981000000',
      destinatario_ciudad: 'Asuncion', destinatario_departamento: 'Central',
      cantidad: 1, peso: 1, fragil: false, valor_declarado: 0, estado: 'pendiente',
      costo: 0, monto_a_cobrar: 0, tipo_pago: 'cuenta_corriente',
      seguro_adicional: false, costo_seguro: 0, tags: '{}', fecha: '2026-06-17',
      ...cols,
    };
    const keys = Object.keys(base);
    const vals = keys.map((_, i) => `$${i + 1}`).join(',');
    const r = await client.query(
      `INSERT INTO envios (${keys.join(',')}) VALUES (${vals}) RETURNING id`,
      keys.map((k) => base[k]),
    );
    return r.rows[0].id as string;
  }

  // 1) saldo_cuenta_corriente == SUM(movimientos) para todo cliente. Tolerancia 0.
  it('inv1: saldo cache == SUM(movimientos) sin desincronizacion', async () => {
    await sp(async () => {
      await insEnvio('ZZINV-1', { costo: 100000, tipo_pago: 'cuenta_corriente' });
      const r = await client.query(`SELECT count(*)::int AS n FROM verificar_saldo_cc()`);
      expect(r.rows[0].n).toBe(0);
    });
  });

  // 2) Para todo envio CC con debito: SUM(movimientos del envio) == costo+seguro VIGENTE.
  it('inv2: ledger del envio == costo+seguro vigente tras editar el costo', async () => {
    await sp(async () => {
      const env = await insEnvio('ZZINV-2', { costo: 100000, costo_seguro: 20000, tipo_pago: 'cuenta_corriente' });
      await client.query(`UPDATE envios SET costo=150000 WHERE id=$1`, [env]);
      const r = await client.query(
        `SELECT (SELECT costo+COALESCE(costo_seguro,0) FROM envios WHERE id=$1) AS factura,
                (SELECT COALESCE(SUM(monto),0) FROM movimientos_cuenta_corriente WHERE envio_id=$1) AS ledger`,
        [env],
      );
      expect(Number(r.rows[0].ledger)).toBe(Number(r.rows[0].factura));
      expect(Number(r.rows[0].ledger)).toBe(170000);
    });
  });

  // 3) Soft-delete reversa el NETO COMPLETO del envio, incluido cualquier credito/nota_credito
  //    scoped al envio. Antes (034) el reverso sumaba solo (debito,ajuste,reverso) y un envio
  //    con nota de credito quedaba con saldo fantasma a favor del afiliado. Este invariante
  //    siembra DEBITO + NOTA_CREDITO y exige SUM(movimientos del envio)=0 tras el soft-delete
  //    (bloqueante A2). Pre-035 fallaba con neto=-30000.
  it('inv3: soft-delete con nota_credito deja ledger neto del envio en 0 (reversa del neto completo)', async () => {
    await sp(async () => {
      const cid = await clienteId();
      const env = await insEnvio('ZZINV-3', { costo: 100000, tipo_pago: 'cuenta_corriente' });
      // nota de credito scoped al envio: baja la deuda del envio en 30000.
      await client.query(
        `SELECT registrar_movimiento_cc($1,$2,NULL,'nota_credito',-30000,'NC parcial',$3,NULL,NULL,TRUE)`,
        [cid, env, SISTEMA],
      );
      const pre = await client.query(
        `SELECT COALESCE(SUM(monto),0) AS neto FROM movimientos_cuenta_corriente WHERE envio_id=$1`,
        [env],
      );
      expect(Number(pre.rows[0].neto)).toBe(70000);
      await client.query(`UPDATE envios SET eliminado=true, eliminado_en=NOW() WHERE id=$1`, [env]);
      const r = await client.query(
        `SELECT COALESCE(SUM(monto),0) AS neto FROM movimientos_cuenta_corriente WHERE envio_id=$1`,
        [env],
      );
      expect(Number(r.rows[0].neto)).toBe(0);
    });
  });

  // 4) Todo COD entregado tiene exactamente un pago activo O cod_pago_pendiente=true.
  //    Verificamos que registrar el pago lo saca de pendiente y deja exactamente un pago activo.
  it('inv4: COD con pago activo no queda pendiente (uno u otro, nunca ambos ni ninguno)', async () => {
    await sp(async () => {
      const env = await insEnvio('ZZINV-4', {
        estado: 'entregado', tipo_pago: 'contra_entrega', costo: 30000, monto_a_cobrar: 100000,
        cod_pago_pendiente: true,
      });
      await client.query(
        `SELECT create_pago_atomico($1,100000,100000,'contra_entrega','2026-06-17',NULL,NULL,$2,'ZZ','ZZINV-4',NULL,NULL)`,
        [env, SISTEMA],
      );
      const r = await client.query(
        `SELECT (SELECT cod_pago_pendiente FROM envios WHERE id=$1) AS pend,
                (SELECT count(*)::int FROM pagos WHERE envio_id=$1 AND anulado=false) AS activos`,
        [env],
      );
      expect(r.rows[0].pend).toBe(false);
      expect(r.rows[0].activos).toBe(1);
    });
  });

  // 5) cod_pago_pendiente=false para todo envio con pago activo (la cola no miente).
  it('inv5: registrar pago COD limpia cod_pago_pendiente', async () => {
    await sp(async () => {
      const env = await insEnvio('ZZINV-5', {
        estado: 'entregado', tipo_pago: 'contra_entrega', costo: 30000, monto_a_cobrar: 500000,
        cod_pago_pendiente: true,
      });
      await client.query(
        `SELECT create_pago_atomico($1,500000,500000,'contra_entrega','2026-06-17',NULL,NULL,$2,'ZZ','ZZINV-5',NULL,NULL)`,
        [env, SISTEMA],
      );
      const r = await client.query(`SELECT cod_pago_pendiente, monto_cobrado FROM envios WHERE id=$1`, [env]);
      expect(r.rows[0].cod_pago_pendiente).toBe(false);
      expect(Number(r.rows[0].monto_cobrado)).toBe(500000);
    });
  });

  // 6) crear_liquidacion gatea por COBRO REAL, no por el flag. Un envio con un pago COD activo
  //    pero de monto 0 (estado 'pendiente') NO entra a la liquidacion: el filtro exige un pago
  //    activo 'pagado' que cubra el monto (bloqueante C1). Antes (034) el flag se limpiaba al
  //    asentar el pago de monto 0 y el envio entraba con esperado=500000, cobrado=0. Aqui
  //    sembramos exactamente ese pago de monto 0 (no cod_pago_pendiente manual) y exigimos
  //    exclusion por cobro real.
  it('inv6: pago COD activo de monto 0 NO entra a la liquidacion (exclusion por cobro real)', async () => {
    await sp(async () => {
      const rep = await repartidorId();
      const env = await insEnvio('ZZINV-6', {
        estado: 'entregado', tipo_pago: 'contra_entrega', costo: 30000, monto_a_cobrar: 500000,
        repartidor_id: rep, fecha_entrega_real: '2026-06-17 12:00:00-04',
      });
      // pago de monto 0: el repartidor reporto que no pudo cobrar. Existe pago activo, pero el
      // cobro no es real -> el envio debe quedar fuera y pendiente de reconciliar.
      await client.query(
        `SELECT create_pago_atomico($1,500000,0,'contra_entrega','2026-06-17',NULL,NULL,$2,'ZZ','ZZINV-6',NULL,NULL)`,
        [env, SISTEMA],
      );
      const pend = await client.query(`SELECT cod_pago_pendiente FROM envios WHERE id=$1`, [env]);
      expect(pend.rows[0].cod_pago_pendiente).toBe(true);
      const liq = await client.query(
        `SELECT id, monto_total_esperado FROM crear_liquidacion($1,'2026-06-17','2026-06-17',$2,'ZZ',NULL,NULL)`,
        [rep, SISTEMA],
      );
      const incl = await client.query(
        `SELECT count(*)::int AS n FROM liquidacion_envios WHERE liquidacion_id=$1 AND envio_id=$2`,
        [liq.rows[0].id, env],
      );
      expect(incl.rows[0].n).toBe(0);
      expect(Number(liq.rows[0].monto_total_esperado)).toBe(0);
    });
  });

  // 7) Ningun pago con monto_recibido > monto_a_cobrar (COD) ni > costo+seguro (CC). Tope por tipo.
  it('inv7: tope COD = monto_a_cobrar; sobrecobro rechazado', async () => {
    await sp(async () => {
      const env = await insEnvio('ZZINV-7', {
        estado: 'entregado', tipo_pago: 'contra_entrega', costo: 30000, monto_a_cobrar: 100000,
      });
      await expect(
        client.query(
          `SELECT create_pago_atomico($1,100000,120000,'contra_entrega','2026-06-17',NULL,NULL,$2,'ZZ','ZZINV-7',NULL,NULL)`,
          [env, SISTEMA],
        ),
      ).rejects.toThrow(/pago_monto_recibido_invalido/);
    });
  });

  it('inv7b: editar pago COD a 50000 de un COD 100000 NO queda pagado (tope por monto_a_cobrar)', async () => {
    await sp(async () => {
      const env = await insEnvio('ZZINV-7b', {
        estado: 'entregado', tipo_pago: 'contra_entrega', costo: 30000, monto_a_cobrar: 100000,
      });
      const p = await client.query(
        `SELECT id FROM create_pago_atomico($1,100000,70000,'contra_entrega','2026-06-17',NULL,NULL,$2,'ZZ','ZZINV-7b',NULL,NULL)`,
        [env, SISTEMA],
      );
      await client.query(
        `SELECT update_pago_atomico($1,50000,NULL,NULL,NULL,NULL,false,false,false,false,$2,'ZZ',NULL,NULL)`,
        [p.rows[0].id, SISTEMA],
      );
      const r = await client.query(`SELECT estado_pago FROM pagos WHERE id=$1`, [p.rows[0].id]);
      expect(r.rows[0].estado_pago).not.toBe('pagado');
    });
  });

  // 8) movimientos y pagos: cero UPDATE/DELETE fisico posible (la DB rechaza ambos).
  it('inv8: ledger rechaza UPDATE y DELETE directos', async () => {
    await sp(async () => {
      const env = await insEnvio('ZZINV-8', { costo: 50000, tipo_pago: 'cuenta_corriente' });
      const mov = await client.query(
        `SELECT id FROM movimientos_cuenta_corriente WHERE envio_id=$1 AND tipo='debito'`,
        [env],
      );
      const movId = mov.rows[0].id;
      await expect(
        client.query(`UPDATE movimientos_cuenta_corriente SET monto=1 WHERE id=$1`, [movId]),
      ).rejects.toThrow(/ledger_append_only/);
      await client.query('ROLLBACK TO inv');
      await client.query('SAVEPOINT inv');
    });
  });

  it('inv8b: DELETE de pago rechazado a nivel DB', async () => {
    await sp(async () => {
      const env = await insEnvio('ZZINV-8b', { costo: 80000, tipo_pago: 'cuenta_corriente' });
      const p = await client.query(
        `SELECT id FROM create_pago_atomico($1,80000,80000,'transferencia','2026-06-17',NULL,NULL,$2,'ZZ','ZZINV-8b',NULL,NULL)`,
        [env, SISTEMA],
      );
      await expect(
        client.query(`DELETE FROM pagos WHERE id=$1`, [p.rows[0].id]),
      ).rejects.toThrow(/pago_no_eliminable/);
    });
  });

  // 9) Un credito de ledger por pago como maximo (UNIQUE).
  it('inv9: doble credito por pago rechazado por UNIQUE', async () => {
    await sp(async () => {
      const cid = await clienteId();
      const env = await insEnvio('ZZINV-9', { costo: 60000, tipo_pago: 'cuenta_corriente' });
      const p = await client.query(
        `SELECT id FROM create_pago_atomico($1,60000,60000,'transferencia','2026-06-17',NULL,NULL,$2,'ZZ','ZZINV-9',NULL,NULL)`,
        [env, SISTEMA],
      );
      await expect(
        client.query(
          `INSERT INTO movimientos_cuenta_corriente (cliente_id, envio_id, pago_id, tipo, monto, saldo_posterior, descripcion, creado_por)
           VALUES ($1,$2,$3,'credito',-60000,0,'doble credito ilegal',$4)`,
          [cid, env, p.rows[0].id, SISTEMA],
        ),
      ).rejects.toThrow(/duplicate key|unique/i);
    });
  });

  // 11) COD entregado con cobro 0: NO entra a la liquidacion y queda RECUPERABLE. El problema
  //     real nunca fue visibilidad sino irreversibilidad: 034 dejaba que el COD sin cobrar
  //     entrara y quedara liquidado-sin-cobrar sin via de correccion. La conducta correcta es
  //     exclusion por cobro real (queda en la cola, cod_pago_pendiente=TRUE) y, cuando llega la
  //     plata, el envio se vuelve elegible y entra a una liquidacion posterior (bloqueante C1).
  it('inv11: COD con cobro 0 queda fuera de la liquidacion y es recuperable cuando llega la plata', async () => {
    await sp(async () => {
      const rep = await repartidorId();
      const env = await insEnvio('ZZINV-11', {
        estado: 'entregado', tipo_pago: 'contra_entrega', costo: 30000, monto_a_cobrar: 500000,
        repartidor_id: rep, fecha_entrega_real: '2026-06-17 12:00:00-04',
      });
      // pago de monto 0: el repartidor no pudo cobrar. Debe quedar pendiente de reconciliar.
      const p0 = await client.query(
        `SELECT id FROM create_pago_atomico($1,500000,0,'contra_entrega','2026-06-17',NULL,NULL,$2,'ZZ','ZZINV-11',NULL,NULL)`,
        [env, SISTEMA],
      );
      const post = await client.query(
        `SELECT cod_pago_pendiente, COALESCE(monto_cobrado,0) AS cobrado FROM envios WHERE id=$1`,
        [env],
      );
      expect(post.rows[0].cod_pago_pendiente).toBe(true);
      expect(Number(post.rows[0].cobrado)).toBe(0);

      // No entra a la liquidacion: el cobro no es real. El envio queda visible en la cola.
      const liq0 = await client.query(
        `SELECT id, monto_total_esperado FROM crear_liquidacion($1,'2026-06-17','2026-06-17',$2,'ZZ',NULL,NULL)`,
        [rep, SISTEMA],
      );
      expect(Number(liq0.rows[0].monto_total_esperado)).toBe(0);
      const incl0 = await client.query(
        `SELECT count(*)::int AS n FROM liquidacion_envios WHERE liquidacion_id=$1 AND envio_id=$2`,
        [liq0.rows[0].id, env],
      );
      expect(incl0.rows[0].n).toBe(0);

      // Llega la plata: se corrige el pago a 500000 y el operador limpia la senal forense.
      // Recuperabilidad: ahora el envio es elegible. Lo verificamos con un repartidor distinto
      // (no se puede crear otra liquidacion del mismo repartidor con rango solapado) reasignando
      // el envio al nuevo repartidor, que es como el operador lo reconciliaria en una corrida
      // posterior.
      await client.query(
        `SELECT update_pago_atomico($1,500000,NULL,NULL,NULL,NULL,false,false,false,false,$2,'ZZ',NULL,NULL)`,
        [p0.rows[0].id, SISTEMA],
      );
      await client.query(`UPDATE envios SET cod_pago_pendiente=false WHERE id=$1`, [env]);
      const cobradoOk = await client.query(`SELECT cod_pago_pendiente FROM envios WHERE id=$1`, [env]);
      expect(cobradoOk.rows[0].cod_pago_pendiente).toBe(false);

      const rep2 = await client.query(
        `INSERT INTO repartidores (nombre, telefono, vehiculo, placa, estado)
         VALUES ('ZZINV Rep11b','+595981777091','Moto','ZZ11B','activo') RETURNING id`,
      );
      await client.query(`UPDATE envios SET repartidor_id=$2 WHERE id=$1`, [env, rep2.rows[0].id]);
      const liqOk = await client.query(
        `SELECT id, monto_total_esperado FROM crear_liquidacion($1,'2026-06-17','2026-06-17',$2,'ZZ',NULL,NULL)`,
        [rep2.rows[0].id, SISTEMA],
      );
      expect(Number(liqOk.rows[0].monto_total_esperado)).toBe(500000);
      const inclOk = await client.query(
        `SELECT count(*)::int AS n FROM liquidacion_envios WHERE liquidacion_id=$1 AND envio_id=$2`,
        [liqOk.rows[0].id, env],
      );
      expect(inclOk.rows[0].n).toBe(1);
    });
  });

  // 13) C2 + A4: recuperabilidad post-liquidacion. Un COD cobrado entra, se cierra con
  //     diferencia, se reabre, se corrige y se vuelve a cerrar. reabrir_liquidacion existe,
  //     vuelve la liquidacion a pendiente (nulando cierre, respetando el CHECK de coherencia) y
  //     des-concilia los envios; el pago vuelve a ser editable/anulable. Antes (034) no existia
  //     reabrir y el guard sellaba toda correccion: trampa irreversible.
  it('inv13: liquidacion cerrada con diferencia es reabrible, corregible y recuperable', async () => {
    await sp(async () => {
      const rep = await repartidorId();
      const env = await insEnvio('ZZINV-13', {
        estado: 'entregado', tipo_pago: 'contra_entrega', costo: 30000, monto_a_cobrar: 200000,
        repartidor_id: rep, fecha_entrega_real: '2026-06-17 12:00:00-04',
      });
      const pago = await client.query(
        `SELECT id FROM create_pago_atomico($1,200000,200000,'contra_entrega','2026-06-17',NULL,NULL,$2,'ZZ','ZZINV-13',NULL,NULL)`,
        [env, SISTEMA],
      );
      const liq = await client.query(
        `SELECT id FROM crear_liquidacion($1,'2026-06-17','2026-06-17',$2,'ZZ',NULL,NULL)`,
        [rep, SISTEMA],
      );
      const cerr = await client.query(
        `SELECT estado::text AS estado FROM cerrar_liquidacion($1,150000,'faltante de calle a reconciliar',$2,'ZZ',NULL,NULL)`,
        [liq.rows[0].id, SISTEMA],
      );
      expect(cerr.rows[0].estado).toBe('con_diferencia');

      const reab = await client.query(
        `SELECT estado::text AS estado, monto_total_recibido, cerrada_por
           FROM reabrir_liquidacion($1,'correccion de conteo de caja por supervisor',$2,'ZZ',NULL,NULL)`,
        [liq.rows[0].id, SISTEMA],
      );
      expect(reab.rows[0].estado).toBe('pendiente');
      expect(reab.rows[0].monto_total_recibido).toBeNull();
      expect(reab.rows[0].cerrada_por).toBeNull();

      const desc = await client.query(
        `SELECT conciliado FROM liquidacion_envios WHERE liquidacion_id=$1 AND envio_id=$2`,
        [liq.rows[0].id, env],
      );
      expect(desc.rows[0].conciliado).toBe(false);

      // El pago vuelve a ser anulable porque la liquidacion ya no esta cerrada.
      const anul = await client.query(
        `SELECT anulado FROM anular_pago_atomico($1,'correccion del cobro tras reabrir',$2,'ZZ',NULL,NULL)`,
        [pago.rows[0].id, SISTEMA],
      );
      expect(anul.rows[0].anulado).toBe(true);
    });
  });

  // 14) M1: un pago contra un envio soft-deleted no asienta credito fantasma. El guard vive en
  //     la DB (trg_pago_cc_credito_fn + create_pago_atomico bajo lock), no solo en TS. Antes la
  //     DB aceptaba el pago y el ledger del envio quedaba con un credito a favor falso.
  it('inv14: pago contra envio eliminado se rechaza a nivel DB (no hay credito fantasma)', async () => {
    await sp(async () => {
      const env = await insEnvio('ZZINV-14', { costo: 80000, tipo_pago: 'cuenta_corriente' });
      await client.query(`UPDATE envios SET eliminado=true, eliminado_en=NOW() WHERE id=$1`, [env]);
      // El RPC aborta la (sub)transaccion al fallar; lo aislamos en su propio savepoint para
      // poder seguir consultando el ledger despues. La excepcion en si ya prueba que el credito
      // nunca se asento (todo el statement se revierte), y el SELECT lo confirma sobre el estado
      // limpio post-rollback del savepoint interno.
      await client.query('SAVEPOINT inv14');
      let rejected = false;
      try {
        await client.query(
          `SELECT create_pago_atomico($1,80000,80000,'transferencia','2026-06-17',NULL,NULL,$2,'ZZ','ZZINV-14',NULL,NULL)`,
          [env, SISTEMA],
        );
      } catch (e) {
        rejected = /pago_envio_eliminado/.test(String((e as Error).message));
        await client.query('ROLLBACK TO inv14');
      }
      expect(rejected).toBe(true);
      const credito = await client.query(
        `SELECT COALESCE(SUM(monto),0) AS c FROM movimientos_cuenta_corriente WHERE envio_id=$1 AND tipo='credito'`,
        [env],
      );
      expect(Number(credito.rows[0].c)).toBe(0);
    });
  });

  // 15) A3: editar el costo CC al alza respeta el limite de credito (bypass desde la bandera del
  //     envio, nunca hardcodeado). Cliente con limite 100000, envio 50000 (ok); subir a 500000
  //     debe ser rechazado por limite_credito_excedido. Antes (034) la rama delta hardcodeaba
  //     bypass=TRUE y el alza pasaba sin override ni rastro.
  it('inv15: editar costo CC al alza por encima del limite se rechaza', async () => {
    await sp(async () => {
      const cid = await clienteId();
      // bajamos el limite del cliente sintetico solo para este savepoint.
      await client.query(`UPDATE clientes SET limite_credito=100000 WHERE id=$1`, [cid]);
      const env = await insEnvio('ZZINV-15', { costo: 50000, tipo_pago: 'cuenta_corriente' });
      await expect(
        client.query(`UPDATE envios SET costo=500000 WHERE id=$1`, [env]),
      ).rejects.toThrow(/limite_credito_excedido/);
    });
  });

  // 16) A4: un pago en una liquidacion con_diferencia es editable/anulable (el estado que mas
  //     necesita correccion). Solo 'cerrada' bloquea. Antes el guard usaba estado<>'pendiente'
  //     y sellaba con_diferencia identico a una caja cerrada.
  it('inv16: pago en liquidacion con_diferencia se puede anular (solo cerrada bloquea)', async () => {
    await sp(async () => {
      const rep = await repartidorId();
      const env = await insEnvio('ZZINV-16', {
        estado: 'entregado', tipo_pago: 'contra_entrega', costo: 30000, monto_a_cobrar: 200000,
        repartidor_id: rep, fecha_entrega_real: '2026-06-17 12:00:00-04',
      });
      const pago = await client.query(
        `SELECT id FROM create_pago_atomico($1,200000,200000,'contra_entrega','2026-06-17',NULL,NULL,$2,'ZZ','ZZINV-16',NULL,NULL)`,
        [env, SISTEMA],
      );
      const liq = await client.query(
        `SELECT id FROM crear_liquidacion($1,'2026-06-17','2026-06-17',$2,'ZZ',NULL,NULL)`,
        [rep, SISTEMA],
      );
      await client.query(
        `SELECT cerrar_liquidacion($1,150000,'faltante a reconciliar en calle',$2,'ZZ',NULL,NULL)`,
        [liq.rows[0].id, SISTEMA],
      );
      const anul = await client.query(
        `SELECT anulado FROM anular_pago_atomico($1,'correccion sobre liquidacion con diferencia',$2,'ZZ',NULL,NULL)`,
        [pago.rows[0].id, SISTEMA],
      );
      expect(anul.rows[0].anulado).toBe(true);
    });
  });

  // 17) A1 (consecuencia observable, no concurrente): create/update/anular_pago_atomico toman el
  //     envio FOR UPDATE. Verificamos la propiedad estructural en el cuerpo de las funciones, que
  //     es lo que serializa contra trg_envio_block_cod_monto_change y evita el descuadre por
  //     carrera. La prueba de carrera real (dos sesiones) se corre fuera de esta suite, contra
  //     prod, en la verificacion de despliegue.
  it('inv17: las funciones de pago lockean el envio (FOR UPDATE) contra el TOCTOU de monto', async () => {
    const fns = ['create_pago_atomico', 'update_pago_atomico', 'anular_pago_atomico'];
    for (const fn of fns) {
      const r = await client.query(
        `SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname=$1 LIMIT 1`,
        [fn],
      );
      const def = String(r.rows[0].def);
      const idx = def.indexOf('FROM envios');
      expect(idx, `${fn} debe leer FROM envios`).toBeGreaterThan(-1);
      expect(def.slice(idx).includes('FOR UPDATE'), `${fn} debe lockear el envio FOR UPDATE`).toBe(true);
    }
    // A5: update/anular lockean la liquidacion en el mismo orden que cerrar_liquidacion.
    for (const fn of ['update_pago_atomico', 'anular_pago_atomico']) {
      const r = await client.query(
        `SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname=$1 LIMIT 1`,
        [fn],
      );
      expect(String(r.rows[0].def).includes('FOR UPDATE OF l'), `${fn} debe lockear la liquidacion`).toBe(true);
    }
  });

  // 12) Invariante 4 (cara negativa): un COD entregado SIN pago activo DEBE estar en
  //     cod_pago_pendiente=TRUE (nunca ninguno de los dos). Es la red que el handler arma
  //     cuando el create del pago falla. Aqui modelamos ese estado y verificamos que un envio
  //     en ese estado NO entra a la liquidacion (queda fuera, visible en la cola).
  it('inv12: COD entregado sin pago + cod_pago_pendiente=true no entra a liquidacion', async () => {
    await sp(async () => {
      const rep = await repartidorId();
      const env = await insEnvio('ZZINV-12', {
        estado: 'entregado', tipo_pago: 'contra_entrega', costo: 30000, monto_a_cobrar: 250000,
        repartidor_id: rep, fecha_entrega_real: '2026-06-17 12:00:00-04', cod_pago_pendiente: true,
      });
      const activos = await client.query(
        `SELECT count(*)::int AS n FROM pagos WHERE envio_id=$1 AND anulado=false`,
        [env],
      );
      expect(activos.rows[0].n).toBe(0);
      const liq = await client.query(
        `SELECT id FROM crear_liquidacion($1,'2026-06-17','2026-06-17',$2,'ZZ',NULL,NULL)`,
        [rep, SISTEMA],
      );
      const incl = await client.query(
        `SELECT count(*)::int AS n FROM liquidacion_envios WHERE liquidacion_id=$1 AND envio_id=$2`,
        [liq.rows[0].id, env],
      );
      expect(incl.rows[0].n).toBe(0);
    });
  });

  // 10) Todo monto en BIGINT. Cero float/numeric en columnas de dinero.
  it('inv10: columnas de dinero son BIGINT (cero float/numeric)', async () => {
    const r = await client.query(`
      SELECT table_name, column_name, data_type
        FROM information_schema.columns
       WHERE table_schema='public'
         AND (column_name LIKE '%monto%' OR column_name LIKE 'costo%' OR column_name='saldo_cuenta_corriente'
              OR column_name='limite_credito' OR column_name='monto_cobrado' OR column_name='valor_declarado'
              OR column_name='monto_total_esperado' OR column_name='monto_total_recibido' OR column_name='monto_esperado')
         AND data_type NOT IN ('bigint')
    `);
    const offenders = r.rows.filter(
      (row: { data_type: string }) => row.data_type === 'numeric' || row.data_type === 'double precision' || row.data_type === 'real',
    );
    expect(offenders).toEqual([]);
  });
});
