import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { validate } from '../../middleware/validate.js';
import { adminWriteLimiter } from '../../middleware/rateLimit.js';
import { pagoService } from '../../services/pago.service.js';
import { sseService } from '../../services/sse.service.js';
import type { PagoQuery } from '../../lib/validators/pago.schema.js';
import {
  createPagoSchema,
  updatePagoSchema,
  pagoQuerySchema,
  anularPagoSchema,
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
  adminWriteLimiter,
  validate({ body: createPagoSchema }),
  asyncHandler(async (req, res) => {
    const pago = await pagoService.create(
      req.body,
      req.userId!,
      req.ip ?? undefined,
      req.headers['user-agent'] ?? undefined
    );
    sseService.broadcast({ entity: ['pagos'], action: 'created' });
    sseService.broadcast({ entity: ['envios', 'detail'], action: 'pago_updated', id: pago.envioId });
    res.status(201).json(pago);
  })
);

/**
 * PATCH /:id:Update payment
 */
router.patch(
  '/:id',
  adminWriteLimiter,
  validate({ params: idParamSchema, body: updatePagoSchema }),
  asyncHandler(async (req, res) => {
    const pago = await pagoService.update(
      req.params['id'] as string,
      req.body,
      req.userId!,
      req.ip ?? undefined,
      req.headers['user-agent'] ?? undefined
    );
    sseService.broadcast({ entity: ['pagos'], action: 'updated' });
    res.json(pago);
  })
);

// Anulacion logica del pago. Libera el unique parcial sobre envio_id para poder
// registrar un nuevo pago. El RPC revierte monto_cobrado y re-marca cod_pago_pendiente
// en la misma transaccion; si el envio esta en una liquidacion sellada, rechaza.
router.post(
  '/:id/anular',
  adminWriteLimiter,
  validate({ params: idParamSchema, body: anularPagoSchema }),
  asyncHandler(async (req, res) => {
    const pago = await pagoService.anular(
      req.params['id'] as string,
      req.body.motivo,
      req.userId!,
      req.ip ?? undefined,
      req.headers['user-agent'] ?? undefined
    );
    sseService.broadcast({ entity: ['pagos'], action: 'anular' });
    sseService.broadcast({ entity: ['envios', 'detail'], action: 'pago_updated', id: pago.envioId });
    sseService.broadcast({ entity: ['cuenta-corriente'], action: 'updated' });
    res.json(pago);
  })
);

export default router;
