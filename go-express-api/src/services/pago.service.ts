import { supabase } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { auditoriaService } from './auditoria.service.js';
import type {
  PagoRow,
  Pago,
  EstadoPago,
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

function calcularEstadoPago(montoRecibido: number, montoTotal: number): EstadoPago {
  if (montoRecibido >= montoTotal) return 'pagado';
  if (montoRecibido > 0) return 'pago_parcial';
  return 'pendiente';
}

const PAGO_COLUMNS = 'id, envio_id, monto_total, monto_recibido, metodo_pago, estado_pago, fecha_pago, referencia, notas, creado_por, created_at, updated_at';

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

  async create(input: CreatePagoInput, userId: string): Promise<Pago> {
    const { data: envioData } = await supabase
      .from('envios')
      .select('tracking_number')
      .eq('id', input.envioId)
      .single();

    if (!envioData) {
      throw AppError.notFound('Envio', input.envioId);
    }

    const { data: existing } = await supabase
      .from('pagos')
      .select('id')
      .eq('envio_id', input.envioId)
      .maybeSingle();
    if (existing) {
      throw AppError.conflict('Ya existe un pago para este envio');
    }

    const estadoPago = calcularEstadoPago(input.montoRecibido, input.montoTotal);
    const today = new Date().toISOString().split('T')[0]!;

    const { data, error } = await supabase
      .from('pagos')
      .insert({
        envio_id: input.envioId,
        monto_total: input.montoTotal,
        monto_recibido: input.montoRecibido,
        metodo_pago: input.metodoPago,
        estado_pago: estadoPago,
        fecha_pago: input.fechaPago ?? today,
        referencia: input.referencia ?? null,
        notas: input.notas ?? null,
        creado_por: userId,
      })
      .select()
      .single();

    if (error || !data) {
      throw new AppError('Error creating pago', 500, 'DB_ERROR');
    }

    const pago = toApi(data as PagoRow);

    await auditoriaService.log({
      usuario: 'Admin GoExpress',
      usuarioId: userId,
      accion: 'pago',
      entidad: 'pago',
      entidadId: pago.id,
      descripcion: `Pago creado para envio ${(envioData as { tracking_number: string }).tracking_number}: ${input.montoRecibido}/${input.montoTotal} Gs. (${estadoPago})`,
    });

    return pago;
  }

  async update(id: string, input: UpdatePagoInput, userId?: string): Promise<Pago> {
    const { data: existing } = await supabase
      .from('pagos')
      .select(PAGO_COLUMNS)
      .eq('id', id)
      .single();

    if (!existing) {
      throw AppError.notFound('Pago', id);
    }

    const existingRow = existing as PagoRow;
    const newMontoRecibido = input.montoRecibido;
    const montoTotal = existingRow.monto_total;
    const estadoPago = calcularEstadoPago(newMontoRecibido, montoTotal);

    const updateData: Record<string, unknown> = {
      monto_recibido: newMontoRecibido,
      estado_pago: estadoPago,
    };

    if (input.metodoPago !== undefined) updateData['metodo_pago'] = input.metodoPago;
    if (input.fechaPago !== undefined) updateData['fecha_pago'] = input.fechaPago;
    if (input.referencia !== undefined) {
      updateData['referencia'] = input.referencia ?? null;
    }
    if (input.notas !== undefined) updateData['notas'] = input.notas;

    const { data, error } = await supabase
      .from('pagos')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      throw new AppError('Error updating pago', 500, 'DB_ERROR');
    }

    const pago = toApi(data as PagoRow);

    if (userId) {
      await auditoriaService.log({
        usuario: 'Admin GoExpress',
        usuarioId: userId,
        accion: 'editar',
        entidad: 'pago',
        entidadId: id,
        descripcion: `Pago actualizado: ${pago.montoRecibido}/${pago.montoTotal} Gs. (${pago.estadoPago})`,
      });
    }

    return pago;
  }

  async getStats(): Promise<{ totalCobrado: number; totalPendiente: number; cobradoHoy: number; enviosPendientesCobro: number }> {
    const today = new Date().toISOString().split('T')[0]!;

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
