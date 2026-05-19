import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

// Webhook Meta WhatsApp Cloud API.
// IMPORTANTE: este endpoint NO procesa mensajes inbound. La app es outbound-only
// (notificaciones de estado de envio). Existe solamente para:
//   1. Pasar la verificacion GET de Meta cuando se activa la app.
//   2. Aceptar callbacks POST de delivery status sin romper (Meta marca el endpoint
//      como down si devuelve 4xx/5xx por mucho tiempo, lo cual puede degradar la
//      reputacion del numero). Aceptamos y descartamos.

const router = Router();

// GET /api/public/webhooks/whatsapp
// Meta envia: ?hub.mode=subscribe&hub.verify_token=XXX&hub.challenge=NNN
// Debemos responder con el valor de hub.challenge en plain text si el token matchea.
// Doc: developers.facebook.com/docs/graph-api/webhooks/getting-started
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
    // timingSafeEqual requiere buffers de igual longitud. Comparamos largo primero
    // para no leakear info via length, despues hacemos la comparacion constante.
    // '===' filtraba el token byte a byte por short-circuit y permitia distinguir
    // prefijos correctos via timing observable desde la red.
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

// POST /api/public/webhooks/whatsapp
// Meta postea statuses (sent/delivered/read) y mensajes inbound. Por requerimiento
// explicito, NO procesamos mensajes inbound ni statuses. Solamente 200 para no
// degradar la reputacion del endpoint. Si en algun momento queremos consumir delivery
// receipts (linkear contra notificaciones_log via wamid), agregar el handler aqui.
router.post('/whatsapp', (_req, res) => {
  res.status(200).send('EVENT_RECEIVED');
});

export default router;
