import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { validate } from '../../middleware/validate.js';
import { apiKeyService } from '../../services/apiKey.service.js';
import { idParamSchema } from '../../lib/validators/common.schema.js';
import {
  createApiKeySchema,
  rotarApiKeySchema,
  apiKeyListQuerySchema,
} from '../../lib/validators/api-key.schema.js';
import type {
  CreateApiKeyInput,
  RotarApiKeyInput,
  ApiKeyListQuery,
} from '../../lib/validators/api-key.schema.js';

const router = Router();

// POST /: crea una key. El plaintext viaja SOLO en este response; no vuelve a existir.

router.post(
  '/',
  validate({ body: createApiKeySchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as CreateApiKeyInput;

    const { apiKey, key } = await apiKeyService.create(input, {
      userId: req.userId!,
      userName: req.userName ?? 'Admin GoExpress',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(201).json({
      ...apiKey,
      key,
      aviso: 'Guarda esta key ahora: no se vuelve a mostrar.',
    });
  })
);

// GET /: lista (opcionalmente por cliente). Solo prefix, jamas hash ni plaintext.

router.get(
  '/',
  validate({ query: apiKeyListQuerySchema }),
  asyncHandler(async (req, res) => {
    const { clienteId } = req.query as unknown as ApiKeyListQuery;
    res.json(await apiKeyService.list(clienteId));
  })
);

// POST /:id/revocar: baja definitiva e inmediata.

router.post(
  '/:id/revocar',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = req.params['id'] as string;

    const apiKey = await apiKeyService.revocar(id, {
      userId: req.userId!,
      userName: req.userName ?? 'Admin GoExpress',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json(apiKey);
  })
);

// POST /:id/rotar: emite la sucesora y deja la vieja con expira_en = ahora + ventana
// (default 48h) para que el tercero migre sin corte.

router.post(
  '/:id/rotar',
  validate({ params: idParamSchema, body: rotarApiKeySchema }),
  asyncHandler(async (req, res) => {
    const id = req.params['id'] as string;
    const { ventanaHoras } = req.body as RotarApiKeyInput;

    const { apiKey, key, keyAnteriorExpiraEn } = await apiKeyService.rotar(id, ventanaHoras, {
      userId: req.userId!,
      userName: req.userName ?? 'Admin GoExpress',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(201).json({
      ...apiKey,
      key,
      keyAnteriorExpiraEn,
      aviso: 'Guarda esta key ahora: no se vuelve a mostrar. La key anterior sigue valida hasta su expiracion.',
    });
  })
);

export default router;
