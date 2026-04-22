import { supabase } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../config/logger.js';
import type {
  CiudadRow,
  DepartamentoRow,
  Ciudad,
  Departamento,
  CoberturaResumen,
  CoberturaDepartamento,
} from '../types/index.js';

const DEPARTAMENTO_COLUMNS = 'id, nombre, capital, orden, created_at, updated_at';
const CIUDAD_COLUMNS = 'id, nombre, departamento_id, es_capital, orden, created_at, updated_at';

function mapDepartamento(row: DepartamentoRow): Departamento {
  return {
    id: row.id,
    nombre: row.nombre,
    capital: row.capital,
    orden: row.orden,
  };
}

class CiudadService {
  /**
   * Devuelve las 263 ciudades con flag `habilitada` derivado de tarifas activas
   * (una ciudad esta habilitada sii existe una tarifa activa no eliminada que la
   * referencie como origen o destino). Plano, ordenado por depto.orden, ciudad.orden.
   */
  async list(): Promise<Ciudad[]> {
    const [ciudadesResult, departamentosResult, tarifasResult] = await Promise.all([
      supabase.from('ciudades').select(CIUDAD_COLUMNS).order('orden'),
      supabase.from('departamentos').select(DEPARTAMENTO_COLUMNS).order('orden'),
      supabase
        .from('tarifas')
        .select('origen_ciudad_id, destino_ciudad_id')
        .eq('activo', true)
        .eq('eliminado', false),
    ]);

    if (ciudadesResult.error) {
      logger.error({ error: ciudadesResult.error }, 'Error fetching ciudades');
      throw new AppError('Error fetching ciudades', 500, 'DB_ERROR');
    }
    if (departamentosResult.error) {
      logger.error({ error: departamentosResult.error }, 'Error fetching departamentos');
      throw new AppError('Error fetching departamentos', 500, 'DB_ERROR');
    }
    if (tarifasResult.error) {
      logger.error({ error: tarifasResult.error }, 'Error fetching tarifas for cobertura');
      throw new AppError('Error fetching tarifas for cobertura', 500, 'DB_ERROR');
    }

    const ciudadesRows = (ciudadesResult.data ?? []) as unknown as CiudadRow[];
    const deptosRows = (departamentosResult.data ?? []) as unknown as DepartamentoRow[];
    const tarifaRows = (tarifasResult.data ?? []) as unknown as Array<{
      origen_ciudad_id: string | null;
      destino_ciudad_id: string | null;
    }>;

    const deptoById = new Map(deptosRows.map((d) => [d.id, d] as const));
    const habilitadasSet = new Set<string>();
    for (const t of tarifaRows) {
      if (t.origen_ciudad_id) habilitadasSet.add(t.origen_ciudad_id);
      if (t.destino_ciudad_id) habilitadasSet.add(t.destino_ciudad_id);
    }

    // Asunción is a capital district stored as its own departamento in the DB,
    // but operationally it belongs under Central for display purposes.
    const asuncionDepto = deptosRows.find((d) => d.nombre === 'Asunción');
    const centralDepto = deptosRows.find((d) => d.nombre === 'Central');

    const ciudades = ciudadesRows
      .map<Ciudad>((row) => {
        const deptId =
          asuncionDepto && centralDepto && row.departamento_id === asuncionDepto.id
            ? centralDepto.id
            : row.departamento_id;
        const depto = deptoById.get(deptId);
        return {
          id: row.id,
          nombre: row.nombre,
          departamentoId: deptId,
          departamentoNombre: depto?.nombre ?? '',
          esCapital: row.es_capital,
          orden: row.orden,
          habilitada: habilitadasSet.has(row.id),
        };
      })
      .sort((a, b) => {
        const deptoA = deptoById.get(a.departamentoId)?.orden ?? 99;
        const deptoB = deptoById.get(b.departamentoId)?.orden ?? 99;
        if (deptoA !== deptoB) return deptoA - deptoB;
        return a.orden - b.orden;
      });

    return ciudades;
  }

  async listDepartamentos(): Promise<Departamento[]> {
    const { data, error } = await supabase
      .from('departamentos')
      .select(DEPARTAMENTO_COLUMNS)
      .order('orden');

    if (error) {
      logger.error({ error }, 'Error fetching departamentos');
      throw new AppError('Error fetching departamentos', 500, 'DB_ERROR');
    }

    return (data as unknown as DepartamentoRow[]).map(mapDepartamento);
  }

