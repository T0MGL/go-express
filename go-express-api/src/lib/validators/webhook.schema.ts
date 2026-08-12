import { z } from 'zod';
import { env } from '../../config/env.js';
import { uuidSchema } from './common.schema.js';
import { WEBHOOK_EVENTO_ESTADO_CAMBIADO } from '../webhook.js';

// Catalogo de eventos suscribibles. Espejo del CHECK webhook_endpoints_eventos_validos
// (sql/054); si se agrega un evento, va en ambos lados.
export const WEBHOOK_EVENTOS = [WEBHOOK_EVENTO_ESTADO_CAMBIADO] as const;

export const webhookEventoEnum = z.enum(WEBHOOK_EVENTOS);

const IPV4_LITERAL = /^\d{1,3}(\.\d{1,3}){3}$/;

// https hacia un dominio publico, nada mas. El server hace un POST server-side a esta URL,
// asi que un tercero podria apuntarla a la red interna (SSRF): se bloquea loopback, hosts
// *.internal (Railway private networking) e IPs literales. El unico hueco es http hacia
// 127.0.0.1 y SOLO bajo NODE_ENV=test: el receptor de la suite corre local sin TLS.
function isAllowedWebhookUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }

  const host = url.hostname.toLowerCase();

  if (env.NODE_ENV === 'test' && url.protocol === 'http:' && host === '127.0.0.1') {
    return true;
  }

  if (url.protocol !== 'https:') return false;
  if (host === 'localhost' || host.endsWith('.internal')) return false;
  if (IPV4_LITERAL.test(host) || host.includes(':') || host.startsWith('[')) return false;

  return true;
}

export const webhookUrlSchema = z
  .string()
  .trim()
  .min(12)
  .max(500)
  .refine(isAllowedWebhookUrl, {
    message: 'La URL debe ser https:// hacia un dominio publico (sin IPs literales ni hosts internos)',
  });

const eventosSchema = z
  .array(webhookEventoEnum)
  .min(1)
  .max(WEBHOOK_EVENTOS.length)
  .transform((e) => [...new Set(e)]);

// Self-service v1: el cliente sale de la key, el tercero solo manda url y eventos.
export const createWebhookEndpointV1Schema = z.object({
  url: webhookUrlSchema,
  eventos: eventosSchema.default([...WEBHOOK_EVENTOS]),
});

export const createWebhookEndpointAdminSchema = createWebhookEndpointV1Schema.extend({
  clienteId: uuidSchema,
});

export const updateWebhookEndpointSchema = z
  .object({
    url: webhookUrlSchema.optional(),
    eventos: eventosSchema.optional(),
    activo: z.boolean().optional(),
  })
  .refine((v) => v.url !== undefined || v.eventos !== undefined || v.activo !== undefined, {
    message: 'Nada que actualizar: enviar url, eventos o activo',
  });

export type CreateWebhookEndpointV1Input = z.infer<typeof createWebhookEndpointV1Schema>;
export type CreateWebhookEndpointAdminInput = z.infer<typeof createWebhookEndpointAdminSchema>;
export type UpdateWebhookEndpointInput = z.infer<typeof updateWebhookEndpointSchema>;
