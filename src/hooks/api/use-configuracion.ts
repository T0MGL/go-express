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
    
  });
}

export function useUpdateConfiguracion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      api.put<ConfigItem>(`/admin/configuracion/${key}`, { value }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: configuracionKeys.all });
    },
  });
}
