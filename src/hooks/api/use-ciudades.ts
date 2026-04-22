import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Ciudad {
  id: string;
  nombre: string;
  departamentoId: string;
  departamentoNombre: string;
  esCapital: boolean;
  orden: number;
  habilitada: boolean;
}

export interface Departamento {
  id: string;
  nombre: string;
  capital: string;
  orden: number;
}

export interface CoberturaCiudad {
  id: string;
  nombre: string;
  esCapital: boolean;
  orden: number;
  habilitada: boolean;
}

export interface CoberturaDepartamento {
  id: string;
  nombre: string;
  totalCiudades: number;
  ciudadesHabilitadas: number;
  ciudades: CoberturaCiudad[];
}

export interface CoberturaResumen {
  totalCiudades: number;
  ciudadesHabilitadas: number;
  totalDepartamentos: number;
  departamentosConCobertura: number;
  departamentos: CoberturaDepartamento[];
}

export const ciudadKeys = {
  all: ['ciudades'] as const,
  list: () => [...ciudadKeys.all, 'list'] as const,
  departamentos: () => [...ciudadKeys.all, 'departamentos'] as const,
  cobertura: () => [...ciudadKeys.all, 'cobertura'] as const,
};

const LONG_STALE = 10 * 60 * 1000;

export function useCiudades() {
  return useQuery({
    queryKey: ciudadKeys.list(),
    queryFn: () => api.get<{ data: Ciudad[] }>('/admin/ciudades'),
    staleTime: LONG_STALE,
    select: (res) => res.data,
  });
}

export function useDepartamentos() {
  return useQuery({
    queryKey: ciudadKeys.departamentos(),
    queryFn: () => api.get<{ data: Departamento[] }>('/admin/ciudades/departamentos'),
    staleTime: LONG_STALE,
    select: (res) => res.data,
  });
}

export function useCobertura() {
  return useQuery({
    queryKey: ciudadKeys.cobertura(),
    queryFn: () => api.get<CoberturaResumen>('/admin/ciudades/cobertura'),
    staleTime: 60 * 1000,
  });
}

/**
 * Version para el portal cliente. Mismo shape, distinto endpoint (cliente auth).
 */
export function useCiudadesCliente() {
  return useQuery({
    queryKey: [...ciudadKeys.list(), 'cliente'] as const,
    queryFn: () => api.get<{ data: Ciudad[] }>('/cliente/ciudades'),
    staleTime: LONG_STALE,
    select: (res) => res.data,
  });
}
