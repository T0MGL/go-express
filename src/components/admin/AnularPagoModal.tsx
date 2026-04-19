import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Warning, CircleNotch } from '@phosphor-icons/react';
import { useAnularPago } from '@/hooks/api/use-pagos';
import { formatCurrency } from '@/lib/utils';

interface AnularPagoModalProps {
  isOpen: boolean;
  onClose: () => void;
  pagoId: string;
  montoRecibido: number;
  esCuentaCorriente: boolean;
  onAnulado?: () => void;
}

const MOTIVO_MIN = 10;
const MOTIVO_MAX = 500;

export const AnularPagoModal = ({
  isOpen,
  onClose,
  pagoId,
  montoRecibido,
  esCuentaCorriente,
  onAnulado,
}: AnularPagoModalProps) => {
  const [motivo, setMotivo] = useState('');
  const anularPago = useAnularPago();

  const handleClose = () => {
    if (anularPago.isPending) return;
    setMotivo('');
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const trimmed = motivo.trim();
    if (trimmed.length < MOTIVO_MIN) {
      toast.error(`El motivo debe tener al menos ${MOTIVO_MIN} caracteres`);
      return;
    }

    anularPago.mutate(
      { id: pagoId, motivo: trimmed },
      {
        onSuccess: () => {
          toast.success('Pago anulado correctamente');
          setMotivo('');
          onAnulado?.();
          onClose();
        },
        onError: (err) => {
          const msg = err instanceof Error ? err.message : 'Error al anular el pago';
          toast.error(msg);
        },
      },
    );
  };

  const remaining = MOTIVO_MAX - motivo.length;
  const tooShort = motivo.trim().length > 0 && motivo.trim().length < MOTIVO_MIN;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Warning size={18} weight="duotone" className="text-destructive" />
            <DialogTitle className="text-[15px]">Anular cobro</DialogTitle>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="surface-card p-3 border border-destructive/30 bg-destructive/5">
              <p className="text-[13px] font-medium text-foreground">
                Esta accion es irreversible.
              </p>
              <p className="text-[12px] text-muted-foreground mt-1">
                {esCuentaCorriente
                  ? `Se anulara el cobro de ${formatCurrency(montoRecibido)} y se revertira el saldo de cuenta corriente del cliente.`
                  : `Se marcara el cobro de ${formatCurrency(montoRecibido)} como anulado. Podras registrar un nuevo cobro sobre el mismo envio.`}
              </p>
            </div>

            <div>
              <Label className="text-[12px]" htmlFor="motivo">
                Motivo de la anulacion <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="motivo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value.slice(0, MOTIVO_MAX))}
                placeholder="Ej: el cobrador cargo el pago al envio equivocado y el cliente reclamo por email"
                rows={4}
                required
                className="mt-1.5 text-[13px]"
              />
              <div className="flex justify-between items-center mt-1">
                <p className={`text-[11px] ${tooShort ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {tooShort
                    ? `Faltan ${MOTIVO_MIN - motivo.trim().length} caracteres`
                    : `Minimo ${MOTIVO_MIN} caracteres`}
                </p>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  {remaining} restantes
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleClose}
              disabled={anularPago.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              disabled={anularPago.isPending || motivo.trim().length < MOTIVO_MIN}
              className="gap-1.5"
            >
              {anularPago.isPending && <CircleNotch size={14} weight="bold" className="animate-spin" />}
              {anularPago.isPending ? 'Anulando...' : 'Confirmar anulacion'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
