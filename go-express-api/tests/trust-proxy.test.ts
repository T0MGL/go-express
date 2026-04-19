import express from 'express';
import supertest from 'supertest';

// Verifies that trust proxy: 1 (as configured in src/app.ts) correctly resolves
// req.ip under the scenarios we actually see in production: direct request,
// single X-Forwarded-For from Railway's proxy, IPv6-mapped IPv4, and multi-hop
// chain. The production app cannot be inspected directly because it does not
// echo req.ip anywhere, so we rebuild the exact same trust setting here.

function buildApp(): express.Express {
  const app = express();
  app.set('trust proxy', 1);
  app.get('/echo-ip', (req, res) => {
    res.json({ ip: req.ip });
  });
  return app;
}

describe('trust proxy: 1', () => {
  const app = buildApp();
  const client = supertest(app);

  it('returns socket address when no X-Forwarded-For header is sent', async () => {
    const res = await client.get('/echo-ip');
    expect(res.status).toBe(200);
    // Loopback. Node sockets report either ::ffff:127.0.0.1 or ::1 depending
    // on the OS stack. Both are acceptable for a direct request.
    expect(res.body.ip).toMatch(/^(::1|::ffff:127\.0\.0\.1|127\.0\.0\.1)$/);
  });

  it('uses X-Forwarded-For when one proxy hop is declared', async () => {
    const res = await client
      .get('/echo-ip')
      .set('X-Forwarded-For', '203.0.113.77');
    expect(res.status).toBe(200);
    expect(res.body.ip).toBe('203.0.113.77');
  });

  it('extracts the client IP from IPv6-mapped IPv4 in X-Forwarded-For', async () => {
    const res = await client
      .get('/echo-ip')
      .set('X-Forwarded-For', '::ffff:198.51.100.42');
    expect(res.status).toBe(200);
    // Express returns the header value as-is. With trust proxy: 1, the mapped
    // form survives. Downstream code that compares IPs must therefore accept
    // both 198.51.100.42 and ::ffff:198.51.100.42 as the same address.
    expect(res.body.ip).toBe('::ffff:198.51.100.42');
  });

  it('accepts a plain IPv6 address in X-Forwarded-For', async () => {
    const res = await client
      .get('/echo-ip')
      .set('X-Forwarded-For', '2001:db8::1');
    expect(res.status).toBe(200);
    expect(res.body.ip).toBe('2001:db8::1');
  });

  it('with trust proxy: 1 and two hops, returns the LEFTMOST-FROM-RIGHT hop (1 from the right)', async () => {
    // trust proxy: N means trust N hops. Express returns the Nth IP from the
    // right end of X-Forwarded-For. With N=1 and XFF "a, b, c", req.ip is c.
    // This asserts the exact semantic we rely on at the edge behind Railway,
    // where only the final Railway hop is trusted and any upstream values in
    // XFF are treated as untrusted input.
    const res = await client
      .get('/echo-ip')
      .set('X-Forwarded-For', '198.51.100.1, 198.51.100.2, 203.0.113.77');
    expect(res.status).toBe(200);
    expect(res.body.ip).toBe('203.0.113.77');
  });
});
