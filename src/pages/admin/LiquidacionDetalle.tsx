import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  ClipboardText,
  CheckCircle,
  Warning,
  Clock,
  Package,
} from '@phosphor-icons/react';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import {
  useLiquidacion,
  useCerrarLiquidacion,
  type EstadoLiquidacion,
} from '@/hooks/api/use-liquidaciones';
import { CerrarLiquidacionModal } from '@/components/admin/LiquidacionWizard';
import { toast } from 'sonner';

function estadoBadge(estado: EstadoLiquidacion) {
  if (estado === 'cerrada') {
    return (
      <Badge variant="outline" className="bg-emerald-500/8 text-emerald-700 border-emerald-500/20 text-[12px]">
        <CheckCircle size={12} weight="duotone" className="mr-1" /> Cerrada
      </Badge>
    );
  }
  if (estado === 'con_diferencia') {
    return (
      <Badge variant="outline" className="bg-destructive/8 text-destructive border-destructive/20 text-[12px]">
        <Warning size={12} weight="duotone" className="mr-1" /> Con diferencia
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-amber-500/8 text-amber-700 border-amber-500/20 text-[12px]">
      <Clock size={12} weight="duotone" className="mr-1" /> Pendiente
    </Badge>
  );
}

export default function LiquidacionDetalle() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useLiquidacion(id);
  const cerrar = useCerrarLiquidacion();
  const [cerrarOpen, setCerrarOpen] = useState(false);

  if (isLoading) {
    return <div className="p-8 text-muted-foreground text-[13px]">Cargando...</div>;
  }

  if (error || !data) {
    return (
      <div className="p-8 text-center text-destructive text-[13px]">
        Error cargando la liquidacion
      </div>
    );
  }

  const esPendiente = data.estado === 'pendiente';
  const conDiferencia = data.estado === 'con_diferencia';

  async function handleCerrar(payload: { montoRecibido: number; notas?: string | undefined }) {
    if (!id) return;
    try {
      await cerrar.mutateAsync({ id, ...payload });
      toast.success('Liquidacion cerrada');
      setCerrarOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error cerrando la liquidacion';
      toast.error(msg);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/admin/liquidaciones"
          className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={12} /> Volver a liquidaciones
        </Link>
      </div>

      <div className="page-header">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <ClipboardText size={22} weight="duotone" className="text-primary" />
            <h1 className="page-header-title font-mono">{data.id.slice(0, 8)}</h1>
            {estadoBadge(data.estado)}
          </div>
          <p className="page-header-subtitle">
            {data.repartidorNombre ?? '-'} · {formatDate(data.fechaDesde)}
            {data.fechaDesde !== data.fechaHasta && ` → ${formatDate(data.fechaHasta)}`}
          </p>
        </div>
        {esPendiente && (
          <Button onClick={() => setCerrarOpen(true)} className="gap-1.5">
            <CheckCircle size={14} weight="bold" /> Cerrar liquidacion
          </Button>
        )}
      </div>

      {conDiferencia && data.notas && (
        <div className="surface-card p-4 border-l-4 border-l-destructive">
          <div className="flex items-start gap-3">
            <Warning size={18} weight="duotone" className="text-destructive mt-0.5 shrink-0" />
            <div className="text-[13px]">
              <p className="font-medium">Liquidacion con diferencia</p>
              <p className="text-muted-foreground mt-0.5">{data.notas}</p>
              <p className="text-[11px] text-muted-foreground mt-2">
                Cerrada {data.cerradaEn && formatDate(data.cerradaEn)} - diferencia{' '}
                <span className="font-data font-semibold">
                  {data.diferencia > 0 ? '+' : ''}
                  {formatCurrency(data.diferencia)}
                </span>
              </p>
              {data.ajustes.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {data.ajustes.map((a) => (
                    <li key={a.id} className="text-[12px]">
                      <span className="font-medium">
                        {a.tipo === 'cobranza_repartidor'
                          ? 'Cobranza al repartidor'
                          : 'Sobrante a investigar'}
                        :
                      </span>{' '}
                      <span className="font-data font-semibold">{formatCurrency(a.monto)}</span>
                      <span className="text-muted-foreground"> · {a.motivo}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="stat-card">
          <p className="stat-card-label">Envios</p>
          <p className="stat-card-value tabular-nums">{data.envios.length}</p>
        </div>
        <div className="stat-card">
          <p className="stat-card-label">Esperado</p>
          <p className="stat-card-value tabular-nums font-data">
            {formatCurrency(data.montoTotalEsperado)}
          </p>
        </div>
        <div className="stat-card">
          <p className="stat-card-label">Recibido</p>
          <p className="stat-card-value tabular-nums font-data">
            {data.montoTotalRecibido != null ? formatCurrency(data.montoTotalRecibido) : '-'}
          </p>
        </div>
        <div className="stat-card">
          <p className="stat-card-label">Diferencia</p>
          <p
            className={cn(
              'stat-card-value tabular-nums font-data',
              data.diferencia !== 0 && data.montoTotalRecibido != null && 'text-destructive',
            )}
          >
            {data.montoTotalRecibido != null
              ? (data.diferencia > 0 ? '+' : '') + formatCurrency(data.diferencia)
              : '-'}
          </p>
        </div>
      </div>

      <div className="surface-card overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h2 className="text-[13px] font-semibold">Envios incluidos</h2>
          <span className="text-[11px] text-muted-foreground">{data.envios.length} total</span>
        </div>
        {data.envios.length === 0 ? (
          <div className="p-10 text-center">
            <Package size={28} weight="duotone" className="text-muted-foreground/60 mx-auto mb-2" />
            <p className="text-[13px] text-muted-foreground">Sin envios en el rango.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="premium-table w-full text-[13px]">
              <thead>
                <tr>
                  <th className="text-left">Tracking</th>
                  <th className="text-left">Cliente</th>
                  <th className="text-left">Destinatario</th>
                  <th className="text-left">Entregado</th>
                  <th className="text-right">Esperado</th>
                  <th className="text-right">Cobrado</th>
                  <th className="text-right">Diferencia</th>
                  <th>Conciliado</th>
                </tr>
              </thead>
              <tbody>
                {data.envios.map((e) => {
                  const diff = e.montoCobrado - e.montoEsperado;
                  return (
                    <tr key={e.envioId}>
                      <td className="font-mono text-[12px]">
                        <Link to={`/admin/envios/${e.envioId}`} className="hover:underline">
                          {e.trackingNumber ?? e.envioId.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="text-[12px]">{e.clienteNombre ?? '-'}</td>
                      <td className="text-[12px]">{e.destinatarioNombre ?? '-'}</td>
                      <td className="text-[11px] text-muted-foreground">
                        {e.fechaEntregaReal ? formatDate(e.fechaEntregaReal) : '-'}
                      </td>
                      <td className="text-right font-data">{formatCurrency(e.montoEsperado)}</td>
                      <td className="text-right font-data">{formatCurrency(e.montoCobrado)}</td>
                      <td className={cn('text-right font-data', diff !== 0 && 'text-amber-600')}>
                        {diff > 0 ? '+' : ''}
                        {formatCurrency(diff)}
                      </td>
                      <td className="text-center">
                        {e.conciliado ? (
                          <Badge variant="outline" className="text-[10px] bg-emerald-500/8 text-emerald-700 border-emerald-500/20">
                            si
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">pend</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CerrarLiquidacionModal
        isOpen={cerrarOpen}
        onClose={() => setCerrarOpen(false)}
        liquidacionId={data.id}
        montoEsperado={data.montoTotalEsperado}
        onCerrar={handleCerrar}
        isPending={cerrar.isPending}
      />
    </div>
  );
}
