import { useRef, useEffect, Suspense } from 'react';
import { Outlet, useLocation, Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { CommandPalette } from '@/components/admin/CommandPalette';
import { useScrollShadow } from '@/hooks/use-scroll-shadow';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

const pageTransition = {
  initial: { opacity: 0, y: 3 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -2 },
  transition: { duration: 0.12, ease: [0.25, 0.46, 0.45, 0.94] as const },
};

export const AdminLayout = () => {
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const scrolled = useScrollShadow(mainRef);
  const { isAuthenticated, loading } = useAuth();

  // Scroll to top on route change
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);

  // Show loading state while checking auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return (
    <div className="min-h-screen flex bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header scrolled={scrolled} />
        <main ref={mainRef} className={cn('flex-1 overflow-y-auto scrollbar-thin relative')}>
          <AnimatePresence initial={false}>
            <motion.div
              key={location.pathname}
              {...pageTransition}
              className="p-6 lg:p-8 max-w-[1400px]"
            >
              <Breadcrumbs />
              <Suspense fallback={<div className="h-[60vh] bg-background" />}>
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
