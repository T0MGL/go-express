import { useParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Timeline } from '@/components/tracking/Timeline';
import { PaymentModal } from '@/components/admin/PaymentModal';
import { ProblemaModal } from '@/components/admin/ProblemaModal';
import { NotasInternas } from '@/components/admin/NotasInternas';
import { mockEnvios, mockRepartidores, estadoLabels, estadoColors, estadosPagoColors, metodosPagoLabels } from '@/data/mockData';
import { printShippingLabel } from '@/components/printing/generateShippingLabel';
import {
  CaretLeft,
  PencilSimple,
  Barcode,
  ArrowsClockwise,
  CheckCircle,
  Warning,
  UserCheck,
  Phone,
  MapPin,
  UserCircle,
} from '@phosphor-icons/react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  useEnvio,
  useUpdateEnvioEstado,
  useAsignarRepartidor,
  useReportarProblema,
  useAgregarNota,
} from '@/hooks/api/use-envios';
import { useRepartidores } from '@/hooks/api/use-repartidores';
import { useCreatePago } from '@/hooks/api/use-pagos';

const EnvioDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isProblemaModalOpen, setIsProblemaModalOpen] = useState(false);
  const [showRepartidorModal, setShowRepartidorModal] = useState(false);

  const useMock = false;

  // API hooks
  const { data: apiEnvio, isLoading } = useEnvio(id);
  const { data: apiRepartidores } = useRepartidores();
  const updateEstadoMut = useUpdateEnvioEstado();
  const asignarRepMut = useAsignarRepartidor();
  const reportarProbMut = useReportarProblema();
  const agregarNotaMut = useAgregarNota();
  void useCreatePago();

  // Resolve data
  const envio = useMock ? mockEnvios.find((e) => e.id === id) : apiEnvio;
  const repartidoresList = useMock
    ? mockRepartidores
    : (apiRepartidores?.data ?? []);

  const repartidor = envio?.repartidorId
    ? repartidoresList.find(r => r.id === envio.repartidorId)
    : null;

  const getInitials = (nombre: string) => {
    return nombre
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  // Loading state (API mode only)
  if (!useMock && isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!envio) {
    return (
      <div className="max-w-md mx-auto">
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/envios')} className="gap-1.5 mb-8">
          <CaretLeft size={14} weight="duotone" />
          Volver a envios
        </Button>
        <div className="surface-card p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <Warning size={20} weight="duotone" className="text-muted-foreground/50" />
          </div>
          <h3 className="text-[15px] font-semibold mb-1">Envio no encontrado</h3>
          <p className="text-[13px] text-muted-foreground mb-4">
            El envio que buscas no existe o fue eliminado del sistema.
          </p>
          <Button size="sm" onClick={() => navigate('/admin/envios')}>
            Ver todos los envios
          </Button>
        </div>
      </div>
    );
  }

  const handleUpdateStatus = () => {
    if (!useMock && id) {
      updateEstadoMut.mutate(
        { id, estado: 'en_transito', descripcion: 'Estado actualizado manualmente' },
        {
          onSuccess: () => toast.success('Estado actualizado'),
          onError: () => toast.error('Error al actualizar estado'),
        },
      );
    } else {
      toast.success('Estado actualizado');
    }
  };

  const handlePrintLabel = () => {
    if (!envio) return;
    const success = printShippingLabel(envio);
    if (success) {
      toast.success('Etiqueta generada correctamente');
    } else {
      toast.error('Error al generar la etiqueta');
    }
  };

  const handlePaymentRegistered = () => {
    toast.success('Pago registrado correctamente');
    setIsPaymentModalOpen(false);
  };

  const handleProblemaRegistered = (descripcion: string) => {
    if (!useMock && id) {
      reportarProbMut.mutate(
        { id, descripcion },
        {
          onSuccess: () => {
            toast.success('Problema registrado correctamente');
            setIsProblemaModalOpen(false);
          },
          onError: () => toast.error('Error al reportar problema'),
        },
      );
    } else {
      toast.success('Problema registrado correctamente');
      setIsProblemaModalOpen(false);
    }
  };

  const handleNotaAdded = (texto: string) => {
    if (!useMock && id) {
      agregarNotaMut.mutate(
        { id, texto },
        {
          onSuccess: () => toast.success('Nota agregada correctamente'),
          onError: () => toast.error('Error al agregar nota'),
        },
      );
    } else {
      toast.success('Nota agregada correctamente');
    }
  };

  const handleAsignarRepartidor = (repartidorId: string) => {
    if (!useMock && id) {
      asignarRepMut.mutate(
        { id, repartidorId },
        {
          onSuccess: () => {
            toast.success('Repartidor asignado correctamente');
            setShowRepartidorModal(false);
          },
          onError: () => toast.error('Error al asignar repartidor'),
        },
      );
    } else {
      toast.success('Repartidor asignado correctamente');
      setShowRepartidorModal(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/admin/envios')}
            className="gap-1.5"
          >
            <CaretLeft size={14} weight="duotone" />
            Volver
          </Button>
          <div>
            <h1 className="page-header-title">Detalle del Envio</h1>
            <p className="page-header-subtitle">Informacion completa y acciones del envio</p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" size="sm" className="gap-1.5">
            <PencilSimple size={14} weight="duotone" />
            Editar
          </Button>
          <Button variant="secondary" size="sm" className="gap-1.5" onClick={handleUpdateStatus}>
            <ArrowsClockwise size={14} weight="duotone" />
            Actualizar Estado
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="gap-1.5"
            onClick={() => setIsProblemaModalOpen(true)}
          >
            <Warning size={14} weight="duotone" />
            Reportar Problema
          </Button>
          <Button variant="secondary" size="sm" className="gap-1.5" onClick={handlePrintLabel}>
            <Barcode size={14} weight="duotone" />
            Imprimir Etiqueta
          </Button>
        </div>
      </div>

      {envio.estado === 'problema' && (
        <Alert variant="destructive">
          <Warning size={16} weight="duotone" />
          <AlertTitle>Problema Reportado</AlertTitle>
          <AlertDescription>
            <p className="font-medium mb-1 text-[13px]">Fecha: {envio.problemaFecha}</p>
            <p className="text-[13px]">{envio.problemaDescripcion}</p>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6">
        <div className="surface-card p-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <p className="section-label mb-1">Numero de seguimiento</p>
              <p className="text-xl font-semibold font-data">{envio.trackingNumber}</p>
            </div>
            <Badge variant={estadoColors[envio.estado]} className="text-[12px]">
              {estadoLabels[envio.estado]}
            </Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <p className="section-label mb-1">Cliente</p>
              <p className="font-medium text-[13px]">{envio.clienteNombre}</p>
            </div>
            <div>
              <p className="section-label mb-1">Origen</p>
              <p className="font-medium text-[13px]">{envio.origen}</p>
            </div>
            <div>
              <p className="section-label mb-1">Destino</p>
              <p className="font-medium text-[13px]">{envio.destino}</p>
            </div>
            <div>
              <p className="section-label mb-1">Fecha de envio</p>
              <p className="font-medium text-[13px]">{formatDate(envio.fecha)}</p>
            </div>
            <div>
              <p className="section-label mb-1">Peso</p>
              <p className="font-medium text-[13px] font-data">{envio.peso} kg</p>
            </div>
            <div>
              <p className="section-label mb-1">Dimensiones</p>
              <p className="font-medium text-[13px] font-data">
                {envio.dimensiones.largo} x {envio.dimensiones.ancho} x {envio.dimensiones.alto} cm
              </p>
            </div>
          </div>

          {envio.notas && (
            <div className="mt-6 pt-6 border-t border-border">
              <p className="section-label mb-1">Notas</p>
              <p className="text-[13px]">{envio.notas}</p>
            </div>
          )}
        </div>

        <div className="surface-card p-6">
          <h3 className="section-label mb-4">Repartidor Asignado</h3>

          {repartidor ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-[10px]">{getInitials(repartidor.nombre)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium text-[13px]">{repartidor.nombre}</p>
                  <p className="text-[12px] text-muted-foreground font-data">{repartidor.telefono}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowRepartidorModal(true)}>
                Cambiar
              </Button>
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-muted-foreground mb-4 text-[13px]">Sin repartidor asignado</p>
              <Button size="sm" onClick={() => setShowRepartidorModal(true)} className="gap-1.5">
                <UserCheck size={14} weight="duotone" />
                Asignar Repartidor
              </Button>
            </div>
          )}
        </div>

        <div className="surface-card p-6">
          <h3 className="section-label mb-5">Informacion de Pago</h3>
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div className="space-y-4 flex-1">
                <div>
                  <p className="section-label mb-1">Costo del Envio</p>
                  <p className="text-xl font-semibold font-data">{formatCurrency(envio.costo)}</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <p className="section-label mb-1">Estado de Pago</p>
                    <Badge
                      variant={estadosPagoColors[envio.pago?.estadoPago || 'pendiente']}
                      className="text-[12px]"
                    >
                      {envio.pago?.estadoPago === 'pagado' ? 'Pagado'
                        : envio.pago?.estadoPago === 'pago_parcial' ? 'Pago Parcial'
                        : 'Pendiente'}
                    </Badge>
                  </div>
                  <div>
                    <p className="section-label mb-1">Metodo de Pago</p>
                    <p className="font-medium text-[13px]">
                      {envio.pago?.metodoPago
                        ? metodosPagoLabels[envio.pago.metodoPago]
                        : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="section-label mb-1">Fecha de Pago</p>
                    <p className="font-medium text-[13px]">{envio.pago?.fechaPago || '-'}</p>
                  </div>
                </div>
                {envio.pago?.referencia && (
                  <div>
                    <p className="section-label mb-1">Referencia</p>
                    <p className="text-[13px] font-data">{envio.pago.referencia}</p>
                  </div>
                )}
                {envio.pago?.notas && (
                  <div>
                    <p className="section-label mb-1">Notas de pago</p>
                    <p className="text-[13px]">{envio.pago.notas}</p>
                  </div>
                )}
              </div>
            </div>

            {(envio.pago?.estadoPago === 'pendiente' || envio.pago?.estadoPago === 'pago_parcial') ? (
              <Button size="sm" onClick={() => setIsPaymentModalOpen(true)} className="w-full">
                {envio.pago?.estadoPago === 'pago_parcial' ? 'Completar Pago' : 'Registrar Pago'}
              </Button>
            ) : (
              <div className="flex items-center gap-2 text-success">
                <CheckCircle size={18} weight="duotone" />
                <span className="font-medium text-[13px]">Pago completado</span>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="surface-card p-6">
            <h3 className="section-label mb-5">Historial de eventos</h3>
            <Timeline eventos={envio.eventos} />
          </div>

          <div className="surface-card p-6">
            <h3 className="section-label mb-5">Informacion del destinatario</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <UserCircle size={14} weight="duotone" className="text-muted-foreground/60" />
                <div>
                  <p className="section-label mb-0.5">Nombre</p>
                  <p className="font-medium text-[13px]">{envio.destinatarioNombre}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <MapPin size={14} weight="duotone" className="text-muted-foreground/60" />
                <div>
                  <p className="section-label mb-0.5">Direccion</p>
                  <p className="font-medium text-[13px]">{envio.destinatarioDireccion}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Phone size={14} weight="duotone" className="text-muted-foreground/60" />
                <div>
                  <p className="section-label mb-0.5">Telefono</p>
                  <p className="font-medium text-[13px] font-data">{envio.destinatarioTelefono}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <NotasInternas
          envioId={envio.id}
          notas={envio.notasInternas || []}
          onNotaAdded={handleNotaAdded}
        />
      </div>

      {envio.pago && (
        <PaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          envioId={envio.id}
          montoTotal={envio.costo}
          onPaymentRegistered={handlePaymentRegistered}
        />
      )}

      <ProblemaModal
        isOpen={isProblemaModalOpen}
        onClose={() => setIsProblemaModalOpen(false)}
        envioId={envio.id}
        onProblemRegistered={handleProblemaRegistered}
      />

      <Dialog open={showRepartidorModal} onOpenChange={setShowRepartidorModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{repartidor ? 'Cambiar Repartidor' : 'Asignar Repartidor'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {repartidoresList.filter(r => r.estado === 'activo').map((rep) => (
              <button
                key={rep.id}
                onClick={() => handleAsignarRepartidor(rep.id)}
                className="w-full flex items-center justify-between p-3 hover:bg-secondary rounded-md transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-[10px]">{getInitials(rep.nombre)}</AvatarFallback>
                  </Avatar>
                  <div className="text-left">
                    <p className="font-medium text-[13px]">{rep.nombre}</p>
                    <p className="text-[12px] text-muted-foreground font-data">{rep.telefono}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[12px] text-muted-foreground">Envios hoy: {rep.enviosHoy}</p>
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default EnvioDetail;
