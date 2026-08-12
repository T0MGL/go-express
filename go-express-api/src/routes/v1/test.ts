import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, AppError } from '../../middleware/errorHandler.js';
import { validate } from '../../middleware/validate.js';
import { supabase } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { env } from '../../config/env.js';
import { testWebhookEventLimiter } from '../../middleware/rateLimit.js';
import { deliverWebhook } from '../../services/webhookDispatcher.service.js';
import { buildEstadoCambiadoPayload, WEBHOOK_EVENTO_ESTADO_CAMBIADO } from '../../lib/webhook.js';
import { uuidSchema } from '../../lib/validators/common.schema.js';

const router = Router();

const bodySchema = z.object({
  // Sin endpointId se dispara contra todos los endpoints activos del cliente.
  endpointId: uuidSchema.optional(),
});

// POST /webhook-event: dispara un evento de muestra FIRMADO CON EL SECRETO REAL del
// endpoint, para que el integrador pruebe su verificacion HMAC end-to-end antes de
// recibir trafico live. Solo keys de test: es una herramienta de sandbox, y el rate
// limit estricto evita usarla como cañon de POSTs contra un tercero.

router.post(
  '/webhook-event',
  ...(env.NODE_ENV !== 'test' ? [testWebhookEventLimiter] : []),
  validate({ body: bodySchema }),
  asyncHandler(async (req, res) => {
    if (!req.apiKeyModoTest) {
      throw AppError.forbidden('Este endpoint es solo para keys de prueba (ge_test_)');
    }

    const { endpointId } = req.body as { endpointId?: string };
    const clienteId = req.clienteId!;

    let q = supabase
      .from('webhook_endpoints')
      .select('id, url, secreto')
      .eq('cliente_id', clienteId)
      .eq('activo', true);
    if (endpointId) q = q.eq('id', endpointId);

    const { data, error } = await q;

    if (error) {
      logger.error({ error, clienteId }, '[WEBHOOK TEST] Error buscando endpoints');
      throw new AppError('Error buscando webhook endpoints', 500, 'DB_ERROR');
    }

    const endpoints = (data ?? []) as Array<{ id: string; url: string; secreto: string }>;
    if (endpoints.length === 0) {
      throw AppError.badRequest(
        'No hay webhook endpoints activos registrados. Crea uno con POST /api/v1/webhook-endpoints primero.'
      );
    }

    // Evento de muestra con la misma forma exacta que un delivery real, marcado
    // simulated. Entrega directa (sin outbox): el integrador quiere el resultado ya.
    const payload = buildEstadoCambiadoPayload({
      tracking: 'GE-TEST-0000000002',
      estadoAnterior: 'en_reparto',
      estadoNuevo: 'entregado',
      codigoReferencia: 'PEDIDO-002',
      simulated: true,
    });

    const resultados = await Promise.all(
      endpoints.map(async (e) => {
        const result = await deliverWebhook({
          url: e.url,
          secreto: e.secreto,
          evento: WEBHOOK_EVENTO_ESTADO_CAMBIADO,
          deliveryId: `test-${e.id}`,
          payload,
        });
        return {
          endpointId: e.id,
          url: e.url,
          entregado: result.ok,
          httpStatus: result.httpStatus,
        };
      })
    );

    res.json({ evento: WEBHOOK_EVENTO_ESTADO_CAMBIADO, simulated: true, resultados });
  })
);

export default router;
