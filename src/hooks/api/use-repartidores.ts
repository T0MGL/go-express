import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { buildQueryString } from './helpers';
import { repartidorKeys } from './use-envios';
import type { Repartidor, Envio } from '@/data/types';

interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export function useRepartidores(
  filters?: Record<string, string | number | boolean | undefined>,
) {
  return useQuery({
    queryKey: repartidorKeys.list(filters ?? {}),
    queryFn: () =>
      api.get<PaginatedResponse<Repartidor>>(
        '/admin/repartidores' + buildQueryString(filters),
      ),
    
  });
}

export function useRepartidor(id: string | undefined) {
  return useQuery({
    queryKey: repartidorKeys.detail(id ?? ''),
    queryFn: () => api.get<Repartidor>(`/admin/repartidores/${id}`),
    enabled: !!id,
  });
}

export function useCreateRepartidor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Repartidor>('/admin/repartidores', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: repartidorKeys.all });
    },
  });
}

export function useUpdateRepartidor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      api.put<Repartidor>(`/admin/repartidores/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: repartidorKeys.all });
    },
  });
}

export function useToggleRepartidorEstado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.patch<Repartidor>(`/admin/repartidores/${id}/estado`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: repartidorKeys.all });
    },
  });
}

export function useRepartidorEnvios(id: string | undefined) {
  return useQuery({
    queryKey: [...repartidorKeys.detail(id ?? ''), 'envios'] as const,
    queryFn: () => api.get<Envio[]>(`/admin/repartidores/${id}/envios`),
    enabled: !!id,
  });
}
