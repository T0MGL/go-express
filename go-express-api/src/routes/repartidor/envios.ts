import { Router } from 'express';
import { z } from 'zod';
import * as Sentry from '@sentry/node';
import { asyncHandler, AppError } from '../../middleware/errorHandler.js';
import { validate } from '../../middleware/validate.js';
import { supabase } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { sseService } from '../../services/sse.service.js';
import { idParamSchema } from '../../lib/validators/common.schema.js';
import { nowISO, todayPY } from '../../lib/datetime.js';
import { auditoriaService } from '../../services/auditoria.service.js';
import { pagoService } from '../../services/pago.service.js';
import { envioService } from '../../services/envio.service.js';
import { validarDiferenciaCobroCod, CodValidationError } from '../../lib/cod.js';
import { warehouseService } from '../../services/warehouse.service.js';

// Usuario sistema GoExpress. El repartidor no es entidad usuarios(id), pero el pago y la
// auditoria viven en tablas con FK a usuarios. Atribuimos al sistema y preservamos la
// identidad del repartidor en la descripcion y en envios.repartidor_id.
const SISTEMA_USER_ID = '00000000-0000-4000-a000-000000000001';

const router = Router();

const misEnviosQuerySchema = z.object({
  rango: z.enum(['hoy', 'semana', 'mes']).default('hoy'),
  filtro: z.enum(['pendientes', 'entregados', 'incidencias', 'todos']).default('pendientes'),
});

const entregadoBodySchema = z.object({
  nombreRecibe: z.string().min(1).max(200),
  documento: z.string().max(50).optional(),
  // COD all-or-nothing (ALTA 4): si viene, debe ser el monto exacto del envio. Un cobro menor va
  // por incidencia, no por entrega. Si se omite, se asume el monto_a_cobrar del envio.
  montoCobrado: z.number().int().min(0).optional(),
  fotoPath: z.string().max(500).optional(),
  notas: z.string().max(500).optional(),
});

const incidenciaBodySchema = z.object({
  nota: z.string().min(3).max(1000),
});

const signedUrlBodySchema = z.object({
  ext: z.enum(['jpg', 'jpeg', 'png', 'webp']).default('webp'),
});

const POD_BUCKET = 'pod-entregas';

function rangeBoundary(rango: 'hoy' | 'semana' | 'mes'): Date {
  const d = new Date();
  if (rango === 'hoy') {
    d.setHours(0, 0, 0, 0);
  } else if (rango === 'semana') {
    d.setDate(d.getDate() - 7);
  } else {
    d.setDate(d.getDate() - 30);
  }
  return d;
}

const ENVIO_SELECT_COLS = [
  'id', 'tracking_number', 'cliente_nombre', 'origen', 'destino',
  'destinatario_nombre', 'destinatario_telefono', 'destinatario_direccion',
  'destinatario_ciudad', 'destinatario_referencia',
  'estado', 'costo', 'monto_a_cobrar', 'tipo_pago', 'peso',
  'producto', 'fragil', 'notas', 'instrucciones_entrega',
  'dimensiones_largo', 'dimensiones_ancho', 'dimensiones_alto',
  'fecha', 'fecha_entrega_real', 'foto_entrega_url',
  'entregado_por_nombre', 'entregado_por_documento', 'monto_cobrado',
  'recolectado_en', 'tiene_incidencia', 'incidencia_nota', 'incidencia_reportada_en',
  'repartidor_id', 'repartidor_asignado_en',
  'created_at', 'updated_at',
].join(', ');

/**
 * GET /api/repartidor/mis-envios?rango=hoy|semana|mes&filtro=pendientes|entregados|incidencias|todos
 */
