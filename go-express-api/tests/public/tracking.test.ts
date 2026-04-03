import { request, adminHeaders, publicHeaders } from '../setup/test-client.js';
import { seedTestData, cleanupTestData, makeEnvioPayload, type TestData } from '../setup/seed.js';

let testData: TestData;
let trackingNumber: string;

beforeAll(async () => {
  testData = await seedTestData();

  const payload = makeEnvioPayload(testData.clienteId);
  const res = await request
    .post('/api/admin/envios')
    .set(adminHeaders())
    .send(payload);
  trackingNumber = res.body.trackingNumber;
});

afterAll(async () => {
  await cleanupTestData(testData);
});

describe('GET /api/public/tracking/:trackingNumber', () => {
  it('returns 200 with public tracking data for valid tracking number', async () => {
    const res = await request
      .get(`/api/public/tracking/${trackingNumber}`)
      .set(publicHeaders());

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('trackingNumber', trackingNumber);
    expect(res.body).toHaveProperty('estado', 'pendiente');
    expect(res.body).toHaveProperty('origen');
    expect(res.body).toHaveProperty('destino');
    expect(res.body).toHaveProperty('destinatarioCiudad');
    expect(res.body).toHaveProperty('fecha');
    expect(res.body).toHaveProperty('eventos');
    expect(Array.isArray(res.body.eventos)).toBe(true);
  });

  it('does NOT expose PII (no destinatario name, address, phone, cedula)', async () => {
    const res = await request
      .get(`/api/public/tracking/${trackingNumber}`)
      .set(publicHeaders());

    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('destinatarioNombre');
    expect(res.body).not.toHaveProperty('destinatarioDireccion');
    expect(res.body).not.toHaveProperty('destinatarioTelefono');
    expect(res.body).not.toHaveProperty('destinatarioCedula');
    expect(res.body).not.toHaveProperty('clienteId');
    expect(res.body).not.toHaveProperty('clienteNombre');
    expect(res.body).not.toHaveProperty('pago');
    expect(res.body).not.toHaveProperty('notasInternas');
  });

  it('returns eventos in descending chronological order', async () => {
    const res = await request
      .get(`/api/public/tracking/${trackingNumber}`)
      .set(publicHeaders());

    expect(res.status).toBe(200);
    if (res.body.eventos.length > 1) {
      for (let i = 0; i < res.body.eventos.length - 1; i++) {
        const current = new Date(res.body.eventos[i].fecha).getTime();
        const next = new Date(res.body.eventos[i + 1].fecha).getTime();
        expect(current).toBeGreaterThanOrEqual(next);
      }
    }
  });

  it('returns 404 for nonexistent tracking number', async () => {
    const res = await request
      .get('/api/public/tracking/GE000000000')
      .set(publicHeaders());

    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid tracking number format (special chars)', async () => {
    const res = await request
      .get('/api/public/tracking/!@%23$%25')
      .set(publicHeaders());

    expect(res.status).toBe(400);
  });

  it('returns 400 for tracking number that is too short', async () => {
    const res = await request
      .get('/api/public/tracking/AB')
      .set(publicHeaders());

    expect(res.status).toBe(400);
  });

  it('returns 400 for tracking number that is too long', async () => {
    const res = await request
      .get('/api/public/tracking/ABCDEFGHIJKLMNOPQRSTU')
      .set(publicHeaders());

    expect(res.status).toBe(400);
  });

  it('handles case-insensitive tracking number lookup', async () => {
    const lowercaseTracking = trackingNumber.toLowerCase();

    const res = await request
      .get(`/api/public/tracking/${lowercaseTracking}`)
      .set(publicHeaders());

    expect(res.status).toBe(200);
    expect(res.body.trackingNumber).toBe(trackingNumber);
  });

  it('does not require authentication', async () => {
    const res = await request
      .get(`/api/public/tracking/${trackingNumber}`);

    expect(res.status).toBe(200);
  });

  it('reflects state changes in tracking data', async () => {
    await request
      .patch(`/api/admin/envios/${trackingNumber}/../estado`)
      .set(adminHeaders());

    // First get the envio ID via admin
    const listRes = await request
      .get('/api/admin/envios')
      .query({ search: trackingNumber })
      .set(adminHeaders());
    const envioId = listRes.body.data[0].id;

    await request
      .patch(`/api/admin/envios/${envioId}/estado`)
      .set(adminHeaders())
      .send({ estado: 'recolectado', descripcion: 'Recolectado para tracking test' });

    const res = await request
      .get(`/api/public/tracking/${trackingNumber}`)
      .set(publicHeaders());

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('recolectado');
    expect(res.body.eventos.length).toBeGreaterThanOrEqual(2);
  });
});
