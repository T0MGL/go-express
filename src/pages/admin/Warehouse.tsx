import { useState, useMemo } from 'react';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchInput } from '@/components/ui/search-input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Package,
  TrendUp,
  Warehouse as WarehouseIcon,
  MapPin,
  Users,
  Scales,
  ArrowLineDown,
  ArrowLineUp,
  ClipboardText,
  CheckSquare,
  ArrowCounterClockwise,
} from '@phosphor-icons/react';
import {
  estadoAlmacenLabels,
  estadoAlmacenColors,
  type BadgeVariant,
} from '@/data/constants';
import { formatDateSmart } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { BarcodeScanner } from '@/components/admin/BarcodeScanner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import {
  useInventario,
  useWarehouseStats,
  useIngreso,
  useDespacho,
  useDevolucion,
} from '@/hooks/api/use-warehouse';

type WarehouseTab = 'hoy' | 'deposito' | 'todos';

function isTodayDate(dateStr: string): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
}

export default function Warehouse() {
  const [searchTerm, setSearchTerm] = useState('');
  const [entryOpen, setEntryOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [pickingOpen, setPickingOpen] = useState(false);
  const [returnsOpen, setReturnsOpen] = useState(false);
  const [packingSummaryOpen, setPackingSummaryOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<WarehouseTab>('hoy');

  const [entryForm, setEntryForm] = useState({
    tracking: '',
    cliente: '',
    peso: ''
  });

  const [exitTracking, setExitTracking] = useState('');

  const [returnsForm, setReturnsForm] = useState({
    tracking: '',
    motivo: ''
  });


  const debouncedSearch = useDebouncedValue(searchTerm, 350);

  const apiFilters = useMemo(() => {
    const f: Record<string, string | undefined> = {};
    if (debouncedSearch) f.search = debouncedSearch;
    return f;
  }, [debouncedSearch]);

  const { data: apiInventario, isLoading } = useInventario(apiFilters);
  const { data: apiStats } = useWarehouseStats();
  const ingresoMut = useIngreso();
  const despachoMut = useDespacho();
  const devolucionMut = useDevolucion();

  // Resolve data
  const inventario = apiInventario?.data ?? [];

  const tabCounts = useMemo(() => {
    const hoy = inventario.filter((i) =>
      (i.estadoAlmacen === 'recibido' || i.estadoAlmacen === 'listo_despacho') &&
      (isTodayDate(i.fechaIngreso) || i.prioridad === 'urgente'),
    ).length;
    const deposito = inventario.filter((i) =>
      i.estadoAlmacen === 'recibido' || i.estadoAlmacen === 'en_almacen',
    ).length;
    return { hoy, deposito, todos: inventario.length };
  }, [inventario]);

  const filteredInventario = useMemo(() => {
    if (activeTab === 'todos') return inventario;
    if (activeTab === 'hoy') {
      return inventario.filter((i) =>
        (i.estadoAlmacen === 'recibido' || i.estadoAlmacen === 'listo_despacho') &&
        (isTodayDate(i.fechaIngreso) || i.prioridad === 'urgente'),
      );
    }
    return inventario.filter((i) =>
      i.estadoAlmacen === 'recibido' || i.estadoAlmacen === 'en_almacen',
    );
  }, [inventario, activeTab]);

  // Picking list with checked status (lazy: built on demand, not from stale initial state)
  const [pickingList, setPickingList] = useState<Array<typeof inventario[number] & { picked: boolean }>>([]);

  // Stats
  const stats = {
    total: apiStats?.total ?? 0,
    ingresosHoy: apiStats?.ingresosHoy ?? 0,
    enAlmacen: apiStats?.enAlmacen ?? 0,
    listos: apiStats?.listos ?? 0,
  };

  const handleEntrySubmit = () => {
    if (!entryForm.tracking || !entryForm.cliente || !entryForm.peso) {
      toast.error('Completa todos los campos');
      return;
    }
    ingresoMut.mutate(
        {
          trackingNumber: entryForm.tracking,
          clienteNombre: entryForm.cliente,
          peso: parseFloat(entryForm.peso),
        },
        {
          onSuccess: () => {
            toast.success('Paquete ingresado al almacén');
            setEntryOpen(false);
            setEntryForm({ tracking: '', cliente: '', peso: '' });
          },
          onError: () => toast.error('Error al ingresar paquete'),
        },
      );
  };

  const handleExitSubmit = () => {
    if (!exitTracking) {
      toast.error('Escanea o ingresa el tracking');
      return;
    }
    despachoMut.mutate(
        { paqueteId: exitTracking },
        {
          onSuccess: () => {
            toast.success('Paquete despachado');
            setExitOpen(false);
            setExitTracking('');
          },
          onError: () => toast.error('Error al despachar paquete'),
        },
      );
  };

  const handleScanEntry = (code: string) => {
    setEntryForm({ ...entryForm, tracking: code });
    toast.success(`Código escaneado: ${code}`);
  };

  const handleScanExit = (code: string) => {
    setExitTracking(code);
    toast.success(`Código escaneado: ${code}`);
  };

  const handlePickingToggle = (itemId: string | number) => {
    setPickingList(prev =>
      prev.map(item =>
        String(item.id) === String(itemId) ? { ...item, picked: !item.picked } : item
      )
    );
  };

  const handleGeneratePickingList = () => {
    const currentReadyItems = inventario.filter(i => i.estadoAlmacen === 'listo_despacho');
    const sorted = [...currentReadyItems].sort((a, b) => a.ubicacion.localeCompare(b.ubicacion));
    setPickingList(sorted.map(item => ({ ...item, picked: false })));
    setPickingOpen(true);
    toast.success('Picking list generada con ruta sugerida');
  };

  const handleReturnsSubmit = () => {
    if (!returnsForm.tracking || !returnsForm.motivo) {
      toast.error('Completa todos los campos');
      return;
    }
    devolucionMut.mutate(
        {
          paqueteId: returnsForm.tracking,
          ubicacionDestino: 'Zona A - Estante 1',
          notas: returnsForm.motivo,
        },
        {
          onSuccess: () => {
            toast.success('Paquete devuelto reingresado al inventario');
            setReturnsOpen(false);
            setReturnsForm({ tracking: '', motivo: '' });
          },
          onError: () => toast.error('Error al reingresar paquete'),
        },
      );
  };

  // Packing summary data
  const todayDispatch = inventario.filter(i => i.estadoAlmacen === 'listo_despacho');
  const packingSummary = {
    totalEnvios: todayDispatch.length,
    pesoTotal: todayDispatch.reduce((sum, i) => sum + i.peso, 0).toFixed(1),
    destinos: [...new Set(todayDispatch.map(i => i.ubicacion.split('-')[0]))].length,
    repartidores: 0
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="page-header">
          <div>
            <h1 className="page-header-title">Almacén</h1>
            <p className="page-header-subtitle">Paquetes que están físicamente en depósito</p>
          </div>

          <div className="flex gap-2">
            {/* Picking List Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleGeneratePickingList}
                  className="gap-1.5"
                >
                  <ClipboardText size={14} weight="duotone" />
                  Armar picking
                </Button>
              </TooltipTrigger>
              <TooltipContent>Lista ordenada por ubicación para ir a buscar los paquetes</TooltipContent>
            </Tooltip>

            {/* Packing Summary Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPackingSummaryOpen(true)}
                  className="gap-1.5"
                >
                  <CheckSquare size={14} weight="duotone" />
                  Resumen del día
                </Button>
              </TooltipTrigger>
              <TooltipContent>Qué se va a despachar hoy, cuánto pesa, a qué destinos</TooltipContent>
            </Tooltip>

            {/* Returns Dialog */}
            <Dialog open={returnsOpen} onOpenChange={setReturnsOpen}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="gap-1.5">
                      <ArrowCounterClockwise size={14} weight="duotone" />
                      Devolución
                    </Button>
                  </DialogTrigger>
                </TooltipTrigger>
                <TooltipContent>Reingresar un paquete que volvió al depósito</TooltipContent>
              </Tooltip>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Reingresar devolución</DialogTitle>
                  <DialogDescription>
                    Registrá un paquete devuelto y actualizá su estado
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label className="text-[13px]">Tracking</Label>
                    <Input
                      value={returnsForm.tracking}
                      onChange={(e) => setReturnsForm({...returnsForm, tracking: e.target.value})}
                      placeholder="GE2024001234"
                      className="font-data"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[13px]">Motivo de devolución</Label>
                    <Input
                      value={returnsForm.motivo}
                      onChange={(e) => setReturnsForm({...returnsForm, motivo: e.target.value})}
                      placeholder="Cliente ausente, dirección incorrecta"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setReturnsOpen(false)}>
                    Cancelar
                  </Button>
                  <Button size="sm" onClick={handleReturnsSubmit} disabled={devolucionMut.isPending}>
                    Reingresar al Inventario
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Entry Dialog */}
            <Dialog open={entryOpen} onOpenChange={setEntryOpen}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-1.5">
                      <ArrowLineDown size={14} weight="duotone" />
                      Ingresar paquete
                    </Button>
                  </DialogTrigger>
                </TooltipTrigger>
                <TooltipContent>Un paquete llegó al depósito</TooltipContent>
              </Tooltip>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Ingresar paquete</DialogTitle>
                <DialogDescription>
                  Registrá un nuevo paquete en el almacén
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label className="text-[13px]">Tracking</Label>
                  <div className="flex gap-2">
                    <Input
                      value={entryForm.tracking}
                      onChange={(e) => setEntryForm({...entryForm, tracking: e.target.value})}
                      placeholder="GE2024001234"
                      className="flex-1 font-data"
                    />
                    <BarcodeScanner onScan={handleScanEntry} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-[13px]">Cliente</Label>
                  <Input
                    value={entryForm.cliente}
                    onChange={(e) => setEntryForm({...entryForm, cliente: e.target.value})}
                    placeholder="Nombre del cliente"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-[13px]">Peso (kg)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={entryForm.peso}
                    onChange={(e) => setEntryForm({...entryForm, peso: e.target.value})}
                    placeholder="5.5"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setEntryOpen(false)}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={handleEntrySubmit} disabled={ingresoMut.isPending}>
                  Confirmar Ingreso
                </Button>
              </div>
            </DialogContent>
          </Dialog>

            {/* Exit Dialog */}
            <Dialog open={exitOpen} onOpenChange={setExitOpen}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="gap-1.5">
                      <ArrowLineUp size={14} weight="duotone" />
                      Despachar
                    </Button>
                  </DialogTrigger>
                </TooltipTrigger>
                <TooltipContent>Un paquete sale del depósito al repartidor</TooltipContent>
              </Tooltip>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Despachar paquete</DialogTitle>
                <DialogDescription>
                  Registrá la salida de un paquete del almacén
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label className="text-[13px]">Tracking</Label>
                  <div className="flex gap-2">
                    <Input
                      value={exitTracking}
                      onChange={(e) => setExitTracking(e.target.value)}
                      placeholder="GE2024001234"
                      className="flex-1 font-data"
                    />
                    <BarcodeScanner onScan={handleScanExit} />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setExitOpen(false)}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={handleExitSubmit} disabled={despachoMut.isPending}>
                  Confirmar Despacho
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/6 flex items-center justify-center">
              <Package size={16} weight="duotone" className="text-primary" />
            </div>
            <div>
              <p className="stat-card-value text-xl">{stats.enAlmacen}</p>
              <p className="stat-card-label">Paquetes en depósito</p>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-warning/6 flex items-center justify-center">
              <CheckSquare size={16} weight="duotone" className="text-warning" />
            </div>
            <div>
              <p className="stat-card-value text-xl">{stats.listos}</p>
              <p className="stat-card-label">Listos para salir</p>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-success/6 flex items-center justify-center">
              <TrendUp size={16} weight="duotone" className="text-success" />
            </div>
            <div>
              <p className="stat-card-value text-xl">{stats.ingresosHoy}</p>
              <p className="stat-card-label">Entraron hoy</p>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
              <WarehouseIcon size={16} weight="duotone" className="text-muted-foreground" />
            </div>
            <div>
              <p className="stat-card-value text-xl">{stats.total}</p>
              <p className="stat-card-label">Movimiento total</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="surface-card">
        <div className="p-5 pb-4 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-[14px] font-semibold">Paquetes en el depósito</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Cambiá la pestaña para ver solo los de hoy o todo el depósito.
            </p>
          </div>
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Buscar por número de seguimiento o cliente..."
            className="w-80"
          />
        </div>

        <div className="px-5 flex items-center gap-1 border-b border-border/40" role="tablist" aria-label="Filtro de inventario">
          {([
            { id: 'hoy' as const, label: 'Para despachar hoy', count: tabCounts.hoy },
            { id: 'deposito' as const, label: 'En depósito', count: tabCounts.deposito },
            { id: 'todos' as const, label: 'Todos', count: tabCounts.todos },
          ]).map((tab) => {
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'relative px-3 py-2.5 text-[13px] font-medium transition-colors',
                  selected ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span>{tab.label}</span>
                <span className={cn(
                  'ml-1.5 text-[11px] tabular-nums',
                  selected ? 'text-primary' : 'text-muted-foreground/70',
                )}>
                  ({tab.count})
                </span>
                {selected && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary" />
                )}
              </button>
            );
          })}
        </div>
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 py-2">
                <div className="h-4 w-28 bg-muted/40 rounded animate-pulse" />
                <div className="h-4 w-24 bg-muted/30 rounded animate-pulse" />
                <div className="h-4 w-20 bg-muted/30 rounded animate-pulse" />
                <div className="h-5 w-16 bg-muted/40 rounded-full animate-pulse" />
                <div className="h-4 w-12 bg-muted/30 rounded animate-pulse" />
                <div className="h-4 w-20 bg-muted/30 rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="premium-table">
              <thead>
                <tr>
                  <th>Seguimiento</th>
                  <th>Cliente</th>
                  <th>Lugar en depósito</th>
                  <th>Estado</th>
                  <th>Peso</th>
                  <th>Entró</th>
                </tr>
              </thead>
              <tbody>
                {filteredInventario.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-16">
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                        <Package size={18} weight="duotone" className="text-muted-foreground/50" />
                      </div>
                      <p className="text-[13px] font-medium">
                        {searchTerm
                          ? 'Ningún paquete coincide con la búsqueda'
                          : activeTab === 'hoy'
                            ? 'No hay nada marcado para despachar hoy'
                            : activeTab === 'deposito'
                              ? 'No hay paquetes guardados en el depósito'
                              : 'El depósito está vacío'}
                      </p>
                      <p className="text-[12px] text-muted-foreground mt-1 mb-4">
                        {searchTerm
                          ? 'Probá con otro número o nombre'
                          : activeTab === 'hoy'
                            ? 'Cuando haya paquetes listos, aparecerán acá.'
                            : 'Registrá el primer ingreso con el botón de arriba'}
                      </p>
                      {!searchTerm && activeTab !== 'hoy' && (
                        <Button size="sm" className="gap-1.5" onClick={() => setEntryOpen(true)}>
                          <ArrowLineDown size={14} weight="duotone" />
                          Ingresar primer paquete
                        </Button>
                      )}
                    </td>
                  </tr>
                )}
                {filteredInventario.map((item) => (
                  <tr key={item.id}>
                    <td className="font-data text-[13px] font-medium">
                      {item.trackingNumber}
                    </td>
                    <td className="text-[13px]">{item.clienteNombre}</td>
                    <td>
                      <Badge variant="outline" className="text-[11px]">{item.ubicacion}</Badge>
                    </td>
                    <td>
                      <Badge
                        variant={(estadoAlmacenColors[item.estadoAlmacen] as BadgeVariant) ?? 'secondary'}
                        className="text-[11px]"
                      >
                        {estadoAlmacenLabels[item.estadoAlmacen] ?? item.estadoAlmacen}
                      </Badge>
                    </td>
                    <td className="text-[13px] font-data">{item.peso} kg</td>
                    <td className="text-[12px] text-muted-foreground">
                      {formatDateSmart(item.fechaIngreso)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

        {/* Picking List Dialog */}
        <Dialog open={pickingOpen} onOpenChange={setPickingOpen}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Picking List - Ruta Sugerida</DialogTitle>
              <DialogDescription>
                Paquetes agrupados por zona. Confirma cada item recogido.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {pickingList.length === 0 ? (
                <p className="text-center text-muted-foreground py-8 text-[13px]">
                  No hay paquetes listos para despacho
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="premium-table">
                    <thead>
                      <tr>
                        <th className="w-12">OK</th>
                        <th>Tracking</th>
                        <th>Cliente</th>
                        <th>Zona</th>
                        <th>Ubicación</th>
                        <th>Peso</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pickingList.map((item) => (
                        <tr
                          key={item.id}
                          className={item.picked ? 'bg-success/10' : ''}
                        >
                          <td>
                            <Checkbox
                              checked={item.picked}
                              onCheckedChange={() => handlePickingToggle(item.id)}
                            />
                          </td>
                          <td className="font-data text-[13px] font-medium">
                            {item.trackingNumber}
                          </td>
                          <td className="text-[13px]">{item.clienteNombre}</td>
                          <td>
                            <Badge variant="outline" className="text-[11px] gap-1">
                              <MapPin size={11} weight="duotone" />
                              {item.ubicacion.split('-')[0]}
                            </Badge>
                          </td>
                          <td>
                            <Badge variant="secondary" className="text-[11px]">{item.ubicacion}</Badge>
                          </td>
                          <td className="text-[13px] font-data">{item.peso} kg</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <Separator />

              <div className="flex items-center justify-between bg-muted/50 p-4 rounded-lg">
                <span className="text-[13px] font-medium">
                  Confirmados: {pickingList.filter(i => i.picked).length} / {pickingList.length}
                </span>
                <Button
                  size="sm"
                  onClick={() => {
                    setPickingOpen(false);
                    toast.success('Picking completado');
                  }}
                  disabled={pickingList.filter(i => i.picked).length === 0}
                >
                  Finalizar Picking
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Packing Summary Dialog */}
        <Dialog open={packingSummaryOpen} onOpenChange={setPackingSummaryOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Resumen de Despacho Hoy</DialogTitle>
              <DialogDescription>
                Vista general de lo que se esta despachando
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="stat-card">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/6 flex items-center justify-center">
                    <Package size={16} weight="duotone" className="text-primary" />
                  </div>
                  <div>
                    <p className="stat-card-value text-xl">{packingSummary.totalEnvios}</p>
                    <p className="stat-card-label">Total Envíos</p>
                  </div>
                </div>
              </div>

              <div className="stat-card">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-warning/6 flex items-center justify-center">
                    <Scales size={16} weight="duotone" className="text-warning" />
                  </div>
                  <div>
                    <p className="stat-card-value text-xl">{packingSummary.pesoTotal} <span className="text-sm text-muted-foreground font-normal">kg</span></p>
                    <p className="stat-card-label">Peso Total</p>
                  </div>
                </div>
              </div>

              <div className="stat-card">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-success/6 flex items-center justify-center">
                    <MapPin size={16} weight="duotone" className="text-success" />
                  </div>
                  <div>
                    <p className="stat-card-value text-xl">{packingSummary.destinos}</p>
                    <p className="stat-card-label">Destinos</p>
                  </div>
                </div>
              </div>

              <div className="stat-card">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-info/6 flex items-center justify-center">
                    <Users size={16} weight="duotone" className="text-info" />
                  </div>
                  <div>
                    <p className="stat-card-value text-xl">{packingSummary.repartidores}</p>
                    <p className="stat-card-label">Repartidores</p>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <h4 className="section-label">Paquetes a Despachar</h4>
              <div className="max-h-48 overflow-y-auto space-y-2">
                {todayDispatch.map(item => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-2 bg-muted/50 rounded-lg text-[13px]"
                  >
                    <span className="font-data font-medium">{item.trackingNumber}</span>
                    <span className="text-muted-foreground">{item.clienteNombre}</span>
                    <Badge variant="outline" className="text-[11px]">{item.ubicacion}</Badge>
                  </div>
                ))}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
