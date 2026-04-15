import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { motion } from 'motion/react';
import {
  Truck, CheckCircle, Warning, Clock,
  PlusCircle, UploadSimple, Calculator, Tag, ArrowRight, ArrowUpRight,
} from '@phosphor-icons/react';
import { estadoLabels } from '@/data/constants';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { formatDateSmart } from '@/lib/utils';
import { useClienteDashboardStats } from '@/hooks/api/use-cliente-dashboard';
import { useCuenta } from '@/hooks/api/use-cuenta';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Timeline } from '@/components/tracking/Timeline';
import { Barcode } from '@phosphor-icons/react';
import { printShippingLabel } from '@/components/printing/generateShippingLabel';
import { useClienteEnvio } from '@/hooks/api/use-cliente-envios';
import { useAnimatedNumber } from '@/hooks/use-animated-number';
import { cn } from '@/lib/utils';

const estadoBadge: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' }> = {
  pendiente: { label: 'Pendiente', variant: 'secondary' },
  recolectado: { label: 'Retirado', variant: 'outline' },
  en_transito: { label: 'En tránsito', variant: 'default' },
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

const rowStagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.03, delayChildren: 0.05 } },
} as const;

const rowFade = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] as const } },
} as const;

const quickActions = [
  { icon: PlusCircle, label: 'Nuevo envío', desc: 'Registrar un paquete', path: '/cliente/envios/nuevo' },
  { icon: UploadSimple, label: 'Importar', desc: 'Varios pedidos con CSV', path: '/cliente/importar' },
  { icon: Calculator, label: 'Cotizador', desc: 'Calcular el costo antes', path: '/cliente/cotizar' },
  { icon: Tag, label: 'Etiquetas', desc: 'Organizar los paquetes', path: '/cliente/etiquetas' },
];

const defaultStats = { activos: 0, entregados: 0, pendientes: 0, problemas: 0 };

