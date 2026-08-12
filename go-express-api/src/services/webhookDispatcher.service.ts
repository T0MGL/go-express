import { supabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import { nowISO } from '../lib/datetime.js';
import {
  buildEstadoCambiadoPayload,
  nextRetryDelayMs,
  signWebhookBody,
  WEBHOOK_DELIVERY_HEADER,
  WEBHOOK_EVENT_HEADER,
  WEBHOOK_EVENTO_ESTADO_CAMBIADO,
  WEBHOOK_MAX_INTENTOS,
  WEBHOOK_SIGNATURE_HEADER,
} from '../lib/webhook.js';
import type { Envio, EnvioEstado, WebhookDeliveryRow } from '../types/index.js';

// Outbox + dispatcher de webhooks salientes (Fase 2). Diseño:
//  - Encolar = INSERT en webhook_deliveries desde el service layer, DESPUES de que el
//    cambio de estado ya commiteo (post-RPC). Nunca un trigger de DB haciendo HTTP.
//  - Entregar = loop in-process en el mismo servicio Railway. El estado (intentos,
//    proximo_intento_en, status) vive en la DB: una delivery YA ENCOLADA sobrevive
//    restarts con semantica at-least-once (el receptor debe tolerar un duplicado raro,
//    y se lo documentamos). El encolado en si es best-effort post-commit: un crash en
//    la ventana entre el RPC y el INSERT pierde ese evento (tradeoff aceptado a cambio
//    de no meter HTTP ni outbox en la transaccion del estado; el integrador reconcilia
//    con GET /envios, esta en la guia).

const POLL_INTERVAL_MS = 20_000;
const BATCH_SIZE = 20;
const REQUEST_TIMEOUT_MS = 10_000;
const RESPUESTA_MAX_CHARS = 500;

// Retencion del log: las filas terminales (entregado/fallido) se purgan pasados 60 dias,
// una pasada por dia dentro del mismo loop. Las pendientes jamas se tocan.
const RETENTION_DAYS = 60;
const RETENTION_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

const DELIVERY_COLUMNS = 'id, endpoint_id, evento, payload, intento, status, proximo_intento_en';

type DueDelivery = Pick<WebhookDeliveryRow, 'id' | 'endpoint_id' | 'evento' | 'payload' | 'intento' | 'status' | 'proximo_intento_en'> & {
  webhook_endpoints: { url: string; secreto: string; activo: boolean };
};

interface AttemptResult {
  ok: boolean;
  httpStatus: number | null;
  respuesta: string;
}

function truncateRespuesta(text: string): string {
  return text.length > RESPUESTA_MAX_CHARS ? text.slice(0, RESPUESTA_MAX_CHARS) : text;
}

/**
 * POST firmado al receptor. Nunca lanza: cualquier fallo (red, timeout, TLS) se reporta
 * como AttemptResult para que el caller decida retry vs fallido.
 */
export async function deliverWebhook(params: {
  url: string;
  secreto: string;
  evento: string;
  deliveryId: string;
  payload: unknown;
}): Promise<AttemptResult> {
  // El body se serializa UNA vez y la firma se calcula sobre ese string exacto: es lo
  // que el receptor recibe byte a byte, sin depender del orden de keys del jsonb.
  const body = JSON.stringify(params.payload);

  try {
    const response = await fetch(params.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [WEBHOOK_SIGNATURE_HEADER]: signWebhookBody(params.secreto, body),
        [WEBHOOK_EVENT_HEADER]: params.evento,
        [WEBHOOK_DELIVERY_HEADER]: params.deliveryId,
        'User-Agent': 'GoExpress-Webhooks/1.0',
      },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: 'error',
    });

    const text = await response.text().catch(() => '');
    return {
      ok: response.ok,
      httpStatus: response.status,
      respuesta: truncateRespuesta(text),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, httpStatus: null, respuesta: truncateRespuesta(message) };
  }
}

class WebhookDispatcher {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private lastRetentionSweep = 0;

  /**
   * Encola una delivery por endpoint activo del cliente suscrito a envio.estado_cambiado.
   * Best-effort deliberado: el cambio de estado ya commiteo, un fallo aca se loguea y no
   * revienta el request del repartidor/admin. Sin endpoints, cero escrituras.
   */
  async enqueueEstadoCambiado(envio: Envio, estadoAnterior: EnvioEstado | null): Promise<void> {
    try {
      const { data, error } = await supabase
        .from('webhook_endpoints')
        .select('id')
        .eq('cliente_id', envio.clienteId)
        .eq('activo', true)
        .contains('eventos', [WEBHOOK_EVENTO_ESTADO_CAMBIADO]);

      if (error) {
        logger.error({ error, tracking: envio.trackingNumber }, '[WEBHOOK] Error buscando endpoints para encolar');
        return;
      }

      const endpoints = (data ?? []) as Array<{ id: string }>;
      if (endpoints.length === 0) return;

      const payload = buildEstadoCambiadoPayload({
        tracking: envio.trackingNumber,
        estadoAnterior,
        estadoNuevo: envio.estado,
        codigoReferencia: envio.codigoReferencia,
      });

      const { error: insertError } = await supabase.from('webhook_deliveries').insert(
        endpoints.map((e) => ({
          endpoint_id: e.id,
          evento: WEBHOOK_EVENTO_ESTADO_CAMBIADO,
          payload,
        }))
      );

      if (insertError) {
        logger.error({ error: insertError, tracking: envio.trackingNumber }, '[WEBHOOK] Error encolando deliveries');
        return;
      }

      logger.info(
        { tracking: envio.trackingNumber, estadoNuevo: envio.estado, endpoints: endpoints.length },
        '[WEBHOOK] Deliveries encoladas'
      );
    } catch (err) {
      logger.error({ err, tracking: envio.trackingNumber }, '[WEBHOOK] enqueue lanzo inesperadamente');
    }
  }

