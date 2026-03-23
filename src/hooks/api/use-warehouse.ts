import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { buildQueryString } from './helpers';
import { warehouseKeys } from './use-envios';
import type { PaqueteInventario, PickingItem } from '@/data/types';

interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

interface WarehouseStats {
  total: number;
  ingresosHoy: number;
  enAlmacen: number;
  listos: number;
}

export function useInventario(
  filters?: Record<string, string | number | boolean | undefined>,
) {
  return useQuery({
    queryKey: warehouseKeys.inventarioList(filters ?? {}),
    queryFn: () =>
      api.get<PaginatedResponse<PaqueteInventario>>(
        '/admin/warehouse/inventario' + buildQueryString(filters),
      ),
    
  });
}

export function usePickingList() {
  return useQuery({
    queryKey: warehouseKeys.picking(),
    queryFn: () => api.get<PickingItem[]>('/admin/warehouse/picking'),
    
  });
}

export function useWarehouseStats() {
  return useQuery({
    queryKey: warehouseKeys.stats(),
    queryFn: () => api.get<WarehouseStats>('/admin/warehouse/stats'),
    
  });
}

export function useIngreso() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post('/admin/warehouse/ingreso', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: warehouseKeys.all });
    },
  });
}

export function useDespacho() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { paqueteId: string; notas?: string }) =>
      api.post('/admin/warehouse/despacho', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: warehouseKeys.all });
    },
  });
}

export function useDevolucion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      paqueteId: string;
      ubicacionDestino: string;
      notas?: string;
    }) => api.post('/admin/warehouse/devolucion', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: warehouseKeys.all });
    },
  });
}

export function useUpdatePicking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      pickeado?: boolean;
      empaquetado?: boolean;
    }) => api.patch(`/admin/warehouse/picking/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: warehouseKeys.picking() });
    },
  });
}
