import { Router, type Request } from 'express';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { validate } from '../../middleware/validate.js';
import { requirePermiso } from '../../middleware/apiKeyAuth.js';
import { webhookEndpointService } from '../../services/webhookEndpoint.service.js';
import { idParamSchema } from '../../lib/validators/common.schema.js';
import { createWebhookEndpointV1Schema } from '../../lib/validators/webhook.schema.js';
import type { CreateWebhookEndpointV1Input } from '../../lib/validators/webhook.schema.js';

// Usuario SISTEMA (sql/032): actor FK-valido en auditoria_log para acciones sin usuario
// humano. La identidad real de la API key va en el texto del log.
const SISTEMA_USER_ID = '00000000-0000-4000-a000-000000000001';

const router = Router();

// Self-service de webhooks para el tercero (permiso 'webhooks'). El cliente sale SIEMPRE
// de la key: no existe forma de registrar ni tocar endpoints de otro cliente.

router.use(requirePermiso('webhooks'));

function actorFromKey(req: Request) {
  return {
    userId: SISTEMA_USER_ID,
    userName: `API key "${req.apiKeyNombre}" (${req.apiKeyPrefix})`,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  };
}

// GET /: endpoints del cliente de la key. Sin secreto, como todo listado.

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const endpoints = await webhookEndpointService.list(req.clienteId!);
    res.json(endpoints.map(({ id, url, eventos, activo, creadoEn }) => ({ id, url, eventos, activo, creadoEn })));
  })
);

// POST /: registra un endpoint y devuelve el secreto UNA sola vez.

router.post(
  '/',
  validate({ body: createWebhookEndpointV1Schema }),
  asyncHandler(async (req, res) => {
    const input = req.body as CreateWebhookEndpointV1Input;

    const { endpoint, secreto } = await webhookEndpointService.create(
      { clienteId: req.clienteId!, url: input.url, eventos: input.eventos },
      actorFromKey(req)
    );

    res.status(201).json({
      id: endpoint.id,
      url: endpoint.url,
      eventos: endpoint.eventos,
      activo: endpoint.activo,
      creadoEn: endpoint.creadoEn,
      secreto,
      aviso: 'Guarda este secreto ahora: no se vuelve a mostrar.',
    });
  })
);

// DELETE /:id: baja logica, scoped al cliente de la key (endpoint ajeno = 404).

router.delete(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = req.params['id'] as string;
    await webhookEndpointService.deactivate(id, actorFromKey(req), req.clienteId!);
    res.status(204).send();
  })
);

export default router;
