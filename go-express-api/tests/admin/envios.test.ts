import { request, adminHeaders } from '../setup/test-client.js';
import { seedTestData, cleanupTestData, makeEnvioPayload, type TestData } from '../setup/seed.js';

let testData: TestData;
let createdEnvioId: string;
let createdTrackingNumber: string;

beforeAll(async () => {
  testData = await seedTestData();
});

afterAll(async () => {
  await cleanupTestData(testData);
});

describe('POST /api/admin/envios', () => {
  it('creates an envio with valid payload and returns 201', async () => {
    const payload = makeEnvioPayload(testData.clienteId);

    const res = await request
      .post('/api/admin/envios')
      .set(adminHeaders())
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('trackingNumber');
    expect(res.body).toHaveProperty('estado', 'pendiente');
    expect(res.body).toHaveProperty('clienteId', testData.clienteId);
    expect(res.body).toHaveProperty('destinatarioNombre', payload.destinatarioNombre);
    expect(res.body).toHaveProperty('costo', payload.costo);
    expect(res.body).toHaveProperty('tipoPago', 'contra_entrega');

    createdEnvioId = res.body.id;
    createdTrackingNumber = res.body.trackingNumber;
  });

  it('rejects missing required fields with 400', async () => {
    const res = await request
      .post('/api/admin/envios')
      .set(adminHeaders())
      .send({ clienteId: testData.clienteId });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('code', 'BAD_REQUEST');
  });

  it('rejects invalid phone format with 400', async () => {
    const payload = makeEnvioPayload(testData.clienteId, {
      destinatarioTelefono: '12345',
    });

    const res = await request
      .post('/api/admin/envios')
      .set(adminHeaders())
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('code', 'BAD_REQUEST');
  });

  it('rejects invalid clienteId format with 400', async () => {
    const payload = makeEnvioPayload('not-a-uuid');

    const res = await request
      .post('/api/admin/envios')
      .set(adminHeaders())
      .send(payload);

    expect(res.status).toBe(400);
  });

  it('rejects nonexistent clienteId with 404', async () => {
    const payload = makeEnvioPayload('00000000-0000-4000-a000-000000000099');

    const res = await request
      .post('/api/admin/envios')
      .set(adminHeaders())
      .send(payload);

    expect(res.status).toBe(404);
  });

  it('rejects negative peso with 400', async () => {
    const payload = makeEnvioPayload(testData.clienteId, { peso: -1 });

    const res = await request
      .post('/api/admin/envios')
      .set(adminHeaders())
      .send(payload);

    expect(res.status).toBe(400);
  });
});

describe('GET /api/admin/envios', () => {
  it('returns 200 with paginated list', async () => {
    const res = await request
      .get('/api/admin/envios')
      .set(adminHeaders());

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('pagination');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination).toHaveProperty('total');
    expect(res.body.pagination).toHaveProperty('page');
    expect(res.body.pagination).toHaveProperty('limit');
    expect(res.body.pagination).toHaveProperty('totalPages');
    expect(res.body.pagination).toHaveProperty('hasMore');
  });

  it('filters by search query', async () => {
    const res = await request
      .get('/api/admin/envios')
      .query({ search: createdTrackingNumber })
      .set(adminHeaders());

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);

    const match = res.body.data.find(
      (e: Record<string, unknown>) => e.trackingNumber === createdTrackingNumber
    );
    expect(match).toBeDefined();
  });

  it('filters by estado', async () => {
    const res = await request
      .get('/api/admin/envios')
      .query({ estado: 'pendiente' })
      .set(adminHeaders());

    expect(res.status).toBe(200);
    for (const envio of res.body.data) {
      expect(envio.estado).toBe('pendiente');
    }
  });

  it('filters by clienteId', async () => {
    const res = await request
      .get('/api/admin/envios')
      .query({ clienteId: testData.clienteId })
      .set(adminHeaders());

    expect(res.status).toBe(200);
    for (const envio of res.body.data) {
      expect(envio.clienteId).toBe(testData.clienteId);
    }
  });

  it('respects pagination limit', async () => {
    const res = await request
      .get('/api/admin/envios')
      .query({ limit: 1 })
      .set(adminHeaders());

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(1);
    expect(res.body.pagination.limit).toBe(1);
  });

  it('returns 401 without auth', async () => {
    const res = await request.get('/api/admin/envios');

    expect(res.status).toBe(401);
  });
});

