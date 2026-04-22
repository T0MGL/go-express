import { supabase } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../config/logger.js';
import { auditoriaService } from './auditoria.service.js';
import { sseService } from './sse.service.js';
import { nowISO } from '../lib/datetime.js';
import type {
  TarifaRow,
  Tarifa,
  PaginatedResponse,
  CiudadRow,
} from '../types/index.js';
import type { CreateTarifaInput, UpdateTarifaInput, TarifaQuery } from '../lib/validators/tarifa.schema.js';
import { escapeLikePattern } from '../lib/validators/common.schema.js';

function toApi(row: TarifaRow): Tarifa {
  return {
    id: row.id,
    origen: row.origen,
    destino: row.destino,
    origenCiudadId: row.origen_ciudad_id,
    destinoCiudadId: row.destino_ciudad_id,
    tipoServicio: row.tipo_servicio,
    precioBase: row.precio_base,
    pesoBase: row.peso_base,
    precioPorKgExtra: row.precio_por_kg_extra,
    factorDimensional: row.factor_dimensional,
    activo: row.activo,
    creadoPor: row.creado_por,
    eliminado: row.eliminado,
    eliminadoPor: row.eliminado_por,
    eliminadoEn: row.eliminado_en,
    motivoEliminacion: row.motivo_eliminacion,
    creadoEn: row.created_at,
    updatedAt: row.updated_at,
  };
}

const TARIFA_COLUMNS = [
  'id', 'origen', 'destino', 'origen_ciudad_id', 'destino_ciudad_id',
  'tipo_servicio', 'precio_base', 'peso_base', 'precio_por_kg_extra', 'factor_dimensional',
  'activo', 'creado_por',
  'eliminado', 'eliminado_por', 'eliminado_en', 'motivo_eliminacion',
  'created_at', 'updated_at',
].join(', ');

/**
 * Resuelve ciudadId y nombre canonico a partir del input del cliente. Si viene
 * ciudadId, lo usamos (fuente de verdad). Si solo viene nombre, no creamos
 * ciudades nuevas: el nombre se persiste tal cual en la columna text legacy y
 * ciudadId queda NULL. Esto solo aplica a tarifas que vengan del cotizador viejo;
 * todas las creadas desde el nuevo UI de Tarifas traen ciudadId siempre.
 */
async function resolveCiudad(
  ciudadId: string | undefined,
  nombreFallback: string | undefined,
): Promise<{ id: string | null; nombre: string }> {
  if (ciudadId) {
    const { data, error } = await supabase
      .from('ciudades')
      .select('id, nombre')
      .eq('id', ciudadId)
      .single();

    if (error || !data) {
      throw AppError.badRequest(`Ciudad no encontrada: ${ciudadId}`);
    }

    const row = data as unknown as Pick<CiudadRow, 'id' | 'nombre'>;
    return { id: row.id, nombre: row.nombre };
  }

  if (nombreFallback) {
    return { id: null, nombre: nombreFallback };
  }

  throw AppError.badRequest('ciudadId o nombre requerido');
}

class TarifaService {
  async list(query: TarifaQuery): Promise<PaginatedResponse<Tarifa>> {
    const { limit, page = 1, search, origen, destino, tipoServicio, includeDeleted, activo } = query;
    const offset = (page - 1) * limit;

    let q = supabase.from('tarifas').select(TARIFA_COLUMNS, { count: 'exact' });

    if (!includeDeleted) {
      q = q.eq('eliminado', false);
    }

    if (origen) q = q.ilike('origen', `%${escapeLikePattern(origen)}%`);
    if (destino) q = q.ilike('destino', `%${escapeLikePattern(destino)}%`);
    if (tipoServicio) q = q.eq('tipo_servicio', tipoServicio);
    if (activo !== undefined) q = q.eq('activo', activo);
    if (search) {
      const s = escapeLikePattern(search);
      q = q.or(`origen.ilike.%${s}%,destino.ilike.%${s}%`);
    }

    q = q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, count, error } = await q;

    if (error) {
      throw new AppError('Error fetching tarifas', 500, 'DB_ERROR');
    }

    const rows = (data ?? []) as unknown as TarifaRow[];

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

  async getById(id: string): Promise<Tarifa> {
    const { data, error } = await supabase
      .from('tarifas')
      .select(TARIFA_COLUMNS)
      .eq('id', id)
      .single();

    if (error || !data) {
      throw AppError.notFound('Tarifa', id);
    }

    return toApi(data as unknown as TarifaRow);
  }

