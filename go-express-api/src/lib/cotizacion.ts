import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../middleware/errorHandler.js';
import { dbError } from './dbError.js';
import { logger } from '../config/logger.js';
import { calcularCosto, type Dimensiones } from './volumetric.js';
import { normalizeCiudad } from './ciudad.js';
import type { TarifaRow } from '../types/index.js';

export interface CotizacionInput {
  origen: string;
  destino: string;
  peso: number;
  dimensiones?: Dimensiones | null;
}

interface CotizacionBase {
  // Forma canonica del par origen/destino tomada de la tarifa cuando hubo match.
  // Si no hubo match, eco del input para que el caller pueda nombrar la ruta al usuario.
  origen: string;
  destino: string;
}

export interface CotizacionConTarifa extends CotizacionBase {
  matched: true;
  costo: number;
  tarifaId: string;
}

export interface CotizacionSinTarifa extends CotizacionBase {
  matched: false;
  costo: 0;
  tarifaId: null;
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

/**
 * Calcula el costo de un envio server-side a partir de la tarifa activa que matchea
 * el par origen/destino. Es la unica fuente de verdad para el costo: ni el cliente HTTP
 * ni el admin pueden inyectar un costo arbitrario en el flujo normal.
 *
 * No lanza: devuelve matched=false para que las superficies que informan sin crear nada
 * (cotizador del gateway, filas de una importacion masiva) puedan seguir su curso. Las
 * que crean envios usan cotizarRutaConCobertura, que rechaza.
 */
export async function computeCostoEnvio(
  supabase: SupabaseClient,
  input: CotizacionInput
): Promise<CotizacionResult> {
  const origenNorm = normalizeCiudad(input.origen);
  const destinoNorm = normalizeCiudad(input.destino);

  const { data, error } = await supabase
    .from('tarifas')
    .select(TARIFA_COLUMNS)
    .eq('activo', true)
    .eq('eliminado', false);

  if (error) {
    logger.error({ error, origen: input.origen, destino: input.destino }, 'Error fetching tarifas para cotizacion');
    throw dbError(error, 'Error calculando costo del envio');
  }

  const tarifas = (data ?? []) as TarifaCotizable[];
  const tarifa = tarifas.find(
    (t) => normalizeCiudad(t.origen) === origenNorm && normalizeCiudad(t.destino) === destinoNorm
  );

  if (!tarifa) {
    return {
      matched: false,
      costo: 0,
      tarifaId: null,
      origen: input.origen,
      destino: input.destino,
    };
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

/**
 * Copy del "no hay cobertura para esta ruta". Vive en un solo lugar porque el mismo hecho
 * se le cuenta a cuatro superficies distintas y todas tienen que nombrar el par concreto:
 * quien lo lee esta mirando un formulario y necesita saber cual de los dos campos corregir.
 */
export function mensajeSinCobertura(
  superficie: SuperficieCotizacion,
  origen: string,
  destino: string
): string {
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
      { origen: input.origen, destino: input.destino, superficie },
      'Ruta sin tarifa: creacion de envio rechazada'
    );
    throw new AppError(
      mensajeSinCobertura(superficie, input.origen, input.destino),
      422,
      CODIGO_RUTA_SIN_TARIFA,
      { origen: input.origen, destino: input.destino }
    );
  }

  return cotizacion;
}
