import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';

const cotizadorKeys = {
  all: ['cotizador'] as const,
  ciudades: () => [...cotizadorKeys.all, 'ciudades'] as const,
};

export function useCiudadesDisponibles() {
  return useQuery<string[]>({
    queryKey: cotizadorKeys.ciudades(),
    queryFn: () => api.get<string[]>('/cliente/cotizador/ciudades'),
  });
}

export interface CotizarRequest {
  origen: string;
  destino: string;
  peso: number;
  dimensiones?: {
    largo: number;
    ancho: number;
    alto: number;
  };
  tipoServicio?: string;
}

export interface CotizarResponse {
  pesoReal: number;
  pesoVolumetrico: number;
  pesoTarificado: number;
  esVolumetrico: boolean;
  costoBase: number;
  costoExtra: number;
  costoTotal: number;
  tarifa: {
    tipoServicio: string;
    origen: string;
    destino: string;
  };
}

export function useCotizar() {
  return useMutation({
    mutationFn: (data: CotizarRequest) =>
      api.post<CotizarResponse>('/cliente/cotizador/cotizar', data),
  });
}
