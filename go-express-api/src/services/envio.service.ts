import { supabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import { AppError } from '../middleware/errorHandler.js';
import { auditoriaService } from './auditoria.service.js';
import { emailService } from './email.service.js';
import { generateTrackingNumber } from '../lib/trackingNumber.js';
import { todayPY, nowISO } from '../lib/datetime.js';
import { parseSeguroConfig, calcularSeguroAdicional, puedeAsegurar } from '../lib/seguro.js';
import type {
  EnvioRow,
  EventoEnvioRow,
  PagoRow,
  NotaInternaRow,
  Envio,
  EventoEnvio,
  Pago,
  NotaInterna,
  EnvioEstado,
  EstadoPago,
  PaginatedResponse,
  NotificationEvent,
} from '../types/index.js';
import type { CreateEnvioInput, UpdateEnvioEstadoInput, EnvioQuery } from '../lib/validators/envio.schema.js';
import { escapeLikePattern } from '../lib/validators/common.schema.js';

// State machine: valid transitions

const VALID_TRANSITIONS: Record<EnvioEstado, EnvioEstado[]> = {
  pendiente: ['recolectado', 'problema'],
  recolectado: ['en_transito', 'problema'],
  en_transito: ['en_reparto', 'problema'],
  en_reparto: ['entregado', 'fallido', 'problema'],
  fallido: ['en_reparto', 'problema'],
  entregado: [],
  problema: ['pendiente', 'recolectado', 'en_transito', 'en_reparto', 'fallido'],
};

// Row to API mapper

export function mapEnvioRowToApi(row: EnvioRow): Envio {
  return {
    id: row.id,
    trackingNumber: row.tracking_number,
    clienteId: row.cliente_id,
    clienteNombre: row.cliente_nombre,
    codigoReferencia: row.codigo_referencia,
    origen: row.origen,
    destino: row.destino,
    destinatarioNombre: row.destinatario_nombre,
    destinatarioDireccion: row.destinatario_direccion,
    destinatarioTelefono: row.destinatario_telefono,
    destinatarioTelefono2: row.destinatario_telefono2,
    destinatarioCedula: row.destinatario_cedula,
    destinatarioCiudad: row.destinatario_ciudad,
    destinatarioDepartamento: row.destinatario_departamento,
    destinatarioBarrio: row.destinatario_barrio,
    destinatarioReferencia: row.destinatario_referencia,
    destinatarioUbicacionUrl: row.destinatario_ubicacion_url,
    cantidad: row.cantidad,
    producto: row.producto,
    peso: row.peso,
    dimensiones: {
      largo: row.dimensiones_largo,
      ancho: row.dimensiones_ancho,
      alto: row.dimensiones_alto,
    },
    fragil: row.fragil,
    valorDeclarado: row.valor_declarado,
    instruccionesEntrega: row.instrucciones_entrega,
    horarioEntrega: row.horario_entrega,
    notas: row.notas,
    estado: row.estado,
    costo: row.costo,
    montoACobrar: row.monto_a_cobrar,
    tipoPago: row.tipo_pago,
    seguroAdicional: row.seguro_adicional,
    costoSeguro: row.costo_seguro,
    repartidorId: row.repartidor_id,
    repartidorAsignadoEn: row.repartidor_asignado_en,
    problemaDescripcion: row.problema_descripcion,
    problemaFecha: row.problema_fecha,
    tags: row.tags,
    tarifaId: row.tarifa_id,
    fecha: row.fecha,
    eventos: [],
    pago: null,
    notasInternas: [],
    eliminado: row.eliminado,
    eliminadoPor: row.eliminado_por,
    eliminadoEn: row.eliminado_en,
    motivoEliminacion: row.motivo_eliminacion,
    creadoEn: row.created_at,
    updatedAt: row.updated_at,
  };
}

function extractListPago(row: Record<string, unknown>): Pago | null {
  const raw = row['pagos'];
  if (!raw) return null;

  let estadoPago: string;

  if (Array.isArray(raw)) {
    if (raw.length === 0) return null;
    estadoPago = (raw[0] as { estado_pago: string }).estado_pago;
  } else if (typeof raw === 'object') {
    estadoPago = (raw as { estado_pago: string }).estado_pago;
  } else {
    return null;
  }

  return {
    id: '',
    envioId: row['id'] as string,
    montoTotal: 0,
    montoRecibido: 0,
    metodoPago: 'efectivo',
    estadoPago: estadoPago as EstadoPago,
    fechaPago: null,
    referencia: null,
    notas: null,
    creadoPor: '',
    creadoEn: '',
    updatedAt: '',
  };
}

function mapEventoRow(row: EventoEnvioRow): EventoEnvio {
  return {
    id: row.id,
    envioId: row.envio_id,
    estado: row.estado,
    descripcion: row.descripcion,
    ubicacion: row.ubicacion,
    creadoEn: row.created_at,
  };
}

function mapPagoRow(row: PagoRow): Pago {
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

function mapNotaRow(row: NotaInternaRow): NotaInterna {
  return {
    id: row.id,
    envioId: row.envio_id,
    texto: row.texto,
    usuario: row.usuario,
    usuarioId: row.usuario_id,
    creadoEn: row.created_at,
  };
}

function triggerNotification(event: NotificationEvent, envio: Envio, previousEstado?: EnvioEstado): void {
  logger.info(
    { event, trackingNumber: envio.trackingNumber, previousEstado, newEstado: envio.estado },
    `Notification hook: ${event}`
  );

  switch (event) {
    case 'envio_creado':
      emailService.sendEnvioCreado(envio);
      break;
    case 'cambio_estado':
      if (envio.estado === 'entregado') {
        emailService.sendEntregado(envio);
      } else if (envio.estado === 'problema') {
        emailService.sendProblema(envio);
      } else if (previousEstado) {
        emailService.sendCambioEstado(envio, previousEstado);
      }
      break;
    case 'problema':
      emailService.sendProblema(envio);
      break;
  }
}

// Explicit column lists

const ENVIO_COLUMNS = [
  'id', 'tracking_number', 'cliente_id', 'cliente_nombre', 'codigo_referencia',
  'origen', 'destino',
  'destinatario_nombre', 'destinatario_direccion', 'destinatario_telefono',
  'destinatario_telefono2', 'destinatario_cedula',
  'destinatario_ciudad', 'destinatario_departamento', 'destinatario_barrio',
  'destinatario_referencia', 'destinatario_ubicacion_url',
  'cantidad', 'producto', 'peso',
  'dimensiones_largo', 'dimensiones_ancho', 'dimensiones_alto',
  'fragil', 'valor_declarado', 'instrucciones_entrega', 'horario_entrega', 'notas',
  'estado', 'costo', 'monto_a_cobrar', 'tipo_pago',
  'seguro_adicional', 'costo_seguro',
  'repartidor_id', 'repartidor_asignado_en',
  'problema_descripcion', 'problema_fecha',
  'tags', 'tarifa_id', 'fecha',
  'eliminado', 'eliminado_por', 'eliminado_en', 'motivo_eliminacion',
  'created_at', 'updated_at',
].join(', ');

const ENVIO_LIST_COLUMNS = ENVIO_COLUMNS + ', pagos(estado_pago)';

const EVENTO_COLUMNS = 'id, envio_id, estado, descripcion, ubicacion, created_at';
const PAGO_COLUMNS = 'id, envio_id, monto_total, monto_recibido, metodo_pago, estado_pago, fecha_pago, referencia, notas, creado_por, created_at, updated_at';
const NOTA_COLUMNS = 'id, envio_id, texto, usuario, usuario_id, created_at';

/**
 * Fetch seguro config desde DB y calcula el costo de seguro para un envio.
 * Se hace server-side siempre: nunca se confia en lo que manda el cliente.
 * Si el cliente opto in pero el valor declarado no califica, se fuerza false.
 * Si el valor declarado excede el maximo asegurable, se rechaza la operacion.
 */
export async function computeSeguroForEnvio(
  valorDeclarado: number,
  seguroAdicionalSolicitado: boolean
): Promise<{ seguroAdicional: boolean; costoSeguro: number }> {
  const { data, error } = await supabase
    .from('configuracion')
    .select('value')
    .eq('key', 'seguro_config')
    .maybeSingle();

  if (error) {
    logger.error({ error }, 'Error fetching seguro config');
    throw new AppError('Error fetching seguro config', 500, 'DB_ERROR');
  }

  const cfg = parseSeguroConfig((data as { value: unknown } | null)?.value ?? null);

  if (valorDeclarado > cfg.maximoAsegurable) {
    throw AppError.badRequest(
      `El valor declarado supera el maximo asegurable (${cfg.maximoAsegurable} Gs). Contacta a Go Express para envios de alto valor.`
    );
  }

  if (!seguroAdicionalSolicitado) {
    return { seguroAdicional: false, costoSeguro: 0 };
  }

  if (!puedeAsegurar(valorDeclarado, cfg)) {
    return { seguroAdicional: false, costoSeguro: 0 };
  }

  return { seguroAdicional: true, costoSeguro: calcularSeguroAdicional(valorDeclarado, cfg) };
}

class EnvioService {
  async list(query: EnvioQuery): Promise<PaginatedResponse<Envio>> {
    const { limit, page = 1, search, estado, clienteId, repartidorId, fechaDesde, fechaHasta } = query;
    const offset = (page - 1) * limit;

    let q = supabase.from('envios').select(ENVIO_LIST_COLUMNS, { count: 'exact' })
      .eq('eliminado', false);

    if (estado) q = q.eq('estado', estado);
    if (clienteId) q = q.eq('cliente_id', clienteId);
    if (repartidorId === 'sin_asignar') {
      q = q.is('repartidor_id', null);
    } else if (repartidorId) {
      q = q.eq('repartidor_id', repartidorId);
    }
    if (fechaDesde) q = q.gte('fecha', fechaDesde);
    if (fechaHasta) q = q.lte('fecha', fechaHasta);
    if (search) {
      const s = escapeLikePattern(search);
      q = q.or(
        `tracking_number.ilike.%${s}%,cliente_nombre.ilike.%${s}%,destinatario_nombre.ilike.%${s}%`
      );
    }

    q = q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, count, error } = await q;

    if (error) {
      throw new AppError('Error fetching envios', 500, 'DB_ERROR');
    }

    const rows = (data ?? []) as unknown as (EnvioRow & { pagos?: Array<{ estado_pago: string }> })[];

    return {
      data: rows.map((row) => {
        const envio = mapEnvioRowToApi(row as unknown as EnvioRow);
        envio.pago = extractListPago(row as unknown as Record<string, unknown>);
        return envio;
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

  async getById(id: string): Promise<Envio> {
    const { data, error } = await supabase
      .from('envios')
      .select(ENVIO_COLUMNS)
      .eq('id', id)
      .eq('eliminado', false)
      .single();

    if (error || !data) {
      throw AppError.notFound('Envio', id);
    }

    const envio = mapEnvioRowToApi(data as unknown as EnvioRow);

    const [eventosResult, pagoResult, notasResult] = await Promise.all([
      supabase
        .from('eventos_envio')
        .select(EVENTO_COLUMNS)
        .eq('envio_id', id)
        .order('created_at', { ascending: true }),
      supabase
        .from('pagos')
        .select(PAGO_COLUMNS)
        .eq('envio_id', id)
        .maybeSingle(),
      supabase
        .from('notas_internas')
        .select(NOTA_COLUMNS)
        .eq('envio_id', id)
        .order('created_at', { ascending: false }),
    ]);

    envio.eventos = ((eventosResult.data ?? []) as unknown as EventoEnvioRow[]).map(mapEventoRow);
    envio.pago = pagoResult.data ? mapPagoRow(pagoResult.data as unknown as PagoRow) : null;
    envio.notasInternas = ((notasResult.data ?? []) as unknown as NotaInternaRow[]).map(mapNotaRow);

    return envio;
  }

  async create(input: CreateEnvioInput, userId: string, userName?: string, ipAddress?: string, userAgent?: string): Promise<Envio> {
    const { data: clienteData, error: clienteError } = await supabase
      .from('clientes')
      .select('razon_social, estado')
      .eq('id', input.clienteId)
      .eq('eliminado', false)
      .single();

    if (clienteError || !clienteData) {
      throw AppError.notFound('Cliente no encontrado o inactivo');
    }

    if ((clienteData as { razon_social: string; estado: string }).estado !== 'activo') {
      throw AppError.badRequest('No se pueden crear envios para clientes inactivos o suspendidos');
    }

    const trackingNumber = await generateTrackingNumber(supabase);

    const today = todayPY();

    const valorDeclarado = input.valorDeclarado ?? 0;
    const { seguroAdicional, costoSeguro } = await computeSeguroForEnvio(
      valorDeclarado,
      input.seguroAdicional
    );

    const { data, error } = await supabase
      .from('envios')
      .insert({
        tracking_number: trackingNumber,
        cliente_id: input.clienteId,
        cliente_nombre: (clienteData as { razon_social: string }).razon_social,
        codigo_referencia: input.codigoReferencia ?? null,
        origen: input.origen,
        destino: input.destino,
        destinatario_nombre: input.destinatarioNombre,
        destinatario_direccion: input.destinatarioDireccion,
        destinatario_telefono: input.destinatarioTelefono,
        destinatario_telefono2: input.destinatarioTelefono2 ?? null,
        destinatario_cedula: input.destinatarioCedula ?? null,
        destinatario_ciudad: input.destinatarioCiudad ?? '',
        destinatario_departamento: input.destinatarioDepartamento ?? '',
        destinatario_barrio: input.destinatarioBarrio ?? null,
        destinatario_referencia: input.destinatarioReferencia ?? null,
        destinatario_ubicacion_url: input.destinatarioUbicacionUrl ?? null,
        cantidad: input.cantidad,
        producto: input.producto ?? '',
        peso: input.peso,
        dimensiones_largo: input.dimensiones?.largo ?? null,
        dimensiones_ancho: input.dimensiones?.ancho ?? null,
        dimensiones_alto: input.dimensiones?.alto ?? null,
        fragil: input.fragil,
        valor_declarado: valorDeclarado,
        instrucciones_entrega: input.instruccionesEntrega ?? null,
        horario_entrega: input.horarioEntrega ?? null,
        notas: input.notas ?? null,
        estado: 'pendiente' as const,
        costo: input.costo,
        monto_a_cobrar: input.montoACobrar,
        tipo_pago: input.tipoPago,
        seguro_adicional: seguroAdicional,
        costo_seguro: costoSeguro,
        tags: input.tags ?? [],
        tarifa_id: input.tarifaId ?? null,
        fecha: today,
      })
      .select(ENVIO_COLUMNS)
      .single();

    if (error || !data) {
      logger.error({ error, trackingNumber }, 'Error creating envio');
      throw new AppError('Error creating envio', 500, 'DB_ERROR');
    }

    const envio = mapEnvioRowToApi(data as unknown as EnvioRow);

    const [eventoResult] = await Promise.all([
      supabase.from('eventos_envio').insert({
        envio_id: envio.id,
        estado: 'pendiente',
        descripcion: 'Envio creado',
      }),
      auditoriaService.log({
        usuario: userName ?? 'Admin GoExpress',
        usuarioId: userId,
        accion: 'crear',
        entidad: 'envio',
        entidadId: envio.id,
        descripcion: `Envio creado: ${trackingNumber} para ${envio.clienteNombre}`,
        ipAddress,
        userAgent,
      }),
    ]);

    if (eventoResult.error) {
      logger.error({ error: eventoResult.error, envioId: envio.id }, 'Failed to insert evento_envio after envio creation');
    }

    triggerNotification('envio_creado', envio);

    return envio;
  }

  async update(id: string, input: Partial<CreateEnvioInput>, userId?: string): Promise<Envio> {
    const { data: existing, error: checkError } = await supabase
      .from('envios')
      .select('id, tracking_number, estado')
      .eq('id', id)
      .eq('eliminado', false)
      .single();

    if (checkError || !existing) {
      throw AppError.notFound('Envio no encontrado');
    }

    const currentEstado = (existing as { id: string; tracking_number: string; estado: string }).estado;
    if (currentEstado === 'entregado') {
      throw AppError.badRequest('No se puede modificar un envio ya entregado');
    }

    const updateData: Record<string, unknown> = {};

    if (input.codigoReferencia !== undefined) updateData['codigo_referencia'] = input.codigoReferencia;
    if (input.origen !== undefined) updateData['origen'] = input.origen;
    if (input.destino !== undefined) updateData['destino'] = input.destino;
    if (input.destinatarioNombre !== undefined) {
      updateData['destinatario_nombre'] = input.destinatarioNombre;
    }
    if (input.destinatarioDireccion !== undefined) {
      updateData['destinatario_direccion'] = input.destinatarioDireccion;
    }
    if (input.destinatarioTelefono !== undefined) {
      updateData['destinatario_telefono'] = input.destinatarioTelefono;
    }
    if (input.destinatarioTelefono2 !== undefined) {
      updateData['destinatario_telefono2'] = input.destinatarioTelefono2 ?? null;
    }
    if (input.destinatarioCedula !== undefined) {
      updateData['destinatario_cedula'] = input.destinatarioCedula ?? null;
    }
    if (input.destinatarioCiudad !== undefined) updateData['destinatario_ciudad'] = input.destinatarioCiudad;
    if (input.destinatarioDepartamento !== undefined) updateData['destinatario_departamento'] = input.destinatarioDepartamento;
    if (input.destinatarioBarrio !== undefined) updateData['destinatario_barrio'] = input.destinatarioBarrio;
    if (input.destinatarioReferencia !== undefined) {
      updateData['destinatario_referencia'] = input.destinatarioReferencia ?? null;
    }
    if (input.destinatarioUbicacionUrl !== undefined) {
      updateData['destinatario_ubicacion_url'] = input.destinatarioUbicacionUrl || null;
    }
    if (input.cantidad !== undefined) updateData['cantidad'] = input.cantidad;
    if (input.producto !== undefined) updateData['producto'] = input.producto;
    if (input.peso !== undefined) updateData['peso'] = input.peso;
    if (input.dimensiones !== undefined) {
      updateData['dimensiones_largo'] = input.dimensiones.largo;
      updateData['dimensiones_ancho'] = input.dimensiones.ancho;
      updateData['dimensiones_alto'] = input.dimensiones.alto;
    }
    if (input.fragil !== undefined) updateData['fragil'] = input.fragil;
    if (input.valorDeclarado !== undefined) updateData['valor_declarado'] = input.valorDeclarado;
    if (input.instruccionesEntrega !== undefined) updateData['instrucciones_entrega'] = input.instruccionesEntrega;
    if (input.horarioEntrega !== undefined) updateData['horario_entrega'] = input.horarioEntrega;
    if (input.notas !== undefined) updateData['notas'] = input.notas;
    if (input.costo !== undefined) updateData['costo'] = input.costo;
    if (input.montoACobrar !== undefined) updateData['monto_a_cobrar'] = input.montoACobrar;
    if (input.tipoPago !== undefined) updateData['tipo_pago'] = input.tipoPago;
    if (input.tags !== undefined) updateData['tags'] = input.tags;
    if (input.tarifaId !== undefined) updateData['tarifa_id'] = input.tarifaId;

    const { data, error } = await supabase
      .from('envios')
      .update(updateData)
      .eq('id', id)
      .select(ENVIO_COLUMNS)
      .single();

    if (error || !data) {
      throw new AppError('Error updating envio', 500, 'DB_ERROR');
    }

    const envio = mapEnvioRowToApi(data as unknown as EnvioRow);

    if (userId) {
      await auditoriaService.log({
        usuario: 'Admin GoExpress',
        usuarioId: userId,
        accion: 'editar',
        entidad: 'envio',
        entidadId: id,
        descripcion: `Envio actualizado: ${envio.trackingNumber}`,
      });
    }

    return envio;
  }

  async updateEstado(id: string, input: UpdateEnvioEstadoInput, userId: string, userName?: string, ipAddress?: string, userAgent?: string): Promise<Envio> {
    const { data: currentData, error: fetchError } = await supabase
      .from('envios')
      .select('estado, tracking_number')
      .eq('id', id)
      .eq('eliminado', false)
      .single();

    if (fetchError || !currentData) {
      throw AppError.notFound('Envio no encontrado');
    }

    const previousEstado = (currentData as { estado: EnvioEstado; tracking_number: string }).estado;
    const newEstado = input.estado;

    const allowed = VALID_TRANSITIONS[previousEstado];
    if (!allowed || !allowed.includes(newEstado)) {
      throw AppError.unprocessable(
        `Invalid state transition: "${previousEstado}" to "${newEstado}"`,
        { currentEstado: previousEstado, requestedEstado: newEstado, allowedTransitions: allowed }
      );
    }

    const updateData: Record<string, unknown> = { estado: newEstado };

    if (newEstado === 'problema') {
      updateData['problema_descripcion'] = input.descripcion;
      updateData['problema_fecha'] = nowISO();
    }

    if (previousEstado === 'problema' && newEstado !== 'problema') {
      updateData['problema_descripcion'] = null;
      updateData['problema_fecha'] = null;
    }

    const { data, error } = await supabase
      .from('envios')
      .update(updateData)
      .eq('id', id)
      .eq('estado', previousEstado)
      .select(ENVIO_COLUMNS)
      .maybeSingle();

    if (error) {
      throw new AppError('Error updating envio estado', 500, 'DB_ERROR');
    }

    if (!data) {
      throw AppError.conflict('El estado del envio fue modificado por otro usuario. Recargue e intente de nuevo.');
    }

    const envio = mapEnvioRowToApi(data as unknown as EnvioRow);

    const [eventoResult] = await Promise.all([
      supabase.from('eventos_envio').insert({
        envio_id: id,
        estado: newEstado,
        descripcion: input.descripcion,
        ubicacion: input.ubicacion ?? null,
      }),
      auditoriaService.log({
        usuario: userName ?? 'Admin GoExpress',
        usuarioId: userId,
        accion: 'cambio_estado',
        entidad: 'envio',
        entidadId: id,
        descripcion: `Envio ${envio.trackingNumber}: "${previousEstado}" a "${newEstado}". ${input.descripcion}`,
        ipAddress,
        userAgent,
      }),
    ]);

    if (eventoResult.error) {
      logger.error({ error: eventoResult.error, envioId: id }, 'Failed to insert evento_envio after estado change');
    }

    let event: NotificationEvent = 'cambio_estado';
    if (newEstado === 'entregado') event = 'entregado';
    else if (newEstado === 'problema') event = 'problema';
    else if (newEstado === 'fallido') event = 'fallido';

    triggerNotification(event, envio, previousEstado);

    return envio;
  }

  async asignarRepartidor(id: string, repartidorId: string, userId: string, userName?: string, ipAddress?: string, userAgent?: string): Promise<Envio> {
    const { data: envioCheck, error: envioCheckError } = await supabase
      .from('envios')
      .select('id, estado, tracking_number')
      .eq('id', id)
      .eq('eliminado', false)
      .single();

    if (envioCheckError || !envioCheck) {
      throw AppError.notFound('Envio no encontrado');
    }

    const allowedStates: EnvioEstado[] = ['pendiente', 'recolectado', 'en_transito', 'en_reparto'];
    const envioState = (envioCheck as { id: string; estado: EnvioEstado; tracking_number: string }).estado;
    if (!allowedStates.includes(envioState)) {
      throw AppError.badRequest(`No se puede asignar repartidor a un envio en estado "${envioState}"`);
    }

    const { data: repartidor } = await supabase
      .from('repartidores')
      .select('nombre, estado')
      .eq('id', repartidorId)
      .eq('eliminado', false)
      .single();

    if (!repartidor) {
      throw AppError.notFound('Repartidor', repartidorId);
    }

    const rep = repartidor as { nombre: string; estado: string };
    if (rep.estado !== 'activo') {
      throw AppError.badRequest('Cannot assign an inactive repartidor');
    }

    const { data, error } = await supabase
      .from('envios')
      .update({
        repartidor_id: repartidorId,
        repartidor_asignado_en: nowISO(),
      })
      .eq('id', id)
      .select(ENVIO_COLUMNS)
      .single();

    if (error || !data) {
      throw new AppError('Error assigning repartidor', 500, 'DB_ERROR');
    }

    const envio = mapEnvioRowToApi(data as unknown as EnvioRow);

    await auditoriaService.log({
      usuario: userName ?? 'Admin GoExpress',
      usuarioId: userId,
      accion: 'asignar',
      entidad: 'envio',
      entidadId: id,
      descripcion: `Repartidor "${rep.nombre}" asignado al envio ${envio.trackingNumber}`,
      ipAddress,
      userAgent,
    });

    return envio;
  }

  async reportarProblema(id: string, descripcion: string, userId: string): Promise<Envio> {
    return this.updateEstado(
      id,
      { estado: 'problema', descripcion },
      userId
    );
  }

  async agregarNota(id: string, texto: string, userId: string, usuarioNombre: string): Promise<NotaInterna> {
    const { data: exists, error: checkErr } = await supabase
      .from('envios')
      .select('id')
      .eq('id', id)
      .eq('eliminado', false)
      .single();
    if (checkErr || !exists) {
      throw AppError.notFound('Envio', id);
    }

    const { data, error } = await supabase
      .from('notas_internas')
      .insert({
        envio_id: id,
        texto,
        usuario: usuarioNombre,
        usuario_id: userId,
      })
      .select(NOTA_COLUMNS)
      .single();

    if (error || !data) {
      throw new AppError('Error adding nota', 500, 'DB_ERROR');
    }

    await auditoriaService.log({
      usuario: usuarioNombre,
      usuarioId: userId,
      accion: 'nota',
      entidad: 'nota_interna',
      entidadId: (data as unknown as NotaInternaRow).id,
      descripcion: `Nota interna agregada al envio ${id}`,
    });

    return mapNotaRow(data as unknown as NotaInternaRow);
  }

  async getEventos(id: string): Promise<EventoEnvio[]> {
    const { data, error } = await supabase
      .from('eventos_envio')
      .select(EVENTO_COLUMNS)
      .eq('envio_id', id)
      .order('created_at', { ascending: true });

    if (error) {
      throw new AppError('Error fetching eventos', 500, 'DB_ERROR');
    }

    return ((data ?? []) as unknown as EventoEnvioRow[]).map(mapEventoRow);
  }

  async bulkImport(
    envios: CreateEnvioInput[],
    userId: string,
    userName?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ exitosos: number; fallidos: { fila: number; errores: string[] }[]; trackingNumbers: string[] }> {
    const fallidos: { fila: number; errores: string[] }[] = [];

    const clienteIds = [...new Set(envios.map((e) => e.clienteId))];
    const { data: clientesData, error: clientesError } = await supabase
      .from('clientes')
      .select('id, razon_social, estado')
      .in('id', clienteIds)
      .eq('eliminado', false);

    if (clientesError) {
      throw new AppError('Error validating clientes for bulk import', 500, 'DB_ERROR');
    }

    const clienteMap = new Map<string, { razon_social: string; estado: string }>();
    for (const c of (clientesData ?? []) as Array<{ id: string; razon_social: string; estado: string }>) {
      clienteMap.set(c.id, { razon_social: c.razon_social, estado: c.estado });
    }

    const validEnvios: { input: CreateEnvioInput; index: number; clienteNombre: string }[] = [];
    for (let i = 0; i < envios.length; i++) {
      const input = envios[i]!;
      const cliente = clienteMap.get(input.clienteId);
      if (!cliente) {
        fallidos.push({ fila: i + 1, errores: ['Cliente no encontrado o inactivo'] });
        continue;
      }
      if (cliente.estado !== 'activo') {
        fallidos.push({ fila: i + 1, errores: ['No se pueden crear envios para clientes inactivos o suspendidos'] });
        continue;
      }
      validEnvios.push({ input, index: i, clienteNombre: cliente.razon_social });
    }

    if (validEnvios.length === 0) {
      return { exitosos: 0, fallidos, trackingNumbers: [] };
    }

    const trackingNumbers = await Promise.all(
      validEnvios.map(() => generateTrackingNumber(supabase))
    );

    const today = todayPY();
    const insertRows = validEnvios.map(({ input, clienteNombre }, i) => ({
      tracking_number: trackingNumbers[i]!,
      cliente_id: input.clienteId,
      cliente_nombre: clienteNombre,
      codigo_referencia: input.codigoReferencia ?? null,
      origen: input.origen,
      destino: input.destino,
      destinatario_nombre: input.destinatarioNombre,
      destinatario_direccion: input.destinatarioDireccion,
      destinatario_telefono: input.destinatarioTelefono,
      destinatario_telefono2: input.destinatarioTelefono2 ?? null,
      destinatario_cedula: input.destinatarioCedula ?? null,
      destinatario_ciudad: input.destinatarioCiudad ?? '',
      destinatario_departamento: input.destinatarioDepartamento ?? '',
      destinatario_barrio: input.destinatarioBarrio ?? null,
      destinatario_referencia: input.destinatarioReferencia ?? null,
      destinatario_ubicacion_url: input.destinatarioUbicacionUrl ?? null,
      cantidad: input.cantidad,
      producto: input.producto ?? '',
      peso: input.peso,
      dimensiones_largo: input.dimensiones?.largo ?? null,
      dimensiones_ancho: input.dimensiones?.ancho ?? null,
      dimensiones_alto: input.dimensiones?.alto ?? null,
      fragil: input.fragil,
      valor_declarado: input.valorDeclarado ?? 0,
      instrucciones_entrega: input.instruccionesEntrega ?? null,
      horario_entrega: input.horarioEntrega ?? null,
      notas: input.notas ?? null,
      estado: 'pendiente' as const,
      costo: input.costo,
      monto_a_cobrar: input.montoACobrar,
      tipo_pago: input.tipoPago,
      tags: input.tags ?? [],
      tarifa_id: input.tarifaId ?? null,
      fecha: today,
    }));

    const { data: insertedData, error: insertError } = await supabase
      .from('envios')
      .insert(insertRows)
      .select('id, tracking_number');

    if (insertError) {
      logger.error({ error: insertError }, 'Bulk import batch insert failed');
      throw new AppError(`Error importing envios: ${insertError.message}`, 500, 'DB_ERROR');
    }

    const inserted = (insertedData ?? []) as Array<{ id: string; tracking_number: string }>;
    const exitosos = inserted.map((row) => row.tracking_number);

    if (inserted.length > 0) {
      const eventRows = inserted.map((row) => ({
        envio_id: row.id,
        estado: 'pendiente' as const,
        descripcion: 'Envio creado por importacion masiva',
      }));

      await supabase.from('eventos_envio').insert(eventRows);

      await auditoriaService.log({
        usuario: userName ?? 'Admin GoExpress',
        usuarioId: userId,
        accion: 'importar',
        entidad: 'envio',
        entidadId: '',
        descripcion: `Importacion masiva: ${exitosos.length} exitosos, ${fallidos.length} fallidos`,
        ipAddress,
        userAgent,
      });
    }

    return {
      exitosos: exitosos.length,
      fallidos,
      trackingNumbers: exitosos,
    };
  }

  async softDelete(id: string, motivo: string, userId: string, usuarioNombre: string): Promise<void> {
    const { data: existing, error: checkErr } = await supabase
      .from('envios')
      .select('id, tracking_number, estado')
      .eq('id', id)
      .eq('eliminado', false)
      .single();

    if (checkErr || !existing) {
      throw AppError.notFound('Envio', id);
    }

    const envioData = existing as { id: string; tracking_number: string; estado: string };
    const trackingNumber = envioData.tracking_number;

    const nonDeletableStates: EnvioEstado[] = ['entregado', 'en_reparto', 'en_transito'];
    if (nonDeletableStates.includes(envioData.estado as EnvioEstado)) {
      throw AppError.badRequest(
        `No se puede eliminar un envio en estado "${envioData.estado}". Solo envios pendientes, recolectados, fallidos o con problema pueden eliminarse.`
      );
    }

    const { error } = await supabase
      .from('envios')
      .update({
        eliminado: true,
        eliminado_por: userId,
        eliminado_en: nowISO(),
        motivo_eliminacion: motivo,
      })
      .eq('id', id);

    if (error) {
      logger.error({ error }, 'Error deleting envio');
      throw new AppError('Error deleting envio', 500, 'DB_ERROR');
    }

    await auditoriaService.log({
      usuario: usuarioNombre,
      usuarioId: userId,
      accion: 'eliminar',
      entidad: 'envio',
      entidadId: id,
      descripcion: `Envio ${trackingNumber} eliminado. Motivo: ${motivo}`,
    });
  }
}

export const envioService = new EnvioService();
