import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { validate } from '../../middleware/validate.js';
import { pagoService } from '../../services/pago.service.js';
import type { PagoQuery } from '../../lib/validators/pago.schema.js';
import {
  createPagoSchema,
  updatePagoSchema,
  pagoQuerySchema,
} from '../../lib/validators/pago.schema.js';
import { idParamSchema } from '../../lib/validators/common.schema.js';

const router = Router();

/**
 * GET /:List pagos + filters
 */
router.get(
  '/',
  validate({ query: pagoQuerySchema }),
  asyncHandler(async (req, res) => {
    const result = await pagoService.list(req.query as unknown as PagoQuery);
    res.json(result);
  })
);

/**
 * GET /stats:Payment KPIs
 */
router.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const stats = await pagoService.getStats();
    res.json(stats);
  })
);

/**
 * GET /export:CSV export
 */
router.get(
  '/export',
  validate({ query: pagoQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as PagoQuery;
    const result = await pagoService.list({ ...q, limit: 10000 });
    res.json(result.data);
  })
);

/**
 * POST /:Create payment
 */
router.post(
  '/',
  validate({ body: createPagoSchema }),
  asyncHandler(async (req, res) => {
    const pago = await pagoService.create(req.body, req.userId!);
    res.status(201).json(pago);
  })
);

/**
 * PATCH /:id:Update payment
 */
router.patch(
  '/:id',
  validate({ params: idParamSchema, body: updatePagoSchema }),
  asyncHandler(async (req, res) => {
    const pago = await pagoService.update(req.params['id'] as string, req.body, req.userId!);
    res.json(pago);
  })
);

export default router;
