import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../middleware/errorHandler.js';
import { dbError } from './dbError.js';
import { logger } from '../config/logger.js';
import { calcularCosto, type Dimensiones } from './volumetric.js';
import { resolverCiudades, type CiudadResuelta, type ResolucionCiudad } from './ciudad.js';
import type { TarifaRow } from '../types/index.js';

export interface CotizacionInput {
  origen: string;
  destino: string;
  peso: number;
  dimensiones?: Dimensiones | null;
}

interface CotizacionBase {
  // Forma canonica del par origen/destino tomada de la tarifa cuando hubo match, que desde 057
  // es el nombre del catalogo de ciudades. Si no hubo match, eco del input para que el caller
  // pueda nombrarle al usuario lo que escribio y sepa cual de los dos campos corregir.
  origen: string;
  destino: string;
}

export interface CotizacionConTarifa extends CotizacionBase {
  matched: true;
  costo: number;
  tarifaId: string;
}

/**
 * Tres formas de no tener precio, y son distintas para el que las lee: un nombre que no existe
 * en el catalogo se corrige escribiendo bien, un nombre repetido en dos departamentos se
 * corrige mandando el id, y una ruta real sin tarifa es una ruta que GO EXPRESS todavia no abrio.
 */
export type RutaRechazada =
  | { motivo: 'ciudad_desconocida'; ciudad: string }
  | { motivo: 'ciudad_ambigua'; ciudad: string; coincidencias: number }
  | { motivo: 'sin_tarifa' };

export interface CotizacionSinTarifa extends CotizacionBase {
  matched: false;
  costo: 0;
  tarifaId: null;
  rechazo: RutaRechazada;
}

// Union discriminada: quien lee `costo` sin chequear `matched` esta leyendo un cero que
// no significa "gratis", significa "no hay ruta". El tipo obliga a decidir.
export type CotizacionResult = CotizacionConTarifa | CotizacionSinTarifa;

// Superficie desde la que se pregunto por la ruta. Determina a quien se le habla en el
// rechazo: un integrador que consume el gateway, el operador del mostrador o la tienda
// que carga desde su portal.
export type SuperficieCotizacion =
  | 'gateway_creacion'
  | 'gateway_cotizacion'
  | 'mostrador'
  | 'portal';

// Codigo estable del rechazo. Ya es contrato publico del gateway v1, asi que los caminos
// internos convergen a el en vez de inventar uno propio.
export const CODIGO_RUTA_SIN_TARIFA = 'RUTA_SIN_TARIFA';

const TARIFA_COLUMNS =
  'id, origen, destino, precio_base, peso_base, precio_por_kg_extra, factor_dimensional';

type TarifaCotizable = Pick<
  TarifaRow,
  'id' | 'origen' | 'destino' | 'precio_base' | 'peso_base' | 'precio_por_kg_extra' | 'factor_dimensional'
>;

function hasDims(d: Dimensiones | null | undefined): d is Dimensiones {
  return !!d && d.largo > 0 && d.ancho > 0 && d.alto > 0;
}

type RutaResuelta =
  | { ok: true; origen: CiudadResuelta; destino: CiudadResuelta }
  | { ok: false; rechazo: RutaRechazada };

/**
 * El borde: los dos nombres entran, dos ids salen. De aca para adentro la ruta es el par de
 * ids y nadie vuelve a comparar texto.
 */
async function resolverRuta(
  supabase: SupabaseClient,
  origen: string,
  destino: string,
): Promise<RutaResuelta> {
  const resoluciones = await resolverCiudades(supabase, [origen, destino]);

  const extremoOrigen = extremoDeRuta(origen, resoluciones.get(origen));
  if (!extremoOrigen.ok) return extremoOrigen;

  const extremoDestino = extremoDeRuta(destino, resoluciones.get(destino));
  if (!extremoDestino.ok) return extremoDestino;

  return { ok: true, origen: extremoOrigen.ciudad, destino: extremoDestino.ciudad };
}

function extremoDeRuta(
  nombre: string,
  resolucion: ResolucionCiudad | undefined,
): { ok: true; ciudad: CiudadResuelta } | { ok: false; rechazo: RutaRechazada } {
  if (resolucion?.estado === 'resuelta') {
    return { ok: true, ciudad: resolucion.ciudad };
  }
  if (resolucion?.estado === 'ambigua') {
    return {
      ok: false,
      rechazo: { motivo: 'ciudad_ambigua', ciudad: nombre, coincidencias: resolucion.coincidencias },
    };
  }
  return { ok: false, rechazo: { motivo: 'ciudad_desconocida', ciudad: nombre } };
}

/**
 * Calcula el costo de un envio server-side a partir de la tarifa activa de la ruta. Es la unica
 * fuente de verdad para el costo: ni el cliente HTTP ni el admin pueden inyectar un costo
 * arbitrario en el flujo normal.
 *
 * No lanza: devuelve matched=false para que las superficies que informan sin crear nada
 * (cotizador del gateway, filas de una importacion masiva) puedan seguir su curso. Las
 * que crean envios usan cotizarRutaConCobertura, que rechaza.
 */
