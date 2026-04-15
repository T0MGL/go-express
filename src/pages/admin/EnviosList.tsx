import { useState, useMemo, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/search-input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AnimatePresence, motion } from 'motion/react';
import { estadoLabels, estadoColors, estadosPagoColors } from '@/data/constants';
import { Plus, Download, ArrowUpRight, ChevronLeft, ChevronRight, Zap, Printer, Truck as TruckIcon, RefreshCcw, X } from 'lucide-react';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { exportToCSV } from '@/lib/exportCSV';
import { cn, formatDate, formatDateSmart } from '@/lib/utils';
import { toast } from 'sonner';
import type { Envio } from '@/data/types';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useEnvios, useBulkEnvioAction } from '@/hooks/api/use-envios';
import { useRepartidores } from '@/hooks/api/use-repartidores';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { QuickCreateEnvio } from '@/components/admin/QuickCreateEnvio';
import { printBatchLabels } from '@/components/printing/generateShippingLabel';

const PAGE_SIZE = 20;

type BulkModalState = null | 'estado' | 'repartidor';

const ESTADOS_BULK = [
  { value: 'recolectado', label: 'Retirado' },
  { value: 'en_transito', label: 'En tránsito' },
  { value: 'en_reparto', label: 'En reparto' },
  { value: 'entregado', label: 'Entregado' },
  { value: 'fallido', label: 'Entrega fallida' },
  { value: 'problema', label: 'Con problema' },
];

