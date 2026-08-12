import { request } from './setup/test-client.js';

describe('CORS', () => {
  it.each([
    'https://goexpressparaguay.com',
    'https://www.goexpressparaguay.com',
    'https://app.goexpressparaguay.com',
    'https://cliente.app.goexpressparaguay.com',
  ])('allows first-party origin %s', async (origin) => {
    const res = await request
      .options('/api/nonexistent-route')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'GET');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(origin);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('does not allow lookalike domains', async () => {
    const res = await request
      .options('/api/nonexistent-route')
      .set('Origin', 'https://goexpressparaguay.com.evil.test')
      .set('Access-Control-Request-Method', 'GET');

    expect(res.status).toBe(500);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
