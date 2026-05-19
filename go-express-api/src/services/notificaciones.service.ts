import { supabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import { emailService, type EmailDispatchEntry } from './email.service.js';
import { whatsappService, WhatsAppError } from './whatsapp.service.js';
import { notificacionesConfigService } from './notificacionesConfig.service.js';
import type { NotificacionesConfigKey } from '../lib/notificaciones.js';
import type { Envio, EnvioEstado, NotificationEvent } from '../types/index.js';

// Orquestador del fan-out email + WhatsApp por evento de envio.
// Decisiones:
//   * Ambos canales en paralelo via Promise.allSettled: si uno falla, el otro sigue.
//   * Cada intento (incluso "descartado" por falta de email/telefono) persiste en
//     notificaciones_log para auditoria. Best-effort: si el log falla, se loggea
//     pero no rompe la HTTP response.
//   * No reintenta. Meta y Resend ya tienen retry interno; si llega aca como fallido,
//     fallo permanente o requiere intervencion manual.
//   * No queue: fire-and-forget desde el caller (triggerNotification en envio.service).

type NotifCanal = 'email' | 'whatsapp';
type NotifStatus = 'enviado' | 'fallido' | 'descartado';
type NotifEvento =
  | 'envio_creado'
  | 'recolectado'
  | 'en_transito'
  | 'en_deposito'
  | 'en_reparto'
  | 'entregado'
  | 'fallido'
  | 'problema';

interface LogEntry {
  envioId: string;
  evento: NotifEvento;
  canal: NotifCanal;
  destinatario: string;
  status: NotifStatus;
  proveedorMessageId?: string | null;
  error?: string | null;
}

async function persistLog(entry: LogEntry): Promise<void> {
  try {
    const { error } = await supabase.from('notificaciones_log').insert({
      envio_id: entry.envioId,
      evento: entry.evento,
      canal: entry.canal,
      destinatario: entry.destinatario,
      status: entry.status,
      proveedor_message_id: entry.proveedorMessageId ?? null,
      error: entry.error ?? null,
    });
    if (error) {
      logger.error({ err: error, entry }, '[NOTIF_LOG] Insert failed');
    }
  } catch (err) {
    logger.error({ err, entry }, '[NOTIF_LOG] Unexpected error');
  }
}

// Mapea el par (event, estado) al notif_evento del log y al config key.
function resolveEventKeys(event: NotificationEvent, estado: EnvioEstado): {
  configKey: NotificacionesConfigKey | null;
  logEvento: NotifEvento | null;
} {
  if (event === 'envio_creado') {
    return { configKey: 'envio_creado', logEvento: 'envio_creado' };
  }
  const map: Record<string, { configKey: NotificacionesConfigKey | null; logEvento: NotifEvento | null }> = {
    recolectado: { configKey: 'recolectado', logEvento: 'recolectado' },
    en_transito: { configKey: 'en_transito', logEvento: 'en_transito' },
    en_deposito: { configKey: 'en_deposito', logEvento: 'en_deposito' },
    en_reparto: { configKey: 'en_reparto', logEvento: 'en_reparto' },
    entregado: { configKey: 'entregado', logEvento: 'entregado' },
    fallido: { configKey: 'fallido', logEvento: 'fallido' },
    problema: { configKey: 'problema', logEvento: 'problema' },
  };
  return map[estado] ?? { configKey: null, logEvento: null };
}

// Wrappers que rutean evento -> handler de email.service. Cada handler devuelve
// EmailDispatchEntry[]: 1 item para single-audience, 2 items para fan-out (entregado,
// fallido). Si el handler interno tira (single-audience), capturamos aca y devolvemos
// un entry { status: 'failed' } para que el wrapper persista una row de auditoria.
// El switch usa exhaustive check post-default para que TypeScript fuerce cualquier
// nuevo EnvioEstado a tener handler en compile time.
async function dispatchEmail(event: NotificationEvent, envio: Envio): Promise<EmailDispatchEntry[]> {
  const wrap = async (recipientFallback: string, sender: () => Promise<EmailDispatchEntry[] | EmailDispatchEntry['result']>): Promise<EmailDispatchEntry[]> => {
    try {
      const out = await sender();
      return Array.isArray(out) ? out : [{ recipient: recipientFallback, result: out }];
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return [{ recipient: recipientFallback, result: { status: 'failed', error: message } }];
    }
  };

  const destinatarioEmail = envio.destinatarioEmail?.trim() ?? '';

  if (event === 'envio_creado') {
    return wrap(destinatarioEmail, () => emailService.sendEnvioCreado(envio));
  }

  switch (envio.estado) {
    case 'recolectado':
      return wrap(destinatarioEmail, () => emailService.sendRecolectado(envio));
    case 'en_transito':
      return wrap(destinatarioEmail, () => emailService.sendEnTransito(envio));
    case 'en_reparto':
      return wrap(destinatarioEmail, () => emailService.sendEnReparto(envio));
    case 'entregado':
      return wrap(destinatarioEmail, () => emailService.sendEntregado(envio));
    case 'fallido':
      return wrap(destinatarioEmail, () => emailService.sendFallido(envio));
    case 'problema':
      return wrap(destinatarioEmail, () => emailService.sendProblema(envio));
    case 'en_deposito':
      // email.service.ts aun no tiene sendEnDeposito. Fallback a sendCambioEstado
      // generico para no perder el aviso. Ver gap 1 en notification-templates.md.
      return wrap(destinatarioEmail, () => emailService.sendCambioEstado(envio, 'en_transito'));
    case 'pendiente':
      // resolveEventKeys filtra 'pendiente' upstream para cambio_estado. Si llega
      // aca, es un evento nuevo sin mapping; lo tratamos como fallido auditeable.
      return [{ recipient: destinatarioEmail, result: { status: 'failed', error: `Estado sin handler email: ${envio.estado}` } }];
    default: {
      // Exhaustive check: si se agrega un EnvioEstado nuevo, TypeScript falla aca.
      const _exhaustive: never = envio.estado;
      return [{ recipient: destinatarioEmail, result: { status: 'failed', error: `Estado sin handler email: ${String(_exhaustive)}` } }];
    }
  }
}

class NotificacionesService {
  /**
   * Dispara email + WhatsApp en paralelo para un evento de envio.
   * Persiste un row por canal en notificaciones_log (success / fail / descartado).
   * Nunca throw: el caller espera fire-and-forget.
   */
  async dispatch(event: NotificationEvent, envio: Envio): Promise<void> {
    const { configKey, logEvento } = resolveEventKeys(event, envio.estado);
    if (!configKey || !logEvento) {
      logger.info({ event, estado: envio.estado }, '[NOTIF] No event mapping, skipping');
      return;
    }

    const enabled = await notificacionesConfigService.isEnabled(configKey);
    if (!enabled) {
      logger.info(
        { event, estado: envio.estado, key: configKey, tracking: envio.trackingNumber },
        '[NOTIF] Event disabled by admin config, skipping all channels',
      );
      return;
    }

    const emailDestinatario = envio.destinatarioEmail?.trim() ?? '';
    const whatsappDestinatario = whatsappService.destinatarioFor(envio) ?? '';

    const emailEntriesPromise: Promise<LogEntry[]> = (async () => {
      // No filtramos por emailDestinatario porque eventos de fan-out (entregado,
      // fallido) tambien intentan enviar al cliente remitente, que tiene su propio
      // email resuelto desde la tabla clientes. Es el handler el que devuelve un
      // entry skipped/no_recipient cuando ninguna audiencia tiene email valido.
      try {
        const dispatched = await dispatchEmail(event, envio);
        return dispatched.map((entry) => buildEmailLogEntry(envio.id, logEvento, entry, emailDestinatario));
      } catch (err) {
        return [
          {
            envioId: envio.id,
            evento: logEvento,
            canal: 'email' as NotifCanal,
            destinatario: emailDestinatario || '(sin email)',
            status: 'fallido' as NotifStatus,
            error: err instanceof Error ? err.message : String(err),
          },
        ];
      }
    })();

    const whatsappEntryPromise: Promise<LogEntry> = (async () => {
      if (!whatsappService.isEnabled()) {
        return {
          envioId: envio.id,
          evento: logEvento,
          canal: 'whatsapp',
          destinatario: whatsappDestinatario || '(sin telefono)',
          status: 'descartado',
          error: 'WhatsApp Cloud API no configurado',
        };
      }
      if (!whatsappDestinatario) {
        return {
          envioId: envio.id,
          evento: logEvento,
          canal: 'whatsapp',
          destinatario: '(sin telefono valido)',
          status: 'descartado',
          error: 'destinatario_telefono invalido o vacio',
        };
      }
      try {
        const outcome = await whatsappService.sendForEvent(event, envio);
        switch (outcome.status) {
          case 'sent':
            return {
              envioId: envio.id,
              evento: logEvento,
              canal: 'whatsapp',
              destinatario: whatsappDestinatario,
              status: 'enviado',
              proveedorMessageId: outcome.messageId,
            };
          case 'no_template':
            return {
              envioId: envio.id,
              evento: logEvento,
              canal: 'whatsapp',
              destinatario: whatsappDestinatario || '(sin telefono)',
              status: 'descartado',
              error: outcome.reason,
            };
          case 'no_recipient':
            return {
              envioId: envio.id,
              evento: logEvento,
              canal: 'whatsapp',
              destinatario: '(sin telefono valido)',
              status: 'descartado',
              error: outcome.reason,
            };
          default: {
            const _exhaustive: never = outcome;
            return {
              envioId: envio.id,
              evento: logEvento,
              canal: 'whatsapp',
              destinatario: whatsappDestinatario,
              status: 'fallido',
              error: `Outcome WhatsApp no manejado: ${String(_exhaustive)}`,
            };
          }
        }
      } catch (err) {
        const isWA = err instanceof WhatsAppError;
        return {
          envioId: envio.id,
          evento: logEvento,
          canal: 'whatsapp',
          destinatario: whatsappDestinatario,
          status: 'fallido',
          error: isWA
            ? `[${err.code ?? 'n/a'}] ${err.message}`
            : err instanceof Error
              ? err.message
              : String(err),
        };
      }
    })();

    const [emailEntries, whatsappEntry] = await Promise.all([emailEntriesPromise, whatsappEntryPromise]);
    const entries: LogEntry[] = [...emailEntries, whatsappEntry];

    await Promise.all(entries.map((e) => persistLog(e)));

    for (const entry of entries) {
      if (entry.status === 'fallido') {
        logger.error(
          { tracking: envio.trackingNumber, canal: entry.canal, destinatario: entry.destinatario, error: entry.error },
          '[NOTIF] Send failed',
        );
      }
    }
  }
}

// Traduce un EmailDispatchEntry a un LogEntry listo para persistir. Cada audiencia
// del fan-out queda como una row independiente con su destinatario real, distinguiendo
// audiencias sin necesidad de columnas nuevas en notificaciones_log.
function buildEmailLogEntry(
  envioId: string,
  logEvento: NotifEvento,
  entry: EmailDispatchEntry,
  fallbackDestinatario: string,
): LogEntry {
  const destinatario = entry.recipient || fallbackDestinatario || '(sin email)';
  const result = entry.result;
  switch (result.status) {
    case 'sent':
      return {
        envioId,
        evento: logEvento,
        canal: 'email',
        destinatario,
        status: 'enviado',
        proveedorMessageId: result.messageId,
      };
    case 'skipped':
      return {
        envioId,
        evento: logEvento,
        canal: 'email',
        destinatario,
        status: 'descartado',
        error: `skipped: ${result.reason}`,
      };
    case 'failed':
      return {
        envioId,
        evento: logEvento,
        canal: 'email',
        destinatario,
        status: 'fallido',
        error: result.error,
      };
    default: {
      // Exhaustive check sobre el discriminated union EmailSendResult. Si se agrega
      // un cuarto terminal (ej. 'queued'), TypeScript falla aca en compile time.
      const _exhaustive: never = result;
      return {
        envioId,
        evento: logEvento,
        canal: 'email',
        destinatario,
        status: 'fallido',
        error: `Unknown EmailSendResult terminal: ${String(_exhaustive)}`,
      };
    }
  }
}

export const notificacionesService = new NotificacionesService();