router.get(
  '/mis-envios',
  validate({ query: misEnviosQuerySchema }),
  asyncHandler(async (req, res) => {
    const { rango, filtro } = req.query as unknown as { rango: 'hoy' | 'semana' | 'mes'; filtro: 'pendientes' | 'entregados' | 'incidencias' | 'todos' };
    const repartidorId = req.repartidorId!;
    const since = rangeBoundary(rango).toISOString();

    let q = supabase
      .from('envios')
      .select(ENVIO_SELECT_COLS)
      .eq('repartidor_id', repartidorId)
      .eq('eliminado', false);

    if (filtro === 'entregados') {
      // Fecha de entrega real, no de asignacion: el paquete puede haber sido
      // asignado hace dias pero entregado hoy.
      q = q.eq('estado', 'entregado').gte('fecha_entrega_real', since);
    } else if (filtro === 'pendientes') {
      q = q.in('estado', ['pendiente', 'recolectado', 'en_reparto']).gte('repartidor_asignado_en', since);
    } else if (filtro === 'incidencias') {
      q = q.eq('tiene_incidencia', true).gte('repartidor_asignado_en', since);
    } else {
      q = q.gte('repartidor_asignado_en', since);
    }

    const { data, error } = await q.order('repartidor_asignado_en', { ascending: false }).limit(200);

    if (error) {
      logger.error({ err: error, repartidorId }, 'Error fetching mis envios');
      throw new AppError('Error fetching envios', 500, 'DB_ERROR');
    }

    res.json({ data: data ?? [] });
  }),
);

/**
 * GET /api/repartidor/mis-envios/:id
 */
router.get(
  '/mis-envios/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    const repartidorId = req.repartidorId!;

    const { data, error } = await supabase
      .from('envios')
      .select(ENVIO_SELECT_COLS)
      .eq('id', id)
      .eq('repartidor_id', repartidorId)
      .eq('eliminado', false)
      .single();

    if (error || !data) {
      throw AppError.notFound('Envio', id);
    }

    res.json(data);
  }),
);

/**
 * PATCH /api/repartidor/mis-envios/:id/recolectado
 */
router.patch(
  '/mis-envios/:id/recolectado',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    const repartidorId = req.repartidorId!;
    const repartidorNombre = req.repartidorNombre ?? 'Repartidor';

    // Verificacion de ownership (no-op en DB, solo guarda el race a nivel de autorizacion).
    // El estado se transita via RPC atomico que valida la transicion bajo SELECT FOR UPDATE.
    const { data: ownerCheck, error: fetchErr } = await supabase
      .from('envios')
      .select('repartidor_id, estado')
      .eq('id', id)
      .eq('eliminado', false)
      .single();

    if (fetchErr || !ownerCheck) {
      throw AppError.notFound('Envio', id);
    }

    const owner = ownerCheck as { repartidor_id: string | null; estado: string };
    if (owner.repartidor_id !== repartidorId) {
      throw AppError.forbidden('Este envio no esta asignado a vos');
    }

    // Idempotente: si ya esta recolectado, devolver ok sin tocar nada. Evita 422 espurios
    // en doble tap o reintentos por red intermitente desde el mobile del driver.
    if (owner.estado === 'recolectado') {
      res.json({ ok: true, idempotent: true });
      return;
    }

    await envioService.updateEstado(
      id,
      { estado: 'recolectado', descripcion: `Paquete recolectado por ${repartidorNombre}` },
      repartidorId,
      repartidorNombre,
      req.ip ?? undefined,
      req.headers['user-agent'] ?? undefined,
      SISTEMA_USER_ID,
    );

    sseService.broadcast({ entity: ['envios', id], action: 'updated' });
    sseService.broadcast({ entity: ['envios', 'list'], action: 'updated' });
    sseService.broadcast({ entity: ['dashboard'], action: 'updated' });

    res.json({ ok: true });
  }),
);

/**
 * PATCH /api/repartidor/mis-envios/:id/entregado
 */
