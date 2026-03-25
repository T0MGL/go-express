import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { formatCurrency, formatDate } from '@/lib/utils';
import { exportToCSV } from '@/lib/exportCSV';
import { Link } from 'react-router-dom';
import { DownloadSimple, Eye, CurrencyDollar, Clock, CheckCircle, MagnifyingGlass } from '@phosphor-icons/react';
import { PaymentModal } from '@/components/admin/PaymentModal';
import { toast } from 'sonner';
import type { Envio } from '@/data/types';
import { usePagos, usePagoStats } from '@/hooks/api/use-pagos';

const Pagos = () => {
  const [filtroEstado, setFiltroEstado] = useState<string>('todos');
  const [filtroMetodo, setFiltroMetodo] = useState<string>('todos');
  const [selectedEnvio, setSelectedEnvio] = useState<Envio | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);


  const apiFilters: Record<string, string | undefined> = {};
  if (filtroEstado !== 'todos') apiFilters.estadoPago = filtroEstado;
  if (filtroMetodo !== 'todos') apiFilters.metodoPago = filtroMetodo;

  const { data: apiPagos, isLoading } = usePagos(apiFilters);
  const { data: apiStats } = usePagoStats();

  const enviosFiltrados = (apiPagos?.data ?? []) as unknown as Envio[];
  const totalCobrado = apiStats?.totalCobrado ?? 0;
  const totalPendiente = apiStats?.totalPendiente ?? 0;
  const cobradoHoy = apiStats?.cobradoHoy ?? 0;
  const totalCount = apiPagos?.pagination?.total ?? enviosFiltrados.length;

  const handleCobrar = (envio: Envio) => {
    setSelectedEnvio(envio);
    setIsPaymentModalOpen(true);
  };

  const handlePaymentRegistered = () => {
    setIsPaymentModalOpen(false);
    setSelectedEnvio(null);
    toast.success('Pago registrado correctamente');
  };

  const handleExportPagosCSV = () => {
    const columns = [
      { label: 'Tracking', accessor: (e: Envio) => e.trackingNumber },
      { label: 'Cliente', accessor: (e: Envio) => e.clienteNombre },
      { label: 'Monto Total', accessor: (e: Envio) => e.costo },
      { label: 'Monto Recibido', accessor: (e: Envio) => e.pago?.montoRecibido || 0 },
      { label: 'Estado Pago', accessor: (e: Envio) => e.pago?.estadoPago || 'pendiente' },
      { label: 'Metodo', accessor: (e: Envio) => e.pago?.metodoPago || '-' },
      { label: 'Fecha Pago', accessor: (e: Envio) => e.pago?.fechaPago || '-' },
    ];

    exportToCSV(enviosFiltrados, 'pagos', columns);
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
          <h1 className="page-header-title">Gestion de Pagos</h1>
          <p className="page-header-subtitle">Control de cobros y estados de pago</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportPagosCSV} className="gap-1.5">
          <DownloadSimple size={14} weight="duotone" />
          Exportar CSV
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-success/6 flex items-center justify-center">
              <CheckCircle size={16} weight="duotone" className="text-success" />
            </div>
            <div>
              <p className="stat-card-value text-xl font-data text-success">
                {formatCurrency(totalCobrado)}
              </p>
              <p className="stat-card-label">Total Cobrado</p>
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
              <p className="stat-card-label">Pendiente de Cobro</p>
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
              <p className="stat-card-label">Cobrado Hoy</p>
            </div>
          </div>
        </div>
      </div>

      <div className="surface-card">
        <div className="p-5 pb-4">
          <div className="flex gap-3 mb-4">
            <Select value={filtroEstado} onValueChange={setFiltroEstado}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="pagado">Pagado</SelectItem>
                <SelectItem value="pendiente">Pendiente</SelectItem>
                <SelectItem value="pago_parcial">Pago Parcial</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filtroMetodo} onValueChange={setFiltroMetodo}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Metodo de pago" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="efectivo">Efectivo</SelectItem>
                <SelectItem value="transferencia">Transferencia</SelectItem>
                <SelectItem value="tarjeta">Tarjeta</SelectItem>
                <SelectItem value="contra_entrega">Contra entrega</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th>Tracking #</th>
                      <th>Cliente</th>
                      <th>Monto</th>
                      <th>Estado</th>
                      <th>Metodo</th>
                      <th>Fecha Pago</th>
                      <th className="text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enviosFiltrados.map((envio) => (
                      <tr key={envio.id}>
                        <td>
                          <Link
                            to={`/admin/envios/${envio.id}`}
                            className="text-primary hover:underline font-medium font-data text-[13px]"
                          >
                            {envio.trackingNumber}
                          </Link>
                        </td>
                        <td className="text-[13px]">{envio.clienteNombre}</td>
                        <td className="text-[13px] font-medium font-data">
                          {formatCurrency(envio.costo)}
                        </td>
                        <td>
                          <Badge
                            variant={estadoPagoColors[envio.pago?.estadoPago || 'pendiente'] as "muted" | "default" | "destructive" | "success" | "warning" | "outline" | "secondary"}
                            className="text-[11px]"
                          >
                            {envio.pago?.estadoPago === 'pagado' ? 'Pagado'
                              : envio.pago?.estadoPago === 'pago_parcial' ? 'Parcial'
                              : 'Pendiente'}
                          </Badge>
                        </td>
                        <td className="text-[13px]">
                          {envio.pago?.metodoPago
                            ? metodosPagoLabels[envio.pago.metodoPago]
                            : '-'}
                        </td>
                        <td className="text-[12px] text-muted-foreground">
                          {envio.pago?.fechaPago ? formatDate(envio.pago.fechaPago) : '-'}
                        </td>
                        <td className="text-right">
                          {envio.pago?.estadoPago === 'pendiente' || envio.pago?.estadoPago === 'pago_parcial' ? (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handleCobrar(envio)}
                            >
                              Cobrar
                            </Button>
                          ) : (
                            <Link to={`/admin/envios/${envio.id}`}>
                              <Button variant="ghost" size="sm" className="gap-1.5">
                                <Eye size={14} weight="duotone" />
                                Ver
                              </Button>
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {enviosFiltrados.length > 0 && (
                <div className="px-5 py-3 border-t border-border/40">
                  <p className="text-[12px] text-muted-foreground">
                    Mostrando {enviosFiltrados.length} de {totalCount} registros
                  </p>
                </div>
              )}

              {enviosFiltrados.length === 0 && (
                <div className="text-center py-16 px-4">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                    <MagnifyingGlass size={18} weight="duotone" className="text-muted-foreground/50" />
                  </div>
                  <p className="text-[13px] font-medium text-foreground">No se encontraron pagos</p>
                  <p className="text-[12px] text-muted-foreground mt-1">
                    Intenta ajustar los filtros de busqueda
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {selectedEnvio && (
        <PaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          envioId={selectedEnvio.id}
          montoTotal={selectedEnvio.costo}
          onPaymentRegistered={handlePaymentRegistered}
        />
      )}
    </div>
  );
};

export default Pagos;
