import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useInView, useScroll, useTransform } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  MagnifyingGlass, MapPin, Phone, EnvelopeSimple, CheckCircle,
  Package, Truck, ShieldCheck, BuildingOffice, ArrowRight,
  ArrowUpRight, List, X, SealCheck, Handshake, Globe,
  FacebookLogo, InstagramLogo, LinkedinLogo, WhatsappLogo, CaretDown
} from '@phosphor-icons/react';

// ═══════════════════════════════════════════════════════════════
// Brand Isotipo
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
// Animated Counter
// ═══════════════════════════════════════════════════════════════
const NumberCounter = ({ target, duration = 2, suffix = '' }: { target: number; duration?: number; suffix?: string }) => {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  const rafId = useRef(0);

  useEffect(() => {
    if (!isInView) return;
    let startTime: number;
    const updateCount = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = timestamp - startTime;
      const percentage = Math.min(progress / (duration * 1000), 1);
      const easeOutQuart = 1 - Math.pow(1 - percentage, 4);
      setCount(Math.floor(easeOutQuart * target));
      if (percentage < 1) {
        rafId.current = requestAnimationFrame(updateCount);
      }
    };
    rafId.current = requestAnimationFrame(updateCount);
    return () => cancelAnimationFrame(rafId.current);
  }, [isInView, target, duration]);

  return <span ref={ref}>{count}{suffix}</span>;
};

// ═══════════════════════════════════════════════════════════════
// Typewriter Hook
// ═══════════════════════════════════════════════════════════════
const trackingPlaceholders = ['GEX-890214', 'GEX-261033', 'GEX-450078'];

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

// ═══════════════════════════════════════════════════════════════
// Data
// ═══════════════════════════════════════════════════════════════
const clientNames = [
  'Distribuidora Central SA', 'TechSoluciones PY', 'Comercial del Norte',
  'Global Imports SA', 'FarmaRoque', 'Comercial Guaraní SRL',
  'AgroPedro SA', 'Constructora Ñandutí'
];

const departments = [
  { name: 'Asunción', city: 'Capital', hub: true },
  { name: 'Central', city: 'Areguá', hub: true },
  { name: 'Alto Paraná', city: 'Ciudad del Este', hub: true },
  { name: 'Itapúa', city: 'Encarnación', hub: true },
  { name: 'Caaguazú', city: 'Cnel. Oviedo', hub: false },
  { name: 'San Pedro', city: 'San Pedro', hub: false },
  { name: 'Cordillera', city: 'Caacupé', hub: false },
  { name: 'Guairá', city: 'Villarrica', hub: false },
  { name: 'Caazapá', city: 'Caazapá', hub: false },
  { name: 'Misiones', city: 'San Juan Bautista', hub: false },
  { name: 'Paraguarí', city: 'Paraguarí', hub: false },
  { name: 'Ñeembucú', city: 'Pilar', hub: false },
  { name: 'Amambay', city: 'Pedro J. Caballero', hub: false },
  { name: 'Canindeyú', city: 'Salto del Guairá', hub: false },
  { name: 'Concepción', city: 'Concepción', hub: false },
  { name: 'Pdte. Hayes', city: 'Villa Hayes', hub: false },
  { name: 'Boquerón', city: 'Filadelfia', hub: false },
  { name: 'Alto Paraguay', city: 'Fuerte Olimpo', hub: false },
];

