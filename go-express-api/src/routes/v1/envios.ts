import { Router } from 'express';
import { asyncHandler, AppError } from '../../middleware/errorHandler.js';
import { validate } from '../../middleware/validate.js';
import { requirePermiso } from '../../middleware/apiKeyAuth.js';
import { supabase } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { auditoriaService } from '../../services/auditoria.service.js';
import { notificacionesService } from '../../services/notificaciones.service.js';
import { sseService } from '../../services/sse.service.js';
import { computeSeguroForEnvio, mapEnvioRowToApi, ENVIO_COLUMNS } from '../../services/envio.service.js';
import { computeCostoEnvio } from '../../lib/cotizacion.js';
import { generateTrackingNumber } from '../../lib/trackingNumber.js';
import { todayPY } from '../../lib/datetime.js';
import { createClienteEnvioSchema } from '../../lib/validators/envio.schema.js';
import { v1EnviosQuerySchema, idempotencyKeySchema } from '../../lib/validators/api-key.schema.js';
import { trackingParamSchema } from '../../lib/validators/common.schema.js';
import type { EnvioRow, EventoEnvioRow, Envio } from '../../types/index.js';
import type { CreateClienteEnvioInput } from '../../lib/validators/envio.schema.js';
import type { V1EnviosQuery } from '../../lib/validators/api-key.schema.js';

// Usuario SISTEMA (sql/032): actor FK-valido en auditoria_log para acciones sin usuario
// humano. La identidad real de la API key va en el texto del log.
const SISTEMA_USER_ID = '00000000-0000-4000-a000-000000000001';

const router = Router();

// Proyeccion publica del gateway: el tercero identifica el envio por tracking number.
// No se exponen ids internos, repartidor, incidencias ni campos de soft-delete.
interface V1Envio {
  trackingNumber: string;
  codigoReferencia: string | null;
  estado: string;
  origen: string;
  destino: string;
  destinatarioNombre: string;
  destinatarioDireccion: string;
  destinatarioTelefono: string;
  destinatarioCiudad: string;
  destinatarioDepartamento: string;
  cantidad: number;
  producto: string;
  peso: number;
  dimensiones: { largo: number | null; ancho: number | null; alto: number | null };
  fragil: boolean;
  valorDeclarado: number;
  costo: number;
  costoSeguro: number;
  montoACobrar: number;
  tipoPago: string;
  seguroAdicional: boolean;
  fecha: string;
  fechaEntregaReal: string | null;
  creadoEn: string;
}

function toV1Envio(envio: Envio): V1Envio {
  return {
    trackingNumber: envio.trackingNumber,
    codigoReferencia: envio.codigoReferencia,
    estado: envio.estado,
    origen: envio.origen,
    destino: envio.destino,
    destinatarioNombre: envio.destinatarioNombre,
    destinatarioDireccion: envio.destinatarioDireccion,
    destinatarioTelefono: envio.destinatarioTelefono,
    destinatarioCiudad: envio.destinatarioCiudad,
    destinatarioDepartamento: envio.destinatarioDepartamento,
    cantidad: envio.cantidad,
    producto: envio.producto,
    peso: envio.peso,
    dimensiones: envio.dimensiones,
    fragil: envio.fragil,
    valorDeclarado: envio.valorDeclarado,
    costo: envio.costo,
    costoSeguro: envio.costoSeguro,
    montoACobrar: envio.montoACobrar,
    tipoPago: envio.tipoPago,
    seguroAdicional: envio.seguroAdicional,
    fecha: envio.fecha,
    fechaEntregaReal: envio.fechaEntregaReal,
    creadoEn: envio.creadoEn,
  };
}

