import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { validate } from '../../middleware/validate.js';
import { repartidorService } from '../../services/repartidor.service.js';
import type { RepartidorQuery } from '../../lib/validators/repartidor.schema.js';
import {
  createRepartidorSchema,
  updateRepartidorSchema,
  repartidorQuerySchema,
} from '../../lib/validators/repartidor.schema.js';
import { idParamSchema, softDeleteSchema } from '../../lib/validators/common.schema.js';

const router = Router();

/**
 * GET / — List repartidores + filter by estado
 */
router.get(
  '/',
  validate({ query: repartidorQuerySchema }),
  asyncHandler(async (req, res) => {
    const result = await repartidorService.list(req.query as unknown as RepartidorQuery);
    res.json(result);
  })
);

/**
 * GET /:id — Detail
 */
router.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const repartidor = await repartidorService.getById(req.params['id'] as string);
    res.json(repartidor);
  })
);

/**
 * POST / — Create repartidor
 */
router.post(
  '/',
  validate({ body: createRepartidorSchema }),
  asyncHandler(async (req, res) => {
    const repartidor = await repartidorService.create(req.body, req.userId!);
    res.status(201).json(repartidor);
  })
);

/**
 * PUT /:id — Update repartidor
 */
router.put(
  '/:id',
  validate({ params: idParamSchema, body: updateRepartidorSchema }),
  asyncHandler(async (req, res) => {
    const repartidor = await repartidorService.update(req.params['id'] as string, req.body, req.userId!);
    res.json(repartidor);
  })
);

/**
 * PATCH /:id/estado — Toggle active/inactive
 */
router.patch(
  '/:id/estado',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const repartidor = await repartidorService.toggleEstado(req.params['id'] as string, req.userId!);
    res.json(repartidor);
  })
);

/**
 * GET /:id/envios — Assigned envios today
 */
router.get(
  '/:id/envios',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const envios = await repartidorService.getEnviosAsignados(req.params['id'] as string);
    res.json(envios);
  })
);

/**
 * DELETE /:id — Soft-delete (requires motivo in body)
 */
router.delete(
  '/:id',
  validate({ params: idParamSchema, body: softDeleteSchema }),
  asyncHandler(async (req, res) => {
    await repartidorService.softDelete(req.params['id'] as string, req.body.motivo, req.userId!, req.userName!);
    res.json({ message: 'Repartidor eliminado' });
  })
);

export default router;
