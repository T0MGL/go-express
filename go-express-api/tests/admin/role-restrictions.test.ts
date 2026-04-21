import type { NextFunction, Request, Response } from 'express';
import { requireOnlyAdmin } from '../../src/middleware/adminAuth.js';
import { AppError } from '../../src/middleware/errorHandler.js';
import { request, adminHeaders } from '../setup/test-client.js';

function invokeMiddleware(role: string | undefined) {
  const req = {
    userRole: role,
    userId: 'test-user-id',
    path: '/api/admin/tarifas',
    method: 'GET',
  } as unknown as Request;
  const res = {} as Response;
  let captured: unknown;
  const next: NextFunction = (err) => {
    captured = err;
  };
  requireOnlyAdmin(req, res, next);
  return captured;
}

describe('requireOnlyAdmin middleware', () => {
  it('passes through when userRole is admin', () => {
    const result = invokeMiddleware('admin');
    expect(result).toBeUndefined();
  });

  it('rejects operador with 403 and dedicated error code', () => {
    const result = invokeMiddleware('operador');
    expect(result).toBeInstanceOf(AppError);
    const err = result as AppError;
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('forbidden_operador_cant_access');
  });

  it('rejects missing role with 403', () => {
    const result = invokeMiddleware(undefined);
    expect(result).toBeInstanceOf(AppError);
    expect((result as AppError).statusCode).toBe(403);
  });

  it('rejects any non-admin role with 403', () => {
    const result = invokeMiddleware('repartidor');
    expect(result).toBeInstanceOf(AppError);
    expect((result as AppError).statusCode).toBe(403);
  });
});

describe('Admin-only route gate (integration)', () => {
  it('allows ADMIN_API_TOKEN on GET /api/admin/tarifas', async () => {
    const res = await request.get('/api/admin/tarifas').set(adminHeaders());
    expect(res.status).toBe(200);
  });

  it('allows ADMIN_API_TOKEN on GET /api/admin/clientes', async () => {
    const res = await request.get('/api/admin/clientes').set(adminHeaders());
    expect(res.status).toBe(200);
  });

  it('rejects unauthenticated request on /api/admin/tarifas with 401', async () => {
    const res = await request.get('/api/admin/tarifas');
    expect(res.status).toBe(401);
  });

  it('rejects unauthenticated request on /api/admin/clientes with 401', async () => {
    const res = await request.get('/api/admin/clientes');
    expect(res.status).toBe(401);
  });
});
