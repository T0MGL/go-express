import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { buildQueryString } from './helpers';
import { pagoKeys, envioKeys } from './use-envios';

interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

interface PagoItem {
  id: string;
  envioId: string;
  trackingNumber?: string;
  clienteNombre?: string;
  montoTotal: number;
  montoRecibido: number;
  metodoPago: string;
  estadoPago: string;
  fechaPago?: string | null;
  referencia?: string | null;
  notas?: string | null;
  creadoPor: string;
  creadoEn: string;
  updatedAt: string;
  costo?: number;
}

interface PagoStats {
  totalCobrado: number;
  totalPendiente: number;
  cobradoHoy: number;
  enviosPendientesCobro?: number;
}

export function usePagos(
  filters?: Record<string, string | number | boolean | undefined>,
) {
  return useQuery({
    queryKey: pagoKeys.list(filters ?? {}),
    queryFn: () =>
      api.get<PaginatedResponse<PagoItem>>(
        '/admin/pagos' + buildQueryString(filters),
      ),
    placeholderData: keepPreviousData,
  });
}

export function usePagoStats() {
  return useQuery({
    queryKey: pagoKeys.stats(),
    queryFn: () => api.get<PagoStats>('/admin/pagos/stats'),
    staleTime: 2 * 60 * 1000,
  });
}

export function useCreatePago() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post('/admin/pagos', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pagoKeys.all });
      qc.invalidateQueries({ queryKey: envioKeys.all });
    },
  });
}

export function useUpdatePago() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      api.patch(`/admin/pagos/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pagoKeys.all });
      qc.invalidateQueries({ queryKey: envioKeys.all });
    },
  });
}
