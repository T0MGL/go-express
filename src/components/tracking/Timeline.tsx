import { cn, formatTimestamp, formatTimestampTime } from '@/lib/utils';
import { MapPin, Clock } from '@phosphor-icons/react';

// Accepts both full EventoEnvio and limited PublicTrackingEvent
interface TimelineEvent {
  id?: string;
  estado: string;
  descripcion: string;
  ubicacion?: string | null;
  creadoEn: string;
}

interface TimelineProps {
  eventos: TimelineEvent[];
  compact?: boolean;
}

export const Timeline = ({ eventos, compact = false }: TimelineProps) => {
  return (
    <div className="space-y-0">
      {eventos.map((evento, index) => {
        const isLatest = index === eventos.length - 1;

        return (
          <div key={evento.id ?? `evt-${index}`} className="flex gap-3.5">
            {/* Timeline track */}
            <div className="flex flex-col items-center pt-1">
              <div
                className={cn(
                  'w-3 h-3 rounded-full border-2 flex-shrink-0 transition-colors',
                  isLatest
                    ? 'bg-primary border-primary shadow-glow'
                    : 'bg-background border-border'
                )}
              />
              {index < eventos.length - 1 && (
                <div className={cn(
                  'w-px flex-1 min-h-[2rem]',
                  isLatest ? 'bg-primary/20' : 'bg-border'
                )} />
              )}
            </div>

            {/* Event content */}
            <div className={cn(
              'flex-1 pb-5',
              isLatest && 'pb-0',
              compact && 'pb-3'
            )}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className={cn(
                    'font-display font-semibold text-foreground',
                    compact ? 'text-[13px]' : 'text-sm',
                    isLatest && 'text-primary'
                  )}>
                    {evento.estado}
                  </p>
                  <p className={cn(
                    'text-muted-foreground mt-0.5',
                    compact ? 'text-[12px]' : 'text-sm'
                  )}>
                    {evento.descripcion}
                  </p>
                  {evento.ubicacion && (
                    <p className="text-xs text-muted-foreground/70 mt-1 flex items-center gap-1">
                      <MapPin weight="duotone" className="w-3 h-3 flex-shrink-0" />
                      {evento.ubicacion}
                    </p>
                  )}
                </div>
                <div className="text-right whitespace-nowrap flex-shrink-0">
                  <p className={cn(
                    'font-data text-muted-foreground',
                    compact ? 'text-[11px]' : 'text-[12px]'
                  )}>
                    {formatTimestamp(evento.creadoEn)}
                  </p>
                  <p className={cn(
                    'font-data text-muted-foreground/60 flex items-center justify-end gap-1',
                    compact ? 'text-[11px]' : 'text-[12px]'
                  )}>
                    <Clock weight="duotone" className="w-3 h-3" />
                    {formatTimestampTime(evento.creadoEn)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
