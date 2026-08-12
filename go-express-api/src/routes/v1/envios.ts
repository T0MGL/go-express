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
import { todayPY, nowISO } from '../../lib/datetime.js';
import { hashIdempotencyBody } from '../../lib/idempotency.js';
import { createClienteEnvioSchema } from '../../lib/validators/envio.schema.js';
import { v1EnviosQuerySchema, v1TrackingParamSchema, idempotencyKeySchema } from '../../lib/validators/api-key.schema.js';
import { toV1Envio } from './projection.js';
import { SANDBOX_FIXTURES, findSandboxFixture, generateSandboxTracking } from './sandbox.js';
import type { EnvioRow, EventoEnvioRow, Envio } from '../../types/index.js';
import type { CreateClienteEnvioInput } from '../../lib/validators/envio.schema.js';
import type { V1EnviosQuery } from '../../lib/validators/api-key.schema.js';
import type { V1Envio } from './projection.js';
import type { V1EnvioSimulado } from './sandbox.js';

// Usuario SISTEMA (sql/032): actor FK-valido en auditoria_log para acciones sin usuario
// humano. La identidad real de la API key va en el texto del log.
const SISTEMA_USER_ID = '00000000-0000-4000-a000-000000000001';

const router = Router();

// Replay de idempotencia: busca el envio original por (cliente_id, Idempotency-Key).
// Sin filtro de eliminado a proposito: la key quedo consumida aunque el envio se haya
// anulado despues, y ese caso es un conflicto explicito, no un duplicado silencioso.
async function findEnvioByIdempotencyKey(
  clienteId: string,
  idempotencyKey: string
): Promise<{ envio: Envio; eliminado: boolean; bodyHash: string | null } | null> {
  const { data, error } = await supabase
    .from('envios')
    .select(`${ENVIO_COLUMNS}, eliminado, api_idempotency_body_hash`)
    .eq('cliente_id', clienteId)
    .eq('api_idempotency_key', idempotencyKey)
    .maybeSingle();

  if (error) {
    logger.error({ error, clienteId }, 'Error buscando envio por idempotency key');
    throw new AppError('Error creando envio', 500, 'DB_ERROR');
  }

  if (!data) return null;

  const row = data as unknown as EnvioRow & { eliminado: boolean; api_idempotency_body_hash: string | null };
  return { envio: mapEnvioRowToApi(row), eliminado: row.eliminado, bodyHash: row.api_idempotency_body_hash };
}

// Un replay valido devuelve el envio original; reusar la key con un body DISTINTO es un
// bug del integrador y responde 409 en vez de entregarle un envio que no pidio.
function resolveReplay(
  previo: { envio: Envio; eliminado: boolean; bodyHash: string | null },
  bodyHash: string
): V1Envio {
  if (previo.eliminado) {
    throw AppError.conflict('La Idempotency-Key corresponde a un envio anulado. Usa una key nueva.');
  }
  // bodyHash null = envio pre-054, sin fingerprint para comparar: replay permisivo.
  if (previo.bodyHash !== null && previo.bodyHash !== bodyHash) {
    throw new AppError(
      'La Idempotency-Key ya fue usada con un payload distinto. Cada envio nuevo necesita su propia key.',
      409,
      'IDEMPOTENCY_KEY_REUSED'
    );
  }
  return toV1Envio(previo.envio);
}

// POST /: crea un envio para el cliente duenio de la key.
// Mismo contrato server-side que el portal cliente (routes/cliente/envios.ts): el tercero
// NO manda clienteId, costo, tipoPago ni montoACobrar. El server deriva origen desde
// cliente.ciudad, cotiza costo + seguro (computeCostoEnvio / computeSeguroForEnvio) y
// factura anticipado con monto_a_cobrar = costo + seguro (I1).
// Idempotencia: con el header Idempotency-Key, un retry devuelve el envio original (200)
// en vez de duplicarlo; misma key con body distinto = 409 IDEMPOTENCY_KEY_REUSED.
// Keys de test (ge_test_): validacion y cotizacion REALES, pero el envio se simula y no
// se escribe NADA en la DB.

