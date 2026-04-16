import { useEffect } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { SignOut, Truck } from '@phosphor-icons/react';

export function RepartidorLayout() {
  const { user, session, loading, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = 'GO EXPRESS · Mis entregas';
  }, []);

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/repartidor/login" state={{ from: location }} replace />;
  }

  if (user && user.rol !== 'repartidor') {
    return <Navigate to="/admin" replace />;
  }

  const cached = (() => {
    try {
      const raw = localStorage.getItem('go_express_repartidor');
      if (!raw) return null;
      return JSON.parse(raw) as { id: string; nombre: string; vehiculo: string };
    } catch {
      return null;
    }
  })();

  const nombre = user?.nombre ?? cached?.nombre ?? 'Repartidor';
  const vehiculo = user?.vehiculo ?? cached?.vehiculo ?? '';

  async function handleLogout() {
    localStorage.removeItem('go_express_repartidor');
    await logout();
    navigate('/repartidor/login', { replace: true });
  }

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="max-w-screen-sm mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck size={20} weight="duotone" className="text-primary" />
            <div className="leading-tight">
              <div className="text-[13px] font-semibold">{nombre}</div>
              {vehiculo && <div className="text-[11px] text-muted-foreground">{vehiculo}</div>}
            </div>
          </div>
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={handleLogout}>
            <SignOut size={16} weight="bold" />
            <span className="text-xs">Salir</span>
          </Button>
        </div>
      </header>

      <main className="flex-1 max-w-screen-sm w-full mx-auto px-3 sm:px-4 py-4">
        <Outlet />
      </main>

      <footer className="border-t py-3 text-center text-[11px] text-muted-foreground">
        GO EXPRESS · Portal Repartidor
      </footer>
    </div>
  );
}

export default RepartidorLayout;
