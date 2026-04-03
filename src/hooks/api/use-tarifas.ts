import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { buildQueryString } from './helpers';
import { tarifaKeys } from './use-envios';
import type { Tarifa } from '@/data/types';

interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export function useTarifas(
  filters?: Record<string, string | number | boolean | undefined>,
) {
  return useQuery({
    queryKey: tarifaKeys.list(filters ?? {}),
    queryFn: () =>
      api.get<PaginatedResponse<Tarifa>>(
        '/admin/tarifas' + buildQueryString(filters),
      ),
    placeholderData: keepPreviousData,
    staleTime: 10 * 60 * 1000,
  });
}

export function useCreateTarifa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Tarifa>('/admin/tarifas', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tarifaKeys.all });
    },
  });
}

export function useUpdateTarifa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      api.put<Tarifa>(`/admin/tarifas/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tarifaKeys.all });
    },
  });
}

export function useDeleteTarifa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) =>
      api.delete<void>(`/admin/tarifas/${id}`, { motivo }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tarifaKeys.all });
    },
  });
}

export function useRestoreTarifa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.patch<Tarifa>(`/admin/tarifas/${id}/restore`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tarifaKeys.all });
    },
  });
}
