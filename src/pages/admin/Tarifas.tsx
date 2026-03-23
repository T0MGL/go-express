import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  mockTarifas,
  Tarifa,
  tipoServicioLabels,
  departamentosPY,
} from '@/data/mockData';
import { formatCurrency } from '@/lib/utils';
import { Plus } from 'lucide-react';
import {
  MagnifyingGlass,
  PencilSimple,
  Trash,
  Warning,
  Calculator,
} from '@phosphor-icons/react';
import {
  useTarifas,
  useCreateTarifa,
  useUpdateTarifa,
  useDeleteTarifa,
  useRestoreTarifa,
} from '@/hooks/api/use-tarifas';
import { toast as sonnerToast } from 'sonner';

const USUARIO_ACTUAL = 'Admin Principal';

const ciudadesPY = [
  'Asuncion',
  'Ciudad del Este',
  'Encarnacion',
  'Luque',
  'San Lorenzo',
  'Lambare',
  'Fernando de la Mora',
  'Capiata',
  'Limpio',
  'Nemby',
  'Villarrica',
  'Pedro Juan Caballero',
  'Concepcion',
  'Coronel Oviedo',
  'Caaguazu',
  'Itaugua',
  ...departamentosPY,
];

const ciudadesUnicas = [...new Set(ciudadesPY)].sort();

const emptyForm: Partial<Tarifa> = {
  origen: '',
  destino: '',
  tipoServicio: 'estandar',
  precioBase: 0,
  pesoBase: 3,
  precioPorKgExtra: 0,
  factorDimensional: 5000,
  activo: true,
};

