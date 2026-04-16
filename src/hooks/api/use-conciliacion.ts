import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface ConciliacionEntrega {
  id: string;
  trackingNumber: string;
  clienteNombre: string;
  destinatarioNombre: string;
  destinatarioCiudad: string;
  fechaEntregaReal: string | null;
  entregadoPorNombre: string | null;
  montoCobrado: number | null;
  montoACobrar: number | null;
  tipoPago: string;
  tieneIncidencia: boolean;
  incidenciaNota: string | null;
}

export interface ConciliacionResponse {
  repartidor: { id: string; nombre: string };
  rango: { desde: string | null; hasta: string | null };
  totales: {
    entregas: number;
    zonas: number;
    totalCod: number;
    conIncidencia: number;
    tasaExito: number;
  };
  entregas: ConciliacionEntrega[];
}

export function useConciliacion(repartidorId: string | undefined, desde?: string, hasta?: string) {
  return useQuery<ConciliacionResponse>({
    queryKey: ['admin', 'conciliacion', repartidorId, desde ?? '', hasta ?? ''],
    queryFn: () => {
      const params = new URLSearchParams();
      if (desde) params.set('desde', desde);
      if (hasta) params.set('hasta', hasta);
      const qs = params.toString();
      return api.get<ConciliacionResponse>(
        `/admin/repartidores/${repartidorId}/conciliacion${qs ? `?${qs}` : ''}`,
      );
    },
    enabled: !!repartidorId,
    staleTime: 60 * 1000,
  });
}
