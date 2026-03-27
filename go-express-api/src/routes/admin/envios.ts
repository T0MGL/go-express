import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { validate } from '../../middleware/validate.js';
import { bulkLimiter } from '../../middleware/rateLimit.js';
import { envioService } from '../../services/envio.service.js';
import { sseService } from '../../services/sse.service.js';
import type { EnvioQuery } from '../../lib/validators/envio.schema.js';
import {
  createEnvioSchema,
  updateEnvioEstadoSchema,
  asignarRepartidorSchema,
  reportarProblemaSchema,
  agregarNotaSchema,
  envioQuerySchema,
  bulkImportSchema,
} from '../../lib/validators/envio.schema.js';
import { idParamSchema, softDeleteSchema } from '../../lib/validators/common.schema.js';

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

router.post(
  '/',
  validate({ body: createEnvioSchema }),
  asyncHandler(async (req, res) => {
    const envio = await envioService.create(req.body, req.userId!, req.userName!, req.ip ?? undefined, req.headers['user-agent'] ?? undefined);
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
  validate({ params: idParamSchema, body: createEnvioSchema.partial() }),
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

router.patch(
  '/:id/problema',
  validate({ params: idParamSchema, body: reportarProblemaSchema }),
  asyncHandler(async (req, res) => {
    const id = req.params['id'] as string;
    const envio = await envioService.reportarProblema(id, req.body.descripcion, req.userId!);
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
    const nota = await envioService.agregarNota(req.params['id'] as string, req.body.texto, req.userId!, req.userName!);
    res.status(201).json(nota);
  })
);

router.delete(
  '/:id',
  validate({ params: idParamSchema, body: softDeleteSchema }),
  asyncHandler(async (req, res) => {
    await envioService.softDelete(req.params['id'] as string, req.body.motivo, req.userId!, req.userName!);
    sseService.broadcast({ entity: ['envios', 'list'], action: 'deleted' });
    sseService.broadcast({ entity: ['dashboard'], action: 'updated' });
    res.status(204).send();
  })
);

export default router;
