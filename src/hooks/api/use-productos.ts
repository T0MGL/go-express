import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ProductoGuardado } from '@/data/types';

const productoKeys = {
  all: ['productos'] as const,
  lists: () => [...productoKeys.all, 'list'] as const,
  list: (filters?: Record<string, unknown>) => [...productoKeys.lists(), filters] as const,
  detail: (id: string) => [...productoKeys.all, 'detail', id] as const,
};

interface ProductosListResponse {
  data: ProductoGuardado[];
}

export function useProductos() {
  return useQuery<ProductosListResponse>({
    queryKey: productoKeys.lists(),
    queryFn: () => api.get<ProductosListResponse>('/cliente/productos'),
  });
}

export function useCreateProducto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<ProductoGuardado, 'id' | 'clienteId' | 'creadoEn' | 'updatedAt'>) =>
      api.post<ProductoGuardado>('/cliente/productos', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productoKeys.all });
    },
  });
}

export function useUpdateProducto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<Omit<ProductoGuardado, 'id' | 'clienteId' | 'creadoEn' | 'updatedAt'>>) =>
      api.put<ProductoGuardado>(`/cliente/productos/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productoKeys.all });
    },
  });
}

export function useDeleteProducto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/cliente/productos/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productoKeys.all });
    },
  });
}
