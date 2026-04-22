import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { ciudadService } from '../../services/ciudad.service.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const ciudades = await ciudadService.list();
    res.json({ data: ciudades });
  }),
);

router.get(
  '/departamentos',
  asyncHandler(async (_req, res) => {
    const departamentos = await ciudadService.listDepartamentos();
    res.json({ data: departamentos });
  }),
);

router.get(
  '/cobertura',
  asyncHandler(async (_req, res) => {
    const cobertura = await ciudadService.getCobertura();
    res.json(cobertura);
  }),
);

export default router;
