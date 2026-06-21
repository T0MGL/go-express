import { validarDiferenciaCobroCod, CodValidationError } from '../../src/lib/cod.js';

// Tests puros del validador COD que el route handler del repartidor aplica antes de marcar
// entregado. No requieren DB ni auth. Politica all-or-nothing (ALTA 4 re-auditoria Step 6):
// solo el monto exacto cierra la entrega. Sobrecobro y cobro incompleto se rechazan; un parcial
// real va por el endpoint de incidencia, no deja efectivo fuera de la liquidacion.

describe('validarDiferenciaCobroCod', () => {
  it('monto exacto: pasa sin lanzar', () => {
    expect(() =>
      validarDiferenciaCobroCod({ montoEsperado: 50000, montoReportado: 50000 }),
    ).not.toThrow();
  });

  it('cobro menor al esperado: lanza cobro_incompleto', () => {
    try {
      validarDiferenciaCobroCod({ montoEsperado: 50000, montoReportado: 47500 });
      throw new Error('deberia haber tirado');
    } catch (err) {
      expect(err).toBeInstanceOf(CodValidationError);
      expect((err as CodValidationError).code).toBe('cobro_incompleto');
    }
  });

  it('cobro 1 Gs por debajo: tambien lanza cobro_incompleto (sin tolerancia)', () => {
    try {
      validarDiferenciaCobroCod({ montoEsperado: 50000, montoReportado: 49999 });
      throw new Error('deberia haber tirado');
    } catch (err) {
      expect((err as CodValidationError).code).toBe('cobro_incompleto');
    }
  });

  it('sobrecobro: lanza sobrecobro_no_permitido', () => {
    try {
      validarDiferenciaCobroCod({ montoEsperado: 50000, montoReportado: 60000 });
      throw new Error('deberia haber tirado');
    } catch (err) {
      expect(err).toBeInstanceOf(CodValidationError);
      expect((err as CodValidationError).code).toBe('sobrecobro_no_permitido');
    }
  });

  it('monto esperado 0: no hay regla aplicable, pasa silenciosamente', () => {
    expect(() =>
      validarDiferenciaCobroCod({ montoEsperado: 0, montoReportado: 0 }),
    ).not.toThrow();
  });
});
