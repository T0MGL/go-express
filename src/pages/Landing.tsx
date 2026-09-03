import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/SiteFooter';
import { SeguroDialog } from '@/components/site/SeguroDialog';
import {
  MagnifyingGlass, MapPin, Phone, EnvelopeSimple, CheckCircle,
  ArrowRight, ArrowUpRight, WhatsappLogo, CaretDown, Lightning,
} from '@phosphor-icons/react';
import { usePublicTarifas } from '@/hooks/api/use-public-tarifas';
import type { PublicCiudad } from '@/hooks/api/use-public-tarifas';

const NAV_LINKS = ['Servicios', 'Cobertura', 'Contacto'];

const SERVICIOS = [
  {
    title: 'Distribución B2B',
    desc: 'Rutas estructuradas para abastecimiento de sucursales, entrega mayorista y paquetería consolidada, con control cruzado en cada tramo.',
  },
  {
    title: 'Seguridad de la carga',
    desc: 'Cada paquete viaja con guía de remisión física y registro documentado. Nada avanza sin respaldo, nada se pierde en el sistema.',
  },
  {
    title: 'Portal corporativo',
    desc: 'Cargá tus envíos, obtené tracking unificado y seguí el estado de liquidación desde un panel propio, sin llamadas ni planillas.',
  },
];

const PROCESO = [
  {
    step: '01',
    title: 'Recepción y registro',
    desc: 'Ingreso al sistema con guía propia o provista por el cliente. El bulto queda con identidad única desde el minuto uno.',
  },
  {
    step: '02',
    title: 'Clasificación en hub',
    desc: 'La carga se routea físicamente en nuestra central para su despacho interurbano o interdepartamental.',
  },
  {
    step: '03',
    title: 'Confirmación de entrega',
    desc: 'Soporte documental de que la mercadería llegó en condiciones al destinatario final.',
  },
];

const FAQS = [
  {
    q: '¿Cómo rastreo mi envío?',
    a: 'Ingresá el número de pedido (por ejemplo GEX-890214) en el buscador de esta página o en la sección de rastreo. Vas a ver el estado actualizado del paquete.',
  },
  {
    q: '¿Cuáles son los tiempos de entrega?',
    a: 'Dentro del área metropolitana, entre 24 y 48 horas hábiles. Para el interior, entre 48 y 72 horas hábiles según el departamento de destino.',
  },
  {
    q: '¿Qué zonas cubren?',
    a: 'Llegamos a los 18 departamentos del Paraguay, con hubs logísticos en Asunción, Ciudad del Este, Encarnación y Pedro Juan Caballero.',
  },
  {
    q: '¿Cómo abro una cuenta corporativa?',
    a: 'Completá el formulario de esta página o escribinos a contacto@goexpressparaguay.com. Un ejecutivo comercial te contacta para configurar la cuenta y el acceso al portal.',
  },
  {
    q: '¿Qué pasa si mi paquete llega dañado?',
    a: 'Todos los envíos tienen seguro de carga. Avisanos dentro de las 48 horas posteriores a la entrega con fotos del paquete y procesamos el reclamo.',
  },
];

const CONTACTO = [
  { icon: MapPin, title: 'Central', desc: 'Itapúa, Paraguay' },
  { icon: Phone, title: 'Atención a empresas', desc: '0991 600 777' },
  { icon: WhatsappLogo, title: 'WhatsApp de notificaciones', desc: '+595 981 987 476' },
  { icon: EnvelopeSimple, title: 'Comercial', desc: 'contacto@goexpressparaguay.com' },
];

const GRAN_ASUNCION = new Set([
  'Asunción', 'Luque', 'San Lorenzo', 'Fernando de la Mora', 'Lambaré',
  'Capiatá', 'Limpio', 'Ñemby', 'Mariano Roque Alonso', 'Villa Elisa',
  'San Antonio', 'Itauguá', 'Ypané',
]);

