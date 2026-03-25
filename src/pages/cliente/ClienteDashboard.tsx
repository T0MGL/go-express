import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { motion } from 'motion/react';
import {
  Truck, CheckCircle, Warning, Clock,
  PlusCircle, UploadSimple, Calculator, Tag, ArrowRight, ArrowUpRight,
  CircleNotch,
} from '@phosphor-icons/react';
import { estadoLabels } from '@/data/constants';
import { Link } from 'react-router-dom';
import { formatDate } from '@/lib/utils';
import { useClienteDashboardStats } from '@/hooks/api/use-cliente-dashboard';
import { useCuenta } from '@/hooks/api/use-cuenta';

const estadoBadge: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' }> = {
  pendiente: { label: 'Pendiente', variant: 'secondary' },
  recolectado: { label: 'Recolectado', variant: 'outline' },
  en_transito: { label: 'En Transito', variant: 'default' },
  en_reparto: { label: 'En Reparto', variant: 'warning' },
  entregado: { label: 'Entregado', variant: 'success' },
  fallido: { label: 'Fallido', variant: 'destructive' },
  problema: { label: 'Problema', variant: 'destructive' },
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] as const } },
} as const;

const quickActions = [
  { icon: PlusCircle, label: 'Nuevo Envio', desc: 'Registrar paquete', path: '/cliente/envios/nuevo' },
  { icon: UploadSimple, label: 'Importar', desc: 'Carga masiva CSV', path: '/cliente/importar' },
  { icon: Calculator, label: 'Cotizador', desc: 'Calcular costos', path: '/cliente/cotizar' },
  { icon: Tag, label: 'Etiquetas', desc: 'Descargar e imprimir', path: '/cliente/etiquetas' },
];

const defaultStats = { activos: 0, entregados: 0, pendientes: 0, problemas: 0 };

const ClienteDashboard = () => {
  const { data: apiStats, isLoading } = useClienteDashboardStats();
  const { data: cuenta } = useCuenta();

  const dashStats = apiStats ?? defaultStats;
  const clienteEnvios = apiStats?.enviosRecientes ?? [];

  const stats = [
    { label: 'Activos', value: dashStats.activos, icon: Truck, color: 'text-primary', bg: 'bg-primary/6' },
    { label: 'Entregados', value: dashStats.entregados, icon: CheckCircle, color: 'text-success', bg: 'bg-success/6' },
    { label: 'Pendientes', value: dashStats.pendientes, icon: Clock, color: 'text-warning', bg: 'bg-warning/6' },
    { label: 'Problemas', value: dashStats.problemas, icon: Warning, color: 'text-destructive', bg: 'bg-destructive/6' },
  ];

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-6">
      {/* Header */}
      <motion.div variants={fadeUp} className="page-header">
        <div>
          <h1 className="page-header-title">Bienvenido</h1>
          <p className="page-header-subtitle">
            {cuenta?.razonSocial && (
              <span className="font-medium text-foreground">{cuenta.razonSocial} · </span>
            )}
            Resumen de operaciones
          </p>
        </div>
        <Link to="/cliente/envios/nuevo">
          <Button size="sm" className="gap-1.5">
            <PlusCircle size={14} weight="bold" />
            Nuevo Envio
          </Button>
        </Link>
      </motion.div>

      {/* Stats */}
      <motion.div variants={fadeUp} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          <div className="col-span-full flex items-center justify-center py-8">
            <CircleNotch size={20} weight="bold" className="animate-spin text-muted-foreground" />
          </div>
        ) : (
          stats.map((stat) => (
            <div key={stat.label} className="stat-card">
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-7 h-7 rounded-lg ${stat.bg} flex items-center justify-center`}>
                  <stat.icon size={14} weight="duotone" className={stat.color} />
                </div>
              </div>
              <p className="stat-card-label">{stat.label}</p>
              <p className="stat-card-value mt-1">{stat.value}</p>
            </div>
          ))
        )}
      </motion.div>

      {/* Quick Actions */}
      <motion.div variants={fadeUp}>
        <p className="section-label mb-2.5">Acciones rapidas</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {quickActions.map((action) => (
            <Link key={action.path} to={action.path}>
              <div className="surface-card-interactive p-4 group">
                <action.icon size={20} weight="duotone" className="text-muted-foreground/50 group-hover:text-primary transition-colors mb-3" />
                <p className="text-[13px] font-semibold">{action.label}</p>
                <p className="text-[12px] text-muted-foreground mt-0.5">{action.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </motion.div>

      {/* Recent Shipments */}
      <motion.div variants={fadeUp} className="surface-card">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="font-display text-[15px] font-semibold">Ultimos Envios</h2>
          <Link to="/cliente/envios">
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground hover:text-foreground">
              Ver todos
              <ArrowRight size={14} weight="bold" />
            </Button>
          </Link>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <CircleNotch size={20} weight="bold" className="animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="premium-table">
              <thead>
                <tr>
                  <th className="pl-5">Tracking</th>
                  <th>Destino</th>
                  <th>Destinatario</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                  <th className="w-10 pr-5"></th>
                </tr>
              </thead>
              <tbody>
                {clienteEnvios.map((envio) => {
                  const badge = estadoBadge[envio.estado] || { label: estadoLabels[envio.estado], variant: 'secondary' as const };
                  return (
                    <tr key={envio.id} className="group">
                      <td className="pl-5 font-data font-medium text-primary">{envio.trackingNumber}</td>
                      <td className="text-[13px] text-muted-foreground">{envio.destino}</td>
                      <td className="text-[13px]">{envio.destinatarioNombre}</td>
                      <td>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </td>
                      <td className="text-[13px] text-muted-foreground">{formatDate(envio.fecha)}</td>
                      <td className="pr-5">
                        <Link to={`/cliente/envios`}>
                          <ArrowUpRight size={14} weight="bold" className="text-transparent group-hover:text-muted-foreground transition-colors" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

export default ClienteDashboard;