// Replay de idempotencia: busca el envio original por (cliente_id, Idempotency-Key).
// Sin filtro de eliminado a proposito: la key quedo consumida aunque el envio se haya
// anulado despues, y ese caso es un conflicto explicito, no un duplicado silencioso.
async function findEnvioByIdempotencyKey(
  clienteId: string,
  idempotencyKey: string
): Promise<{ envio: Envio; eliminado: boolean } | null> {
  const { data, error } = await supabase
    .from('envios')
    .select(`${ENVIO_COLUMNS}, eliminado`)
    .eq('cliente_id', clienteId)
    .eq('api_idempotency_key', idempotencyKey)
    .maybeSingle();

  if (error) {
    logger.error({ error, clienteId }, 'Error buscando envio por idempotency key');
    throw new AppError('Error creando envio', 500, 'DB_ERROR');
  }

  if (!data) return null;

  const row = data as unknown as EnvioRow & { eliminado: boolean };
  return { envio: mapEnvioRowToApi(row), eliminado: row.eliminado };
}

// POST /: crea un envio para el cliente duenio de la key.
// Mismo contrato server-side que el portal cliente (routes/cliente/envios.ts): el tercero
// NO manda clienteId, costo, tipoPago ni montoACobrar. El server deriva origen desde
// cliente.ciudad, cotiza costo + seguro (computeCostoEnvio / computeSeguroForEnvio) y
// factura anticipado con monto_a_cobrar = costo + seguro (I1).
// Idempotencia: con el header Idempotency-Key, un retry devuelve el envio original (200)
// en vez de duplicarlo. El unique parcial idx_envios_api_idempotency cierra el race.

