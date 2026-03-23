import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { SearchResult } from '@/lib/search';
import type { Envio, Cliente } from '@/data/types';

const globalSearchKeys = {
  all: ['global-search'] as const,
  query: (q: string) => [...globalSearchKeys.all, q] as const,
};

interface EnvioSearchResponse {
  data: Envio[];
}

interface ClienteSearchResponse {
  data: Cliente[];
}

async function apiSearch(query: string): Promise<SearchResult[]> {
  const [enviosRes, clientesRes] = await Promise.all([
    api.get<EnvioSearchResponse>(`/admin/envios?search=${encodeURIComponent(query)}&limit=5`),
    api.get<ClienteSearchResponse>(`/admin/clientes?search=${encodeURIComponent(query)}&limit=5`),
  ]);

  const results: SearchResult[] = [];

  (enviosRes.data || []).forEach((envio) => {
    results.push({
      id: envio.id,
      type: 'envio',
      title: envio.trackingNumber,
      subtitle: `${envio.clienteNombre} → ${envio.destino}`,
      link: `/admin/envios/${envio.id}`,
    });
  });

  (clientesRes.data || []).forEach((cliente) => {
    results.push({
      id: cliente.id,
      type: 'cliente',
      title: cliente.razonSocial,
      subtitle: `${cliente.telefono} • ${cliente.email}`,
      link: `/admin/clientes?search=${cliente.id}`,
    });
  });

  return results.slice(0, 8);
}

export function useGlobalSearch(query: string) {
  return useQuery<SearchResult[]>({
    queryKey: globalSearchKeys.query(query),
    queryFn: () => apiSearch(query),
    enabled: !!query && query.length >= 2,
    staleTime: 30_000,
  });
}
