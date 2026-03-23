import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { validate } from '../../middleware/validate.js';
import { auditoriaService } from '../../services/auditoria.service.js';
import type { AuditoriaQuery } from '../../lib/validators/auditoria.schema.js';
import { auditoriaQuerySchema } from '../../lib/validators/auditoria.schema.js';

const router = Router();

/**
 * GET / — List audit logs + filters (read-only, no mutations)
 */
router.get(
  '/',
  validate({ query: auditoriaQuerySchema }),
  asyncHandler(async (req, res) => {
    const result = await auditoriaService.list(req.query as unknown as AuditoriaQuery);
    res.json(result);
  })
);

/**
 * GET /export — CSV export
 */
router.get(
  '/export',
  validate({ query: auditoriaQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as AuditoriaQuery;
    const result = await auditoriaService.list({ ...q, limit: 10000 });
    res.json(result.data);
  })
);

export default router;
