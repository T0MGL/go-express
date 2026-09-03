import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { trackingKeys } from './use-envios';

// Matches the backend PublicTrackingResult (stripped-down, no PII)
export interface PublicTrackingEvent {
  estado: string;
  descripcion: string;
  ubicacion?: string;
  fecha: string;
}

export interface PublicTrackingResult {
  trackingNumber: string;
  estado: string;
  origen: string;
  destino: string;
  destinatarioCiudad: string;
  fecha: string;
  entregadoEn?: string;
  recibidoPor?: string;
  eventos: PublicTrackingEvent[];
}

// GE + 4 digitos de año + 6 de secuencia. La pantalla de rastreo usa el mismo
// numero para avisar por formato en vez de quedarse muda, asi el gate del request
// y el mensaje al comprador no pueden divergir.
export const MIN_TRACKING_LENGTH = 10;
export const TRACKING_FORMAT_HINT = 'GE2026XXXXXX';

export function useTracking(trackingNumber: string) {
  return useQuery<PublicTrackingResult>({
    queryKey: trackingKeys.detail(trackingNumber),
    queryFn: () => api.get<PublicTrackingResult>(`/public/tracking/${trackingNumber}`),
    enabled: !!trackingNumber && trackingNumber.length >= MIN_TRACKING_LENGTH,
  });
}
