import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { trackingLimiter } from '../../middleware/rateLimit.js';
import { ciudadService } from '../../services/ciudad.service.js';

const router = Router();

/**
 * Catalogo publico (sin auth) para landing page, cotizador publico,
 * y tracking picker. Rate-limited igual que tracking (30/min).
 */
router.get(
  '/',
  trackingLimiter,
  asyncHandler(async (_req, res) => {
    const ciudades = await ciudadService.list();
    res.json({ data: ciudades });
  }),
);

export default router;
