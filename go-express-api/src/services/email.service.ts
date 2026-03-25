import { logger } from '../config/logger.js';
import type { Envio } from '../types/index.js';

// TODO: Replace with Resend when API key available
// TODO: Add WhatsApp notification hook here

// STUB: logs to console until Resend integration is ready

class EmailService {
  /**
   * Send notification when a new envio is created.
   * Fire-and-forget: never throws.
   */
  async sendEnvioCreado(envio: Envio): Promise<void> {
    try {
      logger.info(
        `[EMAIL STUB] Would send "envio_creado" for tracking: ${envio.trackingNumber}`
      );
      // TODO: Replace with Resend when API key available
      // const { data, error } = await resend.emails.send({
      //   from: env.EMAIL_FROM,
      //   to: destinatarioEmail,
      //   subject: `Tu envío ${envio.trackingNumber} ha sido creado`,
      //   html: renderEnvioCreadoTemplate(envio),
      // });
    } catch (err) {
      logger.error({ err, trackingNumber: envio.trackingNumber }, '[EMAIL STUB] Error in sendEnvioCreado');
    }
  }

  /**
   * Send notification when envio status changes.
   * Fire-and-forget: never throws.
   */
  async sendCambioEstado(envio: Envio, previousEstado: string): Promise<void> {
    try {
      logger.info(
        `[EMAIL STUB] Would send "cambio_estado" for tracking: ${envio.trackingNumber}, ${previousEstado} → ${envio.estado}`
      );
      // TODO: Replace with Resend when API key available
      // TODO: Add WhatsApp notification hook here
    } catch (err) {
      logger.error({ err, trackingNumber: envio.trackingNumber }, '[EMAIL STUB] Error in sendCambioEstado');
    }
  }

  /**
   * Send notification when envio is delivered.
   * Fire-and-forget: never throws.
   */
  async sendEntregado(envio: Envio): Promise<void> {
    try {
      logger.info(
        `[EMAIL STUB] Would send "entregado" for tracking: ${envio.trackingNumber}`
      );
      // TODO: Replace with Resend when API key available
      // TODO: Add WhatsApp notification hook here
    } catch (err) {
      logger.error({ err, trackingNumber: envio.trackingNumber }, '[EMAIL STUB] Error in sendEntregado');
    }
  }

  /**
   * Send notification when envio has a problem.
   * Fire-and-forget: never throws.
   */
  async sendProblema(envio: Envio): Promise<void> {
    try {
      logger.info(
        `[EMAIL STUB] Would send "problema" for tracking: ${envio.trackingNumber}`
      );
      // TODO: Replace with Resend when API key available
      // TODO: Add WhatsApp notification hook here
    } catch (err) {
      logger.error({ err, trackingNumber: envio.trackingNumber }, '[EMAIL STUB] Error in sendProblema');
    }
  }
}

export const emailService = new EmailService();
