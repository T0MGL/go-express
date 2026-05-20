import { Router, type Request } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { supabase } from '../../config/database.js';

// Webhook Meta WhatsApp Cloud API.
//
// GET  /whatsapp -> verificacion inicial (hub.challenge echo).
// POST /whatsapp -> eventos de Meta: delivery statuses + template status updates.
//
// Outbound es el caso primario de uso del API. El webhook existe para:
//   1. Pasar la verificacion GET cuando se activa la subscription.
//   2. Recibir delivery receipts (sent/delivered/read/failed) y actualizar
//      notificaciones_log cuando un envio falla, para troubleshoot accionable.
//   3. Recibir actualizaciones de status de templates (APPROVED/REJECTED) y
//      loguearlas. Critico cuando Meta cambia categoria/aprueba/rechaza.
//
// Meta espera 200 en menos de 20s. Por eso ack rapido y procesamiento async.

const router = Router();

// --- Tipos ---

interface MetaStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
  errors?: Array<{ code: number; title: string; message?: string }>;
}

interface MetaTemplateStatusEvent {
  message_template_id: string;
  message_template_name: string;
  message_template_language: string;
  event: 'APPROVED' | 'REJECTED' | 'PAUSED' | 'PENDING' | 'DISABLED' | 'IN_APPEAL' | 'FLAGGED';
  reason?: string;
}

// --- GET verify ---

router.get('/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (!env.META_WA_VERIFY_TOKEN) {
    logger.warn('[WA WEBHOOK] META_WA_VERIFY_TOKEN no seteado, rechazando verificacion');
    res.status(403).send('Forbidden');
    return;
  }

  if (mode === 'subscribe' && typeof token === 'string') {
    const provided = Buffer.from(token, 'utf8');
    const expected = Buffer.from(env.META_WA_VERIFY_TOKEN, 'utf8');
    if (provided.length === expected.length && timingSafeEqual(provided, expected)) {
      logger.info('[WA WEBHOOK] Verificacion exitosa');
      res.status(200).type('text/plain').send(typeof challenge === 'string' ? challenge : '');
      return;
    }
  }

  logger.warn({ mode, tokenLen: typeof token === 'string' ? token.length : 0 }, '[WA WEBHOOK] Verificacion rechazada');
  res.status(403).send('Forbidden');
});

// --- POST events ---

