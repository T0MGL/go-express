import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { CircleNotch, ClipboardText, Warning, CheckCircle } from '@phosphor-icons/react';
import { useCrearLiquidacion } from '@/hooks/api/use-liquidaciones';
import { useRepartidores } from '@/hooks/api/use-repartidores';
import { formatCurrency } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

interface LiquidacionWizardProps {
  isOpen: boolean;
  onClose: () => void;
  defaultRepartidorId?: string | undefined;
}

function dateYYYYMMDD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function LiquidacionWizard({ isOpen, onClose, defaultRepartidorId }: LiquidacionWizardProps) {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [repartidorId, setRepartidorId] = useState(defaultRepartidorId ?? '');
  const today = dateYYYYMMDD(new Date());
  const [fechaDesde, setFechaDesde] = useState(today);
  const [fechaHasta, setFechaHasta] = useState(today);

  const { data: repartidoresData } = useRepartidores({ limit: 100 });
  const repartidores = repartidoresData?.data ?? [];

  const crear = useCrearLiquidacion();

  const rangoInvalido = useMemo(() => fechaHasta < fechaDesde, [fechaDesde, fechaHasta]);

  function handleClose() {
    if (crear.isPending) return;
    setStep(1);
    crear.reset();
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!repartidorId) {
      toast.error('Selecciona un repartidor');
      return;
    }
    if (rangoInvalido) {
      toast.error('El rango de fechas es invalido');
      return;
    }
    crear.mutate(
      { repartidorId, fechaDesde, fechaHasta },
      {
        onSuccess: (liq) => {
          toast.success(`Liquidacion creada con ${liq.cantidadEnvios ?? 0} envios, esperado ${formatCurrency(liq.montoTotalEsperado)}`);
          handleClose();
          navigate(`/admin/liquidaciones/${liq.id}`);
        },
        onError: (err) => {
          const msg = err instanceof Error ? err.message : 'Error creando liquidacion';
          toast.error(msg);
        },
      },
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <ClipboardText size={18} weight="duotone" className="text-primary" />
            <DialogTitle className="text-[15px]">Nueva liquidacion</DialogTitle>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          {step === 1 && (
            <div className="space-y-4 py-4">
              <div>
                <Label className="text-[12px]">Repartidor</Label>
                <Select value={repartidorId} onValueChange={setRepartidorId}>
                  <SelectTrigger className="mt-1.5 h-10">
                    <SelectValue placeholder="Seleccionar repartidor..." />
                  </SelectTrigger>
                  <SelectContent>
                    {repartidores.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.nombre} · {r.vehiculo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[12px]" htmlFor="fechaDesde">Desde</Label>
                  <Input
                    id="fechaDesde"
                    type="date"
                    value={fechaDesde}
                    onChange={(e) => setFechaDesde(e.target.value)}
                    className="mt-1.5 h-10"
                  />
                </div>
                <div>
                  <Label className="text-[12px]" htmlFor="fechaHasta">Hasta</Label>
                  <Input
                    id="fechaHasta"
                    type="date"
                    value={fechaHasta}
                    onChange={(e) => setFechaHasta(e.target.value)}
                    className="mt-1.5 h-10"
                  />
                </div>
              </div>

              {rangoInvalido && (
                <div className="surface-card p-3 border border-destructive/30 bg-destructive/5 text-[12px] text-destructive">
                  <Warning size={14} weight="duotone" className="inline mr-1" />
                  La fecha Hasta debe ser mayor o igual a Desde
                </div>
              )}

              <div className="surface-card p-3 text-[12px] text-muted-foreground">
                <p>
                  Al crear, el sistema toma snapshot de todos los envios contra entrega
                  entregados por el repartidor en el rango y calcula el monto esperado.
                  Luego vas a poder cerrar la liquidacion con el efectivo fisico recibido.
                </p>
                <p className="mt-1.5">
                  Las fechas se interpretan en zona horaria Asuncion, asi que entregas a las
                  23:00 quedan en el dia correcto.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleClose}
              disabled={crear.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={crear.isPending || !repartidorId || rangoInvalido}
              className="gap-1.5"
            >
              {crear.isPending && <CircleNotch size={14} weight="bold" className="animate-spin" />}
              {crear.isPending ? 'Creando...' : 'Crear liquidacion'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface CerrarLiquidacionModalProps {
  isOpen: boolean;
  onClose: () => void;
  liquidacionId: string;
  montoEsperado: number;
  onCerrar: (payload: { montoRecibido: number; notas?: string | undefined }) => Promise<void> | void;
  isPending: boolean;
}

const MOTIVO_MIN_DIFERENCIA = 10;
const MOTIVO_MAX = 500;

export function CerrarLiquidacionModal({
  isOpen,
  onClose,
  montoEsperado,
  onCerrar,
  isPending,
}: CerrarLiquidacionModalProps) {
  const [montoRecibidoStr, setMontoRecibidoStr] = useState(String(montoEsperado));
  const [notas, setNotas] = useState('');

  const montoRecibido = Number(montoRecibidoStr) || 0;
  const diferencia = montoRecibido - montoEsperado;
  const tieneDiferencia = diferencia !== 0;
  const notasTrim = notas.trim();
  const notasCortas = tieneDiferencia && notasTrim.length < MOTIVO_MIN_DIFERENCIA;

  function handleClose() {
    if (isPending) return;
    setMontoRecibidoStr(String(montoEsperado));
    setNotas('');
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (montoRecibido < 0) {
      toast.error('El monto recibido debe ser positivo');
      return;
    }
    if (notasCortas) {
      toast.error(`Las notas deben tener al menos ${MOTIVO_MIN_DIFERENCIA} caracteres si hay diferencia`);
      return;
    }
    await onCerrar({ montoRecibido, notas: notasTrim.length > 0 ? notasTrim : undefined });
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <CheckCircle size={18} weight="duotone" className="text-primary" />
            <DialogTitle className="text-[15px]">Cerrar liquidacion</DialogTitle>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="surface-card p-3">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-muted-foreground">Monto esperado</span>
                <span className="font-data font-semibold">{formatCurrency(montoEsperado)}</span>
              </div>
            </div>

            <div>
              <Label className="text-[12px]" htmlFor="montoRecibido">
                Monto fisico recibido (Gs) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="montoRecibido"
                type="number"
                min={0}
                step={1}
                value={montoRecibidoStr}
                onChange={(e) => setMontoRecibidoStr(e.target.value)}
                className="mt-1.5 h-10 font-data"
                required
              />
            </div>

            {tieneDiferencia && (
              <div className={`surface-card p-3 border ${diferencia < 0 ? 'border-destructive/40 bg-destructive/5' : 'border-amber-500/40 bg-amber-50/40'}`}>
                <div className="flex items-center gap-2">
                  <Warning size={16} weight="duotone" className={diferencia < 0 ? 'text-destructive' : 'text-amber-600'} />
                  <p className="text-[13px] font-medium">
                    Diferencia: <span className="font-data">{diferencia > 0 ? '+' : ''}{formatCurrency(diferencia)}</span>
                  </p>
                </div>
                <p className="text-[12px] text-muted-foreground mt-1">
                  La liquidacion se cerrara con estado <strong>con_diferencia</strong> y quedara asentada en auditoria.
                </p>
              </div>
            )}

            <div>
              <Label className="text-[12px]" htmlFor="notas">
                Notas {tieneDiferencia && <span className="text-destructive">*</span>}
              </Label>
              <Textarea
                id="notas"
                value={notas}
                onChange={(e) => setNotas(e.target.value.slice(0, MOTIVO_MAX))}
                placeholder={tieneDiferencia ? 'Ej: faltaron 5000 Gs, repartidor dice que se mojo un billete' : 'Opcional'}
                rows={3}
                className="mt-1.5 text-[13px]"
              />
              {notasCortas && (
                <p className="text-[11px] text-destructive mt-1">
                  Faltan {MOTIVO_MIN_DIFERENCIA - notasTrim.length} caracteres
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" size="sm" onClick={handleClose} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={isPending || notasCortas} className="gap-1.5">
              {isPending && <CircleNotch size={14} weight="bold" className="animate-spin" />}
              {isPending ? 'Cerrando...' : 'Confirmar cierre'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
