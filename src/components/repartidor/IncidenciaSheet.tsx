import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useReportarIncidencia, type RepartidorEnvio } from '@/hooks/api/use-repartidor-envios';
import { toast } from 'sonner';
import { Warning } from '@phosphor-icons/react';

interface IncidenciaSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  envio: RepartidorEnvio;
  onDone: () => void;
}

const PRESETS = [
  'No había nadie en casa',
  'Dirección errada',
  'Cliente rechazó el paquete',
  'Paquete dañado',
  'Zona peligrosa',
];

export function IncidenciaSheet({ open, onOpenChange, envio, onDone }: IncidenciaSheetProps) {
  const [nota, setNota] = useState('');
  const reportarMut = useReportarIncidencia();

  useEffect(() => {
    if (open) setNota('');
  }, [open]);

  async function handleSubmit() {
    const trimmed = nota.trim();
    if (trimmed.length < 3) {
      toast.error('Describí qué pasó (mínimo 3 caracteres).');
      return;
    }
    try {
      await reportarMut.mutateAsync({ id: envio.id, nota: trimmed });
      toast.success('Incidencia reportada al operador');
      onDone();
    } catch {
      toast.error('No se pudo enviar. Intentá de nuevo.');
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2 text-amber-600">
            <Warning size={20} weight="duotone" />
            Reportar incidencia
          </SheetTitle>
          <SheetDescription>
            El operador verá tu reporte al instante. El envío queda marcado con flag pero podés seguir intentando.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium">Situación</label>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setNota(p)}
                  className="text-[12px] px-3 py-1.5 rounded-full border border-border bg-background hover:bg-muted/60 transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[13px] font-medium">Descripción</label>
            <Textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Contanos qué pasó para que el operador pueda resolver."
              rows={4}
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground">{nota.length}/1000</p>
          </div>

          <Button
            type="button"
            variant="destructive"
            className="w-full h-12 text-[15px]"
            onClick={handleSubmit}
            disabled={reportarMut.isPending}
          >
            {reportarMut.isPending ? 'Enviando...' : 'Reportar al operador'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
