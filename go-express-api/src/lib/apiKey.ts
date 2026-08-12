import { createHash, randomBytes } from 'node:crypto';

export const API_KEY_LIVE_PREFIX = 'ge_live_';

// Chars visibles de la key para identificarla en UI/logs: 'ge_live_' (8) + 4 del cuerpo.
export const API_KEY_PREFIX_LENGTH = 12;

const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

// 32 bytes de entropia entran en 43 chars base62 (62^43 > 2^256); padding para largo fijo.
const RANDOM_BYTES = 32;
const BODY_LENGTH = 43;

export const API_KEY_REGEX = /^ge_live_[0-9A-Za-z]{43}$/;

/**
 * Genera una API key: 'ge_live_' + 32 bytes de crypto.randomBytes codificados en base62
 * via BigInt (se convierte el entero completo, sin sesgo modular byte a byte).
 * El plaintext existe solo en el response de crear/rotar; a la DB va el sha256.
 */
export function generateApiKey(): string {
  let n = BigInt(`0x${randomBytes(RANDOM_BYTES).toString('hex')}`);
  let body = '';
  while (n > 0n) {
    body = BASE62.charAt(Number(n % 62n)) + body;
    n /= 62n;
  }
  return API_KEY_LIVE_PREFIX + body.padStart(BODY_LENGTH, '0');
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function apiKeyPrefix(key: string): string {
  return key.slice(0, API_KEY_PREFIX_LENGTH);
}
