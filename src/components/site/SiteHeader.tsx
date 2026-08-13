import { useState } from 'react';
import type { ComponentType } from 'react';
import { motion, AnimatePresence, useScroll, useMotionValueEvent } from 'motion/react';
import type { IconProps } from '@phosphor-icons/react';
import { List, X } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Logotipo } from '@/components/brand/BrandMark';

interface SecondaryAction {
  label: string;
  icon: ComponentType<IconProps>;
  onClick: () => void;
}

interface SiteHeaderProps {
  /** Anclas de la misma pagina. Solo la landing tiene secciones. */
  sections?: readonly string[];
  onSection?: (id: string) => void;
  secondary: SecondaryAction;
  onLogo: () => void;
  onPortal: () => void;
}

export function SiteHeader({ sections, onSection, secondary, onLogo, onPortal }: SiteHeaderProps) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, 'change', (y) => setScrolled(y > 16));

  const goSection = (id: string) => {
    setOpen(false);
    onSection?.(id);
  };

  return (
    <header
      className={`fixed top-0 z-50 w-full transition-[background-color,box-shadow,padding] duration-300 ${
        scrolled ? 'border-b border-border/70 bg-white/90 py-3 backdrop-blur-md' : 'bg-white py-5'
      }`}
    >
      <nav className="mx-auto flex h-12 max-w-[1320px] items-center justify-between px-6 xl:px-10" aria-label="Navegación principal">
        <button
          onClick={onLogo}
          className="flex shrink-0 items-center transition-transform duration-150 active:scale-[0.98]"
          aria-label="Ir al inicio"
        >
          <Logotipo className="h-7" />
        </button>

        {sections && (
          <div className="hidden items-center gap-9 text-[14px] font-medium text-sidebar/60 md:flex">
            {sections.map((item) => (
              <button
                key={item}
                onClick={() => goSection(item.toLowerCase())}
                className="group relative py-1 transition-colors hover:text-sidebar"
              >
                <span className="absolute inset-x-0 -bottom-0.5 h-px origin-left scale-x-0 bg-sidebar transition-transform duration-300 group-hover:scale-x-100" />
                {item}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="hidden gap-2 border-0 text-[13px] font-medium text-sidebar/60 hover:bg-transparent hover:text-sidebar lg:flex"
            onClick={secondary.onClick}
          >
            <secondary.icon weight="bold" className="h-[17px] w-[17px]" />
            {secondary.label}
          </Button>
          <Button
            size="sm"
            className="hidden h-10 rounded-full bg-primary px-5 text-[13px] font-semibold text-white transition-[background-color,transform] duration-200 hover:bg-sidebar active:scale-[0.98] md:flex"
            onClick={onPortal}
          >
            Portal empresas
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="border-0 px-2 text-sidebar hover:bg-muted md:hidden"
            onClick={() => setOpen(!open)}
            aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={open}
          >
            {open ? <X weight="bold" className="h-6 w-6" /> : <List weight="bold" className="h-6 w-6" />}
          </Button>
        </div>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
            className="absolute w-full overflow-hidden border-t border-border/70 bg-white shadow-lg md:hidden"
          >
            <div className="flex flex-col gap-4 px-6 py-5">
              {sections?.map((item) => (
                <button
                  key={item}
                  onClick={() => goSection(item.toLowerCase())}
                  className="text-left text-[15px] font-semibold text-sidebar/80 transition-colors hover:text-sidebar"
                >
                  {item}
                </button>
              ))}
              {sections && <div className="my-1 h-px w-full bg-border" />}
              <button
                onClick={() => { setOpen(false); secondary.onClick(); }}
                className="flex items-center gap-2 text-left text-[15px] font-semibold text-sidebar/80 transition-colors hover:text-sidebar"
              >
                <secondary.icon weight="bold" className="h-4 w-4" />
                {secondary.label}
              </button>
              <button
                onClick={() => { setOpen(false); onPortal(); }}
                className="h-11 rounded-full bg-primary px-6 text-[14px] font-semibold text-white transition-[background-color,transform] duration-200 hover:bg-sidebar active:scale-[0.98]"
              >
                Portal empresas
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
