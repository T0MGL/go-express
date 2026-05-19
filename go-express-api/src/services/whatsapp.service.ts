import { logger } from '../config/logger.js';
import { env } from '../config/env.js';
import { isValidPhone, normalizePhone } from '../lib/phone.js';
import type { Envio, EnvioEstado, NotificationEvent } from '../types/index.js';

// Cliente minimo Meta WhatsApp Cloud API. Solo outbound, solo templates pre-aprobados.
// No SDK: el endpoint es un POST plano y la dependencia anade superficie sin valor.
// Endpoint: https://graph.facebook.com/{version}/{phone_number_id}/messages
// Doc: developers.facebook.com/docs/whatsapp/cloud-api/reference/messages

// Nombres exactos de los templates aprobados en Meta Business Manager. Si Meta auto-renombra
// uno (por ejemplo, agrega sufijo de version), ajustar aca y redeployar. Es el unico punto
// del codigo que necesita tocarse ante un rename.
// 'fallido' y 'problema' NO estan registrados en Meta por decision: se notifican solo por email.
// Nota: las keys de este objeto son audience-aware (ej. `entregado_destinatario`) mientras que
// las keys del objeto `TEMPLATES` mas abajo son por EnvioEstado (ej. `entregado`). La diferencia
// es intencional: cuando exista variante remitente, sumara `entregado_remitente` aca pero seguira
// resolviendo desde el mismo estado.
export const WHATSAPP_TEMPLATE_NAMES = {
  envio_creado: 'goexpress_envio_creado_v1',
  recolectado: 'goexpress_recolectado_v1',
  en_transito: 'goexpress_en_transito_v1',
  en_deposito: 'goexpress_en_deposito_v1',
  en_reparto: 'goexpress_en_reparto_v1',
  entregado_destinatario: 'goexpress_entregado_destinatario_v1',
} as const;

type TemplateComponent =
  | {
      type: 'body';
      parameters: Array<{ type: 'text'; text: string }>;
    }
  | {
      type: 'button';
      sub_type: 'url';
      index: '0';
      parameters: Array<{ type: 'text'; text: string }>;
    };

export type WhatsAppSendOutcome =
  | { status: 'sent'; messageId: string }
  | { status: 'no_template'; reason: string }
  | { status: 'no_recipient'; reason: string };

export class WhatsAppError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
    public readonly metaError?: unknown,
  ) {
    super(message);
    this.name = 'WhatsAppError';
  }
}

function isConfigured(): boolean {
  return Boolean(env.META_WA_TOKEN && env.META_WA_PHONE_NUMBER_ID);
}

// Meta requiere el numero sin '+' ni espacios. normalizePhone devuelve +595XXXXXXXXX,
// quitamos el '+' para el payload. Validamos antes para no consumir cuota Meta
// en numeros invalidos.
function toMetaRecipient(phone: string): string | null {
  const normalized = normalizePhone(phone);
  if (!isValidPhone(normalized)) return null;
  return normalized.replace(/^\+/, '');
}

