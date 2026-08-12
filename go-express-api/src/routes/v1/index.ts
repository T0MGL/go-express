import { Router } from 'express';
import { env } from '../../config/env.js';
import { requireApiKey } from '../../middleware/apiKeyAuth.js';
import { apiKeyLimiter } from '../../middleware/rateLimit.js';

import enviosRoutes from './envios.js';
import tarifasRoutes from './tarifas.js';

const router = Router();

// Auth primero: el limiter esta keyed por apiKeyId y necesita la key ya resuelta.
router.use(requireApiKey);
if (env.NODE_ENV !== 'test') {
  router.use(apiKeyLimiter);
}

router.use('/envios', enviosRoutes);
router.use('/tarifas', tarifasRoutes);

export default router;
