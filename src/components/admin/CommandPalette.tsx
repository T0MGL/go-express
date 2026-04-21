import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem, CommandSeparator,
} from '@/components/ui/command';
import {
  ChartBar, Package, Warehouse, Users, Truck,
  CurrencyDollar, Tag, ShieldCheck, GearSix, PlusCircle, MagnifyingGlass,
} from '@phosphor-icons/react';
import { useAuth } from '@/lib/auth';

type NavEntry = {
  icon: typeof ChartBar;
  label: string;
  path: string;
  group: 'Navegacion' | 'Sistema';
  adminOnly?: boolean;
};

const navigation: NavEntry[] = [
  { icon: ChartBar, label: 'Dashboard', path: '/admin', group: 'Navegacion' },
  { icon: Package, label: 'Envíos', path: '/admin/envios', group: 'Navegacion' },
  { icon: Warehouse, label: 'Warehouse', path: '/admin/warehouse', group: 'Navegacion' },
  { icon: Users, label: 'Clientes', path: '/admin/clientes', group: 'Navegacion', adminOnly: true },
  { icon: Truck, label: 'Repartidores', path: '/admin/repartidores', group: 'Navegacion' },
  { icon: CurrencyDollar, label: 'Pagos', path: '/admin/pagos', group: 'Sistema' },
  { icon: Tag, label: 'Tarifas', path: '/admin/tarifas', group: 'Sistema', adminOnly: true },
  { icon: ShieldCheck, label: 'Auditoría', path: '/admin/auditoria', group: 'Sistema' },
  { icon: GearSix, label: 'Configuración', path: '/admin/configuracion', group: 'Sistema' },
];

const actions = [
  { icon: PlusCircle, label: 'Nuevo envío', path: '/admin/envios/nuevo', group: 'Acciones' },
  { icon: MagnifyingGlass, label: 'Buscar envío por tracking...', path: '/admin/envios', group: 'Acciones' },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const visibleNav = useMemo(
    () => (isAdmin ? navigation : navigation.filter((n) => !n.adminOnly)),
    [isAdmin]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelect = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  const grouped = {
    Acciones: actions,
    Navegacion: visibleNav.filter(n => n.group === 'Navegacion'),
    Sistema: visibleNav.filter(n => n.group === 'Sistema'),
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Buscar página, acción o envío..." />
      <CommandList>
        <CommandEmpty>
          <div className="flex flex-col items-center gap-1 py-2">
            <MagnifyingGlass size={20} weight="duotone" className="text-muted-foreground/40" />
            <p className="text-[13px] text-muted-foreground">Sin resultados</p>
          </div>
        </CommandEmpty>

        {Object.entries(grouped).map(([group, items], i) => (
          <div key={group}>
            {i > 0 && <CommandSeparator />}
            <CommandGroup heading={group}>
              {items.map((item) => (
                <CommandItem
                  key={item.path + item.label}
                  onSelect={() => handleSelect(item.path)}
                  className="gap-2.5 py-2"
                >
                  <item.icon size={16} weight="duotone" className="text-muted-foreground" />
                  <span className="text-[13px]">{item.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </div>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