router.post(
  '/',
  requirePermiso('crear_envios'),
  validate({ body: createClienteEnvioSchema }),
  asyncHandler(async (req, res) => {
    const clienteId = req.clienteId!;
    const input = req.body as CreateClienteEnvioInput;
    const modoTest = req.apiKeyModoTest === true;

    const rawIdempotencyKey = req.headers['idempotency-key'];
    let idempotencyKey: string | null = null;
    let bodyHash: string | null = null;
    if (rawIdempotencyKey !== undefined) {
      const parsed = idempotencyKeySchema.safeParse(
        Array.isArray(rawIdempotencyKey) ? rawIdempotencyKey[0] : rawIdempotencyKey
      );
      if (!parsed.success) {
        throw AppError.badRequest('Idempotency-Key invalida', parsed.error.issues);
      }
      idempotencyKey = parsed.data;
      bodyHash = hashIdempotencyBody(input);

      // En sandbox no hay persistencia, asi que tampoco hay replay: cada POST simula
      // un envio nuevo. Se valida el header igual para que el integrador lo ejercite.
      if (!modoTest) {
        const previo = await findEnvioByIdempotencyKey(clienteId, idempotencyKey);
        if (previo) {
          res.status(200).json(resolveReplay(previo, bodyHash));
          return;
        }
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

    const valorDeclarado = input.valorDeclarado ?? 0;
    const { seguroAdicional, costoSeguro } = await computeSeguroForEnvio(
      valorDeclarado,
      input.seguroAdicional
    );

    const hasDims = !!input.dimensiones && input.dimensiones.largo > 0 && input.dimensiones.ancho > 0 && input.dimensiones.alto > 0;

    // Sandbox: mismo pipeline de validacion y cotizacion que live, pero el envio se
    // devuelve simulado. Cero escrituras: ni envios, ni eventos, ni auditoria, ni SSE.
    if (modoTest) {
      const simulado: V1EnvioSimulado = {
        trackingNumber: generateSandboxTracking(),
        codigoReferencia: input.codigoReferencia ?? null,
        estado: 'pendiente',
        origen: cotizacion.origen,
        destino: cotizacion.destino,
        destinatarioNombre: input.destinatarioNombre,
        destinatarioDireccion: input.destinatarioDireccion,
        destinatarioTelefono: input.destinatarioTelefono,
        destinatarioCiudad: cotizacion.destino,
        destinatarioDepartamento: input.destinatarioDepartamento ?? '',
        cantidad: input.cantidad,
        producto: input.producto ?? '',
        peso: input.peso,
        dimensiones: {
          largo: hasDims ? input.dimensiones!.largo : null,
          ancho: hasDims ? input.dimensiones!.ancho : null,
          alto: hasDims ? input.dimensiones!.alto : null,
        },
        fragil: input.fragil,
        valorDeclarado,
        costo: cotizacion.costo,
        costoSeguro,
        montoACobrar: cotizacion.costo + costoSeguro,
        tipoPago: 'anticipado',
        seguroAdicional,
        fecha: todayPY(),
        fechaEntregaReal: null,
        creadoEn: nowISO(),
        simulated: true,
      };

      logger.info(
        { keyPrefix: req.apiKeyPrefix, tracking: simulado.trackingNumber },
        'Envio simulado via API v1 (modo test)'
      );

      res.status(201).json(simulado);
      return;
    }

    const trackingNumber = await generateTrackingNumber(supabase);

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
        api_idempotency_body_hash: bodyHash,
      })
      .select(ENVIO_COLUMNS)
      .single();

    if (insertError || !insertedData) {
      // Race de dos retries simultaneos con la misma Idempotency-Key: el unique parcial
      // rechaza al segundo. Se resuelve como replay del que gano (o 409 si el body
      // difiere), no como error.
      if (idempotencyKey && bodyHash && insertError?.code === '23505' && insertError.message.includes('idx_envios_api_idempotency')) {
        const previo = await findEnvioByIdempotencyKey(clienteId, idempotencyKey);
        if (previo) {
          res.status(200).json(resolveReplay(previo, bodyHash));
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
// Keys de test: fixtures deterministas (3 envios, estados distintos) para probar el parseo.

router.get(
  '/',
  requirePermiso('consultar_envios'),
  validate({ query: v1EnviosQuerySchema }),
  asyncHandler(async (req, res) => {
    const clienteId = req.clienteId!;
    const { limit, page = 1, estado, fechaDesde, fechaHasta } = req.query as unknown as V1EnviosQuery;

    if (req.apiKeyModoTest) {
      const fixtures = SANDBOX_FIXTURES
        .map((f) => f.envio)
        .filter((e) => !estado || e.estado === estado);
      res.json({
        data: fixtures,
        pagination: {
          total: fixtures.length,
          page: 1,
          limit,
          totalPages: 1,
          hasMore: false,
        },
      });
      return;
    }

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
// Keys de test: responde el fixture que matchee (GE-TEST-...) o 404 con la forma real.

router.get(
  '/:trackingNumber',
  requirePermiso('consultar_envios'),
  validate({ params: v1TrackingParamSchema }),
  asyncHandler(async (req, res) => {
    const clienteId = req.clienteId!;
    const trackingNumber = req.params['trackingNumber'] as string;

    if (req.apiKeyModoTest) {
      const fixture = findSandboxFixture(trackingNumber);
      if (!fixture) {
        throw AppError.notFound('Envio', trackingNumber);
      }
      res.json({ ...fixture.envio, eventos: fixture.eventos });
      return;
    }

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
