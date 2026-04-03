import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { buildQueryString } from './helpers';
import type { Envio } from '@/data/types';

const clienteEnvioKeys = {
  all: ['cliente-envios'] as const,
  lists: () => [...clienteEnvioKeys.all, 'list'] as const,
  list: (filters?: Record<string, unknown>) => [...clienteEnvioKeys.lists(), filters] as const,
  detail: (id: string) => [...clienteEnvioKeys.all, 'detail', id] as const,
};

interface ClienteEnviosListResponse {
  data: Envio[];
  pagination: { total: number; limit: number; hasMore: boolean; nextCursor?: string };
}

export interface ClienteEnviosFilters {
  estado?: string;
  search?: string;
  limit?: number;
  cursor?: string;
}

export function useClienteEnvios(filters?: ClienteEnviosFilters) {
  const queryParams = filters ? {
    estado: filters.estado && filters.estado !== 'todos' ? filters.estado : undefined,
    search: filters.search || undefined,
    limit: filters.limit ? String(filters.limit) : undefined,
    cursor: filters.cursor || undefined,
  } : undefined;

  return useQuery<ClienteEnviosListResponse>({
    queryKey: clienteEnvioKeys.list(filters as Record<string, unknown> | undefined),
    queryFn: () => api.get<ClienteEnviosListResponse>(`/cliente/envios${buildQueryString(queryParams as Record<string, string | number | boolean | undefined>)}`),
    placeholderData: keepPreviousData,
  });
}

export function useClienteEnvio(id: string) {
  return useQuery<Envio>({
    queryKey: clienteEnvioKeys.detail(id),
    queryFn: () => api.get<Envio>(`/cliente/envios/${id}`),
    enabled: !!id,
  });
}

export function useClienteCreateEnvio() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post<Envio>('/cliente/envios', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clienteEnvioKeys.all });
    },
  });
}

export interface BulkImportEnvio {
  clienteId: string;
  origen: string;
  destino: string;
  destinatarioNombre: string;
  destinatarioDireccion: string;
  destinatarioTelefono: string;
  destinatarioTelefono2?: string;
  destinatarioCedula?: string;
  destinatarioCiudad: string;
  destinatarioDepartamento?: string;
  destinatarioBarrio?: string;
  destinatarioReferencia?: string;
  destinatarioUbicacionUrl?: string;
  codigoReferencia?: string;
  cantidad?: number;
  producto?: string;
  peso: number;
  dimensiones?: {
    largo: number;
    ancho: number;
    alto: number;
  };
  fragil?: boolean;
  valorDeclarado?: number;
  instruccionesEntrega?: string;
  horarioEntrega?: string;
  notas?: string;
  costo: number;
  montoACobrar: number;
  tipoPago: 'anticipado' | 'contra_entrega' | 'cuenta_corriente';
  tags?: string[];
  tarifaId?: string;
}

interface BulkImportResponse {
  imported: number;
  failed: number;
  results: Array<{ trackingNumber: string; id: string }>;
  errors?: Array<{ index: number; error: string }>;
}

export function useClienteBulkImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (envios: BulkImportEnvio[]) =>
      api.post<BulkImportResponse>('/cliente/envios/bulk-import', { envios }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clienteEnvioKeys.all });
    },
  });
}
