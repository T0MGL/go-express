import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

const cuentaKeys = {
  all: ['cuenta'] as const,
  detail: () => [...cuentaKeys.all, 'detail'] as const,
};

export interface CuentaData {
  razonSocial: string;
  ruc: string;
  direccion: string;
  telefono: string;
  email: string;
  contactoNombre: string;
  contactoCargo: string;
}

export function useCuenta() {
  return useQuery<CuentaData>({
    queryKey: cuentaKeys.detail(),
    queryFn: () => api.get<CuentaData>('/cliente/cuenta'),
  });
}

export function useUpdateCuenta() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<CuentaData>) =>
      api.put<CuentaData>('/cliente/cuenta', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cuentaKeys.all });
    },
  });
}
