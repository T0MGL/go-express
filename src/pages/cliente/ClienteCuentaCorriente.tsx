import { useMemo, useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Receipt, CaretLeft, CaretRight, ArrowDown, ArrowUp, Info } from '@phosphor-icons/react';
import { cn, formatCurrency, formatTimestampSmart } from '@/lib/utils';
import {
  useSaldoCliente,
  useMovimientosCliente,
  type TipoMovimientoCc,
  type MovimientosFilters,
} from '@/hooks/api/use-cuenta-corriente';

const PAGE_SIZE = 20;

const tipoLabels: Record<TipoMovimientoCc, string> = {
  debito: 'Débito',
  credito: 'Crédito',
  ajuste: 'Ajuste',
  nota_credito: 'Nota de crédito',
  reverso: 'Reverso',
};

const tipoFilters: Array<{ value: TipoMovimientoCc | 'todos'; label: string }> = [
  { value: 'todos', label: 'Todos' },
  { value: 'debito', label: 'Débitos' },
  { value: 'credito', label: 'Créditos' },
  { value: 'ajuste', label: 'Ajustes' },
  { value: 'nota_credito', label: 'Notas de crédito' },
];

const ClienteCuentaCorriente = () => {
  const [page, setPage] = useState(1);
  const [tipoFilter, setTipoFilter] = useState<TipoMovimientoCc | 'todos'>('todos');

  useEffect(() => {
    setPage(1);
  }, [tipoFilter]);

  const filters: MovimientosFilters = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      ...(tipoFilter !== 'todos' ? { tipo: tipoFilter } : {}),
    }),
    [page, tipoFilter]
  );

  const { data: saldo, isLoading: loadingSaldo } = useSaldoCliente();
  const { data: movs, isLoading: loadingMovs } = useMovimientosCliente(filters);

  const totalCount = movs?.pagination?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const movimientos = movs?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Cuenta corriente</h1>
          <p className="page-header-subtitle">
            Resumen de saldo y movimientos facturados a tu cuenta
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <SaldoCard
          label="Saldo actual"
          value={loadingSaldo ? null : saldo?.saldo ?? 0}
          tone={(saldo?.saldo ?? 0) > 0 ? 'debt' : (saldo?.saldo ?? 0) < 0 ? 'credit' : 'neutral'}
          hint={(saldo?.saldo ?? 0) > 0 ? 'Saldo a pagar' : (saldo?.saldo ?? 0) < 0 ? 'A favor' : 'Sin movimientos pendientes'}
        />
        <SaldoCard
          label="Límite de crédito"
          value={loadingSaldo ? null : saldo?.limiteCredito ?? 0}
          tone="neutral"
          hint={(saldo?.limiteCredito ?? 0) === 0 ? 'Sin límite configurado' : 'Tope autorizado'}
        />
        <SaldoCard
          label="Disponible"
          value={loadingSaldo ? null : (saldo?.disponible ?? null)}
          tone={(saldo?.disponible ?? 0) > 0 ? 'credit' : 'debt'}
          hint={
            saldo?.disponible == null
              ? 'No aplica'
              : saldo.disponible > 0
                ? 'Para nuevos envíos'
                : 'Sin cupo, regularizá tu saldo'
          }
        />
      </div>

      <div className="surface-card p-4 space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {tipoFilters.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTipoFilter(t.value)}
              className={cn(
                'px-3 py-1.5 text-[12px] font-medium rounded-full transition-colors',
                tipoFilter === t.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loadingMovs ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-12 bg-muted/20 rounded animate-pulse" />
            ))}
          </div>
        ) : movimientos.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Receipt size={32} weight="duotone" className="mx-auto mb-2 opacity-40" />
            <p className="text-[13px]">No hay movimientos registrados</p>
          </div>
        ) : (
          <table className="premium-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Descripción</th>
                <th className="text-right">Monto</th>
                <th className="text-right">Saldo posterior</th>
              </tr>
            </thead>
            <tbody>
              {movimientos.map((m) => (
                <tr key={m.id}>
                  <td className="font-data text-[12px] text-muted-foreground">
                    {formatTimestampSmart(m.creadoEn)}
                  </td>
                  <td>
                    <Badge
                      variant={
                        m.tipo === 'credito' || m.tipo === 'nota_credito'
                          ? 'success'
                          : m.tipo === 'reverso'
                            ? 'warning'
                            : 'secondary'
                      }
                    >
                      {tipoLabels[m.tipo]}
                    </Badge>
                  </td>
                  <td className="text-[13px]">{m.descripcion}</td>
                  <td
                    className={cn(
                      'text-right font-data tabular-nums',
                      m.monto < 0 ? 'text-emerald-600' : 'text-foreground'
                    )}
                  >
                    <span className="inline-flex items-center gap-1">
                      {m.monto < 0 ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
                      {formatCurrency(Math.abs(m.monto))}
                    </span>
                  </td>
                  <td className="text-right font-data tabular-nums">
                    {formatCurrency(m.saldoPosterior)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-[12px] text-muted-foreground">
            <span>
              Página {page} de {totalPages} · {totalCount} movimientos
            </span>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <CaretLeft size={14} />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                <CaretRight size={14} />
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="text-[11px] text-muted-foreground flex items-start gap-1.5">
        <Info size={12} className="mt-0.5 flex-shrink-0" />
        <span>
          Los movimientos se generan automáticamente al crear envíos a cuenta corriente y al
          registrar pagos. Para consultas comunicate con tu ejecutivo de cuenta.
        </span>
      </div>
    </div>
  );
};

interface SaldoCardProps {
  label: string;
  value: number | null;
  tone: 'debt' | 'credit' | 'neutral';
  hint: string;
}

const SaldoCard = ({ label, value, tone, hint }: SaldoCardProps) => {
  const colorClass =
    tone === 'debt'
      ? 'text-foreground'
      : tone === 'credit'
        ? 'text-emerald-600'
        : 'text-muted-foreground';

  return (
    <div className="stat-card">
      <div className="stat-card-label">{label}</div>
      <div className={cn('stat-card-value font-data tabular-nums', colorClass)}>
        {value === null ? <span className="opacity-30">···</span> : formatCurrency(value)}
      </div>
      <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>
    </div>
  );
};

export default ClienteCuentaCorriente;
