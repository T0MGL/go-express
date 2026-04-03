import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { usuarioKeys } from './use-envios';
import type { Usuario } from '@/data/types';

export function useUsuarios() {
  return useQuery({
    queryKey: usuarioKeys.lists(),
    queryFn: () => api.get<Usuario[]>('/admin/usuarios'),
    staleTime: 10 * 60 * 1000,
  });
}

export function useCreateUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<Usuario>('/admin/usuarios', body),
    onSuccess: (newUser) => {
      qc.setQueryData<Usuario[]>(usuarioKeys.lists(), (old) => {
        if (!old) return [newUser];
        return [...old, newUser];
      });
    },
  });
}

export function useUpdateUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      api.put<Usuario>(`/admin/usuarios/${id}`, body),
    onSuccess: (updated) => {
      qc.setQueryData<Usuario[]>(usuarioKeys.lists(), (old) => {
        if (!old) return old;
        return old.map((u) => (u.id === updated.id ? updated : u));
      });
    },
  });
}