router.patch(
  '/mis-envios/:id/entregado',
  validate({ params: idParamSchema, body: entregadoBodySchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    const { nombreRecibe, documento, montoCobrado, fotoPath, notas } = req.body as z.infer<typeof entregadoBodySchema>;
    const repartidorId = req.repartidorId!;
    const repartidorNombre = req.repartidorNombre ?? 'Repartidor';
    const ipAddress = req.ip ?? undefined;
    const userAgent = req.headers['user-agent'] ?? undefined;

    const { data: current, error: fetchErr } = await supabase
      .from('envios')
      .select('id, estado, repartidor_id, tipo_pago, monto_a_cobrar, tracking_number')
      .eq('id', id)
      .eq('eliminado', false)
      .single();

    if (fetchErr || !current) {
      throw AppError.notFound('Envio', id);
    }

    const envio = current as { id: string; estado: string; repartidor_id: string | null; tipo_pago: string; monto_a_cobrar: number; tracking_number: string };

    if (envio.repartidor_id !== repartidorId) {
      throw AppError.forbidden('Este envio no esta asignado a vos');
    }

    if (envio.estado === 'entregado') {
      throw AppError.badRequest('El envio ya esta marcado como entregado');
    }

    if (envio.estado !== 'recolectado' && envio.estado !== 'en_transito' && envio.estado !== 'en_reparto') {
      throw AppError.badRequest(
        envio.estado === 'pendiente'
          ? 'Debes recolectar el paquete antes de marcarlo como entregado'
          : `No se puede marcar como entregado desde estado "${envio.estado}"`,
      );
    }

    // Modelo COD-only (036): el repartidor cobra efectivo en AMBOS modos. contra_entrega cobra
    // producto+tarifa; anticipado cobra solo la tarifa (monto_a_cobrar == costo+seguro, I1 igualdad
    // enforzada en 037). En los dos casos hay efectivo en la calle que tiene que entrar a la
    // liquidacion, asi que los dos registran un pago COD al entregar. Sin esto, un anticipado
    // entregado quedaba sin pago y crear_liquidacion (que gatea por EXISTS pago pagado) nunca lo
    // tomaba: plata cobrada sin reconciliar.
    const cobraEfectivo = envio.monto_a_cobrar > 0;
    // El monto fisico que rinde el envio: en anticipado el importe es la tarifa fija (== monto_a_cobrar);
    // en contra_entrega es producto+tarifa (== monto_a_cobrar). create_pago_atomico recomputa el
    // importe esperado por modo del lado DB, asi que pasamos monto_a_cobrar como total en ambos.
    const montoCobradoCod = cobraEfectivo ? (montoCobrado ?? envio.monto_a_cobrar) : null;
    // metodo_pago refleja como entro el efectivo: contra_entrega es el COD clasico; en anticipado el
    // repartidor cobra el flete en efectivo. cuenta_corriente ya no existe en el modelo.
    const metodoPago = envio.tipo_pago === 'contra_entrega' ? 'contra_entrega' : 'efectivo';

    // COD all-or-nothing (ALTA 4): la entrega solo procede con el monto exacto. Sobrecobro y cobro
    // incompleto se rechazan; un cobro parcial real va por el endpoint de incidencia, no deja
    // efectivo registrado como cobrado que la liquidacion nunca exige rendir.
    if (cobraEfectivo && montoCobradoCod !== null) {
      try {
        validarDiferenciaCobroCod({
          montoEsperado: envio.monto_a_cobrar,
          montoReportado: montoCobradoCod,
        });
      } catch (err) {
        if (err instanceof CodValidationError) {
          throw AppError.unprocessable(err.message, err.code);
        }
        throw err;
      }
    }

    // UPDATE del envio (estado, POD) con OCC sobre estado previo. Si otra
    // sesion del mismo repartidor (doble tap o reintentos por red intermitente) o el
    // admin marcaron problema/fallido en paralelo, este UPDATE retorna 0 filas y
    // respondemos 409 sin clobberar datos. El trigger de pagos sincroniza envios.monto_cobrado
    // despues, desde el pago COD via RPC. Evitamos el set directo (hallazgo 3.2).
    const update: Record<string, unknown> = {
      estado: 'entregado',
      fecha_entrega_real: nowISO(),
      entregado_por_nombre: nombreRecibe,
    };
    if (documento) update['entregado_por_documento'] = documento;
    if (fotoPath) update['foto_entrega_url'] = fotoPath;
    if (notas) update['entrega_notas'] = notas;
    // No seteamos monto_cobrado en este UPDATE: el trigger de sync lo escribe desde el pago COD
    // (ambos modos pasan por el pago, abajo). Set directo seria un segundo camino para el mismo dato
    // y reabriria el hallazgo 3.2.

    const { data: updatedRow, error: updateErr } = await supabase
      .from('envios')
      .update(update)
      .eq('id', id)
      .eq('estado', envio.estado)
      .select('id')
      .maybeSingle();

    if (updateErr) {
      logger.error({ err: updateErr, id }, 'Error marking entregado');
      throw new AppError('Error actualizando envio', 500, 'DB_ERROR');
    }

    if (!updatedRow) {
      throw AppError.conflict('El estado del envio fue modificado por otro usuario. Recargue e intente de nuevo.');
    }

    // Pago COD atomico via RPC. Falla -> rollback del pago y auditoria en Postgres, pero
    // el UPDATE del envio no se revierte (no hay transaccion compartida posible entre
    // supabase-js individual calls). El trigger de sync se dispara al INSERT del pago y
    // actualiza envios.monto_cobrado. Si el RPC falla, envios queda como entregado sin
    // pago: estado operativamente correcto, la liquidacion simplemente no podra tomar
    // este envio hasta que se cree el pago manualmente desde admin.
    // COD all-or-nothing (ALTA 4): si llegamos aca el monto ya esta validado exacto, asi que el
    // pago entra siempre como 'pagado'. cod_pago_pendiente queda reservado para fallas reales de
    // asentamiento (RPC caido, o pago existente con monto divergente), NO para cobros parciales:
    // un parcial nunca llega a este punto, se rechaza arriba y va por incidencia.
    if (cobraEfectivo && montoCobradoCod !== null) {
      try {
        await pagoService.create(
          {
            envioId: id,
            montoTotal: envio.monto_a_cobrar,
            montoRecibido: montoCobradoCod,
            metodoPago,
            fechaPago: todayPY(),
          },
          SISTEMA_USER_ID,
          ipAddress,
          userAgent,
        );
      } catch (err) {
        // 409 = ya existe un pago activo para el envio. NO se traga incondicionalmente: si el
        // monto del pago existente difiere del que reporta el repartidor, hubo cobro real en la
        // calle que no se asento. Se marca cod_pago_pendiente y se alerta. Solo es benigno
        // (reintento idempotente) cuando el monto coincide exactamente (causa raiz D, race).
        if (err instanceof AppError && err.statusCode === 409) {
          const { data: activo } = await supabase
            .from('pagos')
            .select('monto_recibido')
            .eq('envio_id', id)
            .eq('anulado', false)
            .maybeSingle();
          const registrado = (activo as { monto_recibido: number } | null)?.monto_recibido ?? null;
          if (registrado !== null && registrado !== montoCobradoCod) {
            logger.error(
              { envioId: id, reportado: montoCobradoCod, registrado },
              'Entrega COD: monto reportado difiere del pago activo existente, marcado cod_pago_pendiente',
            );
            Sentry.captureMessage('cod_monto_divergente_pago_existente', {
              level: 'warning',
              extra: { envioId: id, reportado: montoCobradoCod, registrado },
            });
            const { error: flagErr } = await supabase
              .from('envios')
              .update({ cod_pago_pendiente: true })
              .eq('id', id);
            if (flagErr) {
              logger.error({ err: flagErr, envioId: id }, 'CRITICO: COD divergente sin poder marcar cod_pago_pendiente');
              Sentry.captureException(flagErr, { extra: { envioId: id, context: 'cod_pago_pendiente flag failed (409 divergente)' } });
            }
          } else {
            logger.warn({ envioId: id }, 'Entrega COD: reintento idempotente, pago activo coincide');
          }
        } else {
          logger.error({ err, envioId: id }, 'Entrega COD: fallo el registro del pago, envio marcado cod_pago_pendiente para reconciliacion');
          Sentry.captureException(err, { extra: { envioId: id, monto: montoCobradoCod } });

          const { error: flagErr } = await supabase
            .from('envios')
            .update({ cod_pago_pendiente: true })
            .eq('id', id);

          if (flagErr) {
            // No pudimos ni marcar la cola: esto es lo unico que NO puede quedar callado.
            logger.error({ err: flagErr, envioId: id }, 'CRITICO: COD cobrado sin pago Y sin poder marcar cod_pago_pendiente');
            Sentry.captureException(flagErr, { extra: { envioId: id, monto: montoCobradoCod, context: 'cod_pago_pendiente flag failed' } });
          }
        }
      }
    }

    const descripcion = cobraEfectivo
      ? `Entregado a ${nombreRecibe}. Cobrado Gs. ${(montoCobradoCod ?? 0).toLocaleString('es-PY')}.`
      : `Entregado a ${nombreRecibe}.`;

    await supabase.from('eventos_envio').insert({
      envio_id: id,
      estado: 'entregado',
      descripcion,
      registrado_por_nombre: repartidorNombre,
    });

    // La auditoria del repartidor usa el sistema user porque usuario_id FK a usuarios.
    // La identidad real del repartidor queda en la descripcion y en envios.repartidor_id.
    auditoriaService.log({
      usuario: repartidorNombre,
      usuarioId: SISTEMA_USER_ID,
      accion: 'cambio_estado',
      entidad: 'envio',
      entidadId: id,
      descripcion: `Repartidor ${repartidorNombre} marco entregado: ${envio.tracking_number}${cobraEfectivo ? '. COD Gs. ' + (montoCobradoCod ?? 0).toLocaleString('es-PY') : ''}`,
      ipAddress,
      userAgent,
    });

    sseService.broadcast({ entity: ['envios', id], action: 'updated' });
    sseService.broadcast({ entity: ['envios', 'list'], action: 'updated' });
    sseService.broadcast({ entity: ['dashboard'], action: 'updated' });
    if (cobraEfectivo) {
      sseService.broadcast({ entity: ['pagos'], action: 'created' });
    }

    res.json({ ok: true });
  }),
);

