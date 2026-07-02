import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { buildQueryString } from './helpers';

export type EstadoLiquidacion = 'pendiente' | 'cerrada' | 'con_diferencia';

export interface LiquidacionRepartidor {
  id: string;
  repartidorId: string;
  repartidorNombre?: string;
  fechaDesde: string;
  fechaHasta: string;
  montoTotalEsperado: number;
  montoTotalRecibido: number | null;
  diferencia: number;
  estado: EstadoLiquidacion;
  cerradaPor: string | null;
  cerradaEn: string | null;
  notas: string | null;
  creadoPor: string;
  creadoEn: string;
  updatedAt: string;
  tarifaRetenida: number | null;
  payoutTienda: number | null;
  cantidadEnvios?: number;
}

export type TipoAjusteLiquidacion = 'cobranza_repartidor' | 'sobrante_a_investigar';

// Asiento contable del cierre con diferencia (M2): cobranza_repartidor = faltante que el
// repartidor debe; sobrante_a_investigar = efectivo excedente sin duenio conocido.
export interface LiquidacionAjuste {
  id: string;
  liquidacionId: string;
  tipo: TipoAjusteLiquidacion;
  monto: number;
  motivo: string;
  creadoPor: string;
  creadoEn: string;
}

export interface LiquidacionEnvioItem {
  liquidacionId: string;
  envioId: string;
  montoEsperado: number;
  montoCobrado: number;
  conciliado: boolean;
  creadoEn: string;
  trackingNumber?: string;
  clienteNombre?: string;
  destinatarioNombre?: string;
  fechaEntregaReal?: string | null;
}

export interface LiquidacionDetalle extends LiquidacionRepartidor {
  envios: LiquidacionEnvioItem[];
  ajustes: LiquidacionAjuste[];
}

interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export const liquidacionKeys = {
  all: ['liquidaciones'] as const,
  lists: () => [...liquidacionKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...liquidacionKeys.lists(), filters] as const,
  details: () => [...liquidacionKeys.all, 'detail'] as const,
  detail: (id: string) => [...liquidacionKeys.details(), id] as const,
};

export function useLiquidaciones(
  filters?: Record<string, string | number | boolean | undefined>,
) {
  return useQuery({
    queryKey: liquidacionKeys.list(filters ?? {}),
    queryFn: () =>
      api.get<PaginatedResponse<LiquidacionRepartidor>>(
        '/admin/liquidaciones' + buildQueryString(filters),
      ),
    staleTime: 30 * 1000,
    placeholderData: keepPreviousData,
  });
}

export function useLiquidacion(id: string | undefined) {
  return useQuery({
    queryKey: liquidacionKeys.detail(id ?? ''),
    queryFn: () => api.get<LiquidacionDetalle>(`/admin/liquidaciones/${id}`),
    enabled: !!id,
    staleTime: 30 * 1000,
  });
}

export interface CrearLiquidacionPayload {
  repartidorId: string;
  fechaDesde: string;
  fechaHasta: string;
}

export function useCrearLiquidacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CrearLiquidacionPayload) =>
      api.post<LiquidacionRepartidor>('/admin/liquidaciones', payload),
    onSuccess: (created) => {
      qc.setQueryData(liquidacionKeys.detail(created.id), { ...created, envios: [], ajustes: [] });
      qc.invalidateQueries({ queryKey: liquidacionKeys.lists() });
    },
  });
}

export interface CerrarLiquidacionPayload {
  id: string;
  montoRecibido: number;
  notas?: string | undefined;
}

export function useCerrarLiquidacion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: CerrarLiquidacionPayload) =>
      api.patch<LiquidacionRepartidor>(`/admin/liquidaciones/${id}/cerrar`, body),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: liquidacionKeys.detail(updated.id) });
      qc.invalidateQueries({ queryKey: liquidacionKeys.lists() });
      qc.invalidateQueries({ queryKey: ['envios'] });
    },
  });
}
