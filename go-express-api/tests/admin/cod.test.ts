import {
  validarDiferenciaCobroCod,
  CodValidationError,
  DIFERENCIA_COD_TOLERADA,
} from '../../src/lib/cod.js';

// Tests puros del validador COD que el route handler del repartidor aplica antes de
// marcar entregado. No requieren DB ni auth. Cubren los 3 casos del spec:
// 1. Diferencia dentro del 10% -> pasa sin incidencia.
// 2. Diferencia fuera del 10% sin nota -> error.
// 3. Diferencia fuera del 10% con nota valida -> pasa marcando incidencia.

describe('validarDiferenciaCobroCod', () => {
  it('monto exacto: no hay incidencia', () => {
    const res = validarDiferenciaCobroCod({
      montoEsperado: 50000,
      montoReportado: 50000,
    });
    expect(res.hayIncidencia).toBe(false);
    expect(res.diferenciaPct).toBe(0);
  });

  it('diferencia dentro del 10%: no hay incidencia', () => {
    // 5% de 50000 = 2500
    const res = validarDiferenciaCobroCod({
      montoEsperado: 50000,
      montoReportado: 47500,
    });
    expect(res.hayIncidencia).toBe(false);
    expect(res.diferenciaPct).toBeCloseTo(0.05, 3);
  });

  it('diferencia exactamente 10%: no hay incidencia (limite inclusivo)', () => {
    const res = validarDiferenciaCobroCod({
      montoEsperado: 50000,
      montoReportado: 45000,
    });
    expect(res.hayIncidencia).toBe(false);
    expect(res.diferenciaPct).toBeCloseTo(0.1, 3);
  });

  it('diferencia mayor al 10% sin nota: lanza CodValidationError', () => {
    expect(() =>
      validarDiferenciaCobroCod({
        montoEsperado: 50000,
        montoReportado: 40000,
      }),
    ).toThrow(CodValidationError);
  });

  it('diferencia mayor al 10% con nota menor a 10 chars: lanza CodValidationError', () => {
    expect(() =>
      validarDiferenciaCobroCod({
        montoEsperado: 50000,
        montoReportado: 40000,
        notaIncidencia: 'corto',
      }),
    ).toThrow(CodValidationError);
  });

  it('diferencia mayor al 10% con nota >= 10 chars: marca incidencia', () => {
    const res = validarDiferenciaCobroCod({
      montoEsperado: 50000,
      montoReportado: 40000,
      notaIncidencia: 'Cliente solo tenia 40 mil, acordamos recobrar diferencia',
    });
    expect(res.hayIncidencia).toBe(true);
    expect(res.diferenciaPct).toBeCloseTo(0.2, 3);
  });

  it('sobrecobro mayor al 10% con nota: marca incidencia', () => {
    const res = validarDiferenciaCobroCod({
      montoEsperado: 50000,
      montoReportado: 60000,
      notaIncidencia: 'Cliente pago 10 mil extra por pago tarde, reportar a admin',
    });
    expect(res.hayIncidencia).toBe(true);
  });

  it('monto esperado 0: no hay regla aplicable, pasa silenciosamente', () => {
    const res = validarDiferenciaCobroCod({
      montoEsperado: 0,
      montoReportado: 0,
    });
    expect(res.hayIncidencia).toBe(false);
    expect(res.diferenciaPct).toBe(0);
  });

  it('error expone code estable', () => {
    try {
      validarDiferenciaCobroCod({
        montoEsperado: 100000,
        montoReportado: 50000,
      });
      throw new Error('deberia haber tirado');
    } catch (err) {
      expect(err).toBeInstanceOf(CodValidationError);
      expect((err as CodValidationError).code).toBe('diferencia_cobro_excesiva');
    }
  });

  it('DIFERENCIA_COD_TOLERADA expuesta para UI sincronizada', () => {
    expect(DIFERENCIA_COD_TOLERADA).toBe(0.1);
  });
});
