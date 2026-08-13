import { useNavigate } from 'react-router-dom';
import { Logotipo } from '@/components/brand/BrandMark';

interface SiteFooterProps {
  /** Ancla dentro de la misma pagina. En /track no hay secciones, se vuelve al inicio. */
  onSection?: (id: string) => void;
  onSeguro: () => void;
}

export function SiteFooter({ onSection, onSeguro }: SiteFooterProps) {
  const navigate = useNavigate();
  const irASeccion = (id: string) => (onSection ? onSection(id) : navigate('/'));

  const enlaceClass = 'py-1 text-left text-[14px] text-sidebar/45 transition-colors hover:text-sidebar';

  return (
    <footer className="mt-auto border-t border-border/70 bg-white pb-8 pt-16">
      <div className="mx-auto max-w-[1320px] px-6 xl:px-10">
        <div className="grid gap-12 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <button onClick={() => navigate('/')} aria-label="Ir al inicio">
              <Logotipo className="h-6" loading="lazy" />
            </button>
            <p className="mt-5 max-w-xs text-[14px] leading-relaxed text-sidebar/45">
              Soluciones de logística corporativa para el mercado paraguayo. E.A.S. con facturación legal.
            </p>
            <p className="mt-5 text-[14px] text-sidebar/45">
              <a href="tel:+595991600777" className="transition-colors hover:text-sidebar">0991 600 777</a>
              <br />
              <a href="mailto:contacto@goexpressparaguay.com" className="transition-colors hover:text-sidebar">
                contacto@goexpressparaguay.com
              </a>
            </p>
          </div>

          <div>
            <h4 className="text-[13px] font-semibold text-sidebar">Servicios</h4>
            <div className="mt-4 flex flex-col items-start gap-2">
              <button onClick={() => irASeccion('servicios')} className={enlaceClass}>Distribución B2B</button>
              <button onClick={onSeguro} className={enlaceClass}>Seguro de carga</button>
              <button onClick={() => navigate('/portal')} className={enlaceClass}>Portal corporativo</button>
              <button onClick={() => navigate('/track')} className={enlaceClass}>Rastreo de envíos</button>
            </div>
          </div>

          <div>
            <h4 className="text-[13px] font-semibold text-sidebar">Legal</h4>
            <div className="mt-4 flex flex-col items-start gap-2">
              <a href="/privacidad" className={enlaceClass}>Política de privacidad</a>
              <a href="/terminos" className={enlaceClass}>Términos y condiciones</a>
              <button onClick={onSeguro} className={enlaceClass}>Condiciones del seguro</button>
              <button onClick={() => irASeccion('contacto')} className={enlaceClass}>Reclamos</button>
            </div>
          </div>
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-border/70 pt-8 text-[12px] text-sidebar/35 md:flex-row">
          <div className="flex flex-col items-center gap-1 sm:flex-row sm:gap-4">
            <span>&copy; {new Date().getFullYear()} Go Express E.A.S.</span>
            <a
              href="https://thebrightidea.ai/"
              target="_blank"
              rel="noopener noreferrer"
              className="py-1 transition-colors hover:text-sidebar"
            >
              Desarrollado por Bright Idea
            </a>
          </div>
          <button onClick={() => navigate('/admin')} className="py-1 transition-colors hover:text-sidebar">
            Administración
          </button>
        </div>
      </div>
    </footer>
  );
}