router.post(
  '/',
  requirePermiso('crear_envios'),
  validate({ body: createClienteEnvioSchema }),
  asyncHandler(async (req, res) => {
    const clienteId = req.clienteId!;
    const input = req.body as CreateClienteEnvioInput;

    const rawIdempotencyKey = req.headers['idempotency-key'];
    let idempotencyKey: string | null = null;
    if (rawIdempotencyKey !== undefined) {
      const parsed = idempotencyKeySchema.safeParse(
        Array.isArray(rawIdempotencyKey) ? rawIdempotencyKey[0] : rawIdempotencyKey
      );
      if (!parsed.success) {
        throw AppError.badRequest('Idempotency-Key invalida', parsed.error.issues);
      }
      idempotencyKey = parsed.data;

      const previo = await findEnvioByIdempotencyKey(clienteId, idempotencyKey);
      if (previo) {
        if (previo.eliminado) {
          throw AppError.conflict('La Idempotency-Key corresponde a un envio anulado. Usa una key nueva.');
        }
        res.status(200).json(toV1Envio(previo.envio));
        return;
      }
    }

    const { data: clienteData, error: clienteError } = await supabase
      .from('clientes')
      .select('razon_social, ciudad')
      .eq('id', clienteId)
      .eq('eliminado', false)
      .single();

    // El middleware ya valido cliente activo; si desaparecio entre medio, 404 limpio.
    if (clienteError || !clienteData) {
      throw AppError.notFound('Cliente');
    }

    const clienteRow = clienteData as { razon_social: string; ciudad: string | null };
    const origenInput = clienteRow.ciudad?.trim() || 'Asuncion';
    const destinoInput = input.destinatarioCiudad.trim();

    const cotizacion = await computeCostoEnvio(supabase, {
      origen: origenInput,
      destino: destinoInput,
      peso: input.peso,
      dimensiones: input.dimensiones ?? null,
    });

    // A diferencia del portal (donde costo 0 lo tasa un admin despues), el gateway rechaza
    // rutas sin tarifa: un ERP a volumen no puede reservar flete gratis sin humano en el
    // loop. El tercero pre-valida con GET /tarifas.
    if (!cotizacion.matched) {
      throw new AppError(
        'No hay tarifa configurada para la ruta solicitada. Consulta GET /api/v1/tarifas o contacta a GO EXPRESS.',
        422,
        'RUTA_SIN_TARIFA',
        { origen: origenInput, destino: destinoInput }
      );
    }

    const trackingNumber = await generateTrackingNumber(supabase);

    const valorDeclarado = input.valorDeclarado ?? 0;
    const { seguroAdicional, costoSeguro } = await computeSeguroForEnvio(
      valorDeclarado,
      input.seguroAdicional
    );

    const hasDims = !!input.dimensiones && input.dimensiones.largo > 0 && input.dimensiones.ancho > 0 && input.dimensiones.alto > 0;

    const { data: insertedData, error: insertError } = await supabase
      .from('envios')
      .insert({
        tracking_number: trackingNumber,
        cliente_id: clienteId,
        cliente_nombre: clienteRow.razon_social,
        codigo_referencia: input.codigoReferencia ?? null,
        origen: cotizacion.origen,
        destino: cotizacion.destino,
        destinatario_nombre: input.destinatarioNombre,
        destinatario_direccion: input.destinatarioDireccion,
        destinatario_telefono: input.destinatarioTelefono,
        destinatario_telefono2: input.destinatarioTelefono2 ?? null,
        destinatario_cedula: input.destinatarioCedula ?? null,
        destinatario_ciudad: cotizacion.destino,
        destinatario_departamento: input.destinatarioDepartamento ?? '',
        destinatario_barrio: input.destinatarioBarrio ?? null,
        destinatario_referencia: input.destinatarioReferencia ?? null,
        destinatario_ubicacion_url: input.destinatarioUbicacionUrl ?? null,
        destinatario_email: input.destinatarioEmail ?? null,
        cantidad: input.cantidad,
        producto: input.producto ?? '',
        peso: input.peso,
        dimensiones_largo: hasDims ? input.dimensiones!.largo : null,
        dimensiones_ancho: hasDims ? input.dimensiones!.ancho : null,
        dimensiones_alto: hasDims ? input.dimensiones!.alto : null,
        fragil: input.fragil,
        valor_declarado: valorDeclarado,
        instrucciones_entrega: input.instruccionesEntrega ?? null,
        horario_entrega: input.horarioEntrega ?? null,
        notas: input.notas ?? null,
        estado: 'pendiente' as const,
        costo: cotizacion.costo,
        monto_a_cobrar: cotizacion.costo + costoSeguro,
        tipo_pago: 'anticipado' as const,
        seguro_adicional: seguroAdicional,
        costo_seguro: costoSeguro,
        tags: input.tags ?? [],
        tarifa_id: cotizacion.tarifaId,
        fecha: todayPY(),
        api_idempotency_key: idempotencyKey,
      })
      .select(ENVIO_COLUMNS)
      .single();

    if (insertError || !insertedData) {
      // Race de dos retries simultaneos con la misma Idempotency-Key: el unique parcial
      // rechaza al segundo. Se resuelve como replay del que gano, no como error.
      if (idempotencyKey && insertError?.code === '23505' && insertError.message.includes('idx_envios_api_idempotency')) {
        const previo = await findEnvioByIdempotencyKey(clienteId, idempotencyKey);
        if (previo && !previo.eliminado) {
          res.status(200).json(toV1Envio(previo.envio));
          return;
        }
      }
      logger.error({ error: insertError, clienteId, keyPrefix: req.apiKeyPrefix }, 'Error creando envio via API v1');
      throw new AppError('Error creando envio', 500, 'DB_ERROR');
    }

    const envio = mapEnvioRowToApi(insertedData as unknown as EnvioRow);
    const actorDescriptor = `API key "${req.apiKeyNombre}" (${req.apiKeyPrefix})`;

    const [eventoResult] = await Promise.all([
      supabase.from('eventos_envio').insert({
        envio_id: envio.id,
        estado: 'pendiente',
        descripcion: 'Envio creado via API',
      }),
      auditoriaService.log({
        usuario: actorDescriptor,
        usuarioId: SISTEMA_USER_ID,
        accion: 'crear',
        entidad: 'envio',
        entidadId: envio.id,
        descripcion: `Envio creado via API v1: ${trackingNumber} para ${clienteRow.razon_social} con ${actorDescriptor}`,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      }),
    ]);

    if (eventoResult.error) {
      logger.error({ error: eventoResult.error, envioId: envio.id }, 'Fallo insertar evento_envio tras crear via API v1');
    }

    // Mismo fan-out que el portal: notificaciones al destinatario + refresh del panel admin.
    void notificacionesService.dispatch('envio_creado', envio).catch((err: unknown) => {
      logger.error({ err, tracking: envio.trackingNumber }, '[NOTIF] dispatch envio_creado (API v1) fallo');
    });

    sseService.broadcastToRole({ entity: ['envios', 'list'], action: 'created' }, 'admin');
    sseService.broadcastToRole({ entity: ['dashboard'], action: 'updated' }, 'admin');

    res.status(201).json(toV1Envio(envio));
  })
);

