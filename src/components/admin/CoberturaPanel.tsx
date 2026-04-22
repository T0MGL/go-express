import { useState } from 'react';
import { MapTrifold, CaretDown, CaretUp } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { useCobertura } from '@/hooks/api/use-ciudades';
import type { CoberturaDepartamento } from '@/hooks/api/use-ciudades';

interface CoberturaPanelProps {
  onCiudadSinCobertura?: (ciudadId: string, ciudadNombre: string) => void;
}

function ratioTone(habilitadas: number, total: number): {
  bar: string;
  label: string;
} {
  if (total === 0) return { bar: 'bg-muted', label: 'text-muted-foreground' };
  const r = habilitadas / total;
  if (r === 0) return { bar: 'bg-muted', label: 'text-muted-foreground' };
  if (r < 0.25) return { bar: 'bg-warning', label: 'text-warning' };
  if (r < 0.6) return { bar: 'bg-primary', label: 'text-primary' };
  return { bar: 'bg-success', label: 'text-success' };
}

function DepartamentoCard({
  depto,
  onCiudadSinCobertura,
}: {
  depto: CoberturaDepartamento;
  onCiudadSinCobertura?: (ciudadId: string, ciudadNombre: string) => void;
}) {
  const [expanded, setExpanded] = useState(depto.ciudadesHabilitadas === 0);
  const tone = ratioTone(depto.ciudadesHabilitadas, depto.totalCiudades);
  const pct = depto.totalCiudades === 0 ? 0 : (depto.ciudadesHabilitadas / depto.totalCiudades) * 100;

  return (
    <div className="surface-card p-3 flex flex-col gap-2.5">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-start justify-between gap-2 text-left group"
      >
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold truncate">{depto.nombre}</div>
          <div className={cn('text-[11px] font-data', tone.label)}>
            {depto.ciudadesHabilitadas}/{depto.totalCiudades} ciudades
          </div>
        </div>
        {expanded ? (
          <CaretUp size={12} weight="bold" className="text-muted-foreground flex-shrink-0 mt-1" />
        ) : (
          <CaretDown size={12} weight="bold" className="text-muted-foreground flex-shrink-0 mt-1" />
        )}
      </button>

      <div className="h-1 w-full rounded-full bg-muted/40 overflow-hidden">
        <div
          className={cn('h-full transition-all', tone.bar)}
          style={{ width: `${pct}%` }}
          aria-hidden
        />
      </div>

      {expanded && (
        <div className="flex flex-wrap gap-1">
          {depto.ciudades.map((c) => {
            const clickable = !c.habilitada && onCiudadSinCobertura;
            return (
              <button
                key={c.id}
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onCiudadSinCobertura!(c.id, c.nombre)}
                className={cn(
                  'text-[11px] px-2 py-0.5 rounded-full border transition-colors',
                  c.habilitada
                    ? 'bg-success/8 border-success/20 text-success cursor-default'
                    : clickable
                    ? 'bg-muted/30 border-muted/40 text-muted-foreground hover:bg-primary/10 hover:border-primary/30 hover:text-primary cursor-pointer'
                    : 'bg-muted/30 border-muted/40 text-muted-foreground cursor-default',
                )}
                title={
                  c.habilitada
                    ? 'Con tarifa activa'
                    : clickable
                    ? 'Click para crear tarifa y habilitar'
                    : 'Sin cobertura'
                }
              >
                {c.nombre}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function CoberturaPanel({ onCiudadSinCobertura }: CoberturaPanelProps) {
  const { data, isLoading } = useCobertura();

  if (isLoading || !data) {
    return (
      <div className="surface-card p-5 space-y-3">
        <div className="h-5 w-40 bg-muted/40 rounded animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          {Array.from({ length: 18 }).map((_, i) => (
            <div key={i} className="h-20 bg-muted/20 rounded-md animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const globalTone = ratioTone(data.ciudadesHabilitadas, data.totalCiudades);

  return (
    <div className="surface-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-[14px] font-semibold flex items-center gap-2">
            <MapTrifold size={16} weight="duotone" className="text-primary" />
            Cobertura operativa
          </h3>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Una ciudad esta habilitada si tiene al menos una tarifa activa. Click en un chip gris para crear la primera tarifa.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className={cn('text-[20px] font-semibold font-data', globalTone.label)}>
              {data.ciudadesHabilitadas}
              <span className="text-muted-foreground text-[14px] font-normal">
                /{data.totalCiudades}
              </span>
            </div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              ciudades
            </div>
          </div>
          <div className="text-right">
            <div className="text-[20px] font-semibold font-data text-foreground">
              {data.departamentosConCobertura}
              <span className="text-muted-foreground text-[14px] font-normal">
                /{data.totalDepartamentos}
              </span>
            </div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              departamentos
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
        {data.departamentos.map((d) => (
          <DepartamentoCard
            key={d.id}
            depto={d}
            {...(onCiudadSinCobertura ? { onCiudadSinCobertura } : {})}
          />
        ))}
      </div>
    </div>
  );
}