const EnviosList = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebouncedValue(searchTerm, 350);
  const [filterEstado, setFilterEstado] = useState<string>('todos');
  const [filterRepartidor, setFilterRepartidor] = useState<string>('todos');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkModal, setBulkModal] = useState<BulkModalState>(null);
  const [bulkEstado, setBulkEstado] = useState('');
  const [bulkDescripcion, setBulkDescripcion] = useState('');
  const [bulkRepartidorId, setBulkRepartidorId] = useState('');
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);

  const apiFilters = useMemo(() => {
    const f: Record<string, string | number | undefined> = {
      page,
      limit: PAGE_SIZE,
    };
    if (filterEstado !== 'todos') f.estado = filterEstado;
    if (debouncedSearch) f.search = debouncedSearch;
    if (filterRepartidor !== 'todos') f.repartidorId = filterRepartidor === 'sin_asignar' ? 'sin_asignar' : filterRepartidor;
    return f;
  }, [filterEstado, debouncedSearch, filterRepartidor, page]);

  const resetPage = () => {
    setPage(1);
    setSelectedIds(new Set());
  };

  const { data: apiEnvios, isLoading: loadingEnvios } = useEnvios(apiFilters);
  const { data: apiRepartidores } = useRepartidores();
  const bulkActionMut = useBulkEnvioAction();

  const repartidores = apiRepartidores?.data ?? [];
  const filteredEnvios = apiEnvios?.data ?? [];
  const totalCount = apiEnvios?.pagination?.total ?? filteredEnvios.length;
  const selectedEnvios = filteredEnvios.filter((e) => selectedIds.has(e.id));
  const selectedCount = selectedEnvios.length;

  // Drop selection IDs that are no longer in the current page so the header
  // checkbox reflects what the user can actually see.
  useEffect(() => {
    if (selectedIds.size === 0) return;
    const visibleIds = new Set(filteredEnvios.map((e) => e.id));
    const next = new Set<string>();
    selectedIds.forEach((id) => {
      if (visibleIds.has(id)) next.add(id);
    });
    if (next.size !== selectedIds.size) {
      setSelectedIds(next);
    }
  }, [filteredEnvios, selectedIds]);

  const allVisibleSelected = filteredEnvios.length > 0 && filteredEnvios.every((e) => selectedIds.has(e.id));
  const someVisibleSelected = filteredEnvios.some((e) => selectedIds.has(e.id));

  const getInitials = (nombre: string) => {
    return nombre
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  const getRepartidorNombre = (repartidorId: string | undefined) => {
    if (!repartidorId) return '';
    const rep = repartidores.find(r => r.id === repartidorId);
    return rep?.nombre ?? '';
  };

  const handleExportCSV = () => {
    const columns = [
      { label: 'Número de seguimiento', accessor: (e: Envio) => e.trackingNumber },
      { label: 'Cliente', accessor: (e: Envio) => e.clienteNombre },
      { label: 'Origen', accessor: (e: Envio) => e.origen },
      { label: 'Destino', accessor: (e: Envio) => e.destino },
      { label: 'Estado', accessor: (e: Envio) => estadoLabels[e.estado] },
      { label: 'Estado de cobro', accessor: (e: Envio) => e.pago?.estadoPago || 'pendiente' },
      { label: 'Costo (Gs)', accessor: (e: Envio) => e.costo },
      { label: 'Fecha de creación', accessor: (e: Envio) => formatDate(e.fecha) },
    ];

    exportToCSV(filteredEnvios, 'envios', columns);
    toast.success('Descarga de CSV iniciada');
  };

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelectedIds((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        filteredEnvios.forEach((e) => next.delete(e.id));
        return next;
      }
      const next = new Set(prev);
      filteredEnvios.forEach((e) => next.add(e.id));
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const openEstadoBulk = () => {
    setBulkEstado('');
    setBulkDescripcion('');
    setBulkModal('estado');
  };

  const openRepartidorBulk = () => {
    setBulkRepartidorId('');
    setBulkModal('repartidor');
  };

  const closeBulkModal = () => setBulkModal(null);

  const handleBulkPrint = () => {
    if (selectedCount === 0) return;
    const ok = printBatchLabels(selectedEnvios);
    if (ok) {
      toast.success(`${selectedCount} etiqueta${selectedCount === 1 ? '' : 's'} enviada${selectedCount === 1 ? '' : 's'} a imprimir`);
    } else {
      toast.error('No pudimos generar las etiquetas. Reintentá.');
    }
  };

  const reportBulkResult = (result: { total: number; exitosos: number; fallidos: Array<{ motivo: string }> }) => {
    if (result.fallidos.length === 0) {
      toast.success(`${result.exitosos} envío${result.exitosos === 1 ? '' : 's'} actualizado${result.exitosos === 1 ? '' : 's'}`);
    } else {
      toast(`${result.exitosos} actualizado${result.exitosos === 1 ? '' : 's'}, ${result.fallidos.length} rechazado${result.fallidos.length === 1 ? '' : 's'}`, {
        description: result.fallidos[0]?.motivo ?? 'Transición no permitida',
      });
    }
  };

  const handleBulkEstado = () => {
    if (!bulkEstado || selectedCount === 0) return;
    const ids = Array.from(selectedIds);
    const descripcion = bulkDescripcion.trim() || 'Actualización masiva';
    bulkActionMut.mutate(
      { action: 'cambiar_estado', ids, payload: { estado: bulkEstado, descripcion } },
      {
        onSuccess: (result) => {
          reportBulkResult(result);
          clearSelection();
          closeBulkModal();
        },
      },
    );
  };

  const handleBulkRepartidor = () => {
    if (!bulkRepartidorId || selectedCount === 0) return;
    const ids = Array.from(selectedIds);
    bulkActionMut.mutate(
      { action: 'asignar_repartidor', ids, payload: { repartidorId: bulkRepartidorId } },
      {
        onSuccess: (result) => {
          reportBulkResult(result);
          clearSelection();
          closeBulkModal();
        },
      },
    );
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div className="page-header">
          <div>
            <h1 className="page-header-title">Envíos</h1>
            <p className="page-header-subtitle">
              {totalCount > 0 ? `${totalCount} envío${totalCount === 1 ? '' : 's'} en total` : 'Todos los envíos del sistema'}
            </p>
          </div>
          <div className="flex gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={handleExportCSV}>
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  Exportar
                </Button>
              </TooltipTrigger>
              <TooltipContent>Descargar la lista actual en CSV</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setQuickCreateOpen(true)}>
                  <Zap className="w-3.5 h-3.5" />
                  Crear rápido
                </Button>
              </TooltipTrigger>
              <TooltipContent>Alta rápida con campos mínimos</TooltipContent>
            </Tooltip>
            <Link to="/admin/envios/nuevo">
              <Button size="sm" className="gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                Nuevo envío
              </Button>
            </Link>
          </div>
        </div>

        <div className="surface-card">
          <div className="p-4 border-b border-border/40">
            <div className="flex gap-3">
              <SearchInput
                value={searchTerm}
                onChange={(v) => { setSearchTerm(v); resetPage(); }}
                placeholder="Buscar por seguimiento, cliente, destinatario o teléfono..."
                className="flex-1"
              />
              <Select value={filterEstado} onValueChange={(v) => { setFilterEstado(v); resetPage(); }}>
                <SelectTrigger className={cn('w-44 transition-colors', filterEstado !== 'todos' && 'border-primary/50 bg-primary/5 text-foreground')}>
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los estados</SelectItem>
                  <SelectItem value="pendiente">Pendiente</SelectItem>
                  <SelectItem value="recolectado">Retirado</SelectItem>
                  <SelectItem value="en_transito">En tránsito</SelectItem>
                  <SelectItem value="en_reparto">En reparto</SelectItem>
                  <SelectItem value="entregado">Entregado</SelectItem>
                  <SelectItem value="fallido">Entrega fallida</SelectItem>
                  <SelectItem value="problema">Con problema</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterRepartidor} onValueChange={(v) => { setFilterRepartidor(v); resetPage(); }}>
                <SelectTrigger className={cn('w-44 transition-colors', filterRepartidor !== 'todos' && 'border-primary/50 bg-primary/5 text-foreground')}>
                  <SelectValue placeholder="Repartidor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los repartidores</SelectItem>
                  <SelectItem value="sin_asignar">Sin asignar</SelectItem>
                  {repartidores.filter(r => r.estado === 'activo').map(rep => (
                    <SelectItem key={rep.id} value={rep.id}>{rep.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <AnimatePresence initial={false}>
            {selectedCount > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="flex items-center justify-between gap-4 px-4 py-2.5 bg-primary/5 border-b border-primary/15"
              >
                <div className="flex items-center gap-3 text-[13px]">
                  <button
                    onClick={clearSelection}
                    className="w-6 h-6 rounded-full bg-background/80 hover:bg-background flex items-center justify-center transition-colors"
                    aria-label="Limpiar selección"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  <span className="font-medium text-foreground">
                    {selectedCount} envío{selectedCount === 1 ? '' : 's'} seleccionado{selectedCount === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={openEstadoBulk} disabled={bulkActionMut.isPending}>
                    <RefreshCcw className="w-3.5 h-3.5" />
                    Cambiar estado
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={openRepartidorBulk} disabled={bulkActionMut.isPending}>
                    <TruckIcon className="w-3.5 h-3.5" />
                    Asignar repartidor
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={handleBulkPrint} disabled={bulkActionMut.isPending}>
                    <Printer className="w-3.5 h-3.5" />
                    Imprimir etiquetas
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {loadingEnvios ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 py-2">
                  <div className="h-4 w-4 bg-muted/30 rounded animate-pulse" />
                  <div className="h-4 w-28 bg-muted/40 rounded animate-pulse" />
                  <div className="h-4 w-32 bg-muted/30 rounded animate-pulse" />
                  <div className="h-4 w-20 bg-muted/30 rounded animate-pulse" />
                  <div className="h-4 w-24 bg-muted/30 rounded animate-pulse" />
                  <div className="h-5 w-16 bg-muted/40 rounded-full animate-pulse" />
                  <div className="h-4 w-20 bg-muted/30 rounded animate-pulse" />
                  <div className="h-5 w-14 bg-muted/40 rounded-full animate-pulse" />
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
                      <th className="pl-4 w-10">
                        <Checkbox
                          checked={allVisibleSelected ? true : someVisibleSelected ? 'indeterminate' : false}
                          onCheckedChange={toggleAllVisible}
                          aria-label="Seleccionar todos los envíos visibles"
                          disabled={filteredEnvios.length === 0}
                        />
                      </th>
                      <th>Seguimiento</th>
                      <th>Cliente</th>
                      <th>Destino</th>
                      <th>Estado</th>
                      <th>Repartidor</th>
                      <th>Cobro</th>
                      <th>Creado</th>
                      <th className="text-right pr-4">Ver</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEnvios.map((envio) => {
                      const checked = selectedIds.has(envio.id);
                      return (
                        <tr
                          key={envio.id}
                          className={cn('group transition-colors', checked && 'bg-primary/5')}
                        >
                          <td className="pl-4">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => toggleRow(envio.id)}
                              aria-label={`Seleccionar envío ${envio.trackingNumber}`}
                            />
                          </td>
                          <td>
                            <Link
                              to={`/admin/envios/${envio.id}`}
                              className="font-data font-medium text-primary hover:text-primary/80 transition-colors"
                            >
                              {envio.trackingNumber}
                            </Link>
                          </td>
                          <td className="text-[13px]">{envio.clienteNombre}</td>
                          <td className="text-[13px] text-muted-foreground">{envio.destino}</td>
                          <td>
                            <Badge
                              variant={estadoColors[envio.estado]}
                              className={cn(envio.estado === 'problema' && 'badge-pulse')}
                            >
                              {estadoLabels[envio.estado]}
                            </Badge>
                          </td>
                          <td>
                            {envio.repartidorId ? (
                              <div className="flex items-center gap-2">
                                <Avatar className="h-5 w-5">
                                  <AvatarFallback className="text-[9px] bg-muted">
                                    {getInitials(getRepartidorNombre(envio.repartidorId))}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-[13px]">
                                  {getRepartidorNombre(envio.repartidorId)}
                                </span>
                              </div>
                            ) : (
                              <span className="text-[12px] text-muted-foreground/60">Sin asignar</span>
                            )}
                          </td>
                          <td>
                            <Badge
                              variant={estadosPagoColors[envio.pago?.estadoPago || 'pendiente']}
                            >
                              {envio.pago?.estadoPago === 'pagado' ? 'Cobrado'
                                : envio.pago?.estadoPago === 'pago_parcial' ? 'Cobro parcial'
                                : 'Sin cobrar'}
                            </Badge>
                          </td>
                          <td className="text-[13px] text-muted-foreground tabular-nums">{formatDateSmart(envio.fecha)}</td>
                          <td className="text-right pr-4">
                            <Link to={`/admin/envios/${envio.id}`}>
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground hover:text-foreground" aria-label="Abrir detalle del envío">
                                <ArrowUpRight className="w-3.5 h-3.5" />
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {filteredEnvios.length > 0 && (
                <div className="px-4 py-3 border-t border-border/40 flex items-center justify-between">
                  <p className="text-[12px] text-muted-foreground">
                    Viendo {filteredEnvios.length} de {totalCount} envío{totalCount === 1 ? '' : 's'}
                  </p>
                  {(apiEnvios?.pagination?.totalPages ?? 1) > 1 && (
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
                        {page} / {apiEnvios?.pagination?.totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 w-7 p-0"
                        disabled={page >= (apiEnvios?.pagination?.totalPages ?? 1)}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {filteredEnvios.length === 0 && (
                <div className="text-center py-16 px-4">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                    <MagnifyingGlass size={18} weight="duotone" className="text-muted-foreground/50" />
                  </div>
                  {searchTerm || filterEstado !== 'todos' || filterRepartidor !== 'todos' ? (
                    <>
                      <p className="text-[13px] font-medium text-foreground">Ningún envío coincide con los filtros</p>
                      <p className="text-[12px] text-muted-foreground mt-1">
                        Probá borrando los filtros o buscando otro término
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-[13px] font-medium text-foreground">Aún no hay envíos</p>
                      <p className="text-[12px] text-muted-foreground mt-1 mb-4">
                        Creá el primer envío para empezar
                      </p>
                      <Link to="/admin/envios/nuevo">
                        <Button size="sm" className="gap-1.5">
                          <Plus className="w-3.5 h-3.5" />
                          Crear primer envío
                        </Button>
                      </Link>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <Dialog open={bulkModal === 'estado'} onOpenChange={(open) => { if (!open) closeBulkModal(); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Cambiar estado de {selectedCount} envío{selectedCount === 1 ? '' : 's'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label className="text-[12px]">Nuevo estado</Label>
                <Select value={bulkEstado} onValueChange={setBulkEstado}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Elegí el nuevo estado" />
                  </SelectTrigger>
                  <SelectContent>
                    {ESTADOS_BULK.map((e) => (
                      <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Se aplica a cada envío por separado. Los que no puedan cambiar quedarán listados.
                </p>
              </div>
              <div>
                <Label className="text-[12px]">Descripción (opcional)</Label>
                <Textarea
                  value={bulkDescripcion}
                  onChange={(e) => setBulkDescripcion(e.target.value)}
                  placeholder="Motivo del cambio o detalle para el historial"
                  rows={3}
                  className="mt-1 text-[13px]"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="secondary" size="sm" onClick={closeBulkModal} disabled={bulkActionMut.isPending}>Cancelar</Button>
              <Button size="sm" onClick={handleBulkEstado} disabled={!bulkEstado || bulkActionMut.isPending}>
                {bulkActionMut.isPending ? 'Aplicando...' : 'Aplicar cambio'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={bulkModal === 'repartidor'} onOpenChange={(open) => { if (!open) closeBulkModal(); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Asignar repartidor a {selectedCount} envío{selectedCount === 1 ? '' : 's'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label className="text-[12px]">Repartidor</Label>
                <Select value={bulkRepartidorId} onValueChange={setBulkRepartidorId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Elegí un repartidor activo" />
                  </SelectTrigger>
                  <SelectContent>
                    {repartidores.filter(r => r.estado === 'activo').map(rep => (
                      <SelectItem key={rep.id} value={rep.id}>{rep.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Se asigna a cada envío habilitado. Los ya entregados quedan fuera.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="secondary" size="sm" onClick={closeBulkModal} disabled={bulkActionMut.isPending}>Cancelar</Button>
              <Button size="sm" onClick={handleBulkRepartidor} disabled={!bulkRepartidorId || bulkActionMut.isPending}>
                {bulkActionMut.isPending ? 'Asignando...' : 'Asignar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <QuickCreateEnvio open={quickCreateOpen} onOpenChange={setQuickCreateOpen} />
      </div>
    </TooltipProvider>
  );
};

export default EnviosList;
