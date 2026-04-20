import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { useRepartidores } from '@/hooks/api/use-repartidores';
import { useReporteCOD } from '@/hooks/api/use-conciliacion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Money, MapPin, Warning, Package, Info } from '@phosphor-icons/react';
import { formatCurrency, formatDate, cn } from '@/lib/utils';

type RangoRapido = 'hoy' | 'semana' | 'mes' | 'custom';

function dateYYYYMMDD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function computeRange(r: RangoRapido, customDesde?: string, customHasta?: string): { desde: string; hasta: string } {
  if (r === 'custom' && customDesde && customHasta) return { desde: customDesde, hasta: customHasta };
  const hoy = new Date();
  const hastaStr = dateYYYYMMDD(hoy);
  if (r === 'hoy') return { desde: hastaStr, hasta: hastaStr };
  const desdeDate = new Date(hoy);
  if (r === 'semana') desdeDate.setDate(hoy.getDate() - 7);
  else desdeDate.setDate(hoy.getDate() - 30);
  return { desde: dateYYYYMMDD(desdeDate), hasta: hastaStr };
}

export default function ReporteCOD() {
  const [params, setParams] = useSearchParams();
  const [rango, setRango] = useState<RangoRapido>('hoy');
  const [customDesde, setCustomDesde] = useState(dateYYYYMMDD(new Date()));
  const [customHasta, setCustomHasta] = useState(dateYYYYMMDD(new Date()));

  const { data: repartidoresData } = useRepartidores({ limit: 100 });
  const repartidores = repartidoresData?.data ?? [];
  const initialRep = params.get('repartidor') ?? '';
  const [repartidorId, setRepartidorId] = useState(initialRep);

  useEffect(() => {
    if (!repartidorId && repartidores.length > 0 && repartidores[0]) {
      setRepartidorId(repartidores[0].id);
    }
  }, [repartidores, repartidorId]);

  const { desde, hasta } = useMemo(
    () => computeRange(rango, customDesde, customHasta),
    [rango, customDesde, customHasta],
  );

  const { data: resumen, isLoading, error } = useReporteCOD(repartidorId || undefined, desde, hasta);

  const entregas = resumen?.entregas ?? [];
  const totales = resumen?.totales;

  const porZona = useMemo(() => {
    const map = new Map<string, typeof entregas>();
    for (const e of entregas) {
      const key = e.destinatarioCiudad || 'Sin zona';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [entregas]);

  function updateRepartidor(id: string) {
    setRepartidorId(id);
    const next = new URLSearchParams(params);
    if (id) next.set('repartidor', id);
    else next.delete('repartidor');
    setParams(next, { replace: true });
  }

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Reporte COD</h1>
          <p className="page-header-subtitle">Entregas del repartidor por zona. Vista operativa.</p>
        </div>
      </div>

      <div className="surface-card p-4 border-l-4 border-l-primary">
        <div className="flex items-start gap-3">
          <Info size={18} weight="duotone" className="text-primary mt-0.5 shrink-0" />
          <div className="text-[13px] leading-relaxed">
            <p className="font-medium">Para cierre de caja oficial usar Liquidaciones.</p>
            <p className="text-muted-foreground mt-0.5">
              Esta vista es un reporte operativo por repartidor y zona. La{' '}
              <Link to="/admin/liquidaciones" className="text-primary underline-offset-2 hover:underline font-medium">
                conciliacion financiera formal
              </Link>{' '}
              se hace desde Liquidaciones: crea un rango, cerra con el efectivo fisico y queda asentado con auditoria.
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="surface-card p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <Label className="text-[12px]">Repartidor</Label>
            <Select value={repartidorId} onValueChange={updateRepartidor}>
              <SelectTrigger className="mt-1.5 h-10">
                <SelectValue placeholder="Seleccionar repartidor..." />
              </SelectTrigger>
              <SelectContent>
                {repartidores.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.nombre} · {r.vehiculo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-[12px]">Rango</Label>
            <Select value={rango} onValueChange={(v) => setRango(v as RangoRapido)}>
              <SelectTrigger className="mt-1.5 h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hoy">Hoy</SelectItem>
                <SelectItem value="semana">Esta semana</SelectItem>
                <SelectItem value="mes">Este mes</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {rango === 'custom' && (
            <>
              <div>
                <Label className="text-[12px]">Desde</Label>
                <Input
                  type="date"
                  value={customDesde}
                  onChange={(e) => setCustomDesde(e.target.value)}
                  className="mt-1.5 h-10"
                />
              </div>
              <div>
                <Label className="text-[12px]">Hasta</Label>
                <Input
                  type="date"
                  value={customHasta}
                  onChange={(e) => setCustomHasta(e.target.value)}
                  className="mt-1.5 h-10"
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => <div key={i} className="stat-card h-24 animate-pulse" />)}
        </div>
      ) : error ? (
        <div className="surface-card p-6 text-center text-destructive text-[13px]">
          Error cargando reporte COD
        </div>
      ) : totales ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle size={16} weight="duotone" className="text-emerald-500" />
              <p className="stat-card-label">Entregas</p>
            </div>
            <p className="stat-card-value tabular-nums">{totales.entregas}</p>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-2">
              <MapPin size={16} weight="duotone" className="text-primary" />
              <p className="stat-card-label">Zonas</p>
            </div>
            <p className="stat-card-value tabular-nums">{totales.zonas}</p>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-2">
              <Money size={16} weight="duotone" className="text-primary" />
              <p className="stat-card-label">Total COD</p>
            </div>
            <p className="stat-card-value tabular-nums font-data">{formatCurrency(totales.totalCod)}</p>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-2">
              <Warning size={16} weight="duotone" className={totales.conIncidencia > 0 ? 'text-amber-500' : 'text-muted-foreground'} />
              <p className="stat-card-label">Tasa exito</p>
            </div>
            <p className="stat-card-value tabular-nums">{totales.tasaExito}%</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {totales.conIncidencia} con incidencia
            </p>
          </div>
        </div>
      ) : null}

      {/* Agrupado por zona */}
      <div className="surface-card overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[0, 1, 2].map((i) => <div key={i} className="h-12 bg-muted/40 rounded animate-pulse" />)}
          </div>
        ) : entregas.length === 0 ? (
          <div className="p-10 text-center">
            <Package size={32} weight="duotone" className="text-muted-foreground/60 mx-auto mb-3" />
            <p className="text-[13px] text-muted-foreground">
              Sin entregas para este rango.
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {porZona.map(([zona, lista]) => (
              <ZonaSection key={zona} zona={zona} entregas={lista} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ZonaSection({ zona, entregas }: { zona: string; entregas: Array<{
  id: string;
  trackingNumber: string;
  clienteNombre: string;
  destinatarioNombre: string;
  destinatarioCiudad: string;
  fechaEntregaReal: string | null;
  entregadoPorNombre: string | null;
  montoCobrado: number | null;
  montoACobrar: number | null;
  tipoPago: string;
  tieneIncidencia: boolean;
}> }) {
  const [expanded, setExpanded] = useState(true);
  const totalCod = entregas.reduce((sum, e) => sum + (e.montoCobrado ?? 0), 0);

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-3 flex items-center justify-between bg-muted/30 hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          <MapPin size={14} weight="duotone" className="text-primary" />
          <span className="font-semibold text-[13px]">{zona}</span>
          <Badge variant="outline" className="text-[10px]">{entregas.length} entrega{entregas.length === 1 ? '' : 's'}</Badge>
          {totalCod > 0 && (
            <Badge variant="outline" className="text-[10px] font-data">{formatCurrency(totalCod)}</Badge>
          )}
        </div>
        <span className="text-[11px] text-muted-foreground">{expanded ? 'Ocultar' : 'Mostrar'}</span>
      </button>
      {expanded && (
        <div className="divide-y">
          {entregas.map((e) => (
            <div key={e.id} className="px-4 py-3 flex items-start justify-between gap-3 text-[13px]">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-medium">{e.trackingNumber}</span>
                  {e.tieneIncidencia && <Badge variant="warning" className="text-[10px]">Incidencia</Badge>}
                </div>
                <div className="text-muted-foreground mt-0.5 text-[12px]">
                  {e.clienteNombre} -&gt; {e.destinatarioNombre}
                </div>
                <div className="text-muted-foreground mt-0.5 text-[11px]">
                  {e.fechaEntregaReal && formatDate(e.fechaEntregaReal)}
                  {e.entregadoPorNombre && ` · Recibio ${e.entregadoPorNombre}`}
                </div>
              </div>
              {e.tipoPago === 'contra_entrega' && e.montoCobrado != null && (
                <div className={cn('text-right', e.montoCobrado !== e.montoACobrar && 'text-amber-600')}>
                  <div className="font-mono font-semibold">{formatCurrency(e.montoCobrado)}</div>
                  {e.montoCobrado !== e.montoACobrar && e.montoACobrar != null && (
                    <div className="text-[10px] mt-0.5">
                      pact: {formatCurrency(e.montoACobrar)}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
