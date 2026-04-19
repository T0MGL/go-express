import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { validate } from '../../middleware/validate.js';
import { repartidorService } from '../../services/repartidor.service.js';
import type { RepartidorQuery } from '../../lib/validators/repartidor.schema.js';
import {
  createRepartidorSchema,
  updateRepartidorSchema,
  repartidorQuerySchema,
} from '../../lib/validators/repartidor.schema.js';
import { idParamSchema, softDeleteSchema } from '../../lib/validators/common.schema.js';

const router = Router();

/**
 * GET /:List repartidores + filter by estado
 */
router.get(
  '/',
  validate({ query: repartidorQuerySchema }),
  asyncHandler(async (req, res) => {
    const result = await repartidorService.list(req.query as unknown as RepartidorQuery);
    res.json(result);
  })
);

/**
 * GET /:id:Detail
 */
router.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const repartidor = await repartidorService.getById(req.params['id'] as string);
    res.json(repartidor);
  })
);

/**
 * POST /:Create repartidor
 */
router.post(
  '/',
  validate({ body: createRepartidorSchema }),
  asyncHandler(async (req, res) => {
    const repartidor = await repartidorService.create(
      req.body,
      req.userId!,
      req.ip ?? undefined,
      req.headers['user-agent'] ?? undefined,
    );
    res.status(201).json(repartidor);
  })
);

/**
 * PUT /:id:Update repartidor
 */
router.put(
  '/:id',
  validate({ params: idParamSchema, body: updateRepartidorSchema }),
  asyncHandler(async (req, res) => {
    const repartidor = await repartidorService.update(
      req.params['id'] as string,
      req.body,
      req.userId!,
      req.ip ?? undefined,
      req.headers['user-agent'] ?? undefined,
    );
    res.json(repartidor);
  })
);

/**
 * PATCH /:id/estado:Toggle active/inactive
 */
router.patch(
  '/:id/estado',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const repartidor = await repartidorService.toggleEstado(
      req.params['id'] as string,
      req.userId!,
      req.ip ?? undefined,
      req.headers['user-agent'] ?? undefined,
    );
    res.json(repartidor);
  })
);

/**
 * GET /:id/envios:Assigned envios today
 */
router.get(
  '/:id/envios',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const envios = await repartidorService.getEnviosAsignados(req.params['id'] as string);
    res.json(envios);
  })
);

/**
 * DELETE /:id:Soft-delete (requires motivo in body)
 */
router.delete(
  '/:id',
  validate({ params: idParamSchema, body: softDeleteSchema }),
  asyncHandler(async (req, res) => {
    await repartidorService.softDelete(
      req.params['id'] as string,
      req.body.motivo,
      req.userId!,
      req.userName!,
      req.ip ?? undefined,
      req.headers['user-agent'] ?? undefined,
    );
    res.status(204).send();
  })
);

/**
 * POST /:id/invite
 *
 * Sends portal invitation email to repartidor with temporary credentials.
 * Returns tempPassword for admin to share via WhatsApp as fallback.
 */
router.post(
  '/:id/invite',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const result = await repartidorService.inviteToPortal(
      req.params['id'] as string,
      req.userId!,
      req.ip ?? undefined,
      req.headers['user-agent'] ?? undefined,
    );
    res.json(result);
  })
);

/**
 * GET /:id/conciliacion?desde=&hasta=
 *
 * Returns delivery summary grouped by zone for a repartidor within a date range.
 */
router.get(
  '/:id/conciliacion',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const repartidorId = req.params['id'] as string;
    const desde = (req.query['desde'] as string | undefined) ?? undefined;
    const hasta = (req.query['hasta'] as string | undefined) ?? undefined;
    const resumen = await repartidorService.getConciliacion(repartidorId, desde, hasta);
    res.json(resumen);
  })
);

export default router;
