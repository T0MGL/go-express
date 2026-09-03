import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import type { IconProps } from '@phosphor-icons/react';
import {
  Package,
  MagnifyingGlass,
  MapPin,
  ArrowRight,
  ArrowClockwise,
  Warning,
  WifiSlash,
  CircleNotch,
  ArrowLeft,
  CalendarBlank,
  Truck,
  Warehouse,
  CheckCircle,
} from '@phosphor-icons/react';
import type { ComponentType } from 'react';
import { Button } from '@/components/ui/button';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/SiteFooter';
import { SeguroDialog } from '@/components/site/SeguroDialog';
import { estadoLabels, estadoDescripciones, estadoColors } from '@/data/constants';
import { formatDate, formatTimestamp, formatTimestampTime, cn } from '@/lib/utils';
import { ApiError, describeError } from '@/lib/api';
import type { PublicTrackingResult, PublicTrackingEvent } from '@/hooks/api/use-tracking';
import { useTracking, MIN_TRACKING_LENGTH, TRACKING_FORMAT_HINT } from '@/hooks/api/use-tracking';

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

const staggerContainer = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.04 } },
} as const;

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE_OUT } },
} as const;

// El enum real del backend (envio.schema.ts) tiene 8 estados. Seis describen el
// recorrido; `fallido` y `problema` son interrupciones que ocurren DENTRO de el,
// no etapas propias.
type JourneyStage = 'pendiente' | 'recolectado' | 'en_transito' | 'en_deposito' | 'en_reparto' | 'entregado';

const BASE_JOURNEY: readonly JourneyStage[] = ['pendiente', 'recolectado', 'en_transito', 'en_reparto', 'entregado'];

const STAGE_ICONS: Record<JourneyStage, ComponentType<IconProps>> = {
  pendiente: Package,
  recolectado: Package,
  en_transito: Truck,
  en_deposito: Warehouse,
  en_reparto: Truck,
  entregado: CheckCircle,
};

interface Journey {
  stages: readonly JourneyStage[];
  /** Indice de la ultima etapa realmente alcanzada. -1 cuando no se puede determinar. */
  reachedIndex: number;
  interrupted: boolean;
  progressPercent: number;
}

// Los eventos llegan del API del mas nuevo al mas viejo, asi que el primero que
// coincida con una etapa es el ultimo punto real del recorrido. Es lo que permite
// dibujar una entrega fallida donde ocurrio (despues del reparto) y no en cero.
function lastReachedStage(stages: readonly JourneyStage[], eventos: PublicTrackingEvent[]): number {
  for (const evento of eventos) {
    const index = stages.indexOf(evento.estado as JourneyStage);
    if (index >= 0) return index;
  }
  return -1;
}

// `en_deposito` es saltable: en_transito puede ir directo a en_reparto. Mostrarlo
// siempre le pintaria al comprador una etapa que su envio nunca va a tener, asi que
// entra al mapa solo cuando hay evidencia de que paso por ahi.
function buildJourney(estado: string, eventos: PublicTrackingEvent[]): Journey {
  const usaDeposito = estado === 'en_deposito' || eventos.some((e) => e.estado === 'en_deposito');
  const stages: JourneyStage[] = usaDeposito
    ? ['pendiente', 'recolectado', 'en_transito', 'en_deposito', 'en_reparto', 'entregado']
    : [...BASE_JOURNEY];

  const currentStage = stages.indexOf(estado as JourneyStage);
  const reachedIndex = currentStage >= 0 ? currentStage : lastReachedStage(stages, eventos);

  return {
    stages,
    reachedIndex,
    interrupted: estado === 'fallido' || estado === 'problema',
    progressPercent: reachedIndex > 0 ? (reachedIndex / (stages.length - 1)) * 100 : 0,
  };
}

