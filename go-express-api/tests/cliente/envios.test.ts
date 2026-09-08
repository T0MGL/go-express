import { request, clienteHeaders, adminHeaders } from '../setup/test-client.js';
import { seedTestData, cleanupTestData, makeEnvioPayload, type TestData } from '../setup/seed.js';

let testData: TestData;

beforeAll(async () => {
  testData = await seedTestData();
});

afterAll(async () => {
  await cleanupTestData(testData);
});

describe('POST /api/cliente/envios', () => {
  it('creates an envio as cliente and returns 201', async () => {
    const payload = makeEnvioPayload(testData.clienteId);

    const res = await request
      .post('/api/cliente/envios')
      .set(clienteHeaders(testData.clienteId))
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('trackingNumber');
    expect(res.body).toHaveProperty('estado', 'pendiente');
    expect(res.body).toHaveProperty('clienteId', testData.clienteId);
  });

  it('rejects envio creation without auth with 401', async () => {
    const payload = makeEnvioPayload(testData.clienteId);

    const res = await request
      .post('/api/cliente/envios')
      .set({ 'Content-Type': 'application/json' })
      .send(payload);

    expect(res.status).toBe(401);
  });

  it('rejects envio with missing required fields with 400', async () => {
    const res = await request
      .post('/api/cliente/envios')
      .set(clienteHeaders(testData.clienteId))
      .send({ clienteId: testData.clienteId, origen: 'Asuncion' });

    expect(res.status).toBe(400);
  });

  it('rejects envio with invalid phone format with 400', async () => {
    const payload = makeEnvioPayload(testData.clienteId, {
      destinatarioTelefono: '12345',
    });

    const res = await request
      .post('/api/cliente/envios')
      .set(clienteHeaders(testData.clienteId))
      .send(payload);

    expect(res.status).toBe(400);
  });
});

describe('GET /api/cliente/envios', () => {
  beforeAll(async () => {
    const payload = makeEnvioPayload(testData.clienteId);
    await request
      .post('/api/cliente/envios')
      .set(clienteHeaders(testData.clienteId))
      .send(payload);
  });

  it('returns 200 with only my envios', async () => {
    const res = await request
      .get('/api/cliente/envios')
      .set(clienteHeaders(testData.clienteId));

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('pagination');
    expect(Array.isArray(res.body.data)).toBe(true);

    for (const envio of res.body.data) {
      expect(envio.clienteId).toBe(testData.clienteId);
    }
  });

  it('supports search filter', async () => {
    const res = await request
      .get('/api/cliente/envios')
      .query({ search: 'GE' })
      .set(clienteHeaders(testData.clienteId));

    expect(res.status).toBe(200);
  });

  it('supports estado filter', async () => {
    const res = await request
      .get('/api/cliente/envios')
      .query({ estado: 'pendiente' })
      .set(clienteHeaders(testData.clienteId));

    expect(res.status).toBe(200);
    for (const envio of res.body.data) {
      expect(envio.estado).toBe('pendiente');
    }
  });

  it('supports pagination', async () => {
    const res = await request
      .get('/api/cliente/envios')
      .query({ limit: 1, page: 1 })
      .set(clienteHeaders(testData.clienteId));

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(1);
    expect(res.body.pagination.limit).toBe(1);
  });

  it('returns 401 without auth', async () => {
    const res = await request.get('/api/cliente/envios');

    expect(res.status).toBe(401);
  });
});

describe('GET /api/cliente/envios/:id', () => {
  let envioId: string;

  beforeAll(async () => {
    const payload = makeEnvioPayload(testData.clienteId);
    const res = await request
      .post('/api/cliente/envios')
      .set(clienteHeaders(testData.clienteId))
      .send(payload);
    envioId = res.body.id;
  });

  it('returns 200 with envio detail (including eventos and pago)', async () => {
    const res = await request
      .get(`/api/cliente/envios/${envioId}`)
      .set(clienteHeaders(testData.clienteId));

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', envioId);
    expect(res.body).toHaveProperty('clienteId', testData.clienteId);
    expect(res.body).toHaveProperty('eventos');
    expect(Array.isArray(res.body.eventos)).toBe(true);
  });

  it('returns 404 for envio belonging to another client', async () => {
    const res = await request
      .get(`/api/cliente/envios/${envioId}`)
      .set(clienteHeaders('00000000-0000-4000-a000-000000000099'));

    // Returns 401 (invalid clienteId) or 404 (not found for that client)
    expect([401, 404]).toContain(res.status);
  });
});

