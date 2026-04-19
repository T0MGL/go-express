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
let createdPagoId: string;

beforeAll(async () => {
  testData = await seedTestData();

  const payload = makeEnvioPayload(testData.clienteId);
  const envioRes = await request
    .post('/api/admin/envios')
    .set(adminHeaders())
    .send(payload);
  envioId = envioRes.body.id;
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
        montoTotal: 45000,
        montoRecibido: 45000,
        metodoPago: 'efectivo',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('envioId', envioId);
    expect(res.body).toHaveProperty('montoTotal', 45000);
    expect(res.body).toHaveProperty('montoRecibido', 45000);
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
        montoTotal: 45000,
        montoRecibido: 45000,
        metodoPago: 'transferencia',
      });

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('code', 'CONFLICT');
  });

  it('calculates estadoPago as pago_parcial when montoRecibido < montoTotal', async () => {
    const payload = makeEnvioPayload(testData.clienteId);
    const envioRes = await request
      .post('/api/admin/envios')
      .set(adminHeaders())
      .send(payload);
    const newEnvioId = envioRes.body.id;

    const res = await request
      .post('/api/admin/pagos')
      .set(adminHeaders())
      .send({
        envioId: newEnvioId,
        montoTotal: 50000,
        montoRecibido: 25000,
        metodoPago: 'efectivo',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('estadoPago', 'pago_parcial');
  });

  it('calculates estadoPago as pendiente when montoRecibido is 0', async () => {
    const payload = makeEnvioPayload(testData.clienteId);
    const envioRes = await request
      .post('/api/admin/envios')
      .set(adminHeaders())
      .send(payload);
    const newEnvioId = envioRes.body.id;

    const res = await request
      .post('/api/admin/pagos')
      .set(adminHeaders())
      .send({
        envioId: newEnvioId,
        montoTotal: 30000,
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
    const payload = makeEnvioPayload(testData.clienteId);
    const envioRes = await request
      .post('/api/admin/envios')
      .set(adminHeaders())
      .send(payload);
    const tmpEnvioId = envioRes.body.id;

    const createRes = await request
      .post('/api/admin/pagos')
      .set(adminHeaders())
      .send({
        envioId: tmpEnvioId,
        montoTotal: 40000,
        montoRecibido: 0,
        metodoPago: 'contra_entrega',
      });
    const pagoId = createRes.body.id;

    const res = await request
      .patch(`/api/admin/pagos/${pagoId}`)
      .set(adminHeaders())
      .send({ montoRecibido: 40000 });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('estadoPago', 'pagado');
    expect(res.body).toHaveProperty('montoRecibido', 40000);
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
    const payload = makeEnvioPayload(testData.clienteId);
    const envioRes = await request
      .post('/api/admin/envios')
      .set(adminHeaders())
      .send(payload);
    const tmpEnvioId = envioRes.body.id;

    const createRes = await request
      .post('/api/admin/pagos')
      .set(adminHeaders())
      .set('X-Forwarded-For', '203.0.113.77')
      .set('User-Agent', 'pagos-audit-create-test/1.0')
      .send({
        envioId: tmpEnvioId,
        montoTotal: 60000,
        montoRecibido: 60000,
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
    const payload = makeEnvioPayload(testData.clienteId);
    const envioRes = await request
      .post('/api/admin/envios')
      .set(adminHeaders())
      .send(payload);
    const tmpEnvioId = envioRes.body.id;

    const createRes = await request
      .post('/api/admin/pagos')
      .set(adminHeaders())
      .send({
        envioId: tmpEnvioId,
        montoTotal: 80000,
        montoRecibido: 0,
        metodoPago: 'contra_entrega',
      });
    const pagoId = createRes.body.id as string;

    const patchRes = await request
      .patch(`/api/admin/pagos/${pagoId}`)
      .set(adminHeaders())
      .set('X-Forwarded-For', '198.51.100.42')
      .set('User-Agent', 'pagos-audit-update-test/1.0')
      .send({ montoRecibido: 80000 });

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
    const payload = makeEnvioPayload(testData.clienteId);
    const envioRes = await request
      .post('/api/admin/envios')
      .set(adminHeaders())
      .send(payload);
    const tmpEnvioId = envioRes.body.id as string;

    const createRes = await request
      .post('/api/admin/pagos')
      .set(adminHeaders())
      .send({
        envioId: tmpEnvioId,
        montoTotal: 70000,
        montoRecibido: 0,
        metodoPago: 'contra_entrega',
      });
    expect(createRes.status).toBe(201);
    const pagoId = createRes.body.id as string;

    const orphanUserId = '00000000-0000-4000-b000-0000000000ff';

    const { error } = await supabase.rpc('update_pago_atomico', {
      p_pago_id: pagoId,
      p_monto_recibido: 70000,
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
  ): Promise<{ envioId: string; pagoId: string }> {
    const payload = makeEnvioPayload(testData.clienteId, overrides);
    const envioRes = await request
      .post('/api/admin/envios')
      .set(adminHeaders())
      .send(payload);
    const newEnvioId = envioRes.body.id as string;

    const pagoRes = await request
      .post('/api/admin/pagos')
      .set(adminHeaders())
      .send({
        envioId: newEnvioId,
        montoTotal: 50000,
        montoRecibido: 50000,
        metodoPago: 'efectivo',
        ...pagoOverrides,
      });
    return { envioId: newEnvioId, pagoId: pagoRes.body.id as string };
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

  it('reversa el saldo del cliente cuando el envio es cuenta_corriente', async () => {
    await supabase
      .from('clientes')
      .update({ saldo_cuenta_corriente: 0, limite_credito: 0 })
      .eq('id', testData.clienteId);
    await supabase.from('movimientos_cuenta_corriente').delete().eq('cliente_id', testData.clienteId);

    const payload = makeEnvioPayload(testData.clienteId, {
      tipoPago: 'cuenta_corriente' as const,
      costo: 60000,
      montoACobrar: 0,
    });
    const envioRes = await request
      .post('/api/admin/envios')
      .set(adminHeaders())
      .send(payload);
    const ccEnvioId = envioRes.body.id as string;

    const saldoPostEnvio = await request
      .get(`/api/admin/clientes/${testData.clienteId}/saldo`)
      .set(adminHeaders());
    expect(saldoPostEnvio.body.saldo).toBe(60000);

    const pagoRes = await request
      .post('/api/admin/pagos')
      .set(adminHeaders())
      .send({
        envioId: ccEnvioId,
        montoTotal: 60000,
        montoRecibido: 60000,
        metodoPago: 'transferencia',
      });
    const ccPagoId = pagoRes.body.id as string;

    const saldoPostPago = await request
      .get(`/api/admin/clientes/${testData.clienteId}/saldo`)
      .set(adminHeaders());
    expect(saldoPostPago.body.saldo).toBe(0);

    const anularRes = await request
      .post(`/api/admin/pagos/${ccPagoId}/anular`)
      .set(adminHeaders())
      .send({ motivo: 'Cliente reclamo cobro duplicado, revertir' });
    expect(anularRes.status).toBe(200);

    const saldoPostAnular = await request
      .get(`/api/admin/clientes/${testData.clienteId}/saldo`)
      .set(adminHeaders());
    expect(saldoPostAnular.body.saldo).toBe(60000);

    const movsRes = await request
      .get(`/api/admin/clientes/${testData.clienteId}/movimientos`)
      .set(adminHeaders());

    const reverso = (movsRes.body.data as Array<{ tipo: string; monto: number; pagoId: string | null }>)
      .find((m) => m.tipo === 'reverso');
    expect(reverso).toBeDefined();
    expect(reverso?.monto).toBe(60000);
    expect(reverso?.pagoId).toBe(ccPagoId);
  });

  it('permite registrar un nuevo pago sobre el mismo envio despues de anular el previo', async () => {
    const { envioId: reusedEnvioId, pagoId } = await crearEnvioYPago({}, {
      montoTotal: 45000,
      montoRecibido: 45000,
    });

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
        montoTotal: 45000,
        montoRecibido: 45000,
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
