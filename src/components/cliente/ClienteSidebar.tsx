import {
  ChartBar, Package, PlusCircle, Tag, GearSix, UploadSimple, Calculator,
} from '@phosphor-icons/react';
import { NavLink } from '@/components/NavLink';
import { cn } from '@/lib/utils';

const menuItems = [
  { icon: ChartBar, label: 'Dashboard', path: '/cliente', end: true },
  { icon: Package, label: 'Mis Envios', path: '/cliente/envios', end: false },
  { icon: PlusCircle, label: 'Nuevo Paquete', path: '/cliente/envios/nuevo', end: true },
  { icon: UploadSimple, label: 'Importar Masivo', path: '/cliente/importar', end: true },
  { icon: Calculator, label: 'Cotizador', path: '/cliente/cotizar', end: true },
  { icon: Tag, label: 'Etiquetas', path: '/cliente/etiquetas', end: true },
  { icon: GearSix, label: 'Mi Cuenta', path: '/cliente/cuenta', end: true },
];

export const ClienteSidebar = () => {
  return (
    <aside className="w-52 border-r border-sidebar-border bg-sidebar flex flex-col">
      <div className="px-4 py-3 border-b border-white/[0.06]">
        <p className="text-[10px] text-white/30 uppercase tracking-[0.08em] font-semibold">Portal de Cliente</p>
      </div>

      <nav className="flex-1 p-2">
        <ul className="space-y-0.5">
          {menuItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                end={item.end}
                className={cn(
                  'flex items-center gap-2.5 px-2.5 py-2 text-[13px] font-medium rounded-lg transition-all',
                  'text-white/40 hover:text-white/70 hover:bg-white/[0.05]'
                )}
                activeClassName="!text-white bg-white/[0.08] hover:bg-white/[0.1]"
              >
                <item.icon size={17} weight="duotone" className="flex-shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="px-4 py-3 border-t border-white/[0.06]">
        <div className="text-[9px] text-white/15 text-center tracking-[0.1em] uppercase font-medium">
          GO EXPRESS · Paraguay
        </div>
      </div>
    </aside>
  );
};
