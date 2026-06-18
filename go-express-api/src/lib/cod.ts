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
    public readonly code: 'diferencia_cobro_excesiva' | 'sobrecobro_no_permitido',
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

  // El COD nunca puede exceder el monto_a_cobrar del envio. Un sobrecobro no es registrable en
  // el ledger (create_pago_atomico topa por monto_a_cobrar) y dejaba plata fuera del libro en
  // cod_pago_pendiente irresoluble (causa raiz D, sobrecobro). Se rechaza ARRIBA: el repartidor
  // no puede marcar la entrega con un monto mayor al esperado.
  if (args.montoReportado > args.montoEsperado) {
    throw new CodValidationError(
      'sobrecobro_no_permitido',
      `El monto cobrado (${args.montoReportado}) no puede superar el monto a cobrar del envio (${args.montoEsperado})`,
    );
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