// Constant-time HMAC-SHA256 verification del body crudo con META_APP_SECRET.
// Header esperado: X-Hub-Signature-256: sha256=<hex>.
function verifySignature(rawBody: Buffer | undefined, header: string | undefined): boolean {
  if (!env.META_APP_SECRET) return false;
  if (!rawBody || !header || !header.startsWith('sha256=')) return false;

  const provided = header.slice('sha256='.length);
  if (provided.length !== 64) return false; // 32 bytes hex == 64 chars

  let providedBuf: Buffer;
  let expectedBuf: Buffer;
  try {
    providedBuf = Buffer.from(provided, 'hex');
    expectedBuf = createHmac('sha256', env.META_APP_SECRET).update(rawBody).digest();
  } catch {
    return false;
  }

  if (providedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(providedBuf, expectedBuf);
}

router.post('/whatsapp', (req: Request, res) => {
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  const sigHeaderRaw = req.headers['x-hub-signature-256'];
  const sigHeader = Array.isArray(sigHeaderRaw) ? sigHeaderRaw[0] : sigHeaderRaw;

  // En produccion la firma es obligatoria: hard-fail 401 si APP_SECRET falta o
  // si la firma no valida. En dev/test fallback a warn-and-accept para no romper
  // el flow local cuando todavia no se cargo el secret.
  if (!env.META_APP_SECRET) {
    if (env.NODE_ENV === 'production') {
      logger.error('[WA WEBHOOK POST] META_APP_SECRET ausente en produccion, rechazando');
      res.status(401).send('Unauthorized');
      return;
    }
    logger.warn('[WA WEBHOOK POST] META_APP_SECRET no seteado, firma no verificada (NODE_ENV != production)');
  } else if (!verifySignature(rawBody, sigHeader)) {
    logger.warn({ hasHeader: Boolean(sigHeader) }, '[WA WEBHOOK POST] Firma invalida');
    res.status(401).send('Unauthorized');
    return;
  }

  // Ack rapido. Meta tiene timeout corto (20s) y reintenta si no recibe 2xx.
  res.status(200).send('EVENT_RECEIVED');

  // Fire-and-forget: el procesamiento no debe bloquear la respuesta ni propagar
  // errores. setImmediate suelta el event loop para que el response salga primero.
  setImmediate(() => {
    void processWebhookPayload(req.body).catch((err: unknown) => {
      logger.error({ err }, '[WA WEBHOOK POST] Procesamiento fallo');
    });
  });
});

// --- Procesamiento ---

async function processWebhookPayload(payload: unknown): Promise<void> {
  if (!payload || typeof payload !== 'object') return;
  const body = payload as { object?: string; entry?: unknown[] };
  if (body.object !== 'whatsapp_business_account') {
    logger.info({ object: body.object }, '[WA WEBHOOK] Object no manejado');
    return;
  }
  if (!Array.isArray(body.entry)) return;

  for (const entry of body.entry) {
    if (!entry || typeof entry !== 'object') continue;
    const changes = (entry as { changes?: unknown[] }).changes;
    if (!Array.isArray(changes)) continue;

    for (const change of changes) {
      if (!change || typeof change !== 'object') continue;
      const field = (change as { field?: string }).field;
      const value = (change as { value?: unknown }).value;

      if (field === 'messages') {
        await processMessagesField(value);
      } else if (field === 'message_template_status_update') {
        processTemplateStatusField(value);
      } else {
        logger.info({ field }, '[WA WEBHOOK] Field no manejado');
      }
    }
  }
}

async function processMessagesField(value: unknown): Promise<void> {
  if (!value || typeof value !== 'object') return;
  const statuses = (value as { statuses?: MetaStatus[] }).statuses;
  if (!Array.isArray(statuses)) return;

  for (const status of statuses) {
    if (!status || typeof status !== 'object' || !status.id) continue;
    await persistDeliveryStatus(status);
  }
}

async function persistDeliveryStatus(status: MetaStatus): Promise<void> {
  // sent/delivered/read son ruido para DB en escala. Loguear basta para
  // troubleshoot puntual. Solo failed se persiste como update porque cambia
  // el status del row a 'fallido' y necesita ser auditable.
  if (status.status !== 'failed') {
    logger.info(
      { wamid: status.id, status: status.status, recipient: status.recipient_id },
      '[WA WEBHOOK] Delivery status',
    );
    return;
  }

  const firstError = status.errors?.[0];
  const errorMsg = firstError
    ? `${firstError.code}: ${firstError.title}${firstError.message ? ` - ${firstError.message}` : ''}`
    : 'failed sin detalle';

  // Idempotente: solo transiciona enviado -> fallido. Meta reintenta el mismo
  // status si no recibe ACK en 20s; sin el guard, cada reintento dispararia un
  // UPDATE redundante que en el futuro podria fan-out a alertas/retries.
  const { error, count } = await supabase
    .from('notificaciones_log')
    .update({ status: 'fallido', error: errorMsg }, { count: 'exact' })
    .eq('proveedor_message_id', status.id)
    .eq('canal', 'whatsapp')
    .eq('status', 'enviado');

  if (error) {
    logger.error(
      { err: error, wamid: status.id },
      '[WA WEBHOOK] Update notificaciones_log fallo',
    );
    return;
  }

  if (count === 0) {
    // wamid no esta en nuestro log: puede ser de otra app sharing WABA, o el
    // INSERT no llego a persistirse cuando mandamos (race condition rara).
    logger.warn({ wamid: status.id, errorMsg }, '[WA WEBHOOK] Failed status sin row matching');
  } else {
    logger.warn(
      { wamid: status.id, recipient: status.recipient_id, errorMsg, count },
      '[WA WEBHOOK] Mensaje marcado como fallido',
    );
  }
}

function processTemplateStatusField(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  const v = value as Partial<MetaTemplateStatusEvent>;
  // Nivel WARN cuando es REJECTED/DISABLED/FLAGGED porque requiere accion humana.
  // INFO para APPROVED y demas (ruido normal).
  const requiresAction = v.event === 'REJECTED' || v.event === 'DISABLED' || v.event === 'FLAGGED';
  const log = requiresAction ? logger.warn.bind(logger) : logger.info.bind(logger);
  log(
    {
      template: v.message_template_name,
      lang: v.message_template_language,
      event: v.event,
      reason: v.reason,
      id: v.message_template_id,
    },
    '[WA WEBHOOK] Template status update',
  );
}

export default router;
