import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';

// Suite de invariantes del nucleo financiero COD-only (036-045). Cada invariante bloquea el
// deploy si falla. Corre contra el esquema real via INVARIANT_DATABASE_URL (pooler session
// mode); toda la suite vive dentro de UN BEGIN ... ROLLBACK con datos sinteticos, asi prod
// queda intacto.
//
// El modelo de cuenta corriente fue removido por el nucleo COD-only (036-044): la tabla
// movimientos_cuenta_corriente, registrar_movimiento_cc, verificar_saldo_cc y las columnas
// limite_credito/saldo_cuenta_corriente ya no existen. Los invariantes inv1/inv2/inv3/inv9/
// inv15 que los cubrian murieron con el modelo; el nucleo COD los reemplaza (ver
// docs/STEP6-FINAL-REAUDIT-REPORT.md, "Remocion de cuenta corriente").
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
    // Cliente y repartidor sinteticos reutilizables por todos los savepoints.
    await client.query(`
      INSERT INTO clientes (razon_social, ruc, contacto_nombre, telefono, email, direccion, ciudad, estado)
      VALUES ('ZZINV_CC','77777777-1','Inv','+595981777001','zzinv_cc@descartable.local','x','Asuncion','activo')
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
  // Fecha operativa en Paraguay: a la noche UTC la fecha Asuncion es el dia ANTERIOR a
  // CURRENT_DATE del server. crear_liquidacion gatea el rango por la fecha Asuncion de
  // fecha_entrega_real, asi que todo rango construido en tests usa esta fecha, no CURRENT_DATE.
  async function hoyAsuncion(): Promise<string> {
    const r = await client.query(`SELECT (NOW() AT TIME ZONE 'America/Asuncion')::date::text AS d`);
    return r.rows[0].d as string;
  }
  async function insEnvio(tn: string, cols: Record<string, unknown>): Promise<string> {
    const cid = await clienteId();
    const base: Record<string, unknown> = {
      tracking_number: tn, cliente_id: cid, cliente_nombre: 'ZZINV_CC',
      origen: 'Asuncion', destino: 'Asuncion', destinatario_nombre: 'T',
      destinatario_direccion: 'x', destinatario_telefono: '+595981000000',
      destinatario_ciudad: 'Asuncion', destinatario_departamento: 'Central',
      cantidad: 1, peso: 1, fragil: false, valor_declarado: 0, estado: 'pendiente',
      costo: 0, monto_a_cobrar: 0, tipo_pago: 'contra_entrega',
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

  // 4) Todo COD entregado tiene exactamente un pago activo O cod_pago_pendiente=true.
  //    Verificamos que registrar el pago lo saca de pendiente y deja exactamente un pago activo.
  it('inv4: COD con pago activo no queda pendiente (uno u otro, nunca ambos ni ninguno)', async () => {
    await sp(async () => {
      const rep = await repartidorId();
      const env = await insEnvio('ZZINV-4', {
        estado: 'entregado', tipo_pago: 'contra_entrega', costo: 30000, monto_a_cobrar: 100000,
        repartidor_id: rep,
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
      const rep = await repartidorId();
      const env = await insEnvio('ZZINV-5', {
        estado: 'entregado', tipo_pago: 'contra_entrega', costo: 30000, monto_a_cobrar: 500000,
        repartidor_id: rep,
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

  // 7) Ningun pago con monto_recibido > monto_a_cobrar (COD). Tope I7.
  it('inv7: tope COD = monto_a_cobrar; sobrecobro rechazado', async () => {
    await sp(async () => {
      const rep = await repartidorId();
      const env = await insEnvio('ZZINV-7', {
        estado: 'entregado', tipo_pago: 'contra_entrega', costo: 30000, monto_a_cobrar: 100000,
        repartidor_id: rep,
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
      const rep = await repartidorId();
      const env = await insEnvio('ZZINV-7b', {
        estado: 'entregado', tipo_pago: 'contra_entrega', costo: 30000, monto_a_cobrar: 100000,
        repartidor_id: rep,
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

  // 8) pagos: cero UPDATE/DELETE fisico posible fuera de las RPCs atomicas (I8). El flag
  //    app.pago_rpc es transaccion-local y las RPCs lo resetean apenas terminan su statement.
  it('inv8: UPDATE crudo de pago rechazado a nivel DB', async () => {
    await sp(async () => {
      const rep = await repartidorId();
      const env = await insEnvio('ZZINV-8', {
        estado: 'entregado', tipo_pago: 'contra_entrega', costo: 30000, monto_a_cobrar: 80000,
        repartidor_id: rep,
      });
      const p = await client.query(
        `SELECT id FROM create_pago_atomico($1,80000,80000,'contra_entrega','2026-06-17',NULL,NULL,$2,'ZZ','ZZINV-8',NULL,NULL)`,
        [env, SISTEMA],
      );
      await expect(
        client.query(`UPDATE pagos SET monto_recibido=1 WHERE id=$1`, [p.rows[0].id]),
      ).rejects.toThrow(/pago_no_modificable/);
    });
  });

  it('inv8b: DELETE de pago rechazado a nivel DB', async () => {
    await sp(async () => {
      const rep = await repartidorId();
      const env = await insEnvio('ZZINV-8b', {
        estado: 'entregado', tipo_pago: 'contra_entrega', costo: 30000, monto_a_cobrar: 80000,
        repartidor_id: rep,
      });
      const p = await client.query(
        `SELECT id FROM create_pago_atomico($1,80000,80000,'contra_entrega','2026-06-17',NULL,NULL,$2,'ZZ','ZZINV-8b',NULL,NULL)`,
        [env, SISTEMA],
      );
      await expect(
        client.query(`DELETE FROM pagos WHERE id=$1`, [p.rows[0].id]),
      ).rejects.toThrow(/pago_no_eliminable/);
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

  // 14) Un pago contra un envio soft-deleted se rechaza a nivel DB (create_pago_atomico bajo
  //     lock), no solo en TS. El COD de un envio anulado no tiene asiento posible.
  it('inv14: pago contra envio eliminado se rechaza a nivel DB', async () => {
    await sp(async () => {
      const rep = await repartidorId();
      const env = await insEnvio('ZZINV-14', {
        estado: 'entregado', tipo_pago: 'contra_entrega', costo: 30000, monto_a_cobrar: 80000,
        repartidor_id: rep,
      });
      await client.query(`UPDATE envios SET eliminado=true, eliminado_en=NOW() WHERE id=$1`, [env]);
      // El RPC aborta la (sub)transaccion al fallar; lo aislamos en su propio savepoint para
      // poder seguir consultando despues. La excepcion prueba que el pago nunca se asento.
      await client.query('SAVEPOINT inv14');
      let rejected = false;
      try {
        await client.query(
          `SELECT create_pago_atomico($1,80000,80000,'contra_entrega','2026-06-17',NULL,NULL,$2,'ZZ','ZZINV-14',NULL,NULL)`,
          [env, SISTEMA],
        );
      } catch (e) {
        rejected = /pago_envio_eliminado/.test(String((e as Error).message));
        await client.query('ROLLBACK TO inv14');
      }
      expect(rejected).toBe(true);
      const pagos = await client.query(
        `SELECT count(*)::int AS n FROM pagos WHERE envio_id=$1`,
        [env],
      );
      expect(pagos.rows[0].n).toBe(0);
    });
  });

  // 16) 043 (TOCTOU cerrar-vs-anular): ambos estados sellados (cerrada y con_diferencia)
  //     bloquean editar/anular el pago; la correccion pasa SIEMPRE por reabrir_liquidacion.
  //     Antes con_diferencia quedaba editable y una anulacion post-cierre desincronizaba el
  //     snapshot conciliado del efectivo real.
  it('inv16: pago en liquidacion con_diferencia esta sellado; anular exige reabrir primero', async () => {
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

      // Sellada: anular directo rechazado.
      await client.query('SAVEPOINT inv16');
      let rejected = false;
      try {
        await client.query(
          `SELECT anular_pago_atomico($1,'intento de anular bajo sello con_diferencia',$2,'ZZ',NULL,NULL)`,
          [pago.rows[0].id, SISTEMA],
        );
      } catch (e) {
        rejected = /pago_en_liquidacion_cerrada/.test(String((e as Error).message));
        await client.query('ROLLBACK TO inv16');
      }
      expect(rejected).toBe(true);

      // Via legitima: reabrir des-sella y la anulacion pasa.
      await client.query(
        `SELECT reabrir_liquidacion($1,'correccion de caja para anular el pago',$2,'ZZ',NULL,NULL)`,
        [liq.rows[0].id, SISTEMA],
      );
      const anul = await client.query(
        `SELECT anulado FROM anular_pago_atomico($1,'correccion sobre liquidacion reabierta',$2,'ZZ',NULL,NULL)`,
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
         AND (column_name LIKE '%monto%' OR column_name LIKE 'costo%' OR column_name='monto_cobrado'
              OR column_name='valor_declarado' OR column_name='monto_total_esperado'
              OR column_name='monto_total_recibido' OR column_name='monto_esperado')
         AND data_type NOT IN ('bigint')
    `);
    const offenders = r.rows.filter(
      (row: { data_type: string }) => row.data_type === 'numeric' || row.data_type === 'double precision' || row.data_type === 'real',
    );
    expect(offenders).toEqual([]);
  });

  // A1 (Step6, cerrado por 045): el admin marca 'entregado' via update_envio_estado_atomico y la
  //    RPC DEBE sellar fecha_entrega_real; sin eso el COD cobrado queda fuera de toda liquidacion
  //    para siempre (viola I5). Round-trip completo con los params exactos del path admin
  //    (envio.service.ts updateEstado): entregado -> fecha NOT NULL -> pago COD -> la liquidacion
  //    del dia Asuncion lo incluye con esperado = COD.
  it('invA1: entregado por admin sella fecha_entrega_real y el COD entra a la liquidacion', async () => {
    await sp(async () => {
      const rep = await repartidorId();
      const hoy = await hoyAsuncion();
      const env = await insEnvio('ZZINV-A1', {
        estado: 'en_reparto', tipo_pago: 'contra_entrega', costo: 30000, monto_a_cobrar: 130000,
        repartidor_id: rep,
      });

      // Mismos parametros que envio.service.ts updateEstado (path admin, estado != en_reparto
      // ni problema: repartidor null, apply false, problema null).
      await client.query(
        `SELECT update_envio_estado_atomico($1,'entregado','Entregado al destinatario',NULL,NULL,NULL,false,$2,'Admin GoExpress',$2,NULL,NULL,NULL)`,
        [env, SISTEMA],
      );
      const fer = await client.query(`SELECT fecha_entrega_real FROM envios WHERE id=$1`, [env]);
      expect(fer.rows[0].fecha_entrega_real).not.toBeNull();

      await client.query(
        `SELECT create_pago_atomico($1,130000,130000,'contra_entrega',$2::date,NULL,NULL,$3,'ZZ','ZZINV-A1',NULL,NULL)`,
        [env, hoy, SISTEMA],
      );

      const liq = await client.query(
        `SELECT id, monto_total_esperado FROM crear_liquidacion($1,$2::date,$2::date,$3,'ZZ',NULL,NULL)`,
        [rep, hoy, SISTEMA],
      );
      expect(Number(liq.rows[0].monto_total_esperado)).toBe(130000);
      const incl = await client.query(
        `SELECT count(*)::int AS n FROM liquidacion_envios WHERE liquidacion_id=$1 AND envio_id=$2`,
        [liq.rows[0].id, env],
      );
      expect(incl.rows[0].n).toBe(1);
    });
  });
});