  /**
   * Un tick del dispatcher: toma pendientes vencidas y las procesa. Exportado para que
   * la suite lo invoque directo, sin esperar al setInterval.
   */
  async processPendingDeliveries(): Promise<void> {
    const { data, error } = await supabase
      .from('webhook_deliveries')
      .select(`${DELIVERY_COLUMNS}, webhook_endpoints!inner(url, secreto, activo)`)
      .eq('status', 'pendiente')
      .lte('proximo_intento_en', nowISO())
      .order('proximo_intento_en', { ascending: true })
      .limit(BATCH_SIZE);

    if (error) {
      logger.error({ error }, '[WEBHOOK] Error consultando deliveries pendientes');
      return;
    }

    const due = (data ?? []) as unknown as DueDelivery[];
    if (due.length === 0) return;

    // Paralelo acotado por BATCH_SIZE; cada delivery maneja su propio resultado.
    await Promise.allSettled(due.map((d) => this.processOne(d)));
  }

  private async processOne(delivery: DueDelivery): Promise<void> {
    // Endpoint desactivado despues del encolado: la delivery muere sin gastar red.
    if (!delivery.webhook_endpoints.activo) {
      await supabase
        .from('webhook_deliveries')
        .update({ status: 'fallido', respuesta: 'endpoint desactivado' })
        .eq('id', delivery.id)
        .eq('status', 'pendiente');
      return;
    }

    const intentoActual = delivery.intento + 1;
    const delayTrasFallo = nextRetryDelayMs(intentoActual);

    // Claim optimista con OCC sobre intento: si otro tick (o instancia) ya lo tomo, el
    // filtro no matchea y este proceso lo suelta. Se agenda el proximo intento ANTES del
    // POST: si el proceso muere a mitad de la request, el retry queda garantizado.
    const { data: claimed, error: claimError } = await supabase
      .from('webhook_deliveries')
      .update({
        intento: intentoActual,
        proximo_intento_en: new Date(Date.now() + (delayTrasFallo ?? 0)).toISOString(),
      })
      .eq('id', delivery.id)
      .eq('status', 'pendiente')
      .eq('intento', delivery.intento)
      .select('id');

    if (claimError || !claimed || claimed.length === 0) {
      if (claimError) {
        logger.error({ error: claimError, deliveryId: delivery.id }, '[WEBHOOK] Error en claim de delivery');
      }
      return;
    }

    const result = await deliverWebhook({
      url: delivery.webhook_endpoints.url,
      secreto: delivery.webhook_endpoints.secreto,
      evento: delivery.evento,
      deliveryId: delivery.id,
      payload: delivery.payload,
    });

    if (result.ok) {
      const { error: updateError } = await supabase
        .from('webhook_deliveries')
        .update({
          status: 'entregado',
          http_status: result.httpStatus,
          respuesta: result.respuesta,
          entregado_en: nowISO(),
        })
        .eq('id', delivery.id);

      if (updateError) {
        // El POST salio pero no pudimos marcarlo: el retry re-entregara (at-least-once).
        logger.error({ error: updateError, deliveryId: delivery.id }, '[WEBHOOK] Entregado pero no se pudo marcar');
      }
      return;
    }

    const esUltimoIntento = intentoActual >= WEBHOOK_MAX_INTENTOS;

    const { error: failError } = await supabase
      .from('webhook_deliveries')
      .update({
        http_status: result.httpStatus,
        respuesta: result.respuesta,
        ...(esUltimoIntento ? { status: 'fallido' } : {}),
      })
      .eq('id', delivery.id);

    if (failError) {
      logger.error({ error: failError, deliveryId: delivery.id }, '[WEBHOOK] Error registrando intento fallido');
    }

    logger.warn(
      {
        deliveryId: delivery.id,
        intento: intentoActual,
        httpStatus: result.httpStatus,
        definitivo: esUltimoIntento,
      },
      '[WEBHOOK] Intento de entrega fallido'
    );
  }

  private async sweepOldDeliveries(): Promise<void> {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase
      .from('webhook_deliveries')
      .delete()
      .neq('status', 'pendiente')
      .lt('created_at', cutoff);

    if (error) {
      logger.error({ error }, '[WEBHOOK] Error purgando deliveries viejas');
    }
  }

  start(): void {
    if (this.timer) return;

    this.timer = setInterval(() => {
      // Guard de reentrada: si un tick sigue corriendo (receptor lento), no apilar otro.
      if (this.running) return;
      this.running = true;

      void (async () => {
        try {
          await this.processPendingDeliveries();
          if (Date.now() - this.lastRetentionSweep > RETENTION_SWEEP_INTERVAL_MS) {
            this.lastRetentionSweep = Date.now();
            await this.sweepOldDeliveries();
          }
        } catch (err) {
          logger.error({ err }, '[WEBHOOK] Tick del dispatcher lanzo inesperadamente');
        } finally {
          this.running = false;
        }
      })();
    }, POLL_INTERVAL_MS);

    // unref: el loop no mantiene vivo el proceso durante el shutdown.
    this.timer.unref();
    logger.info({ pollMs: POLL_INTERVAL_MS }, '[WEBHOOK] Dispatcher iniciado');
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export const webhookDispatcher = new WebhookDispatcher();
