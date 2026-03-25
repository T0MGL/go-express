import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { validate } from '../../middleware/validate.js';
import { tarifaService } from '../../services/tarifa.service.js';
import type { TarifaQuery } from '../../lib/validators/tarifa.schema.js';
import {
  createTarifaSchema,
  updateTarifaSchema,
  tarifaQuerySchema,
} from '../../lib/validators/tarifa.schema.js';
import { idParamSchema, softDeleteSchema } from '../../lib/validators/common.schema.js';

const router = Router();

/**
 * GET /:List tarifas (includeDeleted=true shows soft-deleted)
 */
router.get(
  '/',
  validate({ query: tarifaQuerySchema }),
  asyncHandler(async (req, res) => {
    const result = await tarifaService.list(req.query as unknown as TarifaQuery);
    res.json(result);
  })
);

/**
 * POST /:Create tarifa
 */
router.post(
  '/',
  validate({ body: createTarifaSchema }),
  asyncHandler(async (req, res) => {
    const tarifa = await tarifaService.create(req.body, req.userId!);
    res.status(201).json(tarifa);
  })
);

/**
 * PUT /:id:Update tarifa
 */
router.put(
  '/:id',
  validate({ params: idParamSchema, body: updateTarifaSchema }),
  asyncHandler(async (req, res) => {
    const tarifa = await tarifaService.update(req.params['id'] as string, req.body, req.userId!);
    res.json(tarifa);
  })
);

/**
 * DELETE /:id:Soft-delete
 */
router.delete(
  '/:id',
  validate({ params: idParamSchema, body: softDeleteSchema }),
  asyncHandler(async (req, res) => {
    await tarifaService.softDelete(req.params['id'] as string, req.body.motivo, req.userId!);
    res.status(204).send();
  })
);

/**
 * PATCH /:id/restore:Restore soft-deleted tarifa
 */
router.patch(
  '/:id/restore',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const tarifa = await tarifaService.restore(req.params['id'] as string, req.userId!);
    res.json(tarifa);
  })
);

export default router;