// ═══════════════════════════════════════════════════════════════
// FAQ Accordion Item
// ═══════════════════════════════════════════════════════════════
const FaqItem = ({ question, answer, index }: { question: string; answer: string; index: number }) => {
  const [open, setOpen] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.05 }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-5 text-left group"
      >
        <span className="font-display font-semibold text-[15px] text-slate-700 group-hover:text-primary transition-colors pr-4">{question}</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <CaretDown weight="bold" className="w-4 h-4 text-slate-400 shrink-0" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <p className="pb-5 text-slate-500 text-[14px] leading-relaxed">{answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// ═══════════════════════════════════════════════════════════════
// Landing Component
// ═══════════════════════════════════════════════════════════════
const Landing = () => {
  const navigate = useNavigate();
  const [trackingInput, setTrackingInput] = useState('');
  const [contactSent, setContactSent] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [heroCardPage, setHeroCardPage] = useState(0);

  const { scrollY } = useScroll();
  const bgParallax = useTransform(scrollY, [0, 600], [0, 60]);

  const typedPlaceholder = useTypewriter(trackingPlaceholders);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = useCallback((id: string) => {
    setMobileMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const handleTrack = (e: React.FormEvent) => {
    e.preventDefault();
    if (trackingInput.trim()) navigate(`/track?q=${encodeURIComponent(trackingInput.trim())}`);
  };

  const handleContact = (e: React.FormEvent) => {
    e.preventDefault();
    setContactSent(true);
  };

  return (
    <div className="min-h-screen bg-white text-sidebar font-sans overflow-x-hidden selection:bg-primary/10 selection:text-sidebar">

      {/* NAV */}
      <header className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrolled ? 'bg-white/95 backdrop-blur-md border-b border-muted/50 shadow-sm py-3' : 'bg-white border-b border-transparent py-5'}`}>
        <nav className="max-w-7xl mx-auto px-6 h-12 flex items-center justify-between" aria-label="Navegacion principal">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2.5 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <GoIsotipo size={30} className="text-primary flex-shrink-0" />
            <span className="font-display font-extrabold text-[18px] text-sidebar leading-none tracking-tight">GO EXPRESS</span>
          </motion.div>

          <nav className="hidden md:flex items-center gap-10 text-[14px] font-semibold text-sidebar/70">
            {['Servicios', 'Cobertura', 'Contacto'].map((item) => (
              <button key={item} onClick={() => scrollToSection(item.toLowerCase())} className="hover:text-sidebar transition-colors relative group">
                {item}
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-primary group-hover:w-full transition-all duration-300" />
              </button>
            ))}
          </nav>

          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-4">
            <Button variant="ghost" size="sm" className="text-sidebar/70 hover:text-sidebar hover:bg-muted/50 border-0 gap-2 font-bold text-xs hidden lg:flex" onClick={() => navigate('/track')}>
              <MagnifyingGlass weight="bold" className="w-[18px] h-[18px]" />
              Rastrear Envío
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
                {['Servicios', 'Cobertura', 'Contacto'].map((item) => (
                  <button key={item} onClick={() => scrollToSection(item.toLowerCase())} className="text-sm font-bold text-sidebar/80 hover:text-sidebar text-left transition-colors">{item}</button>
                ))}
                <div className="h-px bg-muted w-full my-2" />
                <button onClick={() => { setMobileMenuOpen(false); navigate('/track'); }} className="text-sm font-bold text-sidebar/80 hover:text-sidebar text-left flex items-center gap-2">
                  <MagnifyingGlass weight="bold" /> Rastrear Envío
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* HERO */}
      <main>
      <section className="relative pt-28 pb-16 md:pt-32 md:pb-20 bg-white flex items-center min-h-[85vh]">
        <motion.div style={{ y: bgParallax }} className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:24px_24px] opacity-50 pointer-events-none" aria-hidden="true" />

        <div className="max-w-7xl mx-auto px-6 w-full relative z-10 grid lg:grid-cols-12 gap-16 items-center">
          {/* Left Content */}
          <motion.div variants={staggerContainer} initial="hidden" animate="show" className="lg:col-span-6 flex flex-col justify-center text-center lg:text-left">

            <motion.div variants={fadeUpVariant} className="inline-flex items-center gap-2 bg-sidebar/5 border border-sidebar/10 rounded-full px-4 py-1.5 mb-8 mx-auto lg:mx-0 w-fit">
              <ShieldCheck weight="fill" className="w-4 h-4 text-sidebar" />
              <span className="text-[12px] text-sidebar font-bold tracking-wide">Solidez Logística a Nivel Nacional</span>
            </motion.div>

            <motion.h1 variants={fadeUpVariant} className="font-display text-[2.75rem] md:text-[4.5rem] font-extrabold text-sidebar leading-[1.05] tracking-tight mb-6">
              Tu envío, <br />en buenas <br />manos.
            </motion.h1>

            <motion.p variants={fadeUpVariant} className="text-base md:text-lg text-sidebar/60 max-w-lg mx-auto lg:mx-0 mb-10 leading-relaxed font-medium">
              Gestionamos la logística de tu empresa con procesos claros, seguridad garantizada en cada paquete y llegada a los 18 departamentos del país.
            </motion.p>

            {/* Tracking Form */}
            <motion.div variants={fadeUpVariant} className="relative w-full max-w-xl mx-auto lg:mx-0">
              <div className="p-5 md:p-6 bg-slate-50 rounded-2xl border border-muted shadow-lg shadow-sidebar/[0.04] relative overflow-hidden">
                <Label className="text-sidebar/50 text-[11px] font-bold uppercase tracking-widest mb-3 block flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" /> Rastrear envío por número de pedido
                </Label>

                <form onSubmit={handleTrack} className="w-full rounded-xl overflow-hidden flex bg-white border border-muted focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/20 transition-all duration-300 shadow-sm">
                  <div className="relative flex-1 flex items-center">
                    <MagnifyingGlass weight="bold" className="absolute left-5 w-[20px] h-[20px] text-sidebar/30" />
                    <Input
                      value={trackingInput}
                      onChange={(e) => setTrackingInput(e.target.value)}
                      placeholder={`Ej: ${typedPlaceholder}│`}
                      className="pl-12 h-14 md:h-16 text-sm md:text-base border-0 focus-visible:ring-0 focus-visible:ring-offset-0 font-bold bg-transparent text-sidebar placeholder:text-sidebar/25"
                    />
                  </div>
                  <Button type="submit" className="h-14 md:h-16 px-6 md:px-8 font-bold text-xs md:text-sm gap-2 rounded-none bg-primary text-white hover:bg-sidebar border-0 shrink-0 transition-colors duration-300">
                    Buscar <ArrowRight weight="bold" className="w-4 h-4 hidden sm:block" />
                  </Button>
                </form>
              </div>
            </motion.div>

            {/* Secondary CTA */}
            <motion.div variants={fadeUpVariant} className="flex items-center gap-2 mt-6 justify-center lg:justify-start">
              <span className="text-sidebar/40 text-sm font-medium">¿Empresa?</span>
              <button onClick={() => scrollToSection('contacto')} className="text-primary text-sm font-bold hover:text-sidebar transition-colors inline-flex items-center gap-1 group">
                Solicita tu cuenta corporativa
                <ArrowUpRight weight="bold" className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </button>
            </motion.div>
          </motion.div>

          {/* Right — Delivery Dashboard Card */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.2, type: "tween" as const, ease: "easeOut" as const }}
            className="lg:col-span-6 hidden lg:flex justify-end relative h-[500px]"
          >
            <div className="relative w-[500px] h-[550px]">
              <div className="absolute inset-0 bg-blue-50/50 rounded-[40px] transform rotate-3" />
              <div className="absolute inset-0 border-2 border-primary/10 rounded-[40px] transform -rotate-3" />

              <div className="absolute inset-4 bg-white rounded-[32px] shadow-2xl shadow-sidebar/10 border border-muted flex flex-col p-8 overflow-hidden">
                {(() => {
                  const pages = [
                    {
                      title: 'Seguimiento de Envíos',
                      items: [
                        { icon: Package, iconBg: 'bg-blue-50 border-blue-100', iconColor: 'text-primary', name: 'Carga Corporativa', dest: 'Ciudad del Este', status: 'Entregado', statusColor: 'text-brand-lime bg-brand-lime/10', progress: 'w-full', progressColor: 'bg-brand-lime', opacity: '' },
                        { icon: BuildingOffice, iconBg: 'bg-slate-50 border-border', iconColor: 'text-sidebar/40', name: 'Distribución Sucursales', dest: 'Encarnación', status: 'En Ruta', statusColor: 'text-primary bg-primary/10', progress: 'w-[65%]', progressColor: 'bg-primary', opacity: '' },
                        { icon: Package, iconBg: 'bg-slate-50 border-border', iconColor: 'text-sidebar/30', name: 'Documentación Legal', dest: 'Asunción', status: 'Pendiente', statusColor: 'text-sidebar/40 bg-muted', progress: '', progressColor: '', opacity: 'opacity-60' },
                      ],
                      footer: { number: '18', title: 'Departamentos Activos', subtitle: 'Cobertura garantizada al 100%' }
                    },
                    {
                      title: 'Panel del Cliente',
                      items: [
                        { icon: Package, iconBg: 'bg-blue-50 border-blue-100', iconColor: 'text-primary', name: 'Electrónica Importada', dest: 'Luque', status: 'En Ruta', statusColor: 'text-primary bg-primary/10', progress: 'w-[80%]', progressColor: 'bg-primary', opacity: '' },
                        { icon: Package, iconBg: 'bg-slate-50 border-border', iconColor: 'text-sidebar/40', name: 'Insumos Médicos', dest: 'San Lorenzo', status: 'Entregado', statusColor: 'text-brand-lime bg-brand-lime/10', progress: 'w-full', progressColor: 'bg-brand-lime', opacity: '' },
                        { icon: BuildingOffice, iconBg: 'bg-slate-50 border-border', iconColor: 'text-sidebar/30', name: 'Repuestos Automotor', dest: 'Caaguazú', status: 'Pendiente', statusColor: 'text-sidebar/40 bg-muted', progress: '', progressColor: '', opacity: 'opacity-60' },
                      ],
                      footer: { number: '24h', title: 'Atención Personalizada', subtitle: 'Soporte dedicado para tu empresa' }
                    }
                  ];
                  const current = pages[heroCardPage];
                  return (
                    <>
                      <div className="flex items-center justify-between mb-8 pb-6 border-b border-muted">
                        <div className="text-sm font-bold text-sidebar uppercase tracking-wider">{current.title}</div>
                        <div className="flex gap-2">
                          {pages.map((_, idx) => (
                            <button key={idx} onClick={() => setHeroCardPage(idx)} className={`w-2 h-2 rounded-full transition-colors ${heroCardPage === idx ? 'bg-primary' : 'bg-border hover:bg-sidebar/30'}`} />
                          ))}
                        </div>
                      </div>

                      <div className="space-y-6 flex-1">
                        {current.items.map((item, i) => (
                          <motion.div
                            key={`${heroCardPage}-${item.name}`}
                            initial={{ opacity: 0, x: 15 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.1 }}
                            className={`flex items-start gap-5 ${item.opacity}`}
                          >
                            <div className={`w-12 h-12 rounded-xl ${item.iconBg} flex items-center justify-center border shrink-0`}>
                              <item.icon weight={i === 0 ? 'fill' : 'duotone'} className={`w-6 h-6 ${item.iconColor}`} />
                            </div>
                            <div className="flex-1 pt-1">
                              <div className="flex justify-between items-center mb-1">
                                <span className="font-bold text-sidebar text-sm">{item.name}</span>
                                <span className={`text-xs font-bold ${item.statusColor} px-2 py-0.5 rounded`}>{item.status}</span>
                              </div>
                              <div className="text-xs font-semibold text-sidebar/50 mb-2">Destino: {item.dest}</div>
                              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                {item.progress && <div className={`h-full ${item.progressColor} ${item.progress}`} />}
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>

                      <div className="mt-auto pt-6 border-t border-muted bg-slate-50 -mx-8 -mb-8 p-8">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-white border border-muted shadow-sm flex items-center justify-center text-primary font-bold text-sm">{current.footer.number}</div>
                          <div>
                            <div className="text-sm font-bold text-sidebar">{current.footer.title}</div>
                            <div className="text-xs text-sidebar/50 font-medium">{current.footer.subtitle}</div>
                          </div>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══ SOCIAL PROOF ══════════════════════════════════════════════════ */}
      <section className="py-10 bg-gradient-to-b from-white via-slate-50/80 to-slate-50 border-y border-muted/40 overflow-hidden">
        <div className="overflow-hidden mb-8">
          <div className="flex items-center" style={{ animation: 'scroll-left 35s linear infinite', width: 'max-content' }}>
            {[...clientNames, ...clientNames].map((name, i) => (
              <div key={i} className="flex items-center gap-10 px-10 flex-shrink-0">
                <span className="font-display font-bold text-xl text-sidebar/10 whitespace-nowrap select-none">{name}</span>
                <span className="text-sidebar/8 text-lg select-none">&#9670;</span>
              </div>
            ))}
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-6">
          <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={staggerContainer} className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
            {[
              { icon: SealCheck, label: 'RUC Verificado', desc: 'Facturación legal E.A.S.' },
              { icon: ShieldCheck, label: 'Seguro de Carga', desc: 'Cobertura total en tránsito' },
              { icon: Handshake, label: 'Partner Certificado', desc: '10+ años de operación' },
            ].map((badge) => (
              <motion.div variants={fadeUpVariant} key={badge.label} className="flex flex-col items-center gap-2 py-4">
                <div className="w-10 h-10 rounded-xl bg-primary/8 flex items-center justify-center mb-1">
                  <badge.icon weight="duotone" className="w-5 h-5 text-primary" />
                </div>
                <span className="font-bold text-sm text-sidebar">{badge.label}</span>
                <span className="text-xs text-sidebar/40 font-medium">{badge.desc}</span>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══ METRICS ═══════════════════════════════════════════════════════ */}
      <section className="bg-white border-y border-muted/50">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial="hidden" whileInView="show" viewport={{ once: true, margin: "-50px" }} variants={staggerContainer}
            className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-border/50"
          >
            {[
              { target: 18, label: 'Departamentos', icon: MapPin },
              { target: 100, label: 'Seguridad de Carga', icon: ShieldCheck, suffix: '%' },
              { target: 24, label: 'Atención Corporativa', icon: Phone, suffix: 'h' },
              { target: 10, label: 'Años de Experiencia', icon: BuildingOffice, suffix: '+' },
            ].map((s, i) => (
              <motion.div variants={fadeUpVariant} key={i} className="text-center py-10 md:py-12">
                <s.icon weight="fill" className="w-6 h-6 text-primary/25 mx-auto mb-3" />
                <p className="text-3xl font-display font-extrabold text-slate-600 mb-1 tracking-tight">
                  <NumberCounter target={s.target} suffix={s.suffix} />
                </p>
                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">{s.label}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══ SERVICIOS ═════════════════════════════════════════════════════ */}
      <section id="servicios" className="py-24 md:py-32 bg-slate-50 relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="mb-16 md:mb-20 text-center max-w-2xl mx-auto">
            <motion.div initial={{ opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
              <span className="text-sidebar/50 font-bold tracking-widest text-[11px] uppercase mb-3 block">Nuestros Servicios</span>
              <h2 className="font-display text-3xl md:text-5xl font-extrabold mb-6 tracking-tight text-sidebar">Logística hecha <br />para empresas.</h2>
              <p className="text-sidebar/60 text-lg font-medium leading-relaxed">
                Nos enfocamos en el cumplimiento seguro de la cadena de suministro de tu negocio, con procesos humanos verificados y atención personalizada.
              </p>
            </motion.div>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Package,
                title: 'Distribución B2B',
                desc: 'Manejo de rutas estructuradas para abastecimiento de sucursales, entrega mayorista y paquetería consolidada con altos estándares de seguridad y control cruzado.'
              },
              {
                icon: ShieldCheck,
                title: 'Seguridad Garantizada',
                desc: 'Todo paquete cuenta con proceso administrativo de guía de remisión física y registro documentado. Tu carga nunca se pierde en el sistema.'
              },
              {
                icon: BuildingOffice,
                title: 'Portal Corporativo',
                desc: 'Accede a un panel limpio para ingresar tus envíos, obtener números de tracking unificados y ver el estado de liquidación de forma ordenada.'
              }
            ].map((feature, i) => (
              <motion.div
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                key={feature.title}
                className="bg-white rounded-3xl p-10 border border-muted shadow-lg shadow-sidebar/[0.03] hover:shadow-xl hover:border-primary/15 hover:-translate-y-1 transition-all duration-500 group"
              >
                <div className="w-14 h-14 rounded-2xl bg-slate-600 border border-slate-500 flex items-center justify-center mb-8 group-hover:shadow-lg group-hover:shadow-primary/10 transition-shadow duration-300">
                  <feature.icon weight="fill" className="w-7 h-7 text-white" />
                </div>
                <h3 className="font-display text-xl font-bold mb-4 text-slate-700">{feature.title}</h3>
                <p className="text-slate-500 text-[15px] leading-relaxed font-medium">{feature.desc}</p>
              </motion.div>
            ))}
          </div>

          {/* Portal Preview */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
            className="mt-20 md:mt-24"
          >
            <div className="text-center mb-10">
              <span className="text-slate-400 font-bold tracking-widest text-[11px] uppercase mb-2 block">Portal de Clientes</span>
              <p className="text-slate-500 text-[15px] font-medium">Así se ve el panel donde gestionás todos tus envíos.</p>
            </div>
            {/* MacBook-style browser mockup */}
            <div className="relative mx-auto max-w-5xl" style={{ perspective: '1200px' }}>
              {/* Soft glow behind */}
              <div className="absolute -inset-8 bg-primary/[0.04] rounded-[40px] blur-3xl" />

              <div className="relative rounded-2xl bg-[#f5f5f7] shadow-2xl shadow-slate-900/[0.12] overflow-hidden border border-slate-200/80" style={{ transform: 'rotateX(2deg)' }}>
                {/* Browser top bar */}
                <div className="flex items-center gap-2 px-5 py-3 bg-[#e8e8ed] border-b border-slate-200/80">
                  <div className="flex gap-[7px]">
                    <div className="w-[11px] h-[11px] rounded-full bg-[#ff5f57]" />
                    <div className="w-[11px] h-[11px] rounded-full bg-[#febc2e]" />
                    <div className="w-[11px] h-[11px] rounded-full bg-[#28c840]" />
                  </div>
                  <div className="flex-1 mx-12">
                    <div className="bg-white/80 rounded-md px-4 py-1.5 text-[11px] text-slate-400 font-medium text-center border border-slate-200/60">
                      app.goexpressparaguay.com/cliente
                    </div>
                  </div>
                </div>

                {/* Screenshot */}
                <img
                  src="/dashboardclientes.png"
                  alt="Portal de clientes GO Express, dashboard de envios"
                  className="w-full h-auto block"
                  loading="lazy"
                />
              </div>

              {/* Laptop base / reflection strip */}
              <div className="mx-auto w-[40%] h-[6px] bg-gradient-to-b from-slate-300 to-slate-200 rounded-b-xl" />
              <div className="mx-auto w-[55%] h-[3px] bg-gradient-to-b from-slate-200/80 to-transparent rounded-b-lg" />
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══ COBERTURA ═════════════════════════════════════════════════════ */}
      <section id="cobertura" className="py-24 md:py-32 bg-white relative border-t border-muted/50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
              <div className="inline-flex items-center gap-2 mb-4">
                <Globe weight="duotone" className="w-5 h-5 text-primary" />
                <span className="text-sidebar/50 font-bold tracking-widest text-[11px] uppercase">Cobertura Nacional</span>
              </div>
              <h2 className="font-display text-3xl md:text-5xl font-extrabold mb-6 tracking-tight text-sidebar">
                Presencia en todo<br />el territorio.
              </h2>
              <p className="text-sidebar/60 text-lg font-medium leading-relaxed mb-10 max-w-md">
                Red de distribución con alcance a los 18 departamentos del Paraguay, con hubs principales en las ciudades de mayor actividad comercial.
              </p>

              <div className="grid grid-cols-3 gap-8">
                {[
                  { value: '4', label: 'Hubs principales' },
                  { value: '24h', label: 'Tiempo máximo' },
                  { value: '+500', label: 'Rutas activas' },
                ].map((stat) => (
                  <div key={stat.label}>
                    <div className="font-display text-3xl font-extrabold text-primary mb-1">{stat.value}</div>
                    <div className="text-sm text-sidebar/50 font-medium">{stat.label}</div>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
              <div className="grid grid-cols-3 gap-2">
                {departments.map((dept, i) => (
                  <motion.div
                    key={dept.name}
                    initial={{ opacity: 0, scale: 0.95 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.03 }}
                    className={`rounded-xl px-3 py-2.5 border transition-all duration-300 ${
                      dept.hub
                        ? 'bg-primary/4 border-primary/15 hover:border-primary/30 hover:bg-primary/8'
                        : 'bg-slate-50 border-muted hover:border-sidebar/15 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      {dept.hub && <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />}
                      <div className={`text-sm font-bold truncate ${dept.hub ? 'text-sidebar' : 'text-sidebar/60'}`}>{dept.name}</div>
                    </div>
                    <div className="text-[11px] text-sidebar/35 font-medium mt-0.5 truncate">{dept.city}</div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══ WORKFLOW ══════════════════════════════════════════════════════ */}
      <section className="py-24 md:py-32 bg-white relative border-y border-muted/50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
              <span className="text-sidebar/50 font-bold tracking-widest text-[11px] uppercase mb-3 block">Proceso</span>
              <h2 className="font-display text-3xl md:text-5xl font-extrabold mb-6 tracking-tight text-sidebar">Un proceso operativo<br />seguro y auditable.</h2>
              <p className="text-sidebar/60 text-lg font-medium leading-relaxed mb-10 max-w-md">
                Sin complicaciones inventadas. Procesos de despacho lineales que aseguran que el paquete sale de tus manos y llega al destino correcto.
              </p>

              <div className="space-y-0">
                {[
                  { step: '01', title: 'Recepción y Registro', desc: 'Ingreso al sistema con guía propia o provista por el cliente, generando identidad única para el bulto.' },
                  { step: '02', title: 'Clasificación en Hub', desc: 'La carga es routeada físicamente en nuestra central para su despacho interurbano o interdepartamental.' },
                  { step: '03', title: 'Confirmación de Entrega', desc: 'Soporte documental de que la mercadería llegó en condiciones al destinatario final.' }
                ].map((s, i) => (
                  <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.15 }} key={s.step} className="flex gap-6">
                    <div className="flex flex-col items-center">
                      <div className="w-12 h-12 rounded-full bg-slate-100 border border-muted text-sidebar font-bold text-sm flex items-center justify-center shrink-0">
                        {s.step}
                      </div>
                      {i !== 2 && <div className="w-px h-full bg-border my-1" />}
                    </div>
                    <div className="pt-2 pb-8">
                      <h3 className="text-lg font-bold text-sidebar mb-2">{s.title}</h3>
                      <p className="text-sidebar/60 font-medium text-[15px] leading-relaxed max-w-sm">{s.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} className="relative h-full hidden lg:block">
              <div className="bg-slate-50 rounded-[40px] border border-muted h-full w-full min-h-[600px] flex items-center justify-center relative overflow-hidden p-12">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-[80px]" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-primary/5 rounded-full blur-[80px]" />

                <div className="relative z-10 w-full max-w-md">
                  <div className="bg-white rounded-2xl shadow-xl shadow-sidebar/[0.05] border border-muted p-6">
                    {/* Barcode */}
                    <div className="mb-6 pb-6 border-b border-border text-center">
                      <div className="flex justify-center gap-[3px] mb-2">
                        {[1, 3, 1.5, 1, 4, 2, 1, 2.5, 1, 3, 1.5, 2, 1, 3].map((w, i) => (
                          <div key={i} className="bg-sidebar rounded-[0.5px]" style={{ width: `${w * 3}px`, height: '48px' }} />
                        ))}
                      </div>
                      <div className="font-mono text-xs font-bold text-sidebar tracking-[0.2em]">GEX-2026-88192</div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-[10px] font-bold text-sidebar/40 uppercase tracking-widest mb-1">Origen</p>
                          <p className="font-bold text-sidebar text-sm">Empresa Cliente S.A.</p>
                          <p className="text-sidebar/50 text-xs">Asunción, Central</p>
                        </div>
                        <Truck weight="fill" className="w-6 h-6 text-border" />
                      </div>

                      <div className="h-px bg-border w-full" />

                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-[10px] font-bold text-sidebar/40 uppercase tracking-widest mb-1">Destino</p>
                          <p className="font-bold text-sidebar text-sm">Sucursal Interior</p>
                          <p className="text-sidebar/50 text-xs">Itapúa, Encarnación</p>
                        </div>
                        <MapPin weight="fill" className="w-6 h-6 text-border" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══ FAQ ═════════════════════════════════════════════════════════ */}
      <section className="py-24 md:py-32 bg-white border-t border-muted/50">
        <div className="max-w-3xl mx-auto px-6">
          <motion.div initial={{ opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-14">
            <span className="text-slate-400 font-bold tracking-widest text-[11px] uppercase mb-3 block">Preguntas Frecuentes</span>
            <h2 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight text-slate-700">¿Tenés dudas?</h2>
          </motion.div>

          <div className="space-y-0 divide-y divide-muted/60">
            {[
              { q: '¿Cómo puedo rastrear mi envío?', a: 'Ingresá el número de pedido (ej: GEX-890214) en el buscador de la página principal o en la sección de tracking. Recibirás actualizaciones en tiempo real del estado de tu paquete.' },
              { q: '¿Cuáles son los tiempos de entrega?', a: 'Los tiempos varían según el destino. Entregas dentro del área metropolitana se realizan en 24-48 horas hábiles. Para el interior del país, entre 48-72 horas hábiles dependiendo del departamento.' },
              { q: '¿Qué zonas cubren?', a: 'Tenemos cobertura en los 18 departamentos del Paraguay, con hubs logísticos en Asunción, Ciudad del Este, Encarnación y Pedro Juan Caballero.' },
              { q: '¿Cómo abro una cuenta corporativa?', a: 'Completá el formulario de contacto en esta página o escribinos a contacto@goexpressparaguay.com. Un ejecutivo comercial te contactará para configurar tu cuenta y acceso al portal de clientes.' },
              { q: '¿Qué pasa si mi paquete llega dañado?', a: 'Todos los envíos cuentan con seguro de carga. En caso de daño, contactanos dentro de las 48 horas posteriores a la entrega con fotos del paquete y procesaremos tu reclamo.' },
            ].map((item, i) => (
              <FaqItem key={i} question={item.q} answer={item.a} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CONTACTO ══════════════════════════════════════════════════════ */}
      <section id="contacto" className="py-24 md:py-32 bg-sidebar relative">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16 lg:gap-24 items-center">
            <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
              <span className="text-brand-lime font-bold tracking-widest text-sm uppercase mb-3 block">Comercial</span>
              <h2 className="font-display text-3xl md:text-5xl font-extrabold mb-6 tracking-tight text-white">Inicia la operación comercial hoy.</h2>
              <p className="text-white/50 text-lg font-medium mb-12 leading-relaxed max-w-md">
                Delega tu logística a un socio de confianza, E.A.S. con facturación legal e infraestructura lista para mover tu mercadería segura.
              </p>

              <div className="space-y-6">
                {[
                  { icon: MapPin, title: 'Central', desc: 'Itapúa, Paraguay' },
                  { icon: Phone, title: 'Atención a Empresas', desc: '+595 900 000 000' },
                  { icon: EnvelopeSimple, title: 'Comercial', desc: 'contacto@goexpressparaguay.com' },
                ].map((item, i) => (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                    key={item.title} className="flex items-center gap-5"
                  >
                    <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                      <item.icon weight="fill" className="w-5 h-5 text-brand-lime" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white mb-0.5">{item.title}</p>
                      <p className="text-sm font-medium text-white/40">{item.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, scale: 0.98 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}>
              <div className="bg-white p-8 md:p-10 rounded-[32px] shadow-2xl">
                <AnimatePresence mode="wait">
                  {contactSent ? (
                    <motion.div key="success" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center h-full min-h-[350px] gap-4 text-center">
                      <CheckCircle weight="fill" className="w-16 h-16 text-brand-lime mb-2" />
                      <h3 className="font-display font-bold text-2xl text-sidebar">Recepción Exitosa</h3>
                      <p className="text-sidebar/60 text-base font-medium max-w-xs">Nuestro equipo ejecutivo revisará tu solicitud y te contactará para agendar una reunión.</p>
                      <Button variant="outline" className="mt-6 rounded-full border-muted text-sidebar/70 font-bold hover:text-sidebar hover:bg-slate-50" onClick={() => setContactSent(false)}>
                        Enviar otra solicitud
                      </Button>
                    </motion.div>
                  ) : (
                    <motion.form key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onSubmit={handleContact} className="space-y-5">
                      <div className="text-sidebar font-display font-bold text-2xl mb-6">Solicitar Contacto</div>
                      <div className="grid md:grid-cols-2 gap-5">
                        <div className="space-y-2">
                          <Label htmlFor="nombre" className="text-[12px] font-bold text-sidebar/60 uppercase tracking-widest">Nombre del Encargado</Label>
                          <Input id="nombre" className="h-14 bg-slate-50 border-muted focus:border-primary text-sidebar font-semibold transition-colors rounded-xl" required />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="empresa" className="text-[12px] font-bold text-sidebar/60 uppercase tracking-widest">Razón Social</Label>
                          <Input id="empresa" className="h-14 bg-slate-50 border-muted focus:border-primary text-sidebar font-semibold transition-colors rounded-xl" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email" className="text-[12px] font-bold text-sidebar/60 uppercase tracking-widest">Correo Corporativo</Label>
                        <Input id="email" type="email" className="h-14 bg-slate-50 border-muted focus:border-primary text-sidebar font-semibold transition-colors rounded-xl" required />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="tel" className="text-[12px] font-bold text-sidebar/60 uppercase tracking-widest">Teléfono Directo</Label>
                        <Input id="tel" type="tel" className="h-14 bg-slate-50 border-muted focus:border-primary text-sidebar font-semibold transition-colors rounded-xl" />
                      </div>
                      <Button type="submit" className="w-full h-14 rounded-xl text-sm font-bold bg-primary text-white hover:bg-sidebar transition-colors mt-6 shadow-md shadow-primary/20">
                        Enviar Solicitud
                      </Button>
                    </motion.form>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      </main>

      {/* FOOTER */}
      <footer className="bg-white pt-16 pb-8 border-t border-muted">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-12 mb-14">
            {/* Brand */}
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-5">
                <GoIsotipo size={28} className="text-primary" />
                <span className="font-display font-extrabold text-lg text-sidebar tracking-tight">GO EXPRESS</span>
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
                {['Distribución B2B', 'Seguro de Carga', 'Portal Corporativo', 'API de Integración'].map((item) => (
                  <button key={item} className="text-sidebar/40 text-sm font-medium hover:text-sidebar transition-colors text-left w-fit">{item}</button>
                ))}
              </div>
            </div>

            {/* Legal */}
            <div>
              <h4 className="text-sidebar font-bold text-sm mb-5">Legal</h4>
              <div className="flex flex-col gap-3">
                {['Términos de Servicio', 'Política de Privacidad', 'Reclamos', 'Condiciones de Envío'].map((item) => (
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
              <button onClick={() => navigate('/admin')} className="hover:text-sidebar transition-colors">Administración</button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