  /**
   * Reporte de cobertura: cuantas ciudades de cada departamento estan habilitadas.
   * Ordenado por ratio ascendente (menor cobertura primero) para motivar expansion.
   * Incluye la lista completa de ciudades del depto con su flag habilitada, para
   * que el panel pueda renderizar los chips verde/gris sin un segundo fetch.
   */
  async getCobertura(): Promise<CoberturaResumen> {
    const [ciudadesResult, deptosResult, tarifasResult] = await Promise.all([
      supabase.from('ciudades').select(CIUDAD_COLUMNS).order('orden'),
      supabase.from('departamentos').select(DEPARTAMENTO_COLUMNS).order('orden'),
      supabase
        .from('tarifas')
        .select('origen_ciudad_id, destino_ciudad_id')
        .eq('activo', true)
        .eq('eliminado', false),
    ]);

    if (ciudadesResult.error || deptosResult.error || tarifasResult.error) {
      logger.error(
        {
          ciudadesError: ciudadesResult.error,
          deptosError: deptosResult.error,
          tarifasError: tarifasResult.error,
        },
        'Error fetching cobertura inputs',
      );
      throw new AppError('Error fetching cobertura', 500, 'DB_ERROR');
    }

    const ciudadesRows = (ciudadesResult.data ?? []) as unknown as CiudadRow[];
    const deptosRows = (deptosResult.data ?? []) as unknown as DepartamentoRow[];
    const tarifaRows = (tarifasResult.data ?? []) as unknown as Array<{
      origen_ciudad_id: string | null;
      destino_ciudad_id: string | null;
    }>;

    const habilitadasSet = new Set<string>();
    for (const t of tarifaRows) {
      if (t.origen_ciudad_id) habilitadasSet.add(t.origen_ciudad_id);
      if (t.destino_ciudad_id) habilitadasSet.add(t.destino_ciudad_id);
    }

    const byDepto = new Map<string, CiudadRow[]>();
    for (const c of ciudadesRows) {
      const lista = byDepto.get(c.departamento_id) ?? [];
      lista.push(c);
      byDepto.set(c.departamento_id, lista);
    }

    const departamentos: CoberturaDepartamento[] = deptosRows.map((d) => {
      const ciudadesDelDepto = (byDepto.get(d.id) ?? []).slice().sort((a, b) => a.orden - b.orden);
      const habilitadas = ciudadesDelDepto.filter((c) => habilitadasSet.has(c.id)).length;
      return {
        id: d.id,
        nombre: d.nombre,
        totalCiudades: ciudadesDelDepto.length,
        ciudadesHabilitadas: habilitadas,
        ciudades: ciudadesDelDepto.map((c) => ({
          id: c.id,
          nombre: c.nombre,
          esCapital: c.es_capital,
          orden: c.orden,
          habilitada: habilitadasSet.has(c.id),
        })),
      };
    });

    // Merge Asunción (capital district) into Central so it doesn't appear as its own department.
    const asuncionDeptoIdx = departamentos.findIndex((d) => d.nombre === 'Asunción');
    const centralDeptoIdx = departamentos.findIndex((d) => d.nombre === 'Central');
    if (asuncionDeptoIdx !== -1 && centralDeptoIdx !== -1) {
      const asuncionEntry = departamentos[asuncionDeptoIdx]!;
      const centralEntry = departamentos[centralDeptoIdx]!;
      centralEntry.ciudades = [...centralEntry.ciudades, ...asuncionEntry.ciudades].sort(
        (a, b) => a.orden - b.orden,
      );
      centralEntry.totalCiudades = centralEntry.ciudades.length;
      centralEntry.ciudadesHabilitadas = centralEntry.ciudades.filter((c) => c.habilitada).length;
      departamentos.splice(asuncionDeptoIdx, 1);
    }

    // Orden: menor cobertura primero (asc por habilitadas/total), con depto sin ciudades al final.
    departamentos.sort((a, b) => {
      const ratioA = a.totalCiudades === 0 ? 2 : a.ciudadesHabilitadas / a.totalCiudades;
      const ratioB = b.totalCiudades === 0 ? 2 : b.ciudadesHabilitadas / b.totalCiudades;
      if (ratioA !== ratioB) return ratioA - ratioB;
      return a.nombre.localeCompare(b.nombre, 'es');
    });

    const totalCiudades = ciudadesRows.length;
    const ciudadesHabilitadas = ciudadesRows.filter((c) => habilitadasSet.has(c.id)).length;
    const totalDepartamentos = departamentos.length;
    const departamentosConCobertura = departamentos.filter((d) => d.ciudadesHabilitadas > 0).length;

    return {
      totalCiudades,
      ciudadesHabilitadas,
      totalDepartamentos,
      departamentosConCobertura,
      departamentos,
    };
  }
}

export const ciudadService = new CiudadService();
