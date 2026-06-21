import { Router } from 'express';
import { requireCliente } from '../../middleware/clienteAuth.js';

import dashboardRoutes from './dashboard.js';
import enviosRoutes from './envios.js';
import productosRoutes from './productos.js';
import tagsRoutes from './tags.js';
import cotizadorRoutes from './cotizador.js';
import cuentaRoutes from './cuenta.js';
import ciudadRoutes from './ciudades.js';

const router = Router();

router.use(requireCliente);


router.use('/dashboard', dashboardRoutes);
router.use('/envios', enviosRoutes);
router.use('/productos', productosRoutes);
router.use('/tags', tagsRoutes);
router.use('/cotizador', cotizadorRoutes);
router.use('/cuenta', cuentaRoutes);
router.use('/ciudades', ciudadRoutes);

export default router;
