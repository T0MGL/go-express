import { createClient } from '@supabase/supabase-js';
import { request, adminHeaders } from '../setup/test-client.js';
import { seedTestData, cleanupTestData, makeEnvioPayload, type TestData } from '../setup/seed.js';

const supabase = createClient(
  process.env['SUPABASE_URL']!,
  process.env['SUPABASE_SERVICE_ROLE_KEY']!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

let testData: TestData;
let envioId: string;
let montoDelEnvio: number;
let createdPagoId: string;

// Dos reglas de la base gobiernan todo cobro y ninguna se puede saltear desde el test:
// A4 (044) exige repartidor asignado, si no el cobro no es liquidable; y create_pago_atomico
// deriva monto_total del envio y rechaza cualquier otro. Asi que cada envio de esta suite
// nace cobrable y el monto sale del envio, nunca de una constante escrita a mano.
async function crearEnvioCobrable(
  overrides: Record<string, unknown> = {}
): Promise<{ envioId: string; montoTotal: number }> {
  const envioRes = await request
    .post('/api/admin/envios')
    .set(adminHeaders())
    .send(makeEnvioPayload(testData.clienteId, overrides));
  if (envioRes.status !== 201) {
    throw new Error(`No se pudo crear el envio: ${envioRes.status} ${JSON.stringify(envioRes.body)}`);
  }

  const asignarRes = await request
    .patch(`/api/admin/envios/${envioRes.body.id}/repartidor`)
    .set(adminHeaders())
    .send({ repartidorId: testData.repartidorId });
  if (asignarRes.status !== 200) {
    throw new Error(`No se pudo asignar repartidor: ${asignarRes.status} ${JSON.stringify(asignarRes.body)}`);
  }

  return { envioId: envioRes.body.id as string, montoTotal: envioRes.body.montoACobrar as number };
}

beforeAll(async () => {
  testData = await seedTestData();

  const envio = await crearEnvioCobrable();
  envioId = envio.envioId;
  montoDelEnvio = envio.montoTotal;
});

afterAll(async () => {
  await cleanupTestData(testData);
});

describe('POST /api/admin/pagos', () => {
  it('creates a payment for an envio and returns 201', async () => {
    const res = await request
      .post('/api/admin/pagos')
      .set(adminHeaders())
      .send({
        envioId,
        montoTotal: montoDelEnvio,
        montoRecibido: montoDelEnvio,
        metodoPago: 'efectivo',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('envioId', envioId);
    expect(res.body).toHaveProperty('montoTotal', montoDelEnvio);
    expect(res.body).toHaveProperty('montoRecibido', montoDelEnvio);
    expect(res.body).toHaveProperty('estadoPago', 'pagado');
    expect(res.body).toHaveProperty('metodoPago', 'efectivo');

    createdPagoId = res.body.id;
  });

  it('rejects duplicate pago for the same envio with 409', async () => {
    const res = await request
      .post('/api/admin/pagos')
      .set(adminHeaders())
      .send({
        envioId,
        montoTotal: montoDelEnvio,
        montoRecibido: montoDelEnvio,
        metodoPago: 'transferencia',
      });

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('code', 'CONFLICT');
  });

  it('calculates estadoPago as pago_parcial when montoRecibido < montoTotal', async () => {
    const { envioId: newEnvioId, montoTotal } = await crearEnvioCobrable();

    const res = await request
      .post('/api/admin/pagos')
      .set(adminHeaders())
      .send({
        envioId: newEnvioId,
        montoTotal,
        montoRecibido: Math.floor(montoTotal / 2),
        metodoPago: 'efectivo',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('estadoPago', 'pago_parcial');
  });

  it('calculates estadoPago as pendiente when montoRecibido is 0', async () => {
    const { envioId: newEnvioId, montoTotal } = await crearEnvioCobrable();

    const res = await request
      .post('/api/admin/pagos')
      .set(adminHeaders())
      .send({
        envioId: newEnvioId,
        montoTotal,
        montoRecibido: 0,
        metodoPago: 'contra_entrega',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('estadoPago', 'pendiente');
  });

  it('rejects nonexistent envioId with 404', async () => {
    const res = await request
      .post('/api/admin/pagos')
      .set(adminHeaders())
      .send({
        envioId: '00000000-0000-4000-a000-000000000099',
        montoTotal: 10000,
        montoRecibido: 0,
        metodoPago: 'efectivo',
      });

    expect(res.status).toBe(404);
  });

  it('rejects missing required fields with 400', async () => {
    const res = await request
      .post('/api/admin/pagos')
      .set(adminHeaders())
      .send({ envioId });

    expect(res.status).toBe(400);
  });

  it('rejects invalid metodoPago with 400', async () => {
    const res = await request
      .post('/api/admin/pagos')
      .set(adminHeaders())
      .send({
        envioId,
        montoTotal: 10000,
        montoRecibido: 0,
        metodoPago: 'bitcoin',
      });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/admin/pagos', () => {
  it('returns 200 with paginated list', async () => {
    const res = await request
      .get('/api/admin/pagos')
      .set(adminHeaders());

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('pagination');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('filters by estadoPago', async () => {
    const res = await request
      .get('/api/admin/pagos')
      .query({ estadoPago: 'pagado' })
      .set(adminHeaders());

    expect(res.status).toBe(200);
    for (const p of res.body.data) {
      expect(p.estadoPago).toBe('pagado');
    }
  });

  it('filters by metodoPago', async () => {
    const res = await request
      .get('/api/admin/pagos')
      .query({ metodoPago: 'efectivo' })
      .set(adminHeaders());

    expect(res.status).toBe(200);
    for (const p of res.body.data) {
      expect(p.metodoPago).toBe('efectivo');
    }
  });

  it('returns 401 without auth', async () => {
    const res = await request.get('/api/admin/pagos');

    expect(res.status).toBe(401);
  });
});

describe('GET /api/admin/pagos/stats', () => {
  it('returns 200 with payment statistics', async () => {
    const res = await request
      .get('/api/admin/pagos/stats')
      .set(adminHeaders());

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalCobrado');
    expect(res.body).toHaveProperty('totalPendiente');
    expect(res.body).toHaveProperty('cobradoHoy');
    expect(res.body).toHaveProperty('enviosPendientesCobro');
    expect(typeof res.body.totalCobrado).toBe('number');
    expect(typeof res.body.totalPendiente).toBe('number');
  });
});

describe('PATCH /api/admin/pagos/:id', () => {
  it('updates pago montoRecibido and recalculates estadoPago', async () => {
    const { envioId: tmpEnvioId, montoTotal } = await crearEnvioCobrable();

    const createRes = await request
      .post('/api/admin/pagos')
      .set(adminHeaders())
      .send({
        envioId: tmpEnvioId,
        montoTotal,
        montoRecibido: 0,
        metodoPago: 'contra_entrega',
      });
    const pagoId = createRes.body.id;

    const res = await request
      .patch(`/api/admin/pagos/${pagoId}`)
      .set(adminHeaders())
      .send({ montoRecibido: montoTotal });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('estadoPago', 'pagado');
    expect(res.body).toHaveProperty('montoRecibido', montoTotal);
  });

  it('returns 404 for nonexistent pago', async () => {
    const res = await request
      .patch('/api/admin/pagos/00000000-0000-4000-a000-000000000099')
      .set(adminHeaders())
      .send({ montoRecibido: 1000 });

    expect(res.status).toBe(404);
  });

  it('rejects montoRecibido exceeding montoTotal', async () => {
    const res = await request
      .patch(`/api/admin/pagos/${createdPagoId}`)
      .set(adminHeaders())
      .send({ montoRecibido: 999999999 });

    expect(res.status).toBe(400);
  });
});

describe('Auditoria de pagos persiste ip_address y user_agent', () => {
  it('create persists ip_address and user_agent in audit log', async () => {
    const { envioId: tmpEnvioId, montoTotal } = await crearEnvioCobrable();

    const createRes = await request
      .post('/api/admin/pagos')
      .set(adminHeaders())
      .set('X-Forwarded-For', '203.0.113.77')
      .set('User-Agent', 'pagos-audit-create-test/1.0')
      .send({
        envioId: tmpEnvioId,
        montoTotal,
        montoRecibido: montoTotal,
        metodoPago: 'efectivo',
      });

    expect(createRes.status).toBe(201);
    const pagoId = createRes.body.id as string;

    const { data: audit } = await supabase
      .from('auditoria_log')
      .select('ip_address, user_agent, accion, entidad, entidad_id')
      .eq('entidad', 'pago')
      .eq('entidad_id', pagoId)
      .eq('accion', 'pago')
      .single();

    expect(audit).not.toBeNull();
    const row = audit as { ip_address: string | null; user_agent: string | null };
    expect(row.ip_address).toBe('203.0.113.77');
    expect(row.user_agent).toBe('pagos-audit-create-test/1.0');
  });

  it('update persists ip_address and user_agent in audit log', async () => {
    const { envioId: tmpEnvioId, montoTotal } = await crearEnvioCobrable();

    const createRes = await request
      .post('/api/admin/pagos')
      .set(adminHeaders())
      .send({
        envioId: tmpEnvioId,
        montoTotal,
        montoRecibido: 0,
        metodoPago: 'contra_entrega',
      });
    const pagoId = createRes.body.id as string;

    const patchRes = await request
      .patch(`/api/admin/pagos/${pagoId}`)
      .set(adminHeaders())
      .set('X-Forwarded-For', '198.51.100.42')
      .set('User-Agent', 'pagos-audit-update-test/1.0')
      .send({ montoRecibido: montoTotal });

    expect(patchRes.status).toBe(200);

    const { data: audit } = await supabase
      .from('auditoria_log')
      .select('ip_address, user_agent, accion, entidad, entidad_id')
      .eq('entidad', 'pago')
      .eq('entidad_id', pagoId)
      .eq('accion', 'editar')
      .single();

    expect(audit).not.toBeNull();
    const row = audit as { ip_address: string | null; user_agent: string | null };
    expect(row.ip_address).toBe('198.51.100.42');
    expect(row.user_agent).toBe('pagos-audit-update-test/1.0');
  });
});

// El RPC create_pago_atomico y update_pago_atomico envuelven INSERT pago/auditoria en
// una sola transaccion plpgsql. Si cualquier paso falla, Postgres rollbackea todo. El
// hallazgo 1.2 del hard debug era que antes de estos RPCs la auditoria se escribia
// fuera de la transaccion del pago, dejando pagos huerfanos cuando la auditoria fallaba.
//
// Para forzar un fallo selectivo en el INSERT del audit sin modificar la tabla
// compartida, usamos el hecho de que auditoria_log.usuario_id tiene FK a usuarios(id).
// Si pasamos un UUID que no existe en usuarios como p_actualizado_por, el UPDATE de
// pagos se ejecuta pero el INSERT en audit falla con violacion de FK. El rollback
// garantiza que el UPDATE tambien se revierta.
describe('Atomicidad transaccional del RPC update_pago_atomico', () => {
  it('rolls back pago update when audit insert violates FK on usuario_id', async () => {
    const { envioId: tmpEnvioId, montoTotal } = await crearEnvioCobrable();

    const createRes = await request
      .post('/api/admin/pagos')
      .set(adminHeaders())
      .send({
        envioId: tmpEnvioId,
        montoTotal,
        montoRecibido: 0,
        metodoPago: 'contra_entrega',
      });
    expect(createRes.status).toBe(201);
    const pagoId = createRes.body.id as string;

    const orphanUserId = '00000000-0000-4000-b000-0000000000ff';

    const { error } = await supabase.rpc('update_pago_atomico', {
      p_pago_id: pagoId,
      p_monto_recibido: montoTotal,
      p_metodo_pago: null,
      p_fecha_pago: null,
      p_referencia: null,
      p_notas: null,
      p_apply_metodo: false,
      p_apply_fecha: false,
      p_apply_referencia: false,
      p_apply_notas: false,
      p_actualizado_por: orphanUserId,
      p_usuario_nombre: 'Orphan User',
      p_ip: null,
      p_user_agent: 'pagos-rpc-rollback-test/1.0',
    });

    expect(error).not.toBeNull();

    const { data: pago } = await supabase
      .from('pagos')
      .select('id, monto_recibido, estado_pago')
      .eq('id', pagoId)
      .single();

    expect(pago).not.toBeNull();
    const row = pago as { monto_recibido: number; estado_pago: string };
    expect(row.monto_recibido).toBe(0);
    expect(row.estado_pago).toBe('pendiente');

    const { data: audits } = await supabase
      .from('auditoria_log')
      .select('id')
      .eq('entidad', 'pago')
      .eq('entidad_id', pagoId)
      .eq('accion', 'editar');

    expect(audits ?? []).toHaveLength(0);
  });
});

describe('update_pago_atomico: errores mapeados', () => {
  it('returns 404 with code NOT_FOUND when pago id does not exist', async () => {
    const res = await request
      .patch('/api/admin/pagos/00000000-0000-4000-a000-0000000000aa')
      .set(adminHeaders())
      .send({ montoRecibido: 1000 });

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('code', 'NOT_FOUND');
  });
});

describe('POST /api/admin/pagos/:id/anular', () => {
  async function crearEnvioYPago(
    overrides: Record<string, unknown> = {},
    pagoOverrides: Record<string, unknown> = {},
  ): Promise<{ envioId: string; pagoId: string; montoTotal: number }> {
    const { envioId: newEnvioId, montoTotal } = await crearEnvioCobrable(overrides);

    const pagoRes = await request
      .post('/api/admin/pagos')
      .set(adminHeaders())
      .send({
        envioId: newEnvioId,
        montoTotal,
        montoRecibido: montoTotal,
        metodoPago: 'efectivo',
        ...pagoOverrides,
      });
    return { envioId: newEnvioId, pagoId: pagoRes.body.id as string, montoTotal };
  }

  it('marks pago as anulado and writes audit entry with accion=anular', async () => {
    const { pagoId } = await crearEnvioYPago();

    const res = await request
      .post(`/api/admin/pagos/${pagoId}/anular`)
      .set(adminHeaders())
      .set('X-Forwarded-For', '203.0.113.99')
      .set('User-Agent', 'pago-anular-test/1.0')
      .send({ motivo: 'Cobrador registro el pago en el envio equivocado' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', pagoId);
    expect(res.body).toHaveProperty('anulado', true);
    expect(res.body).toHaveProperty('motivoAnulacion', 'Cobrador registro el pago en el envio equivocado');
    expect(res.body.anuladoEn).toBeTruthy();
    expect(res.body.anuladoPor).toBeTruthy();

    const { data: audit } = await supabase
      .from('auditoria_log')
      .select('accion, entidad, entidad_id, ip_address, user_agent, descripcion')
      .eq('entidad', 'pago')
      .eq('entidad_id', pagoId)
      .eq('accion', 'anular')
      .single();

    expect(audit).not.toBeNull();
    const row = audit as { ip_address: string | null; user_agent: string | null; descripcion: string };
    expect(row.ip_address).toBe('203.0.113.99');
    expect(row.user_agent).toBe('pago-anular-test/1.0');
    expect(row.descripcion).toContain(pagoId);
  });

  it('rejects motivo shorter than 10 chars with 400 from Zod', async () => {
    const { pagoId } = await crearEnvioYPago();

    const res = await request
      .post(`/api/admin/pagos/${pagoId}/anular`)
      .set(adminHeaders())
      .send({ motivo: 'corto' });

    expect(res.status).toBe(400);
  });

  it('returns 409 when pago is already anulado', async () => {
    const { pagoId } = await crearEnvioYPago();

    const firstRes = await request
      .post(`/api/admin/pagos/${pagoId}/anular`)
      .set(adminHeaders())
      .send({ motivo: 'Primera anulacion por error de cobrador' });
    expect(firstRes.status).toBe(200);

    const secondRes = await request
      .post(`/api/admin/pagos/${pagoId}/anular`)
      .set(adminHeaders())
      .send({ motivo: 'Intento duplicado de anulacion por bug de UI' });

    expect(secondRes.status).toBe(409);
    expect(secondRes.body).toHaveProperty('code', 'CONFLICT');
  });

  it('returns 404 for non-existent pago', async () => {
    const res = await request
      .post('/api/admin/pagos/00000000-0000-4000-a000-000000000abc/anular')
      .set(adminHeaders())
      .send({ motivo: 'Motivo valido de prueba para 404' });

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('code', 'NOT_FOUND');
  });

  it('permite registrar un nuevo pago sobre el mismo envio despues de anular el previo', async () => {
    const { envioId: reusedEnvioId, pagoId, montoTotal } = await crearEnvioYPago();

    const anularRes = await request
      .post(`/api/admin/pagos/${pagoId}/anular`)
      .set(adminHeaders())
      .send({ motivo: 'Liberar envio para recobrar con metodo correcto' });
    expect(anularRes.status).toBe(200);

    const retryRes = await request
      .post('/api/admin/pagos')
      .set(adminHeaders())
      .send({
        envioId: reusedEnvioId,
        montoTotal,
        montoRecibido: montoTotal,
        metodoPago: 'transferencia',
      });

    expect(retryRes.status).toBe(201);
    expect(retryRes.body).toHaveProperty('id');
    expect(retryRes.body.id).not.toBe(pagoId);
    expect(retryRes.body).toHaveProperty('metodoPago', 'transferencia');
  });

  it('GET /pagos no incluye pagos anulados por default', async () => {
    const { pagoId } = await crearEnvioYPago();
    await request
      .post(`/api/admin/pagos/${pagoId}/anular`)
      .set(adminHeaders())
      .send({ motivo: 'Excluir del listado por default' });

    const listRes = await request
      .get('/api/admin/pagos')
      .query({ limit: 100 })
      .set(adminHeaders());

    expect(listRes.status).toBe(200);
    const ids = (listRes.body.data as Array<{ id: string }>).map((p) => p.id);
    expect(ids).not.toContain(pagoId);
  });

  it('GET /pagos?incluirAnulados=true incluye pagos anulados', async () => {
    const { pagoId } = await crearEnvioYPago();
    await request
      .post(`/api/admin/pagos/${pagoId}/anular`)
      .set(adminHeaders())
      .send({ motivo: 'Verificar toggle de anulados' });

    const listRes = await request
      .get('/api/admin/pagos')
      .query({ limit: 100, incluirAnulados: 'true' })
      .set(adminHeaders());

    expect(listRes.status).toBe(200);
    const ids = (listRes.body.data as Array<{ id: string }>).map((p) => p.id);
    expect(ids).toContain(pagoId);
  });
});
