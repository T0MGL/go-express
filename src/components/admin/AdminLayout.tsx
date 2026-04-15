import { useRef, useEffect, useState, Suspense } from 'react';
import * as Sentry from '@sentry/react';
import { Outlet, useLocation, Navigate } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Header } from './Header';
import { Sidebar, MobileSidebar } from './Sidebar';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { CommandPalette } from '@/components/admin/CommandPalette';
import { useScrollShadow } from '@/hooks/use-scroll-shadow';
import { useSSE } from '@/hooks/use-sse';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

function getAdminTitleForPath(pathname: string): string {
  if (pathname.startsWith('/admin/envios/nuevo')) return 'Nuevo envío';
  if (pathname.match(/\/admin\/envios\/[^/]+$/)) return 'Detalle de envío';
  if (pathname.startsWith('/admin/envios')) return 'Envíos';
  if (pathname.startsWith('/admin/warehouse')) return 'Warehouse';
  if (pathname.startsWith('/admin/clientes')) return 'Clientes';
  if (pathname.startsWith('/admin/repartidores')) return 'Repartidores';
  if (pathname.startsWith('/admin/pagos')) return 'Pagos';
  if (pathname.startsWith('/admin/tarifas')) return 'Tarifas';
  if (pathname.startsWith('/admin/auditoria')) return 'Auditoría';
  if (pathname.startsWith('/admin/configuracion')) return 'Configuración';
  return 'Inicio';
}

export const AdminLayout = () => {
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const scrolled = useScrollShadow(mainRef);
  const { isAuthenticated, loading, user } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  useSSE();

  // Close mobile nav on route change
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  // Scroll to top on route change
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);

  // Dynamic document title for admin routes
  useEffect(() => {
    const section = getAdminTitleForPath(location.pathname);
    document.title = `${section} · GO EXPRESS Admin`;
  }, [location.pathname]);

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

  // Show skeleton layout while checking auth (faster perceived load)
  if (loading) {
    return (
      <div className="min-h-screen flex bg-background">
        <div className="hidden lg:flex w-[240px] flex-col border-r border-border/40 bg-muted/20">
          <div className="p-4">
            <div className="h-8 w-28 bg-muted/40 rounded animate-pulse" />
          </div>
          <div className="px-3 space-y-1 mt-4">
            {[0, 1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-8 bg-muted/30 rounded animate-pulse" />
            ))}
          </div>
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          <div className="h-14 border-b border-border/40 bg-muted/10 animate-pulse" />
          <div className="flex-1 p-6 lg:p-8 max-w-[1400px]">
            <div className="h-6 w-48 bg-muted/40 rounded animate-pulse mb-4" />
            <div className="h-4 w-96 bg-muted/30 rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    Sentry.addBreadcrumb({
      category: 'auth',
      level: 'warning',
      message: 'AdminLayout redirect to /login',
      data: { reason: 'not-authenticated', path: location.pathname },
    });
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Cliente users logged in via portal should not access admin UI
  if (user && user.rol !== 'admin' && user.rol !== 'operador') {
    Sentry.addBreadcrumb({
      category: 'auth',
      level: 'info',
      message: 'AdminLayout redirect to /cliente',
      data: { reason: 'wrong-role', rol: user.rol, path: location.pathname },
    });
    return <Navigate to="/cliente" state={{ from: location }} replace />;
  }

  return (
    <div className="min-h-screen flex bg-background">
      <Sidebar />
      <MobileSidebar open={mobileNavOpen} onOpenChange={setMobileNavOpen} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header scrolled={scrolled} onMenuClick={() => setMobileNavOpen(true)} />
        <main ref={mainRef} className={cn('flex-1 overflow-y-auto scrollbar-thin relative')}>
          <AnimatePresence initial={false}>
            <motion.div
              key={location.pathname}
              {...pageTransition}
              className="p-6 lg:p-8 max-w-[1400px]"
            >
              <Breadcrumbs />
              <Suspense fallback={
                <div className="space-y-4 pt-4">
                  <div className="h-7 w-48 bg-muted/40 rounded animate-pulse" />
                  <div className="h-4 w-80 bg-muted/30 rounded animate-pulse" />
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
                    {[0, 1, 2].map(i => (
                      <div key={i} className="h-28 bg-muted/20 rounded-lg animate-pulse" />
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
      <CommandPalette />
    </div>
  );
};
