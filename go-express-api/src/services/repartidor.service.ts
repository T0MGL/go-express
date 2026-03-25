import { supabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import { AppError } from '../middleware/errorHandler.js';
import { encryptionService } from './encryption.service.js';
import { auditoriaService } from './auditoria.service.js';
import type {
  RepartidorRow,
  Repartidor,
  Envio,
  PaginatedResponse,
} from '../types/index.js';
import type { CreateRepartidorInput, UpdateRepartidorInput, RepartidorQuery } from '../lib/validators/repartidor.schema.js';
import { escapeLikePattern } from '../lib/validators/common.schema.js';

function toApi(row: RepartidorRow): Repartidor {
  return {
    id: row.id,
    nombre: row.nombre,
    telefono: encryptionService.decrypt(row.telefono_enc),
    vehiculo: row.vehiculo,
    placa: row.placa,
    licencia: row.licencia,
    estado: row.estado,
    eliminado: row.eliminado,
    eliminadoPor: row.eliminado_por,
    eliminadoEn: row.eliminado_en,
    motivoEliminacion: row.motivo_eliminacion,
    creadoEn: row.created_at,
    updatedAt: row.updated_at,
  };
}

const REPARTIDOR_COLUMNS = [
  'id', 'nombre', 'telefono_enc', 'vehiculo', 'placa', 'licencia',
  'estado', 'eliminado', 'eliminado_por', 'eliminado_en', 'motivo_eliminacion',
  'created_at', 'updated_at',
].join(', ');

class RepartidorService {
  async list(query: RepartidorQuery): Promise<PaginatedResponse<Repartidor>> {
    const { limit, page = 1, search, estado } = query;
    const offset = (page - 1) * limit;

    let q = supabase
      .from('repartidores')
      .select(REPARTIDOR_COLUMNS, { count: 'exact' })
      .eq('eliminado', false);

    if (estado) q = q.eq('estado', estado);
    if (search) {
      const s = escapeLikePattern(search);
      q = q.or(`nombre.ilike.%${s}%,placa.ilike.%${s}%`);
    }

    q = q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, count, error } = await q;

    if (error) {
      throw new AppError('Error fetching repartidores', 500, 'DB_ERROR');
    }

    const rows = (data ?? []) as unknown as RepartidorRow[];

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

  async getById(id: string): Promise<Repartidor> {
    const { data, error } = await supabase
      .from('repartidores')
      .select(REPARTIDOR_COLUMNS)
      .eq('id', id)
      .eq('eliminado', false)
      .single();

    if (error || !data) {
      throw AppError.notFound('Repartidor', id);
    }

    return toApi(data as unknown as RepartidorRow);
  }

  async create(input: CreateRepartidorInput, userId: string): Promise<Repartidor> {
    const { data, error } = await supabase
      .from('repartidores')
      .insert({
        nombre: input.nombre,
        telefono_enc: encryptionService.encrypt(input.telefono),
        vehiculo: input.vehiculo,
        placa: input.placa,
        licencia: input.licencia ?? null,
      })
      .select()
      .single();

    if (error || !data) {
      throw new AppError('Error creating repartidor', 500, 'DB_ERROR');
    }

    const repartidor = toApi(data as unknown as RepartidorRow);

    await auditoriaService.log({
      usuario: 'Admin GoExpress',
      usuarioId: userId,
      accion: 'crear',
      entidad: 'repartidor',
      entidadId: repartidor.id,
      descripcion: `Repartidor creado: ${repartidor.nombre} (${repartidor.vehiculo} - ${repartidor.placa})`,
    });

    return repartidor;
  }

  async update(id: string, input: UpdateRepartidorInput, userId?: string): Promise<Repartidor> {
    const existing = await this.getById(id);
    if (existing.eliminado) {
      throw AppError.badRequest('Cannot update a deleted repartidor');
    }

    const updateData: Record<string, unknown> = {};
    if (input.nombre !== undefined) updateData['nombre'] = input.nombre;
    if (input.telefono !== undefined) updateData['telefono_enc'] = encryptionService.encrypt(input.telefono);
    if (input.vehiculo !== undefined) updateData['vehiculo'] = input.vehiculo;
    if (input.placa !== undefined) updateData['placa'] = input.placa;
    if (input.licencia !== undefined) updateData['licencia'] = input.licencia;

    const { data, error } = await supabase
      .from('repartidores')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      throw new AppError('Error updating repartidor', 500, 'DB_ERROR');
    }

    const repartidor = toApi(data as unknown as RepartidorRow);

    if (userId) {
      await auditoriaService.log({
        usuario: 'Admin GoExpress',
        usuarioId: userId,
        accion: 'editar',
        entidad: 'repartidor',
        entidadId: id,
        descripcion: `Repartidor actualizado: ${repartidor.nombre}`,
      });
    }

    return repartidor;
  }

  async toggleEstado(id: string, userId?: string): Promise<Repartidor> {
    const existing = await this.getById(id);
    if (existing.eliminado) {
      throw AppError.badRequest('Cannot toggle estado of a deleted repartidor');
    }

    const newEstado = existing.estado === 'activo' ? 'inactivo' : 'activo';

    const { data, error } = await supabase
      .from('repartidores')
      .update({ estado: newEstado })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      throw new AppError('Error toggling repartidor estado', 500, 'DB_ERROR');
    }

    const repartidor = toApi(data as unknown as RepartidorRow);

    if (userId) {
      await auditoriaService.log({
        usuario: 'Admin GoExpress',
        usuarioId: userId,
        accion: 'cambio_estado',
        entidad: 'repartidor',
        entidadId: id,
        descripcion: `Repartidor ${repartidor.nombre}: estado cambiado a "${newEstado}"`,
      });
    }

    return repartidor;
  }

  async softDelete(id: string, motivo: string, userId: string, usuarioNombre: string): Promise<void> {
    const repartidor = await this.getById(id);

    if (repartidor.eliminado) {
      throw AppError.badRequest('Repartidor is already deleted');
    }

    const { error } = await supabase
      .from('repartidores')
      .update({
        eliminado: true,
        eliminado_por: userId,
        eliminado_en: new Date().toISOString(),
        motivo_eliminacion: motivo,
      })
      .eq('id', id);

    if (error) {
      logger.error({ error }, 'Error eliminando repartidor');
      throw new AppError('Error eliminando repartidor', 500, 'DB_ERROR');
    }

    await auditoriaService.log({
      usuario: usuarioNombre,
      usuarioId: userId,
      accion: 'eliminar',
      entidad: 'repartidor',
      entidadId: id,
      descripcion: `Repartidor ${repartidor.nombre} eliminado. Motivo: ${motivo}`,
    });
  }

  async getEnviosAsignados(id: string): Promise<Envio[]> {
    await this.getById(id);

    const { data, error } = await supabase
      .from('envios')
      .select('id, tracking_number, cliente_id, cliente_nombre, codigo_referencia, origen, destino, destinatario_nombre_enc, destinatario_direccion_enc, destinatario_telefono_enc, destinatario_telefono2_enc, destinatario_cedula_enc, destinatario_ciudad, destinatario_departamento, destinatario_barrio, destinatario_referencia_enc, destinatario_ubicacion_url, destinatario_nombre_search, destinatario_telefono_hash, cantidad, producto, peso, dimensiones_largo, dimensiones_ancho, dimensiones_alto, fragil, valor_declarado, instrucciones_entrega, horario_entrega, notas, estado, costo, monto_a_cobrar, tipo_pago, repartidor_id, repartidor_asignado_en, problema_descripcion, problema_fecha, tags, tarifa_id, fecha, eliminado, eliminado_por, eliminado_en, motivo_eliminacion, created_at, updated_at')
      .eq('repartidor_id', id)
      .eq('eliminado', false)
      .in('estado', ['recolectado', 'en_transito', 'en_reparto'])
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      throw new AppError('Error fetching repartidor envios', 500, 'DB_ERROR');
    }

    // We import the envio mapper lazily to avoid circular deps
    const { mapEnvioRowToApi } = await import('./envio.service.js');
    return (data ?? []).map(mapEnvioRowToApi);
  }
}

export const repartidorService = new RepartidorService();
