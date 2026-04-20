/**
 * COD (cash-on-delivery) business rules.
 *
 * La validacion de diferencia de cobro vive aca para que sea testable sin montar el
 * middleware de repartidor. El route handler importa y aplica esta regla antes de
 * tocar DB. Cierra el hallazgo 3.3 del hard debug original (monto_cobrado sin check
 * contra monto_a_cobrar).
 */

export const DIFERENCIA_COD_TOLERADA = 0.10;

export interface CodValidationResult {
  hayIncidencia: boolean;
  diferenciaPct: number;
}

export class CodValidationError extends Error {
  constructor(
    public readonly code: 'diferencia_cobro_excesiva',
    message: string,
  ) {
    super(message);
    this.name = 'CodValidationError';
  }
}

/**
 * Valida la diferencia entre el monto reportado por el repartidor y el esperado.
 * Si la diferencia relativa supera DIFERENCIA_COD_TOLERADA y no hay nota de incidencia,
 * lanza CodValidationError. Si la supera y hay nota, marca hayIncidencia = true.
 *
 * Si el monto esperado es 0 no hay validacion posible (un envio COD con monto 0 es
 * data invalido aguas arriba, pero no lo chequeamos aca para no duplicar reglas).
 */
export function validarDiferenciaCobroCod(args: {
  montoEsperado: number;
  montoReportado: number;
  notaIncidencia?: string | null | undefined;
}): CodValidationResult {
  if (args.montoEsperado <= 0) {
    return { hayIncidencia: false, diferenciaPct: 0 };
  }

  const diferenciaPct = Math.abs(args.montoReportado - args.montoEsperado) / args.montoEsperado;

  if (diferenciaPct <= DIFERENCIA_COD_TOLERADA) {
    return { hayIncidencia: false, diferenciaPct };
  }

  const notaTrim = args.notaIncidencia?.trim() ?? '';
  if (notaTrim.length < 10) {
    throw new CodValidationError(
      'diferencia_cobro_excesiva',
      `La diferencia de cobro supera el ${Math.round(DIFERENCIA_COD_TOLERADA * 100)}% y requiere nota de incidencia`,
    );
  }

  return { hayIncidencia: true, diferenciaPct };
}
