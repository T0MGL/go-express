import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  generateApiKey,
  hashApiKey,
  apiKeyPrefix,
  API_KEY_REGEX,
  API_KEY_PREFIX_LENGTH,
} from '../../src/lib/apiKey.js';

describe('generateApiKey', () => {
  it('genera keys con formato ge_live_ + 43 chars base62', () => {
    for (let i = 0; i < 100; i++) {
      expect(generateApiKey()).toMatch(API_KEY_REGEX);
    }
  });

  it('no repite keys (entropia real, no seed fija)', () => {
    const keys = new Set(Array.from({ length: 1000 }, () => generateApiKey()));
    expect(keys.size).toBe(1000);
  });
});

describe('hashApiKey', () => {
  it('produce el sha256 hex de la key', () => {
    const key = 'ge_live_0000000000000000000000000000000000000000000';
    const expected = createHash('sha256').update(key).digest('hex');
    expect(hashApiKey(key)).toBe(expected);
    expect(hashApiKey(key)).toHaveLength(64);
  });

  it('es deterministico y sensible a cada char', () => {
    const key = generateApiKey();
    expect(hashApiKey(key)).toBe(hashApiKey(key));
    expect(hashApiKey(key)).not.toBe(hashApiKey(`${key.slice(0, -1)}X`));
  });
});

describe('apiKeyPrefix', () => {
  it('devuelve los primeros 12 chars (ge_live_ + 4 del cuerpo)', () => {
    const key = generateApiKey();
    const prefix = apiKeyPrefix(key);
    expect(prefix).toHaveLength(API_KEY_PREFIX_LENGTH);
    expect(prefix.startsWith('ge_live_')).toBe(true);
    expect(key.startsWith(prefix)).toBe(true);
  });
});
