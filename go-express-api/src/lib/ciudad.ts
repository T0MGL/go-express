import type { SupabaseClient } from '@supabase/supabase-js';
import { dbError } from './dbError.js';
import { logger } from '../config/logger.js';

export interface CiudadResuelta {
  id: string;
  nombre: string;
}

/**
 * Por que no alcanza con "no la encontre": una ciudad que no existe en el catalogo es un dato
 * mal escrito, y una ciudad cuyo nombre se repite en dos departamentos es un dato incompleto.
 * Al que carga el envio hay que decirle cosas distintas.
 */
export type ResolucionCiudad =
  | { estado: 'resuelta'; ciudad: CiudadResuelta }
  | { estado: 'desconocida' }
  | { estado: 'ambigua'; coincidencias: number };

interface ResolverCiudadesRow {
  nombre_input: string;
  ciudad_id: string | null;
  nombre_canonico: string | null;
  coincidencias: number;
}

const DESCONOCIDA: ResolucionCiudad = { estado: 'desconocida' };

/**
 * Unico punto del sistema donde un nombre escrito por alguien se convierte en identidad de
 * ciudad. La normalizacion (tildes, mayusculas, espacios duros, NFD contra NFC) vive entera en
 * public.norm_ciudad, del lado de la base, junto al catalogo que define que es una ciudad.
 *
 * Antes habia dos normalizadores, uno en TypeScript y uno en SQL, que segun el comentario del
 * indice se espejaban y en los hechos no: el de SQL no recomponia NFD ni sacaba espacios duros.
 * Dos filas que el codigo consideraba la misma ruta entraban igual, y el precio cobrado
 * terminaba dependiendo del orden en que Postgres devolviera las filas. Esa clase de bug se
 * cierra teniendo un solo normalizador, no dos que hay que mantener iguales.
 *
 * El Map viene indexado por los mismos strings que se pasaron, sin recortar ni canonizar, para
 * que el caller busque por lo que tiene a mano.
 */
export async function resolverCiudades(
  supabase: SupabaseClient,
  nombres: readonly string[],
): Promise<Map<string, ResolucionCiudad>> {
  const porInput = new Map<string, ResolucionCiudad>();
  const consultables = new Set<string>();

  for (const nombre of nombres) {
    const limpio = nombre.trim();
    if (limpio.length === 0) {
      porInput.set(nombre, DESCONOCIDA);
      continue;
    }
    consultables.add(limpio);
  }

  if (consultables.size === 0) return porInput;

  const { data, error } = await supabase.rpc('resolver_ciudades', {
    p_nombres: Array.from(consultables),
  });

  if (error) {
    logger.error(
      { error, nombres: Array.from(consultables) },
      'Error resolviendo ciudades contra el catalogo',
    );
    throw dbError(error, 'Error resolviendo las ciudades de la ruta');
  }

  const porNombreLimpio = new Map<string, ResolucionCiudad>();
  for (const row of (data ?? []) as ResolverCiudadesRow[]) {
    porNombreLimpio.set(row.nombre_input, resolucionDeFila(row));
  }

  for (const nombre of nombres) {
    if (porInput.has(nombre)) continue;
    porInput.set(nombre, porNombreLimpio.get(nombre.trim()) ?? DESCONOCIDA);
  }

  return porInput;
}

export async function resolverCiudad(
  supabase: SupabaseClient,
  nombre: string,
): Promise<ResolucionCiudad> {
  const resoluciones = await resolverCiudades(supabase, [nombre]);
  return resoluciones.get(nombre) ?? DESCONOCIDA;
}

function resolucionDeFila(row: ResolverCiudadesRow): ResolucionCiudad {
  if (row.ciudad_id !== null && row.nombre_canonico !== null) {
    return { estado: 'resuelta', ciudad: { id: row.ciudad_id, nombre: row.nombre_canonico } };
  }
  if (row.coincidencias > 1) {
    return { estado: 'ambigua', coincidencias: row.coincidencias };
  }
  return DESCONOCIDA;
}
