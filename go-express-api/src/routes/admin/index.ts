import { Router } from 'express';
import { requireAdmin, requireOnlyAdmin } from '../../middleware/adminAuth.js';

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
import ciudadRoutes from './ciudades.js';

const router = Router();

// All admin routes require authentication
router.use(requireAdmin);

router.use('/dashboard', dashboardRoutes);
router.use('/envios', envioRoutes);
// Tarifas y clientes (incluyendo cuenta corriente, que cuelga de /clientes)
// quedan restringidos a rol admin. Operadores reciben 403 explicito.
router.use('/clientes', requireOnlyAdmin, clienteRoutes);
router.use('/clientes', requireOnlyAdmin, cuentaCorrienteRoutes);
router.use('/repartidores', repartidorRoutes);
router.use('/tarifas', requireOnlyAdmin, tarifaRoutes);
router.use('/ciudades', ciudadRoutes);
router.use('/pagos', pagoRoutes);
router.use('/liquidaciones', liquidacionRoutes);
router.use('/warehouse', warehouseRoutes);
router.use('/auditoria', auditoriaRoutes);
router.use('/configuracion', configuracionRoutes);
// Gestion de usuarios es estrictamente admin. Operadores reciben 403 explicito
// para listar, crear, editar, eliminar, reinvitar, o manipular contrasenas.
// Un operador con escalada de privilegios podria crearse otro admin, asi que
// el gate vive a nivel de sub-router y no por ruta.
router.use('/usuarios', requireOnlyAdmin, usuarioRoutes);

export default router;
