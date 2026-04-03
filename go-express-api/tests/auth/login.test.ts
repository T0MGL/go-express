import { request, adminHeaders } from '../setup/test-client.js';

describe('POST /api/auth/login', () => {
  it('rejects missing body fields with 400', async () => {
    const res = await request
      .post('/api/auth/login')
      .set({ 'Content-Type': 'application/json' })
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('code', 'BAD_REQUEST');
  });

  it('rejects invalid email format with 400', async () => {
    const res = await request
      .post('/api/auth/login')
      .set({ 'Content-Type': 'application/json' })
      .send({ email: 'not-an-email', password: 'test123' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('code', 'BAD_REQUEST');
  });

  it('rejects empty password with 400', async () => {
    const res = await request
      .post('/api/auth/login')
      .set({ 'Content-Type': 'application/json' })
      .send({ email: 'test@goexpress.test', password: '' });

    expect(res.status).toBe(400);
  });

  it('rejects wrong credentials with 401', async () => {
    const res = await request
      .post('/api/auth/login')
      .set({ 'Content-Type': 'application/json' })
      .send({ email: 'nobody@goexpress.test', password: 'wrongpassword123' });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('code', 'UNAUTHORIZED');
  });
});

describe('GET /api/auth/me', () => {
  it('returns 401 without authorization header', async () => {
    const res = await request.get('/api/auth/me');

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('code', 'UNAUTHORIZED');
  });

  it('returns 401 with malformed bearer token', async () => {
    const res = await request
      .get('/api/auth/me')
      .set({ Authorization: 'Bearer invalid-token-value' });

    expect(res.status).toBe(401);
  });

  it('returns 401 with missing Bearer prefix', async () => {
    const res = await request
      .get('/api/auth/me')
      .set({ Authorization: 'just-a-token' });

    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('returns 204 even without token (graceful)', async () => {
    const res = await request.post('/api/auth/logout');

    expect(res.status).toBe(204);
  });

  it('returns 204 with an invalid token (graceful)', async () => {
    const res = await request
      .post('/api/auth/logout')
      .set({ Authorization: 'Bearer some-invalid-token' });

    expect(res.status).toBe(204);
  });
});

describe('POST /api/auth/refresh', () => {
  it('rejects missing refreshToken with 400', async () => {
    const res = await request
      .post('/api/auth/refresh')
      .set({ 'Content-Type': 'application/json' })
      .send({});

    expect(res.status).toBe(400);
  });

  it('rejects invalid refresh token with 401', async () => {
    const res = await request
      .post('/api/auth/refresh')
      .set({ 'Content-Type': 'application/json' })
      .send({ refreshToken: 'invalid-refresh-token' });

    expect(res.status).toBe(401);
  });
});