// Invariantes de las migraciones 046-052 (Fase 2, MEDIA del re-audit Step6). Gate dinamico:
// se prueban SOLO donde las migraciones ya estan aplicadas (hoy el Postgres local del stack
// Supabase de test; prod recien despues del QA gate). Contra un schema sin 050/051 cada test
// se marca skipped con nota explicita, asi la misma suite corre contra prod sin falsos rojos.
run('invariantes migraciones 046-052', () => {
  let client: Client;
  let ready = false;

  beforeAll(async () => {
    client = new Client({ connectionString: DB_URL });
    await client.connect();
    await client.query('BEGIN');

    const probe = await client.query(`
      SELECT (to_regclass('public.liquidacion_ajustes') IS NOT NULL)
         AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'envios_i1_monto_cubre_tarifa')
         AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_no_truncate') AS ok
    `);
    ready = Boolean(probe.rows[0].ok);
    if (!ready) return;

    await client.query(`
      INSERT INTO clientes (razon_social, ruc, contacto_nombre, telefono, email, direccion, ciudad, estado)
      VALUES ('ZZMIG_CLI','77777778-1','Mig','+595981778001','zzmig@descartable.local','x','Asuncion','activo')
    `);
    await client.query(`
      INSERT INTO repartidores (nombre, telefono, vehiculo, placa, estado)
      VALUES ('ZZMIG Repartidor','+595981778099','Moto','ZZMIGXX','activo')
    `);
  });

  afterAll(async () => {
    if (client) {
      await client.query('ROLLBACK');
      await client.end();
    }
  });

  async function sp<T>(fn: () => Promise<T>): Promise<T> {
    await client.query('SAVEPOINT mig');
    try {
      const r = await fn();
      await client.query('ROLLBACK TO mig');
      return r;
    } catch (e) {
      await client.query('ROLLBACK TO mig');
      throw e;
    }
  }

  async function ids(): Promise<{ cli: string; rep: string }> {
    const r = await client.query(`
      SELECT (SELECT id FROM clientes WHERE razon_social='ZZMIG_CLI') AS cli,
             (SELECT id FROM repartidores WHERE nombre='ZZMIG Repartidor') AS rep
    `);
    return { cli: r.rows[0].cli as string, rep: r.rows[0].rep as string };
  }
  async function hoyAsuncion(): Promise<string> {
    const r = await client.query(`SELECT (NOW() AT TIME ZONE 'America/Asuncion')::date::text AS d`);
    return r.rows[0].d as string;
  }
  async function insEnvio(tn: string, cols: Record<string, unknown>): Promise<string> {
    const { cli, rep } = await ids();
    const base: Record<string, unknown> = {
      tracking_number: tn, cliente_id: cli, cliente_nombre: 'ZZMIG_CLI',
      origen: 'Asuncion', destino: 'Asuncion', destinatario_nombre: 'T',
      destinatario_direccion: 'x', destinatario_telefono: '+595981000000',
      destinatario_ciudad: 'Asuncion', destinatario_departamento: 'Central',
      cantidad: 1, peso: 1, fragil: false, valor_declarado: 0, estado: 'pendiente',
      costo: 0, monto_a_cobrar: 0, tipo_pago: 'contra_entrega',
      seguro_adicional: false, costo_seguro: 0, tags: '{}', fecha: '2026-06-17',
      repartidor_id: rep,
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
  // Arma una liquidacion CERRADA del dia (Asuncion) con un COD cobrado. Retorna ids.
  async function liqCerrada(tn: string, cod: number, recibido: number, notas: string | null) {
    const { rep } = await ids();
    const hoy = await hoyAsuncion();
    const env = await insEnvio(tn, {
      estado: 'entregado', costo: 30000, monto_a_cobrar: cod,
      fecha_entrega_real: new Date().toISOString(),
    });
    await client.query(
      `SELECT create_pago_atomico($1,$2,$2,'contra_entrega',$3::date,NULL,NULL,$4,'ZZ',$5,NULL,NULL)`,
      [env, cod, hoy, SISTEMA, tn],
    );
    const liq = await client.query(
      `SELECT id FROM crear_liquidacion($1,$2::date,$2::date,$3,'ZZ',NULL,NULL)`,
      [rep, hoy, SISTEMA],
    );
    await client.query(
      `SELECT cerrar_liquidacion($1,$2,$3,$4,'ZZ',NULL,NULL)`,
      [liq.rows[0].id, recibido, notas, SISTEMA],
    );
    return { env, liq: liq.rows[0].id as string };
  }

  // M1 (047): el rol de la app (service_role) perdio UPDATE sobre liquidaciones_repartidor.
  // El unseal crudo con GUC forjada falla por PERMISOS (42501), no por un flag evadible.
  it('m1: unseal crudo como service_role con GUC forjada falla por permisos', async (ctx) => {
    if (!ready) return ctx.skip();
    await sp(async () => {
      const { liq } = await liqCerrada('ZZMIG-M1A', 100000, 100000, null);

      const priv = await client.query(
        `SELECT has_table_privilege('service_role', 'public.liquidaciones_repartidor', 'UPDATE') AS puede`,
      );
      expect(priv.rows[0].puede).toBe(false);

      await client.query(`SET ROLE service_role`);
      await client.query(`SELECT set_config('app.reabrir_rpc', '1', true)`);
      let code: string | null = null;
      await client.query('SAVEPOINT m1');
      try {
        await client.query(
          `UPDATE liquidaciones_repartidor SET estado='pendiente', cerrada_en=NULL, cerrada_por=NULL,
             monto_total_recibido=NULL, tarifa_retenida=NULL, payout_tienda=NULL, notas=NULL WHERE id=$1`,
          [liq],
        );
      } catch (e) {
        code = (e as { code?: string }).code ?? null;
        await client.query('ROLLBACK TO m1');
      }
      await client.query(`RESET ROLE`);
      expect(code).toBe('42501');
    });
  });

  // M1 (047): reabrir_liquidacion legitimo sigue funcionando y el unseal queda con doble traza
  // en auditoria_log (la fila de la RPC con el actor real y la fila del trigger).
  it('m1: reabrir legitimo funciona y deja traza en auditoria_log (RPC + trigger)', async (ctx) => {
    if (!ready) return ctx.skip();
    await sp(async () => {
      const { liq } = await liqCerrada('ZZMIG-M1B', 100000, 100000, null);

      const before = await client.query(
        `SELECT count(*)::int AS n FROM auditoria_log WHERE entidad='liquidacion' AND entidad_id=$1 AND accion='reabrir'`,
        [liq],
      );
      await client.query(
        `SELECT reabrir_liquidacion($1,'verificacion m1 de la migracion 047',$2,'ZZ',NULL,NULL)`,
        [liq, SISTEMA],
      );
      const after = await client.query(
        `SELECT count(*)::int AS n,
                count(*) FILTER (WHERE usuario = 'trigger:liquidacion_unseal')::int AS trig
           FROM auditoria_log WHERE entidad='liquidacion' AND entidad_id=$1 AND accion='reabrir'`,
        [liq],
      );
      expect(after.rows[0].n - before.rows[0].n).toBe(2);
      expect(after.rows[0].trig).toBe(1);

      const estado = await client.query(`SELECT estado::text AS e, cerrada_en FROM liquidaciones_repartidor WHERE id=$1`, [liq]);
      expect(estado.rows[0].e).toBe('pendiente');
      expect(estado.rows[0].cerrada_en).toBeNull();
    });
  });

  // M4 (049): TRUNCATE rechazado incondicionalmente en las tablas del ledger. envios y
  // liquidaciones_repartidor van con CASCADE: sin el, Postgres corta antes por las FKs que las
  // referencian y el trigger ni llega a probarse.
  it('m4: TRUNCATE de las tablas del ledger rechazado por el guard', async (ctx) => {
    if (!ready) return ctx.skip();
    const casos = [
      'TRUNCATE liquidacion_envios',
      'TRUNCATE pagos',
      'TRUNCATE envios CASCADE',
      'TRUNCATE liquidaciones_repartidor CASCADE',
    ];
    for (const stmt of casos) {
      await client.query('SAVEPOINT m4');
      let rejected = false;
      try {
        await client.query(stmt);
      } catch (e) {
        rejected = /truncate_prohibido/.test(String((e as Error).message));
      }
      await client.query('ROLLBACK TO m4');
      expect(rejected, `${stmt} debe rechazarse por el guard`).toBe(true);
    }
  });

  // M2 (051): cerrar con faltante genera asiento cobranza_repartidor y la conservacion total
  // cierra: tarifa + payout = recibido + cobranza (la cobranza al repartidor financia el gap).
  it('m2: faltante genera cobranza_repartidor y la conservacion total cierra', async (ctx) => {
    if (!ready) return ctx.skip();
    await sp(async () => {
      const { liq } = await liqCerrada('ZZMIG-M2A', 130000, 100000, 'faltante de caja, deuda del repartidor');

      const r = await client.query(
        `SELECT l.tarifa_retenida, l.payout_tienda, l.monto_total_recibido, l.monto_total_esperado,
                a.tipo::text AS tipo, a.monto AS ajuste
           FROM liquidaciones_repartidor l
           JOIN liquidacion_ajustes a ON a.liquidacion_id = l.id AND a.eliminado = FALSE
          WHERE l.id = $1`,
        [liq],
      );
      expect(r.rows).toHaveLength(1);
      const row = r.rows[0];
      expect(row.tipo).toBe('cobranza_repartidor');
      expect(Number(row.ajuste)).toBe(30000);
      expect(Number(row.tarifa_retenida)).toBe(30000);
      expect(Number(row.payout_tienda)).toBe(100000);
      // Conservacion: tarifa + payout = recibido + cobranza (30000 + 100000 = 100000 + 30000).
      expect(Number(row.tarifa_retenida) + Number(row.payout_tienda))
        .toBe(Number(row.monto_total_recibido) + Number(row.ajuste));
    });
  });

  it('m2: sobrante genera sobrante_a_investigar y tarifa + payout + sobrante = recibido', async (ctx) => {
    if (!ready) return ctx.skip();
    await sp(async () => {
      const { liq } = await liqCerrada('ZZMIG-M2B', 130000, 150000, 'sobrante de caja a investigar');

      const r = await client.query(
        `SELECT l.tarifa_retenida, l.payout_tienda, l.monto_total_recibido,
                a.tipo::text AS tipo, a.monto AS ajuste
           FROM liquidaciones_repartidor l
           JOIN liquidacion_ajustes a ON a.liquidacion_id = l.id AND a.eliminado = FALSE
          WHERE l.id = $1`,
        [liq],
      );
      expect(r.rows).toHaveLength(1);
      const row = r.rows[0];
      expect(row.tipo).toBe('sobrante_a_investigar');
      expect(Number(row.ajuste)).toBe(20000);
      expect(Number(row.tarifa_retenida) + Number(row.payout_tienda) + Number(row.ajuste))
        .toBe(Number(row.monto_total_recibido));
    });
  });

  it('m2: reabrir anula (soft-delete) el asiento del cierre anterior', async (ctx) => {
    if (!ready) return ctx.skip();
    await sp(async () => {
      const { liq } = await liqCerrada('ZZMIG-M2C', 130000, 100000, 'faltante que se corrige tras recontar');

      await client.query(
        `SELECT reabrir_liquidacion($1,'recuento de caja encontro el efectivo faltante',$2,'ZZ',NULL,NULL)`,
        [liq, SISTEMA],
      );
      const r = await client.query(
        `SELECT count(*) FILTER (WHERE eliminado = FALSE)::int AS activos,
                count(*) FILTER (WHERE eliminado = TRUE)::int AS anulados
           FROM liquidacion_ajustes WHERE liquidacion_id = $1`,
        [liq],
      );
      expect(r.rows[0].activos).toBe(0);
      expect(r.rows[0].anulados).toBe(1);

      // Re-cierre exacto: sin diferencia, sin asiento nuevo.
      await client.query(`SELECT cerrar_liquidacion($1,130000,NULL,$2,'ZZ',NULL,NULL)`, [liq, SISTEMA]);
      const r2 = await client.query(
        `SELECT count(*) FILTER (WHERE eliminado = FALSE)::int AS activos FROM liquidacion_ajustes WHERE liquidacion_id = $1`,
        [liq],
      );
      expect(r2.rows[0].activos).toBe(0);
    });
  });

  // M5 (050): el CHECK declarativo rechaza filas que violan I1 aun sin el trigger by-column
  // (que en INSERT dispara primero; para aislar el CHECK se deshabilita el trigger dentro de la
  // transaccion, que se rollbackea entera). eliminado=TRUE queda exento por diseno: la
  // remediacion de historico irreconciliable es anular.
  it('m5: CHECK envios_i1_monto_cubre_tarifa rechaza el INSERT violatorio; eliminado exento', async (ctx) => {
    if (!ready) return ctx.skip();
    await sp(async () => {
      await client.query(`ALTER TABLE envios DISABLE TRIGGER trg_envio_i1_cubre_tarifa`);

      await client.query('SAVEPOINT m5');
      let code: string | null = null;
      try {
        await insEnvio('ZZMIG-M5A', { estado: 'entregado', costo: 24000, monto_a_cobrar: 0 });
      } catch (e) {
        code = (e as { code?: string }).code ?? null;
        await client.query('ROLLBACK TO m5');
      }
      expect(code).toBe('23514');

      // La misma fila anulada pasa: el exempt permite soft-deletear historico violatorio.
      const env = await insEnvio('ZZMIG-M5B', {
        estado: 'entregado', costo: 24000, monto_a_cobrar: 0, eliminado: true,
      });
      expect(env).toBeTruthy();
    });
  });

  // 046: una fila pre-045 (entregada con fecha_entrega_real NULL) queda liquidable despues del
  // backfill, que toma el primer evento 'entregado' del timeline y es idempotente en re-run.
  // El INSERT de la fila mala es posible porque el CHECK 050 no cubre la fecha (solo montos).
  it('m5/046: fila entregada con fecha NULL queda liquidable post-backfill; re-run idempotente', async (ctx) => {
    if (!ready) return ctx.skip();
    await sp(async () => {
      const { rep } = await ids();
      const hoy = await hoyAsuncion();
      const env = await insEnvio('ZZMIG-046', {
        estado: 'entregado', costo: 30000, monto_a_cobrar: 130000, fecha_entrega_real: null,
      });
      await client.query(
        `INSERT INTO eventos_envio (envio_id, estado, descripcion, registrado_por_nombre)
         VALUES ($1, 'entregado', 'Entregado (repro backfill 046)', 'ZZ')`,
        [env],
      );
      await client.query(
        `SELECT create_pago_atomico($1,130000,130000,'contra_entrega',$2::date,NULL,NULL,$3,'ZZ','ZZMIG-046',NULL,NULL)`,
        [env, hoy, SISTEMA],
      );

      const sql046 = readFileSync(new URL('../../sql/046_backfill_fecha_entrega_real.sql', import.meta.url), 'utf8')
        .replace(/^BEGIN;$/m, '')
        .replace(/^COMMIT;$/m, '');
      await client.query(sql046);

      const post = await client.query(
        `SELECT e.fecha_entrega_real, ev.created_at AS evento
           FROM envios e
           JOIN eventos_envio ev ON ev.envio_id = e.id AND ev.estado = 'entregado'
          WHERE e.id = $1`,
        [env],
      );
      expect(post.rows[0].fecha_entrega_real).not.toBeNull();
      expect(new Date(post.rows[0].fecha_entrega_real).getTime())
        .toBe(new Date(post.rows[0].evento).getTime());

      // Re-run: idempotente, cero filas pendientes y la fecha no se mueve.
      await client.query(sql046);
      const rerun = await client.query(
        `SELECT (SELECT count(*)::int FROM envios WHERE estado='entregado' AND fecha_entrega_real IS NULL AND eliminado=FALSE) AS pendientes,
                (SELECT fecha_entrega_real FROM envios WHERE id=$1) AS fecha`,
        [env],
      );
      expect(rerun.rows[0].pendientes).toBe(0);
      expect(new Date(rerun.rows[0].fecha).getTime())
        .toBe(new Date(post.rows[0].fecha_entrega_real).getTime());

      // Liquidable: el COD cobrado entra a la liquidacion del dia Asuncion.
      const liq = await client.query(
        `SELECT id, monto_total_esperado FROM crear_liquidacion($1,$2::date,$2::date,$3,'ZZ',NULL,NULL)`,
        [rep, hoy, SISTEMA],
      );
      expect(Number(liq.rows[0].monto_total_esperado)).toBe(130000);
    });
  });

  // 048: propiedad estructural del reorden de locks. cerrar_liquidacion materializa y lockea los
  // envios (tmp_elegibles ... FOR UPDATE OF e) ANTES del lock del header (FOR UPDATE del id).
  it('m3: cerrar_liquidacion lockea E antes que L (orden canonico de las RPCs de pago)', async (ctx) => {
    if (!ready) return ctx.skip();
    const r = await client.query(
      `SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname='cerrar_liquidacion' LIMIT 1`,
    );
    const def = String(r.rows[0].def);
    const lockEnvios = def.indexOf('FOR UPDATE OF e');
    const lockHeader = def.indexOf('FOR UPDATE', lockEnvios + 'FOR UPDATE OF e'.length);
    expect(lockEnvios).toBeGreaterThan(-1);
    expect(lockHeader, 'el lock del header debe venir despues del lock de envios').toBeGreaterThan(lockEnvios);
    expect(def.includes('liquidacion_snapshot_stale')).toBe(true);
  });

  // 052: el enum tipo_movimiento_cc no existe mas; el CHECK que neutraliza el label
  // cuenta_corriente de tipo_pago sigue vivo.
  it('m52: tipo_movimiento_cc dropeado y envios_tipo_pago_no_cc intacto', async (ctx) => {
    if (!ready) return ctx.skip();
    const r = await client.query(`
      SELECT to_regtype('public.tipo_movimiento_cc') IS NULL AS dropped,
             EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'envios_tipo_pago_no_cc') AS check_vivo
    `);
    expect(r.rows[0].dropped).toBe(true);
    expect(r.rows[0].check_vivo).toBe(true);
  });
});
