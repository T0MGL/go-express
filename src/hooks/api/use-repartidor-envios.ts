import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface RepartidorEnvio {
  id: string;
  tracking_number: string;
  cliente_nombre: string;
  origen: string;
  destino: string;
  destinatario_nombre: string;
  destinatario_telefono: string;
  destinatario_direccion: string;
  destinatario_ciudad: string;
  destinatario_referencia: string | null;
  estado: 'pendiente' | 'recolectado' | 'en_transito' | 'en_reparto' | 'entregado' | 'fallido' | 'problema';
  costo: number;
  monto_a_cobrar: number;
  tipo_pago: 'anticipado' | 'contra_entrega' | 'cuenta_corriente';
  peso: number;
  producto: string | null;
  fragil: boolean;
  notas: string | null;
  instrucciones_entrega: string | null;
  dimensiones_largo: number | null;
  dimensiones_ancho: number | null;
  dimensiones_alto: number | null;
  fecha: string;
  fecha_entrega_real: string | null;
  foto_entrega_url: string | null;
  entregado_por_nombre: string | null;
  entregado_por_documento: string | null;
  monto_cobrado: number | null;
  recolectado_en: string | null;
  tiene_incidencia: boolean;
  incidencia_nota: string | null;
  incidencia_reportada_en: string | null;
  repartidor_id: string | null;
  repartidor_asignado_en: string | null;
  created_at: string;
  updated_at: string;
}

export type Rango = 'hoy' | 'semana' | 'mes';
export type Filtro = 'pendientes' | 'entregados' | 'incidencias' | 'todos';

export function useMisEnvios(rango: Rango, filtro: Filtro) {
  return useQuery<{ data: RepartidorEnvio[] }>({
    queryKey: ['repartidor', 'mis-envios', rango, filtro],
    queryFn: () => api.get(`/repartidor/mis-envios?rango=${rango}&filtro=${filtro}`),
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

export function useRepartidorEnvio(id: string | undefined) {
  return useQuery<RepartidorEnvio>({
    queryKey: ['repartidor', 'envio', id],
    queryFn: () => api.get(`/repartidor/mis-envios/${id}`),
    enabled: !!id,
    staleTime: 15 * 1000,
  });
}

export function useMarcarRecolectado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patch(`/repartidor/mis-envios/${id}/recolectado`, {}),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['repartidor', 'mis-envios'] });
      qc.invalidateQueries({ queryKey: ['repartidor', 'envio', id] });
    },
  });
}

export interface EntregadoInput {
  nombreRecibe: string;
  documento?: string;
  montoCobrado?: number;
  fotoPath?: string;
  notas?: string;
}

export function useMarcarEntregado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: EntregadoInput }) =>
      api.patch(`/repartidor/mis-envios/${id}/entregado`, payload),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['repartidor', 'mis-envios'] });
      qc.invalidateQueries({ queryKey: ['repartidor', 'envio', id] });
    },
  });
}

export function useReportarIncidencia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, nota }: { id: string; nota: string }) =>
      api.patch(`/repartidor/mis-envios/${id}/incidencia`, { nota }),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['repartidor', 'mis-envios'] });
      qc.invalidateQueries({ queryKey: ['repartidor', 'envio', id] });
    },
  });
}

export interface PodSignedUrl {
  path: string;
  token: string;
  signedUrl: string;
}

export function useCreatePodSignedUrl() {
  return useMutation({
    mutationFn: ({ id, ext }: { id: string; ext: 'jpg' | 'jpeg' | 'png' | 'webp' }) =>
      api.post<PodSignedUrl>(`/repartidor/mis-envios/${id}/pod-signed-url`, { ext }),
  });
}

export function useRepartidorPodDownloadUrl(path: string | null | undefined) {
  return useQuery<{ signedUrl: string | null }>({
    queryKey: ['repartidor', 'pod-download', path],
    queryFn: () => api.get(`/repartidor/pod-download-url?path=${encodeURIComponent(path!)}`),
    enabled: !!path,
    staleTime: 5 * 60 * 1000,
  });
}
