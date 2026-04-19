import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type TipoMovimientoCc = 'debito' | 'credito' | 'ajuste' | 'nota_credito' | 'reverso';

export interface MovimientoCc {
  id: string;
  clienteId: string;
  envioId: string | null;
  pagoId: string | null;
  tipo: TipoMovimientoCc;
  monto: number;
  saldoPosterior: number;
  descripcion: string;
  creadoPor: string;
  ipAddress: string | null;
  userAgent: string | null;
  creadoEn: string;
}

export interface SaldoCuentaCorriente {
  saldo: number;
  limiteCredito: number;
  disponible: number | null;
  ultimaActualizacion: string | null;
}

export interface MovimientosFilters {
  page?: number;
  limit?: number;
  tipo?: TipoMovimientoCc;
  envioId?: string;
  fechaDesde?: string;
  fechaHasta?: string;
}

export interface PaginatedMovimientos {
  data: MovimientoCc[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
}

const ccKeys = {
  all: ['cuenta-corriente'] as const,
  saldo: () => [...ccKeys.all, 'saldo'] as const,
  movimientos: (filters: MovimientosFilters) =>
    [...ccKeys.all, 'movimientos', filters] as const,
};

function buildQueryString(filters: MovimientosFilters): string {
  const params = new URLSearchParams();
  if (filters.page !== undefined) params.set('page', filters.page.toString());
  if (filters.limit !== undefined) params.set('limit', filters.limit.toString());
  if (filters.tipo) params.set('tipo', filters.tipo);
  if (filters.envioId) params.set('envioId', filters.envioId);
  if (filters.fechaDesde) params.set('fechaDesde', filters.fechaDesde);
  if (filters.fechaHasta) params.set('fechaHasta', filters.fechaHasta);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

// ---------------------------------------------------------------------------
// Cliente portal (lo que ve el cliente loggeado)
// ---------------------------------------------------------------------------

export function useSaldoCliente() {
  return useQuery<SaldoCuentaCorriente>({
    queryKey: ccKeys.saldo(),
    queryFn: () => api.get<SaldoCuentaCorriente>('/cliente/cuenta-corriente/saldo'),
    staleTime: 60 * 1000,
  });
}

export function useMovimientosCliente(filters: MovimientosFilters = {}) {
  return useQuery<PaginatedMovimientos>({
    queryKey: ccKeys.movimientos(filters),
    queryFn: () =>
      api.get<PaginatedMovimientos>(
        `/cliente/cuenta-corriente/movimientos${buildQueryString(filters)}`
      ),
    staleTime: 30 * 1000,
    placeholderData: keepPreviousData,
  });
}

// ---------------------------------------------------------------------------
// Admin (pantalla de detalle de cliente)
// ---------------------------------------------------------------------------

const adminKeys = {
  all: ['admin', 'cuenta-corriente'] as const,
  saldo: (clienteId: string) => [...adminKeys.all, 'saldo', clienteId] as const,
  movimientos: (clienteId: string, filters: MovimientosFilters) =>
    [...adminKeys.all, 'movimientos', clienteId, filters] as const,
};

export function useSaldoAdmin(clienteId: string | undefined) {
  return useQuery<SaldoCuentaCorriente>({
    queryKey: adminKeys.saldo(clienteId ?? ''),
    queryFn: () => api.get<SaldoCuentaCorriente>(`/admin/clientes/${clienteId}/saldo`),
    enabled: !!clienteId,
    staleTime: 30 * 1000,
  });
}

export function useMovimientosAdmin(clienteId: string | undefined, filters: MovimientosFilters = {}) {
  return useQuery<PaginatedMovimientos>({
    queryKey: adminKeys.movimientos(clienteId ?? '', filters),
    queryFn: () =>
      api.get<PaginatedMovimientos>(
        `/admin/clientes/${clienteId}/movimientos${buildQueryString(filters)}`
      ),
    enabled: !!clienteId,
    staleTime: 15 * 1000,
    placeholderData: keepPreviousData,
  });
}

export interface CrearAjusteInput {
  monto: number;
  descripcion: string;
  envioId?: string;
}

export function useCrearAjuste(clienteId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CrearAjusteInput) =>
      api.post<MovimientoCc>(`/admin/clientes/${clienteId}/ajuste`, input),
    onSuccess: () => {
      if (!clienteId) return;
      queryClient.invalidateQueries({ queryKey: adminKeys.saldo(clienteId) });
      queryClient.invalidateQueries({ queryKey: [...adminKeys.all, 'movimientos', clienteId] });
    },
  });
}

export interface CrearNotaCreditoInput {
  monto: number;
  descripcion: string;
  envioId?: string;
}

export function useCrearNotaCredito(clienteId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CrearNotaCreditoInput) =>
      api.post<MovimientoCc>(`/admin/clientes/${clienteId}/nota-credito`, input),
    onSuccess: () => {
      if (!clienteId) return;
      queryClient.invalidateQueries({ queryKey: adminKeys.saldo(clienteId) });
      queryClient.invalidateQueries({ queryKey: [...adminKeys.all, 'movimientos', clienteId] });
    },
  });
}

export interface UpdateLimiteCreditoInput {
  limiteCredito: number;
  motivo: string;
}

export function useUpdateLimiteCredito(clienteId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateLimiteCreditoInput) =>
      api.put<{ limiteCredito: number; limiteAnterior: number }>(
        `/admin/clientes/${clienteId}/limite-credito`,
        input
      ),
    onSuccess: () => {
      if (!clienteId) return;
      queryClient.invalidateQueries({ queryKey: adminKeys.saldo(clienteId) });
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
    },
  });
}
