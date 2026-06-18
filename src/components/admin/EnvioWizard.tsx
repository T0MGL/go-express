import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { CiudadPicker } from '@/components/CiudadPicker';
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
  ShieldCheck,
  Warning,
  SpinnerGap,
} from '@phosphor-icons/react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils';
import { PHONE_PLACEHOLDER, normalizePhone, isValidPhone } from '@/lib/phone';
import { useClientes } from '@/hooks/api/use-clientes';
import { useCreateEnvio } from '@/hooks/api/use-envios';
import { useSeguroConfig } from '@/hooks/api/use-seguro-config';
import {
  calcularSeguroAdicional,
  puedeAsegurar,
  requiereRevisionManual,
  seguroIncluido,
  SEGURO_DEFAULTS,
} from '@/lib/seguro';

// Esquemas de validacion por paso
const paso1Schema = z.object({
  cliente: z.string().min(1, 'Seleccioná un cliente'),
});

const paso2Schema = z.object({
  origenCiudadId: z.string().min(1, 'Seleccioná la ciudad de origen'),
  destinoCiudadId: z.string().min(1, 'Seleccioná la ciudad de destino'),
});

const TALLAS = [
  { id: 'pequeno',    label: 'Pequeño',      desc: 'Hasta 30x20x15 cm',  largo: 30,  ancho: 20, alto: 15  },
  { id: 'mediano',    label: 'Mediano',      desc: 'Hasta 50x40x30 cm',  largo: 50,  ancho: 40, alto: 30  },
  { id: 'grande',     label: 'Grande',       desc: 'Hasta 80x60x50 cm',  largo: 80,  ancho: 60, alto: 50  },
  { id: 'extra',      label: 'Extra grande', desc: 'Hasta 120x80x70 cm', largo: 120, ancho: 80, alto: 70  },
] as const;

type TallaId = typeof TALLAS[number]['id'];

const paso3Schema = z.object({
  peso:  z.string().refine((val) => parseFloat(val) > 0, 'El peso debe ser mayor a 0'),
  talla: z.string().min(1, 'Selecciona un tamano'),
});

const paso4Schema = z.object({
  destinatarioNombre: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
  destinatarioDireccion: z.string().min(5, 'La dirección debe tener al menos 5 caracteres'),
  destinatarioTelefono: z.string().refine((v) => isValidPhone(v), {
    message: `Formato: ${PHONE_PLACEHOLDER}`,
  }),
  destinatarioEmail: z
    .string()
    .trim()
    .refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
      message: 'Email invalido',
    }),
});

const paso5Schema = z.object({
  costo: z.string().refine((val) => parseFloat(val) > 0, 'El costo debe ser mayor a 0'),
  tipoPago: z.enum(['anticipado', 'contra_entrega'], {
    errorMap: () => ({ message: 'Selecciona un tipo de pago' })
  }),
});

interface FormData {
  cliente: string;
  origenCiudadId: string;
  destinoCiudadId: string;
  origen: string;
  destino: string;
  peso: string;
  talla: TallaId | '';
  valorDeclarado: string;
  seguroAdicional: boolean;
  destinatarioNombre: string;
  destinatarioDireccion: string;
  destinatarioTelefono: string;
  destinatarioEmail: string;
  notas: string;
  costo: string;
  tipoPago: string;
}

const PASOS = [
  { numero: 1, titulo: 'Cliente', icon: UserCircle, descripcion: 'Información del cliente' },
  { numero: 2, titulo: 'Ruta', icon: MapPin, descripcion: 'Origen y destino' },
  { numero: 3, titulo: 'Paquete', icon: Package, descripcion: 'Dimensiones y peso' },
  { numero: 4, titulo: 'Destinatario', icon: FileText, descripcion: 'Datos de entrega' },
  { numero: 5, titulo: 'Pago', icon: CreditCard, descripcion: 'Información de pago' },
];

