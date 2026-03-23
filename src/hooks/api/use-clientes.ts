import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { buildQueryString } from './helpers';
import { clienteKeys } from './use-envios';
import type { Cliente } from '@/data/types';

interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export function useClientes(
  filters?: Record<string, string | number | boolean | undefined>,
) {
  return useQuery({
    queryKey: clienteKeys.list(filters ?? {}),
    queryFn: () =>
      api.get<PaginatedResponse<Cliente>>(
        '/admin/clientes' + buildQueryString(filters),
      ),

  });
}

export function useCliente(id: string | undefined) {
  return useQuery({
    queryKey: clienteKeys.detail(id ?? ''),
    queryFn: () => api.get<Cliente>(`/admin/clientes/${id}`),
    enabled: !!id,
  });
}

export function useCreateCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Cliente>('/admin/clientes', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: clienteKeys.all });
    },
  });
}

export function useUpdateCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      api.put<Cliente>(`/admin/clientes/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: clienteKeys.all });
    },
  });
}

export function useUpdateClienteEstado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      estado,
      motivo,
    }: {
      id: string;
      estado: string;
      motivo?: string;
    }) => api.patch<Cliente>(`/admin/clientes/${id}/estado`, { estado, motivo }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: clienteKeys.all });
    },
  });
}

export function useDeleteCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) =>
      api.delete<void>(`/admin/clientes/${id}`, { motivo }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: clienteKeys.all });
    },
  });
}

// ---------------------------------------------------------------------------
// Portal management hooks (admin actions)
// ---------------------------------------------------------------------------

export function useInviteCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<Cliente>(`/admin/clientes/${id}/invite`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: clienteKeys.all });
    },
  });
}

export function useReinviteCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<Cliente>(`/admin/clientes/${id}/reinvite`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: clienteKeys.all });
    },
  });
}

export function useResetClientePassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ message: string }>(`/admin/clientes/${id}/reset-password`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: clienteKeys.all });
    },
  });
}
