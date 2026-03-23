import { supabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import { AppError } from '../middleware/errorHandler.js';
import { auditoriaService } from './auditoria.service.js';
import type {
  InventarioAlmacenRow,
  PickingItemRow,
  InventarioAlmacen,
  PickingItem,
  PaginatedResponse,
} from '../types/index.js';
import type { IngresoInput, InventarioQuery } from '../lib/validators/warehouse.schema.js';
import { escapeLikePattern } from '../lib/validators/common.schema.js';

// ---------------------------------------------------------------------------
// Row → API mapping
// ---------------------------------------------------------------------------

function toInventarioApi(row: InventarioAlmacenRow): InventarioAlmacen {
  return {
    id: row.id,
    envioId: row.envio_id,
    trackingNumber: row.tracking_number,
    clienteNombre: row.cliente_nombre,
    ubicacion: row.ubicacion,
    zona: row.zona,
    estante: row.estante,
    estadoAlmacen: row.estado_almacen,
    fechaIngreso: row.fecha_ingreso,
    fechaSalida: row.fecha_salida,
    peso: row.peso,
    dimensiones: {
      largo: row.dimensiones_largo,
      ancho: row.dimensiones_ancho,
      alto: row.dimensiones_alto,
    },
    volumen: row.volumen,
    notas: row.notas,
    prioridad: row.prioridad,
    creadoEn: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toPickingApi(row: PickingItemRow): PickingItem {
  return {
    id: row.id,
    envioId: row.envio_id,
    trackingNumber: row.tracking_number,
    clienteNombre: row.cliente_nombre,
    ubicacion: row.ubicacion,
    destino: row.destino,
    peso: row.peso,
    prioridad: row.prioridad,
    pickeado: row.pickeado,
    empaquetado: row.empaquetado,
    creadoEn: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// WarehouseService
// ---------------------------------------------------------------------------

const INVENTARIO_COLUMNS = [
  'id', 'envio_id', 'tracking_number', 'cliente_nombre',
  'ubicacion', 'zona', 'estante', 'estado_almacen',
  'fecha_ingreso', 'fecha_salida',
  'peso', 'dimensiones_largo', 'dimensiones_ancho', 'dimensiones_alto', 'volumen',
  'notas', 'prioridad', 'created_at', 'updated_at',
].join(', ');

const PICKING_COLUMNS = [
  'id', 'envio_id', 'tracking_number', 'cliente_nombre',
  'ubicacion', 'destino', 'peso', 'prioridad',
  'pickeado', 'empaquetado', 'created_at', 'updated_at',
].join(', ');

class WarehouseService {
  async listInventario(query: InventarioQuery): Promise<PaginatedResponse<InventarioAlmacen>> {
    const { limit, page = 1, search, estadoAlmacen, zona, prioridad } = query;
    const offset = (page - 1) * limit;

    let q = supabase.from('inventario_almacen').select(INVENTARIO_COLUMNS, { count: 'exact' });

    if (estadoAlmacen) q = q.eq('estado_almacen', estadoAlmacen);
    if (zona) q = q.eq('zona', zona);
    if (prioridad) q = q.eq('prioridad', prioridad);
    if (search) {
      const s = escapeLikePattern(search);
      q = q.or(`tracking_number.ilike.%${s}%,cliente_nombre.ilike.%${s}%`);
    }

    q = q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, count, error } = await q;

    if (error) {
      throw new AppError('Error fetching inventario', 500, 'DB_ERROR');
    }

    const rows = (data ?? []) as unknown as InventarioAlmacenRow[];

    return {
      data: rows.map(toInventarioApi),
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

  async ingreso(input: IngresoInput, userId: string, usuarioNombre: string): Promise<InventarioAlmacen> {
    const volumen =
      input.dimensiones
        ? (input.dimensiones.largo * input.dimensiones.ancho * input.dimensiones.alto) / 1000000
        : null;

    const { data, error } = await supabase
      .from('inventario_almacen')
      .insert({
        envio_id: input.envioId ?? null,
        tracking_number: input.trackingNumber,
        cliente_nombre: input.clienteNombre,
        ubicacion: input.ubicacion,
        zona: input.zona,
        estante: input.estante ?? '',
        estado_almacen: 'recibido' as const,
        fecha_ingreso: new Date().toISOString(),
        peso: input.peso,
        dimensiones_largo: input.dimensiones?.largo ?? null,
        dimensiones_ancho: input.dimensiones?.ancho ?? null,
        dimensiones_alto: input.dimensiones?.alto ?? null,
        volumen,
        notas: input.notas ?? null,
        prioridad: input.prioridad,
      })
      .select()
      .single();

    if (error || !data) {
      throw new AppError('Error creating inventario entry', 500, 'DB_ERROR');
    }

    const item = toInventarioApi(data as unknown as InventarioAlmacenRow);

    // Create movement record
    await supabase.from('movimientos_almacen').insert({
      paquete_id: item.id,
      tracking_number: input.trackingNumber,
      tipo: 'entrada',
      ubicacion_destino: input.ubicacion,
      usuario: usuarioNombre,
      usuario_id: userId,
      notas: input.notas ?? null,
    });

    await auditoriaService.log({
      usuario: usuarioNombre,
      usuarioId: userId,
      accion: 'crear',
      entidad: 'almacen',
      entidadId: item.id,
      descripcion: `Ingreso al almacén: ${input.trackingNumber} en ${input.ubicacion}`,
    });

    return item;
  }

  async despacho(
    paqueteId: string,
    userId: string,
    usuarioNombre: string,
    notas?: string
  ): Promise<InventarioAlmacen> {
    const { data: existing } = await supabase
      .from('inventario_almacen')
      .select(INVENTARIO_COLUMNS)
      .eq('id', paqueteId)
      .single();

    if (!existing) {
      throw AppError.notFound('Paquete', paqueteId);
    }

    const row = existing as unknown as InventarioAlmacenRow;
    if (row.estado_almacen === 'despachado') {
      throw AppError.badRequest('Package is already dispatched');
    }

    const { data, error } = await supabase
      .from('inventario_almacen')
      .update({
        estado_almacen: 'despachado',
        fecha_salida: new Date().toISOString(),
      })
      .eq('id', paqueteId)
      .select()
      .single();

    if (error || !data) {
      throw new AppError('Error dispatching paquete', 500, 'DB_ERROR');
    }

    // Create movement record
    await supabase.from('movimientos_almacen').insert({
      paquete_id: paqueteId,
      tracking_number: row.tracking_number,
      tipo: 'salida',
      ubicacion_origen: row.ubicacion,
      usuario: usuarioNombre,
      usuario_id: userId,
      notas: notas ?? null,
    });

    await auditoriaService.log({
      usuario: usuarioNombre,
      usuarioId: userId,
      accion: 'cambio_estado',
      entidad: 'almacen',
      entidadId: paqueteId,
      descripcion: `Despacho: ${row.tracking_number} desde ${row.ubicacion}`,
    });

    return toInventarioApi(data as unknown as InventarioAlmacenRow);
  }

  async devolucion(
    paqueteId: string,
    ubicacionDestino: string,
    userId: string,
    usuarioNombre: string,
    notas?: string
  ): Promise<InventarioAlmacen> {
    const { data: existing } = await supabase
      .from('inventario_almacen')
      .select(INVENTARIO_COLUMNS)
      .eq('id', paqueteId)
      .single();

    if (!existing) {
      throw AppError.notFound('Paquete', paqueteId);
    }

    const row = existing as unknown as InventarioAlmacenRow;

    const { data, error } = await supabase
      .from('inventario_almacen')
      .update({
        estado_almacen: 'devuelto',
        ubicacion: ubicacionDestino,
      })
      .eq('id', paqueteId)
      .select()
      .single();

    if (error || !data) {
      throw new AppError('Error returning paquete', 500, 'DB_ERROR');
    }

    // Create movement record
    await supabase.from('movimientos_almacen').insert({
      paquete_id: paqueteId,
      tracking_number: row.tracking_number,
      tipo: 'devolucion',
      ubicacion_origen: row.ubicacion,
      ubicacion_destino: ubicacionDestino,
      usuario: usuarioNombre,
      usuario_id: userId,
      notas: notas ?? null,
    });

    await auditoriaService.log({
      usuario: usuarioNombre,
      usuarioId: userId,
      accion: 'cambio_estado',
      entidad: 'almacen',
      entidadId: paqueteId,
      descripcion: `Devolución: ${row.tracking_number} a ${ubicacionDestino}`,
    });

    return toInventarioApi(data as unknown as InventarioAlmacenRow);
  }

  async listPicking(): Promise<PickingItem[]> {
    const { data, error } = await supabase
      .from('picking_items')
      .select(PICKING_COLUMNS)
      .eq('empaquetado', false)
      .order('prioridad', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      throw new AppError('Error fetching picking list', 500, 'DB_ERROR');
    }

    return ((data ?? []) as unknown as PickingItemRow[]).map(toPickingApi);
  }

  async updatePicking(
    id: string,
    updateData: { pickeado?: boolean; empaquetado?: boolean },
    userId?: string,
    usuarioNombre?: string
  ): Promise<PickingItem> {
    const dbUpdate: Record<string, unknown> = {};
    if (updateData.pickeado !== undefined) dbUpdate['pickeado'] = updateData.pickeado;
    if (updateData.empaquetado !== undefined) dbUpdate['empaquetado'] = updateData.empaquetado;

    const { data, error } = await supabase
      .from('picking_items')
      .update(dbUpdate)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error({ error }, 'Error updating picking item');
      throw new AppError('Error updating picking item', 500, 'DB_ERROR');
    }
    if (!data) {
      throw AppError.notFound('PickingItem', id);
    }

    const item = toPickingApi(data as unknown as PickingItemRow);

    if (userId) {
      await auditoriaService.log({
        usuario: usuarioNombre ?? 'Admin GoExpress',
        usuarioId: userId,
        accion: 'editar',
        entidad: 'almacen',
        entidadId: id,
        descripcion: `Picking actualizado: ${item.trackingNumber} (pickeado=${item.pickeado}, empaquetado=${item.empaquetado})`,
      });
    }

    return item;
  }

  async getStats(): Promise<{
    totalAlmacen: number;
    recibidosHoy: number;
    despachadosHoy: number;
    pendientesPicking: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    const [totalResult, recibidosResult, despachadosResult, pickingResult] = await Promise.all([
      supabase
        .from('inventario_almacen')
        .select('id', { count: 'exact', head: true })
        .in('estado_almacen', ['recibido', 'en_almacen', 'listo_despacho']),
      supabase
        .from('inventario_almacen')
        .select('id', { count: 'exact', head: true })
        .gte('fecha_ingreso', todayISO),
      supabase
        .from('inventario_almacen')
        .select('id', { count: 'exact', head: true })
        .eq('estado_almacen', 'despachado')
        .gte('fecha_salida', todayISO),
      supabase
        .from('picking_items')
        .select('id', { count: 'exact', head: true })
        .eq('empaquetado', false),
    ]);

    return {
      totalAlmacen: totalResult.count ?? 0,
      recibidosHoy: recibidosResult.count ?? 0,
      despachadosHoy: despachadosResult.count ?? 0,
      pendientesPicking: pickingResult.count ?? 0,
    };
  }
}

export const warehouseService = new WarehouseService();
