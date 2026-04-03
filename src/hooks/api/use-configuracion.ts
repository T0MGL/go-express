import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { configuracionKeys } from './use-envios';

interface ConfigItem {
  key: string;
  value: string;
  updatedAt: string;
  updatedBy: string;
}

export function useConfiguracion() {
  return useQuery({
    queryKey: configuracionKeys.all,
    queryFn: () => api.get<ConfigItem[]>('/admin/configuracion'),
    staleTime: 30 * 60 * 1000,
  });
}

export function useUpdateConfiguracion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      api.put<ConfigItem>(`/admin/configuracion/${key}`, { value }),
    onSuccess: (updated) => {
      qc.setQueryData<ConfigItem[]>(configuracionKeys.all, (old) => {
        if (!old) return [updated];
        return old.map((item) => (item.key === updated.key ? updated : item));
      });
    },
  });
}
