import { createHash } from 'node:crypto';

// JSON canonico: keys ordenadas en todos los niveles. Dos requests semanticamente iguales
// producen el mismo string aunque el integrador serialice las keys en otro orden.
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Fingerprint del body del POST /api/v1/envios para la idempotencia del gateway.
 * Se calcula sobre el input YA parseado por Zod (defaults aplicados, telefonos
 * normalizados), asi un retry byte-distinto pero semanticamente identico matchea,
 * y un payload realmente distinto con la misma Idempotency-Key se detecta (409).
 */
export function hashIdempotencyBody(parsedBody: unknown): string {
  return createHash('sha256').update(canonicalJson(parsedBody)).digest('hex');
}

/**
 * Fingerprint del POST /api/v1/envios desde que existe COD. Los hashes persistidos
 * pre-COD se calcularon sin tipoPago ni montoACobrar; como el default
 * tipoPago='anticipado' entra al output de Zod, hashear el input completo cambiaria
 * el hash de TODO el trafico anticipado existente y un retry legitimo de una key ya
 * consumida responderia 409 en vez de replay. Por eso anticipado hashea el shape
 * legacy (byte-identico al de antes) y solo contra_entrega suma los campos nuevos:
 * la misma key con otro montoACobrar es 409, no un replay silencioso.
 */
export function hashV1EnvioBody(input: { tipoPago: 'anticipado' | 'contra_entrega'; montoACobrar?: number }): string {
  if (input.tipoPago === 'contra_entrega') {
    return hashIdempotencyBody(input);
  }
  const { tipoPago: _tipoPago, montoACobrar: _montoACobrar, ...legacyShape } = input;
  return hashIdempotencyBody(legacyShape);
}
