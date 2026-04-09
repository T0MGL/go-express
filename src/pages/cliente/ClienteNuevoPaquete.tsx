import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { departamentosPY } from '@/data/constants';
import type { ProductoGuardado } from '@/data/types';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { isValidPhone, normalizePhone, PHONE_PLACEHOLDER } from '@/lib/phone';
import { PlusCircle, Tag, X, Package, User, Cube, Lightning, Warning, Scales, CircleNotch } from '@phosphor-icons/react';
import { useClienteCreateEnvio } from '@/hooks/api/use-cliente-envios';
import { useProductos } from '@/hooks/api/use-productos';
import { useCiudadesDisponibles } from '@/hooks/api/use-cotizador';

interface SizePreset {
  id: 'pequeno' | 'mediano' | 'grande' | 'muy_grande';
  label: string;
  description: string;
  largo: number;
  ancho: number;
  alto: number;
}

const SIZE_PRESETS: SizePreset[] = [
  { id: 'pequeno', label: 'Pequeno', description: '20 x 15 x 10', largo: 20, ancho: 15, alto: 10 },
  { id: 'mediano', label: 'Mediano', description: '30 x 25 x 20', largo: 30, ancho: 25, alto: 20 },
  { id: 'grande', label: 'Grande', description: '50 x 40 x 30', largo: 50, ancho: 40, alto: 30 },
  { id: 'muy_grande', label: 'Muy grande', description: '80 x 60 x 50', largo: 80, ancho: 60, alto: 50 },
];

