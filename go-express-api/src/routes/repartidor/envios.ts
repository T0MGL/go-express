import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, AppError } from '../../middleware/errorHandler.js';
import { validate } from '../../middleware/validate.js';
import { supabase } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { sseService } from '../../services/sse.service.js';
import { idParamSchema } from '../../lib/validators/common.schema.js';
import { nowISO } from '../../lib/datetime.js';
import { auditoriaService } from '../../services/auditoria.service.js';

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
      .eq('eliminado', false)
      .gte('repartidor_asignado_en', since);

    if (filtro === 'entregados') {
      q = q.eq('estado', 'entregado');
    } else if (filtro === 'pendientes') {
      q = q.in('estado', ['pendiente', 'recolectado', 'en_transito', 'en_reparto']);
    } else if (filtro === 'incidencias') {
      q = q.eq('tiene_incidencia', true);
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
    const { nombreRecibe, documento, montoCobrado, fotoPath, notas } = req.body as z.infer<typeof entregadoBodySchema>;
    const repartidorId = req.repartidorId!;
    const repartidorNombre = req.repartidorNombre ?? 'Repartidor';

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

    if (envio.estado !== 'pendiente' && envio.estado !== 'recolectado' && envio.estado !== 'en_transito' && envio.estado !== 'en_reparto') {
      throw AppError.badRequest(`No se puede entregar desde estado "${envio.estado}"`);
    }

    const update: Record<string, unknown> = {
      estado: 'entregado',
      fecha_entrega_real: nowISO(),
      entregado_por_nombre: nombreRecibe,
      tiene_incidencia: false,
    };
    if (documento) update['entregado_por_documento'] = documento;
    if (fotoPath) update['foto_entrega_url'] = fotoPath;
    if (notas) update['entrega_notas'] = notas;
    if (envio.tipo_pago === 'contra_entrega') {
      update['monto_cobrado'] = montoCobrado ?? envio.monto_a_cobrar;
    } else if (montoCobrado !== undefined && montoCobrado > 0) {
      update['monto_cobrado'] = montoCobrado;
    }

    const { error: updateErr } = await supabase.from('envios').update(update).eq('id', id);

    if (updateErr) {
      logger.error({ err: updateErr, id }, 'Error marking entregado');
      throw new AppError('Error actualizando envio', 500, 'DB_ERROR');
    }

    const descripcion = envio.tipo_pago === 'contra_entrega'
      ? `Entregado a ${nombreRecibe}. Cobrado Gs. ${(update['monto_cobrado'] as number).toLocaleString('es-PY')}.`
      : `Entregado a ${nombreRecibe}.`;

    await supabase.from('eventos_envio').insert({
      envio_id: id,
      estado: 'entregado',
      descripcion,
      registrado_por_nombre: repartidorNombre,
    });

    auditoriaService.log({
      usuario: repartidorNombre,
      usuarioId: repartidorId,
      accion: 'cambio_estado',
      entidad: 'envio',
      entidadId: id,
      descripcion: `Repartidor marco entregado: ${envio.tracking_number}`,
    });

    sseService.broadcast({ entity: ['envios', id], action: 'updated' });
    sseService.broadcast({ entity: ['envios', 'list'], action: 'updated' });
    sseService.broadcast({ entity: ['dashboard'], action: 'updated' });

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
    });

    sseService.broadcast({ entity: ['envios', id], action: 'updated' });
    sseService.broadcast({ entity: ['envios', 'list'], action: 'updated' });
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
