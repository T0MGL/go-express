import { request, adminHeaders } from '../setup/test-client.js';
import { seedTestData, cleanupTestData, makeEnvioPayload, type TestData } from '../setup/seed.js';

let testData: TestData;
let envioId: string;
let envioTrackingNumber: string;
let paqueteId: string;

beforeAll(async () => {
  testData = await seedTestData();

  const payload = makeEnvioPayload(testData.clienteId);
  const envioRes = await request
    .post('/api/admin/envios')
    .set(adminHeaders())
    .send(payload);
  envioId = envioRes.body.id;
  envioTrackingNumber = envioRes.body.trackingNumber;
});

afterAll(async () => {
  await cleanupTestData(testData);
});

describe('POST /api/admin/warehouse/ingreso', () => {
  it('registers package ingreso and returns 201', async () => {
    const res = await request
      .post('/api/admin/warehouse/ingreso')
      .set(adminHeaders())
      .send({
        envioId,
        trackingNumber: envioTrackingNumber,
        clienteNombre: 'Test Client SA',
        ubicacion: 'A-01-03',
        zona: 'A',
        estante: '01',
        peso: 2.5,
        prioridad: 'normal',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('trackingNumber', envioTrackingNumber);

    paqueteId = res.body.id;
  });

  it('rejects ingreso with missing required fields with 400', async () => {
    const res = await request
      .post('/api/admin/warehouse/ingreso')
      .set(adminHeaders())
      .send({ trackingNumber: 'GE001' });

    expect(res.status).toBe(400);
  });

  it('rejects ingreso with invalid peso with 400', async () => {
    const res = await request
      .post('/api/admin/warehouse/ingreso')
      .set(adminHeaders())
      .send({
        trackingNumber: 'GE999',
        clienteNombre: 'Test',
        ubicacion: 'B-01',
        zona: 'B',
        peso: -1,
      });

    expect(res.status).toBe(400);
  });

  it('returns 401 without auth', async () => {
    const res = await request
      .post('/api/admin/warehouse/ingreso')
      .send({
        trackingNumber: 'GE999',
        clienteNombre: 'Test',
        ubicacion: 'B-01',
        zona: 'B',
        peso: 1,
      });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/admin/warehouse/inventario', () => {
  it('returns 200 with inventory list', async () => {
    const res = await request
      .get('/api/admin/warehouse/inventario')
      .set(adminHeaders());

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('pagination');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('filters by zona', async () => {
    const res = await request
      .get('/api/admin/warehouse/inventario')
      .query({ zona: 'A' })
      .set(adminHeaders());

    expect(res.status).toBe(200);
  });

  it('filters by estadoAlmacen', async () => {
    const res = await request
      .get('/api/admin/warehouse/inventario')
      .query({ estadoAlmacen: 'recibido' })
      .set(adminHeaders());

    expect(res.status).toBe(200);
  });

  it('filters by prioridad', async () => {
    const res = await request
      .get('/api/admin/warehouse/inventario')
      .query({ prioridad: 'normal' })
      .set(adminHeaders());

    expect(res.status).toBe(200);
  });
});

describe('GET /api/admin/warehouse (root alias for inventario)', () => {
  it('returns 200 with inventory list', async () => {
    const res = await request
      .get('/api/admin/warehouse')
      .set(adminHeaders());

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('pagination');
  });
});

describe('POST /api/admin/warehouse/despacho', () => {
  it('dispatches a package and returns 200', async () => {
    const res = await request
      .post('/api/admin/warehouse/despacho')
      .set(adminHeaders())
      .send({
        paqueteId,
        notas: 'Despachado para reparto',
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', paqueteId);
  });

  it('rejects despacho with invalid paqueteId format with 400', async () => {
    const res = await request
      .post('/api/admin/warehouse/despacho')
      .set(adminHeaders())
      .send({ paqueteId: 'not-a-uuid' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/admin/warehouse/devolucion', () => {
  let devolucionPaqueteId: string;

  beforeAll(async () => {
    const payload = makeEnvioPayload(testData.clienteId);
    const envioRes = await request
      .post('/api/admin/envios')
      .set(adminHeaders())
      .send(payload);
    const newEnvioId = envioRes.body.id;
    const newTracking = envioRes.body.trackingNumber;

    const ingresoRes = await request
      .post('/api/admin/warehouse/ingreso')
      .set(adminHeaders())
      .send({
        envioId: newEnvioId,
        trackingNumber: newTracking,
        clienteNombre: 'Test Client SA',
        ubicacion: 'C-02-01',
        zona: 'C',
        peso: 1.5,
        prioridad: 'alta',
      });
    devolucionPaqueteId = ingresoRes.body.id;
  });

  it('processes devolucion and returns 200', async () => {
    const res = await request
      .post('/api/admin/warehouse/devolucion')
      .set(adminHeaders())
      .send({
        paqueteId: devolucionPaqueteId,
        ubicacionDestino: 'D-01-DEVOLUCIONES',
        notas: 'Devolucion por destinatario ausente',
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', devolucionPaqueteId);
  });

  it('rejects devolucion without ubicacionDestino with 400', async () => {
    const res = await request
      .post('/api/admin/warehouse/devolucion')
      .set(adminHeaders())
      .send({ paqueteId: devolucionPaqueteId });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/admin/warehouse/picking', () => {
  it('returns 200 with picking list', async () => {
    const res = await request
      .get('/api/admin/warehouse/picking')
      .set(adminHeaders());

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('GET /api/admin/warehouse/stats', () => {
  it('returns 200 with warehouse statistics', async () => {
    const res = await request
      .get('/api/admin/warehouse/stats')
      .set(adminHeaders());

    expect(res.status).toBe(200);
    expect(typeof res.body).toBe('object');
  });
});
