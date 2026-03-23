import { supabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import { AppError } from '../middleware/errorHandler.js';
import type { EventoEnvioRow } from '../types/index.js';

// ---------------------------------------------------------------------------
// PublicTrackingResult — LIMITED data, no PII
// ---------------------------------------------------------------------------

export interface PublicTrackingResult {
  trackingNumber: string;
  estado: string;
  origen: string;
  destino: string;
  destinatarioCiudad: string;
  fecha: string;
  eventos: Array<{
    estado: string;
    descripcion: string;
    ubicacion?: string;
    fecha: string;
  }>;
}

// ---------------------------------------------------------------------------
// TrackingService — public tracking lookup
// ---------------------------------------------------------------------------

class TrackingService {
  /**
   * Look up an envio by tracking number and return LIMITED public data.
   * Does NOT include: destinatario name, address, phone, cedula, internal notes, payment info.
   */
  async getByTrackingNumber(trackingNumber: string): Promise<PublicTrackingResult | null> {
    // Fetch envio — only safe columns plus id (for eventos lookup)
    const { data: envioData, error: envioError } = await supabase
      .from('envios')
      .select('id, tracking_number, estado, origen, destino, destinatario_ciudad, fecha')
      .eq('tracking_number', trackingNumber)
      .single();

    if (envioError) {
      if (envioError.code === 'PGRST116') {
        // No rows returned
        return null;
      }
      logger.error({ error: envioError, trackingNumber }, 'Error fetching envio for tracking');
      throw new AppError('Error fetching tracking data', 500, 'DB_ERROR');
    }

    if (!envioData) return null;

    const envio = envioData as {
      id: string;
      tracking_number: string;
      estado: string;
      origen: string;
      destino: string;
      destinatario_ciudad: string;
      fecha: string;
    };

    // Fetch eventos using envio.id
    let eventos: PublicTrackingResult['eventos'] = [];

    const { data: eventosRows, error: evtError } = await supabase
      .from('eventos_envio')
      .select('estado, descripcion, ubicacion, created_at')
      .eq('envio_id', envio.id)
      .order('created_at', { ascending: false });

    if (evtError) {
      logger.error({ error: evtError, trackingNumber }, 'Error fetching eventos for tracking');
      // Don't throw — return envio without eventos
    } else if (eventosRows) {
      eventos = (eventosRows as Array<Pick<EventoEnvioRow, 'estado' | 'descripcion' | 'ubicacion' | 'created_at'>>).map((e) => ({
        estado: e.estado,
        descripcion: e.descripcion,
        ...(e.ubicacion ? { ubicacion: e.ubicacion } : {}),
        fecha: e.created_at,
      }));
    }

    return {
      trackingNumber: envio.tracking_number,
      estado: envio.estado,
      origen: envio.origen,
      destino: envio.destino,
      destinatarioCiudad: envio.destinatario_ciudad,
      fecha: envio.fecha,
      eventos,
    };
  }
}

export const trackingService = new TrackingService();
