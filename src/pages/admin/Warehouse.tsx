import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
// Plus is available for future use
// import { Plus } from 'lucide-react';
import {
  Package,
  MagnifyingGlass,
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
import { format } from 'date-fns';
import { toast } from 'sonner';
import BarcodeScanner from '@/components/admin/BarcodeScanner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import {
  useInventario,
  useWarehouseStats,
  useIngreso,
  useDespacho,
  useDevolucion,
} from '@/hooks/api/use-warehouse';

export default function Warehouse() {
  const [searchTerm, setSearchTerm] = useState('');
  const [entryOpen, setEntryOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [pickingOpen, setPickingOpen] = useState(false);
  const [returnsOpen, setReturnsOpen] = useState(false);
  const [packingSummaryOpen, setPackingSummaryOpen] = useState(false);

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


  const apiFilters: Record<string, string | undefined> = {};
  if (searchTerm) apiFilters.search = searchTerm;

  const { data: apiInventario, isLoading } = useInventario(apiFilters);
  const { data: apiStats } = useWarehouseStats();
  const ingresoMut = useIngreso();
  const despachoMut = useDespacho();
  const devolucionMut = useDevolucion();

  // Resolve data
  const inventario = apiInventario?.data ?? [];

  const filteredInventario = inventario;

  // Picking list with checked status
  const readyItems = inventario.filter(i => i.estadoAlmacen === 'listo_despacho');
  const [pickingList, setPickingList] = useState(
    readyItems.map(item => ({ ...item, picked: false }))
  );

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
            toast.success('Paquete ingresado al almacen');
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
    toast.success(`Codigo escaneado: ${code}`);
  };

  const handleScanExit = (code: string) => {
    setExitTracking(code);
    toast.success(`Codigo escaneado: ${code}`);
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
            <h1 className="page-header-title">Warehouse</h1>
            <p className="page-header-subtitle">Control de inventario simplificado</p>
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
                  Picking List
                </Button>
              </TooltipTrigger>
              <TooltipContent>Genera lista de paquetes listos con ruta sugerida</TooltipContent>
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
                  Resumen Despacho
                </Button>
              </TooltipTrigger>
              <TooltipContent>Ver resumen de lo que se despacha hoy</TooltipContent>
            </Tooltip>

            {/* Returns Dialog */}
            <Dialog open={returnsOpen} onOpenChange={setReturnsOpen}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="gap-1.5">
                      <ArrowCounterClockwise size={14} weight="duotone" />
                      Devoluciones
                    </Button>
                  </DialogTrigger>
                </TooltipTrigger>
                <TooltipContent>Reingresar paquetes devueltos al inventario</TooltipContent>
              </Tooltip>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Reingresar Devolucion</DialogTitle>
                  <DialogDescription>
                    Registra un paquete devuelto y actualiza su estado
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
                    <Label className="text-[13px]">Motivo de Devolucion</Label>
                    <Input
                      value={returnsForm.motivo}
                      onChange={(e) => setReturnsForm({...returnsForm, motivo: e.target.value})}
                      placeholder="Cliente ausente, direccion incorrecta..."
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
                      Ingresar Paquete
                    </Button>
                  </DialogTrigger>
                </TooltipTrigger>
                <TooltipContent>Registrar un paquete que entra al almacen</TooltipContent>
              </Tooltip>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Ingresar Paquete</DialogTitle>
                <DialogDescription>
                  Registra un nuevo paquete en el almacen
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
                <TooltipContent>Registrar la salida de un paquete del almacen</TooltipContent>
              </Tooltip>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Despachar Paquete</DialogTitle>
                <DialogDescription>
                  Registra la salida de un paquete del almacen
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
      <div className="grid grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
              <WarehouseIcon size={16} weight="duotone" className="text-muted-foreground" />
            </div>
            <div>
              <p className="stat-card-value text-xl">{stats.total}</p>
              <p className="stat-card-label">Total</p>
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
              <p className="stat-card-label">Ingresos Hoy</p>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/6 flex items-center justify-center">
              <Package size={16} weight="duotone" className="text-primary" />
            </div>
            <div>
              <p className="stat-card-value text-xl">{stats.enAlmacen}</p>
              <p className="stat-card-label">En Almacen</p>
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
              <p className="stat-card-label">Listos</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="surface-card">
        <div className="p-5 pb-4 flex items-center justify-between">
          <h3 className="text-[14px] font-semibold">Inventario</h3>
          <div className="relative w-80">
            <MagnifyingGlass size={15} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              placeholder="Buscar por tracking o cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="premium-table">
              <thead>
                <tr>
                  <th>Tracking</th>
                  <th>Cliente</th>
                  <th>Ubicacion</th>
                  <th>Estado</th>
                  <th>Peso</th>
                  <th>Ingreso</th>
                </tr>
              </thead>
              <tbody>
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
                      {format(new Date(item.fechaIngreso), 'dd/MM/yyyy')}
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
                        <th>Ubicacion</th>
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
                    <p className="stat-card-label">Total Envios</p>
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
