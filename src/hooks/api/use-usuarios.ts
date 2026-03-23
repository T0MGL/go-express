import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { usuarioKeys } from './use-envios';
import type { Usuario } from '@/data/mockData';

export function useUsuarios() {
  return useQuery({
    queryKey: usuarioKeys.lists(),
    queryFn: () => api.get<Usuario[]>('/admin/usuarios'),
    
  });
}

export function useCreateUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Usuario>('/admin/usuarios', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: usuarioKeys.all });
    },
  });
}

export function useUpdateUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      api.put<Usuario>(`/admin/usuarios/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: usuarioKeys.all });
    },
  });
}
