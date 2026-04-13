import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { SeguroConfig, SeguroCotizarResponse } from '@/lib/seguro';

const seguroKeys = {
  config: ['seguro-config'] as const,
};

interface SeguroConfigResponse {
  config: SeguroConfig;
  updatedAt: string | null;
  updatedBy: string | null;
}

/**
 * Admin-only hook. Lee la config completa del seguro (umbral, tasa, minimo, maximo).
 * Invalido en el portal cliente: usar useClienteSeguroCotizar en su lugar.
 */
export function useSeguroConfig() {
  return useQuery<SeguroConfigResponse>({
    queryKey: seguroKeys.config,
    queryFn: () => api.get<SeguroConfigResponse>('/admin/configuracion/seguro'),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Admin-only mutation. Actualiza los 4 parametros de la config del seguro.
 */
export function useUpdateSeguroConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cfg: SeguroConfig) =>
      api.put<SeguroConfigResponse>('/admin/configuracion/seguro', cfg),
    onSuccess: (updated) => {
      qc.setQueryData<SeguroConfigResponse>(seguroKeys.config, updated);
    },
  });
}

/**
 * Cliente-authed mutation. Dada un valorDeclarado, devuelve la cotizacion del seguro
 * sin exponer la config cruda (tasa, minimo). Solo devuelve el resultado por-envio.
 */
export function useClienteSeguroCotizar() {
  return useMutation({
    mutationFn: (valorDeclarado: number) =>
      api.post<SeguroCotizarResponse>('/cliente/cotizador/seguro', { valorDeclarado }),
  });
}
