import { Resend } from 'resend';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';
import { supabase } from '../config/database.js';
import type { Envio } from '../types/index.js';

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

// Force display name to "GO EXPRESS" regardless of what EMAIL_FROM holds.
// Gmail groups/shows the local-part of the address when the display name is
// missing or malformed; we standardize here so invites and notifications
// always appear as "GO EXPRESS" in the recipient's inbox.
const from = (() => {
  const raw = env.EMAIL_FROM ?? '';
  const match = raw.match(/<([^>]+)>/);
  const addr = match?.[1] ?? raw.trim();
  return `GO EXPRESS <${addr}>`;
})();

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch]!);
}

function statusLabel(estado: string): string {
  const labels: Record<string, string> = {
    pendiente: 'Pendiente',
    recolectado: 'Retirado del remitente',
    en_transito: 'En tránsito',
    en_reparto: 'En reparto',
    entregado: 'Entregado',
    fallido: 'Entrega fallida',
    problema: 'Con problema',
  };
  return labels[estado] ?? estado;
}

function trackingUrl(trackingNumber: string): string {
  return `https://goexpressparaguay.com/track?q=${encodeURIComponent(trackingNumber)}`;
}

function row(label: string, value: string, isLast = false): string {
  const border = isLast ? '' : 'border-bottom:1px solid #eef0f4;';
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="${border}">
<tr><td style="padding:14px 0;font-size:13px;color:#9ca3af;width:120px;vertical-align:top;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif">${label}</td>
<td style="padding:14px 0;font-size:13px;color:#1a1a2e;font-weight:500;vertical-align:top;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif">${value}</td></tr></table>`;
}

function badge(text: string, bg: string, color: string): string {
  return `<span style="display:inline-block;padding:5px 14px;border-radius:20px;font-size:12px;font-weight:600;background-color:${bg};color:${color}">${text}</span>`;
}

function trackingBox(tn: string, accent: string, bgColor = '#F0F4FF', borderColor = '#DDE4F7', labelColor = '#7B8AB5'): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px">
<tr><td style="text-align:center;background-color:${bgColor};border:1px solid ${borderColor};border-radius:12px;padding:24px">
<p style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1.5px;color:${labelColor};margin:0 0 8px">Número de tracking</p>
<p style="font-family:'JetBrains Mono',SFMono-Regular,Consolas,monospace;font-size:22px;font-weight:700;letter-spacing:2px;color:${accent};margin:0">${tn}</p>
</td></tr></table>`;
}

interface TemplateOptions {
  title: string;
  body: string;
  tracking: string;
  accent?: string;
  ctaText?: string;
  ctaUrl?: string;
}