/**
 * PATCH /api/repartidor/mis-envios/:id/incidencia
 *
 * Flags envio with an incident note. Does NOT change principal estado.
 */
router.patch(
  '/mis-envios/:id/incidencia',
  validate({ params: idParamSchema, body: incidenciaBodySchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    const { nota } = req.body as z.infer<typeof incidenciaBodySchema>;
    const repartidorId = req.repartidorId!;
    const repartidorNombre = req.repartidorNombre ?? 'Repartidor';

    const { data: current, error: fetchErr } = await supabase
      .from('envios')
      .select('id, repartidor_id, tracking_number')
      .eq('id', id)
      .eq('eliminado', false)
      .single();

    if (fetchErr || !current) {
      throw AppError.notFound('Envio', id);
    }

    const envio = current as { id: string; repartidor_id: string | null; tracking_number: string };

    if (envio.repartidor_id !== repartidorId) {
      throw AppError.forbidden('Este envio no esta asignado a vos');
    }

    const { error: updateErr } = await supabase
      .from('envios')
      .update({
        tiene_incidencia: true,
        incidencia_nota: nota,
        incidencia_reportada_en: nowISO(),
        incidencia_reportada_por: repartidorId,
      })
      .eq('id', id);

    if (updateErr) {
      logger.error({ err: updateErr, id }, 'Error reporting incidencia');
      throw new AppError('Error registrando incidencia', 500, 'DB_ERROR');
    }

    await supabase.from('eventos_envio').insert({
      envio_id: id,
      estado: 'problema',
      descripcion: `Incidencia reportada por ${repartidorNombre}: ${nota}`,
      registrado_por_nombre: repartidorNombre,
    });

    auditoriaService.log({
      usuario: repartidorNombre,
      usuarioId: repartidorId,
      accion: 'nota',
      entidad: 'envio',
      entidadId: id,
      descripcion: `Repartidor reporto incidencia: ${envio.tracking_number}`,
      ipAddress: req.ip ?? undefined,
      userAgent: req.headers['user-agent'] ?? undefined,
    });

    sseService.broadcast({ entity: ['envios', id], action: 'updated' });
    sseService.broadcast({ entity: ['envios', 'list'], action: 'updated' });
    sseService.broadcast({ entity: ['dashboard'], action: 'updated' });

    res.json({ ok: true });
  }),
);

