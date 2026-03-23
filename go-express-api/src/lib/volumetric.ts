export interface Dimensiones {
  largo: number; // cm
  ancho: number; // cm
  alto: number; // cm
}

export interface TarifaCalculo {
  precioBase: number; // Gs. (includes pesoBase kg)
  pesoBase: number; // kg included in base price
  precioPorKgExtra: number; // Gs. per additional kg
  factorDimensional: number; // cm³/kg (default: 5000)
}

export interface CostoCalculado {
  pesoReal: number;
  pesoVolumetrico: number;
  pesoTarificado: number; // max(pesoReal, pesoVolumetrico)
  esVolumetrico: boolean; // true if volumetric > real
  costoBase: number; // Gs.
  costoExtra: number; // Gs. for extra weight
  costoTotal: number; // Gs.
}

/**
 * Calculate volumetric weight.
 * Formula: (largo × ancho × alto) / factorDimensional
 */
export function calcularPesoVolumetrico(dimensiones: Dimensiones, factorDimensional: number = 5000): number {
  return (dimensiones.largo * dimensiones.ancho * dimensiones.alto) / factorDimensional;
}

/**
 * Calculate shipping cost based on tarifa, weight, and optional dimensions.
 * This MUST match the frontend implementation in EnvioWizard.tsx and ClienteCotizador.tsx.
 */
export function calcularCosto(tarifa: TarifaCalculo, pesoReal: number, dimensiones?: Dimensiones): CostoCalculado {
  const pesoVolumetrico = dimensiones
    ? calcularPesoVolumetrico(dimensiones, tarifa.factorDimensional)
    : pesoReal;

  const pesoTarificado = Math.max(pesoReal, pesoVolumetrico);
  const pesoExtra = Math.max(0, pesoTarificado - tarifa.pesoBase);
  const costoExtra = Math.ceil(pesoExtra) * tarifa.precioPorKgExtra;
  const costoTotal = tarifa.precioBase + costoExtra;

  return {
    pesoReal,
    pesoVolumetrico,
    pesoTarificado,
    esVolumetrico: pesoVolumetrico > pesoReal,
    costoBase: tarifa.precioBase,
    costoExtra,
    costoTotal,
  };
}
