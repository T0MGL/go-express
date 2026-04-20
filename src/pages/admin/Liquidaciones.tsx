import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ClipboardText, Plus, CaretLeft, CaretRight, Eye, CheckCircle, Warning, Clock } from '@phosphor-icons/react';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { useLiquidaciones, type EstadoLiquidacion } from '@/hooks/api/use-liquidaciones';
import { useRepartidores } from '@/hooks/api/use-repartidores';
import { LiquidacionWizard } from '@/components/admin/LiquidacionWizard';

const PAGE_SIZE = 20;

function estadoBadge(estado: EstadoLiquidacion) {
  if (estado === 'cerrada') {
    return (
      <Badge variant="outline" className="bg-emerald-500/8 text-emerald-700 border-emerald-500/20 text-[11px]">
        <CheckCircle size={11} weight="duotone" className="mr-1" /> Cerrada
      </Badge>
    );
  }
  if (estado === 'con_diferencia') {
    return (
      <Badge variant="outline" className="bg-destructive/8 text-destructive border-destructive/20 text-[11px]">
        <Warning size={11} weight="duotone" className="mr-1" /> Con diferencia
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-amber-500/8 text-amber-700 border-amber-500/20 text-[11px]">
      <Clock size={11} weight="duotone" className="mr-1" /> Pendiente
    </Badge>
  );
}

export default function Liquidaciones() {
  const [filtroRepartidor, setFiltroRepartidor] = useState<string>('todos');
  const [filtroEstado, setFiltroEstado] = useState<string>('todos');
  const [fechaDesde, setFechaDesde] = useState<string>('');
  const [fechaHasta, setFechaHasta] = useState<string>('');
  const [page, setPage] = useState(1);
  const [wizardOpen, setWizardOpen] = useState(false);

  const { data: repartidoresData } = useRepartidores({ limit: 100 });
  const repartidores = repartidoresData?.data ?? [];

  const apiFilters = useMemo(() => {
    const f: Record<string, string | number | undefined> = {
      page,
      limit: PAGE_SIZE,
    };
    if (filtroRepartidor !== 'todos') f.repartidorId = filtroRepartidor;
    if (filtroEstado !== 'todos') f.estado = filtroEstado;
    if (fechaDesde) f.fechaDesde = fechaDesde;
    if (fechaHasta) f.fechaHasta = fechaHasta;
    return f;
  }, [page, filtroRepartidor, filtroEstado, fechaDesde, fechaHasta]);

  const { data, isLoading, error } = useLiquidaciones(apiFilters);

  const liquidaciones = data?.data ?? [];
  const total = data?.pagination.total ?? 0;
  const totalPages = data?.pagination.totalPages ?? 1;

  function resetPage() {
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Liquidaciones</h1>
          <p className="page-header-subtitle">Cierre de caja por repartidor. Conciliacion financiera oficial.</p>
        </div>
        <Button onClick={() => setWizardOpen(true)} className="gap-1.5">
          <Plus size={14} weight="bold" /> Nueva liquidacion
        </Button>
      </div>

      <div className="surface-card p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <Label className="text-[12px]">Repartidor</Label>
            <Select
              value={filtroRepartidor}
              onValueChange={(v) => {
                setFiltroRepartidor(v);
                resetPage();
              }}
            >
              <SelectTrigger className="mt-1.5 h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {repartidores.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[12px]">Estado</Label>
            <Select
              value={filtroEstado}
              onValueChange={(v) => {
                setFiltroEstado(v);
                resetPage();
              }}
            >
              <SelectTrigger className="mt-1.5 h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="pendiente">Pendiente</SelectItem>
                <SelectItem value="cerrada">Cerrada</SelectItem>
                <SelectItem value="con_diferencia">Con diferencia</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[12px]">Fecha desde</Label>
            <Input
              type="date"
              value={fechaDesde}
              onChange={(e) => {
                setFechaDesde(e.target.value);
                resetPage();
              }}
              className="mt-1.5 h-10"
            />
          </div>
          <div>
            <Label className="text-[12px]">Fecha hasta</Label>
            <Input
              type="date"
              value={fechaHasta}
              onChange={(e) => {
                setFechaHasta(e.target.value);
                resetPage();
              }}
              className="mt-1.5 h-10"
            />
          </div>
        </div>
      </div>

      <div className="surface-card overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-12 bg-muted/40 rounded animate-pulse" />)}
          </div>
        ) : error ? (
          <div className="p-10 text-center text-destructive text-[13px]">Error cargando liquidaciones</div>
        ) : liquidaciones.length === 0 ? (
          <div className="p-12 text-center">
            <ClipboardText size={32} weight="duotone" className="text-muted-foreground/60 mx-auto mb-3" />
            <p className="text-[13px] text-muted-foreground">Sin liquidaciones para estos filtros.</p>
            <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={() => setWizardOpen(true)}>
              <Plus size={14} weight="bold" /> Crear la primera
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="premium-table w-full text-[13px]">
              <thead>
                <tr>
                  <th className="text-left">ID</th>
                  <th className="text-left">Repartidor</th>
                  <th className="text-left">Rango</th>
                  <th className="text-right">Esperado</th>
                  <th className="text-right">Recibido</th>
                  <th className="text-right">Diferencia</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {liquidaciones.map((l) => (
                  <tr key={l.id}>
                    <td className="font-mono text-[11px]">{l.id.slice(0, 8)}</td>
                    <td>{l.repartidorNombre ?? '-'}</td>
                    <td className="text-[12px] text-muted-foreground">
                      {formatDate(l.fechaDesde)}
                      {l.fechaDesde !== l.fechaHasta && ` → ${formatDate(l.fechaHasta)}`}
                    </td>
                    <td className="text-right font-data">{formatCurrency(l.montoTotalEsperado)}</td>
                    <td className="text-right font-data">
                      {l.montoTotalRecibido != null ? formatCurrency(l.montoTotalRecibido) : '-'}
                    </td>
                    <td className={cn('text-right font-data', l.diferencia !== 0 && 'text-destructive font-semibold')}>
                      {l.montoTotalRecibido != null
                        ? (l.diferencia > 0 ? '+' : '') + formatCurrency(l.diferencia)
                        : '-'}
                    </td>
                    <td className="text-center">{estadoBadge(l.estado)}</td>
                    <td className="text-right">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" asChild>
                        <Link to={`/admin/liquidaciones/${l.id}`} aria-label={`Ver liquidacion ${l.id.slice(0, 8)}`}>
                          <Eye size={14} weight="duotone" />
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-[13px]">
          <p className="text-muted-foreground">
            {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, total)} de {total}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <CaretLeft size={14} />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              <CaretRight size={14} />
            </Button>
          </div>
        </div>
      )}

      <LiquidacionWizard isOpen={wizardOpen} onClose={() => setWizardOpen(false)} />
    </div>
  );
}
