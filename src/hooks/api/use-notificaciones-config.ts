import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface NotificacionesConfig {
  envio_creado: boolean;
  recolectado: boolean;
  en_transito: boolean;
  en_reparto: boolean;
  entregado: boolean;
  fallido: boolean;
  problema: boolean;
}

export const NOTIFICACIONES_DEFAULTS: NotificacionesConfig = {
  envio_creado: true,
  recolectado: true,
  en_transito: true,
  en_reparto: true,
  entregado: true,
  fallido: true,
  problema: true,
};

interface NotificacionesConfigResponse {
  config: NotificacionesConfig;
  updatedAt: string | null;
  updatedBy: string | null;
}

const notificacionesKeys = {
  config: ['notificaciones-config'] as const,
};

export function useNotificacionesConfig() {
  return useQuery<NotificacionesConfigResponse>({
    queryKey: notificacionesKeys.config,
    queryFn: () => api.get<NotificacionesConfigResponse>('/admin/configuracion/notificaciones'),
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateNotificacionesConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cfg: NotificacionesConfig) =>
      api.put<NotificacionesConfigResponse>('/admin/configuracion/notificaciones', cfg),
    onSuccess: (updated) => {
      qc.setQueryData<NotificacionesConfigResponse>(notificacionesKeys.config, updated);
    },
  });
}
