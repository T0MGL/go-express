import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Package,
  MagnifyingGlass,
  MapPin,
  ArrowRight,
  User,
  Phone,
  MapTrifold,
  Warning,
  CircleNotch,
  ShieldCheck,
  List,
  X,
  FacebookLogo,
  InstagramLogo,
  LinkedinLogo,
  WhatsappLogo,
  Cube,
  CalendarBlank,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Timeline } from '@/components/tracking/Timeline';
import { mockEnvios, estadoLabels, estadoColors, type Envio } from '@/data/mockData';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';
import { useTracking, type PublicTrackingResult } from '@/hooks/api/use-tracking';

// Unified display type for the tracking page — works for both mock and API modes
type TrackingDisplay = {
  trackingNumber: string;
  estado: string;
  origen: string;
  destino: string;
  fecha: string;
  // Fields only available in mock mode (full Envio)
  destinatarioNombre?: string;
  destinatarioDireccion?: string;
  destinatarioTelefono?: string;
  destinatarioCiudad?: string;
  cantidad?: number;
  producto?: string;
  eventos: Array<{
    id?: string;
    estado: string;
    descripcion: string;
    ubicacion?: string;
    fecha: string;
    hora?: string;
  }>;
};

function envioToDisplay(envio: Envio): TrackingDisplay {
  return {
    trackingNumber: envio.trackingNumber,
    estado: envio.estado,
    origen: envio.origen,
    destino: envio.destino,
    fecha: envio.fecha,
    destinatarioNombre: envio.destinatarioNombre,
    destinatarioDireccion: envio.destinatarioDireccion,
    destinatarioTelefono: envio.destinatarioTelefono,
    cantidad: envio.cantidad,
    producto: envio.producto,
    eventos: envio.eventos,
  };
}

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

// ═══════════════════════════════════════════════════════════════
// Brand Isotipo (same as Landing)
// ═══════════════════════════════════════════════════════════════
const GoIsotipo = ({ size = 32, className = '' }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M20 2L36 11V29L20 38L4 29V11L20 2Z" fill="currentColor" />
    <rect x="11" y="11" width="15" height="3" fill="#ffffff" />
    <rect x="11" y="11" width="3" height="18" fill="#ffffff" />
    <rect x="11" y="26" width="15" height="3" fill="#ffffff" />
    <rect x="23" y="19" width="3" height="10" fill="#ffffff" />
    <rect x="17" y="19" width="9" height="3" fill="#ffffff" />
  </svg>
);

// ═══════════════════════════════════════════════════════════════
// Typewriter Hook (same as Landing)
// ═══════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════
// Animation Variants
// ═══════════════════════════════════════════════════════════════
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

/** Mask phone for privacy: +595 981 *** 234 */
const maskPhone = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 6) return phone;
  return phone.slice(0, -6) + '*** ' + phone.slice(-3);
};

/** Mask address: show only city/dept */
const maskAddress = (address: string) => {
  const parts = address.split(',').map(p => p.trim());
  if (parts.length <= 1) return address;
  return parts.slice(-2).join(', ');
};

