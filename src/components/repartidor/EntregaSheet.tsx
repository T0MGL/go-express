import { useEffect, useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PodCapture } from './PodCapture';
import { useMarcarEntregado, type RepartidorEnvio } from '@/hooks/api/use-repartidor-envios';
import { toast } from 'sonner';

interface EntregaSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  envio: RepartidorEnvio;
  onDone: () => void;
}

export function EntregaSheet({ open, onOpenChange, envio, onDone }: EntregaSheetProps) {
  const isCod = envio.tipo_pago === 'contra_entrega' && envio.monto_a_cobrar > 0;
  const [nombreRecibe, setNombreRecibe] = useState('');
  const [documento, setDocumento] = useState('');
  const [montoCobrado, setMontoCobrado] = useState<string>(isCod ? String(envio.monto_a_cobrar) : '');
  const [fotoPath, setFotoPath] = useState<string | null>(envio.foto_entrega_url);
  const [notas, setNotas] = useState('');

  const marcarMut = useMarcarEntregado();

  useEffect(() => {
    if (open) {
      setNombreRecibe('');
      setDocumento('');
      setMontoCobrado(isCod ? String(envio.monto_a_cobrar) : '');
      setFotoPath(null);
      setNotas('');
    }
  }, [open, isCod, envio.monto_a_cobrar]);

  const montoWarning = useMemo(() => {
    if (!isCod) return null;
    const n = Number(montoCobrado);
    if (!Number.isFinite(n)) return 'Ingresá un monto válido';
    if (n <= 0) return 'El monto debe ser mayor a 0';
    if (n < envio.monto_a_cobrar) return `Estás cobrando menos que lo pactado (Gs. ${envio.monto_a_cobrar.toLocaleString('es-PY')})`;
    if (n > envio.monto_a_cobrar) return `Estás cobrando más que lo pactado`;
    return null;
  }, [isCod, montoCobrado, envio.monto_a_cobrar]);

  async function handleConfirm() {
    if (!nombreRecibe.trim()) {
      toast.error('Falta el nombre de quien recibe');
      return;
    }
    if (isCod) {
      const n = Number(montoCobrado);
      if (!Number.isFinite(n) || n <= 0) {
        toast.error('Ingresá un monto cobrado válido');
        return;
      }
    }

    try {
      await marcarMut.mutateAsync({
        id: envio.id,
        payload: {
          nombreRecibe: nombreRecibe.trim(),
          ...(documento.trim() ? { documento: documento.trim() } : {}),
          ...(isCod ? { montoCobrado: Number(montoCobrado) } : {}),
          ...(fotoPath ? { fotoPath } : {}),
          ...(notas.trim() ? { notas: notas.trim() } : {}),
        },
      });
      toast.success('Entrega confirmada');
      onDone();
    } catch (err) {
      toast.error('No se pudo confirmar la entrega. Intentá de nuevo.');
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle>Confirmar entrega</SheetTitle>
          <SheetDescription>
            {envio.tracking_number} · {envio.destinatario_nombre}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="recibe">Nombre de quien recibe *</Label>
            <Input
              id="recibe"
              value={nombreRecibe}
              onChange={(e) => setNombreRecibe(e.target.value)}
              placeholder="Ej: Juan Pérez"
              className="h-11 text-base"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="doc">Documento / CI (opcional)</Label>
            <Input
              id="doc"
              value={documento}
              onChange={(e) => setDocumento(e.target.value)}
              placeholder="Ej: 1.234.567"
              inputMode="numeric"
              className="h-11 text-base"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Foto del paquete (opcional, recomendada)</Label>
            <PodCapture
              envioId={envio.id}
              onUploaded={setFotoPath}
              onClear={() => setFotoPath(null)}
              currentPath={fotoPath}
            />
          </div>

          {isCod && (
            <div className="space-y-1.5 bg-primary/5 border border-primary/20 rounded-lg p-3">
              <Label htmlFor="cod" className="text-[13px] font-semibold">
                Monto cobrado (COD) *
              </Label>
              <Input
                id="cod"
                value={montoCobrado}
                onChange={(e) => setMontoCobrado(e.target.value.replace(/\D+/g, ''))}
                placeholder="0"
                inputMode="numeric"
                className="h-11 text-base font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                Pactado: Gs. {envio.monto_a_cobrar.toLocaleString('es-PY')}
              </p>
              {montoWarning && (
                <p className="text-[11px] text-amber-700 font-medium">{montoWarning}</p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="notas">Notas (opcional)</Label>
            <Textarea
              id="notas"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Ej: Entregado al portero."
              rows={2}
            />
          </div>

          <Button
            type="button"
            className="w-full h-12 text-[15px]"
            onClick={handleConfirm}
            disabled={marcarMut.isPending}
          >
            {marcarMut.isPending ? 'Confirmando...' : 'Confirmar entrega'}
          </Button>

          <p className="text-[11px] text-center text-muted-foreground">
            Si no tenés foto, igual podés confirmar la entrega.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
