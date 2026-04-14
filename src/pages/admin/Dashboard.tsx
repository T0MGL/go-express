import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { estadoLabels, estadoColors } from '@/data/constants';
import { motion } from 'motion/react';
import { ArrowUpRight, Plus } from 'lucide-react';
import { Warning, CircleDashed, Truck, CheckCircle, ClockCountdown, Package } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { formatCurrency, formatDateSmart } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { CopyButton } from '@/components/ui/copy-button';
import { useAnimatedNumber } from '@/hooks/use-animated-number';
import { useDashboardStats } from '@/hooks/api/use-dashboard';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

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
  const enviosConProblema = apiStats?.problemasHoy ?? 0;
  const problemasAbiertos = apiStats?.problemasAbiertos ?? 0;
  const pendientesRecoleccion = apiStats?.pendientesRecoleccionHoy ?? 0;
  const enRutaSinActualizar = apiStats?.enRutaSinActualizar ?? 0;
  const hayUrgencias = problemasAbiertos + pendientesRecoleccion + enRutaSinActualizar > 0;
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
          <h1 className="page-header-title">Inicio</h1>
          <p className="page-header-subtitle capitalize">
            {new Date().toLocaleDateString('es-PY', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <Link to="/admin/envios/nuevo">
          <Button size="sm" className="gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            Nuevo envío
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
              Hay <strong>{enviosConProblema} envío{enviosConProblema > 1 ? 's' : ''}</strong> con problemas. Revisar ahora.
            </span>
            <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground ml-auto group-hover:text-foreground transition-colors" />
          </Link>
        </motion.div>
      )}

      {/* Atención inmediata: qué requiere intervención humana ahora mismo */}
      {hayUrgencias && (
        <motion.div variants={fadeUp} className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-[15px] font-semibold">Atención inmediata</h2>
            <p className="text-[11px] text-muted-foreground">Lo que toca resolver hoy</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <UrgencyCard
              count={problemasAbiertos}
              label="Con problema sin resolver"
              helper="Envíos marcados con incidencia"
              tone="destructive"
              icon={<Warning size={16} weight="duotone" />}
              to="/admin/envios?estado=problema"
            />
            <UrgencyCard
              count={pendientesRecoleccion}
              label="Pendientes de retirar hoy"
              helper="Creados hoy, sin recoger"
              tone="warning"
              icon={<Package size={16} weight="duotone" />}
              to="/admin/envios?estado=pendiente"
            />
            <UrgencyCard
              count={enRutaSinActualizar}
              label="En ruta sin actualizar"
              helper="Más de 48 h sin cambio de estado"
              tone="warning"
              icon={<ClockCountdown size={16} weight="duotone" />}
              to="/admin/envios?estado=en_transito"
            />
          </div>
        </motion.div>
      )}

      {/* Stats Grid */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Hero stat */}
        <div className="lg:col-span-5 stat-card">
          <div>
            <p className="stat-card-label">Envíos creados hoy</p>
            <p className="stat-card-value mt-2">{animEnviosHoy}</p>
          </div>
          <div className="mt-4 pt-4 border-t border-border/40 flex items-center gap-5 text-[13px]">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="status-dot bg-primary status-pulse" />
              {enTransito} en camino
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
            <p className="stat-card-label">En camino</p>
            <p className="stat-card-value mt-1">{animEnTransito}</p>
            <p className="text-[11px] text-muted-foreground mt-1.5">Envíos activos en ruta</p>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-success/6 flex items-center justify-center">
                <CheckCircle size={14} weight="duotone" className="text-success" />
              </div>
            </div>
            <p className="stat-card-label">Tasa de entrega</p>
            <p className="stat-card-value mt-1">{animTasa}%</p>
            <Progress value={tasaEntregaNum} className="mt-2 h-1" />
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-warning/6 flex items-center justify-center">
                <CircleDashed size={14} weight="duotone" className="text-warning" />
              </div>
            </div>
            <p className="stat-card-label">Pendiente de cobrar</p>
            <p className="stat-card-value mt-1 text-xl font-data">{formatCurrency(pendienteCobro)}</p>
            <p className="text-[11px] text-muted-foreground mt-1.5">Suma de envíos sin pagar</p>
          </div>
        </div>
      </motion.div>

      {/* Recent Shipments Table */}
      <motion.div variants={fadeUp} className="surface-card">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <h2 className="font-display text-[15px] font-semibold">Últimos envíos</h2>
            <p className="text-[12px] text-muted-foreground mt-0.5">Los más recientes cargados al sistema</p>
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
                <th className="pl-5">Seguimiento</th>
                <th>Cliente</th>
                <th>Destino</th>
                <th>Estado</th>
                <th>Creado</th>
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
                    <p className="text-[13px] font-medium text-foreground">Aún no hay envíos</p>
                    <p className="text-[12px] text-muted-foreground mt-1 mb-4">
                      Creá el primer envío para empezar a operar
                    </p>
                    <Link to="/admin/envios/nuevo">
                      <Button size="sm" className="gap-1.5">
                        <Plus className="w-3.5 h-3.5" />
                        Crear primer envío
                      </Button>
                    </Link>
                  </td>
                </tr>
              )}
              {recentEnvios.map((envio) => (
                <tr key={envio.id} className="group">
                  <td className="pl-5">
                    <CopyButton value={envio.trackingNumber} label="Copiar número de seguimiento">
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
                    {formatDateSmart(envio.fecha)}
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

interface UrgencyCardProps {
  count: number;
  label: string;
  helper: string;
  tone: 'destructive' | 'warning';
  icon: ReactNode;
  to: string;
}

function UrgencyCard({ count, label, helper, tone, icon, to }: UrgencyCardProps) {
  const inactive = count === 0;
  return (
    <Link
      to={to}
      className={cn(
        'group relative flex items-start gap-3 rounded-xl border px-4 py-3 transition-colors',
        tone === 'destructive' && !inactive && 'border-destructive/20 bg-destructive/5 hover:bg-destructive/8',
        tone === 'warning' && !inactive && 'border-warning/25 bg-warning/5 hover:bg-warning/8',
        inactive && 'border-border/50 bg-muted/20 hover:bg-muted/40',
      )}
    >
      <div
        className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
          tone === 'destructive' && !inactive && 'bg-destructive/12 text-destructive',
          tone === 'warning' && !inactive && 'bg-warning/15 text-warning',
          inactive && 'bg-muted text-muted-foreground/60',
        )}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[22px] font-semibold leading-none tabular-nums">{count}</p>
        <p className="text-[12px] font-medium text-foreground mt-1.5">{label}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{helper}</p>
      </div>
      <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
    </Link>
  );
}

export default Dashboard;