function formatGs(amount: number): string {
  return new Intl.NumberFormat('es-PY').format(amount);
}

function computePricingSummary(ciudades: PublicCiudad[]) {
  let minEstandar = Infinity;
  let minExpress = Infinity;
  let minInterior = Infinity;

  for (const c of ciudades) {
    if (GRAN_ASUNCION.has(c.nombre)) {
      if (c.estandar !== null && c.estandar < minEstandar) minEstandar = c.estandar;
      if (c.express !== null && c.express < minExpress) minExpress = c.express;
    } else if (c.estandar !== null && c.estandar < minInterior) {
      minInterior = c.estandar;
    }
  }

  return {
    granAsuncionEstandar: minEstandar === Infinity ? null : minEstandar,
    granAsuncionExpress: minExpress === Infinity ? null : minExpress,
    interiorDesde: minInterior === Infinity ? null : minInterior,
  };
}

const FaqItem = ({ question, answer }: { question: string; answer: string }) => {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="group flex w-full items-center justify-between gap-6 py-5 text-left"
      >
        <span className="font-display text-[15px] font-semibold text-sidebar transition-colors group-hover:text-primary">
          {question}
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}>
          <CaretDown weight="bold" className="h-4 w-4 shrink-0 text-sidebar/30" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
            className="overflow-hidden"
          >
            <p className="max-w-2xl pb-6 text-[14px] leading-relaxed text-sidebar/55">{answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const Landing = () => {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [trackingInput, setTrackingInput] = useState('');
  const [contactSent, setContactSent] = useState(false);
  const [contactForm, setContactForm] = useState({ nombre: '', empresa: '', email: '', tel: '' });
  const [insuranceOpen, setInsuranceOpen] = useState(false);

  const { data: tarifasData, isLoading: tarifasLoading } = usePublicTarifas();
  const ciudades = useMemo(() => tarifasData?.ciudades ?? [], [tarifasData]);
  const pricing = useMemo(() => computePricingSummary(ciudades), [ciudades]);
  const conExpress = ciudades.filter((c) => c.express !== null).length;
  // La tarjeta de entrega es fija, las de precio dependen de que la tarifa exista.
  const tarjetasTarifa = 1 + (pricing.granAsuncionEstandar !== null ? 1 : 0) + (pricing.interiorDesde !== null ? 1 : 0);

  const reveal = useMemo(
    () =>
      reduceMotion
        ? { initial: undefined, whileInView: undefined }
        : {
            initial: { opacity: 0, y: 16 },
            whileInView: { opacity: 1, y: 0 },
          },
    [reduceMotion],
  );
  const revealTransition = { duration: 0.5, ease: [0.23, 1, 0.32, 1] as const };

  const scrollToSection = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const handleTrack = (e: React.FormEvent) => {
    e.preventDefault();
    if (trackingInput.trim()) navigate(`/track?q=${encodeURIComponent(trackingInput.trim())}`);
  };

  const handleContact = (e: React.FormEvent) => {
    e.preventDefault();
    const { nombre, empresa, email, tel } = contactForm;
    const lineas = [
      'Hola Go Express, quiero abrir una cuenta corporativa.',
      '',
      `Nombre del encargado: ${nombre}`,
      empresa ? `Razon social: ${empresa}` : null,
      `Correo corporativo: ${email}`,
      tel ? `Teléfono directo: ${tel}` : null,
    ].filter(Boolean);
    const mensaje = encodeURIComponent(lineas.join('\n'));
    window.open(`https://wa.me/595991600777?text=${mensaje}`, '_blank', 'noopener,noreferrer');
    setContactSent(true);
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-white font-sans text-sidebar selection:bg-primary/10 selection:text-sidebar">

      <SiteHeader
        sections={NAV_LINKS}
        onSection={scrollToSection}
        secondary={{ label: 'Rastrear envío', icon: MagnifyingGlass, onClick: () => navigate('/track') }}
        onLogo={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        onPortal={() => navigate('/portal')}
      />
      <main>
        {/* HERO */}
        <section className="relative border-b border-border/70 pt-28 lg:pt-24">
          <div className="mx-auto grid max-w-[1320px] items-center gap-y-12 px-6 pb-16 lg:grid-cols-[minmax(0,30rem)_minmax(0,1fr)] lg:gap-x-16 lg:pb-24 xl:px-10">
            <motion.div
              initial={reduceMotion ? undefined : { opacity: 0, y: 20 }}
              animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
              className="relative z-10 lg:py-16"
            >
              <h1 className="font-display text-[2.25rem] font-bold leading-[1.03] tracking-tightest text-sidebar sm:text-[3.25rem] lg:text-[3.5rem]">
                Tu envío,<br />en buenas manos.
              </h1>

              <p className="mt-6 max-w-md text-[17px] leading-relaxed text-sidebar/55">
                Logística corporativa con procesos claros, seguro en cada paquete y llegada a los 18 departamentos del país.
              </p>

              <form
                onSubmit={handleTrack}
                className="mt-10 flex w-full max-w-lg overflow-hidden rounded-full border border-border bg-white shadow-premium-md transition-[border-color,box-shadow] duration-200 focus-within:border-primary/40 focus-within:shadow-glow-lg"
              >
                <div className="relative flex flex-1 items-center">
                  <MagnifyingGlass weight="bold" className="absolute left-5 h-[18px] w-[18px] text-sidebar/25" />
                  <Input
                    value={trackingInput}
                    onChange={(e) => setTrackingInput(e.target.value)}
                    placeholder="Ej. GEX-890214"
                    aria-label="Número de pedido"
                    className="h-14 border-0 bg-transparent pl-12 text-[15px] font-medium text-sidebar placeholder:text-sidebar/30 focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </div>
                <Button
                  type="submit"
                  className="m-1.5 h-11 shrink-0 gap-2 rounded-full bg-sidebar px-6 text-[13px] font-semibold text-white transition-[background-color,transform] duration-200 hover:bg-primary active:scale-[0.98]"
                >
                  Rastrear
                  <ArrowRight weight="bold" className="hidden h-4 w-4 sm:block" />
                </Button>
              </form>

              <div className="mt-5 flex items-center gap-2 text-[14px]">
                <span className="text-sidebar/40">¿Empresa?</span>
                <button
                  onClick={() => scrollToSection('contacto')}
                  className="group inline-flex items-center gap-1 font-semibold text-primary transition-colors hover:text-sidebar"
                >
                  Solicitá tu cuenta corporativa
                  <ArrowUpRight weight="bold" className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </button>
              </div>
            </motion.div>

            {/* El panel real del portal, recortado contra el borde derecho */}
            <div className="relative hidden min-h-[34rem] lg:block">
              {/* El wrapper se queda con el translate del centrado vertical: motion escribe
                  su propio transform y borraria la clase de Tailwind si compartieran nodo. */}
              <div data-bleed className="absolute left-0 top-1/2 w-[60vw] -translate-y-1/2">
              <motion.div
                initial={reduceMotion ? undefined : { opacity: 0, x: 32 }}
                animate={reduceMotion ? undefined : { opacity: 1, x: 0 }}
                transition={{ duration: 0.7, delay: 0.12, ease: [0.23, 1, 0.32, 1] }}
              >
                <picture className="contents">
                  <source
                    type="image/webp"
                    sizes="60vw"
                    srcSet="/brand/hero-768.webp 768w, /brand/hero-1024.webp 1024w, /brand/hero-1536.webp 1536w, /brand/hero-2048.webp 2048w"
                  />
                  <img
                    src="/brand/hero-1024.png"
                    alt="Portal de clientes de Go Express con el resumen de envíos de una empresa"
                    className="block w-full rounded-2xl border border-border/80 shadow-[0_40px_80px_-32px_rgb(6_13_28/0.28)]"
                    decoding="async"
                  />
                </picture>
              </motion.div>
              </div>
            </div>
          </div>
        </section>

        {/* DATOS DE RESPALDO */}
        <section className="border-b border-border/70 bg-slate-50/60">
          <div className="mx-auto max-w-[1320px] px-6 xl:px-10">
            <dl className="grid sm:grid-cols-2 md:grid-cols-4">
              {[
                { valor: '18', unidad: 'departamentos', desc: 'Cobertura en todo el país' },
                { valor: '10+', unidad: 'años', desc: 'Operando en Paraguay' },
                { valor: '200.000', unidad: 'Gs.', desc: 'Seguro incluido por envío', onClick: () => setInsuranceOpen(true) },
                { valor: 'E.A.S.', unidad: '', desc: 'Facturación legal con RUC' },
              ].map((dato, i) => (
                <div
                  key={dato.desc}
                  className={`py-7 sm:px-6 sm:first:pl-0 md:border-t-0 md:px-8 md:last:pr-0 ${
                    i > 0 ? 'border-t border-border/70 md:border-l md:border-border/70' : ''
                  } ${i === 1 ? 'sm:border-t-0' : ''}`}
                >
                  <dt className="font-display text-[26px] font-bold tracking-tight text-sidebar tabular-nums">
                    {dato.valor}
                    {dato.unidad && <span className="ml-1.5 text-[15px] font-semibold text-sidebar/40">{dato.unidad}</span>}
                  </dt>
                  {dato.onClick ? (
                    <dd>
                      <button
                        onClick={dato.onClick}
                        className="mt-1 inline-flex items-center gap-1 py-1 text-[13px] text-primary underline-offset-4 transition-colors hover:text-sidebar hover:underline"
                      >
                        {dato.desc}
                        <ArrowUpRight weight="bold" className="h-3.5 w-3.5" />
                      </button>
                    </dd>
                  ) : (
                    <dd className="mt-1.5 text-[13px] text-sidebar/45">{dato.desc}</dd>
                  )}
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* SERVICIOS */}
        <section id="servicios" className="border-b border-border/70 py-24 md:py-32">
          <div className="mx-auto grid max-w-[1320px] gap-y-12 px-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-x-24 xl:px-10">
            <div className="lg:sticky lg:top-32 lg:self-start">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-sidebar/35">Servicios</span>
              <h2 className="mt-4 font-display text-[2rem] font-bold leading-[1.1] tracking-tighter text-sidebar md:text-[2.75rem]">
                Logística hecha<br />para empresas.
              </h2>
              <p className="mt-5 max-w-sm text-[16px] leading-relaxed text-sidebar/55">
                Nos ocupamos de que la cadena de suministro de tu negocio se cumpla, con procesos verificados por personas y atención directa.
              </p>
              <Button
                className="mt-8 h-11 rounded-full bg-sidebar px-6 text-[13px] font-semibold text-white transition-[background-color,transform] duration-200 hover:bg-primary active:scale-[0.98]"
                onClick={() => navigate('/portal')}
              >
                Entrar al portal
              </Button>
            </div>

            <div className="divide-y divide-border/70 border-y border-border/70">
              {SERVICIOS.map((servicio) => (
                <motion.article
                  key={servicio.title}
                  {...reveal}
                  viewport={{ once: true, amount: 0.25 }}
                  transition={revealTransition}
                  className="py-9"
                >
                  <h3 className="font-display text-[22px] font-bold tracking-tight text-sidebar">{servicio.title}</h3>
                  <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-sidebar/55">{servicio.desc}</p>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        {/* COBERTURA */}
        <section id="cobertura" className="border-b border-border/70 bg-slate-50/60 py-24 md:py-32">
          <div className="mx-auto max-w-[1320px] px-6 xl:px-10">
            <div className="max-w-3xl">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-sidebar/35">Cobertura y tarifas</span>
              <h2 className="mt-4 font-display text-[2rem] font-bold leading-[1.1] tracking-tighter text-sidebar md:text-[2.75rem]">
                Presencia en todo el territorio.
              </h2>
              <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-sidebar/55">
                Red de distribución con alcance a los 18 departamentos, con hubs en las ciudades de mayor actividad comercial. Estas son las tarifas vigentes desde nuestra central en {tarifasData?.hub ?? 'Asunción'}.
              </p>
            </div>

            <div className={`mt-14 grid gap-4 sm:grid-cols-2 ${tarjetasTarifa === 3 ? 'lg:grid-cols-3' : ''}`}>
              {pricing.granAsuncionEstandar !== null && (
                <div className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-6">
                  <div className="text-[11px] font-semibold uppercase tracking-widest text-primary">Gran Asunción</div>
                  <div className="mt-3 flex items-baseline gap-1.5">
                    <span className="font-display text-[28px] font-bold tracking-tight text-sidebar tabular-nums">
                      Gs. {formatGs(pricing.granAsuncionEstandar)}
                    </span>
                    <span className="text-[14px] text-sidebar/40">estándar</span>
                  </div>
                  {pricing.granAsuncionExpress !== null && (
                    <div className="mt-2 flex items-center gap-1.5 text-[14px] font-medium text-sidebar/55">
                      <Lightning weight="fill" className="h-3.5 w-3.5 text-amber-500" />
                      Gs. {formatGs(pricing.granAsuncionExpress)} express
                    </div>
                  )}
                </div>
              )}

              {pricing.interiorDesde !== null && (
                <div className="rounded-2xl border border-border bg-white p-6">
                  <div className="text-[11px] font-semibold uppercase tracking-widest text-sidebar/40">Interior</div>
                  <div className="mt-3 flex items-baseline gap-1.5">
                    <span className="font-display text-[28px] font-bold tracking-tight text-sidebar tabular-nums">
                      Gs. {formatGs(pricing.interiorDesde)}
                    </span>
                    <span className="text-[14px] text-sidebar/40">desde</span>
                  </div>
                  <div className="mt-2 text-[14px] text-sidebar/45">Según departamento de destino</div>
                </div>
              )}

              <div className="rounded-2xl border border-border bg-white p-6">
                <div className="text-[11px] font-semibold uppercase tracking-widest text-sidebar/40">Entrega</div>
                <div className="mt-3 font-display text-[28px] font-bold tracking-tight text-sidebar tabular-nums">24 a 72 h</div>
                <div className="mt-2 text-[14px] text-sidebar/45">Metropolitana e interior, en días hábiles</div>
              </div>
            </div>

            <div className="mt-10 border-t border-border/70 pt-10">
              <h3 className="text-[13px] font-semibold text-sidebar/45">
                Ciudades con tarifa publicada
                {ciudades.length > 0 && <span className="ml-2 tabular-nums text-sidebar/30">{ciudades.length}</span>}
              </h3>

              {ciudades.length === 0 && tarifasLoading ? (
                <div className="mt-5 flex flex-wrap gap-2.5" aria-hidden="true">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-11 w-44 animate-pulse rounded-xl border border-border bg-white" />
                  ))}
                </div>
              ) : ciudades.length === 0 ? (
                <p className="mt-5 max-w-md text-[15px] text-sidebar/45">
                  Estamos publicando las tarifas por ciudad. Escribinos y te pasamos la cotización de tu ruta el mismo día.
                </p>
              ) : (
                <ul className="mt-5 flex flex-wrap gap-2.5">
                  {ciudades.map((ciudad) => (
                    <li
                      key={ciudad.nombre}
                      className="flex items-center gap-3 rounded-xl border border-border bg-white px-4 py-2.5 transition-colors duration-200 hover:border-sidebar/20"
                    >
                      <span className="text-[14px] font-semibold text-sidebar">{ciudad.nombre}</span>
                      {ciudad.estandar !== null && (
                        <span className="text-[13px] tabular-nums text-sidebar/40">Gs. {formatGs(ciudad.estandar)}</span>
                      )}
                      {ciudad.express !== null && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                          <Lightning weight="fill" className="h-2.5 w-2.5" />
                          Express
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <p className="mt-6 text-[14px] text-sidebar/45">
                {conExpress > 0
                  ? `${conExpress} de estas ciudades tienen servicio express en el día.`
                  : 'Cotizamos cualquier destino del país a pedido, incluso los que no están en esta lista.'}
              </p>
            </div>
          </div>
        </section>

        {/* PROCESO */}
        <section className="border-b border-border/70 py-24 md:py-32">
          <div className="mx-auto max-w-[1320px] px-6 xl:px-10">
            <div className="max-w-2xl">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-sidebar/35">Proceso</span>
              <h2 className="mt-4 font-display text-[2rem] font-bold leading-[1.1] tracking-tighter text-sidebar md:text-[2.75rem]">
                Un recorrido seguro y auditable.
              </h2>
              <p className="mt-5 text-[16px] leading-relaxed text-sidebar/55">
                Sin complicaciones inventadas. Despachos lineales que aseguran que el paquete sale de tus manos y llega al destino correcto.
              </p>
            </div>

            <ol className="mt-16 grid gap-x-10 gap-y-12 md:grid-cols-3">
              {PROCESO.map((paso, i) => (
                <motion.li
                  key={paso.step}
                  {...reveal}
                  viewport={{ once: true, amount: 0.25 }}
                  transition={{ ...revealTransition, delay: reduceMotion ? 0 : i * 0.08 }}
                  className="border-t-2 border-sidebar/10 pt-6"
                >
                  <span className="font-mono text-[12px] font-semibold tracking-widest text-primary">{paso.step}</span>
                  <h3 className="mt-4 font-display text-[19px] font-bold tracking-tight text-sidebar">{paso.title}</h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-sidebar/55">{paso.desc}</p>
                </motion.li>
              ))}
            </ol>
          </div>
        </section>

        {/* FAQ */}
        <section className="border-b border-border/70 bg-slate-50/60 py-24 md:py-32">
          <div className="mx-auto grid max-w-[1320px] gap-y-10 px-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-x-24 xl:px-10">
            <h2 className="font-display text-[2rem] font-bold leading-[1.1] tracking-tighter text-sidebar md:text-[2.5rem] lg:sticky lg:top-32 lg:self-start">
              Preguntas<br />frecuentes.
            </h2>
            <div className="divide-y divide-border/70 border-y border-border/70">
              {FAQS.map((item) => (
                <FaqItem key={item.q} question={item.q} answer={item.a} />
              ))}
            </div>
          </div>
        </section>

        {/* CONTACTO */}
        <section id="contacto" className="bg-sidebar py-24 md:py-32">
          <div className="mx-auto grid max-w-[1320px] items-start gap-y-14 px-6 lg:grid-cols-2 lg:gap-x-24 xl:px-10">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-widest text-brand-lime">Comercial</span>
              <h2 className="mt-4 font-display text-[2rem] font-bold leading-[1.08] tracking-tighter text-white md:text-[2.75rem]">
                Empecemos a mover tu carga.
              </h2>
              <p className="mt-5 max-w-md text-[16px] leading-relaxed text-white/50">
                Delegá tu logística a un socio con facturación legal, infraestructura propia y responsabilidad sobre cada bulto.
              </p>

              <div className="mt-12 divide-y divide-white/10 border-y border-white/10">
                {CONTACTO.map((item) => (
                  <div key={item.title} className="flex items-center gap-4 py-5">
                    <item.icon weight="fill" className="h-5 w-5 shrink-0 text-brand-lime" />
                    <div>
                      <p className="text-[13px] text-white/45">{item.title}</p>
                      <p className="text-[15px] font-semibold text-white">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl bg-white p-7 shadow-2xl md:p-10">
              <AnimatePresence mode="wait">
                {contactSent ? (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex min-h-[24rem] flex-col items-center justify-center gap-4 text-center"
                  >
                    <CheckCircle weight="fill" className="h-14 w-14 text-brand-lime" />
                    <h3 className="font-display text-[24px] font-bold tracking-tight text-sidebar">Ya lo tenemos</h3>
                    <p className="max-w-xs text-[15px] leading-relaxed text-sidebar/55">
                      Abrimos tu mensaje en WhatsApp. Un ejecutivo comercial te responde y coordina la apertura de la cuenta.
                    </p>
                    <Button
                      variant="outline"
                      className="mt-4 rounded-full border-border font-semibold text-sidebar/70 hover:bg-slate-50 hover:text-sidebar"
                      onClick={() => setContactSent(false)}
                    >
                      Enviar otra solicitud
                    </Button>
                  </motion.div>
                ) : (
                  <motion.form
                    key="form"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onSubmit={handleContact}
                    className="space-y-5"
                  >
                    <h3 className="font-display text-[22px] font-bold tracking-tight text-sidebar">Solicitar contacto</h3>
                    <div className="grid gap-5 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="nombre" className="text-[12px] font-semibold text-sidebar/70">Nombre del encargado</Label>
                        <Input
                          id="nombre"
                          value={contactForm.nombre}
                          onChange={(e) => setContactForm({ ...contactForm, nombre: e.target.value })}
                          className="h-12 rounded-xl border-border bg-slate-50 font-medium text-sidebar transition-colors focus:border-primary"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="empresa" className="text-[12px] font-semibold text-sidebar/70">Razón social</Label>
                        <Input
                          id="empresa"
                          value={contactForm.empresa}
                          onChange={(e) => setContactForm({ ...contactForm, empresa: e.target.value })}
                          className="h-12 rounded-xl border-border bg-slate-50 font-medium text-sidebar transition-colors focus:border-primary"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-[12px] font-semibold text-sidebar/70">Correo corporativo</Label>
                      <Input
                        id="email"
                        type="email"
                        value={contactForm.email}
                        onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                        className="h-12 rounded-xl border-border bg-slate-50 font-medium text-sidebar transition-colors focus:border-primary"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tel" className="text-[12px] font-semibold text-sidebar/70">Teléfono directo</Label>
                      <Input
                        id="tel"
                        type="tel"
                        value={contactForm.tel}
                        onChange={(e) => setContactForm({ ...contactForm, tel: e.target.value })}
                        className="h-12 rounded-xl border-border bg-slate-50 font-medium text-sidebar transition-colors focus:border-primary"
                      />
                    </div>
                    <Button
                      type="submit"
                      className="mt-2 h-14 w-full gap-2 rounded-xl bg-primary text-[14px] font-semibold text-white transition-[background-color,transform] duration-200 hover:bg-sidebar active:scale-[0.99]"
                    >
                      <WhatsappLogo weight="fill" className="h-4 w-4" />
                      Enviar por WhatsApp
                    </Button>
                    <p className="text-[12px] leading-relaxed text-sidebar/40">
                      Se abre WhatsApp con el mensaje ya escrito. Revisalo antes de enviarlo.
                    </p>
                  </motion.form>
                )}
              </AnimatePresence>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter onSection={scrollToSection} onSeguro={() => setInsuranceOpen(true)} />

      <SeguroDialog
        open={insuranceOpen}
        onOpenChange={setInsuranceOpen}
        onContactar={() => scrollToSection('contacto')}
      />
    </div>
  );
};

export default Landing;
