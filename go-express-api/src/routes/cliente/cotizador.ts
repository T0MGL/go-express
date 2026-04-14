import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, AppError } from '../../middleware/errorHandler.js';
import { validate } from '../../middleware/validate.js';
import { supabase } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { cotizarSchema } from '../../lib/validators/tarifa.schema.js';
import { calcularCosto } from '../../lib/volumetric.js';
import { parseSeguroConfig, calcularSeguroAdicional, puedeAsegurar } from '../../lib/seguro.js';
import type { TarifaRow } from '../../types/index.js';
import type { CotizarInput } from '../../lib/validators/tarifa.schema.js';

const seguroCotizarSchema = z.object({
  valorDeclarado: z.number().int().nonnegative().max(1_000_000_000),
});

const router = Router();

router.get(
  '/ciudades',
  asyncHandler(async (_req, res) => {
    const { data, error } = await supabase
      .from('tarifas')
      .select('origen, destino')
      .eq('activo', true)
      .eq('eliminado', false);

    if (error) {
      logger.error({ error }, 'Error fetching cities');
      throw new AppError(`Error fetching cities: ${error.message}`, 500, 'DB_ERROR');
    }

    const rows = (data ?? []) as Array<Pick<TarifaRow, 'origen' | 'destino'>>;

    // Collect unique city names
    const ciudades = new Set<string>();
    for (const row of rows) {
      ciudades.add(row.origen);
      ciudades.add(row.destino);
    }

    res.json(Array.from(ciudades).sort());
  })
);

router.post(
  '/cotizar',
  validate({ body: cotizarSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as CotizarInput;

    // Find matching tarifa (origen, destino, tipoServicio) that is activo and not eliminado
    let q = supabase
      .from('tarifas')
      .select('id, origen, destino, tipo_servicio, precio_base, peso_base, precio_por_kg_extra, factor_dimensional, activo, creado_por, eliminado, eliminado_por, eliminado_en, motivo_eliminacion, created_at, updated_at')
      .eq('origen', input.origen)
      .eq('destino', input.destino)
      .eq('activo', true)
      .eq('eliminado', false);

    if (input.tipoServicio) {
      q = q.eq('tipo_servicio', input.tipoServicio);
    }

    const { data, error } = await q.limit(1).single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw AppError.notFound('No tarifa found for this route');
      }
      logger.error({ error, input }, 'Error fetching tarifa for cotización');
      throw new AppError(`Error fetching tarifa: ${error.message}`, 500, 'DB_ERROR');
    }

    const tarifa = data as TarifaRow;

    const costo = calcularCosto(
      {
        precioBase: tarifa.precio_base,
        pesoBase: tarifa.peso_base,
        precioPorKgExtra: tarifa.precio_por_kg_extra,
        factorDimensional: tarifa.factor_dimensional,
      },
      input.peso,
      input.dimensiones
    );

    res.json({
      ...costo,
      tarifa: {
        tipoServicio: tarifa.tipo_servicio,
        origen: tarifa.origen,
        destino: tarifa.destino,
      },
    });
  })
);

/**
 * POST /seguro: cotiza seguro para un valor declarado sin exponer la config.
 * Devuelve solo el resultado calculado por-envio. La tasa, minimo y maximo no se exponen
 * crudos; el cliente recibe `umbralIncluido` y `maximoAsegurable` porque son limites
 * que necesita comunicar al usuario ("incluido hasta X", "contactanos arriba de Y"),
 * pero NO recibe `tasaAdicional` ni `minimoAdicional` que son parametros internos.
 */
router.post(
  '/seguro',
  validate({ body: seguroCotizarSchema }),
  asyncHandler(async (req, res) => {
    const { valorDeclarado } = req.body as { valorDeclarado: number };

    const { data, error } = await supabase
      .from('configuracion')
      .select('value')
      .eq('key', 'seguro_config')
      .maybeSingle();

    if (error) {
      logger.error({ error }, 'Error fetching seguro config for cliente cotizar');
      throw new AppError('Error fetching seguro config', 500, 'DB_ERROR');
    }

    const cfg = parseSeguroConfig((data as { value: unknown } | null)?.value ?? null);
    const costoAdicional = calcularSeguroAdicional(valorDeclarado, cfg);
    const incluido = valorDeclarado <= cfg.umbralIncluido;
    const asegurable = puedeAsegurar(valorDeclarado, cfg);
    const requiereRevisionManual = valorDeclarado > cfg.maximoAsegurable;

    res.json({
      incluido,
      asegurable,
      requiereRevisionManual,
      costoAdicional,
      umbralIncluido: cfg.umbralIncluido,
      maximoAsegurable: cfg.maximoAsegurable,
    });
  })
);

export default router;
