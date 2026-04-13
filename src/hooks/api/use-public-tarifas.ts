import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface PublicCiudad {
  nombre: string;
  estandar: number | null;
  express: number | null;
}

export interface PublicTarifasResponse {
  ciudades: PublicCiudad[];
  hub: string;
}

const publicTarifasKeys = {
  all: ['public-tarifas'] as const,
};

export function usePublicTarifas() {
  return useQuery<PublicTarifasResponse>({
    queryKey: publicTarifasKeys.all,
    queryFn: () => api.get<PublicTarifasResponse>('/public/tarifas'),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 2,
    retryDelay: 3000,
  });
}
