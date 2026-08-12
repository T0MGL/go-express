import type { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler.js';
import { supabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import { hashApiKey, API_KEY_REGEX } from '../lib/apiKey.js';
import { nowISO } from '../lib/datetime.js';
import type { ApiKeyPermiso, ClienteEstado } from '../types/index.js';

declare global {
  namespace Express {
    interface Request {
      apiKeyId?: string;
      apiKeyNombre?: string;
      apiKeyPrefix?: string;
      apiKeyPermisos?: ApiKeyPermiso[];
    }
  }
}

interface ApiKeyAuthRow {
  id: string;
  cliente_id: string;
  nombre: string;
  key_prefix: string;
  permisos: ApiKeyPermiso[];
  activo: boolean;
  expira_en: string | null;
  clientes: {
    estado: ClienteEstado;
    eliminado: boolean;
  };
}

// Mismo 401 para key inexistente, revocada o expirada: el error no confirma ni niega
// que la key exista. El motivo real queda en el log del server, identificado por prefix.
const INVALID_KEY_ERROR = 'API key invalida';

/**
 * Auth del API Gateway v1 por header X-API-Key. El lookup es por sha256(key) contra el
 * indice unico de key_hash: nunca se compara plaintext ni se recorre la tabla. Adjunta
 * al request la identidad de la key (id, cliente, permisos) y anota last_used_at en
 * fire-and-forget para no sumar latencia al request.
 */
export async function requireApiKey(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers['x-api-key'];
  const key = Array.isArray(header) ? header[0] : header;

  if (!key) {
    next(AppError.unauthorized('API key requerida (header X-API-Key)'));
    return;
  }

  // Formato invalido no toca la DB: nada que no sea ge_live_ + 43 base62 puede existir.
  if (!API_KEY_REGEX.test(key)) {
    next(AppError.unauthorized(INVALID_KEY_ERROR));
    return;
  }

  try {
    const { data, error } = await supabase
      .from('api_keys')
      .select('id, cliente_id, nombre, key_prefix, permisos, activo, expira_en, clientes!inner(estado, eliminado)')
      .eq('key_hash', hashApiKey(key))
      .maybeSingle();

    if (error) {
      logger.error({ error }, 'Error validando API key');
      throw new AppError('Error validando API key', 500, 'DB_ERROR');
    }

    if (!data) {
      next(AppError.unauthorized(INVALID_KEY_ERROR));
      return;
    }

    const row = data as unknown as ApiKeyAuthRow;

    if (!row.activo) {
      logger.warn({ keyPrefix: row.key_prefix }, 'Request con API key revocada');
      next(AppError.unauthorized(INVALID_KEY_ERROR));
      return;
    }

    if (row.expira_en !== null && new Date(row.expira_en).getTime() <= Date.now()) {
      logger.warn({ keyPrefix: row.key_prefix, expiraEn: row.expira_en }, 'Request con API key expirada');
      next(AppError.unauthorized(INVALID_KEY_ERROR));
      return;
    }

    if (row.clientes.eliminado || row.clientes.estado !== 'activo') {
      next(AppError.forbidden('La cuenta del cliente esta inactiva o suspendida'));
      return;
    }

    req.apiKeyId = row.id;
    req.apiKeyNombre = row.nombre;
    req.apiKeyPrefix = row.key_prefix;
    req.apiKeyPermisos = row.permisos;
    req.clienteId = row.cliente_id;

    // Fire-and-forget: si el touch falla el request sigue, last_used_at es telemetria.
    void supabase
      .from('api_keys')
      .update({ last_used_at: nowISO() })
      .eq('id', row.id)
      .then(({ error: touchError }) => {
        if (touchError) {
          logger.warn({ error: touchError, apiKeyId: row.id }, 'No se pudo actualizar last_used_at');
        }
      });

    next();
  } catch (err) {
    if (err instanceof AppError) {
      next(err);
      return;
    }
    // Falla de infra, no de credencial: un 401 aca manda al integrador a rotar keys
    // persiguiendo un bug del server. 500 honesto.
    logger.error({ err }, 'Error inesperado en auth por API key');
    next(new AppError('Error validando API key', 500, 'INTERNAL_ERROR'));
  }
}

/**
 * Guard de permiso por endpoint. Se encadena despues de requireApiKey, que popula
 * req.apiKeyPermisos desde la fila de la key.
 */
export function requirePermiso(permiso: ApiKeyPermiso) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (req.apiKeyPermisos?.includes(permiso)) {
      next();
      return;
    }

    logger.warn(
      { keyPrefix: req.apiKeyPrefix, permiso, path: req.path, method: req.method },
      'API key sin permiso para el endpoint'
    );
    next(AppError.forbidden(`La API key no tiene el permiso '${permiso}'`));
  };
}
