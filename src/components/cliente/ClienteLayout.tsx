import { useRef, useEffect, useMemo, Suspense } from 'react';
import * as Sentry from '@sentry/react';
import { Outlet, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
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
import { useAuth } from '@/lib/auth';
import { useSSE } from '@/hooks/use-sse';
import { getAvatarColor, getInitials } from '@/lib/avatar-color';

const navItems = [
  { icon: ChartBar, label: 'Inicio', path: '/portal', end: true, title: 'Inicio' },
  { icon: Package, label: 'Mis envíos', path: '/portal/envios', end: false, title: 'Mis envíos' },
  { icon: PlusCircle, label: 'Nuevo', path: '/portal/envios/nuevo', end: true, title: 'Nuevo envío' },
  { icon: UploadSimple, label: 'Importar', path: '/portal/importar', end: true, title: 'Importar paquetes' },
  { icon: Calculator, label: 'Cotizador', path: '/portal/cotizar', end: true, title: 'Cotizador' },
  { icon: Tag, label: 'Etiquetas', path: '/portal/etiquetas', end: true, title: 'Etiquetas' },
  { icon: Cube, label: 'Productos', path: '/portal/productos', end: true, title: 'Mis productos' },
];

function getTitleForPath(pathname: string): string {
  // More specific first
  if (pathname.startsWith('/portal/envios/nuevo')) return 'Nuevo envío';
  if (pathname.startsWith('/portal/envios')) return 'Mis envíos';
  if (pathname.startsWith('/portal/importar')) return 'Importar paquetes';
  if (pathname.startsWith('/portal/cotizar')) return 'Cotizador';
  if (pathname.startsWith('/portal/etiquetas')) return 'Etiquetas';
  if (pathname.startsWith('/portal/productos')) return 'Mis productos';
  if (pathname.startsWith('/portal/cuenta')) return 'Mi cuenta';
  return 'Inicio';
}

export const ClienteLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const mainRef = useRef<HTMLElement>(null);
  const { user, loading, isAuthenticated, logout } = useAuth();
  const shouldReduceMotion = useReducedMotion();
  useSSE();

  // Dynamic document title: "Sección · GO EXPRESS"
  useEffect(() => {
    const section = getTitleForPath(location.pathname);
    document.title = `${section} · GO EXPRESS`;
  }, [location.pathname]);

  // Keep a lightweight localStorage cache of the cliente identity so the initial
  // skeleton shows the right name before the profile lands from /auth/me.
  useEffect(() => {
    if (user && user.rol === 'cliente') {
      try {
        localStorage.setItem('go_express_cliente', JSON.stringify({
          id: user.id,
          razonSocial: user.razonSocial || user.nombre,
          contactoNombre: user.nombre,
          email: user.email,
        }));
      } catch {
        // Storage quota / private mode, non-critical
      }
    }
  }, [user]);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      localStorage.removeItem('go_express_cliente');
      navigate('/portal/login', { replace: true });
    }
  };

  // Cached profile from a previous session, used for first-paint display only.
  // Source of truth is the AuthContext user; this merely prevents a skeleton flash.
  const cachedProfile = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const stored = localStorage.getItem('go_express_cliente');
    if (!stored) return null;
    try {
      return JSON.parse(stored) as { razonSocial?: string; email?: string };
    } catch {
      return null;
    }
  }, []);

  if (loading && !cachedProfile) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <div className="border-b border-border/50 bg-card/80">
          <div className="h-12 flex items-center justify-between px-6 max-w-[1400px] mx-auto w-full">
            <div className="flex items-center gap-2.5">
              <div className="h-5 w-5 bg-muted/40 rounded animate-pulse" />
              <div className="h-4 w-24 bg-muted/40 rounded animate-pulse" />
            </div>
            <div className="h-6 w-32 bg-muted/30 rounded animate-pulse" />
          </div>
          <div className="px-6 max-w-[1400px] mx-auto w-full">
            <div className="flex items-center gap-2 py-2">
              {[0, 1, 2, 3, 4].map(i => (
                <div key={i} className="h-6 w-20 bg-muted/30 rounded animate-pulse" />
              ))}
            </div>
          </div>
        </div>
        <div className="flex-1 p-6 lg:p-8 max-w-[1400px] mx-auto w-full">
          <div className="h-7 w-48 bg-muted/40 rounded animate-pulse mb-4" />
          <div className="h-4 w-80 bg-muted/30 rounded animate-pulse mb-8" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="h-24 bg-muted/20 rounded-lg animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!loading && !isAuthenticated) {
    Sentry.addBreadcrumb({
      category: 'auth',
      level: 'warning',
      message: 'ClienteLayout redirect to portal/login',
      data: { reason: 'not-authenticated', path: location.pathname },
    });
    return <Navigate to="/portal/login" state={{ from: location }} replace />;
  }

  if (!loading && user && user.rol !== 'cliente') {
    Sentry.addBreadcrumb({
      category: 'auth',
      level: 'info',
      message: 'ClienteLayout redirect to /admin',
      data: { reason: 'wrong-role', rol: user.rol, path: location.pathname },
    });
    return <Navigate to="/admin" state={{ from: location }} replace />;
  }

  const displayName = user?.razonSocial || user?.nombre || cachedProfile?.razonSocial || 'Cliente';
  const displayEmail = user?.email || cachedProfile?.email || '';
  const avatarTone = getAvatarColor(displayName);
  const pageTransition = shouldReduceMotion
    ? {
        initial: { opacity: 1, y: 0 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 1, y: 0 },
        transition: { duration: 0 },
      }
    : {
        initial: { opacity: 0, y: 3 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -2 },
        transition: { duration: 0.12, ease: [0.25, 0.46, 0.45, 0.94] as const },
      };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border/50 bg-card/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="h-12 flex items-center justify-between px-6 max-w-[1400px] mx-auto w-full">
          <div className="flex items-center gap-2.5">
            <img src="/isotipo.png" alt="Go Express" className="h-5 w-5" />
            <div className="flex items-baseline gap-2">
              <span className="font-display font-bold text-[12px] tracking-tight">GO EXPRESS</span>
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
                    <AvatarFallback className={cn(avatarTone.bg, avatarTone.text, 'text-[10px] font-bold')}>
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
                <DropdownMenuItem onClick={() => navigate('/portal/cuenta')}>
                  <GearSix size={16} weight="duotone" className="mr-2" />
                  Mi cuenta
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={handleLogout}>
                  <SignOut size={16} weight="duotone" className="mr-2" />
                  Cerrar sesión
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

      <main ref={mainRef} className="flex-1 overflow-y-auto scrollbar-thin relative">
        <AnimatePresence initial={false}>
          <motion.div
            key={location.pathname}
            {...pageTransition}
            className="p-6 lg:p-8 max-w-[1400px] mx-auto w-full"
          >
            <Suspense fallback={
              <div className="space-y-4 pt-4">
                <div className="h-7 w-48 bg-muted/40 rounded animate-pulse" />
                <div className="h-4 w-80 bg-muted/30 rounded animate-pulse" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} className="h-24 bg-muted/20 rounded-lg animate-pulse" />
                  ))}
                </div>
              </div>
            }>
              <Outlet />
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
};