/**
 * PATCH /api/repartidor/mis-envios/:id/almacen
 * El repartidor deposita el paquete en el almacén tras recolectarlo del cliente.
 * Transiciona estado a en_transito y crea registro en inventario_almacen.
 */
router.patch(
  '/mis-envios/:id/almacen',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    const repartidorId = req.repartidorId!;
    const repartidorNombre = req.repartidorNombre ?? 'Repartidor';

    const { data: current, error: fetchErr } = await supabase
      .from('envios')
      .select('id, estado, repartidor_id, tracking_number, cliente_nombre, peso, dimensiones_largo, dimensiones_ancho, dimensiones_alto, fragil')
      .eq('id', id)
      .eq('eliminado', false)
      .single();

    if (fetchErr || !current) {
      throw AppError.notFound('Envio', id);
    }

    const envio = current as {
      id: string;
      estado: string;
      repartidor_id: string | null;
      tracking_number: string;
      cliente_nombre: string;
      peso: number | null;
      dimensiones_largo: number | null;
      dimensiones_ancho: number | null;
      dimensiones_alto: number | null;
      fragil: boolean;
    };

    if (envio.repartidor_id !== repartidorId) {
      throw AppError.forbidden('Este envio no esta asignado a vos');
    }

    if (envio.estado === 'en_transito' || envio.estado === 'en_deposito') {
      // Idempotente: ya esta en almacen, devolver ok sin tocar nada. Cubre doble tap
      // y reintentos por red intermitente desde el mobile del driver.
      sseService.broadcast({ entity: ['envios', id], action: 'updated' });
      res.json({ ok: true, idempotent: true });
      return;
    }

    if (envio.estado !== 'recolectado') {
      throw AppError.badRequest(
        envio.estado === 'pendiente'
          ? 'Debes recolectar el paquete antes de depositarlo en almacén'
          : `No se puede depositar en almacén desde estado "${envio.estado}"`,
      );
    }

    // Transicion atomica recolectado -> en_transito via RPC. eventos_envio + auditoria
    // se insertan en la misma transaccion plpgsql. Si alguien mas movio el estado, el
    // RPC raisea transicion_invalida y este endpoint responde 422 sin clobberar.
    await envioService.updateEstado(
      id,
      { estado: 'en_transito', descripcion: `Paquete depositado en almacén por ${repartidorNombre}` },
      repartidorId,
      repartidorNombre,
      req.ip ?? undefined,
      req.headers['user-agent'] ?? undefined,
      SISTEMA_USER_ID,
    );

    const dimensiones =
      envio.dimensiones_largo && envio.dimensiones_ancho && envio.dimensiones_alto
        ? { largo: envio.dimensiones_largo, ancho: envio.dimensiones_ancho, alto: envio.dimensiones_alto }
        : undefined;

    // Warehouse ingreso is best-effort: the state transition above is the critical
    // operation. If the inventario record fails, the admin can ingest manually.
    try {
      await warehouseService.ingreso(
        {
          envioId: id,
          trackingNumber: envio.tracking_number,
          clienteNombre: envio.cliente_nombre,
          ubicacion: 'Depósito - Sin asignar',
          zona: 'A',
          peso: envio.peso ?? 0.1,
          dimensiones,
          prioridad: envio.fragil ? 'urgente' : 'normal',
        },
        SISTEMA_USER_ID,
        repartidorNombre,
        req.ip ?? undefined,
        req.headers['user-agent'] ?? undefined,
      );
    } catch (warehouseErr) {
      logger.error({ err: warehouseErr, envioId: id, tracking: envio.tracking_number }, 'Warehouse ingreso from repartidor failed, envio still marked en_transito');
    }

    // eventos_envio + auditoria_log ya fueron insertados por update_envio_estado_atomico
    // dentro de la misma transaccion. No duplicar aqui.

    sseService.broadcast({ entity: ['envios', id], action: 'updated' });
    sseService.broadcast({ entity: ['envios', 'list'], action: 'updated' });
    sseService.broadcast({ entity: ['almacen'], action: 'updated' });
    sseService.broadcast({ entity: ['dashboard'], action: 'updated' });

    res.json({ ok: true });
  }),
);