const ShipmentJourney = ({ estado, eventos }: { estado: string; eventos: PublicTrackingEvent[] }) => {
  const reduceMotion = useReducedMotion();
  const { stages, reachedIndex, interrupted, progressPercent } = buildJourney(estado, eventos);
  const enRuta = !interrupted && reachedIndex >= 0 && reachedIndex < stages.length - 1;
  const currentLabel = estadoLabels[estado] ?? estado;

  return (
    <div
      className="w-full"
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={stages.length}
      {...(reachedIndex >= 0 ? { 'aria-valuenow': reachedIndex + 1 } : {})}
      aria-valuetext={currentLabel}
      aria-label="Progreso del envío"
    >
      <div className="relative mb-8">
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
          <motion.div
            className={cn('h-full rounded-full', interrupted ? 'bg-amber-500' : 'bg-primary')}
            initial={reduceMotion ? false : { width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.15 }}
          />
        </div>

        {enRuta && (
          <motion.div
            className="absolute top-1/2 -ml-3.5 -translate-y-1/2"
            initial={reduceMotion ? false : { left: '0%' }}
            animate={{ left: `${progressPercent}%` }}
            transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.15 }}
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary shadow-md shadow-primary/25">
              <Truck weight="fill" className="h-3.5 w-3.5 text-white" />
            </div>
          </motion.div>
        )}
      </div>

      <div className="flex justify-between">
        {stages.map((stage, i) => {
          const alcanzada = reachedIndex >= 0 && i <= reachedIndex;
          const esActual = alcanzada && i === reachedIndex;
          const esCorte = interrupted && esActual;
          const StageIcon = esCorte ? Warning : STAGE_ICONS[stage];

          return (
            <div key={stage} className="flex min-w-0 flex-1 flex-col items-center gap-2 px-0.5">
              <div className="relative">
                <div
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-300',
                    esCorte && 'bg-amber-500 text-white',
                    !esCorte && alcanzada && 'bg-primary text-white shadow-sm shadow-primary/20',
                    !alcanzada && 'border border-slate-200 bg-slate-100 text-sidebar/60'
                  )}
                >
                  {alcanzada && !esActual ? (
                    <CheckCircle weight="fill" className="h-[18px] w-[18px]" />
                  ) : (
                    <StageIcon weight={alcanzada ? 'fill' : 'duotone'} className="h-4 w-4" />
                  )}
                </div>
                {esActual && !esCorte && !reduceMotion && (
                  <motion.div
                    className="absolute inset-0 rounded-full border-2 border-primary/40"
                    animate={{ scale: [1, 1.45, 1], opacity: [0.6, 0, 0.6] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  />
                )}
              </div>
              <span
                className={cn(
                  'text-center text-[10px] font-bold leading-[1.2] sm:text-[11px]',
                  alcanzada ? 'text-sidebar' : 'text-sidebar/60'
                )}
              >
                {estadoLabels[stage]}
              </span>
            </div>
          );
        })}
      </div>

      {interrupted && (
        <p className="mt-6 rounded-lg border border-amber-200/70 bg-amber-50 px-4 py-3 text-[13px] leading-relaxed text-amber-800">
          {reachedIndex >= 0 && (
            <>
              El recorrido se interrumpió en <strong className="font-semibold">{estadoLabels[stages[reachedIndex]]}</strong>.{' '}
            </>
          )}
          {estadoDescripciones[estado]}. Tu paquete sigue con nosotros.
        </p>
      )}
    </div>
  );
};

