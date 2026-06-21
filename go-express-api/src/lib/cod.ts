/**
 * COD (cash-on-delivery) business rules.
 *
 * La validacion de cobro vive aca para que sea testable sin montar el middleware de
 * repartidor. El route handler la aplica antes de tocar DB. Cierra el hallazgo 3.3 del
 * hard debug original (monto_cobrado sin check contra monto_a_cobrar) y el ALTA 4 de la
 * re-auditoria Step 6: COD es all-or-nothing. Un cobro menor al esperado NO se registra como
 * pago parcial silencioso (efectivo real que la liquidacion nunca exige rendir), va por el
 * flujo de incidencia/no-entrega. La entrega solo procede con el monto exacto.
 */

export class CodValidationError extends Error {
  constructor(
    public readonly code: 'cobro_incompleto' | 'sobrecobro_no_permitido',
    message: string,
  ) {
    super(message);
    this.name = 'CodValidationError';
  }
}

/**
 * Valida el monto cobrado por el repartidor contra el esperado del envio. Politica
 * all-or-nothing: solo el monto exacto cierra la entrega como pagada.
 *
 * - montoReportado > esperado: sobrecobro, no registrable en el ledger. Rechazado.
 * - montoReportado < esperado: cobro incompleto. Rechazado: el repartidor reporta la
 *   incidencia (no pudo cobrar / cobro parcial) por el endpoint de incidencia y la entrega
 *   no se marca pagada. Asi no queda efectivo real fuera de toda liquidacion.
 * - montoReportado == esperado: entrega COD valida.
 *
 * montoEsperado <= 0 (data invalido aguas arriba) no se valida aca para no duplicar reglas.
 */
export function validarDiferenciaCobroCod(args: {
  montoEsperado: number;
  montoReportado: number;
}): void {
  if (args.montoEsperado <= 0) {
    return;
  }

  if (args.montoReportado > args.montoEsperado) {
    throw new CodValidationError(
      'sobrecobro_no_permitido',
      `El monto cobrado (${args.montoReportado}) no puede superar el monto a cobrar del envio (${args.montoEsperado})`,
    );
  }

  if (args.montoReportado < args.montoEsperado) {
    throw new CodValidationError(
      'cobro_incompleto',
      `El monto cobrado (${args.montoReportado}) es menor al monto a cobrar (${args.montoEsperado}). El COD se cobra completo: si no se pudo cobrar el total, reporta la incidencia desde la opcion de incidencia en vez de marcar la entrega.`,
    );
  }
}
