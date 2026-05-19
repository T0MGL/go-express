import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { validate } from '../../middleware/validate.js';
import { trackingLimiter } from '../../middleware/rateLimit.js';
import { trackingParamSchema } from '../../lib/validators/common.schema.js';
import { trackingService } from '../../services/tracking.service.js';
import { AppError } from '../../middleware/errorHandler.js';

const router = Router();

// GET /api/public/tracking/:trackingNumber

router.get(
  '/tracking/:trackingNumber',
  trackingLimiter,
  validate({ params: trackingParamSchema }),
  asyncHandler(async (req, res) => {
    const trackingNumber = req.params['trackingNumber'] as string;

    const result = await trackingService.getByTrackingNumber(trackingNumber);

    if (!result) {
      throw AppError.notFound('Envío', trackingNumber);
    }

    // Cache breve por destinatario que refresca su tracking. Evita spam pero permite
    // updates casi en vivo (15s). Public para que CDN del cliente colabore. No
    // cacheable por la red de GoExpress mientras el dato sea identificatorio del
    // destinatario (telefono, direccion en respuesta).
    res.setHeader('Cache-Control', 'public, max-age=15, must-revalidate');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.json(result);
  })
);

export default router;
