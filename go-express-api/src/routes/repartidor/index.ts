import { Router } from 'express';
import { requireRepartidor } from '../../middleware/repartidorAuth.js';
import enviosRoutes from './envios.js';

const router = Router();

router.use(requireRepartidor);
router.use('/', enviosRoutes);

export default router;
