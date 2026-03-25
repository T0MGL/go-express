import { supabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import { AppError } from '../middleware/errorHandler.js';
import type {
  AuditoriaAccion,
  AuditoriaEntidad,
  AuditoriaLogRow,
  AuditoriaLog,
  PaginatedResponse,
} from '../types/index.js';
import type { AuditoriaQuery } from '../lib/validators/auditoria.schema.js';
import { escapeLikePattern } from '../lib/validators/common.schema.js';


function toApi(row: AuditoriaLogRow): AuditoriaLog {
  return {
    id: row.id,
    usuario: row.usuario,
    usuarioId: row.usuario_id,
    accion: row.accion,
    entidad: row.entidad,
    entidadId: row.entidad_id,
    descripcion: row.descripcion,
    valorAnterior: row.valor_anterior,
    valorNuevo: row.valor_nuevo,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    creadoEn: row.created_at,
  };
}

// Append-only audit log

class AuditoriaService {
  /**
   * Append an audit log entry. NEVER updates or deletes.
   */
  async log(params: {
    usuario: string;
    usuarioId: string;
    accion: AuditoriaAccion;
    entidad: AuditoriaEntidad;
    entidadId: string;
    descripcion: string;
    valorAnterior?: Record<string, unknown> | null;
    valorNuevo?: Record<string, unknown> | null;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    const { error } = await supabase.from('auditoria_log').insert({
      usuario: params.usuario,
      usuario_id: params.usuarioId,
      accion: params.accion,
      entidad: params.entidad,
      entidad_id: params.entidadId,
      descripcion: params.descripcion,
      valor_anterior: params.valorAnterior ?? null,
      valor_nuevo: params.valorNuevo ?? null,
      ip_address: params.ipAddress ?? null,
      user_agent: params.userAgent ?? null,
    });

    if (error) {
      // Non-critical: never crash the app for audit failures
      logger.error({ error, params }, 'Failed to write audit log');
    }
  }

  /**
   * List audit logs with cursor-based pagination and filters.
   */
  async list(query: AuditoriaQuery): Promise<PaginatedResponse<AuditoriaLog>> {
    const { limit, page = 1, search, usuarioId, accion, entidad, fechaDesde, fechaHasta } = query;
    const offset = (page - 1) * limit;

    const AUDIT_COLUMNS = 'id, usuario, usuario_id, accion, entidad, entidad_id, descripcion, valor_anterior, valor_nuevo, ip_address, user_agent, created_at';
    let q = supabase
      .from('auditoria_log')
      .select(AUDIT_COLUMNS, { count: 'exact' });

    if (usuarioId) q = q.eq('usuario_id', usuarioId);
    if (accion) q = q.eq('accion', accion);
    if (entidad) q = q.eq('entidad', entidad);
    if (fechaDesde) q = q.gte('created_at', `${fechaDesde}T00:00:00`);
    if (fechaHasta) q = q.lte('created_at', `${fechaHasta}T23:59:59`);
    if (search) q = q.ilike('descripcion', `%${escapeLikePattern(search)}%`);

    q = q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, count, error } = await q;

    if (error) {
      throw new AppError('Error fetching audit logs', 500, 'DB_ERROR');
    }

    const rows = (data ?? []) as AuditoriaLogRow[];

    return {
      data: rows.map(toApi),
      pagination: {
        total: count ?? 0,
        page,
        limit,
        totalPages: Math.ceil((count ?? 0) / limit),
        hasMore: offset + limit < (count ?? 0),
        nextCursor: null,
      },
    };
  }
}

export const auditoriaService = new AuditoriaService();
