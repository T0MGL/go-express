import express from 'express';
import supertest from 'supertest';
import type { NextFunction, Request, Response } from 'express';
import { requireOnlyAdmin } from '../../src/middleware/adminAuth.js';
import { globalErrorHandler } from '../../src/middleware/errorHandler.js';
import usuarioRoutes from '../../src/routes/admin/usuarios.js';

// Guards the fact that /api/admin/usuarios is strictly admin. An operador
// authenticates fine against requireAdmin in production, so the gate that
// blocks privilege escalation lives in requireOnlyAdmin applied at the
// /usuarios sub-router in routes/admin/index.ts.
//
// We cannot easily seed an operador Supabase Auth user inside vitest, so we
// mirror the pattern from tests/rate-limit.test.ts: mount the real gate plus
// the real usuarios router on a mini app, and inject a fake operador identity
// via a stub that simulates what requireAdmin would set on a valid operador
// token.

function buildApp(role: 'operador' | 'admin'): express.Express {
  const app = express();
  app.use(express.json());

  const stubRequireAdmin = (req: Request, _res: Response, next: NextFunction) => {
    req.userId = '00000000-0000-4000-a000-0000000000aa';
    req.userName = role === 'admin' ? 'Admin Test' : 'Operador Test';
    req.userRole = role;
    req.userEmail = `${role}@goexpress.test`;
    next();
  };

  app.use('/api/admin', stubRequireAdmin);
  app.use('/api/admin/usuarios', requireOnlyAdmin, usuarioRoutes);
  app.use(globalErrorHandler);

  return app;
}

const operador = supertest(buildApp('operador'));

const VALID_UUID = '00000000-0000-4000-a000-0000000000bb';

describe('usuarios routes are admin-only: operador token must get 403', () => {
  it('GET /api/admin/usuarios → 403 forbidden_operador_cant_access', async () => {
    const res = await operador.get('/api/admin/usuarios');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'forbidden_operador_cant_access' });
  });

  it('POST /api/admin/usuarios → 403 forbidden_operador_cant_access', async () => {
    const res = await operador
      .post('/api/admin/usuarios')
      .send({ nombre: 'Attacker', email: 'attacker@goexpress.test', rol: 'admin' });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'forbidden_operador_cant_access' });
  });

  it('PUT /api/admin/usuarios/:id → 403 forbidden_operador_cant_access', async () => {
    const res = await operador
      .put(`/api/admin/usuarios/${VALID_UUID}`)
      .send({ rol: 'admin' });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'forbidden_operador_cant_access' });
  });

  it('POST /api/admin/usuarios/:id/reinvite → 403 forbidden_operador_cant_access', async () => {
    const res = await operador.post(`/api/admin/usuarios/${VALID_UUID}/reinvite`).send();
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'forbidden_operador_cant_access' });
  });

  it('POST /api/admin/usuarios/:id/password → 403 forbidden_operador_cant_access', async () => {
    const res = await operador
      .post(`/api/admin/usuarios/${VALID_UUID}/password`)
      .send({ password: 'LongEnough-1234' });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'forbidden_operador_cant_access' });
  });

  it('POST /api/admin/usuarios/:id/send-password-reset → 403 forbidden_operador_cant_access', async () => {
    const res = await operador.post(`/api/admin/usuarios/${VALID_UUID}/send-password-reset`).send();
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'forbidden_operador_cant_access' });
  });
});

describe('usuarios routes remain reachable for admin role through the gate', () => {
  const admin = supertest(buildApp('admin'));

  it('admin role is NOT rejected by requireOnlyAdmin on POST (separate failure modes come later)', async () => {
    // The gate is what this suite guards. Downstream validation or DB errors
    // are fine. Anything other than a 403 with operador-cant-access code means
    // the gate let the request through, which is the invariant we care about.
    const res = await admin
      .post('/api/admin/usuarios')
      .send({ nombre: 'Ok', email: 'ok@goexpress.test', rol: 'operador' });

    expect(res.body?.code).not.toBe('forbidden_operador_cant_access');
    expect(res.status).not.toBe(403);
  });

  it('admin role is NOT rejected by requireOnlyAdmin on PUT', async () => {
    const res = await admin
      .put(`/api/admin/usuarios/${VALID_UUID}`)
      .send({ nombre: 'Patched Name' });

    expect(res.body?.code).not.toBe('forbidden_operador_cant_access');
    expect(res.status).not.toBe(403);
  });
});