describe('GET /api/admin/envios/:id', () => {
  it('returns 200 with full envio detail', async () => {
    const res = await request
      .get(`/api/admin/envios/${createdEnvioId}`)
      .set(adminHeaders());

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', createdEnvioId);
    expect(res.body).toHaveProperty('trackingNumber', createdTrackingNumber);
    expect(res.body).toHaveProperty('eventos');
    expect(Array.isArray(res.body.eventos)).toBe(true);
  });

  it('returns 404 for nonexistent id', async () => {
    const res = await request
      .get('/api/admin/envios/00000000-0000-4000-a000-000000000099')
      .set(adminHeaders());

    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid UUID format', async () => {
    const res = await request
      .get('/api/admin/envios/not-a-uuid')
      .set(adminHeaders());

    expect(res.status).toBe(400);
  });
});

describe('PUT /api/admin/envios/:id', () => {
  it('updates envio fields and returns 200', async () => {
    const res = await request
      .put(`/api/admin/envios/${createdEnvioId}`)
      .set(adminHeaders())
      .send({ destino: 'Ciudad del Este', peso: 3.5 });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('destino', 'Ciudad del Este');
    expect(res.body).toHaveProperty('peso', 3.5);
  });

  it('returns 404 for nonexistent envio', async () => {
    const res = await request
      .put('/api/admin/envios/00000000-0000-4000-a000-000000000099')
      .set(adminHeaders())
      .send({ destino: 'Test' });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/admin/envios/:id', () => {
  let envioToDeleteId: string;

  beforeAll(async () => {
    const payload = makeEnvioPayload(testData.clienteId);
    const res = await request
      .post('/api/admin/envios')
      .set(adminHeaders())
      .send(payload);
    envioToDeleteId = res.body.id;
  });

  it('soft-deletes envio with motivo and returns 204', async () => {
    const res = await request
      .delete(`/api/admin/envios/${envioToDeleteId}`)
      .set(adminHeaders())
      .send({ motivo: 'Test deletion for integration tests' });

    expect(res.status).toBe(204);
  });

  it('returns 404 when trying to get a deleted envio', async () => {
    const res = await request
      .get(`/api/admin/envios/${envioToDeleteId}`)
      .set(adminHeaders());

    expect(res.status).toBe(404);
  });

  it('rejects delete without motivo with 400', async () => {
    const payload = makeEnvioPayload(testData.clienteId);
    const createRes = await request
      .post('/api/admin/envios')
      .set(adminHeaders())
      .send(payload);
    const id = createRes.body.id;

    const res = await request
      .delete(`/api/admin/envios/${id}`)
      .set(adminHeaders())
      .send({});

    expect(res.status).toBe(400);
  });

  it('rejects delete with motivo too short (under 3 chars)', async () => {
    const payload = makeEnvioPayload(testData.clienteId);
    const createRes = await request
      .post('/api/admin/envios')
      .set(adminHeaders())
      .send(payload);
    const id = createRes.body.id;

    const res = await request
      .delete(`/api/admin/envios/${id}`)
      .set(adminHeaders())
      .send({ motivo: 'ab' });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/admin/envios/:id/eventos', () => {
  it('returns event history for an envio', async () => {
    const res = await request
      .get(`/api/admin/envios/${createdEnvioId}/eventos`)
      .set(adminHeaders());

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0]).toHaveProperty('estado');
    expect(res.body[0]).toHaveProperty('descripcion');
  });
});

describe('POST /api/admin/envios/:id/notas', () => {
  it('adds an internal note and returns 201', async () => {
    const res = await request
      .post(`/api/admin/envios/${createdEnvioId}/notas`)
      .set(adminHeaders())
      .send({ texto: 'Integration test note' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('texto', 'Integration test note');
    expect(res.body).toHaveProperty('envioId', createdEnvioId);
  });

  it('rejects empty note text with 400', async () => {
    const res = await request
      .post(`/api/admin/envios/${createdEnvioId}/notas`)
      .set(adminHeaders())
      .send({ texto: '' });

    expect(res.status).toBe(400);
  });
});
