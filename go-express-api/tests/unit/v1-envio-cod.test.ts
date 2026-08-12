import { describe, expect, it } from 'vitest';
import { createClienteEnvioSchema, createV1EnvioSchema } from '../../src/lib/validators/envio.schema.js';
import { hashIdempotencyBody, hashV1EnvioBody } from '../../src/lib/idempotency.js';

// Contrato COD del gateway (schema) + compatibilidad del fingerprint de idempotencia.
// La parte de hash es la critica: si el shape hasheado de anticipado cambia, todo retry
// de una Idempotency-Key consumida antes del deploy COD responderia 409 en vez de replay.

const basePayload = {
  destinatarioNombre: 'Maria Cod Lopez',
  destinatarioDireccion: 'Av. Irrazabal 456, Encarnacion',
  destinatarioTelefono: '+595971654321',
  destinatarioCiudad: 'Encarnacion',
  peso: 2,
};

describe('createV1EnvioSchema', () => {
  it('sin tipoPago aplica el default anticipado', () => {
    const parsed = createV1EnvioSchema.parse(basePayload);
    expect(parsed.tipoPago).toBe('anticipado');
    expect(parsed.montoACobrar).toBeUndefined();
  });

  it('acepta contra_entrega con montoACobrar entero positivo', () => {
    const parsed = createV1EnvioSchema.parse({ ...basePayload, tipoPago: 'contra_entrega', montoACobrar: 185000 });
    expect(parsed.tipoPago).toBe('contra_entrega');
    expect(parsed.montoACobrar).toBe(185000);
  });

  it('rechaza montoACobrar con anticipado, explicito u omitido el tipo', () => {
    for (const body of [
      { ...basePayload, montoACobrar: 185000 },
      { ...basePayload, tipoPago: 'anticipado', montoACobrar: 185000 },
    ]) {
      const result = createV1EnvioSchema.safeParse(body);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.join('.') === 'montoACobrar')).toBe(true);
      }
    }
  });

  it('exige montoACobrar con contra_entrega', () => {
    const result = createV1EnvioSchema.safeParse({ ...basePayload, tipoPago: 'contra_entrega' });
    expect(result.success).toBe(false);
  });

  it('rechaza montos cero, negativos, decimales y por encima del tope', () => {
    for (const monto of [0, -1000, 35000.5, 1_000_000_000]) {
      const result = createV1EnvioSchema.safeParse({ ...basePayload, tipoPago: 'contra_entrega', montoACobrar: monto });
      expect(result.success).toBe(false);
    }
  });

  it('rechaza un tipoPago fuera del enum', () => {
    const result = createV1EnvioSchema.safeParse({ ...basePayload, tipoPago: 'cuenta_corriente' });
    expect(result.success).toBe(false);
  });
});

describe('hashV1EnvioBody', () => {
  it('anticipado hashea el mismo shape legacy pre-COD (los replays viejos siguen matcheando)', () => {
    const legacy = createClienteEnvioSchema.parse(basePayload);
    const v1 = createV1EnvioSchema.parse(basePayload);
    expect(hashV1EnvioBody(v1)).toBe(hashIdempotencyBody(legacy));
  });

  it('anticipado explicito y omitido producen el mismo hash', () => {
    const omitido = createV1EnvioSchema.parse(basePayload);
    const explicito = createV1EnvioSchema.parse({ ...basePayload, tipoPago: 'anticipado' });
    expect(hashV1EnvioBody(explicito)).toBe(hashV1EnvioBody(omitido));
  });

  it('contra_entrega con montos distintos produce hashes distintos', () => {
    const a = createV1EnvioSchema.parse({ ...basePayload, tipoPago: 'contra_entrega', montoACobrar: 100000 });
    const b = createV1EnvioSchema.parse({ ...basePayload, tipoPago: 'contra_entrega', montoACobrar: 100001 });
    expect(hashV1EnvioBody(a)).not.toBe(hashV1EnvioBody(b));
  });

  it('el mismo body contra_entrega hashea estable', () => {
    const a = createV1EnvioSchema.parse({ ...basePayload, tipoPago: 'contra_entrega', montoACobrar: 100000 });
    const b = createV1EnvioSchema.parse({ ...basePayload, tipoPago: 'contra_entrega', montoACobrar: 100000 });
    expect(hashV1EnvioBody(a)).toBe(hashV1EnvioBody(b));
  });
});