export function EnvioWizard() {
  const navigate = useNavigate();
  const [pasoActual, setPasoActual] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);


  const { data: apiClientes } = useClientes({ estado: 'activo' });
  const createEnvioMut = useCreateEnvio();
  const { data: seguroData } = useSeguroConfig();
  const seguroCfg = seguroData?.config ?? SEGURO_DEFAULTS;

  const CLIENTES = (apiClientes?.data ?? []).map(c => ({
        value: c.id,
        label: c.razonSocial,
        contacto: c.contactoNombre,
        telefono: c.telefono,
        email: c.email ?? '',
        ciudad: c.ciudad ?? '',
      }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const defaultFormData: FormData = {
    cliente: '',
    origenCiudadId: '',
    destinoCiudadId: '',
    origen: '',
    destino: '',
    peso: '',
    talla: '',
    valorDeclarado: '',
    seguroAdicional: false,
    destinatarioNombre: '',
    destinatarioDireccion: '',
    destinatarioTelefono: '',
    destinatarioEmail: '',
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

  // Seguro derivado del valor declarado + config admin
  const valorDeclaradoNum = parseFloat(formData.valorDeclarado) || 0;
  const valorIncluido = seguroIncluido(valorDeclaradoNum, seguroCfg);
  const valorAsegurable = puedeAsegurar(valorDeclaradoNum, seguroCfg);
  const valorExcedido = requiereRevisionManual(valorDeclaradoNum, seguroCfg);
  const costoSeguroCalculado =
    formData.seguroAdicional && valorAsegurable
      ? calcularSeguroAdicional(valorDeclaradoNum, seguroCfg)
      : 0;
  const costoEnvioNum = parseFloat(formData.costo) || 0;
  const totalConSeguro = costoEnvioNum + costoSeguroCalculado;

  // Si el valor declarado cambia y deja de ser asegurable, limpiar el flag
  useEffect(() => {
    if (formData.seguroAdicional && !valorAsegurable) {
      setFormData(prev => ({ ...prev, seguroAdicional: false }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valorAsegurable]);

  useEffect(() => {
    if (pasoActual === 5 && precioSugerido > 0 && !formData.costo) {
      handleChange('costo', precioSugerido.toString());
    }
    // Only trigger when entering step 5 or when the suggested price changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pasoActual, precioSugerido]);

  const handleChange = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Limpiar error del campo
    if (errors[field as string]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field as string];
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
        datosAValidar = { origenCiudadId: formData.origenCiudadId, destinoCiudadId: formData.destinoCiudadId };
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
          destinatarioEmail: formData.destinatarioEmail,
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
    const valorDeclaradoPayload = Math.round(parseFloat(formData.valorDeclarado) || 0);
    const emailTrimmed = formData.destinatarioEmail.trim();
    createEnvioMut.mutate(
        {
          clienteId: formData.cliente,
          origen: formData.origen,
          destino: formData.destino,
          peso: parseFloat(formData.peso),
          dimensiones: talla ? { largo: talla.largo, ancho: talla.ancho, alto: talla.alto } : undefined,
          destinatarioNombre: formData.destinatarioNombre,
          destinatarioDireccion: formData.destinatarioDireccion,
          destinatarioTelefono: normalizePhone(formData.destinatarioTelefono),
          ...(emailTrimmed ? { destinatarioEmail: emailTrimmed } : {}),
          notas: formData.notas,
          costo: Math.round(parseFloat(formData.costo)),
          tipoPago: formData.tipoPago,
          valorDeclarado: valorDeclaradoPayload,
          seguroAdicional: formData.seguroAdicional,
        },
        {
          onSuccess: () => {
            const mensaje = formData.tipoPago === 'anticipado'
              ? 'Envío creado con pago anticipado'
              : 'Envío creado exitosamente';
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
              : (apiErr?.data?.error ?? 'Error al crear el envío');
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
            <h2 className="text-xl font-bold">Nuevo envío</h2>
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
                <h3 className="text-[15px] font-semibold mb-4">Información del Cliente</h3>
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
                    <p><span className="text-muted-foreground">Teléfono:</span> <span className="font-data">{clienteSeleccionado.telefono}</span></p>
                    {clienteSeleccionado.email && (
                      <p><span className="text-muted-foreground">Email:</span> {clienteSeleccionado.email}</p>
                    )}
                    {clienteSeleccionado.ciudad && (
                      <p><span className="text-muted-foreground">Ciudad:</span> {clienteSeleccionado.ciudad}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {pasoActual === 2 && (
            <div className="space-y-6">
              <h3 className="text-[15px] font-semibold mb-4">Ruta de Envío</h3>

              <div className="grid grid-cols-2 gap-4">
                <CiudadPicker
                  value={formData.origenCiudadId || undefined}
                  onChange={(id, ciudad) => {
                    handleChange('origenCiudadId', id);
                    handleChange('origen', ciudad.nombre);
                  }}
                  label="Ciudad de origen *"
                  placeholder="Seleccionar origen"
                  id="wizard-origen"
                  error={errors.origenCiudadId}
                />
                <CiudadPicker
                  value={formData.destinoCiudadId || undefined}
                  onChange={(id, ciudad) => {
                    handleChange('destinoCiudadId', id);
                    handleChange('destino', ciudad.nombre);
                  }}
                  label="Ciudad de destino *"
                  placeholder="Seleccionar destino"
                  id="wizard-destino"
                  error={errors.destinoCiudadId}
                />
              </div>

              {formData.origen && formData.destino && (
                <div className="surface-card p-4 animate-scale-in">
                  <div className="flex items-center gap-3">
                    <MapPin size={18} weight="duotone" className="text-primary" />
                    <div className="flex-1">
                      <p className="font-medium text-[13px]">{formData.origen} → {formData.destino}</p>
                      <p className="text-[12px] text-muted-foreground">
                        {formData.origenCiudadId === formData.destinoCiudadId
                          ? 'Envío local (misma ciudad)'
                          : 'Envío entre ciudades'}
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

              {/* Valor declarado + seguro */}
              <div className="space-y-3 border-t pt-5">
                <div>
                  <Label className="text-[12px]" htmlFor="valorDeclarado">
                    Valor declarado del paquete (Gs.)
                  </Label>
                  <Input
                    id="valorDeclarado"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="1000"
                    placeholder="0"
                    value={formData.valorDeclarado}
                    onChange={(e) => handleChange('valorDeclarado', e.target.value)}
                    className="font-data mt-1.5"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Opcional. Declara el valor para cobertura de seguro mayor al incluido por default.
                  </p>
                </div>

                {valorIncluido && (
                  <div className="rounded-lg border border-green-200 bg-green-50/60 p-3 flex items-start gap-2.5">
                    <ShieldCheck size={16} weight="duotone" className="text-green-700 flex-shrink-0 mt-0.5" />
                    <div className="text-[12px] text-green-900 leading-relaxed">
                      <span className="font-semibold">Seguro incluido</span> hasta{' '}
                      <span className="font-data">{formatCurrency(seguroCfg.umbralIncluido)}</span>{' '}
                      sin costo adicional.
                    </div>
                  </div>
                )}

                {valorAsegurable && (
                  <div className="rounded-lg border border-primary/30 bg-primary/[0.04] p-3">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <Checkbox
                        id="seguroAdicional"
                        checked={formData.seguroAdicional}
                        onCheckedChange={(val) => handleChange('seguroAdicional', Boolean(val))}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <div className="text-[13px] font-semibold text-foreground">
                          Agregar seguro adicional por{' '}
                          <span className="font-data text-primary">
                            {formatCurrency(calcularSeguroAdicional(valorDeclaradoNum, seguroCfg))}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                          Cobertura hasta el valor declarado en caso de perdida o dano comprobado.
                          Se suma al costo total del envío.
                        </p>
                      </div>
                    </label>
                  </div>
                )}

                {valorExcedido && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 flex items-start gap-2.5">
                    <Warning size={16} weight="fill" className="text-amber-700 flex-shrink-0 mt-0.5" />
                    <div className="text-[12px] text-amber-900 leading-relaxed">
                      <span className="font-semibold">Valor alto detectado.</span> El seguro
                      automático cubre hasta{' '}
                      <span className="font-data">{formatCurrency(seguroCfg.maximoAsegurable)}</span>.
                      Contacta al equipo para asegurar envíos de mayor valor.
                    </div>
                  </div>
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
                <Label className="text-[12px]" htmlFor="destinatarioDireccion">Dirección de entrega *</Label>
                <Textarea
                  id="destinatarioDireccion"
                  placeholder="Calle, número, barrio, referencias..."
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
                <Label className="text-[12px]" htmlFor="destinatarioTelefono">Teléfono *</Label>
                <Input
                  id="destinatarioTelefono"
                  placeholder={PHONE_PLACEHOLDER}
                  value={formData.destinatarioTelefono}
                  onChange={(e) => handleChange('destinatarioTelefono', e.target.value)}
                  className={cn("font-data", errors.destinatarioTelefono && 'border-destructive')}
                />
                {errors.destinatarioTelefono && (
                  <p className="text-[12px] text-destructive mt-1">{errors.destinatarioTelefono}</p>
                )}
                <p className="text-[11px] text-muted-foreground mt-1">Formato: {PHONE_PLACEHOLDER}</p>
              </div>

              <div>
                <Label className="text-[12px]" htmlFor="destinatarioEmail">
                  Email del destinatario (opcional)
                </Label>
                <Input
                  id="destinatarioEmail"
                  type="email"
                  placeholder="correo@ejemplo.com"
                  value={formData.destinatarioEmail}
                  onChange={(e) => handleChange('destinatarioEmail', e.target.value)}
                  className={errors.destinatarioEmail ? 'border-destructive' : ''}
                />
                {errors.destinatarioEmail && (
                  <p className="text-[12px] text-destructive mt-1">{errors.destinatarioEmail}</p>
                )}
                <p className="text-[11px] text-muted-foreground mt-1">
                  Si lo completas, el destinatario recibira email en cada cambio de estado.
                </p>
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
              <h3 className="text-[15px] font-semibold mb-4">Información de Pago</h3>

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
                <Label className="text-[12px]" htmlFor="costo">Costo del envío (Gs.) *</Label>
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
                        <span className="text-[11px] text-muted-foreground">Cliente paga antes del envío</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="contra_entrega">
                      <div className="flex flex-col">
                        <span className="text-[13px]">Contra Entrega</span>
                        <span className="text-[11px] text-muted-foreground">Repartidor cobra al entregar</span>
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
                <h4 className="section-label mb-3">Resumen del Envío</h4>
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
                  {valorDeclaradoNum > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Valor declarado:</span>
                      <span className="font-medium font-data">{formatCurrency(valorDeclaradoNum)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Costo envío:</span>
                    <span className="font-medium font-data">
                      {costoEnvioNum > 0 ? formatCurrency(costoEnvioNum) : '-'}
                    </span>
                  </div>
                  {formData.seguroAdicional && costoSeguroCalculado > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <ShieldCheck size={12} weight="duotone" className="text-primary" />
                        Seguro adicional:
                      </span>
                      <span className="font-medium font-data">{formatCurrency(costoSeguroCalculado)}</span>
                    </div>
                  )}
                  {!formData.seguroAdicional && valorIncluido && valorDeclaradoNum > 0 && (
                    <div className="flex justify-between text-[11px] text-green-700">
                      <span className="flex items-center gap-1.5">
                        <ShieldCheck size={11} weight="duotone" />
                        Seguro incluido
                      </span>
                      <span className="font-data">Sin costo</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-2 border-t">
                    <span className="text-muted-foreground">Total:</span>
                    <span className="font-bold text-lg font-data">
                      {costoEnvioNum > 0 ? formatCurrency(totalConSeguro) : '-'}
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
                Crear Envío
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
