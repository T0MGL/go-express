import { Suspense, lazy, ComponentType } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/lib/auth";
import { AdminOnlyRoute } from "@/components/admin/AdminOnlyRoute";
import { toast } from "sonner";
import { ApiError, describeError } from "@/lib/api";

// Stale-deploy recovery: if a dynamic import fails (chunk hash no longer exists
// because a new deploy replaced the assets while the app was loaded), force a
// single full reload to fetch the fresh index.html + new chunks. The session
// flag prevents a reload loop if the failure is not deploy-related.
const RELOAD_KEY = 'ge:chunk-reload-at';
const RELOAD_WINDOW_MS = 10_000;

function lazyWithReload<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      const mod = await factory();
      sessionStorage.removeItem(RELOAD_KEY);
      return mod;
    } catch (err) {
      const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
      const recentlyReloaded = last && Date.now() - last < RELOAD_WINDOW_MS;
      if (!recentlyReloaded) {
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
        window.location.reload();
        // Never resolve: Suspense keeps the fallback until the page reloads.
        return new Promise<{ default: T }>(() => {});
      }
      throw err;
    }
  });
}

// Lazy-loaded route groups
const Landing = lazyWithReload(() => import("./pages/Landing"));
const Track = lazyWithReload(() => import("./pages/Track"));
const Login = lazyWithReload(() => import("./pages/Login"));
const AdminLayout = lazyWithReload(() => import("./components/admin/AdminLayout").then(m => ({ default: m.AdminLayout })));
const Dashboard = lazyWithReload(() => import("./pages/admin/Dashboard"));
const EnviosList = lazyWithReload(() => import("./pages/admin/EnviosList"));
const EnvioNew = lazyWithReload(() => import("./pages/admin/EnvioNew"));
const EnvioDetail = lazyWithReload(() => import("./pages/admin/EnvioDetail"));
const Clientes = lazyWithReload(() => import("./pages/admin/Clientes"));
const Repartidores = lazyWithReload(() => import("./pages/admin/Repartidores"));
const Configuracion = lazyWithReload(() => import("./pages/admin/Configuracion"));
const Pagos = lazyWithReload(() => import("./pages/admin/Pagos"));
const Warehouse = lazyWithReload(() => import("./pages/admin/Warehouse"));
const Tarifas = lazyWithReload(() => import("./pages/admin/Tarifas"));
const Auditoria = lazyWithReload(() => import("./pages/admin/Auditoria"));
const NotFound = lazyWithReload(() => import("./pages/NotFound"));
const ClienteLayout = lazyWithReload(() => import("./components/cliente/ClienteLayout").then(m => ({ default: m.ClienteLayout })));
const ClienteDashboard = lazyWithReload(() => import("./pages/cliente/ClienteDashboard"));
const ClienteEnvios = lazyWithReload(() => import("./pages/cliente/ClienteEnvios"));
const ClienteNuevoPaquete = lazyWithReload(() => import("./pages/cliente/ClienteNuevoPaquete"));
const ClienteEtiquetas = lazyWithReload(() => import("./pages/cliente/ClienteEtiquetas"));
const ClienteCuenta = lazyWithReload(() => import("./pages/cliente/ClienteCuenta"));
const ClienteImportar = lazyWithReload(() => import("./pages/cliente/ClienteImportar"));
const ClienteCotizador = lazyWithReload(() => import("./pages/cliente/ClienteCotizador"));
const ClienteProductos = lazyWithReload(() => import("./pages/cliente/ClienteProductos"));
const ClienteApi = lazyWithReload(() => import("./pages/cliente/ClienteApi"));
const PortalLogin = lazyWithReload(() => import("./pages/portal/PortalLogin"));
const RepartidorLogin = lazyWithReload(() => import("./pages/repartidor/RepartidorLogin"));
const RepartidorLayout = lazyWithReload(() => import("./pages/repartidor/RepartidorLayout").then(m => ({ default: m.RepartidorLayout })));
const RepartidorDashboard = lazyWithReload(() => import("./pages/repartidor/RepartidorDashboard"));
const RepartidorEnvioDetail = lazyWithReload(() => import("./pages/repartidor/RepartidorEnvioDetail"));
const ReporteCOD = lazyWithReload(() => import("./pages/admin/ReporteCOD"));
const Liquidaciones = lazyWithReload(() => import("./pages/admin/Liquidaciones"));
const LiquidacionDetalle = lazyWithReload(() => import("./pages/admin/LiquidacionDetalle"));
const ResetPasswordCliente = lazyWithReload(() => import("./pages/auth/ResetPasswordCliente"));
const ResetPasswordRepartidor = lazyWithReload(() => import("./pages/auth/ResetPasswordRepartidor"));
const ResetPasswordAdmin = lazyWithReload(() => import("./pages/auth/ResetPasswordAdmin"));

