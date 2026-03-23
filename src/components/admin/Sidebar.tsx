import { useState } from 'react';
import {
  ChartBar, Package, Warehouse as WarehouseIcon, Users, Truck,
  CurrencyDollar, Tag, ShieldCheck, GearSix, CaretDoubleLeft, CaretDoubleRight,
} from '@phosphor-icons/react';
import { NavLink } from '@/components/NavLink';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const GoIsotipo = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 2L36 11V29L20 38L4 29V11L20 2Z" fill="hsl(var(--brand-lime))" />
    <rect x="11" y="11" width="15" height="3" fill="white" />
    <rect x="11" y="11" width="3" height="18" fill="white" />
    <rect x="11" y="26" width="15" height="3" fill="white" />
    <rect x="23" y="19" width="3" height="10" fill="white" />
    <rect x="17" y="19" width="9" height="3" fill="white" />
  </svg>
);

const mainNav = [
  { icon: ChartBar, label: 'Dashboard', path: '/admin' },
  { icon: Package, label: 'Envios', path: '/admin/envios' },
  { icon: WarehouseIcon, label: 'Warehouse', path: '/admin/warehouse' },
  { icon: Users, label: 'Clientes', path: '/admin/clientes' },
  { icon: Truck, label: 'Repartidores', path: '/admin/repartidores' },
];

const secondaryNav = [
  { icon: CurrencyDollar, label: 'Pagos', path: '/admin/pagos' },
  { icon: Tag, label: 'Tarifas', path: '/admin/tarifas' },
  { icon: ShieldCheck, label: 'Auditoria', path: '/admin/auditoria' },
  { icon: GearSix, label: 'Configuracion', path: '/admin/configuracion' },
];

export const Sidebar = () => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          'flex flex-col bg-sidebar transition-all duration-300 ease-[cubic-bezier(0.25_0.46_0.45_0.94)] scrollbar-thin',
          collapsed ? 'w-[56px]' : 'w-[216px]'
        )}
      >
        {/* Brand */}
        <div className={cn(
          'flex items-center h-12 border-b border-white/[0.06]',
          collapsed ? 'justify-center px-0' : 'px-4 gap-2.5'
        )}>
          <GoIsotipo size={collapsed ? 22 : 24} />
          {!collapsed && (
            <div className="min-w-0">
              <h2 className="font-display font-extrabold text-[12px] text-white leading-none tracking-tight">
                GO EXPRESS
              </h2>
              <p className="text-[8px] text-white/20 mt-0.5 tracking-[0.18em] font-medium uppercase">
                Logistics
              </p>
            </div>
          )}
        </div>

        {/* Main Navigation */}
        <nav className="flex-1 py-2 overflow-y-auto scrollbar-thin">
          <div className={cn('space-y-0.5', collapsed ? 'px-1.5' : 'px-2')}>
            {mainNav.map((item) => {
              const link = (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/admin'}
                  className={cn(
                    'group flex items-center gap-2.5 text-[13px] font-medium rounded-lg transition-all duration-150',
                    'text-white/40 hover:text-white/80 hover:bg-white/[0.05]',
                    collapsed ? 'justify-center h-8 w-8 mx-auto' : 'px-2.5 h-8'
                  )}
                  activeClassName="!text-white bg-white/[0.08] hover:bg-white/[0.1]"
                >
                  <item.icon size={18} weight="duotone" className="flex-shrink-0 opacity-80 group-[.active]:opacity-100" />
                  {!collapsed && <span>{item.label}</span>}
                </NavLink>
              );

              if (collapsed) {
                return (
                  <Tooltip key={item.path}>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side="right" sideOffset={8} className="font-medium text-xs">
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                );
              }
              return link;
            })}
          </div>

          <div className={cn(
            'my-2.5 border-t border-white/[0.06]',
            collapsed ? 'mx-3' : 'mx-4'
          )} />

          <div className={cn('space-y-0.5', collapsed ? 'px-1.5' : 'px-2')}>
            {!collapsed && (
              <p className="px-2.5 mb-1 text-[10px] font-semibold tracking-[0.08em] text-white/15 uppercase">
                Sistema
              </p>
            )}
            {secondaryNav.map((item) => {
              const link = (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={cn(
                    'group flex items-center gap-2.5 text-[13px] font-medium rounded-lg transition-all duration-150',
                    'text-white/30 hover:text-white/70 hover:bg-white/[0.04]',
                    collapsed ? 'justify-center h-8 w-8 mx-auto' : 'px-2.5 h-8'
                  )}
                  activeClassName="!text-white bg-white/[0.08] hover:bg-white/[0.1]"
                >
                  <item.icon size={18} weight="duotone" className="flex-shrink-0 opacity-70 group-[.active]:opacity-100" />
                  {!collapsed && <span>{item.label}</span>}
                </NavLink>
              );

              if (collapsed) {
                return (
                  <Tooltip key={item.path}>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side="right" sideOffset={8} className="font-medium text-xs">
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                );
              }
              return link;
            })}
          </div>
        </nav>

        {/* Collapse toggle */}
        <div className="border-t border-white/[0.06] p-1.5">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={cn(
              'flex items-center gap-2 w-full text-[11px] font-medium rounded-lg h-7 transition-all duration-150',
              'text-white/20 hover:text-white/40 hover:bg-white/[0.04]',
              collapsed ? 'justify-center' : 'px-2.5'
            )}
          >
            {collapsed ? (
              <CaretDoubleRight size={14} weight="bold" />
            ) : (
              <>
                <CaretDoubleLeft size={14} weight="bold" />
                <span>Colapsar</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </TooltipProvider>
  );
};
