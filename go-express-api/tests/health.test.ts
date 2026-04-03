import { request } from './setup/test-client.js';

describe('GET /health', () => {
  it('returns 200 with status ok when database is reachable', async () => {
    const res = await request.get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('database', 'connected');
    expect(res.body).toHaveProperty('timestamp');
  });

  it('returns a valid ISO timestamp', async () => {
    const res = await request.get('/health');

    const parsed = Date.parse(res.body.timestamp);
    expect(Number.isNaN(parsed)).toBe(false);
  });
});

describe('404 handler', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await request.get('/api/nonexistent-route');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error', 'Route not found');
    expect(res.body).toHaveProperty('code', 'NOT_FOUND');
  });
});
