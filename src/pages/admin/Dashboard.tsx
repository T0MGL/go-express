import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { estadoLabels, estadoColors } from '@/data/constants';
import { motion } from 'motion/react';
import {
  TrendingUp, ArrowUpRight, Plus,
} from 'lucide-react';
import { Warning, CircleDashed, Truck, CheckCircle } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { CopyButton } from '@/components/ui/copy-button';
import { useAnimatedNumber } from '@/hooks/use-animated-number';
import { useDashboardStats } from '@/hooks/api/use-dashboard';

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] as const } },
} as const;

const Dashboard = () => {
  // API data
  const { data: apiStats, isLoading } = useDashboardStats();

  const enviosHoy = apiStats?.enviosHoy ?? 0;
  const enTransito = apiStats?.enTransito ?? 0;
  const entregados = apiStats?.entregados ?? 0;
  const tasaEntregaNum = apiStats?.tasaEntrega ?? 0;
  const pendienteCobro = apiStats?.porCobrar ?? 0;
  const enviosPendientesCobro = apiStats?.enviosPendientesCobro ?? 0;
  const enviosConProblema = apiStats?.problemasHoy ?? 0;
  const recentEnvios = (apiStats?.enviosRecientes ?? []).map(e => ({
    ...e,
    clienteNombre: (e as Record<string, unknown>).clienteNombre as string ?? (e as Record<string, unknown>).cliente_nombre as string ?? '',
  }));

  // Animated counters
  const animEnviosHoy = useAnimatedNumber(enviosHoy);
  const animEnTransito = useAnimatedNumber(enTransito);
  const animTasa = useAnimatedNumber(Math.round(tasaEntregaNum));

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="page-header">
          <div>
            <div className="h-7 w-32 bg-muted/40 rounded animate-pulse" />
            <div className="h-4 w-64 bg-muted/30 rounded animate-pulse mt-2" />
          </div>
          <div className="h-9 w-32 bg-muted/40 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-5 stat-card">
            <div className="h-6 w-24 bg-muted/40 rounded animate-pulse" />
            <div className="h-10 w-16 bg-muted/40 rounded animate-pulse mt-3" />
            <div className="h-4 w-full bg-muted/30 rounded animate-pulse mt-6" />
          </div>
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[0, 1, 2].map(i => (
              <div key={i} className="stat-card">
                <div className="h-7 w-7 bg-muted/40 rounded-lg animate-pulse mb-3" />
                <div className="h-4 w-20 bg-muted/40 rounded animate-pulse" />
                <div className="h-8 w-12 bg-muted/40 rounded animate-pulse mt-2" />
              </div>
            ))}
          </div>
        </div>
        <div className="surface-card p-5">
          <div className="h-5 w-36 bg-muted/40 rounded animate-pulse mb-4" />
          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} className="h-10 bg-muted/20 rounded animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-6">
      {/* Page Header */}
      <motion.div variants={fadeUp} className="page-header">
        <div>
          <h1 className="page-header-title">Dashboard</h1>
          <p className="page-header-subtitle">
            Resumen de operaciones, {new Date().toLocaleDateString('es-PY', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <Link to="/admin/envios/nuevo">
          <Button size="sm" className="gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            Nuevo Envio
          </Button>
        </Link>
      </motion.div>

      {/* Alert */}
      {enviosConProblema > 0 && (
        <motion.div variants={fadeUp}>
          <Link
            to="/admin/envios?estado=problema"
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-destructive/4 border border-destructive/8 text-sm group hover:bg-destructive/6 transition-colors"
          >
            <Warning size={16} weight="fill" className="text-destructive flex-shrink-0" />
            <span className="text-foreground text-[13px]">
              <strong>{enviosConProblema} envio{enviosConProblema > 1 ? 's' : ''}</strong> con problemas requieren atencion
            </span>
            <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground ml-auto group-hover:text-foreground transition-colors" />
          </Link>
        </motion.div>
      )}

      {/* Stats Grid */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Hero stat */}
        <div className="lg:col-span-5 stat-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="stat-card-label">Envios Hoy</p>
              <p className="stat-card-value mt-2">{animEnviosHoy}</p>
            </div>
            {enviosHoy > 0 && (
              <div className="flex items-center gap-1 text-[11px] font-semibold text-primary bg-primary/6 px-2 py-0.5 rounded-md">
                <TrendingUp className="w-3 h-3" />
                hoy
              </div>
            )}
          </div>
          <div className="mt-4 pt-4 border-t border-border/40 flex items-center gap-5 text-[13px]">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="status-dot bg-primary status-pulse" />
              {enTransito} en transito
            </span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <CheckCircle size={14} weight="duotone" className="text-success" />
              {entregados} entregados
            </span>
          </div>
        </div>

        {/* Secondary stats */}
        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-primary/6 flex items-center justify-center">
                <Truck size={14} weight="duotone" className="text-primary" />
              </div>
            </div>
            <p className="stat-card-label">En Transito</p>
            <p className="stat-card-value mt-1">{animEnTransito}</p>
            <p className="text-[11px] text-muted-foreground mt-1.5">En ruta activa</p>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-success/6 flex items-center justify-center">
                <CheckCircle size={14} weight="duotone" className="text-success" />
              </div>
            </div>
            <p className="stat-card-label">Tasa Entrega</p>
            <p className="stat-card-value mt-1">{animTasa}%</p>
            <Progress value={tasaEntregaNum} className="mt-2 h-1" />
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-warning/6 flex items-center justify-center">
                <CircleDashed size={14} weight="duotone" className="text-warning" />
              </div>
            </div>
            <p className="stat-card-label">Por Cobrar</p>
            <p className="stat-card-value mt-1 text-xl font-data">{formatCurrency(pendienteCobro)}</p>
            <p className="text-[11px] text-muted-foreground mt-1.5">{enviosPendientesCobro} pendientes</p>
          </div>
        </div>
      </motion.div>

      {/* Recent Shipments Table */}
      <motion.div variants={fadeUp} className="surface-card">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <h2 className="font-display text-[15px] font-semibold">Envios Recientes</h2>
            <p className="text-[12px] text-muted-foreground mt-0.5">Ultimas operaciones registradas</p>
          </div>
          <Link to="/admin/envios">
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground hover:text-foreground">
              Ver todos
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="premium-table">
            <thead>
              <tr>
                <th className="pl-5">Tracking</th>
                <th>Cliente</th>
                <th>Destino</th>
                <th>Estado</th>
                <th>Fecha</th>
                <th className="w-10 pr-5"></th>
              </tr>
            </thead>
            <tbody>
              {recentEnvios.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-12">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                      <Truck size={18} weight="duotone" className="text-muted-foreground/50" />
                    </div>
                    <p className="text-[13px] font-medium text-foreground">Sin envios recientes</p>
                    <p className="text-[12px] text-muted-foreground mt-1">
                      Los envios del dia apareceran aqui
                    </p>
                  </td>
                </tr>
              )}
              {recentEnvios.map((envio) => (
                <tr key={envio.id} className="group">
                  <td className="pl-5">
                    <CopyButton value={envio.trackingNumber} label="Tracking">
                      <Link
                        to={`/admin/envios/${envio.id}`}
                        className="font-data font-medium text-primary hover:text-primary/80 transition-colors"
                      >
                        {envio.trackingNumber}
                      </Link>
                    </CopyButton>
                  </td>
                  <td className="text-[13px]">{envio.clienteNombre}</td>
                  <td className="text-[13px] text-muted-foreground">{envio.destino}</td>
                  <td>
                    <Badge variant={estadoColors[envio.estado]}>
                      {estadoLabels[envio.estado]}
                    </Badge>
                  </td>
                  <td className="text-[13px] text-muted-foreground">
                    {formatDate(envio.fecha)}
                  </td>
                  <td className="pr-5">
                    <Link to={`/admin/envios/${envio.id}`}>
                      <ArrowUpRight className="w-3.5 h-3.5 text-transparent group-hover:text-muted-foreground transition-colors" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default Dashboard;
