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
  montoCobrado: z.number().int().min(0).optional(),
  fotoPath: z.string().max(500).optional(),
  notas: z.string().max(500).optional(),
  // Nota forzada por el repartidor cuando la diferencia COD supera el 10%. El backend la
  // exige en ese caso y la deja en pagos.notas ademas de envios.incidencia_nota.
  notaIncidencia: z.string().trim().min(10).max(500).optional(),
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

    const { data: current, error: fetchErr } = await supabase
      .from('envios')
      .select('id, estado, repartidor_id, tracking_number')
      .eq('id', id)
      .eq('eliminado', false)
      .single();

    if (fetchErr || !current) {
      throw AppError.notFound('Envio', id);
    }

    const envio = current as { id: string; estado: string; repartidor_id: string | null; tracking_number: string };

    if (envio.repartidor_id !== repartidorId) {
      throw AppError.forbidden('Este envio no esta asignado a vos');
    }

    if (envio.estado !== 'pendiente' && envio.estado !== 'recolectado') {
      throw AppError.badRequest(`No se puede marcar como recolectado desde estado "${envio.estado}"`);
    }

    const { error: updateErr } = await supabase
      .from('envios')
      .update({ estado: 'recolectado', recolectado_en: nowISO() })
      .eq('id', id);

    if (updateErr) {
      logger.error({ err: updateErr, id }, 'Error marking recolectado');
      throw new AppError('Error actualizando envio', 500, 'DB_ERROR');
    }

    await supabase.from('eventos_envio').insert({
      envio_id: id,
      estado: 'recolectado',
      descripcion: `Paquete recolectado por ${repartidorNombre}`,
      registrado_por_nombre: repartidorNombre,
    });

    auditoriaService.log({
      usuario: repartidorNombre,
      usuarioId: repartidorId,
      accion: 'cambio_estado',
      entidad: 'envio',
      entidadId: id,
      descripcion: `Repartidor marco recolectado: ${envio.tracking_number}`,
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
 * PATCH /api/repartidor/mis-envios/:id/entregado
 */
router.patch(
  '/mis-envios/:id/entregado',
  validate({ params: idParamSchema, body: entregadoBodySchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    const { nombreRecibe, documento, montoCobrado, fotoPath, notas, notaIncidencia } = req.body as z.infer<typeof entregadoBodySchema>;
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

    // COD: decidir monto cobrado reportado y validar diferencia antes de tocar DB.
    // Si diferencia > 10% exigimos nota de incidencia. Failsafe para evitar que el
    // repartidor reporte un monto arbitrario sin justificacion (hallazgo 3.3).
    const esCod = envio.tipo_pago === 'contra_entrega';
    const montoCobradoCod = esCod ? (montoCobrado ?? envio.monto_a_cobrar) : null;
    let hayIncidencia = false;

    if (esCod && montoCobradoCod !== null) {
      try {
        const validation = validarDiferenciaCobroCod({
          montoEsperado: envio.monto_a_cobrar,
          montoReportado: montoCobradoCod,
          notaIncidencia,
        });
        hayIncidencia = validation.hayIncidencia;
      } catch (err) {
        if (err instanceof CodValidationError) {
          throw AppError.unprocessable(err.message, err.code);
        }
        throw err;
      }
    }

    // Primero el UPDATE del envio (estado, POD, incidencia). El trigger de pagos se
    // encarga despues de sincronizar envios.monto_cobrado desde el pago COD que
    // creamos via RPC. Evitamos el set directo del monto_cobrado (hallazgo 3.2).
    const update: Record<string, unknown> = {
      estado: 'entregado',
      fecha_entrega_real: nowISO(),
      entregado_por_nombre: nombreRecibe,
      tiene_incidencia: hayIncidencia,
    };
    if (documento) update['entregado_por_documento'] = documento;
    if (fotoPath) update['foto_entrega_url'] = fotoPath;
    if (notas) update['entrega_notas'] = notas;
    if (hayIncidencia && notaIncidencia) {
      update['incidencia_nota'] = notaIncidencia;
      update['incidencia_reportada_en'] = nowISO();
      update['incidencia_reportada_por'] = repartidorId;
    }
    // Envios no-COD: si el repartidor reporta un monto (anticipado que se cobro en
    // efectivo), lo reflejamos como cache directo. No hay pago atomico asociado porque
    // el pago anticipado suele haberse registrado antes. Mantiene compat con el flujo
    // previo.
    if (!esCod && montoCobrado !== undefined && montoCobrado > 0) {
      update['monto_cobrado'] = montoCobrado;
    }

    const { error: updateErr } = await supabase.from('envios').update(update).eq('id', id);

    if (updateErr) {
      logger.error({ err: updateErr, id }, 'Error marking entregado');
      throw new AppError('Error actualizando envio', 500, 'DB_ERROR');
    }

    // Pago COD atomico via RPC. Falla -> rollback del pago y auditoria en Postgres, pero
    // el UPDATE del envio no se revierte (no hay transaccion compartida posible entre
    // supabase-js individual calls). El trigger de sync se dispara al INSERT del pago y
    // actualiza envios.monto_cobrado. Si el RPC falla, envios queda como entregado sin
    // pago: estado operativamente correcto, la liquidacion simplemente no podra tomar
    // este envio hasta que se cree el pago manualmente desde admin.
    if (esCod && montoCobradoCod !== null && montoCobradoCod > 0) {
      const notaPago = hayIncidencia && notaIncidencia ? notaIncidencia : null;
      try {
        await pagoService.create(
          {
            envioId: id,
            montoTotal: envio.monto_a_cobrar,
            montoRecibido: montoCobradoCod,
            metodoPago: 'contra_entrega',
            fechaPago: todayPY(),
            ...(notaPago ? { notas: notaPago } : {}),
          },
          SISTEMA_USER_ID,
          ipAddress,
          userAgent,
        );
      } catch (err) {
        // Si ya existia un pago activo (pago anterior en el envio), ignoramos para no
        // romper la entrega. Cualquier otro error se loggea pero no rompe: el envio
        // queda como entregado y el pago se puede crear desde admin.
        if (err instanceof AppError && err.statusCode === 409) {
          logger.warn({ envioId: id }, 'Entrega COD: ya existe pago activo, no se crea uno nuevo');
        } else {
          logger.error({ err, envioId: id }, 'Entrega COD: fallo el RPC create_pago_atomico, envio queda sin pago asociado');
          Sentry.captureException(err, { extra: { envioId: id, monto: montoCobradoCod } });
        }
      }
    }

    const descripcion = esCod
      ? `Entregado a ${nombreRecibe}. Cobrado Gs. ${(montoCobradoCod ?? 0).toLocaleString('es-PY')}.${hayIncidencia ? ' Incidencia: ' + (notaIncidencia ?? '') : ''}`
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
      descripcion: `Repartidor ${repartidorNombre} marco entregado: ${envio.tracking_number}${esCod ? '. COD Gs. ' + (montoCobradoCod ?? 0).toLocaleString('es-PY') : ''}${hayIncidencia ? ' (incidencia)' : ''}`,
      ipAddress,
      userAgent,
    });

    sseService.broadcast({ entity: ['envios', id], action: 'updated' });
    sseService.broadcast({ entity: ['envios', 'list'], action: 'updated' });
    sseService.broadcast({ entity: ['dashboard'], action: 'updated' });
    if (esCod) {
      sseService.broadcast({ entity: ['pagos'], action: 'created' });
    }

    res.json({ ok: true, incidencia: hayIncidencia });
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

    if (envio.estado !== 'recolectado') {
      throw AppError.badRequest(
        envio.estado === 'pendiente'
          ? 'Debes recolectar el paquete antes de depositarlo en almacén'
          : `No se puede depositar en almacén desde estado "${envio.estado}"`,
      );
    }

    const { error: updateErr } = await supabase
      .from('envios')
      .update({ estado: 'en_transito' })
      .eq('id', id);

    if (updateErr) {
      logger.error({ err: updateErr, id }, 'Error transitioning to en_transito');
      throw new AppError('Error actualizando envio', 500, 'DB_ERROR');
    }

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

    await supabase.from('eventos_envio').insert({
      envio_id: id,
      estado: 'en_transito',
      descripcion: `Paquete depositado en almacén por ${repartidorNombre}`,
      registrado_por_nombre: repartidorNombre,
    });

    auditoriaService.log({
      usuario: repartidorNombre,
      usuarioId: SISTEMA_USER_ID,
      accion: 'cambio_estado',
      entidad: 'envio',
      entidadId: id,
      descripcion: `Repartidor ${repartidorNombre} deposito en almacen: ${envio.tracking_number}`,
      ipAddress: req.ip ?? undefined,
      userAgent: req.headers['user-agent'] ?? undefined,
    });

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
