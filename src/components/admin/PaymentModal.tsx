import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Pago } from '@/data/types';
import { formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';
import { CreditCard, Info } from '@phosphor-icons/react';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  envioId: string;
  montoTotal: number;
  onPaymentRegistered: (pago: Pago) => void;
}

export const PaymentModal = ({
  isOpen,
  onClose,
  envioId,
  montoTotal,
  onPaymentRegistered
}: PaymentModalProps) => {
  const [montoRecibido, setMontoRecibido] = useState<string>('');
  const [metodoPago, setMetodoPago] = useState<string>('');
  const [fechaPago, setFechaPago] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [referencia, setReferencia] = useState<string>('');
  const [notas, setNotas] = useState<string>('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const montoRecibidoNum = parseFloat(montoRecibido);

    if (!montoRecibido || montoRecibidoNum <= 0) {
      toast.error('Debe ingresar el monto recibido');
      return;
    }

    if (!metodoPago) {
      toast.error('Debe seleccionar un metodo de pago');
      return;
    }

    const estadoPago = montoRecibidoNum >= montoTotal
      ? 'pagado'
      : montoRecibidoNum > 0
        ? 'pago_parcial'
        : 'pendiente';

    const pago: Pago = {
      id: `pago${Date.now()}`,
      envioId,
      montoTotal,
      montoRecibido: montoRecibidoNum,
      metodoPago: metodoPago as 'efectivo' | 'transferencia' | 'tarjeta' | 'contra_entrega',
      estadoPago: estadoPago as 'pendiente' | 'pagado' | 'pago_parcial',
      fechaPago,
      referencia,
      notas,
      creadoPor: 'admin',
      creadoEn: new Date().toISOString()
    };

    onPaymentRegistered(pago);
    toast.success('Pago registrado correctamente');
    onClose();
  };

  const cambio = parseFloat(montoRecibido) > montoTotal
    ? parseFloat(montoRecibido) - montoTotal
    : 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <CreditCard size={18} weight="duotone" className="text-primary" />
            <DialogTitle className="text-[15px]">Registrar Pago</DialogTitle>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="surface-card p-4">
              <p className="section-label mb-1">Monto a Pagar</p>
              <p className="text-2xl font-semibold font-data">
                {formatCurrency(montoTotal)}
              </p>
            </div>

            <div>
              <Label className="text-[12px]" htmlFor="montoRecibido">Monto Recibido *</Label>
              <Input
                id="montoRecibido"
                type="number"
                value={montoRecibido}
                onChange={(e) => setMontoRecibido(e.target.value)}
                placeholder="0"
                required
                className="mt-1.5 font-data"
              />
            </div>

            <div>
              <Label className="text-[12px]" htmlFor="metodoPago">Metodo de Pago *</Label>
              <Select value={metodoPago} onValueChange={setMetodoPago} required>
                <SelectTrigger id="metodoPago" className="mt-1.5">
                  <SelectValue placeholder="Seleccionar metodo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="transferencia">Transferencia Bancaria</SelectItem>
                  <SelectItem value="tarjeta">Tarjeta (POS)</SelectItem>
                  <SelectItem value="contra_entrega">Pago contra entrega</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-[12px]" htmlFor="fechaPago">Fecha de Pago *</Label>
              <Input
                id="fechaPago"
                type="date"
                value={fechaPago}
                onChange={(e) => setFechaPago(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
                required
                className="mt-1.5 font-data"
              />
            </div>

            <div>
              <Label className="text-[12px]" htmlFor="referencia">Referencia/Comprobante</Label>
              <Input
                id="referencia"
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                placeholder="Ej: Nro. de transaccion"
                className="mt-1.5 font-data"
              />
            </div>

            <div>
              <Label className="text-[12px]" htmlFor="notas">Notas</Label>
              <Textarea
                id="notas"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Notas adicionales"
                className="mt-1.5 text-[13px]"
              />
            </div>

            {cambio > 0 && (
              <div className="surface-card p-3 flex items-center gap-2">
                <Info size={14} weight="duotone" className="text-primary flex-shrink-0" />
                <p className="text-[13px] font-medium">
                  Cambio: <span className="font-data">{formatCurrency(cambio)}</span>
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" size="sm">
              Guardar Pago
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
