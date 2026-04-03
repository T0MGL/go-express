import { type TestAPI } from 'vitest';
import supertest from 'supertest';
import { app } from '../../src/app.js';

export const request = supertest(app);

const ADMIN_TOKEN = process.env['ADMIN_API_TOKEN'] ?? 'test-admin-token-32chars-minimum!!';

export function adminHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${ADMIN_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

export function clienteHeaders(clienteId: string): Record<string, string> {
  return {
    'X-Cliente-Id': clienteId,
    'Content-Type': 'application/json',
  };
}

export function publicHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
  };
}
