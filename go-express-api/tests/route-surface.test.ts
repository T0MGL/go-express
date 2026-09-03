import { request } from './setup/test-client.js';

describe('superficie de rutas', () => {
  it('corta las rutas fuera del API antes del body parser', async () => {
    const res = await request
      .post('/wp-json/batch/v1')
      .set('Content-Type', 'application/json')
      .send('{"json":');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('code', 'NOT_FOUND');
  });

  it('sigue parseando el body dentro del API', async () => {
    const res = await request
      .post('/api/ruta-inexistente')
      .set('Content-Type', 'application/json')
      .send('{"json":');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('code', 'BAD_REQUEST');
  });

  it('deja pasar /health', async () => {
    const res = await request.get('/health');

    expect(res.status).toBe(200);
  });
});

describe('errores de cliente', () => {
  it('responde con el status del error y no como falla del servidor', async () => {
    const res = await request
      .post('/api/ruta-inexistente')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ relleno: 'x'.repeat(1_200_000) }));

    expect(res.status).toBe(413);
    expect(res.body).toHaveProperty('code', 'BAD_REQUEST');
  });
});
