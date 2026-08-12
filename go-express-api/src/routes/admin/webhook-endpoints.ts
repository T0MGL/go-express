import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { validate } from '../../middleware/validate.js';
import { webhookEndpointService } from '../../services/webhookEndpoint.service.js';
import { idParamSchema, uuidSchema } from '../../lib/validators/common.schema.js';
import {
  createWebhookEndpointAdminSchema,
  updateWebhookEndpointSchema,
} from '../../lib/validators/webhook.schema.js';
import type {
  CreateWebhookEndpointAdminInput,
  UpdateWebhookEndpointInput,
} from '../../lib/validators/webhook.schema.js';

const router = Router();

const listQuerySchema = z.object({ clienteId: uuidSchema.optional() });

// POST /: registra un endpoint para un cliente. El secreto viaja SOLO en este response.

router.post(
  '/',
  validate({ body: createWebhookEndpointAdminSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as CreateWebhookEndpointAdminInput;

    const { endpoint, secreto } = await webhookEndpointService.create(
      { clienteId: input.clienteId, url: input.url, eventos: input.eventos },
      {
        userId: req.userId!,
        userName: req.userName ?? 'Admin GoExpress',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      }
    );

    res.status(201).json({
      ...endpoint,
      secreto,
      aviso: 'Guarda este secreto ahora: no se vuelve a mostrar.',
    });
  })
);

// GET /: lista (opcionalmente por cliente). Jamas incluye el secreto.

router.get(
  '/',
  validate({ query: listQuerySchema }),
  asyncHandler(async (req, res) => {
    const { clienteId } = req.query as unknown as { clienteId?: string };
    res.json(await webhookEndpointService.list(clienteId));
  })
);

// PATCH /:id: url, eventos o activo.

router.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateWebhookEndpointSchema }),
  asyncHandler(async (req, res) => {
    const id = req.params['id'] as string;

    const endpoint = await webhookEndpointService.update(id, req.body as UpdateWebhookEndpointInput, {
      userId: req.userId!,
      userName: req.userName ?? 'Admin GoExpress',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json(endpoint);
  })
);

// DELETE /:id: baja logica. El historial de deliveries se conserva.

router.delete(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = req.params['id'] as string;

    await webhookEndpointService.deactivate(id, {
      userId: req.userId!,
      userName: req.userName ?? 'Admin GoExpress',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(204).send();
  })
);

// POST /:id/regenerar-secreto: firma nueva desde el proximo delivery; el valor se
// muestra una unica vez, igual que al crear.

router.post(
  '/:id/regenerar-secreto',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = req.params['id'] as string;

    const { endpoint, secreto } = await webhookEndpointService.regenerateSecret(id, {
      userId: req.userId!,
      userName: req.userName ?? 'Admin GoExpress',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(201).json({
      ...endpoint,
      secreto,
      aviso: 'Guarda este secreto ahora: no se vuelve a mostrar. Las firmas con el secreto anterior dejan de validar de inmediato.',
    });
  })
);

export default router;
