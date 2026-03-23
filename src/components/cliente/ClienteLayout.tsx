import { useRef, useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { NavLink } from '@/components/NavLink';
import { cn } from '@/lib/utils';
import {
  ChartBar, Package, PlusCircle, UploadSimple, Calculator, Tag, Cube,
  Bell, SignOut, CaretDown,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { GearSix } from '@phosphor-icons/react';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api';

interface ClienteProfile {
  id: string;
  razonSocial: string;
  contactoNombre: string;
  email: string;
}

const GoIsotipo = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 2L36 11V29L20 38L4 29V11L20 2Z" fill="hsl(var(--primary))" />
    <rect x="11" y="11" width="15" height="3" fill="white" />
    <rect x="11" y="11" width="3" height="18" fill="white" />
    <rect x="11" y="26" width="15" height="3" fill="white" />
    <rect x="23" y="19" width="3" height="10" fill="white" />
    <rect x="17" y="19" width="9" height="3" fill="white" />
  </svg>
);

const navItems = [
  { icon: ChartBar, label: 'Dashboard', path: '/cliente', end: true },
  { icon: Package, label: 'Mis Envios', path: '/cliente/envios', end: false },
  { icon: PlusCircle, label: 'Nuevo', path: '/cliente/envios/nuevo', end: true },
  { icon: UploadSimple, label: 'Importar', path: '/cliente/importar', end: true },
  { icon: Calculator, label: 'Cotizador', path: '/cliente/cotizar', end: true },
  { icon: Tag, label: 'Etiquetas', path: '/cliente/etiquetas', end: true },
  { icon: Cube, label: 'Productos', path: '/cliente/productos', end: true },
];

const pageTransition = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0 },
  transition: { duration: 0.15, ease: [0.25, 0.46, 0.45, 0.94] as const },
};

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
}

export const ClienteLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const mainRef = useRef<HTMLElement>(null);
  const [profile, setProfile] = useState<ClienteProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Resolve the authenticated client on mount
  useEffect(() => {
    let mounted = true;

    async function resolveClient() {
      // Try sessionStorage first (set during portal login)
      const stored = sessionStorage.getItem('go_express_cliente');
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as ClienteProfile;
          if (mounted) setProfile(parsed);
        } catch {
          // Invalid stored data
        }
      }

      // Verify the session is still valid
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        if (mounted) navigate('/portal/login', { replace: true });
        return;
      }

      // Fetch the profile from the backend
      try {
        const me = await api.get<{
          id: string;
          nombre: string;
          email: string;
          razonSocial?: string;
          tipo: string;
        }>('/auth/me');

        if (!mounted) return;

        if (me.tipo === 'cliente') {
          const p: ClienteProfile = {
            id: me.id,
            razonSocial: me.razonSocial || me.nombre,
            contactoNombre: me.nombre,
            email: me.email,
          };
          setProfile(p);
          sessionStorage.setItem('go_express_cliente', JSON.stringify(p));
        } else {
          // This is an admin user, redirect to admin
          navigate('/admin', { replace: true });
          return;
        }
      } catch {
        // Token invalid, redirect to portal login
        if (mounted) navigate('/portal/login', { replace: true });
        return;
      }

      if (mounted) setLoading(false);
    }

    resolveClient().finally(() => {
      if (mounted) setLoading(false);
    });

    return () => { mounted = false; };
  }, [navigate]);

  // Scroll to top on route change
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);

  const handleLogout = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        try {
          await fetch(`${import.meta.env.VITE_API_URL || '/api'}/auth/logout`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
          });
        } catch {
          // Non-critical
        }
      }
      await supabase.auth.signOut();
    } finally {
      sessionStorage.removeItem('go_express_cliente');
      navigate('/portal/login', { replace: true });
    }
  };

  if (loading && !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const displayName = profile?.razonSocial || 'Cliente';
  const displayEmail = profile?.email || '';

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border/50 bg-card/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="h-12 flex items-center justify-between px-6 max-w-[1400px] mx-auto w-full">
          <div className="flex items-center gap-2.5">
            <GoIsotipo size={22} />
            <div className="flex items-baseline gap-2">
              <span className="font-display font-extrabold text-[12px] tracking-tight">GO EXPRESS</span>
              <span className="text-[10px] text-muted-foreground font-medium">Portal</span>
            </div>
          </div>

          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground relative" aria-label="Notificaciones">
              <Bell size={17} weight="duotone" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 h-8 pl-1.5 pr-2 ml-0.5">
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="bg-primary/8 text-primary text-[10px] font-bold">
                      {getInitials(displayName)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-[13px] font-medium hidden sm:inline">{displayName}</span>
                  <CaretDown size={12} weight="bold" className="text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="font-normal">
                  <p className="text-sm font-medium">{displayName}</p>
                  <p className="text-xs text-muted-foreground">{displayEmail}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/cliente/cuenta')}>
                  <GearSix size={16} weight="duotone" className="mr-2" />
                  Mi Cuenta
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={handleLogout}>
                  <SignOut size={16} weight="duotone" className="mr-2" />
                  Cerrar Sesion
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <nav className="px-6 max-w-[1400px] mx-auto w-full">
          <div className="flex items-center gap-0.5 -mb-px overflow-x-auto scrollbar-thin">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.end}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium border-b-2 border-transparent',
                  'text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap'
                )}
                activeClassName="text-foreground border-primary"
              >
                <item.icon size={15} weight="duotone" />
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>

      <main ref={mainRef} className="flex-1 overflow-y-auto scrollbar-thin">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            {...pageTransition}
            className="p-6 lg:p-8 max-w-[1400px] mx-auto w-full"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
};
