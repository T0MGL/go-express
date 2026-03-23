import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { dashboardKeys } from './use-envios';

interface DashboardStats {
  enviosHoy: number;
  enTransito: number;
  tasaEntrega: number;
  porCobrar: number;
  problemasHoy: number;
  enviosRecientes: Array<{
    id: string;
    trackingNumber: string;
    clienteNombre: string;
    destino: string;
    estado: string;
    fecha: string;
  }>;
}

export function useDashboardStats() {
  return useQuery({
    queryKey: dashboardKeys.stats(),
    queryFn: () => api.get<DashboardStats>('/admin/dashboard/stats'),
    
  });
}
