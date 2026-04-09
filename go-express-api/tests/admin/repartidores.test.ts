import { request, adminHeaders } from '../setup/test-client.js';
import { seedTestData, cleanupTestData, makeEnvioPayload, type TestData } from '../setup/seed.js';

let testData: TestData;
let createdRepartidorId: string;

const uniqueSuffix = Date.now().toString(36);

const validRepartidor = {
  nombre: `Repartidor Test ${uniqueSuffix}`,
  telefono: '+595982200300',
  vehiculo: 'Moto',
  placa: `RT${uniqueSuffix.slice(0, 4).toUpperCase()}`,
  licencia: 'LIC-TEST-99',
};

beforeAll(async () => {
  testData = await seedTestData();
});

afterAll(async () => {
  if (createdRepartidorId) {
    await request
      .delete(`/api/admin/repartidores/${createdRepartidorId}`)
      .set(adminHeaders())
      .send({ motivo: 'Cleanup after integration tests' });
  }
  await cleanupTestData(testData);
});

describe('POST /api/admin/repartidores', () => {
  it('creates a repartidor with valid data and returns 201', async () => {
    const res = await request
      .post('/api/admin/repartidores')
      .set(adminHeaders())
      .send(validRepartidor);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('nombre', validRepartidor.nombre);
    expect(res.body).toHaveProperty('vehiculo', 'Moto');
    expect(res.body).toHaveProperty('estado', 'activo');

    createdRepartidorId = res.body.id;
  });

  it('rejects missing required fields with 400', async () => {
    const res = await request
      .post('/api/admin/repartidores')
      .set(adminHeaders())
      .send({ nombre: 'Incomplete' });

    expect(res.status).toBe(400);
  });

  it('rejects invalid phone format with 400', async () => {
    const res = await request
      .post('/api/admin/repartidores')
      .set(adminHeaders())
      .send({ ...validRepartidor, telefono: '12345' });

    expect(res.status).toBe(400);
  });

  it('rejects invalid vehiculo type with 400', async () => {
    const res = await request
      .post('/api/admin/repartidores')
      .set(adminHeaders())
      .send({ ...validRepartidor, vehiculo: 'Bicicleta' });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/admin/repartidores', () => {
  it('returns 200 with list', async () => {
    const res = await request
      .get('/api/admin/repartidores')
      .set(adminHeaders());

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('pagination');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('filters by estado', async () => {
    const res = await request
      .get('/api/admin/repartidores')
      .query({ estado: 'activo' })
      .set(adminHeaders());

    expect(res.status).toBe(200);
    for (const r of res.body.data) {
      expect(r.estado).toBe('activo');
    }
  });

  it('returns 401 without auth', async () => {
    const res = await request.get('/api/admin/repartidores');

    expect(res.status).toBe(401);
  });
});

describe('GET /api/admin/repartidores/:id', () => {
  it('returns 200 with repartidor detail', async () => {
    const res = await request
      .get(`/api/admin/repartidores/${createdRepartidorId}`)
      .set(adminHeaders());

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', createdRepartidorId);
    expect(res.body).toHaveProperty('nombre', validRepartidor.nombre);
  });

  it('returns 404 for nonexistent repartidor', async () => {
    const res = await request
      .get('/api/admin/repartidores/00000000-0000-4000-a000-000000000099')
      .set(adminHeaders());

    expect(res.status).toBe(404);
  });
});

describe('PUT /api/admin/repartidores/:id', () => {
  it('updates repartidor fields and returns 200', async () => {
    const res = await request
      .put(`/api/admin/repartidores/${createdRepartidorId}`)
      .set(adminHeaders())
      .send({ vehiculo: 'Auto' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('vehiculo', 'Auto');
  });
});

describe('PATCH /api/admin/repartidores/:id/estado', () => {
  it('toggles repartidor estado and returns 200', async () => {
    const res = await request
      .patch(`/api/admin/repartidores/${createdRepartidorId}/estado`)
      .set(adminHeaders());

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('estado');
    expect(['activo', 'inactivo']).toContain(res.body.estado);
  });

  it('toggles back to original estado', async () => {
    const res = await request
      .patch(`/api/admin/repartidores/${createdRepartidorId}/estado`)
      .set(adminHeaders());

    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/admin/envios/:id/repartidor (assign repartidor)', () => {
  let envioId: string;

  beforeAll(async () => {
    const payload = makeEnvioPayload(testData.clienteId);
    const res = await request
      .post('/api/admin/envios')
      .set(adminHeaders())
      .send(payload);
    envioId = res.body.id;

    // Ensure repartidor is activo
    const repRes = await request
      .get(`/api/admin/repartidores/${testData.repartidorId}`)
      .set(adminHeaders());
    if (repRes.body.estado !== 'activo') {
      await request
        .patch(`/api/admin/repartidores/${testData.repartidorId}/estado`)
        .set(adminHeaders());
    }
  });

  it('assigns repartidor to envio and returns 200', async () => {
    const res = await request
      .patch(`/api/admin/envios/${envioId}/repartidor`)
      .set(adminHeaders())
      .send({ repartidorId: testData.repartidorId });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('repartidorId', testData.repartidorId);
    expect(res.body.repartidorAsignadoEn).toBeTruthy();
  });

  it('rejects assignment with nonexistent repartidorId', async () => {
    const res = await request
      .patch(`/api/admin/envios/${envioId}/repartidor`)
      .set(adminHeaders())
      .send({ repartidorId: '00000000-0000-4000-a000-000000000099' });

    expect(res.status).toBe(404);
  });

  it('rejects assignment with invalid UUID format', async () => {
    const res = await request
      .patch(`/api/admin/envios/${envioId}/repartidor`)
      .set(adminHeaders())
      .send({ repartidorId: 'bad-uuid' });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/admin/repartidores/:id/envios', () => {
  it('returns assigned envios for repartidor', async () => {
    const res = await request
      .get(`/api/admin/repartidores/${testData.repartidorId}/envios`)
      .set(adminHeaders());

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('DELETE /api/admin/repartidores/:id', () => {
  let repartidorToDeleteId: string;

  beforeAll(async () => {
    const suffix = Date.now().toString(36);
    const res = await request
      .post('/api/admin/repartidores')
      .set(adminHeaders())
      .send({
        nombre: `Delete Test ${suffix}`,
        telefono: '+595983300400',
        vehiculo: 'Camioneta',
        placa: `DL${suffix.slice(0, 4).toUpperCase()}`,
      });
    repartidorToDeleteId = res.body.id;
  });

  it('soft-deletes repartidor with motivo and returns 204', async () => {
    const res = await request
      .delete(`/api/admin/repartidores/${repartidorToDeleteId}`)
      .set(adminHeaders())
      .send({ motivo: 'Repartidor no longer available' });

    expect(res.status).toBe(204);
  });

  it('returns 404 when fetching deleted repartidor', async () => {
    const res = await request
      .get(`/api/admin/repartidores/${repartidorToDeleteId}`)
      .set(adminHeaders());

    expect(res.status).toBe(404);
  });
});
