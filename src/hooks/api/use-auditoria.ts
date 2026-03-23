import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { buildQueryString } from './helpers';
import { auditoriaKeys } from './use-envios';
import type { AuditoriaLog } from '@/data/mockData';

interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export function useAuditoria(
  filters?: Record<string, string | number | boolean | undefined>,
) {
  return useQuery({
    queryKey: auditoriaKeys.list(filters ?? {}),
    queryFn: () =>
      api.get<PaginatedResponse<AuditoriaLog>>(
        '/admin/auditoria' + buildQueryString(filters),
      ),
    
  });
}
