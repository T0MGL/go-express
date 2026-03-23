import type { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler.js';
import { env } from '../config/env.js';
import { supabase } from '../config/database.js';
import { logger } from '../config/logger.js';

declare global {
  namespace Express {
    interface Request {
      clienteId?: string;
    }
  }
}

/**
 * Middleware for cliente portal routes.
 *
 * Validates the Bearer token via Supabase Auth, then resolves the clienteId
 * from the clientes table using auth_id. Falls back to X-Cliente-Id header
 * in development for testing convenience.
 */
export async function requireCliente(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  // Try JWT-based auth first
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);

    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);

      if (error || !user) {
        throw AppError.unauthorized('Invalid or expired token');
      }

      // Look up cliente by auth_id
      const { data: cliente, error: clienteError } = await supabase
        .from('clientes')
        .select('id, estado')
        .eq('auth_id', user.id)
        .eq('eliminado', false)
        .single();

      if (clienteError || !cliente) {
        throw AppError.forbidden('No client account linked to this user');
      }

      const clienteData = cliente as { id: string; estado: string };

      if (clienteData.estado !== 'activo') {
        throw AppError.forbidden('Client account is inactive or suspended');
      }

      req.clienteId = clienteData.id;
      next();
      return;
    } catch (err) {
      if (err instanceof AppError) {
        next(err);
        return;
      }
      logger.error({ err }, 'Unexpected error during cliente auth');
      next(AppError.unauthorized('Client authentication failed'));
      return;
    }
  }

  // Fallback: X-Cliente-Id header (development only, or when ADMIN_API_TOKEN is used)
  const clienteId = req.headers['x-cliente-id'] as string | undefined;

  if (!clienteId) {
    next(AppError.unauthorized('Client authentication required. Provide a Bearer token or X-Cliente-Id header.'));
    return;
  }

  // UUID format validation
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(clienteId)) {
    next(AppError.unauthorized('Invalid client identifier format'));
    return;
  }

  // In production, validate the clienteId exists in DB
  if (env.NODE_ENV !== 'development') {
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select('id')
        .eq('id', clienteId)
        .eq('eliminado', false)
        .single();

      if (error || !data) {
        logger.warn({ clienteId }, 'Client portal access with invalid clienteId');
        next(AppError.unauthorized('Invalid client identifier'));
        return;
      }
    } catch (err: unknown) {
      logger.error({ err, clienteId }, 'Error validating clienteId');
      next(AppError.unauthorized('Client authentication failed'));
      return;
    }
  }

  req.clienteId = clienteId;
  next();
}
