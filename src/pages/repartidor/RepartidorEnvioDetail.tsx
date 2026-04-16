import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useRepartidorEnvio, useMarcarRecolectado } from '@/hooks/api/use-repartidor-envios';
import { useRepartidorPodDownloadUrl } from '@/hooks/api/use-repartidor-envios';
import { Button } from '@/components/ui/button';
import { EntregaSheet } from '@/components/repartidor/EntregaSheet';
import { IncidenciaSheet } from '@/components/repartidor/IncidenciaSheet';
import { whatsappDeepLink, defaultDeliveryMessage, telLink } from '@/lib/whatsapp';
import {
  ArrowLeft,
  WhatsappLogo,
  Phone,
  CheckCircle,
  Warning,
  Money,
  MapPin,
  User,
  Package,
  ChatCircle,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

function formatGs(n: number | null | undefined): string {
  if (n == null) return '-';
  return `Gs. ${n.toLocaleString('es-PY')}`;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('es-PY', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function RepartidorEnvioDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: envio, isLoading, error } = useRepartidorEnvio(id);
  const recolectarMut = useMarcarRecolectado();
  const [entregaOpen, setEntregaOpen] = useState(false);
  const [incidenciaOpen, setIncidenciaOpen] = useState(false);
  const [waSheetOpen, setWaSheetOpen] = useState(false);

  const podQuery = useRepartidorPodDownloadUrl(envio?.foto_entrega_url);

  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-6 w-32 bg-muted/40 rounded" />
        <div className="h-24 bg-muted/40 rounded-xl" />
        <div className="h-32 bg-muted/40 rounded-xl" />
      </div>
    );
  }

  if (error || !envio) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground text-[13px]">No pudimos cargar este envío.</p>
        <Button variant="outline" size="sm" onClick={() => navigate(-1)} className="mt-4">
          Volver
        </Button>
      </div>
    );
  }

  const isCod = envio.tipo_pago === 'contra_entrega' && envio.monto_a_cobrar > 0;
  const isEntregado = envio.estado === 'entregado';
  const isPendiente = ['pendiente', 'recolectado', 'en_transito', 'en_reparto'].includes(envio.estado);
  const hasPhone = envio.destinatario_telefono && envio.destinatario_telefono.trim().length >= 5;

  async function handleRecolectar() {
    if (!envio) return;
    try {
      await recolectarMut.mutateAsync(envio.id);
      toast.success('Paquete marcado como recolectado');
    } catch {
      toast.error('No se pudo marcar. Intentá de nuevo.');
    }
  }

  const waMessage = defaultDeliveryMessage(envio.tracking_number, envio.destinatario_nombre);

  return (
    <div className="space-y-4">
      <Link
        to="/repartidor"
        className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={16} weight="bold" /> Volver a la lista
      </Link>

      {/* Header card */}
      <div className="rounded-xl border bg-card p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-mono text-[15px] font-semibold">{envio.tracking_number}</div>
            <div className="text-[12px] text-muted-foreground mt-1">
              {envio.cliente_nombre} · {envio.origen} → {envio.destino}
            </div>
          </div>
          {isCod && (
            <div className="inline-flex items-center gap-1 bg-primary/10 text-primary rounded-full px-2.5 py-1 text-[11px] font-bold flex-shrink-0">
              <Money size={12} weight="bold" /> COD {formatGs(envio.monto_a_cobrar)}
            </div>
          )}
        </div>

        {envio.tiene_incidencia && envio.incidencia_nota && !isEntregado && (
          <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 flex items-start gap-2">
            <Warning size={16} weight="fill" className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-[12px] font-semibold text-amber-800">Incidencia reportada</div>
              <div className="text-[12px] text-amber-700 mt-0.5">{envio.incidencia_nota}</div>
              <div className="text-[11px] text-amber-600 mt-1">{formatDateTime(envio.incidencia_reportada_en)}</div>
            </div>
          </div>
        )}

        {isEntregado && (
          <div className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 flex items-start gap-2">
            <CheckCircle size={16} weight="fill" className="text-emerald-600 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-[12px] font-semibold text-emerald-800">
                Entregado a {envio.entregado_por_nombre ?? '—'}
              </div>
              <div className="text-[11px] text-emerald-700 mt-0.5">
                {formatDateTime(envio.fecha_entrega_real)}
                {envio.entregado_por_documento && ` · Doc ${envio.entregado_por_documento}`}
              </div>
              {isCod && envio.monto_cobrado != null && (
                <div className="text-[11px] text-emerald-700 mt-0.5">
                  Cobrado: {formatGs(envio.monto_cobrado)}
                </div>
              )}
              {podQuery.data?.signedUrl && (
                <a
                  href={podQuery.data.signedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-2"
                >
                  <img
                    src={podQuery.data.signedUrl}
                    alt="POD"
                    className="w-24 h-24 object-cover rounded-md border"
                  />
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Destinatario card */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-start gap-2">
          <User size={18} weight="duotone" className="text-muted-foreground flex-shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold">{envio.destinatario_nombre}</div>
            {hasPhone && (
              <div className="text-[12px] text-muted-foreground mt-0.5">
                {envio.destinatario_telefono}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-start gap-2">
          <MapPin size={18} weight="duotone" className="text-muted-foreground flex-shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="text-[13px]">{envio.destinatario_direccion}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {envio.destinatario_ciudad}
            </div>
            {envio.destinatario_referencia && (
              <div className="text-[11px] text-muted-foreground mt-0.5 italic">
                Ref: {envio.destinatario_referencia}
              </div>
            )}
          </div>
        </div>

        {(envio.producto || envio.peso || envio.instrucciones_entrega) && (
          <div className="flex items-start gap-2">
            <Package size={18} weight="duotone" className="text-muted-foreground flex-shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1 text-[12px]">
              {envio.peso && <span>{envio.peso} kg</span>}
              {envio.peso && envio.dimensiones_largo && <span> · </span>}
              {envio.dimensiones_largo && (
                <span>
                  {envio.dimensiones_largo}×{envio.dimensiones_ancho}×{envio.dimensiones_alto} cm
                </span>
              )}
              {envio.producto && <div className="text-muted-foreground mt-1">{envio.producto}</div>}
              {envio.instrucciones_entrega && (
                <div className="mt-1 rounded bg-muted/60 px-2 py-1 text-[11px]">
                  {envio.instrucciones_entrega}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Communication buttons */}
        {hasPhone && isPendiente && (
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className={cn(
                'h-12 gap-2 border-emerald-300 text-emerald-700',
                'hover:bg-emerald-50',
              )}
              onClick={() => setWaSheetOpen(true)}
            >
              <WhatsappLogo size={18} weight="fill" />
              WhatsApp
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-12 gap-2 border-primary/40 text-primary hover:bg-primary/5"
              asChild
            >
              <a href={telLink(envio.destinatario_telefono)}>
                <Phone size={18} weight="fill" />
                Llamar
              </a>
            </Button>
          </div>
        )}
      </div>

      {/* Action buttons for pendientes */}
      {isPendiente && (
        <div className="space-y-2">
          {envio.estado === 'pendiente' && (
            <Button
              type="button"
              variant="outline"
              className="w-full h-12 text-[14px]"
              onClick={handleRecolectar}
              disabled={recolectarMut.isPending}
            >
              {recolectarMut.isPending ? 'Marcando...' : 'Marcar como recolectado'}
            </Button>
          )}

          <Button
            type="button"
            className="w-full h-14 text-[15px] gap-2"
            onClick={() => setEntregaOpen(true)}
          >
            <CheckCircle size={20} weight="fill" />
            Marcar como entregado
          </Button>

          <Button
            type="button"
            variant="outline"
            className="w-full h-12 gap-2 border-amber-300 text-amber-700 hover:bg-amber-50"
            onClick={() => setIncidenciaOpen(true)}
          >
            <Warning size={18} weight="fill" />
            Reportar incidencia
          </Button>
        </div>
      )}

      <EntregaSheet
        open={entregaOpen}
        onOpenChange={setEntregaOpen}
        envio={envio}
        onDone={() => { setEntregaOpen(false); navigate('/repartidor'); }}
      />
      <IncidenciaSheet
        open={incidenciaOpen}
        onOpenChange={setIncidenciaOpen}
        envio={envio}
        onDone={() => { setIncidenciaOpen(false); }}
      />

      <WhatsAppPreviewSheet
        open={waSheetOpen}
        onOpenChange={setWaSheetOpen}
        initialMessage={waMessage}
        phone={envio.destinatario_telefono}
      />
    </div>
  );
}

function WhatsAppPreviewSheet({
  open,
  onOpenChange,
  initialMessage,
  phone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMessage: string;
  phone: string;
}) {
  const [message, setMessage] = useState(initialMessage);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={() => onOpenChange(false)}>
      <div className="bg-background rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 text-emerald-600">
          <ChatCircle size={20} weight="duotone" />
          <h3 className="font-semibold text-[15px]">Avisar por WhatsApp</h3>
        </div>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-[14px] min-h-[100px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1 h-11" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            className="flex-1 h-11 bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
            asChild
          >
            <a
              href={whatsappDeepLink(phone, message)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setTimeout(() => onOpenChange(false), 100)}
            >
              <WhatsappLogo size={18} weight="fill" />
              Abrir WhatsApp
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
