import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Phone, WhatsappLogo, XCircle, PhoneSlash } from '@phosphor-icons/react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { formatTimestampSmart } from '@/lib/utils';
import { useIntentosContacto, useRegistrarIntentoContacto, type IntentoContacto } from '@/hooks/api/use-envios';

type TipoIntento = IntentoContacto['tipo'];

const MAX_DESCRIPCION = 200;

interface Props {
  envioId: string;
}

const TIPO_OPTIONS: Array<{ value: TipoIntento; label: string; helper: string }> = [
  { value: 'llamada', label: 'Llamada', helper: 'Intento telefónico al destinatario' },
  { value: 'whatsapp', label: 'WhatsApp', helper: 'Mensaje por WhatsApp' },
  { value: 'visita_fallida', label: 'Visita fallida', helper: 'Se pasó a entregar y no estaba' },
];

function tipoIcon(tipo: TipoIntento) {
  if (tipo === 'llamada') return <Phone size={14} weight="duotone" className="text-primary" />;
  if (tipo === 'whatsapp') return <WhatsappLogo size={14} weight="duotone" className="text-success" />;
  return <PhoneSlash size={14} weight="duotone" className="text-warning" />;
}

function tipoLabel(tipo: TipoIntento) {
  if (tipo === 'llamada') return 'Llamada';
  if (tipo === 'whatsapp') return 'WhatsApp';
  return 'Visita fallida';
}

export function IntentosContactoCard({ envioId }: Props) {
  const [open, setOpen] = useState(false);
  const [tipo, setTipo] = useState<TipoIntento>('llamada');
  const [descripcion, setDescripcion] = useState('');

  const { data: intentos = [], isLoading } = useIntentosContacto(envioId);
  const registrarMut = useRegistrarIntentoContacto();

  const resetForm = () => {
    setTipo('llamada');
    setDescripcion('');
  };

  const handleSubmit = () => {
    const desc = descripcion.trim();
    registrarMut.mutate(
      { envioId, tipo, descripcion: desc || undefined },
      {
        onSuccess: () => {
          toast.success('Intento de contacto registrado');
          setOpen(false);
          resetForm();
        },
      },
    );
  };

  return (
    <div className="surface-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="section-label">Intentos de contacto</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Registro de cada intento con el destinatario cuando no se logra entregar.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => { setOpen(true); resetForm(); }}
        >
          <Plus className="w-3.5 h-3.5" />
          Registrar intento
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-10 bg-muted/20 rounded animate-pulse" />
          ))}
        </div>
      ) : intentos.length === 0 ? (
        <div className="py-6 text-center">
          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center mx-auto mb-2">
            <XCircle size={16} weight="duotone" className="text-muted-foreground/50" />
          </div>
          <p className="text-[12px] text-muted-foreground">Todavía no se registró ningún intento de contacto.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border/40">
          {intentos.map((intento) => (
            <li key={intento.id} className="py-2.5 flex items-start gap-3">
              <div className="w-7 h-7 rounded-md bg-muted/40 flex items-center justify-center flex-shrink-0">
                {tipoIcon(intento.tipo)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-[13px]">
                  <span className="font-medium">{tipoLabel(intento.tipo)}</span>
                  <span className="text-muted-foreground/60">·</span>
                  <span className="text-muted-foreground">{formatTimestampSmart(intento.creadoEn)}</span>
                  <span className="text-muted-foreground/60">·</span>
                  <span className="text-muted-foreground">{intento.registradoPorNombre}</span>
                </div>
                {intento.descripcion && (
                  <p className="text-[12px] text-muted-foreground mt-0.5">{intento.descripcion}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={(v) => { if (!v) { setOpen(false); resetForm(); } else { setOpen(true); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar intento de contacto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-[12px]">Tipo de intento</Label>
              <RadioGroup
                value={tipo}
                onValueChange={(v) => setTipo(v as TipoIntento)}
                className="mt-2 space-y-2"
              >
                {TIPO_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    htmlFor={`tipo-${opt.value}`}
                    className="flex items-start gap-3 rounded-md border border-border p-3 cursor-pointer hover:bg-muted/30 transition-colors"
                  >
                    <RadioGroupItem id={`tipo-${opt.value}`} value={opt.value} className="mt-0.5" />
                    <div>
                      <p className="text-[13px] font-medium">{opt.label}</p>
                      <p className="text-[11px] text-muted-foreground">{opt.helper}</p>
                    </div>
                  </label>
                ))}
              </RadioGroup>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-[12px]">Descripción (opcional)</Label>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {descripcion.length} / {MAX_DESCRIPCION}
                </span>
              </div>
              <Textarea
                value={descripcion}
                maxLength={MAX_DESCRIPCION}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Ej: no contestó, pidió llamar más tarde, nadie en el domicilio"
                rows={3}
                className="mt-1 text-[13px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" size="sm" onClick={() => { setOpen(false); resetForm(); }} disabled={registrarMut.isPending}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={registrarMut.isPending}>
              {registrarMut.isPending ? 'Guardando...' : 'Guardar intento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
