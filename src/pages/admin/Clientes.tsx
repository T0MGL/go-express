import { useState, useMemo } from 'react';
import { estadoClienteLabels, estadoClienteColors, departamentosPY } from '@/data/constants';
import { portalStatusLabels, portalStatusColors } from '@/data/types';
import type { Cliente } from '@/data/types';
import { Plus, Download, ChevronRight } from 'lucide-react';
import {
  Buildings,
  Package, PencilSimple, ArrowSquareOut, Warning, TrendUp, CurrencyDollar,
  PaperPlaneTilt, ArrowClockwise, LockKey, Globe,
} from '@phosphor-icons/react';
import { exportToCSV } from '@/lib/exportCSV';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { cn, formatCurrency } from '@/lib/utils';
import { isValidPhone, normalizePhone, PHONE_PLACEHOLDER } from '@/lib/phone';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchInput } from '@/components/ui/search-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Link } from 'react-router-dom';
import {
  useClientes, useCliente, useCreateCliente, useUpdateCliente,
  useInviteCliente, useReinviteCliente, useResetClientePassword,
} from '@/hooks/api/use-clientes';
import { useDebouncedValue } from '@/hooks/use-debounced-value';

const Clientes = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebouncedValue(searchTerm, 350);
  const [filterEstado, setFilterEstado] = useState<string>('todos');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [detailClienteId, setDetailClienteId] = useState<string | null>(null);


  const apiFilters = useMemo(() => {
    const f: Record<string, string | undefined> = {};
    if (debouncedSearch) f.search = debouncedSearch;
    if (filterEstado !== 'todos') f.estado = filterEstado;
    return f;
  }, [debouncedSearch, filterEstado]);

  const { data: apiClientes, isLoading } = useClientes(apiFilters);
  const { data: detailCliente } = useCliente(detailClienteId ?? undefined);
  const createMut = useCreateCliente();
  const updateMut = useUpdateCliente();
  const inviteMut = useInviteCliente();
  const reinviteMut = useReinviteCliente();
  const resetPwMut = useResetClientePassword();

  // Resolve data
  const allClientes = apiClientes?.data ?? [];

  const filteredClientes = allClientes;

  const totales = {
    activos: allClientes.filter(c => c.estado === 'activo').length,
    totalEnvios: allClientes.reduce((sum, c) => sum + (c.totalEnvios ?? 0), 0),
    deudaTotal: allClientes
      .filter(c => (c.saldoCuentaCorriente ?? 0) < 0)
      .reduce((sum, c) => sum + Math.abs(c.saldoCuentaCorriente ?? 0), 0),
  };

  const handleExport = async () => {
    try {
      const qs = new URLSearchParams();
      if (debouncedSearch) qs.set('search', debouncedSearch);
      if (filterEstado !== 'todos') qs.set('estado', filterEstado);
      qs.set('limit', '10000');
      const exportData = await api.get<Cliente[]>(`/admin/clientes/export?${qs.toString()}`);
      const columns = [
        { label: 'Razon Social', accessor: (c: Cliente) => c.razonSocial },
        { label: 'RUC', accessor: (c: Cliente) => c.ruc },
        { label: 'Contacto', accessor: (c: Cliente) => c.contactoNombre },
        { label: 'Teléfono', accessor: (c: Cliente) => c.telefono },
        { label: 'Email', accessor: (c: Cliente) => c.email ?? '' },
        { label: 'Ciudad', accessor: (c: Cliente) => c.ciudad ?? '' },
        { label: 'Estado', accessor: (c: Cliente) => estadoClienteLabels[c.estado] },
        { label: 'Total Envíos', accessor: (c: Cliente) => c.totalEnvios },
        { label: 'Saldo Cta Cte', accessor: (c: Cliente) => c.saldoCuentaCorriente },
      ];
      exportToCSV(exportData, 'clientes', columns);
      toast.success('Exportando clientes a CSV...');
    } catch {
      toast.error('Error al exportar clientes');
    }
  };

  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    const razonSocial = (fd.get('razonSocial') as string || '').trim();
    const ruc = (fd.get('ruc') as string || '').trim();
    const contactoNombre = (fd.get('contactoNombre') as string || '').trim();
    const telefonoRaw = (fd.get('telefono') as string || '').trim();
    const email = (fd.get('email') as string || '').trim();
    const direccion = (fd.get('direccion') as string || '').trim();

    if (!razonSocial || !ruc || !contactoNombre || !telefonoRaw || !email || !direccion) {
      toast.error('Completa todos los campos obligatorios');
      return;
    }

    if (!isValidPhone(telefonoRaw)) {
      toast.error(`Formato de teléfono invalido. Ej: ${PHONE_PLACEHOLDER}`);
      return;
    }

    const telefono = normalizePhone(telefonoRaw);

    const body: Record<string, unknown> = {
      razonSocial,
      ruc,
      contactoNombre,
      contactoCargo: (fd.get('contactoCargo') as string || '').trim() || undefined,
      telefono,
      email,
      direccion,
      ciudad: fd.get('ciudad'),
      estado: fd.get('estado') || 'activo',
      notas: (fd.get('notas') as string || '').trim() || undefined,
    };

    if (selectedCliente) {
      updateMut.mutate(
        { id: selectedCliente.id, ...body },
        {
          onSuccess: () => {
            setIsModalOpen(false);
            toast.success('Cliente actualizado');
          },
          onError: () => toast.error('Error al actualizar cliente'),
        },
      );
    } else {
      createMut.mutate(body, {
        onSuccess: () => {
          setIsModalOpen(false);
          toast.success('Cliente creado correctamente');
        },
        onError: () => toast.error('Error al crear cliente'),
      });
    }
  };

  const handleInvite = (cliente: Cliente) => {
    inviteMut.mutate(cliente.id, {
      onSuccess: () => {
        toast.success(`Invitacion enviada a ${cliente.email}`);
        setDetailClienteId(null);
      },
      onError: (err) => {
        const msg = (err as { data?: { error?: string } })?.data?.error || 'Error al enviar invitacion';
        toast.error(msg);
      },
    });
  };

  const handleReinvite = (cliente: Cliente) => {
    reinviteMut.mutate(cliente.id, {
      onSuccess: () => {
        toast.success(`Invitacion reenviada a ${cliente.email}`);
        setDetailClienteId(null);
      },
      onError: (err) => {
        const msg = (err as { data?: { error?: string } })?.data?.error || 'Error al reenviar invitacion';
        toast.error(msg);
      },
    });
  };

  const handleResetPassword = (cliente: Cliente) => {
    resetPwMut.mutate(cliente.id, {
      onSuccess: (data) => {
        toast.success(data.message);
        setDetailClienteId(null);
      },
      onError: (err) => {
        const msg = (err as { data?: { error?: string } })?.data?.error || 'Error al resetear password';
        toast.error(msg);
      },
    });
  };

  const portalStatus = (cliente: Cliente) => cliente.portalStatus || 'sin_invitar';

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="page-header">
          <div>
            <h1 className="page-header-title">Clientes</h1>
            <p className="page-header-subtitle">
              {totales.activos > 0 ? `${totales.activos} empresa${totales.activos === 1 ? '' : 's'} activa${totales.activos === 1 ? '' : 's'}` : 'Empresas que usan Go Express'}
            </p>
          </div>
          <div className="flex gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={handleExport}>
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  Exportar
                </Button>
              </TooltipTrigger>
              <TooltipContent>Descargar la lista de clientes en CSV</TooltipContent>
            </Tooltip>
            <Button size="sm" onClick={() => { setSelectedCliente(null); setIsModalOpen(true); }} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              Nuevo cliente
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="stat-card">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-success/6 flex items-center justify-center">
                <Buildings size={16} weight="duotone" className="text-success" />
              </div>
              <div>
                <p className="stat-card-value text-xl">{totales.activos}</p>
                <p className="stat-card-label">Clientes activos</p>
              </div>
            </div>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/6 flex items-center justify-center">
                <TrendUp size={16} weight="duotone" className="text-primary" />
              </div>
              <div>
                <p className="stat-card-value text-xl">{totales.totalEnvios}</p>
                <p className="stat-card-label">Envíos hechos en total</p>
              </div>
            </div>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-destructive/6 flex items-center justify-center">
                <CurrencyDollar size={16} weight="duotone" className="text-destructive" />
              </div>
              <div>
                <p className="stat-card-value text-xl">{formatCurrency(totales.deudaTotal)}</p>
                <p className="stat-card-label">Deuda total de clientes</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Buscar por nombre de empresa, RUC, contacto o email..."
            className="flex-1"
          />
          <Select value={filterEstado} onValueChange={setFilterEstado}>
            <SelectTrigger className={cn('w-36 transition-colors', filterEstado !== 'todos' && 'border-primary/50 bg-primary/5 text-foreground')}>
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="activo">Activo</SelectItem>
              <SelectItem value="inactivo">Inactivo</SelectItem>
              <SelectItem value="suspendido">Suspendido</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Loading */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="surface-card p-4">
                <div className="flex items-start gap-4">
                  <div className="w-9 h-9 rounded-lg bg-muted/40 animate-pulse flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-48 bg-muted/40 rounded animate-pulse" />
                      <div className="h-5 w-14 bg-muted/30 rounded-full animate-pulse" />
                    </div>
                    <div className="h-3 w-32 bg-muted/20 rounded animate-pulse" />
                    <div className="grid grid-cols-4 gap-2">
                      <div className="h-3 w-24 bg-muted/20 rounded animate-pulse" />
                      <div className="h-3 w-20 bg-muted/20 rounded animate-pulse" />
                      <div className="h-3 w-28 bg-muted/20 rounded animate-pulse" />
                      <div className="h-3 w-16 bg-muted/20 rounded animate-pulse" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Client list */
          <div className="space-y-2">
            {filteredClientes.map((cliente) => (
              <div
                key={cliente.id}
                className="surface-card-interactive p-4"
                role="button"
                tabIndex={0}
                aria-label={`Ver detalle de ${cliente.razonSocial}`}
                onClick={() => { setDetailClienteId(cliente.id); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetailClienteId(cliente.id); } }}
              >
                <div className="flex items-start gap-4">
                  <div className="w-9 h-9 rounded-lg bg-primary/6 flex items-center justify-center flex-shrink-0 font-bold text-primary text-[11px]">
                    {getInitials(cliente.razonSocial)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-[14px] text-foreground truncate">{cliente.razonSocial}</h3>
                      <Badge variant={estadoClienteColors[cliente.estado]}>
                        {estadoClienteLabels[cliente.estado]}
                      </Badge>
                      <Badge variant={portalStatusColors[portalStatus(cliente)]}>
                        <Globe size={10} weight="bold" className="mr-1" />
                        {portalStatusLabels[portalStatus(cliente)]}
                      </Badge>
                    </div>

                    <p className="text-[11px] text-muted-foreground mt-0.5 mb-2.5 font-data">
                      {cliente.ciudad || 'Sin ciudad'}
                    </p>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 text-[13px]">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Package size={14} weight="duotone" className="flex-shrink-0 text-muted-foreground/60" />
                        <span>
                          <strong className="text-foreground">{cliente.enviosActivos}</strong> activos · {cliente.totalEnvios} total
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Buildings size={14} weight="duotone" className="flex-shrink-0 text-muted-foreground/60" />
                        <span className="capitalize">{cliente.plan || 'basico'}</span>
                      </div>
                      {(cliente.saldoCuentaCorriente ?? 0) < 0 && (
                        <div className="flex items-center gap-1.5 text-amber-500">
                          <CurrencyDollar size={14} weight="duotone" className="flex-shrink-0" />
                          <span className="font-data">{formatCurrency(Math.abs(cliente.saldoCuentaCorriente ?? 0))}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right hidden md:block">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        {cliente.saldoCuentaCorriente < 0 ? 'Debe' : cliente.saldoCuentaCorriente > 0 ? 'A favor' : 'Saldo'}
                      </p>
                      <p className={`font-semibold text-sm font-data ${
                        cliente.saldoCuentaCorriente < 0
                          ? 'text-destructive'
                          : cliente.saldoCuentaCorriente > 0
                          ? 'text-success'
                          : 'text-muted-foreground'
                      }`}>
                        {cliente.saldoCuentaCorriente === 0
                          ? 'Sin deuda'
                          : formatCurrency(Math.abs(cliente.saldoCuentaCorriente))}
                      </p>
                    </div>
                    <div className="flex gap-0.5">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={(e) => { e.stopPropagation(); }}
                            aria-label={`Ver envíos de ${cliente.razonSocial}`}
                            asChild
                          >
                            <Link to="/admin/envios">
                              <Package size={14} weight="duotone" />
                            </Link>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Ver envíos</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={(e) => { e.stopPropagation(); setSelectedCliente(cliente); setIsModalOpen(true); }}
                            aria-label={`Editar ${cliente.razonSocial}`}
                          >
                            <PencilSimple size={14} weight="duotone" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Editar</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={(e) => { e.stopPropagation(); }}
                            aria-label={`Ver portal de ${cliente.razonSocial}`}
                            asChild
                          >
                            <Link to="/portal">
                              <ArrowSquareOut size={14} weight="duotone" />
                            </Link>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Ver portal</TooltipContent>
                      </Tooltip>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
                  </div>
                </div>

                {cliente.saldoCuentaCorriente < -100000 && (
                  <div className="mt-3 pt-2.5 border-t border-border/40 flex items-center gap-2 text-[12px] text-warning">
                    <Warning size={13} weight="fill" />
                    <span>Saldo elevado, requiere atención</span>
                  </div>
                )}

                {cliente.estado === 'suspendido' && cliente.notas && (
                  <div className="mt-3 pt-2.5 border-t border-border/40 flex items-center gap-2 text-[12px] text-destructive">
                    <Warning size={13} weight="fill" />
                    <span>{cliente.notas}</span>
                  </div>
                )}
              </div>
            ))}

            {filteredClientes.length === 0 && (
              <div className="text-center py-16">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                  <Buildings size={18} weight="duotone" className="text-muted-foreground/50" />
                </div>
                <p className="text-[13px] font-medium">
                  {searchTerm || filterEstado !== 'todos' ? 'Ningún cliente coincide con los filtros' : 'Aún no hay clientes'}
                </p>
                <p className="text-[12px] text-muted-foreground mt-1 mb-4">
                  {searchTerm || filterEstado !== 'todos'
                    ? 'Proba borrando los filtros o buscando otro termino'
                    : 'Registrá el primer cliente para empezar a crear envíos'}
                </p>
                {!searchTerm && filterEstado === 'todos' && (
                  <Button size="sm" className="gap-1.5" onClick={() => setIsModalOpen(true)}>
                    <Plus className="w-3.5 h-3.5" />
                    Registrar primer cliente
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Create/Edit Modal */}
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle className="text-base">{selectedCliente ? 'Editar Cliente' : 'Nuevo Cliente'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleFormSubmit}>
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label className="text-[13px]">Razon Social *</Label>
                    <Input
                      name="razonSocial"
                      defaultValue={selectedCliente?.razonSocial}
                      placeholder="Ej: Distribuidora Central SA"
                      required
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label className="text-[13px]">RUC *</Label>
                    <Input
                      name="ruc"
                      defaultValue={selectedCliente?.ruc}
                      placeholder="80012345-1"
                      required
                      className="mt-1.5 font-data"
                    />
                  </div>
                  <div>
                    <Label className="text-[13px]">Contacto principal *</Label>
                    <Input
                      name="contactoNombre"
                      defaultValue={selectedCliente?.contactoNombre}
                      placeholder="Nombre completo"
                      required
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label className="text-[13px]">Cargo</Label>
                    <Input
                      name="contactoCargo"
                      defaultValue={selectedCliente?.contactoCargo ?? ''}
                      placeholder="Ej: Gerente de Logística"
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label className="text-[13px]">Teléfono *</Label>
                    <Input
                      name="telefono"
                      defaultValue={selectedCliente?.telefono}
                      placeholder={PHONE_PLACEHOLDER}
                      required
                      className="mt-1.5 font-data"
                    />
                  </div>
                  <div>
                    <Label className="text-[13px]">Email *</Label>
                    <Input
                      name="email"
                      type="email"
                      defaultValue={selectedCliente?.email}
                      placeholder="logistica@empresa.py"
                      required
                      className="mt-1.5"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[13px]">Dirección *</Label>
                    <Input
                      name="direccion"
                      defaultValue={selectedCliente?.direccion ?? ''}
                      placeholder="Av. Espana 1234"
                      required
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label className="text-[13px]">Ciudad *</Label>
                    <Select name="ciudad" defaultValue={selectedCliente?.ciudad ?? undefined}>
                      <SelectTrigger className="mt-1.5">
                        <SelectValue placeholder="Seleccionar" />
                      </SelectTrigger>
                      <SelectContent>
                        {departamentosPY.map((d) => (
                          <SelectItem key={d} value={d}>{d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[13px]">Estado</Label>
                    <Select name="estado" defaultValue={selectedCliente?.estado || 'activo'}>
                      <SelectTrigger className="mt-1.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="activo">Activo</SelectItem>
                        <SelectItem value="inactivo">Inactivo</SelectItem>
                        <SelectItem value="suspendido">Suspendido</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[13px]">Notas internas</Label>
                    <Textarea
                      name="notas"
                      defaultValue={selectedCliente?.notas ?? ''}
                      placeholder="Observaciones..."
                      className="mt-1.5 resize-none"
                      rows={2}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter className="mt-4">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsModalOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" size="sm" disabled={createMut.isPending || updateMut.isPending}>
                  {selectedCliente ? 'Guardar' : 'Crear Cliente'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Detail / Portal management modal */}
        <Dialog open={!!detailClienteId} onOpenChange={(open) => { if (!open) setDetailClienteId(null); }}>
          <DialogContent className="max-w-lg">
            {detailCliente && (
              <>
                <DialogHeader>
                  <DialogTitle className="text-base flex items-center gap-2">
                    {detailCliente.razonSocial}
                    <Badge variant={estadoClienteColors[detailCliente.estado]}>
                      {estadoClienteLabels[detailCliente.estado]}
                    </Badge>
                  </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-2">
                  {/* Client info */}
                  <div className="grid grid-cols-2 gap-3 text-[13px]">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">RUC</p>
                      <p className="font-data">{detailCliente.ruc}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Contacto</p>
                      <p>{detailCliente.contactoNombre}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Email</p>
                      <p className="font-data">{detailCliente.email}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Teléfono</p>
                      <p className="font-data">{detailCliente.telefono}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Ciudad</p>
                      <p>{detailCliente.ciudad}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Plan</p>
                      <p className="capitalize">{detailCliente.plan || 'basico'}</p>
                    </div>
                  </div>

                  {/* Portal access section */}
                  <div className="border-t border-border/50 pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Globe size={16} weight="duotone" className="text-primary" />
                        <h4 className="text-[13px] font-semibold">Acceso al Portal</h4>
                      </div>
                      <Badge variant={portalStatusColors[portalStatus(detailCliente)]}>
                        {portalStatusLabels[portalStatus(detailCliente)]}
                      </Badge>
                    </div>

                    {detailCliente.portalInvitedAt && (
                      <p className="text-[11px] text-muted-foreground mb-3">
                        Ultima invitacion: {new Date(detailCliente.portalInvitedAt).toLocaleString('es-PY', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {/* Show "Invitar al Portal" only if not yet invited */}
                      {portalStatus(detailCliente) === 'sin_invitar' && (
                        <Button
                          size="sm"
                          className="gap-1.5"
                          onClick={() => handleInvite(detailCliente)}
                          disabled={inviteMut.isPending}
                        >
                          <PaperPlaneTilt size={14} weight="bold" />
                          {inviteMut.isPending ? 'Enviando...' : 'Invitar al Portal'}
                        </Button>
                      )}

                      {/* Show "Reenviar Invitacion" if already invited but not active */}
                      {(portalStatus(detailCliente) === 'invitado' || portalStatus(detailCliente) === 'desactivado') && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => handleReinvite(detailCliente)}
                          disabled={reinviteMut.isPending}
                        >
                          <ArrowClockwise size={14} weight="bold" />
                          {reinviteMut.isPending ? 'Reenviando...' : 'Reenviar Invitacion'}
                        </Button>
                      )}

                      {/* Show "Resetear Password" if portal has been activated */}
                      {(portalStatus(detailCliente) === 'activo' || portalStatus(detailCliente) === 'invitado') && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => handleResetPassword(detailCliente)}
                          disabled={resetPwMut.isPending}
                        >
                          <LockKey size={14} weight="bold" />
                          {resetPwMut.isPending ? 'Enviando...' : 'Resetear Password'}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDetailClienteId(null);
                      setSelectedCliente(detailCliente);
                      setIsModalOpen(true);
                    }}
                    className="gap-1.5"
                  >
                    <PencilSimple size={14} weight="bold" />
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDetailClienteId(null)}
                  >
                    Cerrar
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
};

export default Clientes;
