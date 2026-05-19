/**
 * Notificaciones por email: config de toggles por evento.
 * Unica fuente de verdad server-side. triggerNotification en envio.service.ts
 * consulta esta config y saltea el email cuando el flag esta en false.
 *
 * Los flags se alinean con los estados del state machine que producen una notificacion
 * relevante para el destinatario. El estado `pendiente` se controla via `envio_creado`
 * (no tiene sentido un toggle separado: pendiente es el estado inicial al crear).
 */

export interface NotificacionesConfig {
  envio_creado: boolean;
  recolectado: boolean;
  en_transito: boolean;
  en_deposito: boolean;
  en_reparto: boolean;
  entregado: boolean;
  fallido: boolean;
  problema: boolean;
}

export type NotificacionesConfigKey = keyof NotificacionesConfig;

export const NOTIFICACIONES_KEYS: readonly NotificacionesConfigKey[] = [
  'envio_creado',
  'recolectado',
  'en_transito',
  'en_deposito',
  'en_reparto',
  'entregado',
  'fallido',
  'problema',
];

export const NOTIFICACIONES_DEFAULTS: NotificacionesConfig = {
  envio_creado: true,
  recolectado: true,
  en_transito: true,
  en_deposito: true,
  en_reparto: true,
  entregado: true,
  fallido: true,
  problema: true,
};

export function parseNotificacionesConfig(raw: unknown): NotificacionesConfig {
  if (!raw || typeof raw !== 'object') return { ...NOTIFICACIONES_DEFAULTS };
  const obj = raw as Record<string, unknown>;
  const coerce = (key: NotificacionesConfigKey): boolean => {
    const v = obj[key];
    if (typeof v === 'boolean') return v;
    if (v === 'true') return true;
    if (v === 'false') return false;
    return NOTIFICACIONES_DEFAULTS[key];
  };
  return {
    envio_creado: coerce('envio_creado'),
    recolectado: coerce('recolectado'),
    en_transito: coerce('en_transito'),
    en_deposito: coerce('en_deposito'),
    en_reparto: coerce('en_reparto'),
    entregado: coerce('entregado'),
    fallido: coerce('fallido'),
    problema: coerce('problema'),
  };
}

export function validateNotificacionesConfigInput(input: unknown): NotificacionesConfig {
  if (!input || typeof input !== 'object') {
    throw new Error('notificaciones_config debe ser un objeto JSON');
  }
  const obj = input as Record<string, unknown>;
  const result: Partial<NotificacionesConfig> = {};
  for (const key of NOTIFICACIONES_KEYS) {
    const v = obj[key];
    if (typeof v !== 'boolean') {
      throw new Error(`${key} debe ser booleano`);
    }
    result[key] = v;
  }
  return result as NotificacionesConfig;
}