function baseTemplate({ title, body, tracking, accent = '#0643F7', ctaText, ctaUrl }: TemplateOptions): string {
  const btnUrl = ctaUrl ?? (tracking ? trackingUrl(tracking) : '');
  const btnText = ctaText ?? 'Rastrear envío';
  const showBtn = !!btnUrl;

  return `<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(title)}</title>
<!--[if mso]><style>table,td{font-family:Arial,sans-serif!important}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f0f2f5;-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f0f2f5">
<tr><td align="center" style="padding:40px 16px">
<table width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%">

<tr><td style="height:4px;background:linear-gradient(90deg,#0643F7 0%,#C8E640 100%);border-radius:16px 16px 0 0;font-size:0;line-height:0">&nbsp;</td></tr>

<tr><td style="background-color:#ffffff;border-radius:0 0 16px 16px;padding:40px 36px;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a1a2e">

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;border-bottom:1px solid #eef0f4">
<tr><td align="center" style="padding-bottom:28px">
<img src="https://www.goexpressparaguay.com/isotipo.png" alt="GO EXPRESS" width="40" height="40" style="width:40px;height:40px;display:block;border-radius:8px" />
</td></tr></table>

<table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px">
<tr><td style="height:3px;width:48px;background-color:#C8E640;border-radius:2px;font-size:0;line-height:0">&nbsp;</td></tr></table>

${body}

${showBtn ? `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:32px">
<tr><td align="center">
<a href="${btnUrl}" style="display:inline-block;padding:14px 36px;background-color:${accent};color:#ffffff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:600;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;letter-spacing:-0.2px;mso-padding-alt:0">${btnText}</a>
</td></tr></table>` : ''}

</td></tr>

<tr><td align="center" style="padding:20px 0 0">
<span style="font-size:11px;color:#b0b5c0;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;letter-spacing:0.3px">GO EXPRESS Paraguay</span>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// SendResult expone dos terminales explicitos:
//   sent  -> Resend acepto la entrega, hay messageId persistible en notificaciones_log.
//   skipped -> Resend no esta configurado (RESEND_API_KEY ausente) o no hay destinatario.
//             El caller decide si esto cuenta como "descartado" en el log. No es un error.
// El tercer caso (Resend rechaza, excepcion de red, payload invalido) se modela como
// throw del send interno; los fan-out senders (sendEntregado, sendFallido) lo capturan
// localmente y lo traducen a un entry { status: 'failed' } por audiencia, para que el
// wrapper en notificaciones.service.ts persista 1 fila por destinatario real sin colapsar.
// Audit log nunca miente: cada row refleja el resultado real de su propio send.
export type EmailSendResult =
  | { status: 'sent'; messageId: string }
  | { status: 'skipped'; reason: 'resend_not_configured' | 'no_recipient' }
  | { status: 'failed'; error: string };

// Entry de fan-out: vincula el resultado del send con el email concreto al que se intento
// enviar (o '' cuando no habia email para esa audiencia). El wrapper usa `recipient`
// para llenar la columna `destinatario` de notificaciones_log sin necesidad de columnas
// nuevas: cada audiencia es una row con su propio destinatario real.
export interface EmailDispatchEntry {
  result: EmailSendResult;
  recipient: string;
}

export class EmailDeliveryError extends Error {
  constructor(
    message: string,
    public readonly providerError?: unknown,
    public readonly to?: string,
    public readonly subject?: string,
  ) {
    super(message);
    this.name = 'EmailDeliveryError';
  }
}

class EmailService {
  private async send(to: string, subject: string, html: string): Promise<EmailSendResult> {
    if (!resend) {
      logger.warn({ to, subject }, '[EMAIL] RESEND_API_KEY not set, email NOT sent');
      return { status: 'skipped', reason: 'resend_not_configured' };
    }

    let response: Awaited<ReturnType<typeof resend.emails.send>>;
    try {
      response = await resend.emails.send({ from, to, subject, html });
    } catch (err) {
      logger.error({ err, to, subject }, '[EMAIL] Resend transport error');
      throw new EmailDeliveryError(
        err instanceof Error ? err.message : 'Resend transport error',
        err,
        to,
        subject,
      );
    }

    if (response.error) {
      logger.error({ error: response.error, to, subject }, '[EMAIL] Resend send rejected');
      const msg =
        (response.error as { message?: string } | null)?.message ?? 'Resend send rejected';
      throw new EmailDeliveryError(msg, response.error, to, subject);
    }

    const messageId = response.data?.id;
    if (!messageId) {
      logger.error({ response, to, subject }, '[EMAIL] Resend returned no message id');
      throw new EmailDeliveryError('Resend returned no message id', response, to, subject);
    }

    logger.info({ to, subject, messageId }, '[EMAIL] Sent successfully');
    return { status: 'sent', messageId };
  }

  async sendEnvioCreado(envio: Envio): Promise<EmailSendResult> {
    const to = this.destinatarioEmail(envio);
    if (!to) {
      logger.info({ envioId: envio.id, tracking: envio.trackingNumber }, '[EMAIL] No destinatario email, skipping envio_creado');
      return { status: 'skipped', reason: 'no_recipient' };
    }

    const tn = escapeHtml(envio.trackingNumber);
    const dest = escapeHtml(envio.destino);
    const nombre = escapeHtml(envio.destinatarioNombre);
    const remitente = escapeHtml(envio.clienteNombre);

    const html = baseTemplate({
      title: 'Tu pedido está en camino',
      accent: '#0643F7',
      tracking: envio.trackingNumber,
      body: `
<h1 style="font-size:22px;font-weight:700;margin:0 0 8px;color:#1a1a2e">Hola ${nombre}, tu pedido está en camino</h1>
<p style="font-size:14px;line-height:1.7;color:#6b7280;margin:0 0 28px">${remitente} registró un envío para vos a través de GO EXPRESS. Te vamos a ir avisando cada cambio de estado.</p>
${trackingBox(tn, '#0643F7')}
${row('Remitente', remitente)}
${row('Destino', dest)}
${row('Estado', badge('Pendiente', '#EEF2FF', '#0643F7'), true)}`,
    });

    return this.send(to, `Tu pedido está en camino, ${envio.trackingNumber}`, html);
  }

  async sendRecolectado(envio: Envio): Promise<EmailSendResult> {
    const to = this.destinatarioEmail(envio);
    if (!to) {
      logger.info({ envioId: envio.id, tracking: envio.trackingNumber }, '[EMAIL] No destinatario email, skipping recolectado');
      return { status: 'skipped', reason: 'no_recipient' };
    }

    const tn = escapeHtml(envio.trackingNumber);
    const nombre = escapeHtml(envio.destinatarioNombre);
    const remitente = escapeHtml(envio.clienteNombre);
    const dest = escapeHtml(envio.destino);

    const html = baseTemplate({
      title: 'Tu paquete fue retirado del remitente',
      accent: '#0643F7',
      tracking: envio.trackingNumber,
      body: `
<h1 style="font-size:22px;font-weight:700;margin:0 0 8px;color:#1a1a2e">Hola ${nombre}, tu paquete fue retirado</h1>
<p style="font-size:14px;line-height:1.7;color:#6b7280;margin:0 0 28px">Pasamos a buscar el paquete donde ${remitente}. Ya está en nuestras manos y se está preparando para el envío.</p>
${trackingBox(tn, '#0643F7')}
${row('Remitente', remitente)}
${row('Destino', dest)}
${row('Estado', badge('Retirado del remitente', '#EEF2FF', '#0643F7'), true)}`,
    });

    return this.send(to, `Tu paquete está en camino, ${envio.trackingNumber}`, html);
  }

  async sendEnTransito(envio: Envio): Promise<EmailSendResult> {
    const to = this.destinatarioEmail(envio);
    if (!to) {
      logger.info({ envioId: envio.id, tracking: envio.trackingNumber }, '[EMAIL] No destinatario email, skipping en_transito');
      return { status: 'skipped', reason: 'no_recipient' };
    }

    const tn = escapeHtml(envio.trackingNumber);
    const nombre = escapeHtml(envio.destinatarioNombre);
    const dest = escapeHtml(envio.destino);

    const html = baseTemplate({
      title: 'Tu paquete está en tránsito',
      accent: '#0643F7',
      tracking: envio.trackingNumber,
      body: `
<h1 style="font-size:22px;font-weight:700;margin:0 0 8px;color:#1a1a2e">Hola ${nombre}, tu paquete está en tránsito</h1>
<p style="font-size:14px;line-height:1.7;color:#6b7280;margin:0 0 28px">Tu paquete ya salió hacia el centro de distribución. Pronto llega a tu zona.</p>
${trackingBox(tn, '#0643F7')}
${row('Destino', dest)}
${row('Estado', badge('En tránsito', '#EEF2FF', '#0643F7'), true)}`,
    });

    return this.send(to, `Tu paquete está en tránsito, ${envio.trackingNumber}`, html);
  }

  async sendEnReparto(envio: Envio): Promise<EmailSendResult> {
    const to = this.destinatarioEmail(envio);
    if (!to) {
      logger.info({ envioId: envio.id, tracking: envio.trackingNumber }, '[EMAIL] No destinatario email, skipping en_reparto');
      return { status: 'skipped', reason: 'no_recipient' };
    }

    const tn = escapeHtml(envio.trackingNumber);
    const nombre = escapeHtml(envio.destinatarioNombre);
    const dest = escapeHtml(envio.destino);
    const instrucciones = envio.instruccionesEntrega ? escapeHtml(envio.instruccionesEntrega) : null;

    const html = baseTemplate({
      title: 'Tu paquete sale a entrega hoy',
      accent: '#97D700',
      tracking: envio.trackingNumber,
      body: `
<h1 style="font-size:22px;font-weight:700;margin:0 0 8px;color:#1a1a2e">Hola ${nombre}, tu paquete sale a entrega hoy</h1>
<p style="font-size:14px;line-height:1.7;color:#6b7280;margin:0 0 28px">El repartidor ya tiene tu paquete. Estate atento porque lo llevan a tu dirección.</p>
${trackingBox(tn, '#5C8A00', '#F4FADA', '#D4EF85', '#A3C840')}
${row('Destino', dest)}
${instrucciones ? row('Instrucciones', instrucciones) : ''}
${row('Estado', badge('En reparto', '#F4FADA', '#5C8A00'), true)}`,
    });

    return this.send(to, `Tu paquete está en reparto hoy, ${envio.trackingNumber}`, html);
  }

  // Fan-out a destinatario y cliente. Devuelve 1 entry por audiencia con su recipient
  // y su EmailSendResult independiente. El wrapper en notificaciones.service.ts
  // persiste 1 row por entry, asi que el audit log refleja el resultado real de cada
  // send (sent / failed / skipped) sin colapsar. Si ambas audiencias estan ausentes,
  // devolvemos un unico entry skipped/no_recipient para que quede traza del evento.
  async sendFallido(envio: Envio): Promise<EmailDispatchEntry[]> {
    const destinatarioTo = this.destinatarioEmail(envio);
    const clienteTo = await this.resolveClienteEmail(envio);

    const tn = escapeHtml(envio.trackingNumber);
    const nombre = escapeHtml(envio.destinatarioNombre);
    const dest = escapeHtml(envio.destino);
    const remitente = escapeHtml(envio.clienteNombre);

    const entries: EmailDispatchEntry[] = [];

    if (destinatarioTo) {
      const htmlDestinatario = baseTemplate({
        title: 'No pudimos entregar tu paquete',
        accent: '#EF4444',
        tracking: envio.trackingNumber,
        body: `
<h1 style="font-size:22px;font-weight:700;margin:0 0 8px;color:#1a1a2e">Hola ${nombre}, no pudimos entregarte el paquete</h1>
<p style="font-size:14px;line-height:1.7;color:#6b7280;margin:0 0 28px">El repartidor intentó entregar el paquete pero no fue posible completar la entrega. Nuestro equipo coordinará un nuevo intento.</p>
${trackingBox(tn, '#EF4444', '#FEF2F2', '#FECACA', '#FCA5A5')}
${row('Destino', dest)}
${row('Estado', badge('Entrega fallida', '#FEF2F2', '#DC2626'), true)}
<p style="font-size:13px;line-height:1.7;color:#6b7280;margin:24px 0 0">Si tenés alguna duda o querés reprogramar, escribinos por WhatsApp.</p>`,
      });
      entries.push({
        recipient: destinatarioTo,
        result: await this.tryFanOutSend(destinatarioTo, `Intento de entrega fallido, ${envio.trackingNumber}`, htmlDestinatario),
      });
    } else {
      logger.info({ envioId: envio.id, tracking: envio.trackingNumber }, '[EMAIL] No destinatario email on fallido');
    }

    if (clienteTo) {
      const htmlCliente = baseTemplate({
        title: 'Entrega fallida',
        accent: '#EF4444',
        tracking: envio.trackingNumber,
        body: `
<h1 style="font-size:22px;font-weight:700;margin:0 0 8px;color:#1a1a2e">No se pudo completar la entrega</h1>
<p style="font-size:14px;line-height:1.7;color:#6b7280;margin:0 0 28px">Hola ${remitente}, el repartidor no pudo entregar el paquete. Se coordinará un nuevo intento.</p>
${trackingBox(tn, '#EF4444', '#FEF2F2', '#FECACA', '#FCA5A5')}
${row('Destinatario', nombre)}
${row('Destino', dest)}
${row('Estado', badge('Entrega fallida', '#FEF2F2', '#DC2626'), true)}`,
      });
      entries.push({
        recipient: clienteTo,
        result: await this.tryFanOutSend(clienteTo, `Entrega fallida: ${envio.trackingNumber}`, htmlCliente),
      });
    } else {
      logger.info({ envioId: envio.id, clienteId: envio.clienteId }, '[EMAIL] No cliente email on fallido');
    }

    if (entries.length === 0) {
      return [{ recipient: '', result: { status: 'skipped', reason: 'no_recipient' } }];
    }
    return entries;
  }

  async sendCambioEstado(envio: Envio, previousEstado: string): Promise<EmailSendResult> {
    const to = this.destinatarioEmail(envio);
    if (!to) {
      logger.info({ envioId: envio.id, tracking: envio.trackingNumber, estado: envio.estado }, '[EMAIL] No destinatario email, skipping cambio_estado');
      return { status: 'skipped', reason: 'no_recipient' };
    }

    const tn = escapeHtml(envio.trackingNumber);
    const nombre = escapeHtml(envio.destinatarioNombre);
    const prevLabel = statusLabel(previousEstado);
    const newLabel = statusLabel(envio.estado);
    const dest = escapeHtml(envio.destino);

    const html = baseTemplate({
      title: 'Actualización de tu envío',
      accent: '#0643F7',
      tracking: envio.trackingNumber,
      body: `
<h1 style="font-size:22px;font-weight:700;margin:0 0 8px;color:#1a1a2e">Hola ${nombre}, hay novedades de tu envío</h1>
<p style="font-size:14px;line-height:1.7;color:#6b7280;margin:0 0 28px">Tu pedido pasó a un nuevo estado.</p>
${trackingBox(tn, '#0643F7')}
${row('Estado anterior', prevLabel)}
${row('Nuevo estado', badge(newLabel, '#EEF2FF', '#0643F7'))}
${row('Destino', dest, true)}`,
    });

    return this.send(to, `Envío ${envio.trackingNumber}: ${newLabel}`, html);
  }

  async sendEntregado(envio: Envio): Promise<EmailDispatchEntry[]> {
    const destinatarioTo = this.destinatarioEmail(envio);
    const clienteTo = await this.resolveClienteEmail(envio);

    const tn = escapeHtml(envio.trackingNumber);
    const dest = escapeHtml(envio.destino);
    const nombreDestinatario = escapeHtml(envio.destinatarioNombre);
    const remitente = escapeHtml(envio.clienteNombre);

    const entries: EmailDispatchEntry[] = [];

    if (destinatarioTo) {
      const htmlDestinatario = baseTemplate({
        title: 'Tu envío fue entregado',
        accent: '#10B981',
        tracking: envio.trackingNumber,
        body: `
<h1 style="font-size:22px;font-weight:700;margin:0 0 8px;color:#1a1a2e">Tu envío fue entregado</h1>
<p style="font-size:14px;line-height:1.7;color:#6b7280;margin:0 0 28px">El paquete llegó a destino exitosamente. Gracias por confiar en GO EXPRESS.</p>
${trackingBox(tn, '#10B981', '#ECFDF5', '#D1FAE5', '#6EE7B7')}
${row('Destino', dest)}
${row('Destinatario', nombreDestinatario)}
${row('Estado', badge('Entregado', '#ECFDF5', '#059669'), true)}`,
      });
      entries.push({
        recipient: destinatarioTo,
        result: await this.tryFanOutSend(destinatarioTo, `Envío ${envio.trackingNumber} entregado`, htmlDestinatario),
      });
    } else {
      logger.info({ envioId: envio.id, tracking: envio.trackingNumber }, '[EMAIL] No destinatario email on entregado');
    }

    if (clienteTo) {
      const htmlCliente = baseTemplate({
        title: 'Envío entregado',
        accent: '#10B981',
        tracking: envio.trackingNumber,
        body: `
<h1 style="font-size:22px;font-weight:700;margin:0 0 8px;color:#1a1a2e">Envío entregado exitosamente</h1>
<p style="font-size:14px;line-height:1.7;color:#6b7280;margin:0 0 28px">Hola ${remitente}, confirmamos la entrega del envío que registraste.</p>
${trackingBox(tn, '#10B981', '#ECFDF5', '#D1FAE5', '#6EE7B7')}
${row('Destinatario', nombreDestinatario)}
${row('Destino', dest)}
${row('Estado', badge('Entregado', '#ECFDF5', '#059669'), true)}`,
      });
      entries.push({
        recipient: clienteTo,
        result: await this.tryFanOutSend(clienteTo, `Envío ${envio.trackingNumber} entregado a ${envio.destinatarioNombre}`, htmlCliente),
      });
    } else {
      logger.info({ envioId: envio.id, clienteId: envio.clienteId }, '[EMAIL] No cliente email on entregado');
    }

    if (entries.length === 0) {
      return [{ recipient: '', result: { status: 'skipped', reason: 'no_recipient' } }];
    }
    return entries;
  }

  async sendProblema(envio: Envio): Promise<EmailSendResult> {
    const to = this.destinatarioEmail(envio);
    if (!to) {
      logger.info({ envioId: envio.id, tracking: envio.trackingNumber }, '[EMAIL] No destinatario email, skipping problema');
      return { status: 'skipped', reason: 'no_recipient' };
    }

    const tn = escapeHtml(envio.trackingNumber);
    const nombre = escapeHtml(envio.destinatarioNombre);
    const desc = escapeHtml(envio.problemaDescripcion ?? 'Sin descripción');

    const html = baseTemplate({
      title: 'Novedad con tu envío',
      accent: '#F59E0B',
      tracking: envio.trackingNumber,
      body: `
<h1 style="font-size:22px;font-weight:700;margin:0 0 8px;color:#1a1a2e">Hola ${nombre}, hay una novedad con tu envío</h1>
<p style="font-size:14px;line-height:1.7;color:#6b7280;margin:0 0 28px">Nuestro equipo está trabajando para resolverlo.</p>
${trackingBox(tn, '#F59E0B', '#FFFBEB', '#FDE68A', '#FBBF24')}
${row('Detalle', desc)}
${row('Estado', badge('Con problema', '#FFFBEB', '#D97706'), true)}
<p style="font-size:13px;line-height:1.7;color:#6b7280;margin:24px 0 0">Te contactaremos a la brevedad. Si necesitás ayuda inmediata, escribinos por WhatsApp.</p>`,
    });

    return this.send(to, `Novedad con tu envío ${envio.trackingNumber}`, html);
  }

  async sendPortalInvite(email: string, temporaryPassword: string, clienteName: string): Promise<EmailSendResult> {
    const safeName = escapeHtml(clienteName);
    const safeEmail = escapeHtml(email);
    const safePassword = escapeHtml(temporaryPassword);

    const html = baseTemplate({
      title: 'Bienvenido al Portal GO EXPRESS',
      accent: '#0643F7',
      tracking: '',
      ctaText: 'Acceder al Portal',
      ctaUrl: 'https://goexpressparaguay.com/portal/login',
      body: `
<h1 style="font-size:22px;font-weight:700;margin:0 0 8px;color:#1a1a2e">Bienvenido al Portal de Clientes</h1>
<p style="font-size:14px;line-height:1.7;color:#6b7280;margin:0 0 28px">Hola, ${safeName}. Tu cuenta fue activada. Desde el portal podés crear envíos, ver el estado y descargar reportes.</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8f9fb;border-radius:12px;margin-bottom:24px">
<tr><td style="padding:24px">
${row('Email', safeEmail)}
${row('Contraseña', `<span style="font-family:'JetBrains Mono',monospace;letter-spacing:1px">${safePassword}</span>`, true)}
</td></tr></table>
<p style="font-size:13px;color:#6b7280;margin:0">Cambiá tu contraseña al iniciar sesión por primera vez.</p>`,
    });

    return this.send(email, 'Bienvenido al Portal GO EXPRESS', html);
  }

  async sendAdminInvite(email: string, temporaryPassword: string, adminName: string): Promise<EmailSendResult> {
    const safeName = escapeHtml(adminName);
    const safeEmail = escapeHtml(email);
    const safePassword = escapeHtml(temporaryPassword);

    const html = baseTemplate({
      title: 'Tu acceso al panel Admin GO EXPRESS',
      accent: '#0643F7',
      tracking: '',
      ctaText: 'Acceder al panel Admin',
      ctaUrl: 'https://goexpressparaguay.com/admin/login',
      body: `
<h1 style="font-size:22px;font-weight:700;margin:0 0 8px;color:#1a1a2e">Tu acceso al panel Admin</h1>
<p style="font-size:14px;line-height:1.7;color:#6b7280;margin:0 0 28px">Hola, ${safeName}. Se creó tu cuenta con permisos de administrador sobre el panel completo de GO EXPRESS. Entrá con estas credenciales y cambiá la contraseña apenas ingreses.</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8f9fb;border-radius:12px;margin-bottom:24px">
<tr><td style="padding:24px">
${row('Email', safeEmail)}
${row('Contraseña', `<span style="font-family:'JetBrains Mono',monospace;letter-spacing:1px">${safePassword}</span>`, true)}
</td></tr></table>
<p style="font-size:13px;color:#6b7280;margin:0">Cambiá tu contraseña al iniciar sesión por primera vez.</p>`,
    });

    return this.send(email, 'Tu acceso al panel Admin GO EXPRESS', html);
  }

  async sendPasswordReset(
    email: string,
    nombre: string,
    resetUrl: string,
    portal: 'cliente' | 'repartidor' | 'admin',
  ): Promise<EmailSendResult> {
    const safeName = escapeHtml(nombre || 'Hola');
    const safeUrl = escapeHtml(resetUrl);
    const portalLabel =
      portal === 'repartidor' ? 'Portal Repartidor' :
      portal === 'admin' ? 'Panel Admin' :
      'Portal de Clientes';

    const html = baseTemplate({
      title: 'Recuperación de contraseña GO EXPRESS',
      accent: '#0643F7',
      tracking: '',
      ctaText: 'Crear nueva contraseña',
      ctaUrl: safeUrl,
      body: `
<h1 style="font-size:22px;font-weight:700;margin:0 0 8px;color:#1a1a2e">Recuperá tu contraseña</h1>
<p style="font-size:14px;line-height:1.7;color:#6b7280;margin:0 0 16px">Hola, ${safeName}. Recibimos una solicitud para crear una nueva contraseña en tu cuenta de ${portalLabel}.</p>
<p style="font-size:14px;line-height:1.7;color:#6b7280;margin:0 0 28px">Tocá el botón de abajo para elegir una contraseña nueva. El link es válido por 1 hora.</p>
<p style="font-size:12px;color:#9ca3af;margin:0">Si no fuiste vos, podés ignorar este correo. Tu contraseña actual sigue funcionando.</p>`,
    });

    return this.send(email, 'Recuperá tu contraseña GO EXPRESS', html);
  }

  async sendRepartidorInvite(email: string, temporaryPassword: string, repartidorName: string): Promise<EmailSendResult> {
    const safeName = escapeHtml(repartidorName);
    const safeEmail = escapeHtml(email);
    const safePassword = escapeHtml(temporaryPassword);

    const html = baseTemplate({
      title: 'Tu acceso al portal de repartidores GO EXPRESS',
      accent: '#0643F7',
      tracking: '',
      ctaText: 'Abrir portal repartidor',
      ctaUrl: 'https://goexpressparaguay.com/repartidor/login',
      body: `
<h1 style="font-size:22px;font-weight:700;margin:0 0 8px;color:#1a1a2e">Tu cuenta está lista</h1>
<p style="font-size:14px;line-height:1.7;color:#6b7280;margin:0 0 28px">Hola, ${safeName}. Desde ahora vas a ver tus pedidos asignados en el portal. Podés marcar entregas, reportar incidencias y avisar al cliente con un toque.</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8f9fb;border-radius:12px;margin-bottom:24px">
<tr><td style="padding:24px">
${row('Email', safeEmail)}
${row('Contraseña', `<span style="font-family:'JetBrains Mono',monospace;letter-spacing:1px">${safePassword}</span>`, true)}
</td></tr></table>
<p style="font-size:13px;color:#6b7280;margin:0 0 8px"><strong>Consejo:</strong> abrí el portal desde el celular y agregalo a la pantalla de inicio para tenerlo como una app.</p>
<p style="font-size:12px;color:#9ca3af;margin:0">Si no esperabas este correo, podés ignorarlo.</p>`,
    });

    return this.send(email, 'Tu acceso al portal de repartidores GO EXPRESS', html);
  }

  // Captura el throw de send() y lo traduce a un EmailSendResult con status='failed'.
  // Sirve para que cada audiencia en un fan-out registre su propio resultado en el
  // audit log, sin que el throw de una arrastre el reporte de la otra.
  private async tryFanOutSend(to: string, subject: string, html: string): Promise<EmailSendResult> {
    try {
      return await this.send(to, subject, html);
    } catch (err) {
      const message =
        err instanceof EmailDeliveryError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err);
      return { status: 'failed', error: message };
    }
  }

  private destinatarioEmail(envio: Envio): string | null {
    const email = envio.destinatarioEmail?.trim();
    return email ? email : null;
  }

  private async resolveClienteEmail(envio: Envio): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select('email')
        .eq('id', envio.clienteId)
        .single();

      if (error || !data?.email) {
        logger.warn({ clienteId: envio.clienteId, error }, '[EMAIL] Could not resolve cliente email');
        return null;
      }

      return data.email as string;
    } catch (err) {
      logger.error({ err, clienteId: envio.clienteId }, '[EMAIL] Error resolving cliente email');
      return null;
    }
  }
}

export const emailService = new EmailService();
