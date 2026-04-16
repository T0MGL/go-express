import type { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler.js';
import { supabase, supabaseAuth } from '../config/database.js';
import { logger } from '../config/logger.js';

declare global {
  namespace Express {
    interface Request {
      repartidorId?: string;
      repartidorNombre?: string;
    }
  }
}

/**
 * Middleware for repartidor portal routes.
 *
 * Validates the Bearer token via Supabase Auth, then resolves the repartidorId
 * from the repartidores table using auth_id. Rejects if the repartidor is
 * inactive or deleted.
 */
export async function requireRepartidor(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next(AppError.unauthorized('Missing or invalid Authorization header'));
    return;
  }

  const token = authHeader.slice(7);

  try {
    const { data: { user }, error } = await supabaseAuth.auth.getUser(token);

    if (error || !user) {
      throw AppError.unauthorized('Invalid or expired token');
    }

    const { data: repartidor, error: repartidorError } = await supabase
      .from('repartidores')
      .select('id, nombre, estado, eliminado')
      .eq('auth_id', user.id)
      .eq('eliminado', false)
      .single();

    if (repartidorError || !repartidor) {
      throw AppError.forbidden('No hay un repartidor vinculado a esta cuenta');
    }

    const row = repartidor as { id: string; nombre: string; estado: string; eliminado: boolean };

    if (row.estado !== 'activo') {
      throw AppError.forbidden('Cuenta de repartidor inactiva');
    }

    req.repartidorId = row.id;
    req.repartidorNombre = row.nombre;
    next();
  } catch (err) {
    if (err instanceof AppError) {
      next(err);
      return;
    }
    logger.error({ err }, 'Unexpected error during repartidor auth');
    next(AppError.unauthorized('Autenticacion fallida'));
  }
}
