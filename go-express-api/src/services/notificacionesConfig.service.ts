import { supabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import {
  parseNotificacionesConfig,
  NOTIFICACIONES_DEFAULTS,
  type NotificacionesConfig,
  type NotificacionesConfigKey,
} from '../lib/notificaciones.js';

// Cache en memoria con TTL corto: email dispatch se ejecuta sincronicamente
// en cada cambio de estado. Evita golpear la DB por cada envio que transiciona.
// El admin ve los cambios reflejados en <= 30s, aceptable para un toggle de config.
const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  config: NotificacionesConfig;
  expiresAt: number;
}

class NotificacionesConfigService {
  private cache: CacheEntry | null = null;

  /**
   * Fuerza invalidacion del cache. Llamado por el PUT /admin/configuracion/notificaciones
   * para que el proximo email dispatch vea el valor actualizado sin esperar al TTL.
   */
  invalidate(): void {
    this.cache = null;
  }

  async get(): Promise<NotificacionesConfig> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) {
      return this.cache.config;
    }

    const { data, error } = await supabase
      .from('configuracion')
      .select('value')
      .eq('key', 'notificaciones_config')
      .maybeSingle();

    if (error) {
      logger.error({ err: error }, '[NOTIF_CONFIG] Failed to load, falling back to defaults');
      return { ...NOTIFICACIONES_DEFAULTS };
    }

    const raw = data ? (data as { value: unknown }).value : null;
    const config = parseNotificacionesConfig(raw);

    this.cache = { config, expiresAt: now + CACHE_TTL_MS };
    return config;
  }

  async isEnabled(key: NotificacionesConfigKey): Promise<boolean> {
    const cfg = await this.get();
    return cfg[key];
  }
}

export const notificacionesConfigService = new NotificacionesConfigService();
