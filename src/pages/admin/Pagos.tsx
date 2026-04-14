import { useState, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/search-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { cn, formatCurrency, formatDateSmart } from '@/lib/utils';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { exportToCSV } from '@/lib/exportCSV';
import { Link } from 'react-router-dom';
import { DownloadSimple, Eye, CurrencyDollar, Clock, CheckCircle, MagnifyingGlass } from '@phosphor-icons/react';
import { PaymentModal } from '@/components/admin/PaymentModal';
import { toast } from 'sonner';
import { usePagos, usePagoStats } from '@/hooks/api/use-pagos';

interface PagoListItem {
  id: string;
  envioId: string;
  trackingNumber?: string;
  clienteNombre?: string;
  montoTotal: number;
  montoRecibido: number;
  metodoPago: string;
  estadoPago: string;
  fechaPago?: string | null;
  referencia?: string | null;
  notas?: string | null;
  creadoPor: string;
  creadoEn: string;
  updatedAt: string;
  costo?: number;
}

const PAGE_SIZE = 20;

const Pagos = () => {
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<string>('todos');
  const [filtroMetodo, setFiltroMetodo] = useState<string>('todos');
  const [selectedPago, setSelectedPago] = useState<PagoListItem | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [page, setPage] = useState(1);

  const debouncedBusqueda = useDebouncedValue(busqueda, 350);
  const resetPage = useCallback(() => setPage(1), []);

  const apiFilters = useMemo(() => {
    const f: Record<string, string | number | undefined> = {
      page,
      limit: PAGE_SIZE,
    };
    if (filtroEstado !== 'todos') f.estadoPago = filtroEstado;
    if (filtroMetodo !== 'todos') f.metodoPago = filtroMetodo;
    if (debouncedBusqueda) f.search = debouncedBusqueda;
    return f;
  }, [filtroEstado, filtroMetodo, page, debouncedBusqueda]);

  const { data: apiPagos, isLoading } = usePagos(apiFilters);
  const { data: apiStats } = usePagoStats();

  const pagosFiltrados = (apiPagos?.data ?? []) as unknown as PagoListItem[];
  const totalCobrado = apiStats?.totalCobrado ?? 0;
  const totalPendiente = apiStats?.totalPendiente ?? 0;
  const cobradoHoy = apiStats?.cobradoHoy ?? 0;
  const totalCount = apiPagos?.pagination?.total ?? pagosFiltrados.length;

  const handleCobrar = (pago: PagoListItem) => {
    setSelectedPago(pago);
    setIsPaymentModalOpen(true);
  };

  const handlePaymentRegistered = () => {
    setIsPaymentModalOpen(false);
    setSelectedPago(null);
    toast.success('Pago registrado correctamente');
  };

  const handleExportPagosCSV = () => {
    const columns = [
      { label: 'Tracking', accessor: (p: PagoListItem) => p.trackingNumber ?? '' },
      { label: 'Cliente', accessor: (p: PagoListItem) => p.clienteNombre ?? '' },
      { label: 'Monto Total', accessor: (p: PagoListItem) => p.montoTotal },
      { label: 'Monto Recibido', accessor: (p: PagoListItem) => p.montoRecibido },
      { label: 'Estado Pago', accessor: (p: PagoListItem) => p.estadoPago },
      { label: 'Método', accessor: (p: PagoListItem) => p.metodoPago || '-' },
      { label: 'Fecha Pago', accessor: (p: PagoListItem) => p.fechaPago || '-' },
    ];

    exportToCSV(pagosFiltrados, 'pagos', columns);
    toast.success('Exportando pagos a CSV...');
  };

  const estadoPagoColors: Record<string, string> = {
    pendiente: 'secondary',
    pagado: 'success',
    pago_parcial: 'warning'
  };

  const metodosPagoLabels: Record<string, string> = {
    efectivo: 'Efectivo',
    transferencia: 'Transferencia',
    tarjeta: 'Tarjeta (POS)',
    contra_entrega: 'Contra entrega'
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Cobros</h1>
          <p className="page-header-subtitle">Que envíos fueron pagados y cuales quedan por cobrar</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportPagosCSV} className="gap-1.5">
          <DownloadSimple size={14} weight="duotone" />
          Exportar CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-success/6 flex items-center justify-center">
              <CheckCircle size={16} weight="duotone" className="text-success" />
            </div>
            <div>
              <p className="stat-card-value text-xl font-data text-success">
                {formatCurrency(totalCobrado)}
              </p>
              <p className="stat-card-label">Cobrado hasta ahora</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-warning/6 flex items-center justify-center">
              <Clock size={16} weight="duotone" className="text-warning" />
            </div>
            <div>
              <p className="stat-card-value text-xl font-data text-warning">
                {formatCurrency(totalPendiente)}
              </p>
              <p className="stat-card-label">Pendiente de cobrar</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/6 flex items-center justify-center">
              <CurrencyDollar size={16} weight="duotone" className="text-primary" />
            </div>
            <div>
              <p className="stat-card-value text-xl font-data">
                {formatCurrency(cobradoHoy)}
              </p>
              <p className="stat-card-label">Cobrado hoy</p>
            </div>
          </div>
        </div>
      </div>

      <div className="surface-card">
        <div className="p-5 pb-4">
          <div className="flex flex-wrap gap-3 mb-4">
            <SearchInput
              value={busqueda}
              onChange={(v) => { setBusqueda(v); resetPage(); }}
              placeholder="Buscar por número de seguimiento o cliente..."
              className="flex-1 min-w-48"
            />
            <Select value={filtroEstado} onValueChange={(v) => { setFiltroEstado(v); resetPage(); }}>
              <SelectTrigger className={cn('w-48', filtroEstado !== 'todos' && 'border-primary/50 bg-primary/5 text-foreground')}>
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los estados</SelectItem>
                <SelectItem value="pagado">Cobrado</SelectItem>
                <SelectItem value="pendiente">Sin cobrar</SelectItem>
                <SelectItem value="pago_parcial">Cobro parcial</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filtroMetodo} onValueChange={(v) => { setFiltroMetodo(v); resetPage(); }}>
              <SelectTrigger className={cn('w-48', filtroMetodo !== 'todos' && 'border-primary/50 bg-primary/5 text-foreground')}>
                <SelectValue placeholder="Método de cobro" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los métodos</SelectItem>
                <SelectItem value="efectivo">Efectivo</SelectItem>
                <SelectItem value="transferencia">Transferencia</SelectItem>
                <SelectItem value="tarjeta">Tarjeta</SelectItem>
                <SelectItem value="contra_entrega">Contra entrega</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 py-2">
                  <div className="h-4 w-28 bg-muted/40 rounded animate-pulse" />
                  <div className="h-4 w-32 bg-muted/30 rounded animate-pulse" />
                  <div className="h-4 w-24 bg-muted/30 rounded animate-pulse" />
                  <div className="h-5 w-16 bg-muted/40 rounded-full animate-pulse" />
                  <div className="h-4 w-24 bg-muted/30 rounded animate-pulse" />
                  <div className="h-4 w-20 bg-muted/30 rounded animate-pulse" />
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th>Seguimiento</th>
                      <th>Cliente</th>
                      <th className="text-right">Precio</th>
                      <th>Estado</th>
                      <th>Como pago</th>
                      <th>Cobrado el</th>
                      <th className="text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagosFiltrados.map((pago) => (
                      <tr key={pago.id}>
                        <td>
                          <Link
                            to={`/admin/envios/${pago.envioId}`}
                            className="text-primary hover:underline font-medium font-data text-[13px]"
                          >
                            {pago.trackingNumber ?? 'Sin asignar'}
                          </Link>
                        </td>
                        <td className="text-[13px]">{pago.clienteNombre ?? 'Sin cliente'}</td>
                        <td className="text-[13px] font-medium font-data text-right">
                          {formatCurrency(pago.montoTotal)}
                        </td>
                        <td>
                          <Badge
                            variant={estadoPagoColors[pago.estadoPago || 'pendiente'] as "muted" | "default" | "destructive" | "success" | "warning" | "outline" | "secondary"}
                            className="text-[11px]"
                          >
                            {pago.estadoPago === 'pagado' ? 'Cobrado'
                              : pago.estadoPago === 'pago_parcial' ? 'Cobro parcial'
                              : 'Sin cobrar'}
                          </Badge>
                        </td>
                        <td className="text-[13px]">
                          {pago.metodoPago
                            ? metodosPagoLabels[pago.metodoPago]
                            : <span className="text-muted-foreground/60">Sin definir</span>}
                        </td>
                        <td className="text-[12px] text-muted-foreground">
                          {pago.fechaPago ? formatDateSmart(pago.fechaPago) : 'Sin cobrar'}
                        </td>
                        <td className="text-right">
                          {pago.estadoPago === 'pendiente' || pago.estadoPago === 'pago_parcial' ? (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handleCobrar(pago)}
                            >
                              Registrar cobro
                            </Button>
                          ) : (
                            <Link to={`/admin/envios/${pago.envioId}`}>
                              <Button variant="ghost" size="sm" className="gap-1.5">
                                <Eye size={14} weight="duotone" />
                                Ver envío
                              </Button>
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {pagosFiltrados.length > 0 && (
                <div className="px-5 py-3 border-t border-border/40 flex items-center justify-between">
                  <p className="text-[12px] text-muted-foreground">
                    Viendo {pagosFiltrados.length} de {totalCount} cobro{totalCount === 1 ? '' : 's'}
                  </p>
                  {(apiPagos?.pagination?.totalPages ?? 1) > 1 && (
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 w-7 p-0"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </Button>
                      <span className="text-[12px] text-muted-foreground tabular-nums px-2">
                        {page} / {apiPagos?.pagination?.totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 w-7 p-0"
                        disabled={page >= (apiPagos?.pagination?.totalPages ?? 1)}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {pagosFiltrados.length === 0 && (
                <div className="text-center py-16 px-4">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                    <MagnifyingGlass size={18} weight="duotone" className="text-muted-foreground/50" />
                  </div>
                  <p className="text-[13px] font-medium text-foreground">
                    {busqueda || filtroEstado !== 'todos' || filtroMetodo !== 'todos'
                      ? 'Ningún cobro coincide con los filtros'
                      : 'Aún no hay cobros registrados'}
                  </p>
                  <p className="text-[12px] text-muted-foreground mt-1">
                    {busqueda || filtroEstado !== 'todos' || filtroMetodo !== 'todos'
                      ? 'Proba borrando los filtros o buscando otro termino'
                      : 'Los cobros apareceran aquí cuando registres un envío'}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {selectedPago && (
        <PaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          envioId={selectedPago.envioId}
          montoTotal={selectedPago.montoTotal}
          onPaymentRegistered={handlePaymentRegistered}
        />
      )}
    </div>
  );
};

export default Pagos;
