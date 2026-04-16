import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
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
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
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
    onSuccess: (newCliente) => {
      qc.setQueryData(clienteKeys.detail(newCliente.id), newCliente);
      qc.invalidateQueries({ queryKey: clienteKeys.lists() });
    },
  });
}

export function useUpdateCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      api.put<Cliente>(`/admin/clientes/${id}`, body),
    onSuccess: (updated, vars) => {
      qc.setQueryData(clienteKeys.detail(vars.id), updated);
      qc.setQueriesData<PaginatedResponse<Cliente>>(
        { queryKey: clienteKeys.lists() },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            data: old.data.map((c) => (c.id === vars.id ? updated : c)),
          };
        },
      );
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
    onSuccess: (updated, vars) => {
      qc.setQueryData(clienteKeys.detail(vars.id), updated);
      qc.setQueriesData<PaginatedResponse<Cliente>>(
        { queryKey: clienteKeys.lists() },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            data: old.data.map((c) => (c.id === vars.id ? updated : c)),
          };
        },
      );
    },
  });
}

export function useDeleteCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) =>
      api.delete<void>(`/admin/clientes/${id}`, { motivo }),
    onSuccess: (_data, vars) => {
      qc.removeQueries({ queryKey: clienteKeys.detail(vars.id) });
      qc.invalidateQueries({ queryKey: clienteKeys.lists() });
    },
  });
}

interface InviteClienteResult {
  cliente: Cliente;
  tempPassword: string;
}

export function useInviteCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<InviteClienteResult>(`/admin/clientes/${id}/invite`, {}),
    onSuccess: ({ cliente }, id) => {
      qc.setQueryData(clienteKeys.detail(id), cliente);
      qc.setQueriesData<PaginatedResponse<Cliente>>(
        { queryKey: clienteKeys.lists() },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            data: old.data.map((c) => (c.id === id ? cliente : c)),
          };
        },
      );
    },
  });
}

export function useReinviteCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<InviteClienteResult>(`/admin/clientes/${id}/reinvite`, {}),
    onSuccess: ({ cliente }, id) => {
      qc.setQueryData(clienteKeys.detail(id), cliente);
      qc.setQueriesData<PaginatedResponse<Cliente>>(
        { queryKey: clienteKeys.lists() },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            data: old.data.map((c) => (c.id === id ? cliente : c)),
          };
        },
      );
    },
  });
}

export function useResetClientePassword() {
  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ message: string }>(`/admin/clientes/${id}/reset-password`, {}),
  });
}