async function sendTemplate(
  to: string,
  templateName: string,
  languageCode: string,
  components: TemplateComponent[],
): Promise<{ messageId: string }> {
  if (!isConfigured()) {
    throw new WhatsAppError('WhatsApp Cloud API no configurado. Faltan META_WA_TOKEN o META_WA_PHONE_NUMBER_ID.');
  }

  const recipient = toMetaRecipient(to);
  if (!recipient) {
    throw new WhatsAppError(`Numero de telefono invalido para WhatsApp: ${to}`);
  }

  const url = `https://graph.facebook.com/${env.META_WA_GRAPH_VERSION}/${env.META_WA_PHONE_NUMBER_ID}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      components,
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.META_WA_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const raw = await response.text();
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    // Meta siempre devuelve JSON; si no parsea es 5xx HTML o algo roto upstream.
    // El raw va al log mas abajo (truncado) para poder debuggear el body real.
  }

  if (!response.ok) {
    const metaError = (parsed as { error?: { code?: number; message?: string; error_data?: unknown } } | null)?.error;
    // Truncamos raw a 1KB: ante 5xx upstream Meta a veces devuelve HTML de varios MB
    // que floodea el log. 1KB cubre el inicio del body donde estan los headers/title
    // que permiten identificar el origen del error.
    const rawSnippet = parsed === null && raw ? raw.slice(0, 1000) : undefined;
    logger.error(
      { status: response.status, metaError, to: recipient, templateName, raw: rawSnippet },
      '[WA] Send failed',
    );
    throw new WhatsAppError(
      metaError?.message ?? `WhatsApp send failed: HTTP ${response.status}`,
      metaError?.code,
      metaError,
    );
  }

  const messages = (parsed as { messages?: Array<{ id: string }> } | null)?.messages;
  const messageId = messages?.[0]?.id;
  if (!messageId) {
    throw new WhatsAppError('Respuesta Meta sin message id', undefined, parsed);
  }

  return { messageId };
}

// Mapping evento -> template name + builder de components.
// Los template names deben estar creados y aprobados en Meta Business Manager
// con categoria UTILITY, idioma es (Meta no expone es_PY via API a 2026-05).
// Ver docs/notification-templates.md.

const TRACKING_URL_BASE = 'https://goexpressparaguay.com/track?q=';

function bodyParams(values: string[]): TemplateComponent {
  return {
    type: 'body',
    parameters: values.map((text) => ({ type: 'text', text })),
  };
}

// Boton URL dinamico. Meta valida que el sufijo dinamico no incluya '/' ni '?'.
// tracking_number es alfanumerico, asi que es seguro pasarlo como parameter.
function trackingButton(trackingNumber: string): TemplateComponent {
  return {
    type: 'button',
    sub_type: 'url',
    index: '0',
    parameters: [{ type: 'text', text: trackingNumber }],
  };
}

// Compone la direccion del destinatario en una linea legible. El template
// goexpress_en_reparto_v1 espera la direccion concreta, no la ciudad. Usamos
// destinatarioDireccion como base y agregamos barrio + ciudad si no estan
// ya incluidos textualmente. Si la direccion viene vacia (edge case, en schema
// es NOT NULL pero defensivo), fallback a ciudad + departamento.
function buildDireccionDestinatario(envio: Envio): string {
  const direccion = envio.destinatarioDireccion?.trim() ?? '';
  const barrio = envio.destinatarioBarrio?.trim() ?? '';
  const ciudad = envio.destinatarioCiudad?.trim() ?? '';

  const parts: string[] = [];
  if (direccion) parts.push(direccion);

  const lowerCombined = parts.join(' ').toLowerCase();
  if (barrio && !lowerCombined.includes(barrio.toLowerCase())) {
    parts.push(barrio);
  }
  if (ciudad && !lowerCombined.includes(ciudad.toLowerCase()) && !parts.some((p) => p.toLowerCase().includes(ciudad.toLowerCase()))) {
    parts.push(ciudad);
  }

  if (parts.length === 0) {
    const fallback = [ciudad, envio.destinatarioDepartamento?.trim()].filter(Boolean).join(', ');
    return fallback || envio.destino;
  }

  return parts.join(', ');
}

const LANGUAGE_CODE = 'es';

interface TemplateSpec {
  name: string;
  components: (envio: Envio) => TemplateComponent[];
}

// Mapping posicional de variables Meta. Cada template DEBE crearse en Meta Business
// Manager con el body y los buttons URL definidos en docs/notification-templates.md.
// Solo botones URL dinamicos requieren componente con parameters. Los URL estaticos
// (ej. boton "Contactanos" del template entregado) no se incluyen en components.

const TEMPLATES = {
  envio_creado: {
    // body: {{1}}=destinatarioNombre, {{2}}=clienteNombre, {{3}}=trackingNumber, {{4}}=destino. button {{1}}=trackingNumber.
    name: WHATSAPP_TEMPLATE_NAMES.envio_creado,
    components: (envio: Envio) => [
      bodyParams([envio.destinatarioNombre, envio.clienteNombre, envio.trackingNumber, envio.destino]),
      trackingButton(envio.trackingNumber),
    ],
  },
  recolectado: {
    // body: {{1}}=destinatarioNombre, {{2}}=clienteNombre, {{3}}=trackingNumber, {{4}}=destino. button {{1}}=trackingNumber.
    name: WHATSAPP_TEMPLATE_NAMES.recolectado,
    components: (envio: Envio) => [
      bodyParams([envio.destinatarioNombre, envio.clienteNombre, envio.trackingNumber, envio.destino]),
      trackingButton(envio.trackingNumber),
    ],
  },
  en_transito: {
    // body: {{1}}=destinatarioNombre, {{2}}=destino, {{3}}=trackingNumber. button {{1}}=trackingNumber.
    name: WHATSAPP_TEMPLATE_NAMES.en_transito,
    components: (envio: Envio) => [
      bodyParams([envio.destinatarioNombre, envio.destino, envio.trackingNumber]),
      trackingButton(envio.trackingNumber),
    ],
  },
  en_deposito: {
    // body: {{1}}=destinatarioNombre, {{2}}=destino, {{3}}=trackingNumber. button {{1}}=trackingNumber.
    name: WHATSAPP_TEMPLATE_NAMES.en_deposito,
    components: (envio: Envio) => [
      bodyParams([envio.destinatarioNombre, envio.destino, envio.trackingNumber]),
      trackingButton(envio.trackingNumber),
    ],
  },
  en_reparto: {
    // Template aprobado en Meta (post-registro 2026-05):
    // body: {{1}}=trackingNumber, {{2}}=direccion_destinatario. button {{1}}=trackingNumber.
    // El emoji y el "/a" estan dentro del template aprobado, no se pasan como variable.
    name: WHATSAPP_TEMPLATE_NAMES.en_reparto,
    components: (envio: Envio) => [
      bodyParams([envio.trackingNumber, buildDireccionDestinatario(envio)]),
      trackingButton(envio.trackingNumber),
    ],
  },
  entregado: {
    // Template aprobado en Meta (post-registro 2026-05):
    // body: {{1}}=destinatarioNombre. button1{{1}}=trackingNumber (dynamic). button2: URL estatico, sin parameters.
    name: WHATSAPP_TEMPLATE_NAMES.entregado_destinatario,
    components: (envio: Envio) => [
      bodyParams([envio.destinatarioNombre]),
      trackingButton(envio.trackingNumber),
    ],
  },
} as const satisfies Record<string, TemplateSpec>;

export type WhatsAppTemplateKey = keyof typeof TEMPLATES;

// Mapeo evento -> template. envio_creado dispara su template directo; el resto se
// resuelve por estado destino. fallido / problema / pendiente devuelven null porque
// no tienen template aprobado en Meta (notificacion solo por email, decision producto).
function resolveTemplate(event: NotificationEvent, estado: EnvioEstado): WhatsAppTemplateKey | null {
  if (event === 'envio_creado') return 'envio_creado';
  switch (estado) {
    case 'recolectado': return 'recolectado';
    case 'en_transito': return 'en_transito';
    case 'en_deposito': return 'en_deposito';
    case 'en_reparto': return 'en_reparto';
    case 'entregado': return 'entregado';
    case 'fallido': return null;
    case 'problema': return null;
    case 'pendiente': return null;
    default: return null;
  }
}

class WhatsAppService {
  isEnabled(): boolean {
    return isConfigured();
  }

  /**
   * Devuelve el numero E.164 (con +) al que se mandaria el WhatsApp, o null si invalido.
   * El log persiste este valor incluso si el send falla, asi se puede auditar.
   */
  destinatarioFor(envio: Envio): string | null {
    const raw = envio.destinatarioTelefono?.trim();
    if (!raw) return null;
    const normalized = normalizePhone(raw);
    return isValidPhone(normalized) ? normalized : null;
  }

  /**
   * Dispara el template correspondiente al evento. Devuelve un outcome tipado
   * en lugar de throw para casos esperados (sin template registrado, sin telefono).
   * Throw solo en errores reales de Meta (HTTP error, token invalido, etc).
   * El caller persiste el outcome en notificaciones_log con el status correspondiente.
   */
  async sendForEvent(
    event: NotificationEvent,
    envio: Envio,
  ): Promise<WhatsAppSendOutcome> {
    if (!isConfigured()) {
      throw new WhatsAppError('WhatsApp Cloud API no configurado');
    }

    const templateKey = resolveTemplate(event, envio.estado);
    if (!templateKey) {
      return {
        status: 'no_template',
        reason: `sin_template_wa (event=${event} estado=${envio.estado})`,
      };
    }

    const to = this.destinatarioFor(envio);
    if (!to) {
      return {
        status: 'no_recipient',
        reason: `destinatario_telefono invalido o vacio en envio ${envio.trackingNumber}`,
      };
    }

    const spec = TEMPLATES[templateKey];
    const result = await sendTemplate(to, spec.name, LANGUAGE_CODE, spec.components(envio));
    return { status: 'sent', messageId: result.messageId };
  }
}

export const whatsappService = new WhatsAppService();

// Export para uso directo en tests o casos especiales (no usar en el trigger).
export const _internals = { sendTemplate, TEMPLATES, TRACKING_URL_BASE, buildDireccionDestinatario };