function shouldSuppressQueryError(error: unknown, queryKey: readonly unknown[]): boolean {
  // El rastreo publico resuelve cada fallo en pantalla, con copy para el comprador
  // y boton de reintento. El toast global encima le daba dos versiones distintas
  // del mismo problema, que es como una caida nuestra terminaba leyendose como
  // "perdimos tu paquete".
  if (queryKey[0] === 'tracking') return true;
  // 401 on initial session bootstrap is expected before the auth layer resolves;
  // surfacing it as a toast would confuse the operator on every page reload.
  if (error instanceof ApiError) {
    if (error.status === 401) return true;
    if (error.status === 404) return true;
  }
  return false;
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (shouldSuppressQueryError(error, query.queryKey)) return;
      toast.error(describeError(error));
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      // A mutation that wires its own onError handles the message itself
      // (PaymentModal, ProblemaModal etc). We only fire the default when no
      // handler is wired, otherwise the operator sees two toasts.
      if (mutation.options.onError) return;
      toast.error(describeError(error));
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
          return false;
        }
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
          return false;
        }
        return failureCount < 1;
      },
    },
  },
});

const RouteLoading = () => (
  <div className="min-h-screen bg-background">
    <div className="h-16 bg-muted/40 animate-pulse" />
    <div className="max-w-5xl mx-auto px-4 pt-12 space-y-4">
      <div className="h-8 w-1/3 bg-muted/40 rounded animate-pulse" />
      <div className="h-4 w-2/3 bg-muted/30 rounded animate-pulse" />
      <div className="h-4 w-1/2 bg-muted/30 rounded animate-pulse" />
    </div>
  </div>
);

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Suspense fallback={<RouteLoading />}>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/track" element={<Track />} />

                {/* Backward compat: old /login bookmark redirects to /admin/login */}
                <Route path="/login" element={<Navigate to="/admin/login" replace />} />
                <Route path="/admin/login" element={<Login />} />
                <Route path="/admin/reset-password" element={<ResetPasswordAdmin />} />

                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<Dashboard />} />
                  <Route path="envios" element={<EnviosList />} />
                  <Route path="envios/nuevo" element={<EnvioNew />} />
                  <Route path="envios/:id" element={<EnvioDetail />} />
                  <Route path="warehouse" element={<Warehouse />} />
                  <Route path="clientes" element={<AdminOnlyRoute><Clientes /></AdminOnlyRoute>} />
                  <Route path="repartidores" element={<Repartidores />} />
                  <Route path="reporte-cod" element={<ReporteCOD />} />
                  <Route path="conciliacion" element={<Navigate to="/admin/reporte-cod" replace />} />
                  <Route path="liquidaciones" element={<Liquidaciones />} />
                  <Route path="liquidaciones/:id" element={<LiquidacionDetalle />} />
                  <Route path="pagos" element={<Pagos />} />
                  <Route path="tarifas" element={<AdminOnlyRoute><Tarifas /></AdminOnlyRoute>} />
                  <Route path="auditoria" element={<Auditoria />} />
                  <Route path="configuracion" element={<Configuracion />} />
                </Route>

                <Route path="/portal/login" element={<PortalLogin />} />
                <Route path="/portal/reset-password" element={<ResetPasswordCliente />} />

                <Route path="/portal" element={<ClienteLayout />}>
                  <Route index element={<ClienteDashboard />} />
                  <Route path="envios" element={<ClienteEnvios />} />
                  <Route path="envios/nuevo" element={<ClienteNuevoPaquete />} />
                  <Route path="importar" element={<ClienteImportar />} />
                  <Route path="cotizar" element={<ClienteCotizador />} />
                  <Route path="etiquetas" element={<ClienteEtiquetas />} />
                  <Route path="productos" element={<ClienteProductos />} />
                  <Route path="api" element={<ClienteApi />} />
                  <Route path="cuenta" element={<ClienteCuenta />} />
                </Route>

                {/* Backward compat: existing /cliente bookmarks redirect to /portal */}
                <Route path="/cliente" element={<Navigate to="/portal" replace />} />
                <Route path="/cliente/*" element={<Navigate to="/portal" replace />} />

                <Route path="/repartidor/login" element={<RepartidorLogin />} />
                <Route path="/repartidor/reset-password" element={<ResetPasswordRepartidor />} />
                <Route path="/repartidor" element={<RepartidorLayout />}>
                  <Route index element={<RepartidorDashboard />} />
                  <Route path="envio/:id" element={<RepartidorEnvioDetail />} />
                </Route>

                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