const ClienteNuevoPaquete = () => {
  const navigate = useNavigate();
  const [etiquetaInput, setEtiquetaInput] = useState('');
  const [etiquetas, setEtiquetas] = useState<string[]>([]);
  const [selectedSize, setSelectedSize] = useState<SizePreset['id'] | null>(null);
  const [form, setForm] = useState({
    destinatarioNombre: '',
    destinatarioTelefono: '',
    destinatarioDireccion: '',
    departamento: '',
    ciudad: '',
    codigoReferencia: '',
    peso: '',
    largo: '',
    ancho: '',
    alto: '',
    contenido: '',
    notas: '',
  });

  const createEnvioMutation = useClienteCreateEnvio();
  const { data: apiProductos } = useProductos();
  const { data: ciudadesDisponibles } = useCiudadesDisponibles();

  const productos: ProductoGuardado[] = apiProductos?.data ?? [];

  const activeDepartamentos = useMemo(() => {
    const active = new Set(ciudadesDisponibles ?? []);
    return departamentosPY.map((d) => ({
      name: d,
      isActive: active.size === 0 ? true : active.has(d),
    }));
  }, [ciudadesDisponibles]);

  const applySizePreset = (preset: SizePreset) => {
    setSelectedSize(preset.id);
    setForm((prev) => ({
      ...prev,
      largo: String(preset.largo),
      ancho: String(preset.ancho),
      alto: String(preset.alto),
    }));
  };

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (field === 'largo' || field === 'ancho' || field === 'alto') {
      setSelectedSize(null);
    }
  };

  const addEtiqueta = () => {
    const tag = etiquetaInput.trim();
    if (tag && !etiquetas.includes(tag)) {
      setEtiquetas((prev) => [...prev, tag]);
      setEtiquetaInput('');
    }
  };

  const removeEtiqueta = (tag: string) => {
    setEtiquetas((prev) => prev.filter((t) => t !== tag));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const nombre = form.destinatarioNombre.trim();
    const telefonoRaw = form.destinatarioTelefono.trim();
    const direccion = form.destinatarioDireccion.trim();
    const contenido = form.contenido.trim();

    if (!nombre || nombre.length < 3) {
      toast.error('El nombre del destinatario debe tener al menos 3 caracteres');
      return;
    }
    if (!telefonoRaw || !isValidPhone(telefonoRaw)) {
      toast.error(`Formato de telefono invalido. Ej: ${PHONE_PLACEHOLDER}`);
      return;
    }
    const telefono = normalizePhone(telefonoRaw);
    if (!direccion || direccion.length < 5) {
      toast.error('La direccion debe tener al menos 5 caracteres');
      return;
    }
    if (!form.departamento) {
      toast.error('Selecciona un departamento de destino');
      return;
    }
    if (!form.peso || Number(form.peso) <= 0) {
      toast.error('El peso debe ser mayor a 0');
      return;
    }
    if (!contenido) {
      toast.error('Describe el contenido del paquete');
      return;
    }

    const ciudadTrimmed = form.ciudad.trim();
    const codigoTrimmed = form.codigoReferencia.trim();

    createEnvioMutation.mutate(
      {
        destinatarioNombre: form.destinatarioNombre,
        destinatarioTelefono: telefono,
        destinatarioDireccion: form.destinatarioDireccion,
        destinatarioDepartamento: form.departamento,
        ...(ciudadTrimmed ? { destinatarioCiudad: ciudadTrimmed } : {}),
        ...(codigoTrimmed ? { codigoReferencia: codigoTrimmed } : {}),
        peso: Number(form.peso),
        dimensiones: {
          largo: Number(form.largo) || 0,
          ancho: Number(form.ancho) || 0,
          alto: Number(form.alto) || 0,
        },
        producto: form.contenido,
        notas: form.notas,
        etiquetas,
      },
      {
        onSuccess: () => {
          toast.success('Paquete registrado exitosamente. Se generara tu numero de tracking.');
          navigate('/cliente/envios');
        },
        onError: () => {
          toast.error('Error al registrar el paquete. Intenta nuevamente.');
        },
      }
    );
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Registrar Nuevo Paquete</h1>
          <p className="page-header-subtitle">Completa los datos del paquete para solicitar el envio</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="surface-card p-5">
          <h3 className="text-[13px] font-semibold mb-4 flex items-center gap-2">
            <User size={16} weight="duotone" className="text-primary" />
            Datos del Destinatario
          </h3>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px]">Nombre completo *</Label>
                <Input required value={form.destinatarioNombre} onChange={(e) => handleChange('destinatarioNombre', e.target.value)} className="mt-1.5" />
              </div>
              <div>
                <Label className="text-[11px]">Telefono *</Label>
                <Input required type="tel" placeholder={PHONE_PLACEHOLDER} value={form.destinatarioTelefono} onChange={(e) => handleChange('destinatarioTelefono', e.target.value)} className="mt-1.5 font-data" />
              </div>
            </div>
            <div>
              <Label className="text-[11px]">Direccion de entrega *</Label>
              <Input required value={form.destinatarioDireccion} onChange={(e) => handleChange('destinatarioDireccion', e.target.value)} className="mt-1.5" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px]">Departamento *</Label>
                <Select value={form.departamento} onValueChange={(v) => handleChange('departamento', v)}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Seleccionar departamento" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeDepartamentos.map((d) => (
                      <SelectItem key={d.name} value={d.name} disabled={!d.isActive}>
                        <span className="flex items-center justify-between gap-2 w-full">
                          <span>{d.name}</span>
                          {!d.isActive && (
                            <span className="text-[10px] text-muted-foreground/60 italic">sin cobertura</span>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[11px]">Ciudad</Label>
                <Input
                  value={form.ciudad}
                  onChange={(e) => handleChange('ciudad', e.target.value)}
                  placeholder="Ej: Ciudad del Este"
                  className="mt-1.5"
                />
              </div>
            </div>
            <div>
              <Label className="text-[11px]">Numero de pedido (opcional)</Label>
              <Input
                value={form.codigoReferencia}
                onChange={(e) => handleChange('codigoReferencia', e.target.value)}
                placeholder="Ej: PED-2026-0042"
                className="mt-1.5 font-data"
              />
            </div>
          </div>
        </div>

        <div className="surface-card p-5">
          <h3 className="text-[13px] font-semibold mb-4 flex items-center gap-2">
            <Package size={16} weight="duotone" className="text-primary" />
            Detalles del Paquete
          </h3>
          <div className="space-y-3">
            {/* Product quick-fill selector */}
            {productos.length > 0 && (
              <div>
                <Label className="text-[11px] flex items-center gap-1.5">
                  <Lightning size={11} weight="fill" className="text-amber-500" />
                  Cargar producto guardado
                </Label>
                <Select
                  onValueChange={(prodId) => {
                    const prod = productos.find((p) => p.id === prodId);
                    if (prod) {
                      setForm((prev) => ({
                        ...prev,
                        peso: String(prod.peso),
                        largo: String(prod.dimensiones.largo),
                        ancho: String(prod.dimensiones.ancho),
                        alto: String(prod.dimensiones.alto),
                        contenido: prod.nombre + (prod.descripcion ? `: ${prod.descripcion}` : ''),
                      }));
                      setSelectedSize(null);
                      if (prod.fragil && !etiquetas.includes('Fragil')) {
                        setEtiquetas((prev) => [...prev, 'Fragil']);
                      }
                      toast.success(`Datos de "${prod.nombre}" aplicados`);
                    }
                  }}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Seleccionar un producto guardado..." />
                  </SelectTrigger>
                  <SelectContent>
                    {productos.map((prod) => (
                      <SelectItem key={prod.id} value={prod.id}>
                        <span className="flex items-center gap-2">
                          <Cube size={13} weight="duotone" className="text-muted-foreground" />
                          <span>{prod.nombre}</span>
                          <span className="text-muted-foreground font-data text-[11px]">
                            {prod.peso}kg · {prod.dimensiones.largo}x{prod.dimensiones.ancho}x{prod.dimensiones.alto}cm
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Autocompleta peso, dimensiones y contenido desde tus productos guardados
                </p>
              </div>
            )}

            <div>
              <Label className="text-[11px] mb-1.5 block">Tamano del paquete</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {SIZE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applySizePreset(preset)}
                    aria-pressed={selectedSize === preset.id}
                    className={cn(
                      'flex flex-col items-start gap-0.5 rounded-lg border p-3 text-left transition-all',
                      selectedSize === preset.id
                        ? 'border-primary bg-primary/5 text-foreground shadow-xs'
                        : 'border-border/60 bg-card hover:border-border hover:bg-muted/40 text-muted-foreground'
                    )}
                  >
                    <span className="text-[12px] font-semibold">{preset.label}</span>
                    <span className="text-[10px] font-data text-muted-foreground/80">{preset.description} cm</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <Label className="text-[11px]">Peso (kg) *</Label>
                <Input required type="number" step="0.1" min="0.1" value={form.peso} onChange={(e) => handleChange('peso', e.target.value)} className="mt-1.5 font-data" />
              </div>
              <div>
                <Label className="text-[11px]">Largo (cm)</Label>
                <Input type="number" min="0" value={form.largo} onChange={(e) => handleChange('largo', e.target.value)} className="mt-1.5 font-data" />
              </div>
              <div>
                <Label className="text-[11px]">Ancho (cm)</Label>
                <Input type="number" min="0" value={form.ancho} onChange={(e) => handleChange('ancho', e.target.value)} className="mt-1.5 font-data" />
              </div>
              <div>
                <Label className="text-[11px]">Alto (cm)</Label>
                <Input type="number" min="0" value={form.alto} onChange={(e) => handleChange('alto', e.target.value)} className="mt-1.5 font-data" />
              </div>
            </div>

            {/* Live volumetric weight preview */}
            {Number(form.largo) > 0 && Number(form.ancho) > 0 && Number(form.alto) > 0 && (
              <div className="surface-card p-3 text-[12px] border-l-2 border-l-primary/30">
                <div className="flex items-center gap-1.5 mb-2">
                  <Scales size={13} weight="duotone" className="text-primary" />
                  <span className="font-medium text-[11px]">Calculo de peso</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Peso real</span>
                    <span className="font-data font-medium">{Number(form.peso) || 0} kg</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Peso volumetrico</span>
                    <span className="font-data font-medium">
                      {((Number(form.largo) * Number(form.ancho) * Number(form.alto)) / 5000).toFixed(2)} kg
                    </span>
                  </div>
                </div>
                <div className="flex justify-between mt-1.5 pt-1.5 border-t border-border/40">
                  <span className="font-medium">Peso tarificado</span>
                  <span className="font-data font-semibold">
                    {Math.max(Number(form.peso) || 0, (Number(form.largo) * Number(form.ancho) * Number(form.alto)) / 5000).toFixed(1)} kg
                  </span>
                </div>
                {((Number(form.largo) * Number(form.ancho) * Number(form.alto)) / 5000) > (Number(form.peso) || 0) && (
                  <p className="text-[11px] text-warning mt-1.5 flex items-center gap-1">
                    <Warning size={11} weight="fill" />
                    Se tarificara por peso volumetrico
                  </p>
                )}
              </div>
            )}

            <div>
              <Label className="text-[11px]">Contenido / Descripcion *</Label>
              <Input required value={form.contenido} onChange={(e) => handleChange('contenido', e.target.value)} className="mt-1.5" placeholder="Ej: Electronicos, documentos, ropa..." />
            </div>
            <div>
              <Label className="text-[11px]">Notas adicionales</Label>
              <Textarea value={form.notas} onChange={(e) => handleChange('notas', e.target.value)} className="mt-1.5" placeholder="Instrucciones especiales, horario de entrega, etc." />
            </div>
          </div>
        </div>

        <div className="surface-card p-5">
          <h3 className="text-[13px] font-semibold mb-4 flex items-center gap-2">
            <Tag size={16} weight="duotone" className="text-primary" />
            Etiquetas
          </h3>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Agregar etiqueta (ej: Fragil, Urgente)..."
                value={etiquetaInput}
                onChange={(e) => setEtiquetaInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); addEtiqueta(); }
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={addEtiqueta}>
                <PlusCircle size={14} weight="duotone" />
              </Button>
            </div>
            {etiquetas.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {etiquetas.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                    {tag}
                    <button type="button" onClick={() => removeEtiqueta(tag)} className="ml-1 hover:text-destructive">
                      <X size={10} weight="bold" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Las etiquetas te ayudan a organizar y buscar tus paquetes. Presiona Enter para agregar.
            </p>
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <Button type="button" variant="outline" size="sm" onClick={() => navigate('/cliente/envios')}>Cancelar</Button>
          <Button type="submit" size="sm" className="gap-1.5" disabled={createEnvioMutation.isPending}>
            {createEnvioMutation.isPending ? (
              <CircleNotch size={14} weight="bold" className="animate-spin" />
            ) : (
              <PlusCircle size={14} weight="duotone" />
            )}
            {createEnvioMutation.isPending ? 'Registrando...' : 'Registrar Paquete'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default ClienteNuevoPaquete;
