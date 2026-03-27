import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { departamentosPY } from '@/data/constants';
import {
  CaretLeft,
  CaretRight,
  CheckCircle,
  Package,
  MapPin,
  UserCircle,
  CreditCard,
  FileText,
  FloppyDisk,
  Scales,
  SpinnerGap,
} from '@phosphor-icons/react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils';
import { useClientes } from '@/hooks/api/use-clientes';
import { useCreateEnvio } from '@/hooks/api/use-envios';

// Esquemas de validacion por paso
const paso1Schema = z.object({
  cliente: z.string().min(1, 'Selecciona un cliente'),
});

const paso2Schema = z.object({
  origen: z.string().min(1, 'Selecciona el origen'),
  destino: z.string().min(1, 'Selecciona el destino'),
});

const TALLAS = [
  { id: 'pequeno',    label: 'Pequeno',     desc: 'Hasta 30x20x15 cm',  largo: 30,  ancho: 20, alto: 15  },
  { id: 'mediano',    label: 'Mediano',     desc: 'Hasta 50x40x30 cm',  largo: 50,  ancho: 40, alto: 30  },
  { id: 'grande',     label: 'Grande',      desc: 'Hasta 80x60x50 cm',  largo: 80,  ancho: 60, alto: 50  },
  { id: 'extra',      label: 'Extra Grande', desc: 'Hasta 120x80x70 cm', largo: 120, ancho: 80, alto: 70  },
] as const;

type TallaId = typeof TALLAS[number]['id'];

const paso3Schema = z.object({
  peso:  z.string().refine((val) => parseFloat(val) > 0, 'El peso debe ser mayor a 0'),
  talla: z.string().min(1, 'Selecciona un tamano'),
});

const paso4Schema = z.object({
  destinatarioNombre: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
  destinatarioDireccion: z.string().min(5, 'La direccion debe tener al menos 5 caracteres'),
  destinatarioTelefono: z.string().regex(/^\+?595\s?\d{3}\s?\d{3}\s?\d{3}$/, 'Formato: +595 XXX XXX XXX'),
});

const paso5Schema = z.object({
  costo: z.string().refine((val) => parseFloat(val) > 0, 'El costo debe ser mayor a 0'),
  tipoPago: z.enum(['anticipado', 'contra_entrega', 'cuenta_corriente'], {
    errorMap: () => ({ message: 'Selecciona un tipo de pago' })
  }),
});

interface FormData {
  cliente: string;
  origen: string;
  destino: string;
  peso: string;
  talla: TallaId | '';
  destinatarioNombre: string;
  destinatarioDireccion: string;
  destinatarioTelefono: string;
  notas: string;
  costo: string;
  tipoPago: string;
}

const PASOS = [
  { numero: 1, titulo: 'Cliente', icon: UserCircle, descripcion: 'Informacion del cliente' },
  { numero: 2, titulo: 'Ruta', icon: MapPin, descripcion: 'Origen y destino' },
  { numero: 3, titulo: 'Paquete', icon: Package, descripcion: 'Dimensiones y peso' },
  { numero: 4, titulo: 'Destinatario', icon: FileText, descripcion: 'Datos de entrega' },
  { numero: 5, titulo: 'Pago', icon: CreditCard, descripcion: 'Informacion de pago' },
];

