import { useState, useMemo, useEffect } from 'react';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { SearchInput } from '@/components/ui/search-input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { Eye, Package, Barcode, CaretLeft, CaretRight } from '@phosphor-icons/react';
import { printShippingLabel } from '@/components/printing/generateShippingLabel';
import { toast } from 'sonner';
import { estadoLabels } from '@/data/constants';
import type { Envio } from '@/data/types';
import { useNavigate } from 'react-router-dom';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Timeline } from '@/components/tracking/Timeline';
import { cn, formatDateSmart } from '@/lib/utils';
import { useClienteEnvios, useClienteEnvio } from '@/hooks/api/use-cliente-envios';

const estadoList = [
  { value: 'todos', label: 'Todos' },
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'en_transito', label: 'En camino' },
  { value: 'en_reparto', label: 'En reparto' },
  { value: 'entregado', label: 'Entregados' },
  { value: 'fallido', label: 'Fallidos' },
  { value: 'problema', label: 'Con problema' },
];

const estadoBadge: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' }> = {
  pendiente: { label: 'Pendiente', variant: 'secondary' },
  recolectado: { label: 'Retirado', variant: 'outline' },
  en_transito: { label: 'En camino', variant: 'default' },
  en_reparto: { label: 'En reparto', variant: 'warning' },
  entregado: { label: 'Entregado', variant: 'success' },
  fallido: { label: 'Fallido', variant: 'destructive' },
  problema: { label: 'Con problema', variant: 'destructive' },
};

const PAGE_SIZE = 20;

