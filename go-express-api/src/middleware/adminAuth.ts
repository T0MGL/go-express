import type { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { AppError } from './errorHandler.js';
import { env } from '../config/env.js';
import { supabase, supabaseAuth } from '../config/database.js';
import { logger } from '../config/logger.js';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
      userRole?: string;
      userName?: string;
    }
  }
}

/**
 * Admin authentication middleware.
 *
 * Validates the Bearer token via Supabase Auth, then looks up the user
 * in the usuarios table to get role and name. Falls back to ADMIN_API_TOKEN
 * for external integrations (CI/CD, webhooks).
 */
export async function requireAdmin(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  // No auth header at all
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next(AppError.unauthorized('Missing or invalid Authorization header'));
    return;
  }

  const token = authHeader.slice(7);

  // Check for static ADMIN_API_TOKEN (external integrations, CI/CD)
  // Uses timing-safe comparison to prevent timing attacks on token value.
  if (
    env.ADMIN_API_TOKEN &&
    token.length === env.ADMIN_API_TOKEN.length &&
    timingSafeEqual(Buffer.from(token), Buffer.from(env.ADMIN_API_TOKEN))
  ) {
    req.userId = '00000000-0000-4000-a000-000000000001';
    req.userName = 'Admin GoExpress';
    req.userRole = 'admin';
    req.userEmail = 'admin@goexpress.com.py';
    next();
    return;
  }

  // Validate JWT via Supabase Auth
  try {
    const { data: { user }, error } = await supabaseAuth.auth.getUser(token);

    if (error || !user) {
      logger.warn({ error: error?.message }, 'Supabase auth token validation failed');
      throw AppError.unauthorized('Invalid or expired token');
    }

    // Look up the user in our usuarios table via auth_id
    const { data: dbUser, error: dbError } = await supabase
      .from('usuarios')
      .select('id, nombre, email, rol, estado')
      .eq('auth_id', user.id)
      .single();

    if (dbError || !dbUser) {
      logger.warn({ authId: user.id }, 'Authenticated user not found in usuarios table');
      throw AppError.forbidden('User account not provisioned. Contact administrator.');
    }

    const userData = dbUser as { id: string; nombre: string; email: string; rol: string; estado: string };

    if (userData.estado !== 'activo') {
      throw AppError.forbidden('User account is inactive');
    }

    if (userData.rol !== 'admin' && userData.rol !== 'operador') {
      throw AppError.forbidden('Insufficient permissions');
    }

    req.userId = userData.id;
    req.userName = userData.nombre;
    req.userRole = userData.rol;
    req.userEmail = userData.email;

    next();
  } catch (err) {
    if (err instanceof AppError) {
      next(err);
      return;
    }
    logger.error({ err }, 'Unexpected error during admin auth');
    next(AppError.unauthorized('Authentication failed'));
  }
}

/**
 * Restricts a route to strictly `rol === 'admin'`. Must be chained after
 * `requireAdmin`, which populates `req.userRole`. Operadores authenticate
 * fine via `requireAdmin` but are rejected here with a dedicated error code
 * so the client can distinguish from a generic 403.
 */
export function requireOnlyAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (req.userRole === 'admin') {
    next();
    return;
  }

  logger.warn(
    { userId: req.userId, userRole: req.userRole, path: req.path, method: req.method },
    'Operador attempted to access admin-only resource'
  );

  next(
    new AppError(
      'Only administrators can access this resource',
      403,
      'forbidden_operador_cant_access'
    )
  );
}
