import { supabase } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { auditoriaService } from './auditoria.service.js';
import type {
  TarifaRow,
  Tarifa,
  PaginatedResponse,
} from '../types/index.js';
import type { CreateTarifaInput, UpdateTarifaInput, TarifaQuery } from '../lib/validators/tarifa.schema.js';
import { escapeLikePattern } from '../lib/validators/common.schema.js';

// ---------------------------------------------------------------------------
// Row → API mapping
// ---------------------------------------------------------------------------

function toApi(row: TarifaRow): Tarifa {
  return {
    id: row.id,
    origen: row.origen,
    destino: row.destino,
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

// ---------------------------------------------------------------------------
// TarifaService
// ---------------------------------------------------------------------------

const TARIFA_COLUMNS = [
  'id', 'origen', 'destino', 'tipo_servicio',
  'precio_base', 'peso_base', 'precio_por_kg_extra', 'factor_dimensional',
  'activo', 'creado_por',
  'eliminado', 'eliminado_por', 'eliminado_en', 'motivo_eliminacion',
  'created_at', 'updated_at',
].join(', ');

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

  async create(input: CreateTarifaInput, userId: string): Promise<Tarifa> {
    const { data, error } = await supabase
      .from('tarifas')
      .insert({
        origen: input.origen,
        destino: input.destino,
        tipo_servicio: input.tipoServicio,
        precio_base: input.precioBase,
        peso_base: input.pesoBase,
        precio_por_kg_extra: input.precioPorKgExtra,
        factor_dimensional: input.factorDimensional,
        creado_por: userId,
      })
      .select()
      .single();

    if (error || !data) {
      throw new AppError('Error creating tarifa', 500, 'DB_ERROR');
    }

    const tarifa = toApi(data as unknown as TarifaRow);

    await auditoriaService.log({
      usuario: 'Admin GoExpress',
      usuarioId: userId,
      accion: 'crear',
      entidad: 'tarifa',
      entidadId: tarifa.id,
      descripcion: `Tarifa creada: ${tarifa.origen} → ${tarifa.destino} (${tarifa.tipoServicio})`,
      valorNuevo: data as unknown as Record<string, unknown>,
    });

    return tarifa;
  }

  async update(id: string, input: UpdateTarifaInput, userId?: string): Promise<Tarifa> {
    // Ensure tarifa exists
    const existing = await this.getById(id);
    if (existing.eliminado) {
      throw AppError.badRequest('Cannot update a deleted tarifa');
    }

    const updateData: Record<string, unknown> = {};
    if (input.origen !== undefined) updateData['origen'] = input.origen;
    if (input.destino !== undefined) updateData['destino'] = input.destino;
    if (input.tipoServicio !== undefined) updateData['tipo_servicio'] = input.tipoServicio;
    if (input.precioBase !== undefined) updateData['precio_base'] = input.precioBase;
    if (input.pesoBase !== undefined) updateData['peso_base'] = input.pesoBase;
    if (input.precioPorKgExtra !== undefined) updateData['precio_por_kg_extra'] = input.precioPorKgExtra;
    if (input.factorDimensional !== undefined) updateData['factor_dimensional'] = input.factorDimensional;

    const { data, error } = await supabase
      .from('tarifas')
      .update(updateData)
      .eq('id', id)
      .select()
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
        descripcion: `Tarifa actualizada: ${tarifa.origen} → ${tarifa.destino} (${tarifa.tipoServicio})`,
      });
    }

    return tarifa;
  }

  async softDelete(id: string, motivo: string, userId: string): Promise<void> {
    const existing = await this.getById(id);
    if (existing.eliminado) {
      throw AppError.badRequest('Tarifa is already deleted');
    }

    const { error } = await supabase
      .from('tarifas')
      .update({
        eliminado: true,
        eliminado_por: userId,
        eliminado_en: new Date().toISOString(),
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
      descripcion: `Tarifa eliminada: ${existing.origen} → ${existing.destino}. Motivo: ${motivo}`,
    });
  }

  async restore(id: string, userId?: string): Promise<Tarifa> {
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
      .select()
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
        descripcion: `Tarifa restaurada: ${tarifa.origen} → ${tarifa.destino}`,
      });
    }

    return tarifa;
  }
}

export const tarifaService = new TarifaService();
