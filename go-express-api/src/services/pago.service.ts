import { supabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import { AppError } from '../middleware/errorHandler.js';
import { todayPY } from '../lib/datetime.js';
import type {
  PagoRow,
  Pago,
  PaginatedResponse,
} from '../types/index.js';
import type { CreatePagoInput, UpdatePagoInput, PagoQuery } from '../lib/validators/pago.schema.js';
import { escapeLikePattern } from '../lib/validators/common.schema.js';

function toApi(row: PagoRow): Pago {
  return {
    id: row.id,
    envioId: row.envio_id,
    montoTotal: row.monto_total,
    montoRecibido: row.monto_recibido,
    metodoPago: row.metodo_pago,
    estadoPago: row.estado_pago,
    fechaPago: row.fecha_pago,
    referencia: row.referencia,
    notas: row.notas,
    creadoPor: row.creado_por,
    creadoEn: row.created_at,
    updatedAt: row.updated_at,
  };
}

const PAGO_COLUMNS = 'id, envio_id, monto_total, monto_recibido, metodo_pago, estado_pago, fecha_pago, referencia, notas, creado_por, created_at, updated_at';

const ADMIN_USER_NAME = 'Admin GoExpress';

interface PgError {
  code?: string;
  message?: string;
}

function isPgError(err: unknown): err is PgError {
  return typeof err === 'object' && err !== null && ('code' in err || 'message' in err);
}

function mapRpcError(err: unknown, context: { envioId?: string; pagoId?: string }): AppError {
  if (!isPgError(err)) {
    logger.error({ err, context }, 'Unknown error from pago RPC');
    return new AppError('Error en operacion de pago', 500, 'DB_ERROR');
  }

  if (err.code === '23505') {
    return AppError.conflict('Ya existe un pago para este envio');
  }

  const msg = err.message ?? '';

  if (msg.includes('pago_no_encontrado')) {
    return AppError.notFound('Pago', context.pagoId);
  }

  if (msg.includes('pago_monto_recibido_invalido')) {
    return AppError.badRequest('El monto recibido no puede exceder el monto total');
  }

  logger.error({ err, context }, 'Error en RPC de pago');
  return new AppError('Error en operacion de pago', 500, 'DB_ERROR');
}

class PagoService {
  async list(query: PagoQuery): Promise<PaginatedResponse<Pago & { trackingNumber?: string; clienteNombre?: string; costoEnvio?: number }>> {
    const { limit, page = 1, search, estadoPago, metodoPago } = query;
    const offset = (page - 1) * limit;

    if (search) {
      const { data: matchingEnvios } = await supabase
        .from('envios')
        .select('id')
        .ilike('tracking_number', `%${escapeLikePattern(search)}%`)
        .limit(50);

      if (!matchingEnvios || matchingEnvios.length === 0) {
        return {
          data: [],
          pagination: { total: 0, page: 1, limit, totalPages: 0, hasMore: false, nextCursor: null },
        };
      }

      const PAGO_WITH_ENVIO = `${PAGO_COLUMNS}, envios!inner(tracking_number, cliente_nombre, costo)`;
      let q = supabase.from('pagos').select(PAGO_WITH_ENVIO, { count: 'exact' });

      q = q.in('envio_id', matchingEnvios.map((e: { id: string }) => e.id));
      if (estadoPago) q = q.eq('estado_pago', estadoPago);
      if (metodoPago) q = q.eq('metodo_pago', metodoPago);

      q = q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

      const { data, count, error } = await q;

      if (error) {
        throw new AppError('Error fetching pagos', 500, 'DB_ERROR');
      }

      const rows = (data ?? []) as unknown as (PagoRow & { envios?: { tracking_number: string; cliente_nombre: string; costo: number } })[];

      return {
        data: rows.map((row) => {
          const base = toApi(row);
          if (row.envios) {
            return {
              ...base,
              trackingNumber: row.envios.tracking_number,
              clienteNombre: row.envios.cliente_nombre,
              costoEnvio: row.envios.costo,
            };
          }
          return base;
        }),
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

    const PAGO_WITH_ENVIO = `${PAGO_COLUMNS}, envios(tracking_number, cliente_nombre, costo)`;
    let q = supabase.from('pagos').select(PAGO_WITH_ENVIO, { count: 'exact' });

    if (estadoPago) q = q.eq('estado_pago', estadoPago);
    if (metodoPago) q = q.eq('metodo_pago', metodoPago);

    q = q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, count, error } = await q;

    if (error) {
      throw new AppError('Error fetching pagos', 500, 'DB_ERROR');
    }

    const rows = (data ?? []) as unknown as (PagoRow & { envios?: { tracking_number: string; cliente_nombre: string; costo: number } })[];

    return {
      data: rows.map((row) => {
        const base = toApi(row);
        if (row.envios) {
          return {
            ...base,
            trackingNumber: row.envios.tracking_number,
            clienteNombre: row.envios.cliente_nombre,
            costoEnvio: row.envios.costo,
          };
        }
        return base;
      }),
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

  async create(
    input: CreatePagoInput,
    userId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<Pago> {
    if (input.montoRecibido > input.montoTotal) {
      throw AppError.badRequest('El monto recibido no puede exceder el monto total');
    }

    const { data: envioData } = await supabase
      .from('envios')
      .select('tracking_number, eliminado')
      .eq('id', input.envioId)
      .single();

    if (!envioData) {
      throw AppError.notFound('Envio', input.envioId);
    }

    const envio = envioData as { tracking_number: string; eliminado: boolean };

    if (envio.eliminado) {
      throw AppError.badRequest('No se puede crear un pago para un envio eliminado');
    }

    const { data, error } = await supabase.rpc('create_pago_atomico', {
      p_envio_id: input.envioId,
      p_monto_total: input.montoTotal,
      p_monto_recibido: input.montoRecibido,
      p_metodo_pago: input.metodoPago,
      p_fecha_pago: input.fechaPago ?? todayPY(),
      p_referencia: input.referencia ?? null,
      p_notas: input.notas ?? null,
      p_creado_por: userId,
      p_usuario_nombre: ADMIN_USER_NAME,
      p_tracking_number: envio.tracking_number,
      p_ip: ipAddress ?? null,
      p_user_agent: userAgent ?? null,
    });

    if (error) {
      throw mapRpcError(error, { envioId: input.envioId });
    }

    if (!data) {
      throw new AppError('Error creating pago', 500, 'DB_ERROR');
    }

    const row = Array.isArray(data) ? (data[0] as PagoRow | undefined) : (data as PagoRow);

    if (!row) {
      throw new AppError('Error creating pago', 500, 'DB_ERROR');
    }

    return toApi(row);
  }

  async update(
    id: string,
    input: UpdatePagoInput,
    userId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<Pago> {
    const { data, error } = await supabase.rpc('update_pago_atomico', {
      p_pago_id: id,
      p_monto_recibido: input.montoRecibido,
      p_metodo_pago: input.metodoPago ?? null,
      p_fecha_pago: input.fechaPago ?? null,
      p_referencia: input.referencia ?? null,
      p_notas: input.notas ?? null,
      p_apply_metodo: input.metodoPago !== undefined,
      p_apply_fecha: input.fechaPago !== undefined,
      p_apply_referencia: input.referencia !== undefined,
      p_apply_notas: input.notas !== undefined,
      p_actualizado_por: userId,
      p_usuario_nombre: ADMIN_USER_NAME,
      p_ip: ipAddress ?? null,
      p_user_agent: userAgent ?? null,
    });

    if (error) {
      throw mapRpcError(error, { pagoId: id });
    }

    if (!data) {
      throw new AppError('Error updating pago', 500, 'DB_ERROR');
    }

    const row = Array.isArray(data) ? (data[0] as PagoRow | undefined) : (data as PagoRow);

    if (!row) {
      throw new AppError('Error updating pago', 500, 'DB_ERROR');
    }

    return toApi(row);
  }

  async getStats(): Promise<{ totalCobrado: number; totalPendiente: number; cobradoHoy: number; enviosPendientesCobro: number }> {
    const today = todayPY();

    const [cobradoResult, pendienteResult, hoyResult, pendientesCobroResult] = await Promise.all([
      supabase
        .from('pagos')
        .select('monto_recibido')
        .eq('estado_pago', 'pagado'),
      supabase
        .from('pagos')
        .select('monto_total, monto_recibido')
        .neq('estado_pago', 'pagado'),
      supabase
        .from('pagos')
        .select('monto_recibido')
        .eq('estado_pago', 'pagado')
        .gte('fecha_pago', today),
      supabase
        .from('pagos')
        .select('id', { count: 'exact', head: true })
        .eq('estado_pago', 'pendiente'),
    ]);

    const totalCobrado = ((cobradoResult.data ?? []) as { monto_recibido: number }[])
      .reduce((sum, p) => sum + p.monto_recibido, 0);

    const totalPendiente = ((pendienteResult.data ?? []) as { monto_total: number; monto_recibido: number }[])
      .reduce((sum, p) => sum + (p.monto_total - p.monto_recibido), 0);

    const cobradoHoy = ((hoyResult.data ?? []) as { monto_recibido: number }[])
      .reduce((sum, p) => sum + p.monto_recibido, 0);

    return { totalCobrado, totalPendiente, cobradoHoy, enviosPendientesCobro: pendientesCobroResult.count ?? 0 };
  }
}

export const pagoService = new PagoService();
