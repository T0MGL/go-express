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

    res.json(result);
  })
);

export default router;
