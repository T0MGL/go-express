import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  CurrencyDollar, Receipt, ArrowDown, ArrowUp,
  Plus, Minus, Sliders,
} from '@phosphor-icons/react';
import { toast } from 'sonner';
import { cn, formatCurrency, formatTimestampSmart } from '@/lib/utils';
import {
  useSaldoAdmin,
  useMovimientosAdmin,
  useCrearAjuste,
  useCrearNotaCredito,
  useUpdateLimiteCredito,
  type TipoMovimientoCc,
} from '@/hooks/api/use-cuenta-corriente';

interface Props {
  clienteId: string;
  clienteNombre: string;
}

const tipoLabels: Record<TipoMovimientoCc, string> = {
  debito: 'Débito',
  credito: 'Crédito',
  ajuste: 'Ajuste',
  nota_credito: 'Nota crédito',
  reverso: 'Reverso',
};

export function AdminCuentaCorriente({ clienteId, clienteNombre }: Props) {
  const { data: saldo, isLoading: loadingSaldo } = useSaldoAdmin(clienteId);
  const { data: movs, isLoading: loadingMovs } = useMovimientosAdmin(clienteId, { page: 1, limit: 8 });

  const [ajusteOpen, setAjusteOpen] = useState(false);
  const [notaOpen, setNotaOpen] = useState(false);
  const [limiteOpen, setLimiteOpen] = useState(false);

  const movimientos = movs?.data ?? [];
  const total = movs?.pagination?.total ?? 0;

  const saldoTone = useMemo<'debt' | 'credit' | 'neutral'>(() => {
    const s = saldo?.saldo ?? 0;
    if (s > 0) return 'debt';
    if (s < 0) return 'credit';
    return 'neutral';
  }, [saldo?.saldo]);

  const disponibleTone = useMemo<'debt' | 'credit' | 'neutral'>(() => {
    if (saldo?.disponible == null) return 'neutral';
    if (saldo.disponible <= 0) return 'debt';
    return 'credit';
  }, [saldo?.disponible]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <SaldoCard
          label="Saldo"
          value={loadingSaldo ? null : saldo?.saldo ?? 0}
          tone={saldoTone}
        />
        <SaldoCard
          label="Límite"
          value={loadingSaldo ? null : saldo?.limiteCredito ?? 0}
          tone="neutral"
          hint={(saldo?.limiteCredito ?? 0) === 0 ? 'No configurado' : undefined}
        />
        <SaldoCard
          label="Disponible"
          value={loadingSaldo ? null : saldo?.disponible}
          tone={disponibleTone}
          hint={saldo?.disponible == null ? 'No aplica' : undefined}
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAjusteOpen(true)}>
          <Plus size={13} weight="bold" /> Ajuste
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setNotaOpen(true)}>
          <Minus size={13} weight="bold" /> Nota de crédito
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setLimiteOpen(true)}>
          <Sliders size={13} weight="bold" /> Límite
        </Button>
      </div>

      <div className="surface-card overflow-hidden">
        <div className="px-3 py-2 border-b border-border/40 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[12px] font-medium">
            <Receipt size={13} weight="duotone" className="text-muted-foreground" />
            Últimos movimientos
          </div>
          {total > movimientos.length && (
            <span className="text-[11px] text-muted-foreground">
              {movimientos.length} de {total}
            </span>
          )}
        </div>

        {loadingMovs ? (
          <div className="p-3 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-8 bg-muted/20 rounded animate-pulse" />
            ))}
          </div>
        ) : movimientos.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CurrencyDollar size={20} weight="duotone" className="mx-auto mb-1.5 opacity-40" />
            <p className="text-[12px]">Sin movimientos registrados</p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {movimientos.map((m) => (
              <div key={m.id} className="px-3 py-2 flex items-center gap-2 text-[12px]">
                <Badge
                  variant={
                    m.tipo === 'credito' || m.tipo === 'nota_credito'
                      ? 'success'
                      : m.tipo === 'reverso'
                        ? 'warning'
                        : 'secondary'
                  }
                  className="text-[10px] px-1.5"
                >
                  {tipoLabels[m.tipo]}
                </Badge>
                <span className="flex-1 truncate text-foreground/80">{m.descripcion}</span>
                <span className="text-muted-foreground/60 font-data text-[10px] hidden sm:inline">
                  {formatTimestampSmart(m.creadoEn)}
                </span>
                <span
                  className={cn(
                    'font-data tabular-nums font-medium inline-flex items-center gap-0.5 w-24 justify-end',
                    m.monto < 0 ? 'text-emerald-600' : 'text-foreground',
                  )}
                >
                  {m.monto < 0 ? <ArrowDown size={11} weight="bold" /> : <ArrowUp size={11} weight="bold" />}
                  {formatCurrency(Math.abs(m.monto))}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <AjusteDialog
        open={ajusteOpen}
        onOpenChange={setAjusteOpen}
        clienteId={clienteId}
        clienteNombre={clienteNombre}
      />
      <NotaCreditoDialog
        open={notaOpen}
        onOpenChange={setNotaOpen}
        clienteId={clienteId}
        clienteNombre={clienteNombre}
      />
      <LimiteCreditoDialog
        open={limiteOpen}
        onOpenChange={setLimiteOpen}
        clienteId={clienteId}
        clienteNombre={clienteNombre}
        limiteActual={saldo?.limiteCredito ?? 0}
      />
    </div>
  );
}

interface SaldoCardProps {
  label: string;
  value: number | null | undefined;
  tone: 'debt' | 'credit' | 'neutral';
  hint?: string;
}

function SaldoCard({ label, value, tone, hint }: SaldoCardProps) {
  const colorClass =
    tone === 'debt'
      ? 'text-foreground'
      : tone === 'credit'
        ? 'text-emerald-600'
        : 'text-muted-foreground';

  return (
    <div className="rounded-lg border border-border/40 bg-card p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn('font-data tabular-nums font-semibold text-[15px] mt-0.5', colorClass)}>
        {value === null || value === undefined
          ? <span className="opacity-30">···</span>
          : formatCurrency(value)}
      </div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clienteId: string;
  clienteNombre: string;
}

function AjusteDialog({ open, onOpenChange, clienteId, clienteNombre }: DialogProps) {
  const [monto, setMonto] = useState('');
  const [signo, setSigno] = useState<'positivo' | 'negativo'>('positivo');
  const [descripcion, setDescripcion] = useState('');
  const mutation = useCrearAjuste(clienteId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const montoNum = Math.trunc(Number(monto));
    if (!Number.isFinite(montoNum) || montoNum <= 0) {
      toast.error('Monto invalido');
      return;
    }
    if (descripcion.trim().length < 10) {
      toast.error('La descripcion necesita al menos 10 caracteres');
      return;
    }
    const monto_final = signo === 'positivo' ? montoNum : -montoNum;
    mutation.mutate(
      { monto: monto_final, descripcion: descripcion.trim() },
      {
        onSuccess: () => {
          toast.success('Ajuste registrado');
          setMonto('');
          setDescripcion('');
          setSigno('positivo');
          onOpenChange(false);
        },
        onError: (err) => {
          const msg = (err as { data?: { error?: string } })?.data?.error || 'Error al registrar ajuste';
          toast.error(msg);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Registrar ajuste de cuenta corriente</DialogTitle>
          <DialogDescription className="text-[12px]">
            {clienteNombre}. El ajuste se asienta en el libro mayor con auditoría completa.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label className="text-[12px]">Tipo</Label>
            <div className="flex gap-1 mt-1.5">
              <button
                type="button"
                onClick={() => setSigno('positivo')}
                className={cn(
                  'flex-1 px-3 py-2 text-[12px] font-medium rounded-md border transition-colors',
                  signo === 'positivo'
                    ? 'bg-foreground text-background border-foreground'
                    : 'bg-transparent text-muted-foreground border-border hover:bg-muted/30',
                )}
              >
                <Plus size={12} weight="bold" className="inline mr-1" />
                Aumenta deuda
              </button>
              <button
                type="button"
                onClick={() => setSigno('negativo')}
                className={cn(
                  'flex-1 px-3 py-2 text-[12px] font-medium rounded-md border transition-colors',
                  signo === 'negativo'
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-transparent text-muted-foreground border-border hover:bg-muted/30',
                )}
              >
                <Minus size={12} weight="bold" className="inline mr-1" />
                Reduce deuda
              </button>
            </div>
          </div>
          <div>
            <Label className="text-[12px]">Monto (Gs)</Label>
            <Input
              type="number"
              min="1"
              step="1"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="50000"
              required
              className="mt-1.5 font-data"
            />
          </div>
          <div>
            <Label className="text-[12px]">Motivo (mín 10 caracteres)</Label>
            <Textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Ej: Corrección de saldo inicial post-onboarding del cliente"
              required
              rows={3}
              className="mt-1.5 resize-none"
            />
            <div className="text-[10px] text-muted-foreground mt-0.5 text-right">
              {descripcion.length} caracteres
            </div>
          </div>
          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={mutation.isPending}>
              {mutation.isPending ? 'Registrando...' : 'Registrar ajuste'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NotaCreditoDialog({ open, onOpenChange, clienteId, clienteNombre }: DialogProps) {
  const [monto, setMonto] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const mutation = useCrearNotaCredito(clienteId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const montoNum = Math.trunc(Number(monto));
    if (!Number.isFinite(montoNum) || montoNum <= 0) {
      toast.error('Monto invalido');
      return;
    }
    if (descripcion.trim().length < 10) {
      toast.error('La descripcion necesita al menos 10 caracteres');
      return;
    }
    mutation.mutate(
      { monto: montoNum, descripcion: descripcion.trim() },
      {
        onSuccess: () => {
          toast.success('Nota de crédito emitida');
          setMonto('');
          setDescripcion('');
          onOpenChange(false);
        },
        onError: (err) => {
          const msg = (err as { data?: { error?: string } })?.data?.error || 'Error al emitir nota de crédito';
          toast.error(msg);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Emitir nota de crédito</DialogTitle>
          <DialogDescription className="text-[12px]">
            {clienteNombre}. La nota reduce la deuda del cliente y queda asentada con auditoría.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label className="text-[12px]">Monto (Gs)</Label>
            <Input
              type="number"
              min="1"
              step="1"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="50000"
              required
              className="mt-1.5 font-data"
            />
          </div>
          <div>
            <Label className="text-[12px]">Motivo (mín 10 caracteres)</Label>
            <Textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Ej: Bonificación comercial por demora en entrega del envío GE2026000123"
              required
              rows={3}
              className="mt-1.5 resize-none"
            />
            <div className="text-[10px] text-muted-foreground mt-0.5 text-right">
              {descripcion.length} caracteres
            </div>
          </div>
          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={mutation.isPending}>
              {mutation.isPending ? 'Emitiendo...' : 'Emitir nota de crédito'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface LimiteDialogProps extends DialogProps {
  limiteActual: number;
}

function LimiteCreditoDialog({ open, onOpenChange, clienteId, clienteNombre, limiteActual }: LimiteDialogProps) {
  const [limite, setLimite] = useState(String(limiteActual));
  const [motivo, setMotivo] = useState('');
  const mutation = useUpdateLimiteCredito(clienteId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const limiteNum = Math.trunc(Number(limite));
    if (!Number.isFinite(limiteNum) || limiteNum < 0) {
      toast.error('Limite invalido');
      return;
    }
    if (motivo.trim().length < 5) {
      toast.error('El motivo necesita al menos 5 caracteres');
      return;
    }
    mutation.mutate(
      { limiteCredito: limiteNum, motivo: motivo.trim() },
      {
        onSuccess: () => {
          toast.success('Límite actualizado');
          setMotivo('');
          onOpenChange(false);
        },
        onError: (err) => {
          const msg = (err as { data?: { error?: string } })?.data?.error || 'Error al actualizar límite';
          toast.error(msg);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Editar límite de crédito</DialogTitle>
          <DialogDescription className="text-[12px]">
            {clienteNombre}. Límite 0 desactiva la restricción al crear envíos a cuenta corriente.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label className="text-[12px]">Límite (Gs)</Label>
            <Input
              type="number"
              min="0"
              step="1"
              value={limite}
              onChange={(e) => setLimite(e.target.value)}
              placeholder="0 = sin restricción"
              required
              className="mt-1.5 font-data"
            />
            <div className="text-[10px] text-muted-foreground mt-0.5">
              Actual: {formatCurrency(limiteActual)}
            </div>
          </div>
          <div>
            <Label className="text-[12px]">Motivo</Label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: Aprobado por gerencia para campaña Q2"
              required
              rows={2}
              className="mt-1.5 resize-none"
            />
          </div>
          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={mutation.isPending}>
              {mutation.isPending ? 'Guardando...' : 'Guardar límite'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
