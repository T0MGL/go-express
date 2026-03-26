import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { buildQueryString } from './helpers';
import type { Envio } from '@/data/types';


export const envioKeys = {
  all: ['envios'] as const,
  lists: () => [...envioKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) =>
    [...envioKeys.lists(), filters] as const,
  details: () => [...envioKeys.all, 'detail'] as const,
  detail: (id: string) => [...envioKeys.details(), id] as const,
};

export const clienteKeys = {
  all: ['clientes'] as const,
  lists: () => [...clienteKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) =>
    [...clienteKeys.lists(), filters] as const,
  details: () => [...clienteKeys.all, 'detail'] as const,
  detail: (id: string) => [...clienteKeys.details(), id] as const,
};

export const repartidorKeys = {
  all: ['repartidores'] as const,
  lists: () => [...repartidorKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) =>
    [...repartidorKeys.lists(), filters] as const,
  details: () => [...repartidorKeys.all, 'detail'] as const,
  detail: (id: string) => [...repartidorKeys.details(), id] as const,
};

export const tarifaKeys = {
  all: ['tarifas'] as const,
  lists: () => [...tarifaKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) =>
    [...tarifaKeys.lists(), filters] as const,
};

export const auditoriaKeys = {
  all: ['auditoria'] as const,
  lists: () => [...auditoriaKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) =>
    [...auditoriaKeys.lists(), filters] as const,
};

export const trackingKeys = {
  all: ['tracking'] as const,
  detail: (trackingNumber: string) =>
    [...trackingKeys.all, trackingNumber] as const,
};

export const dashboardKeys = {
  all: ['dashboard'] as const,
  stats: () => [...dashboardKeys.all, 'stats'] as const,
};

export const pagoKeys = {
  all: ['pagos'] as const,
  lists: () => [...pagoKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) =>
    [...pagoKeys.lists(), filters] as const,
  stats: () => [...pagoKeys.all, 'stats'] as const,
};

export const warehouseKeys = {
  all: ['warehouse'] as const,
  inventario: () => [...warehouseKeys.all, 'inventario'] as const,
  inventarioList: (filters: Record<string, unknown>) =>
    [...warehouseKeys.inventario(), filters] as const,
  picking: () => [...warehouseKeys.all, 'picking'] as const,
  stats: () => [...warehouseKeys.all, 'stats'] as const,
};

export const usuarioKeys = {
  all: ['usuarios'] as const,
  lists: () => [...usuarioKeys.all, 'list'] as const,
};

export const configuracionKeys = {
  all: ['configuracion'] as const,
};


interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export function useEnvios(
  filters?: Record<string, string | number | boolean | undefined>,
) {
  return useQuery({
    queryKey: envioKeys.list(filters ?? {}),
    queryFn: () =>
      api.get<PaginatedResponse<Envio>>(
        '/admin/envios' + buildQueryString(filters),
      ),
    
  });
}

export function useEnvio(id: string | undefined) {
  return useQuery({
    queryKey: envioKeys.detail(id ?? ''),
    queryFn: () => api.get<Envio>(`/admin/envios/${id}`),
    enabled: !!id,
  });
}

export function useCreateEnvio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Envio>('/admin/envios', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: envioKeys.all });
      qc.invalidateQueries({ queryKey: dashboardKeys.all });
    },
  });
}

export function useUpdateEnvioEstado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      estado,
      descripcion,
      ubicacion,
    }: {
      id: string;
      estado: string;
      descripcion: string;
      ubicacion?: string;
    }) => api.patch<Envio>(`/admin/envios/${id}/estado`, { estado, descripcion, ubicacion }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: envioKeys.all });
      qc.invalidateQueries({ queryKey: dashboardKeys.all });
      qc.refetchQueries({ queryKey: envioKeys.detail(vars.id) });
    },
  });
}

export function useAsignarRepartidor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      repartidorId,
    }: {
      id: string;
      repartidorId: string;
    }) => api.patch<Envio>(`/admin/envios/${id}/repartidor`, { repartidorId }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: envioKeys.all });
      qc.refetchQueries({ queryKey: envioKeys.detail(vars.id) });
    },
  });
}

export function useReportarProblema() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      descripcion,
    }: {
      id: string;
      descripcion: string;
    }) => api.patch<Envio>(`/admin/envios/${id}/problema`, { descripcion }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: envioKeys.all });
      qc.invalidateQueries({ queryKey: dashboardKeys.all });
    },
  });
}

export function useAgregarNota() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, texto }: { id: string; texto: string }) =>
      api.post(`/admin/envios/${id}/notas`, { texto }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: envioKeys.detail(vars.id) });
    },
  });
}
