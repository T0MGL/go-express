import { createHash, randomBytes } from 'node:crypto';

export const API_KEY_LIVE_PREFIX = 'ge_live_';
export const API_KEY_TEST_PREFIX = 'ge_test_';

// Chars visibles de la key para identificarla en UI/logs: 'ge_live_'/'ge_test_' (8) + 4 del cuerpo.
export const API_KEY_PREFIX_LENGTH = 12;

const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

// 32 bytes de entropia entran en 43 chars base62 (62^43 > 2^256); padding para largo fijo.
const RANDOM_BYTES = 32;
const BODY_LENGTH = 43;

export const API_KEY_REGEX = /^ge_(live|test)_[0-9A-Za-z]{43}$/;

// 32 bytes de crypto.randomBytes codificados en base62 via BigInt (se convierte el entero
// completo, sin sesgo modular byte a byte).
function randomBase62Body(): string {
  let n = BigInt(`0x${randomBytes(RANDOM_BYTES).toString('hex')}`);
  let body = '';
  while (n > 0n) {
    body = BASE62.charAt(Number(n % 62n)) + body;
    n /= 62n;
  }
  return body.padStart(BODY_LENGTH, '0');
}

/**
 * Genera una API key: 'ge_live_' (o 'ge_test_' para sandbox) + cuerpo base62.
 * El plaintext existe solo en el response de crear/rotar; a la DB va el sha256.
 */
export function generateApiKey(modoTest = false): string {
  return (modoTest ? API_KEY_TEST_PREFIX : API_KEY_LIVE_PREFIX) + randomBase62Body();
}

/**
 * Secreto HMAC de un webhook endpoint ('whsec_' + base62). A diferencia de las keys,
 * se persiste en plaintext porque hay que firmar con el (sql/054 documenta el tradeoff);
 * igual se muestra una sola vez al crear/regenerar.
 */
export function generateWebhookSecret(): string {
  return `whsec_${randomBase62Body()}`;
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function apiKeyPrefix(key: string): string {
  return key.slice(0, API_KEY_PREFIX_LENGTH);
}
