import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import type { ProductoGuardado } from '@/data/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import {
  Cube, PencilSimple, Trash, MagnifyingGlass, Warning, Package, CircleNotch,
} from '@phosphor-icons/react';
import {
  useProductos,
  useCreateProducto,
  useUpdateProducto,
  useDeleteProducto,
} from '@/hooks/api/use-productos';

const ClienteProductos = () => {

  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductoGuardado | null>(null);

  const [form, setForm] = useState({
    nombre: '',
    descripcion: '',
    peso: '',
    largo: '',
    ancho: '',
    alto: '',
    fragil: false,
    valorDeclarado: '',
  });

  const { data: apiProductos, isLoading } = useProductos();
  const createMutation = useCreateProducto();
  const updateMutation = useUpdateProducto();
  const deleteMutation = useDeleteProducto();

  const productos: ProductoGuardado[] = apiProductos?.data ?? [];

  const filtered = productos.filter((p) => {
    const q = searchTerm.toLowerCase();
    return p.nombre.toLowerCase().includes(q) || (p.descripcion || '').toLowerCase().includes(q);
  });

  const openCreate = () => {
    setEditingProduct(null);
    setForm({ nombre: '', descripcion: '', peso: '', largo: '', ancho: '', alto: '', fragil: false, valorDeclarado: '' });
    setIsModalOpen(true);
  };

  const openEdit = (p: ProductoGuardado) => {
    setEditingProduct(p);
    setForm({
      nombre: p.nombre,
      descripcion: p.descripcion || '',
      peso: String(p.peso),
      largo: String(p.dimensiones.largo),
      ancho: String(p.dimensiones.ancho),
      alto: String(p.dimensiones.alto),
      fragil: p.fragil,
      valorDeclarado: p.valorDeclarado ? String(p.valorDeclarado) : '',
    });
    setIsModalOpen(true);
  };

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleDelete = (id: string) => {
    setDeleteConfirmId(id);
  };

  const confirmDelete = () => {
    if (!deleteConfirmId) return;
    deleteMutation.mutate(deleteConfirmId, {
      onSuccess: () => {
        toast.success('Producto eliminado');
        setDeleteConfirmId(null);
      },
      onError: () => toast.error('Error al eliminar el producto'),
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const productData = {
      nombre: form.nombre,
      descripcion: form.descripcion || undefined,
      peso: Number(form.peso),
      dimensiones: { largo: Number(form.largo), ancho: Number(form.ancho), alto: Number(form.alto) },
      fragil: form.fragil,
      valorDeclarado: form.valorDeclarado ? Number(form.valorDeclarado) : undefined,
    };

    if (editingProduct) {
      updateMutation.mutate(
        { id: editingProduct.id, ...productData },
        {
          onSuccess: () => {
            toast.success('Producto actualizado');
            setIsModalOpen(false);
          },
          onError: () => toast.error('Error al actualizar el producto'),
        }
      );
    } else {
      createMutation.mutate(productData, {
        onSuccess: () => {
          toast.success('Producto guardado');
          setIsModalOpen(false);
        },
        onError: () => toast.error('Error al crear el producto'),
      });
    }
  };

  const pesoVolPreview = Number(form.largo) && Number(form.ancho) && Number(form.alto)
    ? ((Number(form.largo) * Number(form.ancho) * Number(form.alto)) / 5000).toFixed(2)
    : null;

  const isMutating = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Mis Productos</h1>
          <p className="page-header-subtitle">Productos guardados para agilizar la creacion de envios</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={openCreate}>
          <Plus className="w-3.5 h-3.5" />
          Nuevo Producto
        </Button>
      </div>

      {/* Info banner */}
      <div className="surface-card p-4 flex items-start gap-3 border-l-2 border-l-primary">
        <Cube size={18} weight="duotone" className="text-primary mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-[13px] font-medium">Ahorra tiempo en cada envio</p>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Guarda los productos que envias frecuentemente. Al crear un nuevo paquete, podras seleccionar un producto guardado y los datos de peso y dimensiones se completaran automaticamente.
          </p>
        </div>
      </div>

      {/* Search */}
      {productos.length > 0 && (
        <div className="relative max-w-sm">
          <MagnifyingGlass size={15} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            placeholder="Buscar producto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {/* Product grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="surface-card p-4 space-y-3">
              <div className="h-4 w-32 bg-muted/40 rounded animate-pulse" />
              <div className="h-3 w-48 bg-muted/20 rounded animate-pulse" />
              <div className="flex gap-4">
                <div className="h-3 w-16 bg-muted/30 rounded animate-pulse" />
                <div className="h-3 w-20 bg-muted/30 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((producto) => {
            const pesoVol = (producto.dimensiones.largo * producto.dimensiones.ancho * producto.dimensiones.alto) / 5000;
            const pesoTarificado = Math.max(producto.peso, pesoVol);
            return (
              <div key={producto.id} className="surface-card p-4 group">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-primary/6 flex items-center justify-center flex-shrink-0">
                      <Package size={16} weight="duotone" className="text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold truncate">{producto.nombre}</p>
                      {producto.descripcion && (
                        <p className="text-[11px] text-muted-foreground truncate">{producto.descripcion}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(producto)} aria-label={`Editar ${producto.nombre}`}>
                      <PencilSimple size={13} weight="duotone" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleDelete(producto.id)} aria-label={`Eliminar ${producto.nombre}`}>
                      <Trash size={13} weight="duotone" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Peso real</span>
                    <span className="font-data font-medium">{producto.peso} kg</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Peso vol.</span>
                    <span className="font-data font-medium">{pesoVol.toFixed(1)} kg</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Dimensiones</span>
                    <span className="font-data">{producto.dimensiones.largo}x{producto.dimensiones.ancho}x{producto.dimensiones.alto}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tarificado</span>
                    <span className="font-data font-semibold">{pesoTarificado.toFixed(1)} kg</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/40">
                  {producto.fragil && (
                    <Badge variant="warning" className="text-[10px]">
                      <Warning size={10} weight="fill" className="mr-0.5" />
                      Fragil
                    </Badge>
                  )}
                  {producto.valorDeclarado && (
                    <Badge variant="outline" className="text-[10px] font-data">
                      {formatCurrency(producto.valorDeclarado)}
                    </Badge>
                  )}
                  <span className="text-[10px] text-muted-foreground/50 ml-auto">
                    {formatDate(producto.creadoEn)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-16">
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
            <Cube size={18} weight="duotone" className="text-muted-foreground/50" />
          </div>
          <p className="text-[13px] font-medium">
            {searchTerm ? 'No se encontraron productos' : 'Aun no tenes productos guardados'}
          </p>
          <p className="text-[12px] text-muted-foreground mt-1">
            {searchTerm ? 'Proba con otros terminos' : 'Crea tu primer producto para agilizar tus envios'}
          </p>
          {!searchTerm && (
            <Button size="sm" className="mt-4 gap-1.5" onClick={openCreate}>
              <Plus className="w-3.5 h-3.5" />
              Crear producto
            </Button>
          )}
        </div>
      )}

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirmId} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Eliminar producto</DialogTitle>
            <DialogDescription className="text-[13px]">
              Esta accion no se puede deshacer. El producto se eliminara permanentemente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" size="sm" onClick={() => setDeleteConfirmId(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" size="sm" onClick={confirmDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">
              {editingProduct ? 'Editar Producto' : 'Nuevo Producto'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-1">
              <div>
                <Label className="text-[12px]">Nombre del producto *</Label>
                <Input
                  required
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  placeholder="Ej: Monitor LED 24 pulgadas"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label className="text-[12px]">Descripcion</Label>
                <Input
                  value={form.descripcion}
                  onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                  placeholder="Detalles del empaque, contenido, etc."
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label className="text-[12px]">Peso real (kg) *</Label>
                <Input
                  required
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={form.peso}
                  onChange={(e) => setForm({ ...form, peso: e.target.value })}
                  placeholder="0.0"
                  className="mt-1.5 font-data"
                />
              </div>

              <div>
                <Label className="text-[12px]">Dimensiones (cm) *</Label>
                <div className="grid grid-cols-3 gap-2 mt-1.5">
                  <Input
                    required
                    type="number"
                    min="1"
                    value={form.largo}
                    onChange={(e) => setForm({ ...form, largo: e.target.value })}
                    placeholder="Largo"
                    className="font-data"
                  />
                  <Input
                    required
                    type="number"
                    min="1"
                    value={form.ancho}
                    onChange={(e) => setForm({ ...form, ancho: e.target.value })}
                    placeholder="Ancho"
                    className="font-data"
                  />
                  <Input
                    required
                    type="number"
                    min="1"
                    value={form.alto}
                    onChange={(e) => setForm({ ...form, alto: e.target.value })}
                    placeholder="Alto"
                    className="font-data"
                  />
                </div>
              </div>

              {/* Volumetric preview */}
              {pesoVolPreview && (
                <div className="surface-card p-3 text-[12px]">
                  <div className="flex justify-between mb-1">
                    <span className="text-muted-foreground">Peso volumetrico</span>
                    <span className="font-data font-medium">{pesoVolPreview} kg</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Peso tarificado</span>
                    <span className="font-data font-semibold text-foreground">
                      {Math.max(Number(form.peso) || 0, Number(pesoVolPreview)).toFixed(1)} kg
                    </span>
                  </div>
                  {Number(pesoVolPreview) > (Number(form.peso) || 0) && (
                    <p className="text-[11px] text-warning mt-1.5 flex items-center gap-1">
                      <Warning size={11} weight="fill" />
                      Se tarifica por peso volumetrico
                    </p>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-[12px]">Producto fragil</Label>
                  <p className="text-[11px] text-muted-foreground">Requiere manejo especial</p>
                </div>
                <Switch checked={form.fragil} onCheckedChange={(v) => setForm({ ...form, fragil: v })} />
              </div>

              <div>
                <Label className="text-[12px]">Valor declarado (Gs.)</Label>
                <Input
                  type="number"
                  value={form.valorDeclarado}
                  onChange={(e) => setForm({ ...form, valorDeclarado: e.target.value })}
                  placeholder="Opcional, para seguro"
                  className="mt-1.5 font-data"
                />
              </div>
            </div>

            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={isMutating}>
                {isMutating ? (
                  <CircleNotch size={14} weight="bold" className="animate-spin mr-1.5" />
                ) : null}
                {editingProduct ? 'Guardar' : 'Crear Producto'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClienteProductos;
