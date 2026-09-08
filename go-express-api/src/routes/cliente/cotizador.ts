import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, AppError } from '../../middleware/errorHandler.js';
import { dbError } from '../../lib/dbError.js';
import { validate } from '../../middleware/validate.js';
import { supabase } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { cotizarSchema } from '../../lib/validators/tarifa.schema.js';
import { calcularCosto } from '../../lib/volumetric.js';
import { resolverCiudad, resolverCiudades, type ResolucionCiudad } from '../../lib/ciudad.js';
import { mensajeSinCobertura } from '../../lib/cotizacion.js';
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
      throw dbError(error, `Error fetching cities: ${error.message}`);
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
      throw dbError(clienteError, 'Error fetching cliente');
    }

    const origenInput = (clienteData as { ciudad: string | null }).ciudad?.trim() || 'Asuncion';

    // clientes.ciudad es texto libre cargado a mano, asi que puede venir con o sin tilde. Se
    // resuelve contra el catalogo una sola vez y de ahi en mas la busqueda es por id, la misma
    // identidad que usa el cotizador y el panel de cobertura.
    const origenResuelto = await resolverCiudad(supabase, origenInput);

    if (origenResuelto.estado !== 'resuelta') {
      logger.warn(
        { clienteId, origen: origenInput, estado: origenResuelto.estado },
        'Destinos: la ciudad del cliente no resuelve contra el catalogo'
      );
      res.json({ origen: origenInput, destinos: [] });
      return;
    }

    const { data, error } = await supabase
      .from('tarifas')
      .select('destino')
      .eq('origen_ciudad_id', origenResuelto.ciudad.id)
      .eq('activo', true)
      .eq('eliminado', false);

    if (error) {
      logger.error({ error, origen: origenInput }, 'Error fetching destinos');
      throw dbError(error, 'Error fetching destinos');
    }

    const rows = (data ?? []) as Array<{ destino: string }>;
    const destinos = Array.from(new Set(rows.map((r) => r.destino))).sort();

    res.json({ origen: origenResuelto.ciudad.nombre, destinos });
  })
);

router.post(
  '/cotizar',
  validate({ body: cotizarSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body as CotizarInput;

    // El id manda. Cuando el caller solo tiene el nombre (API vieja, importaciones), se resuelve
    // contra el catalogo antes de buscar: comparar `.eq('origen', 'Asunción')` contra el texto de
    // la tarifa devolvia 404 en rutas que si existian, porque la creacion tolera la tilde y esta
    // busqueda no.
    const ruta = await resolverExtremos(input);

    let q = supabase
      .from('tarifas')
      // Solo lo que entra al calculo y a la respuesta. El resto de la fila (creado_por,
      // eliminado_por, motivos) es interno y no tiene por que viajar hasta aca.
      .select('origen, destino, tipo_servicio, precio_base, peso_base, precio_por_kg_extra, factor_dimensional')
      .eq('activo', true)
      .eq('eliminado', false)
      .eq('origen_ciudad_id', ruta.origenCiudadId)
      .eq('destino_ciudad_id', ruta.destinoCiudadId);

    if (input.tipoServicio) {
      q = q.eq('tipo_servicio', input.tipoServicio);
    }

    // Mismo desempate que computeCostoEnvio: el orden del enum hace ganar al servicio base.
    const { data, error } = await q
      .order('tipo_servicio', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      logger.error({ error, input }, 'Error fetching tarifa for cotización');
      throw dbError(error, `Error fetching tarifa: ${error.message}`);
    }

    if (!data) {
      throw AppError.notFound(
        mensajeSinCobertura('portal', ruta.origenNombre, ruta.destinoNombre, { motivo: 'sin_tarifa' })
      );
    }

    const tarifa = data as Pick<
      TarifaRow,
      'origen' | 'destino' | 'tipo_servicio' | 'precio_base' | 'peso_base' | 'precio_por_kg_extra' | 'factor_dimensional'
    >;

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
      throw dbError(error, 'Error fetching seguro config');
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

interface RutaCotizable {
  origenCiudadId: string;
  destinoCiudadId: string;
  origenNombre: string;
  destinoNombre: string;
}

/**
 * Los dos extremos de la ruta, siempre como ids. El schema garantiza que cada extremo viene por
 * id o por nombre.
 *
 * Las dos formas de fallar no son la misma y no se colapsan: una ciudad que no existe es un 404,
 * porque no hay ruta que cotizar; una ciudad cuyo nombre se repite en dos departamentos es un
 * 400, porque la ruta puede existir y lo que falta es que el caller diga cual. El texto sale de
 * mensajeSinCobertura para que el portal reciba el mismo copy que en los demas caminos.
 */
async function resolverExtremos(input: CotizarInput): Promise<RutaCotizable> {
  const porNombre = [
    input.origenCiudadId ? null : input.origen ?? null,
    input.destinoCiudadId ? null : input.destino ?? null,
  ].filter((nombre): nombre is string => nombre !== null);

  const resoluciones =
    porNombre.length > 0
      ? await resolverCiudades(supabase, porNombre)
      : new Map<string, ResolucionCiudad>();

  const origen = extremo(resoluciones, input.origenCiudadId, input.origen);
  const destino = extremo(resoluciones, input.destinoCiudadId, input.destino);

  return {
    origenCiudadId: origen.id,
    destinoCiudadId: destino.id,
    origenNombre: origen.nombre,
    destinoNombre: destino.nombre,
  };
}

function extremo(
  resoluciones: Map<string, ResolucionCiudad>,
  ciudadId: string | undefined,
  nombre: string | undefined,
): { id: string; nombre: string } {
  // Vino por id: no hay nombre que resolver, y el nombre para el copy es el que mando el caller
  // o el id mismo si no mando ninguno. Si el id no existe, la busqueda devuelve cero filas y el
  // camino termina en el 404 de ruta sin tarifa, que es la verdad.
  if (ciudadId) return { id: ciudadId, nombre: nombre ?? ciudadId };

  const resolucion = nombre === undefined ? undefined : resoluciones.get(nombre);
  const etiqueta = nombre ?? '';

  if (resolucion?.estado === 'resuelta') {
    return { id: resolucion.ciudad.id, nombre: resolucion.ciudad.nombre };
  }

  if (resolucion?.estado === 'ambigua') {
    throw AppError.badRequest(
      mensajeSinCobertura('portal', etiqueta, etiqueta, {
        motivo: 'ciudad_ambigua',
        ciudad: etiqueta,
        coincidencias: resolucion.coincidencias,
      })
    );
  }

  throw AppError.notFound(
    mensajeSinCobertura('portal', etiqueta, etiqueta, {
      motivo: 'ciudad_desconocida',
      ciudad: etiqueta,
    })
  );
}

export default router;