const ClienteDashboard = () => {
  const { data: apiStats, isLoading } = useClienteDashboardStats();
  const { data: cuenta } = useCuenta();
  const [selectedEnvioId, setSelectedEnvioId] = useState<string | null>(null);
  const { data: selectedEnvio } = useClienteEnvio(selectedEnvioId ?? '');

  const dashStats = apiStats ?? defaultStats;
  const clienteEnvios = apiStats?.enviosRecientes ?? [];

  const animActivos = useAnimatedNumber(dashStats.activos);
  const animEntregados = useAnimatedNumber(dashStats.entregados);
  const animPendientes = useAnimatedNumber(dashStats.pendientes);
  const animProblemas = useAnimatedNumber(dashStats.problemas);

  const stats = [
    { label: 'Activos', value: animActivos, icon: Truck, color: 'text-primary', bg: 'bg-primary/6' },
    { label: 'Entregados', value: animEntregados, icon: CheckCircle, color: 'text-success', bg: 'bg-success/6' },
    { label: 'Pendientes', value: animPendientes, icon: Clock, color: 'text-warning', bg: 'bg-warning/6' },
    { label: 'Problemas', value: animProblemas, icon: Warning, color: 'text-destructive', bg: 'bg-destructive/6' },
  ];

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-6">
      {/* Header */}
      <motion.div variants={fadeUp} className="page-header">
        <div>
          <h1 className="page-header-title">
            {cuenta?.razonSocial ? `Hola, ${cuenta.razonSocial}` : 'Hola'}
          </h1>
          <p className="page-header-subtitle">
            Así vienen los envíos de tu cuenta hoy
          </p>
        </div>
        <Link to="/cliente/envios/nuevo">
          <Button size="sm" className="gap-1.5">
            <PlusCircle size={14} weight="bold" />
            Nuevo envío
          </Button>
        </Link>
      </motion.div>

      {/* Stats */}
      <motion.div variants={fadeUp} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          <>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="stat-card">
                <div className="h-7 w-7 bg-muted/40 rounded-lg animate-pulse mb-3" />
                <div className="h-3 w-16 bg-muted/30 rounded animate-pulse" />
                <div className="h-6 w-10 bg-muted/40 rounded animate-pulse mt-2" />
              </div>
            ))}
          </>
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
        <p className="section-label mb-2.5">Acciones rápidas</p>
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
          <div>
            <h2 className="font-display text-[15px] font-semibold">Últimos envíos</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">Los más recientes de tu cuenta</p>
          </div>
          <Link to="/cliente/envios">
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground hover:text-foreground">
              Ver todos
              <ArrowRight size={14} weight="bold" />
            </Button>
          </Link>
        </div>

        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 py-2">
                <div className="h-4 w-28 bg-muted/40 rounded animate-pulse" />
                <div className="h-4 w-24 bg-muted/30 rounded animate-pulse" />
                <div className="h-4 w-24 bg-muted/30 rounded animate-pulse" />
                <div className="h-5 w-16 bg-muted/40 rounded-full animate-pulse" />
                <div className="h-4 w-20 bg-muted/30 rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="premium-table">
              <thead>
                <tr>
                  <th className="pl-5">Seguimiento</th>
                  <th>Destino</th>
                  <th>Destinatario</th>
                  <th>Estado</th>
                  <th>Creado</th>
                  <th className="w-10 pr-5"></th>
                </tr>
              </thead>
              <motion.tbody variants={rowStagger} initial="hidden" animate="show">
                {clienteEnvios.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-12">
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
                          <Truck size={16} weight="duotone" className="text-muted-foreground/50" />
                        </div>
                        <p className="text-[13px] font-medium">Todavía no hay envíos</p>
                        <p className="text-[12px] text-muted-foreground max-w-[18rem]">
                          Creá tu primer envío y te va a aparecer acá con el estado en tiempo real.
                        </p>
                        <Link to="/cliente/envios/nuevo" className="mt-2">
                          <Button size="sm" className="gap-1.5">
                            <PlusCircle size={14} weight="bold" />
                            Crear mi primer envío
                          </Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                )}
                {clienteEnvios.map((envio) => {
                  const badge = estadoBadge[envio.estado] || { label: estadoLabels[envio.estado], variant: 'secondary' as const };
                  const isProblema = envio.estado === 'problema';
                  return (
                    <motion.tr
                      key={envio.id}
                      variants={rowFade}
                      className="group cursor-pointer"
                      onClick={() => setSelectedEnvioId(envio.id)}
                    >
                      <td className="pl-5 font-data font-medium text-primary">{envio.trackingNumber}</td>
                      <td className="text-[13px] text-muted-foreground">{envio.destino}</td>
                      <td className="text-[13px]">{envio.destinatarioNombre}</td>
                      <td>
                        <Badge variant={badge.variant} className={cn(isProblema && 'badge-pulse')}>
                          {badge.label}
                        </Badge>
                      </td>
                      <td className="text-[13px] text-muted-foreground">{formatDateSmart(envio.fecha)}</td>
                      <td className="pr-5">
                        <ArrowUpRight size={14} weight="bold" className="text-transparent group-hover:text-muted-foreground transition-colors" />
                      </td>
                    </motion.tr>
                  );
                })}
              </motion.tbody>
            </table>
          </div>
        )}
      </motion.div>
      <Dialog open={!!selectedEnvioId} onOpenChange={() => setSelectedEnvioId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-data text-sm">{selectedEnvio?.trackingNumber}</DialogTitle>
          </DialogHeader>
          {selectedEnvio && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-0.5">Destino</p>
                  <p className="text-[13px] font-medium">{selectedEnvio.destino}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-0.5">Destinatario</p>
                  <p className="text-[13px] font-medium">{selectedEnvio.destinatarioNombre}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-0.5">Fecha</p>
                  <p className="text-[13px] font-medium">{formatDateSmart(selectedEnvio.fecha)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-0.5">Estado</p>
                  <Badge
                    variant={estadoBadge[selectedEnvio.estado]?.variant || 'secondary'}
                    className={cn(selectedEnvio.estado === 'problema' && 'badge-pulse')}
                  >
                    {estadoLabels[selectedEnvio.estado]}
                  </Badge>
                </div>
              </div>
              {selectedEnvio.eventos && selectedEnvio.eventos.length > 0 && (
                <div>
                  <p className="text-[13px] font-semibold mb-3">Historial de seguimiento</p>
                  <Timeline eventos={selectedEnvio.eventos} />
                </div>
              )}
              <Button
                variant="secondary"
                size="sm"
                className="w-full gap-1.5"
                onClick={() => {
                  const success = printShippingLabel(selectedEnvio);
                  if (success) {
                    toast.success('Etiqueta generada');
                  } else {
                    toast.error('Error al generar etiqueta');
                  }
                }}
              >
                <Barcode size={14} weight="duotone" />
                Imprimir etiqueta
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export default ClienteDashboard;