const ClienteEnvios = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEstado, setFilterEstado] = useState('todos');
  const [selectedEnvioId, setSelectedEnvioId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const navigate = useNavigate();
  const debouncedSearch = useDebouncedValue(searchTerm, 350);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filterEstado]);

  const envioFilters = useMemo(() => ({
    estado: filterEstado,
    search: debouncedSearch,
    page,
    limit: PAGE_SIZE,
  }), [filterEstado, debouncedSearch, page]);

  const { data: apiData, isLoading } = useClienteEnvios(envioFilters);
  const { data: selectedEnvio } = useClienteEnvio(selectedEnvioId ?? '');

  const envios: Envio[] = apiData?.data ?? [];
  const totalCount = apiData?.pagination?.total ?? envios.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Mis envíos</h1>
          <p className="page-header-subtitle">
            {totalCount > 0
              ? `${totalCount} ${totalCount === 1 ? 'envío' : 'envíos'} en tu cuenta`
              : 'Seguí el estado de todos tus paquetes'}
          </p>
        </div>
        <Button onClick={() => navigate('/portal/envios/nuevo')} size="sm" className="gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          Nuevo envío
        </Button>
      </div>

      {/* Status filter pills */}
      <div className="flex gap-1.5 flex-wrap">
        {estadoList.map((est) => (
          <button
            type="button"
            key={est.value}
            onClick={() => setFilterEstado(est.value)}
            aria-pressed={filterEstado === est.value}
            className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all border ${
              filterEstado === est.value
                ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                : 'bg-card text-muted-foreground border-border/60 hover:border-border hover:text-foreground'
            }`}
          >
            {est.label}
          </button>
        ))}
      </div>

      <div className="surface-card">
        <div className="p-4 border-b border-border/40">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Buscar por tracking, destinatario o destino..."
          />
        </div>

        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 py-2">
                <div className="h-4 w-28 bg-muted/40 rounded animate-pulse" />
                <div className="h-4 w-24 bg-muted/30 rounded animate-pulse" />
                <div className="h-4 w-28 bg-muted/30 rounded animate-pulse" />
                <div className="h-4 w-12 bg-muted/30 rounded animate-pulse" />
                <div className="h-5 w-16 bg-muted/40 rounded-full animate-pulse" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="premium-table">
                <thead>
                  <tr>
                    <th className="pl-4">Seguimiento</th>
                    <th>Destino</th>
                    <th>Destinatario</th>
                    <th>Peso</th>
                    <th>Estado</th>
                    <th>Creado</th>
                    <th className="text-right pr-4">Ver</th>
                  </tr>
                </thead>
                <tbody>
                  {envios.map((envio) => {
                    const badge = estadoBadge[envio.estado] || { label: envio.estado, variant: 'secondary' as const };
                    return (
                      <tr key={envio.id}>
                        <td className="pl-4 font-data font-medium text-primary">{envio.trackingNumber}</td>
                        <td className="text-[13px] text-muted-foreground">{envio.destino}</td>
                        <td className="text-[13px]">{envio.destinatarioNombre}</td>
                        <td className="text-[13px] text-muted-foreground font-data">{envio.peso} kg</td>
                        <td>
                          <Badge
                            variant={badge.variant}
                            className={cn(envio.estado === 'problema' && 'badge-pulse')}
                          >
                            {badge.label}
                          </Badge>
                        </td>
                        <td className="text-[13px] text-muted-foreground">{formatDateSmart(envio.fecha)}</td>
                        <td className="text-right pr-4">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setSelectedEnvioId(envio.id)} aria-label={`Ver detalle del envío ${envio.trackingNumber}`}>
                            <Eye size={14} weight="duotone" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {envios.length === 0 && (
              <div className="text-center py-16 px-4">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                  <Package size={18} weight="duotone" className="text-muted-foreground/50" />
                </div>
                {searchTerm ? (
                  <>
                    <p className="text-[13px] font-medium">Nada coincide con tu búsqueda</p>
                    <p className="text-[12px] text-muted-foreground mt-1 max-w-sm mx-auto">
                      Probá buscando por número de seguimiento, nombre del destinatario o ciudad.
                    </p>
                  </>
                ) : filterEstado !== 'todos' ? (
                  <>
                    <p className="text-[13px] font-medium">Ningún envío en este estado</p>
                    <p className="text-[12px] text-muted-foreground mt-1">
                      Cambiá el filtro para ver otros envíos de tu cuenta.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-[13px] font-medium">Todavía no tenés envíos</p>
                    <p className="text-[12px] text-muted-foreground mt-1 max-w-sm mx-auto">
                      Creá tu primer envío y se te va a listar acá con seguimiento en tiempo real.
                    </p>
                    <Button size="sm" className="mt-4 gap-1.5" onClick={() => navigate('/portal/envios/nuevo')}>
                      <Plus className="w-3.5 h-3.5" />
                      Crear mi primer envío
                    </Button>
                  </>
                )}
              </div>
            )}

            {envios.length > 0 && totalPages > 1 && (
              <div className="border-t px-4 py-2.5 flex items-center justify-between text-[11px] text-muted-foreground bg-muted/20">
                <span>
                  Página <span className="font-data">{page}</span> de <span className="font-data">{totalPages}</span>
                  <span className="mx-1.5 opacity-50">·</span>
                  <span className="font-data">{totalCount}</span> envíos en total
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="h-7 px-2"
                  >
                    <CaretLeft size={12} weight="bold" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="h-7 px-2"
                  >
                    <CaretRight size={12} weight="bold" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <Dialog open={!!selectedEnvioId} onOpenChange={() => setSelectedEnvioId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-data text-sm">{selectedEnvio?.trackingNumber}</DialogTitle>
          </DialogHeader>
          {selectedEnvio && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-0.5">Destino</p>
                  <p className="text-[13px] font-medium">{selectedEnvio.destino}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-0.5">Destinatario</p>
                  <p className="text-[13px] font-medium">{selectedEnvio.destinatarioNombre}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-0.5">Dirección</p>
                  <p className="text-[13px] font-medium">{selectedEnvio.destinatarioDireccion}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-0.5">Peso</p>
                  <p className="text-[13px] font-medium font-data">{selectedEnvio.peso} kg</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-0.5">Fecha</p>
                  <p className="text-[13px] font-medium">{formatDateSmart(selectedEnvio.fecha)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-0.5">Estado</p>
                  <Badge
                    variant={estadoBadge[selectedEnvio.estado]?.variant || 'secondary'}
                    className={cn(selectedEnvio.estado === 'problema' && 'badge-pulse')}
                  >
                    {estadoLabels[selectedEnvio.estado]}
                  </Badge>
                </div>
              </div>
              {selectedEnvio.notas && (
                <div className="bg-muted/30 rounded-lg p-3 border border-border/40">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Notas</p>
                  <p className="text-[13px]">{selectedEnvio.notas}</p>
                </div>
              )}
              <div>
                <p className="text-[13px] font-semibold mb-3">Historial de seguimiento</p>
                <Timeline eventos={selectedEnvio.eventos} />
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="w-full gap-1.5"
                onClick={() => {
                  const success = printShippingLabel(selectedEnvio);
                  if (success) {
                    toast.success('Etiqueta generada');
                  } else {
                    toast.error('Error al generar etiqueta');
                  }
                }}
              >
                <Barcode size={14} weight="duotone" />
                Imprimir etiqueta
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClienteEnvios;
