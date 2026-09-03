import { toast } from 'sonner';
import { type Envio } from '@/data/types';

// Punto de entrada unico al generador de etiquetas. jspdf + jsbarcode + canvg pesan
// ~600 KB y solo hacen falta cuando alguien aprieta imprimir, asi que se cargan
// recien ahi. generateShippingLabel.ts no se importa directo desde ninguna pagina.
const loadGenerator = () => import('./generateShippingLabel');

// En 4G paraguaya la primera descarga del generador tarda segundos. Un toast
// inmediato parpadearia cuando el chunk ya esta en cache, por eso el retraso.
const SLOW_LOAD_MS = 250;

type Generator = Awaited<ReturnType<typeof loadGenerator>>;

async function loadWithFeedback(): Promise<Generator | null> {
  let toastId: string | number | undefined;
  const timer = setTimeout(() => {
    toastId = toast.loading('Preparando impresion');
  }, SLOW_LOAD_MS);

  try {
    return await loadGenerator();
  } catch {
    // Mismo contrato que el generador sincronico: el fallo lo reporta el llamador.
    return null;
  } finally {
    clearTimeout(timer);
    if (toastId !== undefined) toast.dismiss(toastId);
  }
}

export async function printShippingLabel(envio: Envio): Promise<boolean> {
  const generator = await loadWithFeedback();
  return generator?.printShippingLabel(envio) ?? false;
}

export async function printBatchLabels(envios: Envio[]): Promise<boolean> {
  const generator = await loadWithFeedback();
  return generator?.printBatchLabels(envios) ?? false;
}