const EventTimeline = ({ eventos }: { eventos: PublicTrackingEvent[] }) => {
  const reduceMotion = useReducedMotion();

  return (
    <div className="space-y-0">
      {eventos.map((evento, index) => {
        // El API ordena por created_at descendente: el evento mas reciente es el primero.
        const esReciente = index === 0;
        const label = estadoLabels[evento.estado] ?? evento.estado;
        const detalle = evento.descripcion || estadoDescripciones[evento.estado];

        return (
          <motion.div
            key={`${evento.fecha}-${evento.estado}`}
            initial={reduceMotion ? false : { opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: Math.min(index, 6) * 0.04, duration: 0.3, ease: EASE_OUT }}
            className="flex gap-3.5"
          >
            <div className="flex flex-col items-center pt-1">
              <div
                className={cn(
                  'h-3 w-3 flex-shrink-0 rounded-full border-2',
                  esReciente ? 'border-primary bg-primary shadow-glow' : 'border-border bg-background'
                )}
              />
              {index < eventos.length - 1 && (
                <div className={cn('min-h-[2rem] w-px flex-1', esReciente ? 'bg-primary/25' : 'bg-border')} />
              )}
            </div>

            <div className="flex-1 pb-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className={cn('font-display text-sm font-semibold', esReciente ? 'text-primary' : 'text-foreground')}>
                    {label}
                  </p>
                  {detalle && <p className="mt-0.5 text-sm text-muted-foreground">{detalle}</p>}
                  {evento.ubicacion && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin weight="duotone" className="h-3 w-3 flex-shrink-0" />
                      {evento.ubicacion}
                    </p>
                  )}
                </div>
                <div className="flex-shrink-0 whitespace-nowrap text-right">
                  <p className="text-[12px] font-medium text-sidebar/70">{formatTimestamp(evento.fecha)}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{formatTimestampTime(evento.fecha)}</p>
                </div>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};

// Ocupa el lugar exacto del resultado mientras carga. Antes ganaba la rama de
// marketing y el comprador que ya mando su numero veia tarjetas de venta.
const ResultSkeleton = () => (
  <div className="space-y-5" role="status" aria-live="polite">
    <span className="sr-only">Buscando tu envío</span>
    <div className="rounded-2xl border border-muted/80 bg-white p-6 shadow-sm md:p-8">
      <div className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="h-3 w-40 animate-pulse rounded bg-muted/40" />
          <div className="h-8 w-56 animate-pulse rounded bg-muted/50" />
        </div>
        <div className="h-8 w-32 animate-pulse rounded-full bg-muted/40" />
      </div>
      <div className="h-24 animate-pulse rounded-xl bg-muted/30" />
      <div className="mt-5 grid grid-cols-2 gap-4">
        <div className="h-16 animate-pulse rounded-lg bg-muted/30" />
        <div className="h-16 animate-pulse rounded-lg bg-muted/30" />
      </div>
    </div>
    <div className="rounded-2xl border border-muted/80 bg-white p-6 shadow-sm md:p-8">
      <div className="mb-8 h-5 w-44 animate-pulse rounded bg-muted/40" />
      <div className="mb-8 h-1.5 animate-pulse rounded-full bg-muted/40" />
      <div className="flex justify-between">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-2">
            <div className="h-9 w-9 animate-pulse rounded-full bg-muted/40" />
            <div className="h-2.5 w-12 animate-pulse rounded bg-muted/30" />
          </div>
        ))}
      </div>
    </div>
    <div className="rounded-2xl border border-muted/80 bg-white p-6 shadow-sm md:p-8">
      <div className="mb-6 h-5 w-40 animate-pulse rounded bg-muted/40" />
      <div className="space-y-5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-3.5">
            <div className="mt-1 h-3 w-3 animate-pulse rounded-full bg-muted/40" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-32 animate-pulse rounded bg-muted/40" />
              <div className="h-3 w-2/3 animate-pulse rounded bg-muted/30" />
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// El validador del backend acepta 3 a 20 alfanumericos, asi que un 400 significa lo
// mismo que un 404 para el comprador: ese codigo no existe. Todo lo demas (red, 5xx,
// rate limit) es un problema nuestro y jamas se le reporta como numero equivocado.
function isUnknownTrackingNumber(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 400 || error.status === 422);
}

interface TrackingResultProps {
  envio: PublicTrackingResult;
  statusColor: string;
  onReset: () => void;
}

const TrackingResult = ({ envio, statusColor, onReset }: TrackingResultProps) => {
  const reduceMotion = useReducedMotion();
  const label = estadoLabels[envio.estado] ?? envio.estado;
  const descripcion = estadoDescripciones[envio.estado];

  return (
    <motion.div
      initial={reduceMotion ? false : 'hidden'}
      animate="show"
      exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } } }}
      className="space-y-5"
    >
      <motion.div variants={fadeUp} className="relative overflow-hidden rounded-2xl border border-muted/80 bg-white p-6 shadow-sm md:p-8">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-primary/60 to-transparent" />

        <div className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-sidebar/60">Número de seguimiento</p>
            <p className="font-data text-2xl font-bold tracking-tight text-primary md:text-3xl">{envio.trackingNumber}</p>
          </div>
          <div className="sm:text-right">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-sidebar/60">Estado actual</p>
            <span className={cn('inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-bold', statusColor)}>
              <span className="h-2 w-2 rounded-full bg-current" />
              {label}
            </span>
            {descripcion && <p className="mt-2 max-w-[16rem] text-[13px] leading-relaxed text-sidebar/70 sm:ml-auto">{descripcion}</p>}
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-xl border border-muted/60 bg-slate-50 p-5">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-sidebar/60">Origen</p>
            <p className="mt-1 flex items-center gap-1.5 truncate text-sm font-bold text-sidebar">
              <MapPin weight="duotone" className="h-4 w-4 flex-shrink-0 text-sidebar/60" />
              {envio.origen}
            </p>
          </div>
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/8">
            <ArrowRight weight="bold" className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-sidebar/60">Destino</p>
            <p className="mt-1 flex items-center gap-1.5 truncate text-sm font-bold text-sidebar">
              <MapPin weight="duotone" className="h-4 w-4 flex-shrink-0 text-primary" />
              {envio.destino}
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2.5 rounded-lg border border-muted/40 bg-slate-50 p-3">
            <CalendarBlank weight="duotone" className="h-4 w-4 flex-shrink-0 text-sidebar/60" />
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase leading-tight tracking-[0.06em] text-sidebar/60">
                {envio.entregadoEn ? 'Fecha de entrega' : 'Fecha de creación'}
              </p>
              <p className="text-[13px] font-semibold text-sidebar">
                {envio.entregadoEn ? formatTimestamp(envio.entregadoEn) : formatDate(envio.fecha)}
              </p>
            </div>
          </div>
          {envio.destinatarioCiudad && (
            <div className="flex items-center gap-2.5 rounded-lg border border-muted/40 bg-slate-50 p-3">
              <MapPin weight="duotone" className="h-4 w-4 flex-shrink-0 text-sidebar/60" />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase leading-tight tracking-[0.06em] text-sidebar/60">Ciudad destino</p>
                <p className="truncate text-[13px] font-semibold text-sidebar">{envio.destinatarioCiudad}</p>
              </div>
            </div>
          )}
        </div>

        {envio.recibidoPor && (
          <p className="mt-4 text-[13px] text-sidebar/70">
            Recibido por <span className="font-semibold text-sidebar">{envio.recibidoPor}</span>.
          </p>
        )}
      </motion.div>

      <motion.div variants={fadeUp} className="rounded-2xl border border-muted/80 bg-white p-6 shadow-sm md:p-8">
        <h3 className="mb-8 font-display text-lg font-bold text-sidebar">Progreso del envío</h3>
        <ShipmentJourney estado={envio.estado} eventos={envio.eventos} />
      </motion.div>

      {envio.eventos.length > 0 && (
        <motion.div variants={fadeUp} className="rounded-2xl border border-muted/80 bg-white p-6 shadow-sm md:p-8">
          <h3 className="mb-6 font-display text-lg font-bold text-sidebar">Historial de eventos</h3>
          <EventTimeline eventos={envio.eventos} />
        </motion.div>
      )}

      <motion.div variants={fadeUp} className="pt-4 text-center">
        <Button
          variant="outline"
          size="sm"
          className="gap-2 rounded-full border-muted/80 px-6 text-xs font-bold text-sidebar/70 transition-colors hover:border-primary/30 hover:text-sidebar active:scale-[0.98]"
          onClick={onReset}
        >
          <MagnifyingGlass weight="bold" className="h-4 w-4" />
          Buscar otro envío
        </Button>
      </motion.div>
    </motion.div>
  );
};