// ═══════════════════════════════════════════════════════════════
// Track Component
// ═══════════════════════════════════════════════════════════════
const Track = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [trackingNumber, setTrackingNumber] = useState(searchParams.get('q') || '');
  const [searched, setSearched] = useState(false);
  const [mockSearching, setMockSearching] = useState(false);
  const [mockEnvio, setMockEnvio] = useState<Envio | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const typedPlaceholder = useTypewriter(trackingPlaceholders);

  // API tracking hook — only used when not in mock mode
  const [searchQuery, setSearchQuery] = useState('');
  const { data: apiResult, isLoading: apiSearching, isError: apiError } = useTracking(
    false ? '' : searchQuery
  );

  // Determine the display data — unified type for both modes
  const envio: TrackingDisplay | null = false
    ? (mockEnvio ? envioToDisplay(mockEnvio!) : null)
    : (apiResult ? apiResultToDisplay(apiResult) : null);
  const searching = false ? mockSearching : apiSearching;

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

  // When API returns data
  useEffect(() => {
    if (!false && searchQuery) {
      if (apiResult) {
        setSearched(true);
        toast.success('Envio encontrado');
      } else if (!apiSearching && !apiError) {
        // Query finished but no data
        setSearched(true);
      }
    }
  }, [apiResult, apiSearching, apiError, searchQuery]);

  // When API errors
  useEffect(() => {
    if (!false && apiError && searchQuery) {
      setSearched(true);
    }
  }, [apiError, searchQuery]);

  const handleSearch = useCallback(() => {
    if (!trackingNumber.trim()) {
      toast.error('Ingresa un numero de seguimiento');
      return;
    }

    if (false) {
      setMockSearching(true);
      searchTimeoutRef.current = setTimeout(() => {
        const found = mockEnvios.find(
          (e) => e.trackingNumber.toLowerCase() === trackingNumber.toLowerCase()
        );

        if (found) {
          setMockEnvio(found);
          toast.success('Envio encontrado');
        } else {
          setMockEnvio(null);
        }
        setSearched(true);
        setMockSearching(false);
      }, 600);
    } else {
      // Trigger the API query
      setSearched(false);
      setSearchQuery(trackingNumber.trim());
    }
  }, [trackingNumber]);

  // Auto-search if query param present
  useEffect(() => {
    const q = searchParams.get('q');
    if (q && !searched) {
      setTrackingNumber(q);
      if (false) {
        // Do mock search
        setMockSearching(true);
        const found = mockEnvios.find(
          (e) => e.trackingNumber.toLowerCase() === q!.toLowerCase()
        );
        if (found) {
          setMockEnvio(found ?? null);
          toast.success('Envio encontrado');
        } else {
          setMockEnvio(null);
        }
        setSearched(true);
        setMockSearching(false);
      } else {
        setSearchQuery(q);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusColorMap: Record<string, string> = {
    muted: 'bg-slate-100 text-sidebar/60 border border-slate-200',
    primary: 'bg-primary/8 text-primary border border-primary/12',
    warning: 'bg-amber-50 text-amber-600 border border-amber-200/60',
    success: 'bg-emerald-50 text-emerald-600 border border-emerald-200/60',
    destructive: 'bg-red-50 text-red-600 border border-red-200/60',
  };
  const statusColor = envio ? (statusColorMap[estadoColors[envio.estado]] || statusColorMap.muted) : '';

  return (
    <div className="min-h-screen bg-white text-sidebar font-sans overflow-x-hidden selection:bg-primary/10 selection:text-sidebar">

      {/* NAV (same as Landing) */}
      <header className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrolled ? 'bg-white/95 backdrop-blur-md border-b border-muted/50 shadow-sm py-3' : 'bg-white border-b border-transparent py-5'}`}>
        <div className="max-w-7xl mx-auto px-6 h-12 flex items-center justify-between">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2.5 cursor-pointer" onClick={() => navigate('/')}>
            <GoIsotipo size={30} className="text-primary flex-shrink-0" />
            <span className="font-display font-extrabold text-[18px] text-sidebar leading-none tracking-tight">GO EXPRESS</span>
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
        </div>

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
      <section className="relative pt-40 pb-16 md:pt-48 md:pb-20 bg-white">
        {/* Dot pattern background */}
        <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:24px_24px] opacity-50 pointer-events-none" />

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

            <motion.h1 variants={fadeUpVariant} className="font-display text-[2.25rem] md:text-[3.5rem] font-extrabold text-sidebar tracking-tight leading-[1.05] mb-5">
              Rastrea tu envio
            </motion.h1>

            <motion.p variants={fadeUpVariant} className="text-sidebar/50 text-base md:text-lg font-medium leading-relaxed mb-10 max-w-lg mx-auto">
              Ingresa tu numero de seguimiento para ver el estado actualizado de tu paquete en tiempo real.
            </motion.p>

            {/* Search form */}
            <motion.div variants={fadeUpVariant} className="p-5 md:p-6 bg-slate-50 rounded-2xl border border-muted/80">
              <form onSubmit={(e) => { e.preventDefault(); handleSearch(); }} className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1 group">
                  <div className="flex items-center gap-2 bg-white rounded-xl border border-muted/80 group-focus-within:border-primary/40 group-focus-within:ring-1 group-focus-within:ring-primary/20 transition-all h-14 px-4">
                    <MagnifyingGlass weight="bold" className="w-5 h-5 text-sidebar/30 flex-shrink-0" />
                    <input
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
                El formato del numero de seguimiento es <span className="font-data text-sidebar/50">GE2026XXXXXX</span>
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
                exit={{ opacity: 0 }}
                variants={{ show: { transition: { staggerChildren: 0.1 } }, hidden: {} }}
                className="space-y-5"
              >
                {/* Status Hero Card */}
                <motion.div variants={fadeUp} className="bg-white rounded-2xl border border-muted/80 p-6 md:p-8 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5 mb-7">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-sidebar/40 mb-2">Numero de seguimiento</p>
                      <p className="font-data text-2xl md:text-3xl font-bold text-primary tracking-tight">{envio.trackingNumber}</p>
                    </div>
                    <div className="sm:text-right">
                      <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-sidebar/40 mb-2">Estado actual</p>
                      <div className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-bold ${statusColor}`}>
                        <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
                        {estadoLabels[envio.estado]}
                      </div>
                    </div>
                  </div>

                  {/* Route */}
                  <div className="flex items-center gap-4 p-5 bg-slate-50 rounded-xl border border-muted/60">
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-sidebar/40">Origen</p>
                      <p className="text-sm font-bold text-sidebar mt-1 flex items-center gap-1.5 truncate">
                        <MapPin weight="duotone" className="w-4 h-4 text-sidebar/40 flex-shrink-0" />
                        {envio.origen}
                      </p>
                    </div>
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/8 flex-shrink-0">
                      <ArrowRight weight="bold" className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-sidebar/40">Destino</p>
                      <p className="text-sm font-bold text-sidebar mt-1 flex items-center gap-1.5 truncate">
                        <MapPin weight="duotone" className="w-4 h-4 text-primary flex-shrink-0" />
                        {envio.destino}
                      </p>
                    </div>
                  </div>

                  {/* Quick info row */}
                  <div className={`grid grid-cols-2 ${envio.cantidad != null || envio.producto != null ? 'sm:grid-cols-3' : ''} gap-4 mt-5`}>
                    <div className="flex items-center gap-2.5 p-3 bg-slate-50 rounded-lg border border-muted/40">
                      <CalendarBlank weight="duotone" className="w-4 h-4 text-sidebar/40 flex-shrink-0" />
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-sidebar/30">Fecha</p>
                        <p className="text-[13px] font-semibold text-sidebar">{formatDate(envio.fecha)}</p>
                      </div>
                    </div>
                    {envio.destinatarioCiudad && (
                      <div className="flex items-center gap-2.5 p-3 bg-slate-50 rounded-lg border border-muted/40">
                        <MapPin weight="duotone" className="w-4 h-4 text-sidebar/40 flex-shrink-0" />
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-sidebar/30">Ciudad destino</p>
                          <p className="text-[13px] font-semibold text-sidebar">{envio.destinatarioCiudad}</p>
                        </div>
                      </div>
                    )}
                    {envio.cantidad != null && (
                      <div className="flex items-center gap-2.5 p-3 bg-slate-50 rounded-lg border border-muted/40">
                        <Cube weight="duotone" className="w-4 h-4 text-sidebar/40 flex-shrink-0" />
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-sidebar/30">Bultos</p>
                          <p className="text-[13px] font-semibold text-sidebar">{envio.cantidad || 1}</p>
                        </div>
                      </div>
                    )}
                    {envio.producto != null && (
                      <div className="flex items-center gap-2.5 p-3 bg-slate-50 rounded-lg border border-muted/40 col-span-2 sm:col-span-1">
                        <Package weight="duotone" className="w-4 h-4 text-sidebar/40 flex-shrink-0" />
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-sidebar/30">Producto</p>
                          <p className="text-[13px] font-semibold text-sidebar truncate">{envio.producto || 'Paquete'}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>

                {/* Timeline */}
                <motion.div variants={fadeUp} className="bg-white rounded-2xl border border-muted/80 p-6 md:p-8 shadow-sm">
                  <h3 className="font-display text-lg font-bold text-sidebar mb-6">Historial de eventos</h3>
                  <Timeline eventos={envio.eventos} />
                </motion.div>

                {/* Recipient info — only shown in mock mode (full Envio has PII fields) */}
                {envio.destinatarioNombre && (
                <motion.div variants={fadeUp} className="bg-white rounded-2xl border border-muted/80 p-6 md:p-8 shadow-sm">
                  <h3 className="font-display text-lg font-bold text-sidebar mb-5">Informacion del destinatario</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-sidebar/5 flex items-center justify-center flex-shrink-0">
                        <User weight="duotone" className="w-4.5 h-4.5 text-sidebar/50" />
                      </div>
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-sidebar/40 mb-1">Nombre</p>
                        <p className="text-sm font-semibold text-sidebar">{envio.destinatarioNombre}</p>
                      </div>
                    </div>
                    {envio.destinatarioDireccion && (
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-sidebar/5 flex items-center justify-center flex-shrink-0">
                        <MapTrifold weight="duotone" className="w-4.5 h-4.5 text-sidebar/50" />
                      </div>
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-sidebar/40 mb-1">Zona de entrega</p>
                        <p className="text-sm font-semibold text-sidebar">{maskAddress(envio.destinatarioDireccion)}</p>
                      </div>
                    </div>
                    )}
                    {envio.destinatarioTelefono && (
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-sidebar/5 flex items-center justify-center flex-shrink-0">
                        <Phone weight="duotone" className="w-4.5 h-4.5 text-sidebar/50" />
                      </div>
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-sidebar/40 mb-1">Telefono</p>
                        <p className="text-sm font-semibold text-sidebar font-data">{maskPhone(envio.destinatarioTelefono)}</p>
                      </div>
                    </div>
                    )}
                  </div>
                </motion.div>
                )}

                {/* New search CTA */}
                <motion.div variants={fadeUp} className="text-center pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full px-6 border-muted/80 text-sidebar/60 hover:text-sidebar font-bold text-xs gap-2"
                    onClick={() => { setMockEnvio(null); setSearchQuery(''); setSearched(false); setTrackingNumber(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  >
                    <MagnifyingGlass weight="bold" className="w-4 h-4" />
                    Buscar otro envio
                  </Button>
                </motion.div>
              </motion.div>
            ) : searched && !searching ? (
              <motion.div
                key="not-found"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-center py-20"
              >
                <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center mx-auto mb-5">
                  <Warning size={28} weight="duotone" className="text-amber-500" />
                </div>
                <h3 className="font-display text-xl font-bold text-sidebar mb-2">No encontramos tu envio</h3>
                <p className="text-sm text-sidebar/40 font-medium max-w-sm mx-auto mb-8 leading-relaxed">
                  Verifica que el numero de seguimiento sea correcto. El formato es <span className="font-data text-sidebar/60">GE2026XXXXXX</span>.
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
              /* Empty state — suggestions */
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="text-center py-12"
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto">
                  {[
                    { icon: Package, title: 'Estado en vivo', desc: 'Segui tu paquete en cada etapa del proceso' },
                    { icon: MapPin, title: 'Ubicacion', desc: 'Conoce la ubicacion actual de tu envio' },
                    { icon: ShieldCheck, title: 'Seguro', desc: 'Todos los envios cuentan con seguro de carga' },
                  ].map((item, i) => (
                    <motion.div
                      key={item.title}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 + i * 0.1 }}
                      className="p-5 rounded-xl bg-slate-50 border border-muted/60 text-center"
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

      {/* FOOTER (same as Landing) */}
      <footer className="bg-white pt-16 pb-8 border-t border-muted mt-auto">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-12 mb-14">
            {/* Brand */}
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-5 cursor-pointer" onClick={() => navigate('/')}>
                <GoIsotipo size={28} className="text-primary" />
                <span className="font-display font-extrabold text-lg text-sidebar tracking-tight">GO EXPRESS</span>
              </div>
              <p className="text-sidebar/40 text-sm font-medium leading-relaxed mb-6 max-w-xs">
                Soluciones de logistica corporativa para el mercado paraguayo. E.A.S. con facturacion legal.
              </p>
              <div className="flex gap-2.5">
                {[
                  { icon: FacebookLogo, label: 'Facebook' },
                  { icon: InstagramLogo, label: 'Instagram' },
                  { icon: LinkedinLogo, label: 'LinkedIn' },
                  { icon: WhatsappLogo, label: 'WhatsApp' },
                ].map((social) => (
                  <button key={social.label} className="w-9 h-9 rounded-lg bg-muted/60 hover:bg-primary/10 flex items-center justify-center transition-colors group" aria-label={social.label}>
                    <social.icon weight="fill" className="w-4 h-4 text-sidebar/30 group-hover:text-primary transition-colors" />
                  </button>
                ))}
              </div>
            </div>

            {/* Empresa */}
            <div>
              <h4 className="text-sidebar font-bold text-sm mb-5">Empresa</h4>
              <div className="flex flex-col gap-3">
                {['Nosotros', 'Equipo', 'Carreras', 'Noticias'].map((item) => (
                  <button key={item} className="text-sidebar/40 text-sm font-medium hover:text-sidebar transition-colors text-left w-fit">{item}</button>
                ))}
              </div>
            </div>

            {/* Servicios */}
            <div>
              <h4 className="text-sidebar font-bold text-sm mb-5">Servicios</h4>
              <div className="flex flex-col gap-3">
                {['Distribucion B2B', 'Seguro de Carga', 'Portal Corporativo', 'API de Integracion'].map((item) => (
                  <button key={item} className="text-sidebar/40 text-sm font-medium hover:text-sidebar transition-colors text-left w-fit">{item}</button>
                ))}
              </div>
            </div>

            {/* Legal */}
            <div>
              <h4 className="text-sidebar font-bold text-sm mb-5">Legal</h4>
              <div className="flex flex-col gap-3">
                {['Terminos de Servicio', 'Politica de Privacidad', 'Reclamos', 'Condiciones de Envio'].map((item) => (
                  <button key={item} className="text-sidebar/40 text-sm font-medium hover:text-sidebar transition-colors text-left w-fit">{item}</button>
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