describe('GET /api/cliente/dashboard/stats', () => {
  it('returns 200 with dashboard statistics', async () => {
    const res = await request
      .get('/api/cliente/dashboard/stats')
      .set(clienteHeaders(testData.clienteId));

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('activos');
    expect(res.body).toHaveProperty('entregados');
    expect(res.body).toHaveProperty('pendientes');
    expect(res.body).toHaveProperty('problemas');
    expect(res.body).toHaveProperty('totalEnvios');
    expect(res.body).toHaveProperty('enviosRecientes');
    expect(typeof res.body.totalEnvios).toBe('number');
    expect(Array.isArray(res.body.enviosRecientes)).toBe(true);
  });

  it('returns 401 without auth', async () => {
    const res = await request.get('/api/cliente/dashboard/stats');

    expect(res.status).toBe(401);
  });
});

// El portal responde al mismo criterio que el mostrador y el gateway: sin tarifa activa para
// el par no hay cobertura y el envio no se toma. El origen sale de cliente.ciudad (Asuncion en
// el seed), asi que el mensaje tiene que nombrar los dos extremos aunque el cliente solo elija
// el destino.
describe('POST /api/cliente/envios: ruta sin cobertura', () => {
  const CIUDAD_SIN_COBERTURA = 'Fuerte Olimpo';

  it('rechaza con 422 RUTA_SIN_TARIFA y no deja envio creado', async () => {
    const destinatarioNombre = 'Portal Sin Cobertura';
    const payload = makeEnvioPayload(testData.clienteId, {
      destinatarioCiudad: CIUDAD_SIN_COBERTURA,
      destinatarioNombre,
    });

    const res = await request
      .post('/api/cliente/envios')
      .set(clienteHeaders(testData.clienteId))
      .send(payload);

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('RUTA_SIN_TARIFA');
    expect(res.body.error).toContain('Asuncion');
    expect(res.body.error).toContain(CIUDAD_SIN_COBERTURA);

    const listado = await request
      .get('/api/admin/envios')
      .query({ search: destinatarioNombre })
      .set(adminHeaders());

    expect(listado.status).toBe(200);
    expect(listado.body.data).toHaveLength(0);
  });

  it('bulk: la fila sin cobertura se reporta por indice y el resto se importa', async () => {
    const res = await request
      .post('/api/cliente/envios/bulk-import')
      .set(clienteHeaders(testData.clienteId))
      .send({
        envios: [
          makeEnvioPayload(testData.clienteId, {
            destinatarioCiudad: CIUDAD_SIN_COBERTURA,
            destinatarioNombre: 'Bulk Portal Sin Cobertura',
          }),
          makeEnvioPayload(testData.clienteId, {
            destinatarioNombre: 'Bulk Portal Con Cobertura',
          }),
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.imported).toBe(1);
    expect(res.body.failed).toBe(1);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0].index).toBe(0);
    expect(String(res.body.errors[0].error)).toContain(CIUDAD_SIN_COBERTURA);
    expect(res.body.results).toHaveLength(1);
  });

  it('bulk: sin ninguna fila con cobertura no importa nada y las lista todas', async () => {
    const res = await request
      .post('/api/cliente/envios/bulk-import')
      .set(clienteHeaders(testData.clienteId))
      .send({
        envios: [
          makeEnvioPayload(testData.clienteId, {
            destinatarioCiudad: CIUDAD_SIN_COBERTURA,
            destinatarioNombre: 'Bulk Portal Todo Sin Cobertura',
          }),
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.imported).toBe(0);
    expect(res.body.failed).toBe(1);
    expect(res.body.results).toHaveLength(0);
  });
});