export async function computeCostoEnvio(
  supabase: SupabaseClient,
  input: CotizacionInput
): Promise<CotizacionResult> {
  const ruta = await resolverRuta(supabase, input.origen, input.destino);

  if (!ruta.ok) {
    return sinTarifa(input, ruta.rechazo);
  }

  // El unique de 057 garantiza una sola tarifa viva por (origen, destino, tipo_servicio), asi
  // que lo unico que puede devolver mas de una fila es una ruta con varios tipos de servicio
  // cargados. El orden del enum (estandar, express, economico) hace ganar al servicio base, que
  // es lo que cotizaba de hecho la unica tarifa que existe. Sin ORDER BY esto lo decidia el
  // orden fisico de las filas y el precio no era determinista.
  const { data, error } = await supabase
    .from('tarifas')
    .select(TARIFA_COLUMNS)
    .eq('origen_ciudad_id', ruta.origen.id)
    .eq('destino_ciudad_id', ruta.destino.id)
    .eq('activo', true)
    .eq('eliminado', false)
    .order('tipo_servicio', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) {
    logger.error(
      { error, origenCiudadId: ruta.origen.id, destinoCiudadId: ruta.destino.id },
      'Error fetching tarifas para cotizacion',
    );
    throw dbError(error, 'Error calculando costo del envio');
  }

  const tarifa = ((data ?? []) as TarifaCotizable[])[0];

  if (!tarifa) {
    return sinTarifa(input, { motivo: 'sin_tarifa' });
  }

  const costoTotal = calcularCosto(
    {
      precioBase: tarifa.precio_base,
      pesoBase: tarifa.peso_base,
      precioPorKgExtra: tarifa.precio_por_kg_extra,
      factorDimensional: tarifa.factor_dimensional,
    },
    input.peso,
    hasDims(input.dimensiones) ? input.dimensiones : undefined
  ).costoTotal;

  return {
    matched: true,
    costo: costoTotal,
    tarifaId: tarifa.id,
    origen: tarifa.origen,
    destino: tarifa.destino,
  };
}

function sinTarifa(input: CotizacionInput, rechazo: RutaRechazada): CotizacionSinTarifa {
  return {
    matched: false,
    costo: 0,
    tarifaId: null,
    origen: input.origen,
    destino: input.destino,
    rechazo,
  };
}

/**
 * Copy del rechazo de una ruta. Vive en un solo lugar porque el mismo hecho se le cuenta a
 * cuatro superficies distintas y todas tienen que nombrar el par concreto: quien lo lee esta
 * mirando un formulario y necesita saber cual de los dos campos corregir.
 */
export function mensajeSinCobertura(
  superficie: SuperficieCotizacion,
  origen: string,
  destino: string,
  rechazo: RutaRechazada,
): string {
  if (rechazo.motivo === 'ciudad_desconocida') {
    switch (superficie) {
      case 'gateway_creacion':
      case 'gateway_cotizacion':
        return `La ciudad "${rechazo.ciudad}" no figura en el catalogo de GO EXPRESS. Consulta GET /api/public/ciudades para los nombres exactos.`;
      case 'mostrador':
        return `"${rechazo.ciudad}" no figura en el catálogo de ciudades. Revisá cómo está escrita, o cargá el envío con costo manual y motivo si es una excepción.`;
      case 'portal':
        return `"${rechazo.ciudad}" no figura en nuestro catálogo de ciudades. Elegí una de la lista.`;
    }
  }

  if (rechazo.motivo === 'ciudad_ambigua') {
    switch (superficie) {
      case 'gateway_creacion':
      case 'gateway_cotizacion':
        return `Hay ${rechazo.coincidencias} ciudades con el nombre "${rechazo.ciudad}". Manda el id de la ciudad, que sale de GET /api/public/ciudades.`;
      case 'mostrador':
      case 'portal':
        return `Hay ${rechazo.coincidencias} ciudades con el nombre "${rechazo.ciudad}". Elegila de la lista para que quede sin ambigüedad.`;
    }
  }

  const ruta = `${origen} a ${destino}`;
  switch (superficie) {
    case 'gateway_creacion':
      return `No hay tarifa configurada para la ruta ${ruta}. Consulta GET /api/v1/tarifas antes de crear el envio o contacta a GO EXPRESS.`;
    case 'gateway_cotizacion':
      return `No hay tarifa configurada para la ruta ${ruta}. Contacta a GO EXPRESS para habilitarla.`;
    case 'mostrador':
      return `Todavía no tenemos cobertura de ${ruta}. Cargá la tarifa de esa ruta en Tarifas, o creá el envío con costo manual y motivo si es una excepción.`;
    case 'portal':
      return `Todavía no tenemos cobertura de ${ruta}. Elegí otra ciudad de destino o escribinos y la habilitamos.`;
  }
}

/**
 * Cotiza para crear. Una ruta sin tarifa activa no es un envio pendiente de tasar: es un
 * envio que GO EXPRESS no toma. La cobertura se carga a medida que se abren rutas, y hasta
 * que la tarifa exista el envio se rechaza en el borde con 422.
 */
export async function cotizarRutaConCobertura(
  supabase: SupabaseClient,
  input: CotizacionInput,
  superficie: SuperficieCotizacion
): Promise<CotizacionConTarifa> {
  const cotizacion = await computeCostoEnvio(supabase, input);

  if (!cotizacion.matched) {
    logger.warn(
      { origen: input.origen, destino: input.destino, superficie, motivo: cotizacion.rechazo.motivo },
      'Ruta rechazada: creacion de envio abortada'
    );
    throw new AppError(
      mensajeSinCobertura(superficie, input.origen, input.destino, cotizacion.rechazo),
      422,
      CODIGO_RUTA_SIN_TARIFA,
      { origen: input.origen, destino: input.destino, motivo: cotizacion.rechazo.motivo }
    );
  }

  return cotizacion;
}
