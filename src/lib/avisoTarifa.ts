import { toast } from 'sonner';

// Cuando no hay tarifa para la ruta, el envio se crea igual pero con flete 0, y el
// invariante de la base no lo frena porque con costo 0 cualquier monto a cobrar lo cubre.
// El paquete sale, se entrega, se cobra el COD de la mercaderia y el flete recien aparece
// en la liquidacion. Por eso el aviso dura mas que un exito y dice que hacer.
export function avisarSinTarifa(trackingNumber: string, origen: string, destino: string): void {
  toast.warning(`Envío ${trackingNumber} creado sin tarifa`, {
    description: `No hay tarifa para ${origen} a ${destino}, el flete quedó en 0. Tasalo antes de despacharlo.`,
    duration: 12000,
  });
}
