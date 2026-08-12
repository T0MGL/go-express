import { supabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import { AppError } from '../middleware/errorHandler.js';
import { auditoriaService } from './auditoria.service.js';
import { notificacionesService } from './notificaciones.service.js';
import { generateTrackingNumber } from '../lib/trackingNumber.js';
import { computeCostoEnvio } from '../lib/cotizacion.js';
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
import type { CreateEnvioInput, UpdateEnvioEstadoInput, EnvioQuery, BulkActionInput } from '../lib/validators/envio.schema.js';
import type { CreateIntentoContactoInput } from '../lib/validators/intentos-contacto.schema.js';
import { escapeLikePattern } from '../lib/validators/common.schema.js';

export type IntentoContactoTipo = 'llamada' | 'whatsapp' | 'visita_fallida';

export interface IntentoContacto {
  id: string;
  envioId: string;
  tipo: IntentoContactoTipo;
  descripcion: string | null;
  registradoPor: string | null;
  registradoPorNombre: string;
  creadoEn: string;
}

// State machine: valid transitions

const VALID_TRANSITIONS: Record<EnvioEstado, EnvioEstado[]> = {
  pendiente: ['recolectado', 'problema'],
  recolectado: ['en_transito', 'problema'],
  en_transito: ['en_deposito', 'en_reparto', 'problema'],
  en_deposito: ['en_reparto', 'problema'],
  en_reparto: ['entregado', 'fallido', 'problema'],
  fallido: ['en_reparto', 'problema'],
  entregado: [],
  problema: ['pendiente', 'recolectado', 'en_transito', 'en_deposito', 'en_reparto', 'fallido'],
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
    destinatarioEmail: row.destinatario_email,
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
    fotoEntregaUrl: row.foto_entrega_url ?? null,
    entregadoPorNombre: row.entregado_por_nombre ?? null,
    entregadoPorDocumento: row.entregado_por_documento ?? null,
    fechaEntregaReal: row.fecha_entrega_real ?? null,
    montoCobrado: row.monto_cobrado ?? null,
    recolectadoEn: row.recolectado_en ?? null,
    entregaNotas: row.entrega_notas ?? null,
    tieneIncidencia: row.tiene_incidencia ?? false,
    incidenciaNota: row.incidencia_nota ?? null,
    incidenciaReportadaEn: row.incidencia_reportada_en ?? null,
    incidenciaReportadaPor: row.incidencia_reportada_por ?? null,
    codPagoPendiente: row.cod_pago_pendiente ?? false,
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
    anulado: false,
    anuladoPor: null,
    anuladoEn: null,
    motivoAnulacion: null,
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
    anulado: row.anulado,
    anuladoPor: row.anulado_por,
    anuladoEn: row.anulado_en,
    motivoAnulacion: row.motivo_anulacion,
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

// Fire-and-forget al orquestador multi-canal. La HTTP response del cambio de estado
// no espera al fan-out. El orquestador resuelve config gate, dispara email + WhatsApp
// en paralelo (Promise.allSettled) y persiste cada intento en notificaciones_log.
function triggerNotification(event: NotificationEvent, envio: Envio, previousEstado?: EnvioEstado): void {
  logger.info(
    { event, trackingNumber: envio.trackingNumber, previousEstado, newEstado: envio.estado },
    `Notification hook: ${event}`
  );

  void notificacionesService.dispatch(event, envio).catch((err) => {
    logger.error({ err, event, tracking: envio.trackingNumber }, '[NOTIF] dispatch threw unexpectedly');
  });
}

// Explicit column lists

export const ENVIO_COLUMNS = [
  'id', 'tracking_number', 'cliente_id', 'cliente_nombre', 'codigo_referencia',
  'origen', 'destino',
  'destinatario_nombre', 'destinatario_direccion', 'destinatario_telefono',
  'destinatario_telefono2', 'destinatario_cedula',
  'destinatario_ciudad', 'destinatario_departamento', 'destinatario_barrio',
  'destinatario_referencia', 'destinatario_ubicacion_url', 'destinatario_email',
  'cantidad', 'producto', 'peso',
  'dimensiones_largo', 'dimensiones_ancho', 'dimensiones_alto',
  'fragil', 'valor_declarado', 'instrucciones_entrega', 'horario_entrega', 'notas',
  'estado', 'costo', 'monto_a_cobrar', 'tipo_pago',
  'seguro_adicional', 'costo_seguro',
  'repartidor_id', 'repartidor_asignado_en',
  'problema_descripcion', 'problema_fecha',
  'foto_entrega_url', 'entregado_por_nombre', 'entregado_por_documento',
  'fecha_entrega_real', 'monto_cobrado', 'recolectado_en', 'entrega_notas',
  'tiene_incidencia', 'incidencia_nota', 'incidencia_reportada_en', 'incidencia_reportada_por',
  'cod_pago_pendiente',
  'tags', 'tarifa_id', 'fecha',
  'eliminado', 'eliminado_por', 'eliminado_en', 'motivo_eliminacion',
  'created_at', 'updated_at',
].join(', ');

const ENVIO_LIST_COLUMNS = ENVIO_COLUMNS + ', pagos(estado_pago)';

const EVENTO_COLUMNS = 'id, envio_id, estado, descripcion, ubicacion, created_at';
const PAGO_COLUMNS = 'id, envio_id, monto_total, monto_recibido, metodo_pago, estado_pago, fecha_pago, referencia, notas, creado_por, anulado, anulado_por, anulado_en, motivo_anulacion, created_at, updated_at';
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
    const { limit, page = 1, search, estado, clienteId, repartidorId, fechaDesde, fechaHasta, fechaEntregaDesde, fechaEntregaHasta, soloIncidencias } = query;
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
    if (fechaEntregaDesde) q = q.gte('fecha_entrega_real', fechaEntregaDesde);
    if (fechaEntregaHasta) q = q.lte('fecha_entrega_real', `${fechaEntregaHasta}T23:59:59.999Z`);
    if (soloIncidencias) q = q.eq('tiene_incidencia', true);
    if (search) {
      const raw = escapeLikePattern(search);
      // Strip separators to match normalized phones stored as +595XXXXXXXXX
      // against whatever the operator typed ("0971 123456", "0971-123456", etc).
      const digits = search.replace(/\D+/g, '');
      const phoneTail = digits.length >= 4 ? digits.slice(-9) : null;
      const clauses = [
        `tracking_number.ilike.%${raw}%`,
        `cliente_nombre.ilike.%${raw}%`,
        `destinatario_nombre.ilike.%${raw}%`,
        `codigo_referencia.ilike.%${raw}%`,
      ];
      if (phoneTail) {
        const pt = escapeLikePattern(phoneTail);
        clauses.push(`destinatario_telefono.ilike.%${pt}%`);
        clauses.push(`destinatario_telefono2.ilike.%${pt}%`);
      }
      q = q.or(clauses.join(','));
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
        .eq('anulado', false)
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

  async create(
    input: CreateEnvioInput,
    userId: string,
    userName?: string,
    ipAddress?: string,
    userAgent?: string,
    options: {
      forzarCostoManual?: boolean;
      motivoCostoManual?: string;
    } = {}
  ): Promise<Envio> {
    if (options.forzarCostoManual && (!options.motivoCostoManual || options.motivoCostoManual.trim().length < 10)) {
      throw AppError.badRequest(
        'forzarCostoManual requiere motivoCostoManual con al menos 10 caracteres'
      );
    }

    const { data: clienteData, error: clienteError } = await supabase
      .from('clientes')
      .select('razon_social, estado, es_mostrador')
      .eq('id', input.clienteId)
      .eq('eliminado', false)
      .single();

    if (clienteError || !clienteData) {
      throw AppError.notFound('Cliente no encontrado o inactivo');
    }

    const cliente = clienteData as { razon_social: string; estado: string; es_mostrador: boolean };

    if (cliente.estado !== 'activo') {
      throw AppError.badRequest('No se pueden crear envios para clientes inactivos o suspendidos');
    }

    // Mostrador exige override para identificar al remitente en el label,
    // reportes y busquedas. Si no viene el override no hay con que etiquetar.
    if (cliente.es_mostrador && !input.clienteNombreOverride) {
      throw AppError.badRequest(
        'Envios al cliente mostrador requieren clienteNombreOverride con el nombre del remitente'
      );
    }

    const clienteNombre = cliente.es_mostrador
      ? (input.clienteNombreOverride as string)
      : cliente.razon_social;

    const trackingNumber = await generateTrackingNumber(supabase);

    const today = todayPY();

    const valorDeclarado = input.valorDeclarado ?? 0;
    const { seguroAdicional, costoSeguro } = await computeSeguroForEnvio(
      valorDeclarado,
      input.seguroAdicional
    );

    // Costo server-side. Por default se cotiza desde la tarifa que matchea origen/destino.
    // input.costo NO es un default silencioso: solo se respeta como override explicito
    // cuando forzarCostoManual=true, y ese caso queda asentado en auditoria.
    let costo: number;
    let tarifaIdResolved: string | null = input.tarifaId ?? null;
    if (options.forzarCostoManual) {
      costo = input.costo as number;
    } else {
      const cotizacion = await computeCostoEnvio(supabase, {
        origen: input.origen,
        destino: input.destino,
        peso: input.peso,
        dimensiones: input.dimensiones ?? null,
      });
      costo = cotizacion.costo;
      if (cotizacion.matched) {
        tarifaIdResolved = cotizacion.tarifaId;
      }
    }

    const { data, error } = await supabase
      .from('envios')
      .insert({
        tracking_number: trackingNumber,
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
        destinatario_email: input.destinatarioEmail ?? null,
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
        costo,
        monto_a_cobrar: input.montoACobrar,
        tipo_pago: input.tipoPago,
        seguro_adicional: seguroAdicional,
        costo_seguro: costoSeguro,
        tags: input.tags ?? [],
        tarifa_id: tarifaIdResolved,
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

    if (options.forzarCostoManual) {
      await auditoriaService.log({
        usuario: userName ?? 'Admin GoExpress',
        usuarioId: userId,
        accion: 'editar',
        entidad: 'envio',
        entidadId: envio.id,
        descripcion: `Costo manual forzado al crear envio ${trackingNumber}: ${costo} Gs (override de cotizacion automatica). Motivo: ${options.motivoCostoManual ?? 'no especificado'}`,
        valorNuevo: { trackingNumber, costoManual: costo },
        ipAddress,
        userAgent,
      });
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
    if (input.destinatarioEmail !== undefined) {
      updateData['destinatario_email'] = input.destinatarioEmail ?? null;
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
    // costo, monto_a_cobrar, tipo_pago, tarifa_id y seguro NO se copian al UPDATE generico
    // (causa raiz B). Mover plata por aca desincroniza el ledger sin re-debito. El ajuste de
    // costo va por recreacion del envio; el monto COD esta blindado a nivel DB una vez que hay
    // pago/liquidacion. Cualquier intento de mandarlos por aca se ignora en silencio.
    if (input.tags !== undefined) updateData['tags'] = input.tags;

    const { data, error } = await supabase
      .from('envios')
      .update(updateData)
      .eq('id', id)
      .select(ENVIO_COLUMNS)
      .single();

    if (error || !data) {
      // El trigger trg_envio_block_tipo_pago_change rechaza cambiar tipo_pago si el envio
      // ya tiene un pago activo. Lo mapeamos a 422 con mensaje claro en vez de 500 opaco.
      if (error?.message?.includes('tipo_pago_no_modificable')) {
        throw AppError.unprocessable(
          'No se puede cambiar el tipo de pago de un envio que ya tiene un pago asociado. Anula el pago primero.'
        );
      }
      if (error?.message?.includes('cod_monto_no_modificable')) {
        throw AppError.unprocessable(
          'No se puede cambiar el monto a cobrar de un envio COD que ya tiene un pago activo o esta en una liquidacion.'
        );
      }
      logger.error({ error, envioId: id }, 'Error updating envio');
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

  /**
   * Transiciona el estado de un envio de forma atomica via RPC plpgsql.
   * El RPC ejecuta SELECT FOR UPDATE + UPDATE + INSERT eventos_envio + INSERT auditoria_log
   * en una sola transaccion plpgsql. Si cualquiera falla, todo se rollbackea.
   *
   * Cierra dos clases de bugs que existian con el path previo (UPDATE con OCC en TS,
   * eventos/auditoria fuera de transaccion):
   *  1. eventos_envio o auditoria_log fallaba luego del UPDATE -> estado nuevo sin
   *     timeline ni log forense.
   *  2. Drivers o admins concurrentes en la misma fila -> el OCC en TS detectaba el
   *     race pero dejaba ventanas pequeñas si el UPDATE corria sin lock previo. Ahora
   *     el FOR UPDATE serializa por fila bajo lock pesimista.
   *
   * userName: nombre legible que va al timeline y al log.
   * auditActorId: FK a usuarios. Para repartidores que no son usuarios, pasar el
   *   SISTEMA_USER_ID. La identidad real queda en userName y en envios.repartidor_id.
   */
  async updateEstado(
    id: string,
    input: UpdateEnvioEstadoInput,
    userId: string,
    userName?: string,
    ipAddress?: string,
    userAgent?: string,
    auditActorId?: string,
  ): Promise<Envio> {
    const actorNombre = userName ?? 'Admin GoExpress';
    const actorAuditId = auditActorId ?? userId;

    const { data, error } = await supabase.rpc('update_envio_estado_atomico', {
      p_envio_id: id,
      p_nuevo_estado: input.estado,
      p_descripcion: input.descripcion,
      p_ubicacion: input.ubicacion ?? null,
      p_problema_descr: input.estado === 'problema' ? input.descripcion : null,
      p_repartidor_id: input.estado === 'en_reparto' ? (input.repartidorId ?? null) : null,
      p_apply_repartidor: input.estado === 'en_reparto' && Boolean(input.repartidorId),
      p_actor_id: userId,
      p_actor_nombre: actorNombre,
      p_audit_actor_id: actorAuditId,
      p_extra_descr: null,
      p_ip: ipAddress ?? null,
      p_user_agent: userAgent ?? null,
    });

    if (error) {
      const msg = error.message ?? '';
      if (msg.includes('envio_no_encontrado')) {
        throw AppError.notFound('Envio', id);
      }
      if (msg.includes('envio_eliminado')) {
        throw AppError.badRequest('No se puede modificar un envio eliminado');
      }
      if (msg.includes('transicion_invalida')) {
        throw AppError.unprocessable(
          `Transicion de estado invalida hacia "${input.estado}"`,
          { detail: msg }
        );
      }
      logger.error({ error, envioId: id, nuevoEstado: input.estado }, 'Error en RPC update_envio_estado_atomico');
      throw new AppError('Error updating envio estado', 500, 'DB_ERROR');
    }

    if (!data) {
      throw new AppError('Error updating envio estado: empty response', 500, 'DB_ERROR');
    }

    const row = (Array.isArray(data) ? data[0] : data) as EnvioRow | undefined;
    if (!row) {
      throw new AppError('Error updating envio estado: empty row', 500, 'DB_ERROR');
    }

    const envio = mapEnvioRowToApi(row);

    let event: NotificationEvent = 'cambio_estado';
    if (input.estado === 'entregado') event = 'entregado';
    else if (input.estado === 'problema') event = 'problema';
    else if (input.estado === 'fallido') event = 'fallido';

    triggerNotification(event, envio);

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

    const allowedStates: EnvioEstado[] = ['pendiente', 'recolectado', 'en_transito', 'en_deposito', 'en_reparto'];
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

  async reportarProblema(
    id: string,
    descripcion: string,
    userId: string,
    userName?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<Envio> {
    return this.updateEstado(
      id,
      { estado: 'problema', descripcion },
      userId,
      userName,
      ipAddress,
      userAgent,
    );
  }

  async agregarNota(
    id: string,
    texto: string,
    userId: string,
    usuarioNombre: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<NotaInterna> {
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
      ipAddress,
      userAgent,
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
      .select('id, razon_social, estado, es_mostrador')
      .in('id', clienteIds)
      .eq('eliminado', false);

    if (clientesError) {
      throw new AppError('Error validating clientes for bulk import', 500, 'DB_ERROR');
    }

    const clienteMap = new Map<string, { razon_social: string; estado: string; es_mostrador: boolean }>();
    for (const c of (clientesData ?? []) as Array<{ id: string; razon_social: string; estado: string; es_mostrador: boolean }>) {
      clienteMap.set(c.id, { razon_social: c.razon_social, estado: c.estado, es_mostrador: c.es_mostrador });
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
      if (cliente.es_mostrador && !input.clienteNombreOverride) {
        fallidos.push({ fila: i + 1, errores: ['Envios mostrador requieren clienteNombreOverride'] });
        continue;
      }
      const clienteNombre = cliente.es_mostrador
        ? (input.clienteNombreOverride as string)
        : cliente.razon_social;
      validEnvios.push({ input, index: i, clienteNombre });
    }

    if (validEnvios.length === 0) {
      return { exitosos: 0, fallidos, trackingNumbers: [] };
    }

    const trackingNumbers = await Promise.all(
      validEnvios.map(() => generateTrackingNumber(supabase))
    );

    // Costo server-side por fila via la misma cotizacion que el path unitario (causa raiz C).
    // El costo del caller NO se confia: se recotiza desde la tarifa que matchea origen/destino.
    // Si no hay tarifa, costo 0 y el admin lo tasa despues (el trigger de DB asienta el debito
    // cuando se asigna el costo). Asi un import masivo no puede mover plata a costo cero.
    const cotizaciones = await Promise.all(
      validEnvios.map(({ input }) =>
        computeCostoEnvio(supabase, {
          origen: input.origen,
          destino: input.destino,
          peso: input.peso,
          dimensiones: input.dimensiones ?? null,
        })
      )
    );

    // Seguro server-side, misma fuente de verdad que el unitario y que el bulk del portal cliente
    // (cliente/envios.ts): una sola lectura de seguro_config para todo el batch. El bulk admin antes
    // persistia costo_seguro=0 (GO EXPRESS subfacturaba su tarifa, A3) y mandaba monto_a_cobrar crudo
    // (el trigger I1 rechazaba anticipado y, por ser un insert monolitico, tumbaba el batch entero, A2).
    const { data: seguroConfigData, error: seguroConfigError } = await supabase
      .from('configuracion')
      .select('value')
      .eq('key', 'seguro_config')
      .maybeSingle();

    if (seguroConfigError) {
      logger.error({ error: seguroConfigError }, 'Bulk import: error fetching seguro config');
      throw new AppError('Error fetching seguro config', 500, 'DB_ERROR');
    }

    const seguroConfig = parseSeguroConfig((seguroConfigData as { value: unknown } | null)?.value ?? null);

    const today = todayPY();
    const insertRows: Record<string, unknown>[] = [];

    for (let i = 0; i < validEnvios.length; i++) {
      const { input, index, clienteNombre } = validEnvios[i]!;
      const cot = cotizaciones[i]!;
      const valorDeclarado = input.valorDeclarado ?? 0;

      // Filas invalidas se desvian a fallidos ANTES del insert: una fila mala no tumba las otras 499.
      if (valorDeclarado > seguroConfig.maximoAsegurable) {
        fallidos.push({
          fila: index + 1,
          errores: [`Valor declarado ${valorDeclarado} supera el maximo asegurable (${seguroConfig.maximoAsegurable} Gs)`],
        });
        continue;
      }

      let seguroAdicional = false;
      let costoSeguro = 0;
      if (input.seguroAdicional && puedeAsegurar(valorDeclarado, seguroConfig)) {
        seguroAdicional = true;
        costoSeguro = calcularSeguroAdicional(valorDeclarado, seguroConfig);
      }

      // I1 (trg_envio_i1_cubre_tarifa_fn): tarifa = costo + seguro. anticipado exige igualdad exacta,
      // contra_entrega exige cobertura (>=) y el excedente es producto de la tienda. Se reconcilia aca,
      // server-side, en lugar de confiar en el monto_a_cobrar crudo del caller.
      const tarifa = cot.costo + costoSeguro;
      let montoACobrar: number;
      if (input.tipoPago === 'anticipado') {
        montoACobrar = tarifa;
      } else {
        montoACobrar = input.montoACobrar;
        if (montoACobrar < tarifa) {
          fallidos.push({
            fila: index + 1,
            errores: [`monto_a_cobrar (${montoACobrar}) no cubre costo + seguro (${tarifa})`],
          });
          continue;
        }
      }

      insertRows.push({
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
        destinatario_email: input.destinatarioEmail ?? null,
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
        // Costo y tarifa derivados server-side (cot), nunca del caller. tipo_pago es intent operativo
        // del admin (anticipado vs contra_entrega); monto_a_cobrar y costo_seguro se reconcilian aca
        // para cumplir I1 y cobrar el seguro real.
        costo: cot.costo,
        monto_a_cobrar: montoACobrar,
        tipo_pago: input.tipoPago,
        seguro_adicional: seguroAdicional,
        costo_seguro: costoSeguro,
        tags: input.tags ?? [],
        tarifa_id: cot.tarifaId,
        fecha: today,
      });
    }

    if (insertRows.length === 0) {
      return { exitosos: 0, fallidos, trackingNumbers: [] };
    }

    const { data: insertedData, error: insertError } = await supabase
      .from('envios')
      .insert(insertRows)
      .select('id, tracking_number');

    if (insertError) {
      logger.error({ error: insertError }, 'Bulk import batch insert failed');
      // I1 (anticipado/contra_entrega) se pre-valida por fila arriba; si igual llega aca es una fila
      // que se escapo del pre-check. Mapear a 422 con mensaje claro en vez de 500 opaco, igual que
      // updateEstado, y no filtrar el mensaje crudo de Postgres al cliente.
      const msg = insertError.message ?? '';
      if (msg.includes('anticipado_monto_invalido') || msg.includes('monto_a_cobrar_insuficiente')) {
        throw AppError.unprocessable(
          'Una fila tiene un monto a cobrar incoherente con el costo del envio. Revisa los montos del archivo e intenta de nuevo.'
        );
      }
      throw new AppError('Error importing envios', 500, 'DB_ERROR');
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

  async softDelete(
    id: string,
    motivo: string,
    userId: string,
    usuarioNombre: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
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
      ipAddress,
      userAgent,
    });
  }

  /**
   * Apply an action (change estado or assign a repartidor) to many envios at once.
   * The loop is sequential on purpose: each update needs its own transition
   * check and audit entry, and any failure must not block the others.
   * Returns per-id success/failure so the UI can show the operator exactly
   * which envios were rejected and why.
   */
  async bulkAction(
    input: BulkActionInput,
    userId: string,
    userName: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{
    total: number;
    exitosos: number;
    fallidos: Array<{ id: string; trackingNumber?: string; motivo: string }>;
  }> {
    const fallidos: Array<{ id: string; trackingNumber?: string; motivo: string }> = [];
    let exitosos = 0;

    if (input.action === 'asignar_repartidor') {
      const { data: repartidor } = await supabase
        .from('repartidores')
        .select('nombre, estado')
        .eq('id', input.payload.repartidorId)
        .eq('eliminado', false)
        .single();

      if (!repartidor) {
        throw AppError.notFound('Repartidor', input.payload.repartidorId);
      }
      if ((repartidor as { estado: string }).estado !== 'activo') {
        throw AppError.badRequest('No se puede asignar un repartidor inactivo');
      }
    }

    for (const id of input.ids) {
      try {
        if (input.action === 'cambiar_estado') {
          await this.updateEstado(
            id,
            { estado: input.payload.estado, descripcion: input.payload.descripcion },
            userId,
            userName,
            ipAddress,
            userAgent
          );
        } else {
          await this.asignarRepartidor(
            id,
            input.payload.repartidorId,
            userId,
            userName,
            ipAddress,
            userAgent
          );
        }
        exitosos += 1;
      } catch (err) {
        const motivo = err instanceof AppError ? err.message : 'Error desconocido';
        fallidos.push({ id, motivo });
      }
    }

    return {
      total: input.ids.length,
      exitosos,
      fallidos,
    };
  }

  async listIntentosContacto(envioId: string): Promise<IntentoContacto[]> {
    const { data: exists, error: checkErr } = await supabase
      .from('envios')
      .select('id')
      .eq('id', envioId)
      .eq('eliminado', false)
      .single();

    if (checkErr || !exists) {
      throw AppError.notFound('Envio', envioId);
    }

    const { data, error } = await supabase
      .from('intentos_contacto')
      .select('id, envio_id, tipo, descripcion, registrado_por, registrado_por_nombre, created_at')
      .eq('envio_id', envioId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error({ error, envioId }, 'Error fetching intentos contacto');
      throw new AppError('Error fetching intentos contacto', 500, 'DB_ERROR');
    }

    return ((data ?? []) as Array<{
      id: string;
      envio_id: string;
      tipo: IntentoContactoTipo;
      descripcion: string | null;
      registrado_por: string | null;
      registrado_por_nombre: string;
      created_at: string;
    }>).map((row) => ({
      id: row.id,
      envioId: row.envio_id,
      tipo: row.tipo,
      descripcion: row.descripcion,
      registradoPor: row.registrado_por,
      registradoPorNombre: row.registrado_por_nombre,
      creadoEn: row.created_at,
    }));
  }

  async createIntentoContacto(
    envioId: string,
    input: CreateIntentoContactoInput,
    userId: string,
    userName: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<IntentoContacto> {
    const { data: envioCheck, error: checkErr } = await supabase
      .from('envios')
      .select('id, tracking_number')
      .eq('id', envioId)
      .eq('eliminado', false)
      .single();

    if (checkErr || !envioCheck) {
      throw AppError.notFound('Envio', envioId);
    }

    const { data, error } = await supabase
      .from('intentos_contacto')
      .insert({
        envio_id: envioId,
        tipo: input.tipo,
        descripcion: input.descripcion ?? null,
        registrado_por: userId,
        registrado_por_nombre: userName,
      })
      .select('id, envio_id, tipo, descripcion, registrado_por, registrado_por_nombre, created_at')
      .single();

    if (error || !data) {
      logger.error({ error, envioId }, 'Error creating intento contacto');
      throw new AppError('Error creating intento contacto', 500, 'DB_ERROR');
    }

    const row = data as {
      id: string;
      envio_id: string;
      tipo: IntentoContactoTipo;
      descripcion: string | null;
      registrado_por: string | null;
      registrado_por_nombre: string;
      created_at: string;
    };

    const trackingNumber = (envioCheck as { tracking_number: string }).tracking_number;
    const tipoLabel = input.tipo === 'llamada' ? 'llamada'
      : input.tipo === 'whatsapp' ? 'WhatsApp'
      : 'visita fallida';

    await auditoriaService.log({
      usuario: userName,
      usuarioId: userId,
      accion: 'nota',
      entidad: 'envio',
      entidadId: envioId,
      descripcion: `Intento de contacto (${tipoLabel}) en envio ${trackingNumber}${input.descripcion ? `: ${input.descripcion}` : ''}`,
      ipAddress,
      userAgent,
    });

    return {
      id: row.id,
      envioId: row.envio_id,
      tipo: row.tipo,
      descripcion: row.descripcion,
      registradoPor: row.registrado_por,
      registradoPorNombre: row.registrado_por_nombre,
      creadoEn: row.created_at,
    };
  }
}

export const envioService = new EnvioService();