  async create(
    input: CreateTarifaInput,
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<Tarifa> {
    const { data: creadorExists } = await supabase
      .from('usuarios')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (!creadorExists) {
      logger.warn({ userId }, 'Tarifa create: userId no existe en usuarios (token viejo o usuario eliminado)');
      throw AppError.forbidden('Tu sesion admin no corresponde a un usuario activo. Volve a iniciar sesion.');
    }

    const origen = await resolveCiudad(input.origenCiudadId, input.origen);
    const destino = await resolveCiudad(input.destinoCiudadId, input.destino);

    // Antes de crear, chequeamos si alguna de las dos ciudades pasa de 0 a >0 tarifas activas.
    // Si es asi, la crear va a "habilitar" esa ciudad, y emitimos un broadcast post-insert.
    const previouslyEnabled = await this.getEnabledCiudadIds(
      origen.id && destino.id ? [origen.id, destino.id] : [],
    );

    const { data, error } = await supabase
      .from('tarifas')
      .insert({
        origen: origen.nombre,
        destino: destino.nombre,
        origen_ciudad_id: origen.id,
        destino_ciudad_id: destino.id,
        tipo_servicio: input.tipoServicio,
        precio_base: input.precioBase,
        peso_base: input.pesoBase,
        precio_por_kg_extra: input.precioPorKgExtra,
        factor_dimensional: input.factorDimensional,
        creado_por: userId,
      })
      .select(TARIFA_COLUMNS)
      .single();

    if (error || !data) {
      logger.error({ error, input, userId }, 'Tarifa create failed');
      if (error?.code === '23505') {
        throw AppError.conflict('Ya existe una tarifa con esa combinacion de origen, destino y tipo de servicio');
      }
      throw new AppError(`Error creating tarifa: ${error?.message ?? 'unknown'}`, 500, 'DB_ERROR');
    }

    const tarifa = toApi(data as unknown as TarifaRow);

    await auditoriaService.log({
      usuario: 'Admin GoExpress',
      usuarioId: userId,
      accion: 'crear',
      entidad: 'tarifa',
      entidadId: tarifa.id,
      descripcion: `Tarifa creada: ${tarifa.origen} a ${tarifa.destino} (${tarifa.tipoServicio})`,
      valorNuevo: data as unknown as Record<string, unknown>,
      ipAddress,
      userAgent,
    });

    // Si origen/destino tienen ciudadId y antes estaban sin tarifas activas,
    // esta creacion las habilita. Broadcast para refrescar el panel de cobertura.
    if (origen.id && !previouslyEnabled.has(origen.id)) {
      sseService.broadcast({ entity: ['ciudad'], action: 'habilitada', id: origen.id });
    }
    if (destino.id && origen.id !== destino.id && !previouslyEnabled.has(destino.id)) {
      sseService.broadcast({ entity: ['ciudad'], action: 'habilitada', id: destino.id });
    }

    return tarifa;
  }

  async update(
    id: string,
    input: UpdateTarifaInput,
    userId?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<Tarifa> {
    const existing = await this.getById(id);
    if (existing.eliminado) {
      throw AppError.badRequest('Cannot update a deleted tarifa');
    }

    const updateData: Record<string, unknown> = {};

    if (input.origenCiudadId !== undefined || input.origen !== undefined) {
      const origen = await resolveCiudad(input.origenCiudadId, input.origen);
      updateData['origen'] = origen.nombre;
      updateData['origen_ciudad_id'] = origen.id;
    }
    if (input.destinoCiudadId !== undefined || input.destino !== undefined) {
      const destino = await resolveCiudad(input.destinoCiudadId, input.destino);
      updateData['destino'] = destino.nombre;
      updateData['destino_ciudad_id'] = destino.id;
    }
    if (input.tipoServicio !== undefined) updateData['tipo_servicio'] = input.tipoServicio;
    if (input.precioBase !== undefined) updateData['precio_base'] = input.precioBase;
    if (input.pesoBase !== undefined) updateData['peso_base'] = input.pesoBase;
    if (input.precioPorKgExtra !== undefined) updateData['precio_por_kg_extra'] = input.precioPorKgExtra;
    if (input.factorDimensional !== undefined) updateData['factor_dimensional'] = input.factorDimensional;

    const { data, error } = await supabase
      .from('tarifas')
      .update(updateData)
      .eq('id', id)
      .select(TARIFA_COLUMNS)
      .single();

    if (error || !data) {
      throw new AppError('Error updating tarifa', 500, 'DB_ERROR');
    }

    const tarifa = toApi(data as unknown as TarifaRow);

    if (userId) {
      await auditoriaService.log({
        usuario: 'Admin GoExpress',
        usuarioId: userId,
        accion: 'editar',
        entidad: 'tarifa',
        entidadId: id,
        descripcion: `Tarifa actualizada: ${tarifa.origen} a ${tarifa.destino} (${tarifa.tipoServicio})`,
        ipAddress,
        userAgent,
      });
    }

    return tarifa;
  }

  async softDelete(
    id: string,
    motivo: string,
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    const existing = await this.getById(id);
    if (existing.eliminado) {
      throw AppError.badRequest('Tarifa is already deleted');
    }

    const { error } = await supabase
      .from('tarifas')
      .update({
        eliminado: true,
        eliminado_por: userId,
        eliminado_en: nowISO(),
        motivo_eliminacion: motivo,
        activo: false,
      })
      .eq('id', id);

    if (error) {
      throw new AppError('Error deleting tarifa', 500, 'DB_ERROR');
    }

    await auditoriaService.log({
      usuario: 'Admin GoExpress',
      usuarioId: userId,
      accion: 'eliminar',
      entidad: 'tarifa',
      entidadId: id,
      descripcion: `Tarifa eliminada: ${existing.origen} a ${existing.destino}. Motivo: ${motivo}`,
      ipAddress,
      userAgent,
    });

    // Si esta era la unica tarifa activa para alguna ciudad, esa ciudad queda
    // deshabilitada. Broadcast para refrescar el panel de cobertura.
    const stillEnabled = await this.getEnabledCiudadIds(
      existing.origenCiudadId && existing.destinoCiudadId
        ? [existing.origenCiudadId, existing.destinoCiudadId]
        : [],
    );
    if (existing.origenCiudadId && !stillEnabled.has(existing.origenCiudadId)) {
      sseService.broadcast({ entity: ['ciudad'], action: 'deshabilitada', id: existing.origenCiudadId });
    }
    if (
      existing.destinoCiudadId &&
      existing.origenCiudadId !== existing.destinoCiudadId &&
      !stillEnabled.has(existing.destinoCiudadId)
    ) {
      sseService.broadcast({ entity: ['ciudad'], action: 'deshabilitada', id: existing.destinoCiudadId });
    }
  }

  async restore(
    id: string,
    userId?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<Tarifa> {
    const { data: existing } = await supabase
      .from('tarifas')
      .select(TARIFA_COLUMNS)
      .eq('id', id)
      .single();

    if (!existing) {
      throw AppError.notFound('Tarifa', id);
    }

    const row = existing as unknown as TarifaRow;
    if (!row.eliminado) {
      throw AppError.badRequest('Tarifa is not deleted');
    }

    const { data, error } = await supabase
      .from('tarifas')
      .update({
        eliminado: false,
        eliminado_por: null,
        eliminado_en: null,
        motivo_eliminacion: null,
        activo: true,
      })
      .eq('id', id)
      .select(TARIFA_COLUMNS)
      .single();

    if (error || !data) {
      throw new AppError('Error restoring tarifa', 500, 'DB_ERROR');
    }

    const tarifa = toApi(data as unknown as TarifaRow);

    if (userId) {
      await auditoriaService.log({
        usuario: 'Admin GoExpress',
        usuarioId: userId,
        accion: 'editar',
        entidad: 'tarifa',
        entidadId: id,
        descripcion: `Tarifa restaurada: ${tarifa.origen} a ${tarifa.destino}`,
        ipAddress,
        userAgent,
      });
    }

    return tarifa;
  }

  /**
   * Devuelve el subset de ciudadIds que actualmente tienen al menos una tarifa
   * activa referenciandolas. Usado para decidir si la mutacion actual cambia el
   * estado "habilitada" de una ciudad y amerita broadcast.
   */
  private async getEnabledCiudadIds(candidates: string[]): Promise<Set<string>> {
    if (candidates.length === 0) return new Set();

    const { data, error } = await supabase
      .from('tarifas')
      .select('origen_ciudad_id, destino_ciudad_id')
      .eq('activo', true)
      .eq('eliminado', false)
      .or(
        candidates
          .flatMap((id) => [`origen_ciudad_id.eq.${id}`, `destino_ciudad_id.eq.${id}`])
          .join(','),
      );

    if (error) {
      logger.warn({ error, candidates }, 'Error checking enabled ciudades, skipping broadcast');
      return new Set(candidates);
    }

    const rows = (data ?? []) as Array<{ origen_ciudad_id: string | null; destino_ciudad_id: string | null }>;
    const enabled = new Set<string>();
    for (const r of rows) {
      if (r.origen_ciudad_id) enabled.add(r.origen_ciudad_id);
      if (r.destino_ciudad_id) enabled.add(r.destino_ciudad_id);
    }
    return enabled;
  }
}

export const tarifaService = new TarifaService();