/**
 * POST /api/repartidor/mis-envios/:id/pod-signed-url
 *
 * Returns a signed upload URL for the POD photo. Client uploads directly to Storage.
 * Path convention: "${envio_id}/pod_${timestamp}.${ext}"
 */
router.post(
  '/mis-envios/:id/pod-signed-url',
  validate({ params: idParamSchema, body: signedUrlBodySchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    const { ext } = req.body as z.infer<typeof signedUrlBodySchema>;
    const repartidorId = req.repartidorId!;

    const { data: current, error: fetchErr } = await supabase
      .from('envios')
      .select('id, repartidor_id')
      .eq('id', id)
      .eq('eliminado', false)
      .single();

    if (fetchErr || !current) {
      throw AppError.notFound('Envio', id);
    }

    const envio = current as { id: string; repartidor_id: string | null };

    if (envio.repartidor_id !== repartidorId) {
      throw AppError.forbidden('Este envio no esta asignado a vos');
    }

    const path = `${id}/pod_${Date.now()}.${ext}`;

    const { data, error } = await supabase.storage
      .from(POD_BUCKET)
      .createSignedUploadUrl(path);

    if (error || !data) {
      logger.error({ err: error, id }, 'Error creating signed upload url');
      throw new AppError('No se pudo generar URL de subida', 500, 'STORAGE_ERROR');
    }

    res.json({
      path,
      token: data.token,
      signedUrl: data.signedUrl,
    });
  }),
);

/**
 * GET /api/repartidor/pod/:path/signed-url
 *
 * Returns a short-lived signed URL to view a POD photo that this repartidor uploaded.
 */
router.get(
  '/pod-download-url',
  asyncHandler(async (req, res) => {
    const path = String(req.query['path'] ?? '');
    if (!path || !path.includes('/')) {
      throw AppError.badRequest('path requerido');
    }
    const envioId = path.split('/')[0]!;
    const repartidorId = req.repartidorId!;

    const { data: envio, error: envioErr } = await supabase
      .from('envios')
      .select('id, repartidor_id')
      .eq('id', envioId)
      .eq('eliminado', false)
      .single();

    if (envioErr || !envio) throw AppError.notFound('Envio', envioId);
    if ((envio as { repartidor_id: string }).repartidor_id !== repartidorId) {
      throw AppError.forbidden('No tenes acceso a este envio');
    }

    const { data, error } = await supabase.storage
      .from(POD_BUCKET)
      .createSignedUrl(path, 600);

    if (error || !data) {
      throw new AppError('No se pudo generar URL de descarga', 500, 'STORAGE_ERROR');
    }

    res.json({ signedUrl: data.signedUrl });
  }),
);

export default router;
