import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, AppError } from '../../middleware/errorHandler.js';
import { validate } from '../../middleware/validate.js';
import { bulkLimiter } from '../../middleware/rateLimit.js';
import { envioService } from '../../services/envio.service.js';
import { sseService } from '../../services/sse.service.js';
import { supabase } from '../../config/database.js';
import { nowISO } from '../../lib/datetime.js';
import { logger } from '../../config/logger.js';
import type { EnvioQuery } from '../../lib/validators/envio.schema.js';
import {
  createEnvioSchema,
  updateEnvioEstadoSchema,
  asignarRepartidorSchema,
  reportarProblemaSchema,
  agregarNotaSchema,
  envioQuerySchema,
  bulkImportSchema,
  bulkActionSchema,
} from '../../lib/validators/envio.schema.js';
import { idParamSchema, softDeleteSchema } from '../../lib/validators/common.schema.js';
import { createIntentoContactoSchema } from '../../lib/validators/intentos-contacto.schema.js';

const router = Router();

router.get(
  '/',
  validate({ query: envioQuerySchema }),
  asyncHandler(async (req, res) => {
    const result = await envioService.list(req.query as unknown as EnvioQuery);
    res.json(result);
  })
);

router.get(
  '/export',
  validate({ query: envioQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as EnvioQuery;
    const result = await envioService.list({ ...q, limit: 10000 });
    res.json(result.data);
  })
);

router.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const envio = await envioService.getById(req.params['id'] as string);
    res.json(envio);
  })
);

// Admin puede pasar forzarSobreLimite=true + motivoOverride en query string para crear
// envios cuenta_corriente que excederian el limite del cliente. El override queda en
// auditoria. Sin el flag, el insert falla con 422 limite_credito_excedido.
const createEnvioBodyWithOverride = createEnvioSchema.extend({
  forzarSobreLimite: z.boolean().optional(),
  motivoOverride: z.string().min(10).max(500).optional(),
});

router.post(
  '/',
  validate({ body: createEnvioBodyWithOverride }),
  asyncHandler(async (req, res) => {
    const { forzarSobreLimite, motivoOverride, ...envioInput } = req.body;
    if (forzarSobreLimite && !motivoOverride) {
      throw AppError.badRequest('motivoOverride es obligatorio cuando forzarSobreLimite=true');
    }
    const envio = await envioService.create(
      envioInput,
      req.userId!,
      req.userName!,
      req.ip ?? undefined,
      req.headers['user-agent'] ?? undefined,
      { forzarSobreLimite, motivoOverride }
    );
    sseService.broadcast({ entity: ['envios', 'list'], action: 'created' });
    sseService.broadcast({ entity: ['dashboard'], action: 'updated' });
    res.status(201).json(envio);
  })
);

router.post(
  '/bulk-import',
  bulkLimiter,
  validate({ body: bulkImportSchema }),
  asyncHandler(async (req, res) => {
    const result = await envioService.bulkImport(req.body.envios, req.userId!, req.userName!, req.ip ?? undefined, req.headers['user-agent'] ?? undefined);
    sseService.broadcast({ entity: ['envios', 'list'], action: 'bulk_created' });
    sseService.broadcast({ entity: ['dashboard'], action: 'updated' });
    res.status(201).json({
      imported: result.exitosos,
      failed: result.fallidos.length,
      results: result.trackingNumbers,
      errors: result.fallidos.length > 0 ? result.fallidos : undefined,
    });
  })
);

router.put(
  '/:id',
  validate({ params: idParamSchema, body: createEnvioSchema.partial().omit({ clienteId: true }) }),
  asyncHandler(async (req, res) => {
    const id = req.params['id'] as string;
    const envio = await envioService.update(id, req.body, req.userId!);
    sseService.broadcast({ entity: ['envios', 'list'], action: 'updated' });
    sseService.broadcast({ entity: ['envios', 'detail'], action: 'updated', id });
    res.json(envio);
  })
);

router.patch(
  '/:id/estado',
  validate({ params: idParamSchema, body: updateEnvioEstadoSchema }),
  asyncHandler(async (req, res) => {
    const id = req.params['id'] as string;
    const envio = await envioService.updateEstado(id, req.body, req.userId!, req.userName!, req.ip ?? undefined, req.headers['user-agent'] ?? undefined);
    sseService.broadcast({ entity: ['envios', 'list'], action: 'estado_changed' });
    sseService.broadcast({ entity: ['envios', 'detail'], action: 'estado_changed', id, estado: envio.estado });
    sseService.broadcast({ entity: ['dashboard'], action: 'updated' });
    sseService.broadcastToCliente(
      { entity: ['envios', 'detail'], action: 'estado_changed', id, estado: envio.estado },
      envio.clienteId
    );
    res.json(envio);
  })
);

router.patch(
  '/:id/repartidor',
  validate({ params: idParamSchema, body: asignarRepartidorSchema }),
  asyncHandler(async (req, res) => {
    const id = req.params['id'] as string;
    const envio = await envioService.asignarRepartidor(id, req.body.repartidorId, req.userId!, req.userName!, req.ip ?? undefined, req.headers['user-agent'] ?? undefined);
    sseService.broadcast({ entity: ['envios', 'list'], action: 'updated' });
    sseService.broadcast({ entity: ['envios', 'detail'], action: 'updated', id });
    res.json(envio);
  })
);

