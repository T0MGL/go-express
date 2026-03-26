import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { validate } from '../../middleware/validate.js';
import { warehouseService } from '../../services/warehouse.service.js';
import { sseService } from '../../services/sse.service.js';
import type { InventarioQuery } from '../../lib/validators/warehouse.schema.js';
import {
  ingresoSchema,
  despachoSchema,
  devolucionSchema,
  pickingUpdateSchema,
  inventarioQuerySchema,
} from '../../lib/validators/warehouse.schema.js';
import { idParamSchema } from '../../lib/validators/common.schema.js';

const router = Router();

/**
 * GET /:Default: returns inventory list (same as /inventario)
 */
router.get(
  '/',
  validate({ query: inventarioQuerySchema }),
  asyncHandler(async (req, res) => {
    const result = await warehouseService.listInventario(req.query as unknown as InventarioQuery);
    res.json(result);
  })
);

/**
 * GET /inventario:List inventory + filters
 */
router.get(
  '/inventario',
  validate({ query: inventarioQuerySchema }),
  asyncHandler(async (req, res) => {
    const result = await warehouseService.listInventario(req.query as unknown as InventarioQuery);
    res.json(result);
  })
);

/**
 * POST /ingreso:Receive package
 */
router.post(
  '/ingreso',
  validate({ body: ingresoSchema }),
  asyncHandler(async (req, res) => {
    const item = await warehouseService.ingreso(req.body, req.userId!, req.userName!);
    sseService.broadcast({ entity: ['warehouse'], action: 'ingreso' });
    res.status(201).json(item);
  })
);

/**
 * POST /despacho:Dispatch package
 */
router.post(
  '/despacho',
  validate({ body: despachoSchema }),
  asyncHandler(async (req, res) => {
    const item = await warehouseService.despacho(req.body.paqueteId, req.userId!, req.userName!, req.body.notas);
    sseService.broadcast({ entity: ['warehouse'], action: 'despacho' });
    sseService.broadcast({ entity: ['envios', 'list'], action: 'updated' });
    res.json(item);
  })
);

/**
 * POST /devolucion:Return package
 */
router.post(
  '/devolucion',
  validate({ body: devolucionSchema }),
  asyncHandler(async (req, res) => {
    const item = await warehouseService.devolucion(
      req.body.paqueteId,
      req.body.ubicacionDestino,
      req.userId!,
      req.userName!,
      req.body.notas
    );
    sseService.broadcast({ entity: ['warehouse'], action: 'devolucion' });
    res.json(item);
  })
);

/**
 * GET /picking:Picking list
 */
router.get(
  '/picking',
  asyncHandler(async (_req, res) => {
    const items = await warehouseService.listPicking();
    res.json(items);
  })
);

/**
 * PATCH /picking/:id:Update picking status
 */
router.patch(
  '/picking/:id',
  validate({ params: idParamSchema, body: pickingUpdateSchema }),
  asyncHandler(async (req, res) => {
    const item = await warehouseService.updatePicking(req.params['id'] as string, req.body, req.userId!, req.userName!);
    res.json(item);
  })
);

/**
 * GET /stats:Warehouse KPIs
 */
router.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const stats = await warehouseService.getStats();
    res.json(stats);
  })
);

export default router;
