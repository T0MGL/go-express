/**
 * Seguro de envio: types, defaults, y calculo compartido (admin frontend).
 * Debe mantenerse en sync con go-express-api/src/lib/seguro.ts
 * (misma formula, mismo default, mismos limites).
 *
 * IMPORTANTE: solo el admin tiene acceso a la config completa. El portal cliente
 * consume un endpoint autheado (/cliente/cotizador/seguro) que devuelve el resultado
 * calculado por-envio sin exponer los parametros internos.
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
 * Calcula el costo del seguro adicional para un valor declarado dado.
 * Retorna 0 si el valor declarado no supera el umbral incluido.
 */
export function calcularSeguroAdicional(valorDeclarado: number, cfg: SeguroConfig): number {
  if (!Number.isFinite(valorDeclarado) || valorDeclarado <= cfg.umbralIncluido) return 0;
  const calculado = Math.round(valorDeclarado * cfg.tasaAdicional);
  return Math.max(cfg.minimoAdicional, calculado);
}

/**
 * True si el valor declarado esta en el rango asegurable (umbral < valor <= maximo).
 * Si devuelve false, el UI no debe mostrar la opcion de checkbox "Asegurar".
 */
export function puedeAsegurar(valorDeclarado: number, cfg: SeguroConfig): boolean {
  return valorDeclarado > cfg.umbralIncluido && valorDeclarado <= cfg.maximoAsegurable;
}

/**
 * True si el valor declarado excede lo que se puede asegurar automaticamente.
 * Caso donde el cliente tiene que contactar a Go Express para revision manual.
 */
export function requiereRevisionManual(valorDeclarado: number, cfg: SeguroConfig): boolean {
  return valorDeclarado > cfg.maximoAsegurable;
}

/**
 * True si el valor declarado esta cubierto por el seguro incluido por default.
 */
export function seguroIncluido(valorDeclarado: number, cfg: SeguroConfig): boolean {
  return valorDeclarado <= cfg.umbralIncluido;
}

/**
 * Respuesta del endpoint POST /api/cliente/cotizador/seguro.
 * El cliente NUNCA recibe tasaAdicional ni minimoAdicional: son parametros internos.
 */
export interface SeguroCotizarResponse {
  incluido: boolean;
  asegurable: boolean;
  requiereRevisionManual: boolean;
  costoAdicional: number;
  umbralIncluido: number;
  maximoAsegurable: number;
}