const Tarifas = () => {
  const { toast } = useToast();
  const useMock = false;

  // Local state for mock mode
  const [localTarifas, setLocalTarifas] = useState<Tarifa[]>(mockTarifas);
  const [busqueda, setBusqueda] = useState('');
  const [mostrarEliminadas, setMostrarEliminadas] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<Tarifa | null>(null);
  const [form, setForm] = useState<Partial<Tarifa>>(emptyForm);

  const [deleteModal, setDeleteModal] = useState<{ open: boolean; tarifa: Tarifa | null }>({ open: false, tarifa: null });
  const [motivoEliminacion, setMotivoEliminacion] = useState('');

  // API hooks
  const apiFilters: Record<string, string | boolean | undefined> = {};
  if (busqueda) apiFilters.search = busqueda;
  if (mostrarEliminadas) apiFilters.includeDeleted = true;

  const { data: apiTarifas, isLoading } = useTarifas(apiFilters);
  const createMut = useCreateTarifa();
  const updateMut = useUpdateTarifa();
  const deleteMut = useDeleteTarifa();
  const restoreMut = useRestoreTarifa();

  // Resolve data
  const tarifas = useMock ? localTarifas : (apiTarifas?.data ?? []);

  const tarifasFiltradas = tarifas.filter((t) => {
    if (!mostrarEliminadas && t.eliminado) return false;
    const q = busqueda.toLowerCase();
    return (
      t.origen.toLowerCase().includes(q) ||
      t.destino.toLowerCase().includes(q) ||
      tipoServicioLabels[t.tipoServicio].toLowerCase().includes(q)
    );
  });

  const abrirNueva = () => {
    setEditando(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const abrirEditar = (t: Tarifa) => {
    setEditando(t);
    setForm({ ...t });
    setModalOpen(true);
  };

  const guardar = () => {
    if (!form.origen || !form.destino || !form.tipoServicio) {
      toast({ title: 'Completa los campos obligatorios', variant: 'destructive' });
      return;
    }

    if (!useMock) {
      const body = {
        origen: form.origen,
        destino: form.destino,
        tipoServicio: form.tipoServicio,
        precioBase: form.precioBase,
        pesoBase: form.pesoBase,
        precioPorKgExtra: form.precioPorKgExtra,
        factorDimensional: form.factorDimensional,
      };

      if (editando) {
        updateMut.mutate(
          { id: editando.id, ...body },
          {
            onSuccess: () => {
              sonnerToast.success('Tarifa actualizada correctamente');
              setModalOpen(false);
            },
            onError: () => sonnerToast.error('Error al actualizar tarifa'),
          },
        );
      } else {
        createMut.mutate(body, {
          onSuccess: () => {
            sonnerToast.success('Tarifa creada correctamente');
            setModalOpen(false);
          },
          onError: () => sonnerToast.error('Error al crear tarifa'),
        });
      }
    } else {
      // Mock mode
      if (editando) {
        setLocalTarifas((prev) =>
          prev.map((t) =>
            t.id === editando.id
              ? { ...t, ...form, creadoPor: t.creadoPor, creadoEn: t.creadoEn }
              : t
          )
        );
        toast({ title: 'Tarifa actualizada correctamente' });
      } else {
        const nueva: Tarifa = {
          ...(form as Tarifa),
          id: `t${Date.now()}`,
          creadoPor: USUARIO_ACTUAL,
          creadoEn: new Date().toISOString(),
          activo: true,
          eliminado: false,
        };
        setLocalTarifas((prev) => [nueva, ...prev]);
        toast({ title: 'Tarifa creada correctamente' });
      }
      setModalOpen(false);
    }
  };

  const confirmarEliminar = () => {
    if (!deleteModal.tarifa || !motivoEliminacion.trim()) {
      toast({ title: 'Indica el motivo de desactivacion', variant: 'destructive' });
      return;
    }

    if (!useMock) {
      deleteMut.mutate(
        { id: deleteModal.tarifa.id, motivo: motivoEliminacion.trim() },
        {
          onSuccess: () => {
            sonnerToast.success('Tarifa desactivada. Registro conservado en el sistema.');
            setDeleteModal({ open: false, tarifa: null });
            setMotivoEliminacion('');
          },
          onError: () => sonnerToast.error('Error al desactivar tarifa'),
        },
      );
    } else {
      setLocalTarifas((prev) =>
        prev.map((t) =>
          t.id === deleteModal.tarifa!.id
            ? {
                ...t,
                activo: false,
                eliminado: true,
                eliminadoPor: USUARIO_ACTUAL,
                eliminadoEn: new Date().toISOString(),
                motivoEliminacion: motivoEliminacion.trim(),
              }
            : t
        )
      );
      toast({ title: 'Tarifa desactivada. Registro conservado en el sistema.' });
      setDeleteModal({ open: false, tarifa: null });
      setMotivoEliminacion('');
    }
  };

  const restaurar = (id: string) => {
    if (!useMock) {
      restoreMut.mutate(id, {
        onSuccess: () => sonnerToast.success('Tarifa restaurada'),
        onError: () => sonnerToast.error('Error al restaurar tarifa'),
      });
    } else {
      setLocalTarifas((prev) =>
        prev.map((t) =>
          t.id === id
            ? { ...t, activo: true, eliminado: false, eliminadoPor: undefined, eliminadoEn: undefined, motivoEliminacion: undefined }
            : t
        )
      );
      toast({ title: 'Tarifa restaurada' });
    }
  };

  const activas = tarifas.filter((t) => !t.eliminado).length;
  const desactivadas = tarifas.filter((t) => t.eliminado).length;

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Gestion de Tarifas</h1>
          <p className="page-header-subtitle">
            {activas} tarifas activas · {desactivadas} desactivadas
          </p>
        </div>
        <Button size="sm" onClick={abrirNueva} className="gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Nueva Tarifa
        </Button>
      </div>

      {/* Info volumetrico */}
      <div className="surface-card p-4 bg-primary/5 border-primary/20 flex items-start gap-3">
        <Calculator size={16} weight="duotone" className="text-primary flex-shrink-0 mt-0.5" />
        <div className="text-[13px]">
          <span className="font-medium">Motor Volumetrico: </span>
          <span className="text-muted-foreground">
            Peso volumetrico = (Largo x Ancho x Alto) / Factor Dimensional. Se cobra el mayor entre peso real y volumetrico.
            El factor estandar es <strong>5.000 cm3/kg</strong>.
          </span>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <MagnifyingGlass size={15} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por origen, destino o tipo..."
            className="pl-9"
          />
        </div>
        <Button
          variant={mostrarEliminadas ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => setMostrarEliminadas((v) => !v)}
          className="gap-1.5"
        >
          <Warning size={14} weight="duotone" />
          {mostrarEliminadas ? 'Ocultar desactivadas' : 'Ver desactivadas'}
        </Button>
      </div>

      {/* Tabla */}
      <div className="surface-card overflow-hidden">
        {!useMock && isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="premium-table">
              <thead>
                <tr>
                  <th>Origen</th>
                  <th>Destino</th>
                  <th>Tipo</th>
                  <th className="text-right">Precio base</th>
                  <th className="text-right">Peso base</th>
                  <th className="text-right">Kg extra</th>
                  <th className="text-right">Factor dim.</th>
                  <th className="text-center">Estado</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {tarifasFiltradas.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground text-[13px]">
                      No se encontraron tarifas
                    </td>
                  </tr>
                )}
                {tarifasFiltradas.map((t) => (
                  <tr
                    key={t.id}
                    className={t.eliminado ? 'opacity-60 bg-muted/10' : ''}
                  >
                    <td className="font-medium text-[13px]">{t.origen}</td>
                    <td className="text-[13px]">{t.destino}</td>
                    <td>
                      <Badge variant="outline" className="text-[11px]">
                        {tipoServicioLabels[t.tipoServicio]}
                      </Badge>
                    </td>
                    <td className="text-right font-data text-[13px]">{formatCurrency(t.precioBase)}</td>
                    <td className="text-right text-[13px]">{t.pesoBase} kg</td>
                    <td className="text-right font-data text-[13px]">{formatCurrency(t.precioPorKgExtra)}</td>
                    <td className="text-right text-[13px]">{t.factorDimensional.toLocaleString()}</td>
                    <td className="text-center">
                      {t.eliminado ? (
                        <Badge
                          variant="destructive"
                          className="text-[11px] cursor-default"
                          title={t.motivoEliminacion ? `Motivo: ${t.motivoEliminacion}` : undefined}
                        >
                          Desactivada
                        </Badge>
                      ) : (
                        <Badge className="text-[11px] bg-green-100 text-green-700 border-green-200">Activa</Badge>
                      )}
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {t.eliminado ? (
                          <Button size="sm" variant="outline" onClick={() => restaurar(t.id)} className="text-[11px] h-7">
                            Restaurar
                          </Button>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={() => abrirEditar(t)}
                            >
                              <PencilSimple size={14} weight="duotone" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                              onClick={() => { setDeleteModal({ open: true, tarifa: t }); setMotivoEliminacion(''); }}
                            >
                              <Trash size={14} weight="duotone" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal nueva/editar */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar tarifa' : 'Nueva tarifa'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-[13px]">Origen *</Label>
                <Select value={form.origen} onValueChange={(v) => setForm((f) => ({ ...f, origen: v }))}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    {ciudadesUnicas.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[13px]">Destino *</Label>
                <Select value={form.destino} onValueChange={(v) => setForm((f) => ({ ...f, destino: v }))}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    {ciudadesUnicas.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-[13px]">Tipo de servicio *</Label>
              <Select
                value={form.tipoServicio}
                onValueChange={(v) => setForm((f) => ({ ...f, tipoServicio: v as Tarifa['tipoServicio'] }))}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="estandar">Estandar</SelectItem>
                  <SelectItem value="express">Express</SelectItem>
                  <SelectItem value="economico">Economico</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-[13px]">Precio base (Gs.) *</Label>
                <Input
                  type="number"
                  className="mt-1.5 font-data"
                  value={form.precioBase || ''}
                  onChange={(e) => setForm((f) => ({ ...f, precioBase: Number(e.target.value) }))}
                  placeholder="45000"
                />
              </div>
              <div>
                <Label className="text-[13px]">Peso base incluido (kg)</Label>
                <Input
                  type="number"
                  className="mt-1.5"
                  value={form.pesoBase || ''}
                  onChange={(e) => setForm((f) => ({ ...f, pesoBase: Number(e.target.value) }))}
                  placeholder="3"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-[13px]">Precio por kg extra (Gs.)</Label>
                <Input
                  type="number"
                  className="mt-1.5 font-data"
                  value={form.precioPorKgExtra || ''}
                  onChange={(e) => setForm((f) => ({ ...f, precioPorKgExtra: Number(e.target.value) }))}
                  placeholder="8000"
                />
              </div>
              <div>
                <Label className="text-[13px]">Factor dimensional (cm3/kg)</Label>
                <Input
                  type="number"
                  className="mt-1.5"
                  value={form.factorDimensional || ''}
                  onChange={(e) => setForm((f) => ({ ...f, factorDimensional: Number(e.target.value) }))}
                  placeholder="5000"
                />
              </div>
            </div>
            <p className="text-[12px] text-muted-foreground bg-muted/40 rounded p-2">
              Peso volumetrico = (Largo x Ancho x Alto) / {form.factorDimensional || 5000}. Se cobra el mayor entre peso real y volumetrico.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button
              size="sm"
              onClick={guardar}
              disabled={createMut.isPending || updateMut.isPending}
            >
              {editando ? 'Guardar cambios' : 'Crear tarifa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal confirmar eliminacion */}
      <Dialog open={deleteModal.open} onOpenChange={(v) => setDeleteModal({ open: v, tarifa: v ? deleteModal.tarifa : null })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Warning size={18} weight="duotone" />
              Desactivar tarifa
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-[13px] text-muted-foreground">
              La tarifa <strong>{deleteModal.tarifa?.origen} → {deleteModal.tarifa?.destino}</strong> sera desactivada.
              El registro se conserva en el sistema para trazabilidad.
            </p>
            <div>
              <Label className="text-[13px]">Motivo de desactivacion *</Label>
              <Textarea
                className="mt-1.5 resize-none"
                rows={2}
                value={motivoEliminacion}
                onChange={(e) => setMotivoEliminacion(e.target.value)}
                placeholder="Ej: Ruta suspendida temporalmente..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteModal({ open: false, tarifa: null })}>Cancelar</Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={confirmarEliminar}
              disabled={deleteMut.isPending}
            >
              Desactivar tarifa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Tarifas;
