import { Router } from 'express';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { validate } from '../../middleware/validate.js';
import { requirePermiso } from '../../middleware/apiKeyAuth.js';
import { supabase } from '../../config/database.js';
import { computeCostoEnvio } from '../../lib/cotizacion.js';
import { v1TarifaQuerySchema } from '../../lib/validators/api-key.schema.js';
import type { V1TarifaQuery } from '../../lib/validators/api-key.schema.js';

const router = Router();

// GET /: cotizacion por origen/destino/peso (+ dimensiones opcionales) via la misma fuente
// de verdad que la creacion de envios (computeCostoEnvio). Sin tarifa que matchee responde
// matched=false y costo null: el gateway no inventa precios.

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
        mensaje: 'No hay tarifa configurada para la ruta solicitada. Contacta a GO EXPRESS para cotizarla.',
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
