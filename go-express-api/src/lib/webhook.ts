import { createHmac } from 'node:crypto';
import type { EnvioEstado } from '../types/index.js';

export const WEBHOOK_EVENTO_ESTADO_CAMBIADO = 'envio.estado_cambiado';

// Mismo formato que consumimos de Meta en el webhook inbound (X-Hub-Signature-256):
// convencion conocida por cualquier integrador y verificable con timingSafeEqual.
export const WEBHOOK_SIGNATURE_HEADER = 'X-GoExpress-Signature';
export const WEBHOOK_EVENT_HEADER = 'X-GoExpress-Event';
export const WEBHOOK_DELIVERY_HEADER = 'X-GoExpress-Delivery';

// Intento 1 sale de inmediato; si falla, los reintentos van a +1m, +5m, +25m.
// Despues del cuarto intento fallido la delivery muere como 'fallido' definitivo.
const RETRY_DELAYS_MS = [60_000, 300_000, 1_500_000] as const;

export const WEBHOOK_MAX_INTENTOS = RETRY_DELAYS_MS.length + 1;

/**
 * Delay a agendar DESPUES de que falle el intento numero `intento` (1-based).
 * null = no hay proximo intento, la delivery pasa a fallido definitivo.
 */
export function nextRetryDelayMs(intento: number): number | null {
  return RETRY_DELAYS_MS[intento - 1] ?? null;
}

/** Firma el body exacto que viaja en el POST: 'sha256=' + HMAC-SHA256 hex. */
export function signWebhookBody(secreto: string, body: string): string {
  return `sha256=${createHmac('sha256', secreto).update(body).digest('hex')}`;
}

export interface EstadoCambiadoPayload {
  evento: typeof WEBHOOK_EVENTO_ESTADO_CAMBIADO;
  tracking: string;
  estadoAnterior: EnvioEstado | null;
  estadoNuevo: EnvioEstado;
  codigoReferencia: string | null;
  timestamp: string;
  simulated?: boolean;
}

export function buildEstadoCambiadoPayload(params: {
  tracking: string;
  estadoAnterior: EnvioEstado | null;
  estadoNuevo: EnvioEstado;
  codigoReferencia: string | null;
  simulated?: boolean;
}): EstadoCambiadoPayload {
  return {
    evento: WEBHOOK_EVENTO_ESTADO_CAMBIADO,
    tracking: params.tracking,
    estadoAnterior: params.estadoAnterior,
    estadoNuevo: params.estadoNuevo,
    codigoReferencia: params.codigoReferencia,
    timestamp: new Date().toISOString(),
    ...(params.simulated ? { simulated: true } : {}),
  };
}
