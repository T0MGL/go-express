import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, AppError } from '../../middleware/errorHandler.js';
import { validate } from '../../middleware/validate.js';
import { supabase } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { cotizarSchema } from '../../lib/validators/tarifa.schema.js';
import { calcularCosto } from '../../lib/volumetric.js';
import { normalizeCiudad } from '../../lib/ciudad.js';
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

/**
 * GET /destinos: devuelve las ciudades destino disponibles desde el origen del cliente
 * autenticado (cliente.ciudad). Si el cliente no tiene ciudad cargada, usa 'Asuncion'
 * como fallback. Usado por el form /portal/nuevo-paquete para mostrar un dropdown
 * de destinos con cobertura real (no departamentos), y pintar el origen readonly.
 */
router.get(
  '/destinos',
  asyncHandler(async (req, res) => {
    const clienteId = req.clienteId!;

    const { data: clienteData, error: clienteError } = await supabase
      .from('clientes')
      .select('ciudad')
      .eq('id', clienteId)
      .single();

    if (clienteError) {
      logger.error({ error: clienteError, clienteId }, 'Error fetching cliente origen');
      throw new AppError('Error fetching cliente', 500, 'DB_ERROR');
    }

    const origen = (clienteData as { ciudad: string | null }).ciudad?.trim() || 'Asuncion';
    const origenNorm = normalizeCiudad(origen);

    // Fetch todos los origenes/destinos activos y filtrar en JS con normalizacion
    // (tolera que la tarifa se haya cargado con 'Asuncion' vs cliente con 'Asunción').
    const { data, error } = await supabase
      .from('tarifas')
      .select('origen, destino')
      .eq('activo', true)
      .eq('eliminado', false);

    if (error) {
      logger.error({ error, origen }, 'Error fetching destinos');
      throw new AppError('Error fetching destinos', 500, 'DB_ERROR');
    }

    const rows = (data ?? []) as Array<{ origen: string; destino: string }>;
    const destinos = Array.from(
      new Set(
        rows
          .filter((r) => normalizeCiudad(r.origen) === origenNorm)
          .map((r) => r.destino)
      )
    ).sort();

    res.json({ origen, destinos });
  })
);

router.post(
  '/cotizar',
  validate({ body: cotizarSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as CotizarInput;

    // Find matching tarifa. Prefer UUID FK lookup when available (new path), fall back to text match.
    let q = supabase
      .from('tarifas')
      .select('id, origen, destino, tipo_servicio, precio_base, peso_base, precio_por_kg_extra, factor_dimensional, activo, creado_por, eliminado, eliminado_por, eliminado_en, motivo_eliminacion, created_at, updated_at')
      .eq('activo', true)
      .eq('eliminado', false);

    if (input.origenCiudadId && input.destinoCiudadId) {
      q = q.eq('origen_ciudad_id', input.origenCiudadId).eq('destino_ciudad_id', input.destinoCiudadId);
    } else {
      q = q.eq('origen', input.origen!).eq('destino', input.destino!);
    }

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
