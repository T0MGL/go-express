import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

// Reporte COD operativo por repartidor. NO es la conciliacion financiera oficial
// (esa vive en liquidaciones_repartidor via use-liquidaciones.ts). El backend renombro
// el endpoint de /conciliacion a /reporte-cod con fix de TZ Asuncion. Mantenemos el
// nombre del hook useConciliacion para no romper llamadas existentes durante la
// transicion. La pagina visual ahora se llama ReporteCOD.

export interface ReporteCODEntrega {
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

export interface ReporteCODResponse {
  repartidor: { id: string; nombre: string };
  rango: { desde: string | null; hasta: string | null };
  totales: {
    entregas: number;
    zonas: number;
    totalCod: number;
    conIncidencia: number;
    tasaExito: number;
  };
  entregas: ReporteCODEntrega[];
}

// Legacy alias mantenido para componentes que aun lo usan (Conciliacion.tsx -> ReporteCOD.tsx).
export type ConciliacionEntrega = ReporteCODEntrega;
export type ConciliacionResponse = ReporteCODResponse;

export function useReporteCOD(repartidorId: string | undefined, desde?: string, hasta?: string) {
  return useQuery<ReporteCODResponse>({
    queryKey: ['admin', 'reporte-cod', repartidorId, desde ?? '', hasta ?? ''],
    queryFn: () => {
      const params = new URLSearchParams();
      if (desde) params.set('desde', desde);
      if (hasta) params.set('hasta', hasta);
      const qs = params.toString();
      return api.get<ReporteCODResponse>(
        `/admin/repartidores/${repartidorId}/reporte-cod${qs ? `?${qs}` : ''}`,
      );
    },
    enabled: !!repartidorId,
    staleTime: 60 * 1000,
  });
}

// Alias compat durante el refactor.
export const useConciliacion = useReporteCOD;
