import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Package,
  MagnifyingGlass,
  MapPin,
  ArrowRight,
  Warning,
  CircleNotch,
  ShieldCheck,
  List,
  X,
  FacebookLogo,
  InstagramLogo,
  LinkedinLogo,
  WhatsappLogo,
  CalendarBlank,
  Truck,
  CheckCircle,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { estadoLabels, estadoColors } from '@/data/constants';
import { toast } from 'sonner';
import { formatDate, cn } from '@/lib/utils';
import type { PublicTrackingResult } from '@/hooks/api/use-tracking';
import { useTracking } from '@/hooks/api/use-tracking';

type TrackingDisplay = {
  trackingNumber: string;
  estado: string;
  origen: string;
  destino: string;
  fecha: string;
  destinatarioCiudad?: string;
  eventos: Array<{
    id?: string;
    estado: string;
    descripcion: string;
    ubicacion?: string;
    fecha: string;
    hora?: string;
  }>;
};

function apiResultToDisplay(result: PublicTrackingResult): TrackingDisplay {
  return {
    trackingNumber: result.trackingNumber,
    estado: result.estado,
    origen: result.origen,
    destino: result.destino,
    fecha: result.fecha,
    destinatarioCiudad: result.destinatarioCiudad,
    eventos: result.eventos.map((e, i) => ({
      id: `evt-${i}`,
      estado: e.estado,
      descripcion: e.descripcion,
      ubicacion: e.ubicacion,
      fecha: e.fecha,
      hora: undefined,
    })),
  };
}


const trackingPlaceholders = ['GE2026000001', 'GE2026000002', 'GE2026000003'];

const useTypewriter = (texts: string[], speed = 60, pause = 2500) => {
  const [display, setDisplay] = useState('');
  const idxRef = useRef(0);
  const charRef = useRef(0);
  const deletingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const tick = () => {
      const text = texts[idxRef.current];
      const char = charRef.current;
      const del = deletingRef.current;

      if (!del && char < text.length) {
        charRef.current++;
        setDisplay(text.slice(0, charRef.current));
        timerRef.current = setTimeout(tick, speed);
      } else if (!del && char === text.length) {
        timerRef.current = setTimeout(() => {
          deletingRef.current = true;
          tick();
        }, pause);
      } else if (del && char > 0) {
        charRef.current--;
        setDisplay(text.slice(0, charRef.current));
        timerRef.current = setTimeout(tick, speed / 2);
      } else if (del && char === 0) {
        deletingRef.current = false;
        idxRef.current = (idxRef.current + 1) % texts.length;
        timerRef.current = setTimeout(tick, speed);
      }
    };
    tick();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [texts, speed, pause]);

  return display;
};

const staggerContainer = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.05 } }
};

const fadeUpVariant = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { type: "tween" as const, ease: "easeOut" as const, duration: 0.5 } }
} as const;

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] as const } },
} as const;

// Shipment journey stages in order
const JOURNEY_STAGES = [
  { key: 'pendiente', label: 'Pendiente', icon: Package },
  { key: 'recolectado', label: 'Retirado', icon: Package },
  { key: 'en_transito', label: 'En tránsito', icon: Truck },
  { key: 'en_reparto', label: 'En Reparto', icon: Truck },
  { key: 'entregado', label: 'Entregado', icon: CheckCircle },
] as const;

function getStageIndex(estado: string): number {
  const idx = JOURNEY_STAGES.findIndex(s => s.key === estado);
  return idx >= 0 ? idx : 0;
}

