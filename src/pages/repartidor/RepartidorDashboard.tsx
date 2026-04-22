import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMisEnvios, type Rango, type Filtro, type RepartidorEnvio } from '@/hooks/api/use-repartidor-envios';
import { Package, Warning, CheckCircle, CaretRight, Money, Clock } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

const rangoOptions: { value: Rango; label: string }[] = [
  { value: 'hoy', label: 'Hoy' },
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mes' },
];

const filtroOptions: { value: Filtro; label: string }[] = [
  { value: 'pendientes', label: 'Pendientes' },
  { value: 'entregados', label: 'Entregados' },
  { value: 'incidencias', label: 'Con incidencia' },
];

function formatGs(n: number | null | undefined): string {
  if (!n) return '';
  return `Gs. ${n.toLocaleString('es-PY')}`;
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });
}

function EnvioCard({ envio }: { envio: RepartidorEnvio }) {
  const isCod = envio.tipo_pago === 'contra_entrega' && envio.monto_a_cobrar > 0;
  const hasIncidencia = envio.tiene_incidencia;
  const isEntregado = envio.estado === 'entregado';

  return (
    <Link
      to={`/repartidor/envio/${envio.id}`}
      className={cn(
        'block rounded-xl border bg-card p-4 shadow-sm transition-colors',
        'hover:border-primary/40 hover:bg-muted/30 active:bg-muted/40',
        hasIncidencia && !isEntregado && 'border-amber-300 bg-amber-50/40',
        isEntregado && 'opacity-80',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {isEntregado ? (
            <CheckCircle size={20} weight="fill" className="text-emerald-500 flex-shrink-0" />
          ) : hasIncidencia ? (
            <Warning size={20} weight="fill" className="text-amber-500 flex-shrink-0" />
          ) : (
            <Package size={20} weight="duotone" className="text-primary flex-shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[13px] font-semibold truncate">
                {envio.tracking_number}
              </span>
              {isCod && !isEntregado && (
                <span className="inline-flex items-center gap-0.5 bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[10px] font-bold">
                  <Money size={10} weight="bold" /> {formatGs(envio.monto_a_cobrar)}
                </span>
              )}
            </div>
            <div className="text-[13px] font-medium mt-0.5 truncate">{envio.destinatario_nombre}</div>
            <div className="text-[12px] text-muted-foreground mt-0.5 line-clamp-1">
              {envio.destinatario_direccion}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
              {envio.destinatario_ciudad || envio.destino || 'Sin ciudad'}
              {isEntregado && envio.fecha_entrega_real && (
                <>
                  <span>·</span>
                  <Clock size={10} weight="bold" />
                  {timeAgo(envio.fecha_entrega_real)}
                </>
              )}
            </div>
            {hasIncidencia && envio.incidencia_nota && (
              <div className="text-[11px] text-amber-700 mt-2 bg-amber-100 rounded-md px-2 py-1 line-clamp-2">
                {envio.incidencia_nota}
              </div>
            )}
          </div>
        </div>
        <CaretRight size={16} weight="bold" className="text-muted-foreground flex-shrink-0 mt-0.5" />
      </div>
    </Link>
  );
}

export default function RepartidorDashboard() {
  const [rango, setRango] = useState<Rango>('hoy');
  const [filtro, setFiltro] = useState<Filtro>('pendientes');

  const { data, isLoading, error } = useMisEnvios(rango, filtro);
  const envios = data?.data ?? [];

  return (
    <div className="space-y-4">
      {/* Rango selector */}
      <div className="flex gap-1 bg-muted p-1 rounded-lg">
        {rangoOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setRango(opt.value)}
            className={cn(
              'flex-1 h-10 rounded-md text-[13px] font-semibold transition-colors',
              rango === opt.value
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Filtro selector */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-3 px-3">
        {filtroOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFiltro(opt.value)}
            className={cn(
              'flex-shrink-0 h-8 rounded-full px-3 text-[12px] font-semibold border transition-colors',
              filtro === opt.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground border-border',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 bg-muted/40 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-[13px] text-destructive">
          Error cargando envíos. Volvé a intentar.
        </div>
      ) : envios.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <Package size={32} weight="duotone" className="text-muted-foreground/60 mx-auto mb-3" />
          <p className="text-[13px] text-muted-foreground">
            {filtro === 'pendientes' ? 'No tenés envíos pendientes en este rango.' :
              filtro === 'entregados' ? 'Todavía no hay entregas en este rango.' :
              'No hay envíos con incidencia en este rango.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {envios.map((envio) => (
            <EnvioCard key={envio.id} envio={envio} />
          ))}
        </div>
      )}
    </div>
  );
}
