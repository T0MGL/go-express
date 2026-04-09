import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

const tagKeys = {
  all: ['tags'] as const,
  lists: () => [...tagKeys.all, 'list'] as const,
};

export interface TagData {
  id: string;
  clienteId: string;
  nombre: string;
  color: string;
  envioCount: number;
  creadoEn: string;
}

interface TagsListResponse {
  data: TagData[];
}

export function useTags() {
  return useQuery<TagsListResponse>({
    queryKey: tagKeys.lists(),
    queryFn: () => api.get<TagsListResponse>('/cliente/tags'),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { nombre: string; color: string }) =>
      api.post<{ data: Omit<TagData, 'envioCount'> }>('/cliente/tags', data),
    onSuccess: (res) => {
      const newTag: TagData = { ...res.data, envioCount: 0 };
      queryClient.setQueryData<TagsListResponse>(tagKeys.lists(), (old) => {
        if (!old) return { data: [newTag] };
        return { ...old, data: [...old.data, newTag] };
      });
    },
  });
}

export function useDeleteTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/cliente/tags/${id}`),
    onSuccess: (_data, id) => {
      queryClient.setQueryData<TagsListResponse>(tagKeys.lists(), (old) => {
        if (!old) return old;
        return { ...old, data: old.data.filter((t) => t.id !== id) };
      });
    },
  });
}
