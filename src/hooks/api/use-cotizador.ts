import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface CotizarRequest {
  origenCiudadId?: string;
  destinoCiudadId?: string;
  origen?: string;
  destino?: string;
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