export function EnvioWizard() {
  const navigate = useNavigate();
  const [pasoActual, setPasoActual] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);


  const { data: apiClientes } = useClientes({ estado: 'activo' });
  const createEnvioMut = useCreateEnvio();

  const CLIENTES = (apiClientes?.data ?? []).map(c => ({
        value: c.id,
        label: c.razonSocial,
        contacto: c.contactoNombre,
        telefono: c.telefono,
      }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const defaultFormData: FormData = {
    cliente: '',
    origen: '',
    destino: '',
    peso: '',
    talla: '',
    destinatarioNombre: '',
    destinatarioDireccion: '',
    destinatarioTelefono: '',
    notas: '',
    costo: '',
    tipoPago: '',
  };

  const [formData, setFormData] = useState<FormData>(() => {
    try {
      const borrador = localStorage.getItem('envio-borrador');
      if (borrador) {
        const parsed = JSON.parse(borrador);
        if (parsed && typeof parsed === 'object' && 'cliente' in parsed) {
          return parsed as FormData;
        }
      }
    } catch {
      localStorage.removeItem('envio-borrador');
    }
    return defaultFormData;
  });

  // Guardar borrador automaticamente
  useEffect(() => {
    const timer = setTimeout(() => {
      if (Object.values(formData).some(v => v !== '')) {
        localStorage.setItem('envio-borrador', JSON.stringify(formData));
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [formData]);

  // Motor Volumetrico: (Largo x Ancho x Alto) / Factor Dimensional
  // Factor estandar: 5000 cm3/kg. Se cobra el mayor entre peso real y volumetrico
  const FACTOR_DIMENSIONAL = 5000;
  const tallaData = TALLAS.find(t => t.id === formData.talla) ?? null;
  const pesoVolumetrico = tallaData
    ? (tallaData.largo * tallaData.ancho * tallaData.alto) / FACTOR_DIMENSIONAL
    : 0;
  const pesoReal = parseFloat(formData.peso) || 0;
  const pesoTarifado = Math.max(pesoReal, pesoVolumetrico);
  const esVolumetrico = pesoVolumetrico > pesoReal && pesoVolumetrico > 0;
  const precioSugerido = Math.ceil((pesoTarifado * 5000 + 15000) / 1000) * 1000; // Redondear a miles

  useEffect(() => {
    if (pasoActual === 5 && precioSugerido > 0 && !formData.costo) {
      handleChange('costo', precioSugerido.toString());
    }
    // Only trigger when entering step 5 or when the suggested price changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pasoActual, precioSugerido]);

  const handleChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Limpiar error del campo
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const validarPaso = (paso: number): boolean => {
    let schema;
    let datosAValidar;

    switch (paso) {
      case 1:
        schema = paso1Schema;
        datosAValidar = { cliente: formData.cliente };
        break;
      case 2:
        schema = paso2Schema;
        datosAValidar = { origen: formData.origen, destino: formData.destino };
        break;
      case 3:
        schema = paso3Schema;
        datosAValidar = { peso: formData.peso, talla: formData.talla };
        break;
      case 4:
        schema = paso4Schema;
        datosAValidar = {
          destinatarioNombre: formData.destinatarioNombre,
          destinatarioDireccion: formData.destinatarioDireccion,
          destinatarioTelefono: formData.destinatarioTelefono,
        };
        break;
      case 5:
        schema = paso5Schema;
        datosAValidar = { costo: formData.costo, tipoPago: formData.tipoPago };
        break;
      default:
        return true;
    }

    try {
      schema.parse(datosAValidar);
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        error.errors.forEach(err => {
          if (err.path[0]) {
            newErrors[err.path[0] as string] = err.message;
          }
        });
        setErrors(newErrors);
      }
      return false;
    }
  };

  const siguientePaso = () => {
    if (validarPaso(pasoActual)) {
      setPasoActual(prev => Math.min(prev + 1, 5));
    } else {
      toast.error('Por favor completa todos los campos correctamente');
    }
  };

  const pasoAnterior = () => {
    setPasoActual(prev => Math.max(prev - 1, 1));
  };

  const guardarBorrador = () => {
    localStorage.setItem('envio-borrador', JSON.stringify(formData));
    toast.success('Borrador guardado correctamente');
  };

  const handleSubmit = async () => {
    if (!validarPaso(5)) {
      toast.error('Por favor completa todos los campos correctamente');
      return;
    }

    setIsSubmitting(true);

    const talla = TALLAS.find(t => t.id === formData.talla);
    createEnvioMut.mutate(
        {
          clienteId: formData.cliente,
          origen: formData.origen,
          destino: formData.destino,
          peso: parseFloat(formData.peso),
          dimensiones: talla ? { largo: talla.largo, ancho: talla.ancho, alto: talla.alto } : undefined,
          destinatarioNombre: formData.destinatarioNombre,
          destinatarioDireccion: formData.destinatarioDireccion,
          destinatarioTelefono: formData.destinatarioTelefono,
          notas: formData.notas,
          costo: Math.round(parseFloat(formData.costo)),
          tipoPago: formData.tipoPago,
        },
        {
          onSuccess: () => {
            const mensaje = formData.tipoPago === 'anticipado'
              ? 'Envio creado con pago anticipado'
              : 'Envio creado exitosamente';
            toast.success(mensaje);
            localStorage.removeItem('envio-borrador');
            setIsSubmitting(false);
            navigate('/admin/envios');
          },
          onError: (err: unknown) => {
            type ValidationIssue = { field: string; message: string };
            type ValidationDetail = { target: string; issues: ValidationIssue[] };
            const apiErr = err as { data?: { error?: string; details?: ValidationDetail[] } };
            const firstIssue = apiErr?.data?.details?.[0]?.issues?.[0];
            const msg = firstIssue
              ? `${firstIssue.field}: ${firstIssue.message}`
              : (apiErr?.data?.error ?? 'Error al crear el envio');
            toast.error(msg);
            setIsSubmitting(false);
          },
        },
      );
  };

  const clienteSeleccionado = CLIENTES.find(c => c.value === formData.cliente);
  const progreso = (pasoActual / 5) * 100;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header con progreso */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold">Nuevo Envio</h2>
            <p className="text-[12px] text-muted-foreground">
              Paso {pasoActual} de 5: {PASOS[pasoActual - 1].descripcion}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={guardarBorrador}>
            <FloppyDisk size={14} weight="duotone" className="mr-1.5" />
            Guardar borrador
          </Button>
        </div>

        <Progress value={progreso} className="h-2" />

        {/* Indicadores de pasos */}
        <div className="flex justify-between mt-6">
          {PASOS.map((paso) => {
            const completado = pasoActual > paso.numero;
            const actual = pasoActual === paso.numero;
            const Icon = paso.icon;

            return (
              <div key={paso.numero} className="flex flex-col items-center flex-1">
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center mb-2 transition-all",
                  completado && "bg-primary text-primary-foreground",
                  actual && "bg-primary text-primary-foreground ring-4 ring-primary/20",
                  !completado && !actual && "bg-muted text-muted-foreground"
                )}>
                  {completado ? <CheckCircle size={18} weight="duotone" /> : <Icon size={18} weight="duotone" />}
                </div>
                <p className={cn(
                  "text-[11px] font-medium text-center",
                  (completado || actual) && "text-foreground",
                  !completado && !actual && "text-muted-foreground"
                )}>
                  {paso.titulo}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Contenido del paso actual */}
      <div className="surface-card p-6">
        <div>
          {pasoActual === 1 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-[15px] font-semibold mb-4">Informacion del Cliente</h3>
                <Label className="text-[12px]" htmlFor="cliente">Cliente *</Label>
                <Select value={formData.cliente} onValueChange={(v) => handleChange('cliente', v)}>
                  <SelectTrigger id="cliente" className={errors.cliente ? 'border-destructive' : ''}>
                    <SelectValue placeholder="Selecciona un cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {CLIENTES.map((cliente) => (
                      <SelectItem key={cliente.value} value={cliente.value}>
                        <div className="flex flex-col">
                          <span className="font-medium text-[13px]">{cliente.label}</span>
                          <span className="text-[11px] text-muted-foreground">{cliente.contacto}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.cliente && (
                  <p className="text-[12px] text-destructive mt-1">{errors.cliente}</p>
                )}
              </div>

              {clienteSeleccionado && (
                <div className="surface-card p-4 animate-scale-in">
                  <h4 className="section-label mb-2">Detalles del Cliente</h4>
                  <div className="space-y-1 text-[13px]">
                    <p><span className="text-muted-foreground">Contacto:</span> {clienteSeleccionado.contacto}</p>
                    <p><span className="text-muted-foreground">Telefono:</span> <span className="font-data">{clienteSeleccionado.telefono}</span></p>
                  </div>
                </div>
              )}
            </div>
          )}

          {pasoActual === 2 && (
            <div className="space-y-6">
              <h3 className="text-[15px] font-semibold mb-4">Ruta de Envio</h3>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-[12px]" htmlFor="origen">Origen *</Label>
                  <Select value={formData.origen} onValueChange={(v) => handleChange('origen', v)}>
                    <SelectTrigger id="origen" className={errors.origen ? 'border-destructive' : ''}>
                      <SelectValue placeholder="Departamento origen" />
                    </SelectTrigger>
                    <SelectContent>
                      {departamentosPY.map((depto) => (
                        <SelectItem key={`origen-${depto}`} value={depto}>{depto}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.origen && (
                    <p className="text-[12px] text-destructive mt-1">{errors.origen}</p>
                  )}
                </div>

                <div>
                  <Label className="text-[12px]" htmlFor="destino">Destino *</Label>
                  <Select value={formData.destino} onValueChange={(v) => handleChange('destino', v)}>
                    <SelectTrigger id="destino" className={errors.destino ? 'border-destructive' : ''}>
                      <SelectValue placeholder="Departamento destino" />
                    </SelectTrigger>
                    <SelectContent>
                      {departamentosPY.map((depto) => (
                        <SelectItem key={`destino-${depto}`} value={depto}>{depto}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.destino && (
                    <p className="text-[12px] text-destructive mt-1">{errors.destino}</p>
                  )}
                </div>
              </div>

              {formData.origen && formData.destino && (
                <div className="surface-card p-4 animate-scale-in">
                  <div className="flex items-center gap-3">
                    <MapPin size={18} weight="duotone" className="text-primary" />
                    <div className="flex-1">
                      <p className="font-medium text-[13px]">{formData.origen} → {formData.destino}</p>
                      <p className="text-[12px] text-muted-foreground">
                        {formData.origen === formData.destino
                          ? 'Envio local (mismo departamento)'
                          : 'Envio interdepartamental'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {pasoActual === 3 && (
            <div className="space-y-6">
              <h3 className="text-[15px] font-semibold mb-4">Detalles del Paquete</h3>

              <div>
                <Label className="text-[12px]" htmlFor="peso">Peso (kg) *</Label>
                <Input
                  id="peso"
                  type="number"
                  step="0.1"
                  placeholder="0.0"
                  value={formData.peso}
                  onChange={(e) => handleChange('peso', e.target.value)}
                  className={cn("font-data", errors.peso && 'border-destructive')}
                />
                {errors.peso && (
                  <p className="text-[12px] text-destructive mt-1">{errors.peso}</p>
                )}
              </div>

              <div>
                <Label className="text-[12px]">Tamano del paquete *</Label>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  {TALLAS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleChange('talla', t.id)}
                      className={cn(
                        "flex flex-col items-start p-3 rounded-lg border text-left transition-all",
                        formData.talla === t.id
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border hover:border-primary/40"
                      )}
                    >
                      <span className="font-semibold text-[13px]">{t.label}</span>
                      <span className="text-[11px] text-muted-foreground font-data mt-0.5">{t.desc}</span>
                    </button>
                  ))}
                </div>
                {errors.talla && (
                  <p className="text-[12px] text-destructive mt-1">{errors.talla}</p>
                )}
              </div>

              {tallaData && pesoReal > 0 && (
                <Card className={`p-4 animate-scale-in border ${esVolumetrico ? 'border-amber-200 bg-amber-50/60' : 'border-green-200 bg-green-50/60'}`}>
                  <h4 className="font-medium mb-3 text-[13px] flex items-center gap-2">
                    <Scales size={16} weight="duotone" className="text-muted-foreground" />
                    Motor Volumetrico
                    <span className="text-[11px] font-normal text-muted-foreground">
                      (L x A x H) / {FACTOR_DIMENSIONAL}
                    </span>
                  </h4>
                  <div className="grid grid-cols-2 gap-3 text-[13px]">
                    <div className={`rounded p-2.5 border ${!esVolumetrico ? 'border-green-300 bg-green-100/70' : 'border-border bg-background/60'}`}>
                      <p className="text-[11px] text-muted-foreground mb-0.5">Peso real</p>
                      <p className="font-semibold font-data">{pesoReal.toFixed(2)} kg</p>
                      {!esVolumetrico && (
                        <p className="text-[10px] text-green-700 font-medium mt-0.5">Se tarificara este</p>
                      )}
                    </div>
                    <div className={`rounded p-2.5 border ${esVolumetrico ? 'border-amber-300 bg-amber-100/70' : 'border-border bg-background/60'}`}>
                      <p className="text-[11px] text-muted-foreground mb-0.5">Peso volumetrico</p>
                      <p className="font-semibold font-data">{pesoVolumetrico.toFixed(2)} kg</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 font-data">
                        {tallaData.largo}x{tallaData.ancho}x{tallaData.alto} / {FACTOR_DIMENSIONAL}
                      </p>
                      {esVolumetrico && (
                        <p className="text-[10px] text-amber-700 font-medium mt-0.5">Se tarificara este</p>
                      )}
                    </div>
                    <div className="col-span-2 border-t pt-2.5 mt-0.5">
                      <p className="section-label">Peso tarificado (el mayor)</p>
                      <p className="font-bold text-base text-primary mt-0.5 font-data">{pesoTarifado.toFixed(2)} kg</p>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          )}

          {pasoActual === 4 && (
            <div className="space-y-6">
              <h3 className="text-[15px] font-semibold mb-4">Datos del Destinatario</h3>

              <div>
                <Label className="text-[12px]" htmlFor="destinatarioNombre">Nombre completo *</Label>
                <Input
                  id="destinatarioNombre"
                  placeholder="Ej: Juan Perez Garcia"
                  value={formData.destinatarioNombre}
                  onChange={(e) => handleChange('destinatarioNombre', e.target.value)}
                  className={errors.destinatarioNombre ? 'border-destructive' : ''}
                />
                {errors.destinatarioNombre && (
                  <p className="text-[12px] text-destructive mt-1">{errors.destinatarioNombre}</p>
                )}
              </div>

              <div>
                <Label className="text-[12px]" htmlFor="destinatarioDireccion">Direccion de entrega *</Label>
                <Textarea
                  id="destinatarioDireccion"
                  placeholder="Calle, numero, barrio, referencias..."
                  value={formData.destinatarioDireccion}
                  onChange={(e) => handleChange('destinatarioDireccion', e.target.value)}
                  className={cn("text-[13px]", errors.destinatarioDireccion && 'border-destructive')}
                  rows={3}
                />
                {errors.destinatarioDireccion && (
                  <p className="text-[12px] text-destructive mt-1">{errors.destinatarioDireccion}</p>
                )}
              </div>

              <div>
                <Label className="text-[12px]" htmlFor="destinatarioTelefono">Telefono *</Label>
                <Input
                  id="destinatarioTelefono"
                  placeholder="+595 XXX XXX XXX"
                  value={formData.destinatarioTelefono}
                  onChange={(e) => handleChange('destinatarioTelefono', e.target.value)}
                  className={cn("font-data", errors.destinatarioTelefono && 'border-destructive')}
                />
                {errors.destinatarioTelefono && (
                  <p className="text-[12px] text-destructive mt-1">{errors.destinatarioTelefono}</p>
                )}
                <p className="text-[11px] text-muted-foreground mt-1">Formato: +595 XXX XXX XXX</p>
              </div>

              <div>
                <Label className="text-[12px]" htmlFor="notas">Notas adicionales (opcional)</Label>
                <Textarea
                  id="notas"
                  placeholder="Instrucciones especiales, contenido fragil, horarios preferidos..."
                  value={formData.notas}
                  onChange={(e) => handleChange('notas', e.target.value)}
                  rows={2}
                  className="text-[13px]"
                />
              </div>
            </div>
          )}

          {pasoActual === 5 && (
            <div className="space-y-6">
              <h3 className="text-[15px] font-semibold mb-4">Informacion de Pago</h3>

              {precioSugerido > 0 && (
                <div className="surface-card p-4 border-primary/20 animate-scale-in">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <CreditCard size={16} weight="duotone" className="text-primary" />
                    </div>
                    <div className="flex-1">
                      <h4 className="section-label mb-1">Precio Sugerido</h4>
                      <p className="text-2xl font-bold text-primary mb-1 font-data">
                        {formatCurrency(precioSugerido)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Basado en peso tarifado de <span className="font-data">{pesoTarifado.toFixed(2)} kg</span>
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <Label className="text-[12px]" htmlFor="costo">Costo del envio (Gs.) *</Label>
                <Input
                  id="costo"
                  type="number"
                  placeholder="0"
                  value={formData.costo}
                  onChange={(e) => handleChange('costo', e.target.value)}
                  className={cn("font-data", errors.costo && 'border-destructive')}
                />
                {errors.costo && (
                  <p className="text-[12px] text-destructive mt-1">{errors.costo}</p>
                )}
              </div>

              <div>
                <Label className="text-[12px]" htmlFor="tipoPago">Tipo de pago *</Label>
                <Select value={formData.tipoPago} onValueChange={(v) => handleChange('tipoPago', v)}>
                  <SelectTrigger id="tipoPago" className={errors.tipoPago ? 'border-destructive' : ''}>
                    <SelectValue placeholder="Selecciona el tipo de pago" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="anticipado">
                      <div className="flex flex-col">
                        <span className="text-[13px]">Pago Anticipado</span>
                        <span className="text-[11px] text-muted-foreground">Cliente paga antes del envio</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="contra_entrega">
                      <div className="flex flex-col">
                        <span className="text-[13px]">Contra Entrega</span>
                        <span className="text-[11px] text-muted-foreground">Repartidor cobra al entregar</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="cuenta_corriente">
                      <div className="flex flex-col">
                        <span className="text-[13px]">Cuenta Corriente</span>
                        <span className="text-[11px] text-muted-foreground">Facturacion mensual</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                {errors.tipoPago && (
                  <p className="text-[12px] text-destructive mt-1">{errors.tipoPago}</p>
                )}
              </div>

              {/* Resumen final */}
              <div className="surface-card p-4">
                <h4 className="section-label mb-3">Resumen del Envio</h4>
                <div className="space-y-2 text-[13px]">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cliente:</span>
                    <span className="font-medium">
                      {CLIENTES.find(c => c.value === formData.cliente)?.label || '-'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ruta:</span>
                    <span className="font-medium">{formData.origen} → {formData.destino}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Peso tarifado:</span>
                    <span className="font-medium font-data">{pesoTarifado.toFixed(2)} kg</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Destinatario:</span>
                    <span className="font-medium">{formData.destinatarioNombre || '-'}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t">
                    <span className="text-muted-foreground">Total:</span>
                    <span className="font-bold text-lg font-data">
                      {formData.costo ? formatCurrency(parseFloat(formData.costo)) : '-'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Navegacion */}
      <div className="flex justify-between mt-6">
        <Button
          variant="outline"
          size="sm"
          onClick={pasoAnterior}
          disabled={pasoActual === 1 || isSubmitting}
        >
          <CaretLeft size={14} weight="duotone" className="mr-1.5" />
          Anterior
        </Button>

        {pasoActual < 5 ? (
          <Button size="sm" onClick={siguientePaso}>
            Siguiente
            <CaretRight size={14} weight="duotone" className="ml-1.5" />
          </Button>
        ) : (
          <Button size="sm" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <SpinnerGap size={14} weight="bold" className="mr-1.5 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <CheckCircle size={14} weight="duotone" className="mr-1.5" />
                Crear Envio
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
