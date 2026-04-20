import { Router } from 'express';
import { requireAdmin } from '../../middleware/adminAuth.js';

import dashboardRoutes from './dashboard.js';
import envioRoutes from './envios.js';
import clienteRoutes from './clientes.js';
import repartidorRoutes from './repartidores.js';
import tarifaRoutes from './tarifas.js';
import pagoRoutes from './pagos.js';
import warehouseRoutes from './warehouse.js';
import auditoriaRoutes from './auditoria.js';
import configuracionRoutes from './configuracion.js';
import usuarioRoutes from './usuarios.js';
import cuentaCorrienteRoutes from './cuentaCorriente.js';
import liquidacionRoutes from './liquidaciones.js';

const router = Router();

// All admin routes require authentication
router.use(requireAdmin);

router.use('/dashboard', dashboardRoutes);
router.use('/envios', envioRoutes);
router.use('/clientes', clienteRoutes);
// Movimientos de cuenta corriente cuelgan de /clientes para preservar el patron
// /clientes/:id/saldo, /clientes/:id/movimientos, /clientes/:id/ajuste, etc.
router.use('/clientes', cuentaCorrienteRoutes);
router.use('/repartidores', repartidorRoutes);
router.use('/tarifas', tarifaRoutes);
router.use('/pagos', pagoRoutes);
router.use('/liquidaciones', liquidacionRoutes);
router.use('/warehouse', warehouseRoutes);
router.use('/auditoria', auditoriaRoutes);
router.use('/configuracion', configuracionRoutes);
router.use('/usuarios', usuarioRoutes);

export default router;
