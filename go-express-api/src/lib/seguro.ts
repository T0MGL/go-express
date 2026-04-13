/**
 * Seguro de envio: calculo, parse y defaults.
 * Unica fuente de verdad server-side. Frontend tiene una copia (src/lib/seguro.ts)
 * que debe mantenerse en sync (defaults, formula, tipos).
 */

export interface SeguroConfig {
  /** Valor declarado a partir del cual se cobra seguro adicional. Por debajo, incluido. (Gs) */
  umbralIncluido: number;
  /** Fraccion del valor declarado que se cobra como seguro adicional. 0.01 = 1%. */
  tasaAdicional: number;
  /** Monto minimo que se cobra cuando el seguro adicional aplica. (Gs) */
  minimoAdicional: number;
  /** Techo sobre el valor declarado asegurable. Arriba de esto, requiere revision manual. (Gs) */
  maximoAsegurable: number;
}

export const SEGURO_DEFAULTS: SeguroConfig = {
  umbralIncluido: 200_000,
  tasaAdicional: 0.01,
  minimoAdicional: 5_000,
  maximoAsegurable: 50_000_000,
};

/**
 * Parsea el valor JSONB de la tabla `configuracion` y valida cada campo.
 * Si falta o es invalido, cae a defaults (no tira). Asi el sistema nunca se rompe
 * por un config corrupto; peor caso usa defaults y el admin debe corregir.
 */
export function parseSeguroConfig(raw: unknown): SeguroConfig {
  if (!raw || typeof raw !== 'object') return { ...SEGURO_DEFAULTS };
  const obj = raw as Record<string, unknown>;
  const coerce = (v: unknown, fallback: number): number => {
    const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  return {
    umbralIncluido: coerce(obj['umbralIncluido'], SEGURO_DEFAULTS.umbralIncluido),
    tasaAdicional: coerce(obj['tasaAdicional'], SEGURO_DEFAULTS.tasaAdicional),
    minimoAdicional: coerce(obj['minimoAdicional'], SEGURO_DEFAULTS.minimoAdicional),
    maximoAsegurable: coerce(obj['maximoAsegurable'], SEGURO_DEFAULTS.maximoAsegurable),
  };
}

/**
 * Calcula el costo del seguro adicional para un valor declarado dado.
 * Retorna 0 si el valor declarado no supera el umbral incluido.
 * Formula: max(minimoAdicional, round(valorDeclarado * tasaAdicional))
 */
export function calcularSeguroAdicional(valorDeclarado: number, cfg: SeguroConfig): number {
  if (!Number.isFinite(valorDeclarado) || valorDeclarado <= cfg.umbralIncluido) return 0;
  const calculado = Math.round(valorDeclarado * cfg.tasaAdicional);
  return Math.max(cfg.minimoAdicional, calculado);
}

/**
 * True si el valor declarado esta en el rango asegurable (umbral < valor <= maximo).
 */
export function puedeAsegurar(valorDeclarado: number, cfg: SeguroConfig): boolean {
  return valorDeclarado > cfg.umbralIncluido && valorDeclarado <= cfg.maximoAsegurable;
}

export function validateSeguroConfigInput(input: unknown): SeguroConfig {
  if (!input || typeof input !== 'object') {
    throw new Error('seguro_config debe ser un objeto JSON');
  }
  const obj = input as Record<string, unknown>;
  const parseNum = (key: string): number => {
    const v = obj[key];
    const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
    if (!Number.isFinite(n) || n < 0) {
      throw new Error(`${key} debe ser un numero no negativo`);
    }
    return n;
  };
  const cfg: SeguroConfig = {
    umbralIncluido: parseNum('umbralIncluido'),
    tasaAdicional: parseNum('tasaAdicional'),
    minimoAdicional: parseNum('minimoAdicional'),
    maximoAsegurable: parseNum('maximoAsegurable'),
  };
  if (cfg.tasaAdicional > 1) {
    throw new Error('tasaAdicional debe expresarse como fraccion (0.01 = 1%). Valor maximo permitido: 1.');
  }
  if (cfg.maximoAsegurable < cfg.umbralIncluido) {
    throw new Error('maximoAsegurable debe ser mayor o igual a umbralIncluido');
  }
  return cfg;
}