// GET /: envios del cliente duenio de la key. Paginado + filtros estado y rango de fechas.
// El scope por cliente_id sale de la key, jamas del request: no existe consulta cross-cliente.

router.get(
  '/',
  requirePermiso('consultar_envios'),
  validate({ query: v1EnviosQuerySchema }),
  asyncHandler(async (req, res) => {
    const clienteId = req.clienteId!;
    const { limit, page = 1, estado, fechaDesde, fechaHasta } = req.query as unknown as V1EnviosQuery;
    const offset = (page - 1) * limit;

    let q = supabase
      .from('envios')
      .select(ENVIO_COLUMNS, { count: 'exact' })
      .eq('cliente_id', clienteId)
      .eq('eliminado', false);

    if (estado) q = q.eq('estado', estado);
    if (fechaDesde) q = q.gte('fecha', fechaDesde);
    if (fechaHasta) q = q.lte('fecha', fechaHasta);

    q = q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, count, error } = await q;

    if (error) {
      logger.error({ error, clienteId, keyPrefix: req.apiKeyPrefix }, 'Error listando envios via API v1');
      throw new AppError('Error listando envios', 500, 'DB_ERROR');
    }

    res.json({
      data: ((data ?? []) as unknown as EnvioRow[]).map((row) => toV1Envio(mapEnvioRowToApi(row))),
      pagination: {
        total: count ?? 0,
        page,
        limit,
        totalPages: Math.ceil((count ?? 0) / limit),
        hasMore: offset + limit < (count ?? 0),
      },
    });
  })
);

// GET /:trackingNumber: estado + historial de eventos, solo si el envio es del cliente
// de la key. Un tracking ajeno responde el mismo 404 que uno inexistente.

router.get(
  '/:trackingNumber',
  requirePermiso('consultar_envios'),
  validate({ params: trackingParamSchema }),
  asyncHandler(async (req, res) => {
    const clienteId = req.clienteId!;
    const trackingNumber = req.params['trackingNumber'] as string;

    const { data, error } = await supabase
      .from('envios')
      .select(ENVIO_COLUMNS)
      .eq('tracking_number', trackingNumber)
      .eq('cliente_id', clienteId)
      .eq('eliminado', false)
      .maybeSingle();

    if (error) {
      logger.error({ error, trackingNumber, keyPrefix: req.apiKeyPrefix }, 'Error consultando envio via API v1');
      throw new AppError('Error consultando envio', 500, 'DB_ERROR');
    }

    if (!data) {
      throw AppError.notFound('Envio', trackingNumber);
    }

    const envio = mapEnvioRowToApi(data as unknown as EnvioRow);

    const { data: eventosData, error: eventosError } = await supabase
      .from('eventos_envio')
      .select('estado, descripcion, ubicacion, created_at')
      .eq('envio_id', envio.id)
      .order('created_at', { ascending: true });

    if (eventosError) {
      logger.error({ error: eventosError, trackingNumber }, 'Error consultando eventos via API v1');
      throw new AppError('Error consultando eventos del envio', 500, 'DB_ERROR');
    }

    const eventos = ((eventosData ?? []) as unknown as Pick<EventoEnvioRow, 'estado' | 'descripcion' | 'ubicacion' | 'created_at'>[]).map((e) => ({
      estado: e.estado,
      descripcion: e.descripcion,
      ubicacion: e.ubicacion,
      fecha: e.created_at,
    }));

    res.json({ ...toV1Envio(envio), eventos });
  })
);

export default router;
