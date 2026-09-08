import { businessRuleError, dbError } from '../../src/lib/dbError.js';
import { AppError } from '../../src/middleware/errorHandler.js';

// Un traductor que no sabe decir que no, no traduce: convierte cualquier falla nuestra en
// "te equivocaste vos". La mitad de estos casos prueban que devuelve null.
describe('businessRuleError', () => {
  it('no traduce un error que no es P0001', () => {
    expect(businessRuleError({ code: '23505', message: 'duplicate key value' })).toBeNull();
  });

  it('no traduce una regla P0001 que no esta mapeada', () => {
    expect(businessRuleError({
      code: 'P0001',
      message: 'conservacion_rota: tarifa 1 + payout 2 + sobrante 3 <> recibido 4 + cobranza 5',
    })).toBeNull();
  });

  it('no traduce un P0001 sin nombre de regla', () => {
    expect(businessRuleError({ code: 'P0001', message: 'monto no puede ser cero' })).toBeNull();
  });

  it('no traduce lo que no tiene forma de error de postgres', () => {
    expect(businessRuleError(new Error('boom'))).toBeNull();
    expect(businessRuleError(null)).toBeNull();
    expect(businessRuleError({ code: 'P0001' })).toBeNull();
  });

  it('traduce transicion_invalida con los estados y la lista de permitidos', () => {
    const err = businessRuleError({
      code: 'P0001',
      message: 'transicion_invalida: pendiente a entregado no es una transicion valida desde GE2026001073 (allowed: {recolectado,en_deposito,problema})',
    });

    expect(err).toBeInstanceOf(AppError);
    expect(err?.statusCode).toBe(422);
    expect(err?.code).toBe('UNPROCESSABLE_ENTITY');
    expect(err?.details).toEqual({
      regla: 'transicion_invalida',
      currentEstado: 'pendiente',
      requestedEstado: 'entregado',
      trackingNumber: 'GE2026001073',
      allowedTransitions: ['recolectado', 'en_deposito', 'problema'],
    });
  });

  it('traduce transicion_invalida desde un estado terminal con la lista vacia', () => {
    const err = businessRuleError({
      code: 'P0001',
      message: 'transicion_invalida: entregado a pendiente no es una transicion valida desde GE2026001073 (allowed: {})',
    });

    expect((err?.details as { allowedTransitions: string[] }).allowedTransitions).toEqual([]);
  });

  it('traduce los dos montos de I1 y los deja en details', () => {
    const err = businessRuleError({
      code: 'P0001',
      message: 'monto_a_cobrar_insuficiente: monto_a_cobrar (30000) debe cubrir costo+seguro (35000)',
    });

    expect(err?.statusCode).toBe(422);
    expect(err?.message).toContain('30.000 Gs');
    expect(err?.message).toContain('35.000 Gs');
    expect(err?.details).toEqual({
      regla: 'monto_a_cobrar_insuficiente',
      montoACobrar: 30000,
      costoMasSeguro: 35000,
    });
  });

  it('traduce anticipado_monto_invalido con el monto exacto exigido', () => {
    const err = businessRuleError({
      code: 'P0001',
      message: 'anticipado_monto_invalido: anticipado requiere monto_a_cobrar (50000) = costo+seguro (35000)',
    });

    expect(err?.statusCode).toBe(422);
    expect(err?.details).toMatchObject({ montoACobrar: 50000, costoMasSeguro: 35000 });
  });

  it('mapea el estado del recurso a 409 y el recurso ausente a 404', () => {
    const sinRepartidor = businessRuleError({
      code: 'P0001',
      message: 'pago_sin_repartidor: el envio abc no tiene repartidor asignado; un cobro requiere repartidor para ser liquidable (A4)',
    });
    expect(sinRepartidor?.statusCode).toBe(409);
    expect(sinRepartidor?.code).toBe('CONFLICT');

    const noEncontrado = businessRuleError({
      code: 'P0001',
      message: 'pago_no_encontrado: 00000000-0000-4000-a000-000000000099',
    });
    expect(noEncontrado?.statusCode).toBe(404);
    // El texto de la base es el uuid pelado, que no le dice nada al operador.
    expect(noEncontrado?.message).toBe('El pago no existe.');
  });

  it('no filtra nombres de tablas ni de funciones internas al cliente', () => {
    const appendOnly = businessRuleError({
      code: 'P0001',
      message: 'ledger_append_only: movimientos_cuenta_corriente es append-only, no se permite UPDATE (anular via registrar_movimiento_cc tipo reverso)',
    });

    expect(appendOnly).toBeNull();
  });
});

describe('dbError', () => {
  it('cae a 500 DB_ERROR cuando no hay regla que traducir', () => {
    const err = dbError({ code: '08006', message: 'connection failure' }, 'Error creando envio');

    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('DB_ERROR');
    expect(err.message).toBe('Error creando envio');
  });

  it('devuelve la regla traducida cuando la hay', () => {
    const err = dbError({ code: 'P0001', message: 'pago_ya_anulado: abc' }, 'Error anulando pago');

    expect(err.statusCode).toBe(409);
    expect(err.message).toBe('El pago ya fue anulado.');
  });
});
