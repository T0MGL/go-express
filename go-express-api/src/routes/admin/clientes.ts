import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { validate } from '../../middleware/validate.js';
import { clienteService } from '../../services/cliente.service.js';
import type { ClienteQuery } from '../../lib/validators/cliente.schema.js';
import {
  createClienteSchema,
  updateClienteSchema,
  updateClienteEstadoSchema,
  clienteQuerySchema,
} from '../../lib/validators/cliente.schema.js';
import { idParamSchema, softDeleteSchema } from '../../lib/validators/common.schema.js';

const router = Router();

/**
 * GET /:List clients with pagination + filters
 */
router.get(
  '/',
  validate({ query: clienteQuerySchema }),
  asyncHandler(async (req, res) => {
    const result = await clienteService.list(req.query as unknown as ClienteQuery);
    res.json(result);
  })
);

/**
 * GET /export: CSV export (admin-only)
 */
router.get(
  '/export',
  validate({ query: clienteQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ClienteQuery;
    const data = await clienteService.exportList(q);
    res.json(data);
  })
);

/**
 * GET /:id: Detail
 */
router.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const cliente = await clienteService.getById(req.params['id'] as string);
    res.json(cliente);
  })
);

/**
 * POST /:Create client
 */
router.post(
  '/',
  validate({ body: createClienteSchema }),
  asyncHandler(async (req, res) => {
    const cliente = await clienteService.create(req.body, req.userId!);
    res.status(201).json(cliente);
  })
);

/**
 * PUT /:id:Update client
 */
router.put(
  '/:id',
  validate({ params: idParamSchema, body: updateClienteSchema }),
  asyncHandler(async (req, res) => {
    const cliente = await clienteService.update(req.params['id'] as string, req.body, req.userId!);
    res.json(cliente);
  })
);

/**
 * PATCH /:id/estado:Change estado
 */
router.patch(
  '/:id/estado',
  validate({ params: idParamSchema, body: updateClienteEstadoSchema }),
  asyncHandler(async (req, res) => {
    const cliente = await clienteService.updateEstado(
      req.params['id'] as string,
      req.body.estado,
      req.body.motivo,
      req.userId!
    );
    res.json(cliente);
  })
);

/**
 * DELETE /:id:Soft-delete (requires motivo in body)
 */
router.delete(
  '/:id',
  validate({ params: idParamSchema, body: softDeleteSchema }),
  asyncHandler(async (req, res) => {
    await clienteService.softDelete(req.params['id'] as string, req.body.motivo, req.userId!);
    res.status(204).send();
  })
);

// Portal management endpoints

/**
 * POST /:id/invite:Invite client to the portal (creates Supabase Auth user, sends email)
 */
router.post(
  '/:id/invite',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const cliente = await clienteService.inviteToPortal(req.params['id'] as string, req.userId!);
    res.json(cliente);
  })
);

/**
 * POST /:id/reinvite:Resend portal invitation
 */
router.post(
  '/:id/reinvite',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const cliente = await clienteService.reinviteToPortal(req.params['id'] as string, req.userId!);
    res.json(cliente);
  })
);

/**
 * POST /:id/reset-password:Admin triggers password reset for client
 */
router.post(
  '/:id/reset-password',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const result = await clienteService.resetClientPassword(req.params['id'] as string, req.userId!);
    res.json(result);
  })
);

export default router;
