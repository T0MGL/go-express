import { request, clienteHeaders } from '../setup/test-client.js';
import { seedTestData, cleanupTestData, type TestData } from '../setup/seed.js';

let testData: TestData;

beforeAll(async () => {
  testData = await seedTestData();
});

afterAll(async () => {
  await cleanupTestData(testData);
});

describe('POST /api/cliente/cotizador/cotizar', () => {
  it('returns 200 with calculated price for a valid route', async () => {
    const res = await request
      .post('/api/cliente/cotizador/cotizar')
      .set(clienteHeaders(testData.clienteId))
      .send({
        origen: 'Asuncion',
        destino: 'Encarnacion',
        peso: 3,
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('costoTotal');
    expect(res.body).toHaveProperty('pesoReal');
    expect(res.body).toHaveProperty('pesoTarificado');
    expect(res.body).toHaveProperty('costoBase');
    expect(res.body).toHaveProperty('costoExtra');
    expect(res.body).toHaveProperty('tarifa');
    expect(res.body.tarifa).toHaveProperty('origen', 'Asuncion');
    expect(res.body.tarifa).toHaveProperty('destino', 'Encarnacion');
    expect(typeof res.body.costoTotal).toBe('number');
  });

  it('returns price with dimensional weight when dimensiones provided', async () => {
    const res = await request
      .post('/api/cliente/cotizador/cotizar')
      .set(clienteHeaders(testData.clienteId))
      .send({
        origen: 'Asuncion',
        destino: 'Encarnacion',
        peso: 2,
        dimensiones: { largo: 40, ancho: 30, alto: 20 },
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('costoTotal');
    expect(res.body).toHaveProperty('pesoVolumetrico');
    expect(res.body).toHaveProperty('esVolumetrico');
    expect(typeof res.body.costoTotal).toBe('number');
  });

  it('rejects missing required fields with 400', async () => {
    const res = await request
      .post('/api/cliente/cotizador/cotizar')
      .set(clienteHeaders(testData.clienteId))
      .send({ origen: 'Asuncion' });

    expect(res.status).toBe(400);
  });

  it('rejects missing origen with 400', async () => {
    const res = await request
      .post('/api/cliente/cotizador/cotizar')
      .set(clienteHeaders(testData.clienteId))
      .send({ destino: 'Encarnacion', peso: 2 });

    expect(res.status).toBe(400);
  });

  it('rejects zero peso with 400', async () => {
    const res = await request
      .post('/api/cliente/cotizador/cotizar')
      .set(clienteHeaders(testData.clienteId))
      .send({ origen: 'Asuncion', destino: 'Encarnacion', peso: 0 });

    expect(res.status).toBe(400);
  });

  it('rejects negative peso with 400', async () => {
    const res = await request
      .post('/api/cliente/cotizador/cotizar')
      .set(clienteHeaders(testData.clienteId))
      .send({ origen: 'Asuncion', destino: 'Encarnacion', peso: -5 });

    expect(res.status).toBe(400);
  });

  it('returns 404 for a route without configured tarifa', async () => {
    const res = await request
      .post('/api/cliente/cotizador/cotizar')
      .set(clienteHeaders(testData.clienteId))
      .send({
        origen: 'NowhereCity',
        destino: 'GhostTown',
        peso: 1,
      });

    expect(res.status).toBe(404);
  });

  it('returns 401 without auth', async () => {
    const res = await request
      .post('/api/cliente/cotizador/cotizar')
      .set({ 'Content-Type': 'application/json' })
      .send({ origen: 'Asuncion', destino: 'Encarnacion', peso: 1 });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/cliente/cotizador/ciudades', () => {
  it('returns 200 with list of available cities', async () => {
    const res = await request
      .get('/api/cliente/cotizador/ciudades')
      .set(clienteHeaders(testData.clienteId));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body).toContain('Asuncion');
    expect(res.body).toContain('Encarnacion');
  });

  it('returns sorted city names', async () => {
    const res = await request
      .get('/api/cliente/cotizador/ciudades')
      .set(clienteHeaders(testData.clienteId));

    const sorted = [...res.body].sort();
    expect(res.body).toEqual(sorted);
  });
});
