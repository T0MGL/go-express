import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

const clienteDashboardKeys = {
  all: ['cliente-dashboard'] as const,
  stats: () => [...clienteDashboardKeys.all, 'stats'] as const,
};

export interface ClienteDashboardStats {
  activos: number;
  entregados: number;
  pendientes: number;
  problemas: number;
  totalEnvios: number;
  enviosRecientes: Array<{
    id: string;
    trackingNumber: string;
    clienteId: string;
    clienteNombre: string;
    codigoReferencia: string | null;
    origen: string;
    destino: string;
    destinatarioNombre: string;
    destinatarioCiudad: string;
    destinatarioDepartamento: string;
    estado: string;
    costo: number;
    montoACobrar: number;
    tipoPago: string;
    fecha: string;
    creadoEn: string;
  }>;
}

export function useClienteDashboardStats() {
  return useQuery<ClienteDashboardStats>({
    queryKey: clienteDashboardKeys.stats(),
    queryFn: () => api.get<ClienteDashboardStats>('/cliente/dashboard/stats'),
  });
}
