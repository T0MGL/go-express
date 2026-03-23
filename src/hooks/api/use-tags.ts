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
  });
}

export function useCreateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { nombre: string; color: string }) =>
      api.post<{ data: TagData }>('/cliente/tags', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tagKeys.all });
    },
  });
}

export function useDeleteTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/cliente/tags/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tagKeys.all });
    },
  });
}
