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
  eventos: PublicTrackingEvent[];
}

export function useTracking(trackingNumber: string) {
  return useQuery<PublicTrackingResult>({
    queryKey: trackingKeys.detail(trackingNumber),
    queryFn: () => api.get<PublicTrackingResult>(`/public/tracking/${trackingNumber}`),
    enabled: !!trackingNumber && trackingNumber.length >= 10,
  });
}
