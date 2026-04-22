import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { ciudadService } from '../../services/ciudad.service.js';

const router = Router();

/**
 * Catalogo para el portal cliente. Expone las ciudades con su flag habilitada
 * para que el cotizador y el wizard de envio puedan pintar deshabilitadas las
 * que no tienen cobertura.
 */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const ciudades = await ciudadService.list();
    res.json({ data: ciudades });
  }),
);

export default router;
