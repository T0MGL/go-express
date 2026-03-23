import { Router } from 'express';
import { requireCliente } from '../../middleware/clienteAuth.js';

import dashboardRoutes from './dashboard.js';
import enviosRoutes from './envios.js';
import productosRoutes from './productos.js';
import tagsRoutes from './tags.js';
import cotizadorRoutes from './cotizador.js';
import cuentaRoutes from './cuenta.js';

const router = Router();

// ---------------------------------------------------------------------------
// Apply requireCliente middleware to ALL cliente routes
// ---------------------------------------------------------------------------

router.use(requireCliente);

// ---------------------------------------------------------------------------
// Mount sub-routers
// ---------------------------------------------------------------------------

router.use('/dashboard', dashboardRoutes);
router.use('/envios', enviosRoutes);
router.use('/productos', productosRoutes);
router.use('/tags', tagsRoutes);
router.use('/cotizador', cotizadorRoutes);
router.use('/cuenta', cuentaRoutes);

export default router;
