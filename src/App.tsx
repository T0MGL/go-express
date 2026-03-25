import { Suspense, lazy } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/lib/auth";
// Lazy-loaded route groups
const Landing = lazy(() => import("./pages/Landing"));
const Track = lazy(() => import("./pages/Track"));
const Login = lazy(() => import("./pages/Login"));
const AdminLayout = lazy(() => import("./components/admin/AdminLayout").then(m => ({ default: m.AdminLayout })));
const Dashboard = lazy(() => import("./pages/admin/Dashboard"));
const EnviosList = lazy(() => import("./pages/admin/EnviosList"));
const EnvioNew = lazy(() => import("./pages/admin/EnvioNew"));
const EnvioDetail = lazy(() => import("./pages/admin/EnvioDetail"));
const Clientes = lazy(() => import("./pages/admin/Clientes"));
const Repartidores = lazy(() => import("./pages/admin/Repartidores"));
const Configuracion = lazy(() => import("./pages/admin/Configuracion"));
const Pagos = lazy(() => import("./pages/admin/Pagos"));
const Warehouse = lazy(() => import("./pages/admin/Warehouse"));
const Tarifas = lazy(() => import("./pages/admin/Tarifas"));
const Auditoria = lazy(() => import("./pages/admin/Auditoria"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ClienteLayout = lazy(() => import("./components/cliente/ClienteLayout").then(m => ({ default: m.ClienteLayout })));
const ClienteDashboard = lazy(() => import("./pages/cliente/ClienteDashboard"));
const ClienteEnvios = lazy(() => import("./pages/cliente/ClienteEnvios"));
const ClienteNuevoPaquete = lazy(() => import("./pages/cliente/ClienteNuevoPaquete"));
const ClienteEtiquetas = lazy(() => import("./pages/cliente/ClienteEtiquetas"));
const ClienteCuenta = lazy(() => import("./pages/cliente/ClienteCuenta"));
const ClienteImportar = lazy(() => import("./pages/cliente/ClienteImportar"));
const ClienteCotizador = lazy(() => import("./pages/cliente/ClienteCotizador"));
const ClienteProductos = lazy(() => import("./pages/cliente/ClienteProductos"));
const PortalLogin = lazy(() => import("./pages/portal/PortalLogin"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 2,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 1,
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
                <Route path="/login" element={<Login />} />

                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<Dashboard />} />
                  <Route path="envios" element={<EnviosList />} />
                  <Route path="envios/nuevo" element={<EnvioNew />} />
                  <Route path="envios/:id" element={<EnvioDetail />} />
                  <Route path="warehouse" element={<Warehouse />} />
                  <Route path="clientes" element={<Clientes />} />
                  <Route path="repartidores" element={<Repartidores />} />
                  <Route path="pagos" element={<Pagos />} />
                  <Route path="tarifas" element={<Tarifas />} />
                  <Route path="auditoria" element={<Auditoria />} />
                  <Route path="configuracion" element={<Configuracion />} />
                </Route>

                <Route path="/portal/login" element={<PortalLogin />} />

                <Route path="/cliente" element={<ClienteLayout />}>
                  <Route index element={<ClienteDashboard />} />
                  <Route path="envios" element={<ClienteEnvios />} />
                  <Route path="envios/nuevo" element={<ClienteNuevoPaquete />} />
                  <Route path="importar" element={<ClienteImportar />} />
                  <Route path="cotizar" element={<ClienteCotizador />} />
                  <Route path="etiquetas" element={<ClienteEtiquetas />} />
                  <Route path="productos" element={<ClienteProductos />} />
                  <Route path="cuenta" element={<ClienteCuenta />} />
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
