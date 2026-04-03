import { request, adminHeaders } from '../setup/test-client.js';
import { seedTestData, cleanupTestData, makeEnvioPayload, type TestData } from '../setup/seed.js';

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
