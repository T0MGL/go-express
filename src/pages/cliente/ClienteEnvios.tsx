import { useState } from 'react';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { MagnifyingGlass, Eye, Package, CircleNotch, Barcode } from '@phosphor-icons/react';
import { printShippingLabel } from '@/components/printing/generateShippingLabel';
import { toast } from 'sonner';
import { estadoLabels } from '@/data/constants';
import type { Envio } from '@/data/types';
import { useNavigate } from 'react-router-dom';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Timeline } from '@/components/tracking/Timeline';
import { formatDate } from '@/lib/utils';
import { useClienteEnvios, useClienteEnvio } from '@/hooks/api/use-cliente-envios';

const estadoList = [
  { value: 'todos', label: 'Todos' },
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'en_transito', label: 'En Transito' },
  { value: 'en_reparto', label: 'En Reparto' },
  { value: 'entregado', label: 'Entregado' },
  { value: 'fallido', label: 'Fallido' },
  { value: 'problema', label: 'Problema' },
];

const estadoBadge: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' }> = {
  pendiente: { label: 'Pendiente', variant: 'secondary' },
  recolectado: { label: 'Recolectado', variant: 'outline' },
  en_transito: { label: 'En Transito', variant: 'default' },
  en_reparto: { label: 'En Reparto', variant: 'warning' },
  entregado: { label: 'Entregado', variant: 'success' },
  fallido: { label: 'Fallido', variant: 'destructive' },
  problema: { label: 'Problema', variant: 'destructive' },
};

const ClienteEnvios = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEstado, setFilterEstado] = useState('todos');
  const [selectedEnvioId, setSelectedEnvioId] = useState<string | null>(null);
  const navigate = useNavigate();
  const debouncedSearch = useDebouncedValue(searchTerm, 350);

  // API data
  const { data: apiData, isLoading } = useClienteEnvios({
    estado: filterEstado,
    search: debouncedSearch,
  });
  const { data: selectedEnvio } = useClienteEnvio(selectedEnvioId ?? '');

  const envios: Envio[] = apiData?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Mis Envios</h1>
          <p className="page-header-subtitle">Segui el estado de todos tus paquetes</p>
        </div>
        <Button onClick={() => navigate('/cliente/envios/nuevo')} size="sm" className="gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          Nuevo Paquete
        </Button>
      </div>

      {/* Status filter pills */}
      <div className="flex gap-1.5 flex-wrap">
        {estadoList.map((est) => (
          <button
            type="button"
            key={est.value}
            onClick={() => setFilterEstado(est.value)}
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
          <div className="relative">
            <MagnifyingGlass size={15} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              placeholder="Buscar por tracking, destinatario o destino..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
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
                    <th className="pl-4">Tracking</th>
                    <th>Destino</th>
                    <th>Destinatario</th>
                    <th>Peso</th>
                    <th>Estado</th>
                    <th>Fecha</th>
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
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                        </td>
                        <td className="text-[13px] text-muted-foreground">{formatDate(envio.fecha)}</td>
                        <td className="text-right pr-4">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setSelectedEnvioId(envio.id)}>
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
                <p className="text-[13px] font-medium">No se encontraron envios</p>
                <p className="text-[12px] text-muted-foreground mt-1">
                  {searchTerm ? 'Proba con otros terminos' : 'Aun no tenes envios en este estado'}
                </p>
                {!searchTerm && filterEstado === 'todos' && (
                  <Button size="sm" className="mt-4 gap-1.5" onClick={() => navigate('/cliente/envios/nuevo')}>
                    <Plus className="w-3.5 h-3.5" />
                    Crear tu primer envio
                  </Button>
                )}
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
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-0.5">Direccion</p>
                  <p className="text-[13px] font-medium">{selectedEnvio.destinatarioDireccion}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-0.5">Peso</p>
                  <p className="text-[13px] font-medium font-data">{selectedEnvio.peso} kg</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-0.5">Fecha</p>
                  <p className="text-[13px] font-medium">{formatDate(selectedEnvio.fecha)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-0.5">Estado</p>
                  <Badge variant={estadoBadge[selectedEnvio.estado]?.variant || 'secondary'}>
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
                Imprimir Etiqueta
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClienteEnvios;
