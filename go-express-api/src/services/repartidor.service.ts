import { supabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import { AppError } from '../middleware/errorHandler.js';
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
    telefono: row.telefono,
    vehiculo: row.vehiculo,
    placa: row.placa,
    licencia: row.licencia,
    estado: row.estado,
    enviosHoy: 0,
    eliminado: row.eliminado,
    eliminadoPor: row.eliminado_por,
    eliminadoEn: row.eliminado_en,
    motivoEliminacion: row.motivo_eliminacion,
    creadoEn: row.created_at,
    updatedAt: row.updated_at,
  };
}

const REPARTIDOR_COLUMNS = [
  'id', 'nombre', 'telefono', 'vehiculo', 'placa', 'licencia',
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
      q = q.or(`nombre.ilike.%${s}%,placa.ilike.%${s}%,telefono.ilike.%${s}%`);
    }

    q = q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, count, error } = await q;

    if (error) {
      throw new AppError('Error fetching repartidores', 500, 'DB_ERROR');
    }

    const repartidores = ((data ?? []) as unknown as RepartidorRow[]).map(toApi);

    if (repartidores.length > 0) {
      const today = new Date().toISOString().split('T')[0]!;
      const repartidorIds = repartidores.map(r => r.id);
      const { data: envioCountData } = await supabase
        .from('envios')
        .select('repartidor_id')
        .in('repartidor_id', repartidorIds)
        .eq('eliminado', false)
        .gte('fecha', today);

      const countMap = new Map<string, number>();
      for (const row of (envioCountData ?? []) as { repartidor_id: string }[]) {
        countMap.set(row.repartidor_id, (countMap.get(row.repartidor_id) ?? 0) + 1);
      }

      for (const rep of repartidores) {
        rep.enviosHoy = countMap.get(rep.id) ?? 0;
      }
    }

    return {
      data: repartidores,
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
        telefono: input.telefono,
        vehiculo: input.vehiculo,
        placa: input.placa,
        licencia: input.licencia ?? null,
      })
      .select(REPARTIDOR_COLUMNS)
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
    if (input.telefono !== undefined) updateData['telefono'] = input.telefono;
    if (input.vehiculo !== undefined) updateData['vehiculo'] = input.vehiculo;
    if (input.placa !== undefined) updateData['placa'] = input.placa;
    if (input.licencia !== undefined) updateData['licencia'] = input.licencia;

    const { data, error } = await supabase
      .from('repartidores')
      .update(updateData)
      .eq('id', id)
      .select(REPARTIDOR_COLUMNS)
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
      .select(REPARTIDOR_COLUMNS)
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

    const { error: unassignError } = await supabase
      .from('envios')
      .update({ repartidor_id: null, repartidor_asignado_en: null })
      .eq('repartidor_id', id)
      .eq('eliminado', false)
      .in('estado', ['pendiente', 'recolectado', 'en_transito', 'en_reparto']);

    if (unassignError) {
      logger.error({ error: unassignError, repartidorId: id }, 'Failed to unassign envios from deleted repartidor');
    }

    await auditoriaService.log({
      usuario: usuarioNombre,
      usuarioId: userId,
      accion: 'eliminar',
      entidad: 'repartidor',
      entidadId: id,
      descripcion: `Repartidor ${repartidor.nombre} eliminado. Motivo: ${motivo}. Envios activos desasignados.`,
    });
  }

  async getEnviosAsignados(id: string): Promise<Envio[]> {
    await this.getById(id);

    const ENVIO_COLS = 'id, tracking_number, cliente_id, cliente_nombre, origen, destino, destinatario_nombre, destinatario_ciudad, estado, costo, fecha, created_at';

    const { data, error } = await supabase
      .from('envios')
      .select(ENVIO_COLS)
      .eq('repartidor_id', id)
      .eq('eliminado', false)
      .in('estado', ['recolectado', 'en_transito', 'en_reparto'])
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      throw new AppError('Error fetching repartidor envios', 500, 'DB_ERROR');
    }

    return ((data ?? []) as Record<string, unknown>[]).map(row => ({
      id: row['id'] as string,
      trackingNumber: row['tracking_number'] as string,
      clienteId: row['cliente_id'] as string,
      clienteNombre: row['cliente_nombre'] as string,
      codigoReferencia: null,
      origen: row['origen'] as string,
      destino: row['destino'] as string,
      destinatarioNombre: (row['destinatario_nombre'] as string) ?? '',
      destinatarioDireccion: '',
      destinatarioTelefono: '',
      destinatarioTelefono2: null,
      destinatarioCedula: null,
      destinatarioCiudad: (row['destinatario_ciudad'] as string) ?? '',
      destinatarioDepartamento: '',
      destinatarioBarrio: null,
      destinatarioReferencia: null,
      destinatarioUbicacionUrl: null,
      cantidad: 0,
      producto: '',
      peso: 0,
      dimensiones: { largo: null, ancho: null, alto: null },
      fragil: false,
      valorDeclarado: 0,
      instruccionesEntrega: null,
      horarioEntrega: null,
      notas: null,
      estado: row['estado'] as Envio['estado'],
      costo: row['costo'] as number,
      montoACobrar: 0,
      tipoPago: 'anticipado' as const,
      repartidorId: id,
      repartidorAsignadoEn: null,
      problemaDescripcion: null,
      problemaFecha: null,
      tags: [],
      tarifaId: null,
      fecha: row['fecha'] as string,
      eliminado: false,
      eliminadoPor: null,
      eliminadoEn: null,
      motivoEliminacion: null,
      eventos: [],
      pago: null,
      notasInternas: [],
      creadoEn: row['created_at'] as string,
      updatedAt: row['created_at'] as string,
    }));
  }
}

export const repartidorService = new RepartidorService();
