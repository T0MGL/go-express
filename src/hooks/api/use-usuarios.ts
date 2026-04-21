import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { usuarioKeys } from './use-envios';
import type { Usuario } from '@/data/types';

export function useUsuarios(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: usuarioKeys.lists(),
    queryFn: () => api.get<Usuario[]>('/admin/usuarios'),
    staleTime: 10 * 60 * 1000,
    enabled: options.enabled ?? true,
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

export function useSetUsuarioPassword() {
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      api.post<Usuario>(`/admin/usuarios/${id}/password`, { password }),
  });
}

export function useSendUsuarioPasswordReset() {
  return useMutation({
    mutationFn: ({ id }: { id: string }) =>
      api.post<{ ok: boolean; email: string }>(`/admin/usuarios/${id}/send-password-reset`, {}),
  });
}
