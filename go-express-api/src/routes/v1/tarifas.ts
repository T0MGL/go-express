import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { validate } from '../../middleware/validate.js';
import { requirePermiso } from '../../middleware/apiKeyAuth.js';
import { supabase } from '../../config/database.js';
import { computeCostoEnvio, mensajeSinCobertura } from '../../lib/cotizacion.js';
import { v1TarifaQuerySchema } from '../../lib/validators/api-key.schema.js';
import type { V1TarifaQuery } from '../../lib/validators/api-key.schema.js';

const router = Router();

// GET /: cotizacion por origen/destino/peso (+ dimensiones opcionales) via la misma fuente
// de verdad que la creacion de envios. Sin tarifa que matchee responde 200 con matched=false
// y costo null: aca no se crea nada, asi que informar es la respuesta correcta. El POST de
// envios sobre esa misma ruta rechaza con 422.

router.get(
  '/',
  requirePermiso('consultar_tarifas'),
  validate({ query: v1TarifaQuerySchema }),
  asyncHandler(async (req, res) => {
    const { origen, destino, peso, largo, ancho, alto } = req.query as unknown as V1TarifaQuery;

    // El schema garantiza que las dimensiones vienen las tres o ninguna.
    const dimensiones =
      largo !== undefined && ancho !== undefined && alto !== undefined
        ? { largo, ancho, alto }
        : null;

    const cotizacion = await computeCostoEnvio(supabase, { origen, destino, peso, dimensiones });

    if (!cotizacion.matched) {
      res.json({
        matched: false,
        costo: null,
        origen,
        destino,
        mensaje: mensajeSinCobertura('gateway_cotizacion', origen, destino, cotizacion.rechazo),
      });
      return;
    }

    res.json({
      matched: true,
      costo: cotizacion.costo,
      moneda: 'PYG',
      origen: cotizacion.origen,
      destino: cotizacion.destino,
    });
  })
);

export default router;
