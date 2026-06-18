import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../middleware/errorHandler.js';
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

export interface CotizacionResult {
  // Costo derivado de la tarifa que matchea origen/destino normalizados. 0 si no hay match.
  costo: number;
  tarifaId: string | null;
  // Forma canonica del par origen/destino tomada de la tarifa cuando hubo match.
  // Si no hubo match, eco del input para que el caller persista lo recibido.
  origen: string;
  destino: string;
  matched: boolean;
}

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
 * ni el admin pueden inyectar un costo arbitrario en el flujo normal. La cotizacion del
 * portal cliente y la creacion admin pasan por aca.
 *
 * Si no existe tarifa activa que matchee, retorna costo 0 y matched=false. El caller
 * decide si bloquear o crear con costo 0 para que un admin lo tase despues (comportamiento
 * historico del portal cliente). Nunca lanza por ausencia de tarifa: la falta de
 * configuracion no debe romper la creacion de un envio.
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
    throw new AppError('Error calculando costo del envio', 500, 'DB_ERROR');
  }

  const tarifas = (data ?? []) as TarifaCotizable[];
  const tarifa = tarifas.find(
    (t) => normalizeCiudad(t.origen) === origenNorm && normalizeCiudad(t.destino) === destinoNorm
  );

  if (!tarifa) {
    return {
      costo: 0,
      tarifaId: null,
      origen: input.origen,
      destino: input.destino,
      matched: false,
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
    costo: costoTotal,
    tarifaId: tarifa.id,
    origen: tarifa.origen,
    destino: tarifa.destino,
    matched: true,
  };
}