const STATUS_NEUTRAL = 'bg-slate-100 text-sidebar border border-slate-200';

const statusColorMap: Record<string, string> = {
  muted: STATUS_NEUTRAL,
  secondary: STATUS_NEUTRAL,
  default: 'bg-primary/8 text-primary border border-primary/15',
  warning: 'bg-amber-50 text-amber-700 border border-amber-200/60',
  success: 'bg-emerald-50 text-emerald-700 border border-emerald-200/60',
  destructive: 'bg-red-50 text-red-700 border border-red-200/60',
};

const FORMATO_CORTO = `Ese número es más corto de lo esperado. El formato es ${TRACKING_FORMAT_HINT}.`;

const Track = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const reduceMotion = useReducedMotion();

  const deepLink = (searchParams.get('q') ?? '').trim();
  const deepLinked = deepLink.length > 0;
  const [trackingNumber, setTrackingNumber] = useState(deepLink);
  const [searchQuery, setSearchQuery] = useState(() => (deepLink.length >= MIN_TRACKING_LENGTH ? deepLink : ''));
  const [formError, setFormError] = useState<string | null>(() =>
    deepLink.length > 0 && deepLink.length < MIN_TRACKING_LENGTH ? FORMATO_CORTO : null
  );
  const [seguroOpen, setSeguroOpen] = useState(false);

  const { data: envio, isLoading, isError, error, refetch, isFetching } = useTracking(searchQuery);
  const resultRef = useRef<HTMLDivElement>(null);
  const scrolledFor = useRef<string | null>(null);

  // Casi todo el trafico llega desde un link de WhatsApp con ?q=. En 375px el
  // resultado nace abajo del pliegue, asi que sin esto el comprador que ya mando su
  // numero ve un buscador pidiendoselo de nuevo.
  useEffect(() => {
    if (!searchQuery || isLoading || scrolledFor.current === searchQuery) return;
    if (!envio && !isError) return;
    scrolledFor.current = searchQuery;
    resultRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }, [searchQuery, envio, isError, isLoading, reduceMotion]);

  const handleSearch = useCallback(() => {
    const value = trackingNumber.trim();
    if (!value) {
      setFormError('Ingresá tu número de seguimiento.');
      return;
    }
    // Sin esto un codigo corto nunca disparaba la consulta y el comprador quedaba
    // mirando la pantalla sin entender por que no pasaba nada.
    if (value.length < MIN_TRACKING_LENGTH) {
      setFormError(FORMATO_CORTO);
      return;
    }
    setFormError(null);
    setSearchQuery(value);
  }, [trackingNumber]);

  const resetSearch = useCallback(() => {
    setSearchQuery('');
    setTrackingNumber('');
    setFormError(null);
    // Sin limpiar el ?q= del link de WhatsApp el hero quedaria colapsado para siempre.
    setSearchParams({}, { replace: true });
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [reduceMotion, setSearchParams]);

  const statusColor = envio ? statusColorMap[estadoColors[envio.estado]] ?? STATUS_NEUTRAL : '';
  const unknownNumber = isError && isUnknownTrackingNumber(error);

  return (
    <div className="min-h-screen overflow-x-hidden bg-white font-sans text-sidebar selection:bg-primary/10 selection:text-sidebar">
      <SiteHeader
        secondary={{ label: 'Volver al inicio', icon: ArrowLeft, onClick: () => navigate('/') }}
        onLogo={() => navigate('/')}
        onPortal={() => navigate('/portal')}
      />

      <main>
        <section className={cn('relative bg-white', deepLinked ? 'pb-8 pt-28 md:pt-32' : 'pb-16 pt-40 md:pb-20 md:pt-48')}>
          <div className="relative z-10 mx-auto w-full max-w-7xl px-6">
            <motion.div
              variants={staggerContainer}
              initial={reduceMotion ? false : 'hidden'}
              animate="show"
              className="mx-auto max-w-2xl text-center"
            >
              {!deepLinked && (
                <>
                  <motion.h1
                    variants={fadeUp}
                    className="mb-5 font-display text-[2.25rem] font-bold leading-[1.03] tracking-tightest text-sidebar md:text-[3.5rem]"
                  >
                    Rastreá tu envío
                  </motion.h1>
                  <motion.p variants={fadeUp} className="mx-auto mb-10 max-w-md text-[17px] leading-relaxed text-sidebar/70">
                    Ingresá tu número de seguimiento y te mostramos en qué estado está el paquete.
                  </motion.p>
                </>
              )}

              <motion.div variants={fadeUp} className="rounded-2xl border border-muted/80 bg-slate-50 p-5 md:p-6">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSearch();
                  }}
                  className="flex flex-col gap-3 sm:flex-row"
                >
                  <div className="group relative flex-1">
                    <label htmlFor="tracking-input" className="sr-only">
                      Número de seguimiento
                    </label>
                    <div
                      className={cn(
                        'flex h-14 items-center gap-2 rounded-xl border bg-white px-4 transition-colors',
                        formError ? 'border-red-300' : 'border-muted/80 group-focus-within:border-primary/40'
                      )}
                    >
                      <MagnifyingGlass weight="bold" className="h-5 w-5 flex-shrink-0 text-sidebar/60" />
                      <input
                        id="tracking-input"
                        type="text"
                        inputMode="text"
                        autoComplete="off"
                        autoCapitalize="characters"
                        placeholder={TRACKING_FORMAT_HINT}
                        value={trackingNumber}
                        onChange={(e) => {
                          setTrackingNumber(e.target.value);
                          if (formError) setFormError(null);
                        }}
                        aria-invalid={!!formError}
                        aria-describedby={formError ? 'tracking-error' : undefined}
                        className="flex-1 bg-transparent font-data text-[15px] text-sidebar outline-none placeholder:text-sidebar/60"
                      />
                    </div>
                  </div>
                  <Button
                    type="submit"
                    disabled={isFetching}
                    className="h-14 gap-2 rounded-xl bg-primary px-8 text-sm font-bold text-white shadow-md shadow-primary/20 transition-colors duration-200 hover:bg-sidebar active:scale-[0.98]"
                  >
                    {isFetching ? (
                      <CircleNotch weight="bold" className="h-5 w-5 animate-spin" />
                    ) : (
                      <MagnifyingGlass weight="bold" className="h-5 w-5" />
                    )}
                    {isFetching ? 'Buscando' : 'Rastrear'}
                  </Button>
                </form>
                {formError && (
                  <p id="tracking-error" role="alert" className="mt-3 text-left text-[13px] font-medium text-red-600">
                    {formError}
                  </p>
                )}
              </motion.div>
            </motion.div>
          </div>
        </section>

        <section className="relative z-10 pb-20">
          <div ref={resultRef} className="mx-auto max-w-3xl scroll-mt-28 px-6">
            <AnimatePresence mode="wait">
              {isLoading ? (
                <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <ResultSkeleton />
                </motion.div>
              ) : envio ? (
                <TrackingResult key={envio.trackingNumber} envio={envio} statusColor={statusColor} onReset={resetSearch} />
              ) : unknownNumber ? (
                <motion.div
                  key="not-found"
                  initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3, ease: EASE_OUT }}
                  className="py-20 text-center"
                >
                  <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-100 bg-amber-50">
                    <Warning size={28} weight="duotone" className="text-amber-500" />
                  </div>
                  <h2 className="mb-2 font-display text-xl font-bold text-sidebar">No encontramos ese número</h2>
                  <p className="mx-auto mb-8 max-w-sm text-sm font-medium leading-relaxed text-sidebar/70">
                    Revisá que esté completo, tal como te lo pasó la tienda. El formato es{' '}
                    <span className="font-data text-sidebar">{TRACKING_FORMAT_HINT}</span>.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 rounded-full border-muted/80 px-6 text-xs font-bold text-sidebar/70 hover:text-sidebar"
                    onClick={resetSearch}
                  >
                    <ArrowRight weight="bold" className="h-4 w-4 rotate-180" />
                    Probar con otro número
                  </Button>
                </motion.div>
              ) : isError ? (
                <motion.div
                  key="connection-error"
                  initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3, ease: EASE_OUT }}
                  className="py-20 text-center"
                >
                  <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200 bg-slate-100">
                    <WifiSlash size={28} weight="duotone" className="text-sidebar/70" />
                  </div>
                  <h2 className="mb-2 font-display text-xl font-bold text-sidebar">No pudimos conectarnos</h2>
                  <p className="mx-auto mb-8 max-w-sm text-sm font-medium leading-relaxed text-sidebar/70">
                    {describeError(error)} Esto no cambia nada de tu envío.
                  </p>
                  <Button
                    size="sm"
                    disabled={isFetching}
                    className="gap-2 rounded-full bg-primary px-6 text-xs font-bold text-white hover:bg-sidebar active:scale-[0.98]"
                    onClick={() => void refetch()}
                  >
                    <ArrowClockwise weight="bold" className={cn('h-4 w-4', isFetching && 'animate-spin')} />
                    Reintentar
                  </Button>
                </motion.div>
              ) : (
                <motion.div
                  key="intro"
                  initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: EASE_OUT, delay: 0.2 }}
                  className="py-12"
                >
                  <dl className="mx-auto grid max-w-3xl border-t border-border/70 sm:grid-cols-3">
                    {[
                      { title: 'Estado en vivo', desc: 'Cada etapa del recorrido, apenas se registra' },
                      { title: 'Destino', desc: 'A qué ciudad va y por dónde pasó' },
                      { title: 'Seguro incluido', desc: 'Hasta Gs. 200.000 en todos los envíos' },
                    ].map((item, i) => (
                      <div
                        key={item.title}
                        className={cn(
                          'py-6 sm:px-6 sm:first:pl-0 sm:last:pr-0',
                          i > 0 && 'border-t border-border/70 sm:border-l sm:border-t-0 sm:border-border/70'
                        )}
                      >
                        <dt className="font-display text-[15px] font-bold text-sidebar">{item.title}</dt>
                        <dd className="mt-1.5 text-[13px] leading-relaxed text-sidebar/70">{item.desc}</dd>
                      </div>
                    ))}
                  </dl>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>
      </main>

      <SiteFooter onSeguro={() => setSeguroOpen(true)} />

      <SeguroDialog open={seguroOpen} onOpenChange={setSeguroOpen} onContactar={() => navigate('/')} />
    </div>
  );
};

export default Track;
