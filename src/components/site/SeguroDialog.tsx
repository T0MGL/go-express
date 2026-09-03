import { ArrowRight, ShieldCheck } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';

interface SeguroDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContactar: () => void;
}

export function SeguroDialog({ open, onOpenChange, onContactar }: SeguroDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-0 overflow-hidden p-0">
        <div className="border-b border-border/70 px-7 pb-6 pt-8">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
              <ShieldCheck weight="duotone" className="h-6 w-6 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-[21px] font-bold leading-tight tracking-tight text-sidebar">Seguro de carga</h3>
              <p className="mt-1 text-[13px] text-sidebar/50">Cobertura incluida en todos los envíos Go Express.</p>
            </div>
          </div>
        </div>

        <div className="space-y-5 px-7 py-6">
          <div className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-5">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-primary">Incluido sin costo</div>
            <p className="mt-2 font-display text-[18px] font-bold leading-snug text-sidebar">Hasta Gs. 200.000 por envío</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-sidebar/60">
              Todos los paquetes enviados con Go Express tienen cobertura automática de hasta doscientos mil guaraníes ante
              pérdida o daño en tránsito. No requiere contratación adicional.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-muted/20 p-5">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-sidebar/50">Cobertura ampliada</div>
            <p className="mt-2 font-display text-[18px] font-bold leading-snug text-sidebar">Sobre el valor declarado</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-sidebar/60">
              Para mercadería con valor superior a Gs. 200.000 se aplica un porcentaje sobre el valor declarado. Varía según el
              tipo de producto, el riesgo de manipulación y el destino, y se cotiza al crear el envío.
            </p>
          </div>

          <div className="space-y-1.5 pt-1 text-[12px] leading-relaxed text-sidebar/45">
            <p>
              <span className="font-semibold text-sidebar/70">Reclamos:</span> hasta 48 horas luego de la entrega, con factura y
              fotografías del paquete.
            </p>
            <p>
              <span className="font-semibold text-sidebar/70">Exclusiones:</span> dinero en efectivo, joyería sin declarar,
              perecederos no refrigerados y mercadería prohibida por ley.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border/70 bg-muted/20 px-7 py-5">
          <p className="text-[12px] text-sidebar/45">¿Necesitás cobertura especial? Consultanos.</p>
          <Button
            size="sm"
            className="gap-1.5 transition-transform duration-200 active:scale-[0.98]"
            onClick={() => { onOpenChange(false); onContactar(); }}
          >
            Contactar
            <ArrowRight weight="bold" className="h-3.5 w-3.5" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
