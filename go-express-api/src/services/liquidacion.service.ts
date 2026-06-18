import * as Sentry from '@sentry/node';
import { supabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import { AppError } from '../middleware/errorHandler.js';
import type {
  LiquidacionRepartidorRow,
  LiquidacionEnvioRow,
  LiquidacionRepartidor,
  LiquidacionEnvio,
  PaginatedResponse,
} from '../types/index.js';
import type {
  CrearLiquidacionInput,
  CerrarLiquidacionInput,
  LiquidacionQuery,
  ReabrirLiquidacionInput,
} from '../lib/validators/liquidacion.schema.js';

const LIQUIDACION_COLUMNS = [
  'id',
  'repartidor_id',
  'fecha_desde',
  'fecha_hasta',
  'monto_total_esperado',
  'monto_total_recibido',
  'diferencia',
  'estado',
  'cerrada_por',
  'cerrada_en',
  'notas',
  'creado_por',
  'created_at',
  'updated_at',
].join(', ');

const LIQUIDACION_ENVIO_COLUMNS = [
  'liquidacion_id',
  'envio_id',
  'monto_esperado',
  'monto_cobrado',
  'conciliado',
  'created_at',
].join(', ');

function mapLiquidacionRowToApi(row: LiquidacionRepartidorRow): LiquidacionRepartidor {
  return {
    id: row.id,
    repartidorId: row.repartidor_id,
    fechaDesde: row.fecha_desde,
    fechaHasta: row.fecha_hasta,
    montoTotalEsperado: row.monto_total_esperado,
    montoTotalRecibido: row.monto_total_recibido,
    diferencia: row.diferencia,
    estado: row.estado,
    cerradaPor: row.cerrada_por,
    cerradaEn: row.cerrada_en,
    notas: row.notas,
    creadoPor: row.creado_por,
    creadoEn: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapLiquidacionEnvioRow(
  row: LiquidacionEnvioRow & {
    envios?: {
      tracking_number?: string;
      cliente_nombre?: string;
      destinatario_nombre?: string;
      fecha_entrega_real?: string | null;
    } | null;
  },
): LiquidacionEnvio {
  const envio = row.envios ?? null;
  const base: LiquidacionEnvio = {
    liquidacionId: row.liquidacion_id,
    envioId: row.envio_id,
    montoEsperado: row.monto_esperado,
    montoCobrado: row.monto_cobrado,
    conciliado: row.conciliado,
    creadoEn: row.created_at,
  };
  if (envio) {
    if (envio.tracking_number !== undefined) base.trackingNumber = envio.tracking_number;
    if (envio.cliente_nombre !== undefined) base.clienteNombre = envio.cliente_nombre;
    if (envio.destinatario_nombre !== undefined) base.destinatarioNombre = envio.destinatario_nombre;
    if (envio.fecha_entrega_real !== undefined) base.fechaEntregaReal = envio.fecha_entrega_real;
  }
  return base;
}

interface PgError {
  code?: string;
  message?: string;
}

function isPgError(err: unknown): err is PgError {
  return typeof err === 'object' && err !== null && ('code' in err || 'message' in err);
}

function mapLiquidacionRpcError(err: unknown, context: { liquidacionId?: string; repartidorId?: string }): AppError {
  if (!isPgError(err)) {
    logger.error({ err, context }, 'Unknown error from liquidacion RPC');
    return new AppError('Error en operacion de liquidacion', 500, 'DB_ERROR');
  }

  const msg = err.message ?? '';

  // 23505 = unique_violation. Si salta aca es porque el index parcial
  // liquidacion_envios_unique_conciliado rechazo un envio ya conciliado en otra
  // liquidacion cerrada. Puede ocurrir en una carrera entre dos cierres simultaneos.
  if (err.code === '23505') {
    return AppError.conflict('Uno o mas envios ya pertenecen a otra liquidacion cerrada');
  }

  // 23P01 = exclusion_violation. El EXCLUDE gist sobre el rango del repartidor bloqueo un
  // segundo crear_liquidacion concurrente (doble submit). crear_liquidacion ya lo remapea a
  // liquidacion_rango_solapado, pero si llegara crudo, aca tambien lo tratamos como 409 de
  // negocio y no como 500 (causa raiz H).
  if (err.code === '23P01' || msg.includes('liquidaciones_repartidor_rango_no_solapado')) {
    return AppError.conflict(
      'Ya existe una liquidacion del repartidor cuyo rango solapa con el solicitado',
    );
  }

  if (msg.includes('liquidacion_rango_solapado')) {
    return AppError.conflict(
      'Ya existe una liquidacion del repartidor cuyo rango solapa con el solicitado',
    );
  }

  if (msg.includes('liquidacion_no_encontrada')) {
    return AppError.notFound('Liquidacion', context.liquidacionId);
  }

  if (msg.includes('liquidacion_ya_cerrada')) {
    return AppError.conflict('La liquidacion ya esta cerrada');
  }

  if (msg.includes('liquidacion_no_cerrada')) {
    return AppError.conflict('La liquidacion ya esta pendiente, no hay nada que reabrir');
  }

  if (msg.includes('motivo_insuficiente')) {
    return AppError.badRequest('El motivo debe tener al menos 10 caracteres');
  }

  if (msg.includes('repartidor_no_encontrado')) {
    return AppError.notFound('Repartidor', context.repartidorId);
  }

  if (msg.includes('rango_invalido')) {
    return AppError.badRequest('El rango de fechas es invalido');
  }

  if (msg.includes('monto_invalido')) {
    return AppError.badRequest('El monto recibido debe ser mayor o igual a cero');
  }

  if (msg.includes('notas_requeridas')) {
    return AppError.unprocessable(
      'Cerrar con diferencia requiere notas de al menos 10 caracteres',
      'notas_requeridas',
    );
  }

  logger.error({ err, context }, 'Error en RPC de liquidacion');
  return new AppError('Error en operacion de liquidacion', 500, 'DB_ERROR');
}

const ADMIN_USER_NAME = 'Admin GoExpress';

class LiquidacionService {
  async crear(
    input: CrearLiquidacionInput,
    creadoPor: string,
    usuarioNombre: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<LiquidacionRepartidor> {
    const { data, error } = await supabase.rpc('crear_liquidacion', {
      p_repartidor_id: input.repartidorId,
      p_fecha_desde: input.fechaDesde,
      p_fecha_hasta: input.fechaHasta,
      p_creado_por: creadoPor,
      p_usuario_nombre: usuarioNombre,
      p_ip: ipAddress ?? null,
      p_user_agent: userAgent ?? null,
    });

    if (error) {
      throw mapLiquidacionRpcError(error, { repartidorId: input.repartidorId });
    }

    const row = Array.isArray(data) ? (data[0] as LiquidacionRepartidorRow | undefined) : (data as LiquidacionRepartidorRow | null);
    if (!row) {
      throw new AppError('Error creando liquidacion', 500, 'DB_ERROR');
    }

    return mapLiquidacionRowToApi(row);
  }

  async cerrar(
    id: string,
    input: CerrarLiquidacionInput,
    cerradoPor: string,
    usuarioNombre: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<LiquidacionRepartidor> {
    const notas = input.notas && input.notas.length > 0 ? input.notas : null;

    const { data, error } = await supabase.rpc('cerrar_liquidacion', {
      p_liquidacion_id: id,
      p_monto_recibido: input.montoRecibido,
      p_notas: notas,
      p_cerrado_por: cerradoPor,
      p_usuario_nombre: usuarioNombre,
      p_ip: ipAddress ?? null,
      p_user_agent: userAgent ?? null,
    });

    if (error) {
      throw mapLiquidacionRpcError(error, { liquidacionId: id });
    }

    const row = Array.isArray(data) ? (data[0] as LiquidacionRepartidorRow | undefined) : (data as LiquidacionRepartidorRow | null);
    if (!row) {
      throw new AppError('Error cerrando liquidacion', 500, 'DB_ERROR');
    }

    const liquidacion = mapLiquidacionRowToApi(row);

    if (liquidacion.estado === 'con_diferencia') {
      // Alerta forensica a Sentry cuando la caja no cuadra. No es error tecnico,
      // es senal de negocio para que finanzas revise.
      Sentry.captureMessage('liquidacion_cerrada_con_diferencia', {
        level: 'warning',
        extra: {
          liquidacionId: liquidacion.id,
          repartidorId: liquidacion.repartidorId,
          montoEsperado: liquidacion.montoTotalEsperado,
          montoRecibido: liquidacion.montoTotalRecibido,
          diferencia: liquidacion.diferencia,
        },
      });
    }

    return liquidacion;
  }

  async reabrir(
    id: string,
    input: ReabrirLiquidacionInput,
    actorId: string,
    usuarioNombre: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<LiquidacionRepartidor> {
    const { data, error } = await supabase.rpc('reabrir_liquidacion', {
      p_liquidacion_id: id,
      p_motivo: input.motivo,
      p_actor: actorId,
      p_usuario_nombre: usuarioNombre,
      p_ip: ipAddress ?? null,
      p_user_agent: userAgent ?? null,
    });

    if (error) {
      throw mapLiquidacionRpcError(error, { liquidacionId: id });
    }

    const row = Array.isArray(data) ? (data[0] as LiquidacionRepartidorRow | undefined) : (data as LiquidacionRepartidorRow | null);
    if (!row) {
      throw new AppError('Error reabriendo liquidacion', 500, 'DB_ERROR');
    }

    return mapLiquidacionRowToApi(row);
  }

  async list(query: LiquidacionQuery): Promise<PaginatedResponse<LiquidacionRepartidor>> {
    const { limit, page = 1, repartidorId, estado, fechaDesde, fechaHasta } = query;
    const offset = (page - 1) * limit;

    const WITH_REPARTIDOR = `${LIQUIDACION_COLUMNS}, repartidores!inner(nombre)`;

    let q = supabase
      .from('liquidaciones_repartidor')
      .select(WITH_REPARTIDOR, { count: 'exact' });

    if (repartidorId) q = q.eq('repartidor_id', repartidorId);
    if (estado) q = q.eq('estado', estado);
    if (fechaDesde) q = q.gte('fecha_desde', fechaDesde);
    if (fechaHasta) q = q.lte('fecha_hasta', fechaHasta);

    q = q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, count, error } = await q;

    if (error) {
      logger.error({ err: error }, 'Error fetching liquidaciones');
      throw new AppError('Error fetching liquidaciones', 500, 'DB_ERROR');
    }

    const rows = (data ?? []) as unknown as (LiquidacionRepartidorRow & { repartidores?: { nombre: string } | null })[];

    if (rows.length === 0) {
      return {
        data: [],
        pagination: {
          total: count ?? 0,
          page,
          limit,
          totalPages: Math.ceil((count ?? 0) / limit),
          hasMore: false,
          nextCursor: null,
        },
      };
    }

    const liquidacionIds = rows.map((r) => r.id);
    const { data: envioCountsData, error: countsError } = await supabase
      .from('liquidacion_envios')
      .select('liquidacion_id')
      .in('liquidacion_id', liquidacionIds);

    if (countsError) {
      logger.error({ err: countsError }, 'Error fetching liquidacion_envios counts');
    }

    const countMap = new Map<string, number>();
    for (const row of (envioCountsData ?? []) as { liquidacion_id: string }[]) {
      countMap.set(row.liquidacion_id, (countMap.get(row.liquidacion_id) ?? 0) + 1);
    }

    const liquidaciones = rows.map((row) => {
      const api = mapLiquidacionRowToApi(row);
      if (row.repartidores?.nombre) {
        api.repartidorNombre = row.repartidores.nombre;
      }
      api.cantidadEnvios = countMap.get(row.id) ?? 0;
      return api;
    });

    return {
      data: liquidaciones,
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

  async getById(id: string): Promise<LiquidacionRepartidor & { envios: LiquidacionEnvio[] }> {
    const WITH_REPARTIDOR = `${LIQUIDACION_COLUMNS}, repartidores!inner(nombre)`;

    const [headResult, enviosResult] = await Promise.all([
      supabase
        .from('liquidaciones_repartidor')
        .select(WITH_REPARTIDOR)
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('liquidacion_envios')
        .select(
          `${LIQUIDACION_ENVIO_COLUMNS}, envios(tracking_number, cliente_nombre, destinatario_nombre, fecha_entrega_real)`,
        )
        .eq('liquidacion_id', id)
        .order('created_at', { ascending: true }),
    ]);

    if (headResult.error) {
      logger.error({ err: headResult.error, id }, 'Error fetching liquidacion');
      throw new AppError('Error fetching liquidacion', 500, 'DB_ERROR');
    }

    if (!headResult.data) {
      throw AppError.notFound('Liquidacion', id);
    }

    const headRow = headResult.data as unknown as LiquidacionRepartidorRow & { repartidores?: { nombre: string } | null };
    const liquidacion = mapLiquidacionRowToApi(headRow);
    if (headRow.repartidores?.nombre) {
      liquidacion.repartidorNombre = headRow.repartidores.nombre;
    }

    if (enviosResult.error) {
      logger.error({ err: enviosResult.error, id }, 'Error fetching liquidacion_envios');
      throw new AppError('Error fetching liquidacion envios', 500, 'DB_ERROR');
    }

    const envioRows = (enviosResult.data ?? []) as unknown as (LiquidacionEnvioRow & {
      envios?: {
        tracking_number?: string;
        cliente_nombre?: string;
        destinatario_nombre?: string;
        fecha_entrega_real?: string | null;
      } | null;
    })[];

    const envios = envioRows.map(mapLiquidacionEnvioRow);

    return {
      ...liquidacion,
      cantidadEnvios: envios.length,
      envios,
    };
  }

  async listByRepartidor(
    repartidorId: string,
    query: Omit<LiquidacionQuery, 'repartidorId'>,
  ): Promise<PaginatedResponse<LiquidacionRepartidor>> {
    return this.list({ ...query, repartidorId });
  }
}

export const liquidacionService = new LiquidacionService();
