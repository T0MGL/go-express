import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useAdminPodDownloadUrl(envioId: string, fotoPath: string | null | undefined) {
  return useQuery<{ signedUrl: string | null }>({
    queryKey: ['admin', 'envio', envioId, 'pod'],
    queryFn: () => api.get(`/admin/envios/${envioId}/pod-download-url`),
    enabled: !!envioId && !!fotoPath,
    staleTime: 5 * 60 * 1000,
  });
}

export function useResolverIncidencia(envioId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (nota?: string) =>
      api.post(`/admin/envios/${envioId}/incidencia/resolver`, { nota: nota ?? undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['envios'] });
      qc.invalidateQueries({ queryKey: ['envio', envioId] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
