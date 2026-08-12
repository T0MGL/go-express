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
import liquidacionRoutes from './liquidaciones.js';
import ciudadRoutes from './ciudades.js';
import maintenanceRoutes from './maintenance.js';
import apiKeyRoutes from './api-keys.js';
import webhookEndpointRoutes from './webhook-endpoints.js';

const router = Router();

// All admin routes require authentication
router.use(requireAdmin);

router.use('/dashboard', dashboardRoutes);
router.use('/envios', envioRoutes);
// Tarifas y clientes quedan restringidos a rol admin. Operadores reciben 403 explicito.
router.use('/clientes', requireOnlyAdmin, clienteRoutes);
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
// Tareas operativas del sistema (jobs, retencion). Solo admin.
router.use('/maintenance', maintenanceRoutes);
// API keys del gateway v1: emiten acceso a datos de clientes, estrictamente admin.
// Un operador no puede mintear ni rotar credenciales de terceros.
router.use('/api-keys', requireOnlyAdmin, apiKeyRoutes);
// Webhooks salientes: mismo criterio que las keys, tocan credenciales (secretos HMAC)
// y destinos de datos de clientes. Estrictamente admin.
router.use('/webhook-endpoints', requireOnlyAdmin, webhookEndpointRoutes);

export default router;
