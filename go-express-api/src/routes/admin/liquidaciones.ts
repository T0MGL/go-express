import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { validate } from '../../middleware/validate.js';
import { adminWriteLimiter } from '../../middleware/rateLimit.js';
import { liquidacionService } from '../../services/liquidacion.service.js';
import { sseService } from '../../services/sse.service.js';
import {
  crearLiquidacionSchema,
  cerrarLiquidacionSchema,
  liquidacionQuerySchema,
} from '../../lib/validators/liquidacion.schema.js';
import type { LiquidacionQuery } from '../../lib/validators/liquidacion.schema.js';
import { idParamSchema } from '../../lib/validators/common.schema.js';

const router = Router();

/**
 * GET /api/admin/liquidaciones
 * Listado paginado con filtros: repartidorId, estado, fechaDesde, fechaHasta.
 */
router.get(
  '/',
  validate({ query: liquidacionQuerySchema }),
  asyncHandler(async (req, res) => {
    const result = await liquidacionService.list(req.query as unknown as LiquidacionQuery);
    res.json(result);
  }),
);

/**
 * GET /api/admin/liquidaciones/:id
 * Detalle con envios asociados.
 */
router.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const liquidacion = await liquidacionService.getById(req.params['id'] as string);
    res.json(liquidacion);
  }),
);

/**
 * POST /api/admin/liquidaciones
 * Crea una liquidacion pendiente snapshoteando los envios COD entregados del repartidor
 * en el rango (TZ Asuncion). Audita en la misma transaccion.
 */
router.post(
  '/',
  adminWriteLimiter,
  validate({ body: crearLiquidacionSchema }),
  asyncHandler(async (req, res) => {
    const liquidacion = await liquidacionService.crear(
      req.body,
      req.userId!,
      req.userName ?? 'Admin GoExpress',
      req.ip ?? undefined,
      req.headers['user-agent'] ?? undefined,
    );
    sseService.broadcast({ entity: ['liquidaciones'], action: 'created' });
    res.status(201).json(liquidacion);
  }),
);

/**
 * PATCH /api/admin/liquidaciones/:id/cerrar
 * Cierra una liquidacion pendiente con el monto fisico recibido. El RPC calcula la
 * diferencia, define estado (cerrada / con_diferencia) y marca envios conciliados.
 */
router.patch(
  '/:id/cerrar',
  adminWriteLimiter,
  validate({ params: idParamSchema, body: cerrarLiquidacionSchema }),
  asyncHandler(async (req, res) => {
    const liquidacion = await liquidacionService.cerrar(
      req.params['id'] as string,
      req.body,
      req.userId!,
      req.userName ?? 'Admin GoExpress',
      req.ip ?? undefined,
      req.headers['user-agent'] ?? undefined,
    );
    sseService.broadcast({ entity: ['liquidaciones'], action: 'updated', id: liquidacion.id });
    res.json(liquidacion);
  }),
);

export default router;
