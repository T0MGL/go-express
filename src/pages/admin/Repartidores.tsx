import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { SearchInput } from '@/components/ui/search-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { isValidPhone, normalizePhone, PHONE_PLACEHOLDER } from '@/lib/phone';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { Switch } from '@/components/ui/switch';
import { estadoLabels } from '@/data/constants';
import { Plus } from 'lucide-react';
import { Eye, UserMinus, UserPlus as UserActivate, UsersThree } from '@phosphor-icons/react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useRepartidores, useRepartidorEnvios, useCreateRepartidor, useToggleRepartidorEstado } from '@/hooks/api/use-repartidores';
import { toast } from 'sonner';

const Repartidores = () => {
  const [busqueda, setBusqueda] = useState('');
  const [filterEstado, setFilterEstado] = useState<string>('todos');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [nuevoEstado, setNuevoEstado] = useState(true);
  const [selectedRepartidor, setSelectedRepartidor] = useState<string | null>(null);
  const [showEnviosModal, setShowEnviosModal] = useState(false);
  const [confirmToggleId, setConfirmToggleId] = useState<string | null>(null);

  const debouncedBusqueda = useDebouncedValue(busqueda, 350);

  const apiFilters = useMemo(() => {
    const f: Record<string, string | undefined> = {};
    if (filterEstado !== 'todos') f.estado = filterEstado;
    return f;
  }, [filterEstado]);

  const { data: apiRepartidores, isLoading } = useRepartidores(apiFilters);
  const { data: apiEnviosAsignados } = useRepartidorEnvios(
    selectedRepartidor && showEnviosModal ? selectedRepartidor : undefined,
  );
  const createMut = useCreateRepartidor();
  const toggleEstadoMut = useToggleRepartidorEstado();

  const allRepartidores = apiRepartidores?.data ?? [];

  const filteredRepartidores = useMemo(() => {
    if (!debouncedBusqueda) return allRepartidores;
    const q = debouncedBusqueda.toLowerCase();
    return allRepartidores.filter((r) =>
      r.nombre.toLowerCase().includes(q) ||
      (r.placa?.toLowerCase().includes(q) ?? false) ||
      (r.telefono?.toLowerCase().includes(q) ?? false)
    );
  }, [allRepartidores, debouncedBusqueda]);

  const totalCount = apiRepartidores?.pagination?.total ?? allRepartidores.length;

  const enviosAsignados = apiEnviosAsignados ?? [];

  const getInitials = (nombre: string) => {
    return nombre
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  const getAvatarColor = (id: string) => {
    const colors = [
      'bg-primary text-primary-foreground',
      'bg-success text-white',
      'bg-info text-white',
      'bg-warning text-white',
      'bg-destructive text-destructive-foreground',
      'bg-primary/80 text-primary-foreground',
      'bg-success/80 text-white',
      'bg-info/80 text-white',
    ];
    return colors[parseInt(id) % colors.length];
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const fd = new FormData(form);

    const nombre = (fd.get('nombre') as string || '').trim();
    const telefonoRaw = (fd.get('telefono') as string || '').trim();
    const vehiculo = (fd.get('vehiculo') as string || '').trim();
    const placa = (fd.get('placa') as string || '').trim();
    const licencia = (fd.get('licencia') as string || '').trim();

    if (!nombre || !telefonoRaw || !vehiculo || !placa) {
      toast.error('Completa todos los campos obligatorios');
      return;
    }

    if (!isValidPhone(telefonoRaw)) {
      toast.error(`Formato de teléfono invalido. Ej: ${PHONE_PLACEHOLDER}`);
      return;
    }

    const telefono = normalizePhone(telefonoRaw);

    createMut.mutate(
      {
        nombre,
        telefono,
        vehiculo,
        placa,
        licencia,
        estado: nuevoEstado ? 'activo' : 'inactivo',
      },
      {
        onSuccess: () => {
          setIsModalOpen(false);
          form.reset();
          toast.success('Repartidor creado correctamente');
        },
        onError: () => toast.error('Error al crear repartidor'),
      },
    );
  };

  const handleToggleEstado = () => {
    if (!confirmToggleId) return;
    toggleEstadoMut.mutate(confirmToggleId, {
        onSuccess: () => {
          toast.success('Estado actualizado');
          setConfirmToggleId(null);
        },
        onError: () => toast.error('Error al actualizar estado'),
      });
  };

  const confirmToggleRep = allRepartidores.find(r => r.id === confirmToggleId);

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div className="page-header">
          <div>
            <h1 className="page-header-title">Repartidores</h1>
            <p className="page-header-subtitle">
              {totalCount > 0 ? `${totalCount} repartidor${totalCount === 1 ? '' : 'es'} en total` : 'Equipo que entrega los envíos'}
            </p>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" onClick={() => setIsModalOpen(true)} className="gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                Nuevo repartidor
              </Button>
            </TooltipTrigger>
            <TooltipContent>Agregar un repartidor nuevo al equipo</TooltipContent>
          </Tooltip>
        </div>

      <div className="surface-card">
        <div className="p-5 pb-4">
          <div className="flex flex-wrap gap-3 mb-4">
            <SearchInput
              value={busqueda}
              onChange={setBusqueda}
              placeholder="Buscar por nombre, placa o teléfono..."
              className="flex-1 min-w-48"
            />
            <Select value={filterEstado} onValueChange={setFilterEstado}>
              <SelectTrigger className={cn('w-48', filterEstado !== 'todos' && 'border-primary/50 bg-primary/5 text-foreground')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="activo">Activos</SelectItem>
                <SelectItem value="inactivo">Inactivos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 py-2">
                  <div className="h-7 w-7 bg-muted/40 rounded-full animate-pulse" />
                  <div className="h-4 w-32 bg-muted/40 rounded animate-pulse" />
                  <div className="h-4 w-24 bg-muted/30 rounded animate-pulse" />
                  <div className="h-4 w-20 bg-muted/30 rounded animate-pulse" />
                  <div className="h-4 w-16 bg-muted/30 rounded animate-pulse" />
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
                      <th>Repartidor</th>
                      <th>Teléfono</th>
                      <th>Vehículo</th>
                      <th>Placa</th>
                      <th>Estado</th>
                      <th>Entregas hoy</th>
                      <th className="text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRepartidores.map((repartidor) => (
                      <tr key={repartidor.id}>
                        <td>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-7 w-7">
                              <AvatarFallback className={`${getAvatarColor(repartidor.id)} text-[10px]`}>
                                {getInitials(repartidor.nombre)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-medium text-[13px]">{repartidor.nombre}</span>
                          </div>
                        </td>
                        <td className="text-[13px] font-data text-muted-foreground">{repartidor.telefono || 'Sin registrar'}</td>
                        <td className="text-[13px]">{repartidor.vehiculo}</td>
                        <td className="text-[13px] font-data">{repartidor.placa}</td>
                        <td>
                          <Badge variant={repartidor.estado === 'activo' ? 'success' : 'muted'}>
                            {repartidor.estado === 'activo' ? 'Activo' : 'Inactivo'}
                          </Badge>
                        </td>
                        <td className="text-[13px]">
                          {repartidor.enviosHoy === 0 ? (
                            <span className="text-muted-foreground">Sin asignaciones</span>
                          ) : (
                            <span>{repartidor.enviosHoy} {repartidor.enviosHoy === 1 ? 'envio' : 'envios'}</span>
                          )}
                        </td>
                        <td>
                          <div className="flex gap-1 justify-end">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  aria-label={`Ver envíos asignados a ${repartidor.nombre}`}
                                  onClick={() => {
                                    setSelectedRepartidor(repartidor.id);
                                    setShowEnviosModal(true);
                                  }}
                                >
                                  <Eye size={14} weight="duotone" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Ver envíos asignados</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  aria-label={`${repartidor.estado === 'activo' ? 'Desactivar' : 'Activar'} ${repartidor.nombre}`}
                                  onClick={() => setConfirmToggleId(repartidor.id)}
                                  disabled={toggleEstadoMut.isPending}
                                >
                                  {repartidor.estado === 'activo' ? (
                                    <UserMinus size={14} weight="duotone" className="text-destructive" />
                                  ) : (
                                    <UserActivate size={14} weight="duotone" className="text-success" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{repartidor.estado === 'activo' ? 'Desactivar' : 'Activar'} repartidor</TooltipContent>
                            </Tooltip>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredRepartidores.length > 0 && (
                <div className="px-5 py-3 border-t border-border/40">
                  <p className="text-[12px] text-muted-foreground">
                    Viendo {filteredRepartidores.length} de {totalCount} repartidor{totalCount === 1 ? '' : 'es'}
                  </p>
                </div>
              )}

              {filteredRepartidores.length === 0 && (
                <div className="text-center py-16 px-4">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                    <UsersThree size={18} weight="duotone" className="text-muted-foreground/50" />
                  </div>
                  <p className="text-[13px] font-medium text-foreground">
                    {busqueda || filterEstado !== 'todos' ? 'Ningún repartidor coincide con los filtros' : 'Aún no hay repartidores'}
                  </p>
                  <p className="text-[12px] text-muted-foreground mt-1 mb-4">
                    {busqueda || filterEstado !== 'todos'
                      ? 'Proba borrando los filtros o buscando otro termino'
                      : 'Agrega el primer repartidor para empezar a asignar envíos'}
                  </p>
                  {!busqueda && filterEstado === 'todos' && (
                    <Button size="sm" className="gap-1.5" onClick={() => setIsModalOpen(true)}>
                      <Plus className="w-3.5 h-3.5" />
                      Agregar primer repartidor
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <Dialog open={showEnviosModal} onOpenChange={setShowEnviosModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Envíos Asignados Hoy</DialogTitle>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto">
            <table className="premium-table">
              <thead>
                <tr>
                  <th>Tracking</th>
                  <th>Destino</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {enviosAsignados.map(envio => (
                  <tr key={envio.id}>
                    <td className="font-data text-[13px]">{envio.trackingNumber}</td>
                    <td className="text-[13px]">{envio.destino}</td>
                    <td><Badge variant="secondary" className="text-[11px]">{estadoLabels[envio.estado]}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {enviosAsignados.length === 0 && (
              <p className="text-center py-8 text-muted-foreground text-[13px]">No hay envíos asignados</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmToggleId} onOpenChange={(open) => { if (!open) setConfirmToggleId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">
              {confirmToggleRep?.estado === 'activo' ? 'Desactivar' : 'Activar'} repartidor
            </DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-muted-foreground py-2">
            {confirmToggleRep?.estado === 'activo'
              ? `Se desactivara a ${confirmToggleRep?.nombre ?? ''}. No podra recibir envíos asignados.`
              : `Se activara a ${confirmToggleRep?.nombre ?? ''}. Podra recibir envíos nuevamente.`
            }
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setConfirmToggleId(null)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              variant={confirmToggleRep?.estado === 'activo' ? 'destructive' : 'default'}
              onClick={handleToggleEstado}
              disabled={toggleEstadoMut.isPending}
            >
              {toggleEstadoMut.isPending ? 'Procesando...' : (confirmToggleRep?.estado === 'activo' ? 'Desactivar' : 'Activar')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo Repartidor</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <Label htmlFor="nombre" className="text-[13px]">Nombre completo *</Label>
                <Input id="nombre" name="nombre" required className="mt-1.5" />
              </div>
              <div>
                <Label htmlFor="telefono" className="text-[13px]">Teléfono *</Label>
                <Input id="telefono" name="telefono" type="tel" placeholder={PHONE_PLACEHOLDER} required className="mt-1.5 font-data" />
              </div>
              <div>
                <Label htmlFor="vehiculo" className="text-[13px]">Tipo de vehículo *</Label>
                <Select name="vehiculo" required>
                  <SelectTrigger id="vehiculo" className="mt-1.5">
                    <SelectValue placeholder="Seleccionar vehículo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Moto">Moto</SelectItem>
                    <SelectItem value="Auto">Auto</SelectItem>
                    <SelectItem value="Camioneta">Camioneta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="placa" className="text-[13px]">Placa *</Label>
                <Input id="placa" name="placa" placeholder="ABC 123" required className="mt-1.5 font-data" />
              </div>
              <div>
                <Label htmlFor="licencia" className="text-[13px]">Licencia de conducir</Label>
                <Input id="licencia" name="licencia" placeholder="LIC-123456" className="mt-1.5 font-data" />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="estado" className="text-[13px]">Estado</Label>
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-muted-foreground">
                    {nuevoEstado ? 'Activo' : 'Inactivo'}
                  </span>
                  <Switch id="estado" checked={nuevoEstado} onCheckedChange={setNuevoEstado} />
                </div>
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={createMut.isPending}>Guardar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      </div>
    </TooltipProvider>
  );
};

export default Repartidores;
