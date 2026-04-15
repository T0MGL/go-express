import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Compass, MagnifyingGlass, House } from '@phosphor-icons/react';

const NotFound = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    document.title = 'Página no encontrada · GO EXPRESS';
  }, []);

  const digits = '404'.split('');

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6 bg-dot-pattern">
      <motion.div
        initial={shouldReduceMotion ? {} : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="max-w-md w-full text-center"
      >
        <div className="flex items-center justify-center gap-2 mb-6" aria-hidden="true">
          {digits.map((d, i) => (
            <motion.div
              key={i}
              initial={shouldReduceMotion ? {} : { opacity: 0, y: 12, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.08 + i * 0.06, duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="w-14 h-16 rounded-2xl bg-card border border-border/70 shadow-xs flex items-center justify-center font-display text-[2rem] font-bold text-foreground/90"
            >
              {d}
            </motion.div>
          ))}
        </div>

        <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-[0.08em] mb-3">
          <Compass size={12} weight="duotone" />
          Fuera de ruta
        </div>

        <h1 className="font-display text-[1.5rem] font-bold mb-2 tracking-tight">
          Este paquete se perdió en el camino
        </h1>
        <p className="text-[13.5px] text-muted-foreground leading-relaxed mb-6 max-w-sm mx-auto">
          La página que buscás no existe o fue movida. Si llegaste acá desde un link,
          avisanos y lo corregimos. Mientras tanto, podés volver al inicio o rastrear un envío.
        </p>

        {location.pathname && location.pathname !== '/' && (
          <div className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-muted/40 px-2.5 py-1.5 mb-6 max-w-full">
            <MagnifyingGlass size={12} weight="bold" className="text-muted-foreground flex-shrink-0" />
            <code className="font-data text-[11px] text-muted-foreground truncate max-w-[22rem]">
              {location.pathname}
            </code>
          </div>
        )}

        <div className="flex gap-2 justify-center flex-wrap">
          <Button variant="outline" size="sm" onClick={() => navigate(-1)} className="gap-1.5">
            <ArrowLeft size={14} weight="bold" />
            Volver atrás
          </Button>
          <Button size="sm" onClick={() => navigate('/')} className="gap-1.5">
            <House size={14} weight="duotone" />
            Ir al inicio
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate('/track')} className="gap-1.5 text-muted-foreground hover:text-foreground">
            Rastrear envío
          </Button>
        </div>
      </motion.div>
    </div>
  );
};

export default NotFound;
