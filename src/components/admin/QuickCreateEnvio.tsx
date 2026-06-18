import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Checkbox } from '@/components/ui/checkbox';
import { departamentosPY } from '@/data/constants';
import { CiudadPicker } from '@/components/CiudadPicker';
import { useClientes, useClienteMostrador } from '@/hooks/api/use-clientes';
import { useCreateEnvio } from '@/hooks/api/use-envios';
import { isValidPhone, normalizePhone, PHONE_PLACEHOLDER } from '@/lib/phone';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface QuickCreateEnvioProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface QuickForm {
  clienteId: string;
  walkIn: boolean;
  walkInNombre: string;
  destinatarioNombre: string;
  destinatarioTelefono: string;
  destinatarioDireccion: string;
  destinatarioCiudad: string;
  origen: string;
  destino: string;
  peso: string;
  tipoServicio: 'estandar' | 'express';
  tipoPago: 'anticipado' | 'contra_entrega';
  costo: string;
  montoACobrar: string;
  notas: string;
}

const INITIAL: QuickForm = {
  clienteId: '',
  walkIn: false,
  walkInNombre: '',
  destinatarioNombre: '',
  destinatarioTelefono: '',
  destinatarioDireccion: '',
  destinatarioCiudad: '',
  origen: 'Central',
  destino: '',
  peso: '',
  tipoServicio: 'estandar',
  tipoPago: 'anticipado',
  costo: '',
  montoACobrar: '0',
  notas: '',
};

