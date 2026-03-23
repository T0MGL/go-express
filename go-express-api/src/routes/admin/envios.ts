import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { validate } from '../../middleware/validate.js';
import { bulkLimiter } from '../../middleware/rateLimit.js';
import { envioService } from '../../services/envio.service.js';
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
    res.status(201).json(envio);
  })
);

router.post(
  '/bulk-import',
  bulkLimiter,
  validate({ body: bulkImportSchema }),
  asyncHandler(async (req, res) => {
    const result = await envioService.bulkImport(req.body.envios, req.userId!, req.userName!, req.ip ?? undefined, req.headers['user-agent'] ?? undefined);
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
    const envio = await envioService.update(req.params['id'] as string, req.body, req.userId!);
    res.json(envio);
  })
);

router.patch(
  '/:id/estado',
  validate({ params: idParamSchema, body: updateEnvioEstadoSchema }),
  asyncHandler(async (req, res) => {
    const envio = await envioService.updateEstado(req.params['id'] as string, req.body, req.userId!, req.userName!, req.ip ?? undefined, req.headers['user-agent'] ?? undefined);
    res.json(envio);
  })
);

router.patch(
  '/:id/repartidor',
  validate({ params: idParamSchema, body: asignarRepartidorSchema }),
  asyncHandler(async (req, res) => {
    const envio = await envioService.asignarRepartidor(req.params['id'] as string, req.body.repartidorId, req.userId!, req.userName!, req.ip ?? undefined, req.headers['user-agent'] ?? undefined);
    res.json(envio);
  })
);

router.patch(
  '/:id/problema',
  validate({ params: idParamSchema, body: reportarProblemaSchema }),
  asyncHandler(async (req, res) => {
    const envio = await envioService.reportarProblema(req.params['id'] as string, req.body.descripcion, req.userId!);
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
    res.json({ message: 'Envio eliminado' });
  })
);

export default router;
