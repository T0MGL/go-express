import { createHmac } from 'node:crypto';
import {
  signWebhookBody,
  nextRetryDelayMs,
  WEBHOOK_MAX_INTENTOS,
  buildEstadoCambiadoPayload,
} from '../../src/lib/webhook.js';
import { hashIdempotencyBody } from '../../src/lib/idempotency.js';
import {
  generateApiKey,
  generateWebhookSecret,
  apiKeyPrefix,
  API_KEY_REGEX,
} from '../../src/lib/apiKey.js';

describe('firma HMAC saliente', () => {
  it('firma sha256=<hmac hex> del body exacto', () => {
    const secreto = 'whsec_testsecret1234567890';
    const body = '{"evento":"envio.estado_cambiado","tracking":"GE2600000001"}';

    const expected = `sha256=${createHmac('sha256', secreto).update(body).digest('hex')}`;
    expect(signWebhookBody(secreto, body)).toBe(expected);
  });

  it('cambia si cambia un solo byte del body o del secreto', () => {
    const body = '{"a":1}';
    const base = signWebhookBody('whsec_secretoUnoAAAAAAAAAA', body);

    expect(signWebhookBody('whsec_secretoUnoAAAAAAAAAA', '{"a":2}')).not.toBe(base);
    expect(signWebhookBody('whsec_secretoDosAAAAAAAAAA', body)).not.toBe(base);
  });
});

describe('backoff del dispatcher', () => {
  it('agenda 1m, 5m y 25m tras los intentos 1 a 3, y corta despues', () => {
    expect(nextRetryDelayMs(1)).toBe(60_000);
    expect(nextRetryDelayMs(2)).toBe(300_000);
    expect(nextRetryDelayMs(3)).toBe(1_500_000);
    expect(nextRetryDelayMs(4)).toBeNull();
  });

  it('el maximo de intentos cierra con el ultimo delay agotado', () => {
    expect(WEBHOOK_MAX_INTENTOS).toBe(4);
    expect(nextRetryDelayMs(WEBHOOK_MAX_INTENTOS)).toBeNull();
  });
});

describe('fingerprint de idempotencia', () => {
  it('es estable ante el orden de keys, incluso anidadas', () => {
    const a = hashIdempotencyBody({ peso: 2, destinatarioNombre: 'Maria', dimensiones: { largo: 1, alto: 3, ancho: 2 } });
    const b = hashIdempotencyBody({ dimensiones: { ancho: 2, largo: 1, alto: 3 }, destinatarioNombre: 'Maria', peso: 2 });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('cambia cuando cambia el contenido', () => {
    const a = hashIdempotencyBody({ peso: 2, destinatarioNombre: 'Maria' });
    const b = hashIdempotencyBody({ peso: 3, destinatarioNombre: 'Maria' });
    expect(a).not.toBe(b);
  });

  it('ignora keys con valor undefined (mismo hash que sin la key)', () => {
    const a = hashIdempotencyBody({ peso: 2, notas: undefined });
    const b = hashIdempotencyBody({ peso: 2 });
    expect(a).toBe(b);
  });
});

describe('keys de test y secretos de webhook', () => {
  it('genera ge_test_ cuando modoTest=true y ge_live_ por default', () => {
    const live = generateApiKey();
    const test = generateApiKey(true);

    expect(live.startsWith('ge_live_')).toBe(true);
    expect(test.startsWith('ge_test_')).toBe(true);
    expect(API_KEY_REGEX.test(live)).toBe(true);
    expect(API_KEY_REGEX.test(test)).toBe(true);
    expect(apiKeyPrefix(test)).toHaveLength(12);
  });

  it('el regex rechaza prefijos desconocidos', () => {
    expect(API_KEY_REGEX.test(`ge_prod_${'A'.repeat(43)}`)).toBe(false);
    expect(API_KEY_REGEX.test(`ge_test_${'A'.repeat(42)}`)).toBe(false);
  });

  it('el secreto de webhook cumple el formato y el largo minimo del CHECK', () => {
    const secreto = generateWebhookSecret();
    expect(secreto).toMatch(/^whsec_[0-9A-Za-z]{43}$/);
    expect(secreto.length).toBeGreaterThanOrEqual(20);
  });
});

describe('payload de estado cambiado', () => {
  it('lleva evento, estados, tracking y timestamp ISO', () => {
    const payload = buildEstadoCambiadoPayload({
      tracking: 'GE2600000001',
      estadoAnterior: 'pendiente',
      estadoNuevo: 'recolectado',
      codigoReferencia: 'PED-1',
    });

    expect(payload.evento).toBe('envio.estado_cambiado');
    expect(payload.estadoAnterior).toBe('pendiente');
    expect(payload.estadoNuevo).toBe('recolectado');
    expect(payload.codigoReferencia).toBe('PED-1');
    expect(payload.simulated).toBeUndefined();
    expect(new Date(payload.timestamp).toISOString()).toBe(payload.timestamp);
  });

  it('marca simulated solo cuando se pide', () => {
    const payload = buildEstadoCambiadoPayload({
      tracking: 'GE-TEST-0000000002',
      estadoAnterior: 'en_reparto',
      estadoNuevo: 'entregado',
      codigoReferencia: null,
      simulated: true,
    });
    expect(payload.simulated).toBe(true);
  });
});