// Visual shipment journey progress bar
const ShipmentJourney = ({ estado }: { estado: string }) => {
  const currentIndex = getStageIndex(estado);
  const isFailed = estado === 'fallido' || estado === 'problema';
  const totalStages = JOURNEY_STAGES.length;
  const progressPercent = isFailed ? 0 : (currentIndex / (totalStages - 1)) * 100;

  return (
    <div className="w-full" role="progressbar" aria-valuenow={currentIndex + 1} aria-valuemin={1} aria-valuemax={totalStages} aria-label="Progreso del envío">
      {/* Progress track */}
      <div className="relative mb-8">
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-primary via-primary to-primary/80 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 1.2, ease: [0.25, 0.1, 0.25, 1], delay: 0.3 }}
          />
        </div>

        {/* Animated truck indicator */}
        {!isFailed && currentIndex < totalStages - 1 && (
          <motion.div
            className="absolute top-1/2 -translate-y-1/2"
            initial={{ left: '0%' }}
            animate={{ left: `${progressPercent}%` }}
            transition={{ duration: 1.2, ease: [0.25, 0.1, 0.25, 1], delay: 0.3 }}
            style={{ marginLeft: '-14px' }}
          >
            <motion.div
              className="w-7 h-7 rounded-full bg-primary shadow-lg shadow-primary/30 flex items-center justify-center"
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            >
              <Truck weight="fill" className="w-3.5 h-3.5 text-white" />
            </motion.div>
          </motion.div>
        )}
      </div>

      {/* Stage markers */}
      <div className="flex justify-between">
        {JOURNEY_STAGES.map((stage, i) => {
          const isCompleted = !isFailed && i <= currentIndex;
          const isCurrent = !isFailed && i === currentIndex;
          const StageIcon = stage.icon;

          return (
            <motion.div
              key={stage.key}
              className="flex flex-col items-center gap-2 flex-1"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + i * 0.1, duration: 0.4 }}
            >
              <div className="relative">
                <motion.div
                  className={cn(
                    'w-9 h-9 rounded-full flex items-center justify-center transition-all duration-500',
                    isCompleted
                      ? 'bg-primary text-white shadow-md shadow-primary/20'
                      : 'bg-slate-100 text-sidebar/30 border border-slate-200'
                  )}
                  animate={isCurrent ? { scale: [1, 1.08, 1] } : {}}
                  transition={isCurrent ? { duration: 2, repeat: Infinity, ease: "easeInOut" } : {}}
                >
                  {isCompleted && i < currentIndex ? (
                    <CheckCircle weight="fill" className="w-4.5 h-4.5" />
                  ) : (
                    <StageIcon weight={isCompleted ? 'fill' : 'duotone'} className="w-4 h-4" />
                  )}
                </motion.div>
                {isCurrent && (
                  <motion.div
                    className="absolute inset-0 rounded-full border-2 border-primary/40"
                    animate={{ scale: [1, 1.5, 1], opacity: [0.6, 0, 0.6] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  />
                )}
              </div>
              <span className={cn(
                'text-[10px] sm:text-[11px] font-bold text-center leading-tight',
                isCompleted ? 'text-sidebar' : 'text-sidebar/30'
              )}>
                {stage.label}
              </span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

// Premium timeline with hover micro-interactions
function formatEventDate(raw: string): { date: string; time: string } {
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return { date: raw, time: '' };
    const date = d.toLocaleDateString('es-PY', { day: 'numeric', month: 'short', year: 'numeric' });
    const time = d.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });
    return { date, time };
  } catch {
    return { date: raw, time: '' };
  }
}

const PremiumTimeline = ({ eventos }: { eventos: TrackingDisplay['eventos'] }) => {
  return (
    <div className="space-y-0">
      {eventos.map((evento, index) => {
        const isLatest = index === eventos.length - 1;
        const { date, time } = formatEventDate(evento.fecha);
        const label = estadoLabels[evento.estado] ?? evento.estado;

        return (
          <motion.div
            key={evento.id ?? `evt-${index}`}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6 + index * 0.08, duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
            className="flex gap-3.5 group"
          >
            {/* Timeline track */}
            <div className="flex flex-col items-center pt-1">
              <motion.div
                className={cn(
                  'w-3 h-3 rounded-full border-2 flex-shrink-0 transition-all duration-300',
                  isLatest
                    ? 'bg-primary border-primary shadow-glow'
                    : 'bg-background border-border group-hover:border-primary/40'
                )}
                whileHover={{ scale: 1.3 }}
              />
              {index < eventos.length - 1 && (
                <div className={cn(
                  'w-px flex-1 min-h-[2rem] transition-colors duration-300',
                  isLatest ? 'bg-primary/20' : 'bg-border group-hover:bg-primary/15'
                )} />
              )}
            </div>

            {/* Event content */}
            <div className={cn(
              'flex-1 pb-5 rounded-lg px-3 py-2 -ml-1 transition-all duration-300',
              'hover:bg-slate-50/80',
              isLatest && 'pb-0'
            )}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className={cn(
                    'font-display font-semibold text-sm transition-colors',
                    isLatest ? 'text-primary' : 'text-foreground'
                  )}>
                    {label}
                  </p>
                  <p className="text-sm text-muted-foreground mt-0.5">
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
                  <p className="text-[12px] font-medium text-sidebar/50">
                    {date}
                  </p>
                  {time && (
                    <p className="text-[11px] text-muted-foreground/50 mt-0.5">
                      {time}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};

const Track = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [trackingNumber, setTrackingNumber] = useState(searchParams.get('q') || '');
  const [searched, setSearched] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const typedPlaceholder = useTypewriter(trackingPlaceholders);

  const [searchQuery, setSearchQuery] = useState('');
  const { data: apiResult, isLoading: apiSearching, isError: apiError } = useTracking(searchQuery);

  const envio: TrackingDisplay | null = apiResult ? apiResultToDisplay(apiResult) : null;
  const searching = apiSearching;

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (searchQuery) {
      if (apiResult) {
        setSearched(true);
        toast.success('Envío encontrado');
      } else if (!apiSearching && !apiError) {
        setSearched(true);
      }
    }
  }, [apiResult, apiSearching, apiError, searchQuery]);

  useEffect(() => {
    if (apiError && searchQuery) {
      setSearched(true);
    }
  }, [apiError, searchQuery]);

  const handleSearch = useCallback(() => {
    if (!trackingNumber.trim()) {
      toast.error('Ingresa un número de seguimiento');
      return;
    }

    setSearched(false);
    setSearchQuery(trackingNumber.trim());
  }, [trackingNumber]);

  // Auto-search if query param present
  useEffect(() => {
    const q = searchParams.get('q');
    if (q && !searched) {
      setTrackingNumber(q);
      setSearchQuery(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusColorMap: Record<string, string> = {
    muted: 'bg-slate-100 text-sidebar/60 border border-slate-200',
    default: 'bg-primary/8 text-primary border border-primary/12',
    primary: 'bg-primary/8 text-primary border border-primary/12',
    warning: 'bg-amber-50 text-amber-600 border border-amber-200/60',
    success: 'bg-emerald-50 text-emerald-600 border border-emerald-200/60',
    destructive: 'bg-red-50 text-red-600 border border-red-200/60',
  };
  const statusColor = envio ? (statusColorMap[estadoColors[envio.estado]] || statusColorMap.muted) : '';

  return (
    <div className="min-h-screen bg-white text-sidebar font-sans overflow-x-hidden selection:bg-primary/10 selection:text-sidebar">

      {/* NAV */}
      <header className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrolled ? 'bg-white/95 backdrop-blur-md border-b border-muted/50 shadow-sm py-3' : 'bg-white border-b border-transparent py-5'}`}>
        <nav className="max-w-7xl mx-auto px-6 h-12 flex items-center justify-between">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="flex items-center cursor-pointer" onClick={() => navigate('/')}>
            <img src="/logotipo.png" alt="Go Express" className="h-7" />
          </motion.div>

          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-4">
            <Button variant="ghost" size="sm" className="text-sidebar/70 hover:text-sidebar hover:bg-muted/50 border-0 gap-2 font-bold text-xs hidden lg:flex" onClick={() => navigate('/')}>
              <ArrowRight weight="bold" className="w-[18px] h-[18px] rotate-180" />
              Volver al Inicio
            </Button>
            <div className="w-px h-5 bg-border hidden md:block" />
            <Button size="sm" className="bg-primary text-white hover:bg-sidebar font-bold text-xs transition-colors duration-300 rounded-full px-6 h-10 shadow-md shadow-primary/20" onClick={() => navigate('/cliente')}>
              Portal Empresas
            </Button>
            <Button variant="ghost" size="sm" className="md:hidden text-sidebar hover:bg-muted border-0 px-2" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X weight="bold" className="w-6 h-6" /> : <List weight="bold" className="w-6 h-6" />}
            </Button>
          </motion.div>
        </nav>

        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: "easeInOut" }} className="md:hidden border-t border-muted bg-white overflow-hidden absolute w-full shadow-lg">
              <div className="px-6 py-5 flex flex-col gap-4">
                <button onClick={() => { setMobileMenuOpen(false); navigate('/'); }} className="text-sm font-bold text-sidebar/80 hover:text-sidebar text-left flex items-center gap-2">
                  <ArrowRight weight="bold" className="rotate-180" /> Volver al Inicio
                </button>
                <div className="h-px bg-muted w-full my-2" />
                <button onClick={() => { setMobileMenuOpen(false); navigate('/cliente'); }} className="text-sm font-bold text-sidebar/80 hover:text-sidebar text-left flex items-center gap-2">
                  Portal Empresas
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* HERO / SEARCH */}
      <main>
        <section className="relative pt-40 pb-16 md:pt-48 md:pb-20 bg-white">
          <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:24px_24px] opacity-50 pointer-events-none" aria-hidden="true" />

          <div className="max-w-7xl mx-auto px-6 w-full relative z-10">
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="show"
              className="max-w-2xl mx-auto text-center"
            >
              <motion.div variants={fadeUpVariant} className="inline-flex items-center gap-2 bg-sidebar/5 border border-sidebar/10 rounded-full px-4 py-1.5 mb-8">
                <ShieldCheck weight="fill" className="w-4 h-4 text-sidebar" />
                <span className="text-[12px] text-sidebar font-bold tracking-wide">Rastreo en Tiempo Real</span>
              </motion.div>

              <motion.h1 variants={fadeUpVariant} className="font-display text-[2.25rem] md:text-[3.5rem] font-bold text-sidebar tracking-tight leading-[1.05] mb-5">
                Rastrea tu envío
              </motion.h1>

              <motion.p variants={fadeUpVariant} className="text-sidebar/50 text-base md:text-lg font-medium leading-relaxed mb-10 max-w-lg mx-auto">
                Ingresa tu número de seguimiento para ver el estado actualizado de tu paquete en tiempo real.
              </motion.p>

              {/* Search form */}
              <motion.div variants={fadeUpVariant} className="p-5 md:p-6 bg-slate-50 rounded-2xl border border-muted/80">
                <form onSubmit={(e) => { e.preventDefault(); handleSearch(); }} className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1 group">
                    <label htmlFor="tracking-input" className="sr-only">Número de seguimiento</label>
                    <div className="flex items-center gap-2 bg-white rounded-xl border border-muted/80 group-focus-within:border-primary/40 transition-all h-14 px-4">
                      <MagnifyingGlass weight="bold" className="w-5 h-5 text-sidebar/30 flex-shrink-0" />
                      <input
                        id="tracking-input"
                        type="text"
                        placeholder={typedPlaceholder || 'GE2026XXXXXX'}
                        value={trackingNumber}
                        onChange={(e) => setTrackingNumber(e.target.value)}
                        className="flex-1 bg-transparent text-[15px] font-data text-sidebar placeholder:text-sidebar/25 outline-none"
                      />
                    </div>
                  </div>
                  <Button type="submit" disabled={searching} className="bg-primary text-white hover:bg-sidebar font-bold text-sm transition-colors duration-300 rounded-xl px-8 h-14 shadow-md shadow-primary/20 gap-2">
                    {searching ? (
                      <CircleNotch weight="bold" className="w-5 h-5 animate-spin" />
                    ) : (
                      <MagnifyingGlass weight="bold" className="w-5 h-5" />
                    )}
                    {searching ? 'Buscando...' : 'Rastrear'}
                  </Button>
                </form>
                <p className="text-[12px] text-sidebar/30 font-medium mt-3">
                  El formato del número de seguimiento es <span className="font-data text-sidebar/50">GE2026XXXXXX</span>
                </p>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* RESULTS */}
        <section className="pb-20 relative z-10">
          <div className="max-w-3xl mx-auto px-6">
            <AnimatePresence mode="wait">
              {envio ? (
                <motion.div
                  key={envio.trackingNumber}
                  initial="hidden"
                  animate="show"
                  exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }}
                  variants={{ show: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } }, hidden: {} }}
                  className="space-y-5"
                >
                  {/* Status Hero Card */}
                  <motion.div
                    variants={fadeUp}
                    className="relative overflow-hidden bg-white rounded-2xl border border-muted/80 p-6 md:p-8 shadow-sm"
                  >
                    {/* Subtle gradient accent at top */}
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-primary/60 to-transparent" />

                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5 mb-7">
                      <motion.div
                        initial={{ opacity: 0, x: -15 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 25 }}
                      >
                        <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-sidebar/40 mb-2">Número de seguimiento</p>
                        <div className="relative inline-block">
                          <motion.p
                            className="font-data text-2xl md:text-3xl font-bold text-primary tracking-tight"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.3 }}
                          >
                            {envio.trackingNumber}
                          </motion.p>
                          {/* Glow effect behind the tracking number */}
                          <motion.div
                            className="absolute inset-0 bg-primary/5 rounded-lg -m-2 -z-10"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: [0, 1, 0.6], scale: [0.8, 1.05, 1] }}
                            transition={{ delay: 0.3, duration: 1, ease: "easeOut" }}
                          />
                        </div>
                      </motion.div>
                      <motion.div
                        className="sm:text-right"
                        initial={{ opacity: 0, x: 15 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.25, type: "spring", stiffness: 200, damping: 25 }}
                      >
                        <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-sidebar/40 mb-2">Estado actual</p>
                        <motion.div
                          className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-bold ${statusColor}`}
                          initial={{ scale: 0.9, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ delay: 0.35, type: "spring", stiffness: 300, damping: 20 }}
                        >
                          <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
                          {estadoLabels[envio.estado]}
                        </motion.div>
                      </motion.div>
                    </div>

                    {/* Route */}
                    <motion.div
                      className="flex items-center gap-4 p-5 bg-gradient-to-r from-slate-50 to-slate-50/60 rounded-xl border border-muted/60"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4, duration: 0.5 }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-sidebar/40">Origen</p>
                        <p className="text-sm font-bold text-sidebar mt-1 flex items-center gap-1.5 truncate">
                          <MapPin weight="duotone" className="w-4 h-4 text-sidebar/40 flex-shrink-0" />
                          {envio.origen}
                        </p>
                      </div>
                      <motion.div
                        className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/8 flex-shrink-0"
                        animate={{ x: [0, 3, 0] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                      >
                        <ArrowRight weight="bold" className="w-4 h-4 text-primary" />
                      </motion.div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-sidebar/40">Destino</p>
                        <p className="text-sm font-bold text-sidebar mt-1 flex items-center gap-1.5 truncate">
                          <MapPin weight="duotone" className="w-4 h-4 text-primary flex-shrink-0" />
                          {envio.destino}
                        </p>
                      </div>
                    </motion.div>

                    {/* Quick info row */}
                    <div className="grid grid-cols-2 gap-4 mt-5">
                      <motion.div
                        className="flex items-center gap-2.5 p-3 bg-slate-50 rounded-lg border border-muted/40 hover:border-primary/20 transition-colors duration-300"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                      >
                        <CalendarBlank weight="duotone" className="w-4 h-4 text-sidebar/40 flex-shrink-0" />
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-sidebar/30">Fecha</p>
                          <p className="text-[13px] font-semibold text-sidebar">{formatDate(envio.fecha)}</p>
                        </div>
                      </motion.div>
                      {envio.destinatarioCiudad && (
                        <motion.div
                          className="flex items-center gap-2.5 p-3 bg-slate-50 rounded-lg border border-muted/40 hover:border-primary/20 transition-colors duration-300"
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.55 }}
                        >
                          <MapPin weight="duotone" className="w-4 h-4 text-sidebar/40 flex-shrink-0" />
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-sidebar/30">Ciudad destino</p>
                            <p className="text-[13px] font-semibold text-sidebar">{envio.destinatarioCiudad}</p>
                          </div>
                        </motion.div>
                      )}
                    </div>
                  </motion.div>

                  {/* Shipment Journey */}
                  <motion.div
                    variants={fadeUp}
                    className="relative overflow-hidden bg-white rounded-2xl border border-muted/80 p-6 md:p-8 shadow-sm"
                  >
                    <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
                    <h3 className="font-display text-lg font-bold text-sidebar mb-8">Progreso del envío</h3>
                    <ShipmentJourney estado={envio.estado} />
                  </motion.div>

                  {/* Timeline */}
                  <motion.div
                    variants={fadeUp}
                    className="relative overflow-hidden bg-white rounded-2xl border border-muted/80 p-6 md:p-8 shadow-sm"
                  >
                    <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/10 to-transparent" />
                    <h3 className="font-display text-lg font-bold text-sidebar mb-6">Historial de eventos</h3>
                    <PremiumTimeline eventos={envio.eventos} />
                  </motion.div>

                  {/* New search CTA */}
                  <motion.div variants={fadeUp} className="text-center pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full px-6 border-muted/80 text-sidebar/60 hover:text-sidebar hover:border-primary/30 font-bold text-xs gap-2 transition-all duration-300"
                      onClick={() => { setSearchQuery(''); setSearched(false); setTrackingNumber(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    >
                      <MagnifyingGlass weight="bold" className="w-4 h-4" />
                      Buscar otro envío
                    </Button>
                  </motion.div>
                </motion.div>
              ) : searched && !searching ? (
                <motion.div
                  key="not-found"
                  initial={{ opacity: 0, y: 15, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: "spring", stiffness: 200, damping: 25 }}
                  className="text-center py-20"
                >
                  <motion.div
                    className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center mx-auto mb-5"
                    initial={{ rotate: -5 }}
                    animate={{ rotate: 0 }}
                    transition={{ type: "spring", stiffness: 300 }}
                  >
                    <Warning size={28} weight="duotone" className="text-amber-500" />
                  </motion.div>
                  <h2 className="font-display text-xl font-bold text-sidebar mb-2">No encontramos tu envío</h2>
                  <p className="text-sm text-sidebar/40 font-medium max-w-sm mx-auto mb-8 leading-relaxed">
                    Verifica que el número de seguimiento sea correcto. El formato es <span className="font-data text-sidebar/60">GE2026XXXXXX</span>.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full px-6 border-muted/80 text-sidebar/60 hover:text-sidebar font-bold text-xs gap-2"
                    onClick={() => { setSearched(false); setSearchQuery(''); setTrackingNumber(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  >
                    <ArrowRight weight="bold" className="w-4 h-4 rotate-180" />
                    Intentar de nuevo
                  </Button>
                </motion.div>
              ) : !searched ? (
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="text-center py-12"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto">
                    {[
                      { icon: Package, title: 'Estado en vivo', desc: 'Segui tu paquete en cada etapa del proceso' },
                      { icon: MapPin, title: 'Ubicación', desc: 'Conoce la ubicación actual de tu envío' },
                      { icon: ShieldCheck, title: 'Seguro', desc: 'Todos los envíos cuentan con seguro de carga' },
                    ].map((item, i) => (
                      <motion.div
                        key={item.title}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 + i * 0.1 }}
                        className="p-5 rounded-xl bg-slate-50 border border-muted/60 text-center hover:border-primary/20 hover:shadow-sm transition-all duration-300"
                      >
                        <div className="w-10 h-10 rounded-lg bg-white border border-muted/60 flex items-center justify-center mx-auto mb-3 shadow-sm">
                          <item.icon weight="duotone" className="w-5 h-5 text-primary" />
                        </div>
                        <p className="font-display text-sm font-bold text-sidebar mb-1">{item.title}</p>
                        <p className="text-[12px] text-sidebar/40 font-medium leading-relaxed">{item.desc}</p>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="bg-white pt-16 pb-8 border-t border-muted mt-auto">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-12 mb-14">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center mb-5 cursor-pointer" onClick={() => navigate('/')}>
                <img src="/logotipo.png" alt="Go Express" className="h-6" />
              </div>
              <p className="text-sidebar/40 text-sm font-medium leading-relaxed mb-6 max-w-xs">
                Soluciones de logística corporativa para el mercado paraguayo. E.A.S. con facturación legal.
              </p>
              <div className="flex gap-2.5">
                {[
                  { icon: FacebookLogo, label: 'Facebook' },
                  { icon: InstagramLogo, label: 'Instagram' },
                  { icon: LinkedinLogo, label: 'LinkedIn' },
                  { icon: WhatsappLogo, label: 'WhatsApp' },
                ].map((social) => (
                  <a key={social.label} href="#" className="w-9 h-9 rounded-lg bg-muted/60 hover:bg-primary/10 flex items-center justify-center transition-colors group" aria-label={social.label}>
                    <social.icon weight="fill" className="w-4 h-4 text-sidebar/30 group-hover:text-primary transition-colors" />
                  </a>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-sidebar font-bold text-sm mb-5">Empresa</h4>
              <div className="flex flex-col gap-3">
                {['Nosotros', 'Equipo', 'Carreras', 'Noticias'].map((item) => (
                  <span key={item} className="text-sidebar/40 text-sm font-medium hover:text-sidebar transition-colors cursor-pointer w-fit">{item}</span>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-sidebar font-bold text-sm mb-5">Servicios</h4>
              <div className="flex flex-col gap-3">
                {['Distribucion B2B', 'Seguro de Carga', 'Portal Corporativo', 'API de Integracion'].map((item) => (
                  <span key={item} className="text-sidebar/40 text-sm font-medium hover:text-sidebar transition-colors cursor-pointer w-fit">{item}</span>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-sidebar font-bold text-sm mb-5">Legal</h4>
              <div className="flex flex-col gap-3">
                {['Términos de Servicio', 'Política de Privacidad', 'Reclamos', 'Condiciones de Envío'].map((item) => (
                  <span key={item} className="text-sidebar/40 text-sm font-medium hover:text-sidebar transition-colors cursor-pointer w-fit">{item}</span>
                ))}
              </div>
            </div>
          </div>

          <div className="border-t border-muted pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-sidebar/30 text-xs font-medium">
              &copy; {new Date().getFullYear()} Go Express E.A.S. Todos los derechos reservados.
            </div>
            <div className="flex gap-6 text-sidebar/30 text-xs font-medium">
              <button onClick={() => navigate('/track')} className="hover:text-sidebar transition-colors">Rastreo</button>
              <button onClick={() => navigate('/cliente')} className="hover:text-sidebar transition-colors">Portal Clientes</button>
              <button onClick={() => navigate('/admin')} className="hover:text-sidebar transition-colors">Administracion</button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Track;