export function QuickCreateEnvio({ open, onOpenChange }: QuickCreateEnvioProps) {
  const [form, setForm] = useState<QuickForm>(INITIAL);
  const [clienteSearch, setClienteSearch] = useState('');
  const [clienteOpen, setClienteOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const clienteInputRef = useRef<HTMLInputElement>(null);

  const createEnvioMut = useCreateEnvio();

  const { data: clientesData } = useClientes({
    search: clienteSearch.length >= 2 ? clienteSearch : undefined,
    limit: 10,
  });
  const clientes = useMemo(() => clientesData?.data ?? [], [clientesData]);

  const { data: mostradorCliente } = useClienteMostrador();

  const selectedCliente = useMemo(
    () => clientes.find((c) => c.id === form.clienteId) ?? null,
    [clientes, form.clienteId],
  );

  useEffect(() => {
    if (!open) {
      setForm(INITIAL);
      setClienteSearch('');
      setClienteOpen(false);
      setMoreOpen(false);
      return;
    }
    const t = window.setTimeout(() => clienteInputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open]);

  const setField = <K extends keyof QuickForm>(field: K, value: QuickForm[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSelectCliente = (id: string, razonSocial: string) => {
    setField('clienteId', id);
    setClienteSearch(razonSocial);
    setClienteOpen(false);
  };

  const toggleWalkIn = (checked: boolean) => {
    setForm((prev) => ({
      ...prev,
      walkIn: checked,
      clienteId: checked ? (mostradorCliente?.id ?? '') : '',
      walkInNombre: checked ? prev.walkInNombre : '',
    }));
    setClienteSearch('');
    setClienteOpen(false);
  };

  const canSubmit =
    (form.walkIn
      ? Boolean(mostradorCliente?.id) && form.walkInNombre.trim().length >= 3
      : Boolean(form.clienteId)) &&
    form.destinatarioNombre.trim().length > 0 &&
    form.destinatarioTelefono.trim().length > 0 &&
    form.destinatarioDireccion.trim().length > 0 &&
    form.destino.trim().length > 0 &&
    form.peso.trim().length > 0 &&
    form.costo.trim().length > 0 &&
    !createEnvioMut.isPending;

  const handleSubmit = () => {
    if (form.walkIn) {
      if (!mostradorCliente?.id) {
        toast.error('No se pudo cargar el cliente mostrador. Refrescá la página.');
        return;
      }
      if (form.walkInNombre.trim().length < 3) {
        toast.error('Ingresá el nombre del remitente (mínimo 3 caracteres)');
        return;
      }
    } else if (!form.clienteId) {
      toast.error('Elegí un cliente antes de crear el envío');
      return;
    }

    if (!isValidPhone(form.destinatarioTelefono)) {
      toast.error(`Teléfono debe tener formato ${PHONE_PLACEHOLDER}`);
      return;
    }
    const pesoNum = parseFloat(form.peso);
    const costoNum = parseInt(form.costo, 10);
    const montoNum = parseInt(form.montoACobrar || '0', 10);
    if (!pesoNum || pesoNum <= 0) {
      toast.error('El peso debe ser mayor a 0');
      return;
    }
    if (!costoNum || costoNum < 0) {
      toast.error('El costo no puede quedar vacío');
      return;
    }

    const clienteId = form.walkIn ? (mostradorCliente?.id ?? '') : form.clienteId;
    const body = {
      clienteId,
      ...(form.walkIn ? { clienteNombreOverride: form.walkInNombre.trim() } : {}),
      origen: form.origen,
      destino: form.destino,
      destinatarioNombre: form.destinatarioNombre.trim(),
      destinatarioDireccion: form.destinatarioDireccion.trim(),
      destinatarioTelefono: normalizePhone(form.destinatarioTelefono),
      destinatarioCiudad: form.destinatarioCiudad.trim() || undefined,
      destinatarioDepartamento: form.destino.trim() || undefined,
      cantidad: 1,
      peso: pesoNum,
      fragil: false,
      costo: costoNum,
      montoACobrar: montoNum,
      tipoPago: form.tipoPago,
      seguroAdicional: false,
      tipoServicio: form.tipoServicio,
      notas: form.notas.trim() || undefined,
    };

    createEnvioMut.mutate(body, {
      onSuccess: (envio) => {
        toast.success(`Envío ${envio.trackingNumber} creado`);
        onOpenChange(false);
      },
      onError: (err) => {
        const message = err instanceof Error ? err.message : 'Error al crear envío';
        toast.error(message);
      },
    });
  };

  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA' && canSubmit) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Crear envío rápido</DialogTitle>
          <p className="text-[12px] text-muted-foreground mt-1">
            Solo los campos esenciales. Tocá <span className="font-medium">Más opciones</span> para cobrar al destino, peso volumétrico o notas.
          </p>
        </DialogHeader>

        <form
          className="space-y-4 pt-2"
          onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
          onKeyDown={handleFormKeyDown}
        >
          <div className="relative">
            <div className="flex items-center justify-between">
              <Label className="text-[12px]">
                {form.walkIn ? 'Nombre del remitente' : 'Cliente'}
              </Label>
              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none">
                <Checkbox
                  checked={form.walkIn}
                  onCheckedChange={(v) => toggleWalkIn(Boolean(v))}
                  disabled={!mostradorCliente}
                  className="h-3.5 w-3.5"
                />
                No es cliente registrado
              </label>
            </div>

            {form.walkIn ? (
              <>
                <Input
                  ref={clienteInputRef}
                  value={form.walkInNombre}
                  onChange={(e) => setField('walkInNombre', e.target.value)}
                  placeholder="Ej: Juan Pérez, Kiosco Don Luis"
                  className="mt-1"
                  autoComplete="off"
                  maxLength={300}
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Envío de mostrador. Queda registrado bajo el cliente sentinela "Mostrador" con este nombre como referencia.
                </p>
              </>
            ) : (
              <>
                <Input
                  ref={clienteInputRef}
                  value={clienteSearch}
                  onChange={(e) => {
                    setClienteSearch(e.target.value);
                    setField('clienteId', '');
                    setClienteOpen(true);
                  }}
                  onFocus={() => setClienteOpen(true)}
                  onBlur={() => window.setTimeout(() => setClienteOpen(false), 150)}
                  placeholder="Buscá por razón social o RUC"
                  className="mt-1"
                  autoComplete="off"
                />
                {clienteOpen && clientes.length > 0 && !selectedCliente && (
                  <div className="absolute z-50 left-0 right-0 mt-1 rounded-md border border-border bg-popover shadow-md max-h-56 overflow-y-auto">
                    {clientes.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleSelectCliente(c.id, c.razonSocial)}
                        className="w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors"
                      >
                        <p className="text-[13px] font-medium">{c.razonSocial}</p>
                        <p className="text-[11px] text-muted-foreground">RUC {c.ruc}</p>
                      </button>
                    ))}
                  </div>
                )}
                {selectedCliente && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    RUC {selectedCliente.ruc}
                  </p>
                )}
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px]">Nombre del destinatario</Label>
              <Input
                value={form.destinatarioNombre}
                onChange={(e) => setField('destinatarioNombre', e.target.value)}
                placeholder="Ej: Juan Benítez"
                className="mt-1"
                autoComplete="off"
              />
            </div>
            <div>
              <Label className="text-[12px]">Teléfono</Label>
              <Input
                value={form.destinatarioTelefono}
                onChange={(e) => setField('destinatarioTelefono', e.target.value)}
                placeholder={PHONE_PLACEHOLDER}
                className="mt-1 font-data"
                inputMode="tel"
                autoComplete="off"
              />
            </div>
          </div>

          <div>
            <Label className="text-[12px]">Dirección</Label>
            <Input
              value={form.destinatarioDireccion}
              onChange={(e) => setField('destinatarioDireccion', e.target.value)}
              placeholder="Calle, número, barrio, referencia"
              className="mt-1"
              autoComplete="off"
            />
          </div>

          <div>
            <CiudadPicker
              label="Ciudad de destino"
              value={undefined}
              onChange={(_id, ciudad) => {
                setField('destinatarioCiudad', ciudad.nombre);
                setField('destino', ciudad.departamentoNombre);
              }}
              placeholder="Elegi una ciudad"
              id="qc-destinatario-ciudad"
            />
            {form.destinatarioCiudad && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Seleccionada: <span className="font-medium text-foreground">{form.destinatarioCiudad}</span>
                {form.destino && <> (<span>{form.destino}</span>)</>}
              </p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-[12px]">Peso (kg)</Label>
              <Input
                type="number"
                step="0.1"
                min="0.1"
                value={form.peso}
                onChange={(e) => setField('peso', e.target.value)}
                placeholder="Ej: 1.5"
                className="mt-1 font-data"
              />
            </div>
            <div>
              <Label className="text-[12px]">Tipo de servicio</Label>
              <Select value={form.tipoServicio} onValueChange={(v) => setField('tipoServicio', v as QuickForm['tipoServicio'])}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="estandar">Estándar</SelectItem>
                  <SelectItem value="express">Express</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[12px]">Costo (Gs.)</Label>
              <Input
                type="number"
                min="0"
                step="1000"
                value={form.costo}
                onChange={(e) => setField('costo', e.target.value)}
                placeholder="Ej: 35000"
                className="mt-1 font-data"
              />
            </div>
          </div>

          <Collapsible open={moreOpen} onOpenChange={setMoreOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className={cn(
                  'flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors',
                )}
              >
                {moreOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                Más opciones
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[12px]">Departamento origen</Label>
                  <Select value={form.origen} onValueChange={(v) => setField('origen', v)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {departamentosPY.map((d) => (
                        <SelectItem key={`qco-${d}`} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[12px]">Tipo de pago</Label>
                  <Select value={form.tipoPago} onValueChange={(v) => setField('tipoPago', v as QuickForm['tipoPago'])}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="anticipado">Anticipado</SelectItem>
                      <SelectItem value="contra_entrega">Contra entrega</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-[12px]">Cobrar al destinatario (Gs.)</Label>
                <Input
                  type="number"
                  min="0"
                  step="1000"
                  value={form.montoACobrar}
                  onChange={(e) => setField('montoACobrar', e.target.value)}
                  className="mt-1 font-data"
                />
                <p className="text-[11px] text-muted-foreground mt-1">Dejá en 0 si no se cobra en la entrega.</p>
              </div>
              <div>
                <Label className="text-[12px]">Notas</Label>
                <Textarea
                  value={form.notas}
                  onChange={(e) => setField('notas', e.target.value)}
                  rows={2}
                  className="mt-1 text-[13px]"
                  placeholder="Algo que el repartidor deba saber"
                />
              </div>
            </CollapsibleContent>
          </Collapsible>

          <DialogFooter className="pt-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => onOpenChange(false)} disabled={createEnvioMut.isPending}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={!canSubmit}>
              {createEnvioMut.isPending ? 'Creando...' : 'Crear envío'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