const resolverIncidenciaSchema = z.object({
  nota: z.string().max(1000).optional(),
});

router.post(
  '/:id/incidencia/resolver',
  validate({ params: idParamSchema, body: resolverIncidenciaSchema }),
  asyncHandler(async (req, res) => {
    const id = req.params['id'] as string;
    const nota = (req.body as { nota?: string }).nota;
    const userName = req.userName ?? 'Admin GoExpress';

    const { data: envio, error } = await supabase
      .from('envios')
      .select('id, tiene_incidencia, estado')
      .eq('id', id)
      .eq('eliminado', false)
      .single();

    if (error || !envio) throw AppError.notFound('Envio', id);

    await supabase
      .from('envios')
      .update({ tiene_incidencia: false })
      .eq('id', id);

    await supabase.from('eventos_envio').insert({
      envio_id: id,
      estado: (envio as { estado: string }).estado,
      descripcion: `Incidencia resuelta por ${userName}${nota ? `: ${nota}` : ''}`,
      registrado_por_nombre: userName,
    });

    sseService.broadcast({ entity: ['envios', 'detail'], action: 'updated', id });
    sseService.broadcast({ entity: ['dashboard'], action: 'updated' });

    res.json({ ok: true });
  }),
);

router.get(
  '/:id/pod-download-url',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = req.params['id'] as string;
    const { data: envio, error } = await supabase
      .from('envios')
      .select('id, foto_entrega_url')
      .eq('id', id)
      .eq('eliminado', false)
      .single();

    if (error || !envio) throw AppError.notFound('Envio', id);

    const row = envio as { id: string; foto_entrega_url: string | null };
    if (!row.foto_entrega_url) {
      res.json({ signedUrl: null });
      return;
    }

    const { data, error: sErr } = await supabase.storage
      .from('pod-entregas')
      .createSignedUrl(row.foto_entrega_url, 600);

    if (sErr || !data) {
      logger.error({ err: sErr, id }, 'Error creating POD signed url for admin');
      throw new AppError('No se pudo generar URL de POD', 500, 'STORAGE_ERROR');
    }

    res.json({ signedUrl: data.signedUrl });
  }),
);

router.patch(
  '/:id/problema',
  validate({ params: idParamSchema, body: reportarProblemaSchema }),
  asyncHandler(async (req, res) => {
    const id = req.params['id'] as string;
    const envio = await envioService.reportarProblema(
      id,
      req.body.descripcion,
      req.userId!,
      req.userName ?? 'Admin GoExpress',
      req.ip ?? undefined,
      req.headers['user-agent'] ?? undefined,
    );
    sseService.broadcast({ entity: ['envios', 'list'], action: 'updated' });
    sseService.broadcast({ entity: ['envios', 'detail'], action: 'updated', id });
    sseService.broadcast({ entity: ['dashboard'], action: 'updated' });
    res.json(envio);
  })
);

router.get(
  '/:id/eventos',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const eventos = await envioService.getEventos(req.params['id'] as string);
    res.json(eventos);
  })
);

router.post(
  '/:id/notas',
  validate({ params: idParamSchema, body: agregarNotaSchema }),
  asyncHandler(async (req, res) => {
    const nota = await envioService.agregarNota(
      req.params['id'] as string,
      req.body.texto,
      req.userId!,
      req.userName!,
      req.ip ?? undefined,
      req.headers['user-agent'] ?? undefined,
    );
    res.status(201).json(nota);
  })
);

router.post(
  '/bulk',
  bulkLimiter,
  validate({ body: bulkActionSchema }),
  asyncHandler(async (req, res) => {
    const result = await envioService.bulkAction(
      req.body,
      req.userId!,
      req.userName ?? 'Admin GoExpress',
      req.ip ?? undefined,
      req.headers['user-agent'] ?? undefined
    );
    sseService.broadcast({ entity: ['envios', 'list'], action: 'bulk_updated' });
    sseService.broadcast({ entity: ['dashboard'], action: 'updated' });
    res.json(result);
  })
);

router.get(
  '/:id/intentos',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const intentos = await envioService.listIntentosContacto(req.params['id'] as string);
    res.json(intentos);
  })
);

router.post(
  '/:id/intentos',
  validate({ params: idParamSchema, body: createIntentoContactoSchema }),
  asyncHandler(async (req, res) => {
    const intento = await envioService.createIntentoContacto(
      req.params['id'] as string,
      req.body,
      req.userId!,
      req.userName ?? 'Admin GoExpress',
      req.ip ?? undefined,
      req.headers['user-agent'] ?? undefined,
    );
    res.status(201).json(intento);
  })
);

router.delete(
  '/:id',
  validate({ params: idParamSchema, body: softDeleteSchema }),
  asyncHandler(async (req, res) => {
    await envioService.softDelete(
      req.params['id'] as string,
      req.body.motivo,
      req.userId!,
      req.userName!,
      req.ip ?? undefined,
      req.headers['user-agent'] ?? undefined,
    );
    sseService.broadcast({ entity: ['envios', 'list'], action: 'deleted' });
    sseService.broadcast({ entity: ['dashboard'], action: 'updated' });
    res.status(204).send();
  })
);

export default router;
