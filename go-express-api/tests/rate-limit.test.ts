import express from 'express';
import supertest from 'supertest';
import { adminWriteLimiter } from '../src/middleware/rateLimit.js';

// Verifies adminWriteLimiter behavior. In production it is mounted globally in
// src/app.ts for /api/admin on POST|PUT|PATCH|DELETE and is explicitly bypassed
// when NODE_ENV=test, so a route-level test under the normal vitest setup would
// never see a 429. We mount the real limiter here against a mini-app (mirror of
// tests/trust-proxy.test.ts) so config drift on the real middleware is caught.
// Each test uses a unique X-Forwarded-For so the shared in-memory store does
// not bleed quota between cases.

const LIMIT = 30;

function buildApp(): express.Express {
  const app = express();
  app.set('trust proxy', 1);
  app.post('/admin/resource', adminWriteLimiter, (_req, res) => {
    res.status(201).json({ ok: true });
  });
  return app;
}

describe('adminWriteLimiter', () => {
  const app = buildApp();
  const client = supertest(app);

  it('lets every request through while under the 30/min threshold', async () => {
    const xff = '203.0.113.10';
    for (let i = 0; i < LIMIT; i += 1) {
      const res = await client
        .post('/admin/resource')
        .set('X-Forwarded-For', xff);
      expect(res.status).toBe(201);
    }
  });

  it('returns 429 with the TOO_MANY_REQUESTS JSON shape on the 31st request', async () => {
    const xff = '203.0.113.11';
    for (let i = 0; i < LIMIT; i += 1) {
      const res = await client
        .post('/admin/resource')
        .set('X-Forwarded-For', xff);
      expect(res.status).toBe(201);
    }

    const blocked = await client
      .post('/admin/resource')
      .set('X-Forwarded-For', xff);
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({
      error: 'Too many requests, please try again later',
      code: 'TOO_MANY_REQUESTS',
    });
  });

  it('exposes draft-7 RateLimit and Retry-After headers when blocked', async () => {
    const xff = '203.0.113.12';
    for (let i = 0; i < LIMIT; i += 1) {
      await client.post('/admin/resource').set('X-Forwarded-For', xff);
    }

    const blocked = await client
      .post('/admin/resource')
      .set('X-Forwarded-For', xff);
    expect(blocked.status).toBe(429);
    // draft-7 emits a single combined RateLimit header plus RateLimit-Policy,
    // not individual RateLimit-Limit/Remaining/Reset (those are draft-6).
    expect(blocked.headers['ratelimit-policy']).toBe(`${LIMIT};w=60`);
    expect(blocked.headers['ratelimit']).toMatch(
      new RegExp(`limit=${LIMIT},\\s*remaining=0,\\s*reset=\\d+`)
    );
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('tracks quota per client IP so a different caller is not punished', async () => {
    const attacker = '203.0.113.20';
    const honest = '203.0.113.21';

    for (let i = 0; i < LIMIT; i += 1) {
      await client.post('/admin/resource').set('X-Forwarded-For', attacker);
    }

    const attackerBlocked = await client
      .post('/admin/resource')
      .set('X-Forwarded-For', attacker);
    expect(attackerBlocked.status).toBe(429);

    const honestAllowed = await client
      .post('/admin/resource')
      .set('X-Forwarded-For', honest);
    expect(honestAllowed.status).toBe(201);
  });
});
