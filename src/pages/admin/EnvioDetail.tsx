import { useParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Timeline } from '@/components/tracking/Timeline';
import { PaymentModal } from '@/components/admin/PaymentModal';
import { AnularPagoModal } from '@/components/admin/AnularPagoModal';
import { ProblemaModal } from '@/components/admin/ProblemaModal';
import { NotasInternas } from '@/components/admin/NotasInternas';
import { estadoLabels, estadoColors, estadosPagoColors, metodosPagoLabels, departamentosPY } from '@/data/constants';
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
import { cn, formatCurrency, formatDate, formatDateSmart } from '@/lib/utils';
import { isValidPhone, normalizePhone, PHONE_PLACEHOLDER } from '@/lib/phone';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  useEnvio,
  useUpdateEnvio,
  useUpdateEnvioEstado,
  useAsignarRepartidor,
  useReportarProblema,
  useAgregarNota,
} from '@/hooks/api/use-envios';
import { useRepartidores } from '@/hooks/api/use-repartidores';
import { IntentosContactoCard } from '@/components/admin/IntentosContactoCard';
import { useAdminPodDownloadUrl, useResolverIncidencia } from '@/hooks/api/use-envio-pod';
import type { Envio } from '@/data/types';

const VALID_TRANSITIONS: Record<string, string[]> = {
  pendiente: ['recolectado', 'problema'],
  recolectado: ['en_transito', 'problema'],
  en_transito: ['en_reparto', 'problema'],
  en_reparto: ['entregado', 'fallido', 'problema'],
  fallido: ['en_reparto', 'problema'],
  entregado: [],
  problema: ['pendiente', 'recolectado', 'en_transito', 'en_reparto', 'fallido'],
};

const EnvioDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isAnularPagoModalOpen, setIsAnularPagoModalOpen] = useState(false);
  const [isProblemaModalOpen, setIsProblemaModalOpen] = useState(false);
  const [showRepartidorModal, setShowRepartidorModal] = useState(false);
  const [showEstadoModal, setShowEstadoModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [nuevoEstado, setNuevoEstado] = useState('');
  const [estadoDescripcion, setEstadoDescripcion] = useState('');

  const { data: apiEnvio, isLoading } = useEnvio(id);
  const { data: apiRepartidores, isLoading: loadingRepartidores } = useRepartidores();
  const updateEnvioMut = useUpdateEnvio();
  const updateEstadoMut = useUpdateEnvioEstado();
  const asignarRepMut = useAsignarRepartidor();
  const reportarProbMut = useReportarProblema();
  const agregarNotaMut = useAgregarNota();

  const envio = apiEnvio;
  const repartidoresList = apiRepartidores?.data ?? [];

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

  const [editForm, setEditForm] = useState({
    origen: '',
    destino: '',
    destinatarioNombre: '',
    destinatarioDireccion: '',
    destinatarioTelefono: '',
    destinatarioCiudad: '',
    peso: '',
    costo: '',
    tipoPago: '',
    notas: '',
    instruccionesEntrega: '',
  });

  const openEditModal = () => {
    if (!envio) return;
    setEditForm({
      origen: envio.origen,
      destino: envio.destino,
      destinatarioNombre: envio.destinatarioNombre,
      destinatarioDireccion: envio.destinatarioDireccion,
      destinatarioTelefono: envio.destinatarioTelefono,
      destinatarioCiudad: envio.destinatarioCiudad ?? '',
      peso: String(envio.peso),
      costo: String(envio.costo),
      tipoPago: envio.tipoPago,
      notas: envio.notas ?? '',
      instruccionesEntrega: envio.instruccionesEntrega ?? '',
    });
    setShowEditModal(true);
  };

  const handleEditChange = (field: string, value: string) => {
    setEditForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveEdit = () => {
    if (!id) return;
    if (editForm.destinatarioTelefono && !isValidPhone(editForm.destinatarioTelefono)) {
      toast.error(`Teléfono debe tener formato ${PHONE_PLACEHOLDER}`);
      return;
    }
    const body: Record<string, unknown> = {
      origen: editForm.origen,
      destino: editForm.destino,
      destinatarioNombre: editForm.destinatarioNombre,
      destinatarioDireccion: editForm.destinatarioDireccion,
      destinatarioTelefono: editForm.destinatarioTelefono ? normalizePhone(editForm.destinatarioTelefono) : editForm.destinatarioTelefono,
      destinatarioCiudad: editForm.destinatarioCiudad || undefined,
      peso: parseFloat(editForm.peso),
      costo: Math.round(parseFloat(editForm.costo)),
      tipoPago: editForm.tipoPago,
      notas: editForm.notas || undefined,
      instruccionesEntrega: editForm.instruccionesEntrega || undefined,
    };
    updateEnvioMut.mutate(
      { id, body },
      {
        onSuccess: () => {
          toast.success('Envío actualizado');
          setShowEditModal(false);
        },
        onError: () => toast.error('Error al actualizar envío'),
      },
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="page-header">
          <div className="flex items-center gap-3">
            <div className="h-8 w-16 bg-muted/40 rounded animate-pulse" />
            <div>
              <div className="h-6 w-40 bg-muted/40 rounded animate-pulse" />
              <div className="h-4 w-64 bg-muted/30 rounded animate-pulse mt-1.5" />
            </div>
          </div>
          <div className="flex gap-2">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="h-8 w-28 bg-muted/40 rounded animate-pulse" />
            ))}
          </div>
        </div>
        <div className="surface-card p-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="h-4 w-32 bg-muted/40 rounded animate-pulse" />
              <div className="h-7 w-48 bg-muted/40 rounded animate-pulse mt-2" />
            </div>
            <div className="h-6 w-20 bg-muted/40 rounded-full animate-pulse" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[0, 1, 2, 3, 4, 5].map(i => (
              <div key={i}>
                <div className="h-3 w-16 bg-muted/30 rounded animate-pulse" />
                <div className="h-4 w-28 bg-muted/40 rounded animate-pulse mt-2" />
              </div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="surface-card p-6">
            <div className="h-4 w-36 bg-muted/40 rounded animate-pulse mb-5" />
            <div className="space-y-4">
              {[0, 1, 2].map(i => (
                <div key={i} className="h-12 bg-muted/20 rounded animate-pulse" />
              ))}
            </div>
          </div>
          <div className="surface-card p-6">
            <div className="h-4 w-44 bg-muted/40 rounded animate-pulse mb-5" />
            <div className="space-y-3">
              {[0, 1, 2].map(i => (
                <div key={i} className="h-8 bg-muted/20 rounded animate-pulse" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!envio) {
    return (
      <div className="max-w-md mx-auto">
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/envios')} className="gap-1.5 mb-8">
          <CaretLeft size={14} weight="duotone" />
          Volver a envíos
        </Button>
        <div className="surface-card p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <Warning size={20} weight="duotone" className="text-muted-foreground/50" />
          </div>
          <h3 className="text-[15px] font-semibold mb-1">Envío no encontrado</h3>
          <p className="text-[13px] text-muted-foreground mb-4">
            El envío que buscas no existe o fue eliminado del sistema.
          </p>
          <Button size="sm" onClick={() => navigate('/admin/envios')}>
            Ver todos los envíos
          </Button>
        </div>
      </div>
    );
  }

  const handleUpdateStatus = () => {
    if (!id || !nuevoEstado) return;
    updateEstadoMut.mutate(
      { id, estado: nuevoEstado, descripcion: estadoDescripcion.trim() || 'Estado actualizado manualmente' },
      {
        onSuccess: () => {
          toast.success('Estado actualizado');
          setShowEstadoModal(false);
          setNuevoEstado('');
          setEstadoDescripcion('');
        },
        onError: () => toast.error('Error al actualizar estado'),
      },
    );
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
    if (id) {
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
    }
  };

  const handleNotaAdded = (texto: string) => {
    if (id) {
      agregarNotaMut.mutate(
        { id, texto },
        {
          onSuccess: () => toast.success('Nota agregada correctamente'),
          onError: () => toast.error('Error al agregar nota'),
        },
      );
    }
  };

  const handleAsignarRepartidor = (repartidorId: string) => {
    if (id) {
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
            <h1 className="page-header-title">Envío {envio.trackingNumber}</h1>
            <p className="page-header-subtitle">
              Creado {formatDateSmart(envio.fecha).toLowerCase()} para {envio.clienteNombre}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" className="gap-1.5" onClick={openEditModal} aria-label="Editar envío">
            <PencilSimple size={14} weight="duotone" />
            <span className="hidden sm:inline">Editar</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="gap-1.5"
            onClick={() => setShowEstadoModal(true)}
            disabled={(VALID_TRANSITIONS[envio.estado] ?? []).length === 0}
            aria-label="Cambiar estado del envío"
          >
            <ArrowsClockwise size={14} weight="duotone" />
            <span className="hidden sm:inline">Cambiar estado</span>
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="gap-1.5"
            onClick={() => setIsProblemaModalOpen(true)}
            aria-label="Reportar problema con el envío"
          >
            <Warning size={14} weight="duotone" />
            <span className="hidden sm:inline">Reportar problema</span>
          </Button>
          <Button variant="secondary" size="sm" className="gap-1.5" onClick={handlePrintLabel} aria-label="Imprimir etiqueta del envío">
            <Barcode size={14} weight="duotone" />
            <span className="hidden sm:inline">Imprimir etiqueta</span>
          </Button>
        </div>
      </div>

      {envio.estado === 'problema' && (
        <Alert variant="destructive">
          <Warning size={16} weight="duotone" />
          <AlertTitle>Este envío tiene un problema</AlertTitle>
          <AlertDescription>
            {envio.problemaFecha && (
              <p className="font-medium mb-1 text-[13px]">Reportado {formatDateSmart(envio.problemaFecha).toLowerCase()}</p>
            )}
            <p className="text-[13px]">{envio.problemaDescripcion}</p>
          </AlertDescription>
        </Alert>
      )}

      {envio.tieneIncidencia && envio.incidenciaNota && envio.estado !== 'entregado' && (
        <IncidenciaBanner
          envioId={envio.id}
          nota={envio.incidenciaNota}
          reportadaEn={envio.incidenciaReportadaEn ?? null}
        />
      )}

      {envio.estado === 'entregado' && (envio.entregadoPorNombre || envio.fotoEntregaUrl) && (
        <EntregaPODBanner envio={envio} />
      )}

      <div className="grid gap-6">
        <div className="surface-card p-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <p className="section-label mb-1">Número de seguimiento</p>
              <p className="text-xl font-semibold font-data">{envio.trackingNumber}</p>
            </div>
            <Badge
              variant={estadoColors[envio.estado]}
              className={cn('text-[12px]', envio.estado === 'problema' && 'badge-pulse')}
            >
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
              <p className="section-label mb-1">Fecha de creación</p>
              <p className="font-medium text-[13px]">{formatDate(envio.fecha)}</p>
            </div>
            <div>
              <p className="section-label mb-1">Peso</p>
              <p className="font-medium text-[13px] font-data">{envio.peso} kg</p>
            </div>
            <div>
              <p className="section-label mb-1">Dimensiones</p>
              <p className="font-medium text-[13px] font-data">
                {envio.dimensiones?.largo ? (
                  `${envio.dimensiones.largo} x ${envio.dimensiones.ancho} x ${envio.dimensiones.alto} cm`
                ) : 'Sin registrar'}
              </p>
            </div>
            {envio.valorDeclarado > 0 && (
              <div>
                <p className="section-label mb-1">Valor declarado</p>
                <p className="font-medium text-[13px] font-data">{formatCurrency(envio.valorDeclarado)}</p>
              </div>
            )}
            <div>
              <p className="section-label mb-1">Seguro</p>
              {envio.seguroAdicional ? (
                <Badge variant="success" className="text-[11px]">
                  Asegurado ({formatCurrency(envio.costoSeguro)})
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[11px]">Cobertura basica incluida</Badge>
              )}
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
          <h3 className="section-label mb-4">Repartidor asignado</h3>

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
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowRepartidorModal(true)}
                disabled={loadingRepartidores || asignarRepMut.isPending}
              >
                Cambiar
              </Button>
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-muted-foreground mb-4 text-[13px]">Todavia no se asigno un repartidor</p>
              <Button
                size="sm"
                onClick={() => setShowRepartidorModal(true)}
                disabled={loadingRepartidores || asignarRepMut.isPending}
                className="gap-1.5"
              >
                <UserCheck size={14} weight="duotone" />
                {loadingRepartidores ? 'Cargando...' : 'Asignar repartidor'}
              </Button>
            </div>
          )}
        </div>

        <div className="surface-card p-6">
          <h3 className="section-label mb-5">Cobro</h3>
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div className="space-y-4 flex-1">
                <div>
                  <p className="section-label mb-1">Precio del envío</p>
                  <p className="text-xl font-semibold font-data">{formatCurrency(envio.costo)}</p>
                  {envio.seguroAdicional && envio.costoSeguro > 0 && (
                    <div className="mt-2 pt-2 border-t border-border/40 space-y-1">
                      <div className="flex justify-between items-center text-[12px]">
                        <span className="text-muted-foreground">Seguro adicional</span>
                        <span className="font-data font-medium">{formatCurrency(envio.costoSeguro)}</span>
                      </div>
                      <div className="flex justify-between items-center text-[12px] font-semibold">
                        <span>Total a cobrar</span>
                        <span className="font-data">{formatCurrency(envio.costo + envio.costoSeguro)}</span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <p className="section-label mb-1">Estado</p>
                    <Badge
                      variant={estadosPagoColors[envio.pago?.estadoPago || 'pendiente']}
                      className="text-[12px]"
                    >
                      {envio.pago?.estadoPago === 'pagado' ? 'Cobrado'
                        : envio.pago?.estadoPago === 'pago_parcial' ? 'Cobro parcial'
                        : 'Sin cobrar'}
                    </Badge>
                  </div>
                  <div>
                    <p className="section-label mb-1">Método de cobro</p>
                    <p className="font-medium text-[13px]">
                      {envio.pago?.metodoPago
                        ? metodosPagoLabels[envio.pago.metodoPago]
                        : 'Sin definir'}
                    </p>
                  </div>
                  <div>
                    <p className="section-label mb-1">Cobrado el</p>
                    <p className="font-medium text-[13px]">{envio.pago?.fechaPago ? formatDate(envio.pago.fechaPago) : 'Sin cobrar'}</p>
                  </div>
                </div>
                {envio.pago?.referencia && (
                  <div>
                    <p className="section-label mb-1">Referencia del pago</p>
                    <p className="text-[13px] font-data">{envio.pago.referencia}</p>
                  </div>
                )}
                {envio.pago?.notas && (
                  <div>
                    <p className="section-label mb-1">Notas del cobro</p>
                    <p className="text-[13px]">{envio.pago.notas}</p>
                  </div>
                )}
              </div>
            </div>

            {envio.pago?.estadoPago === 'pagado' ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 text-success">
                  <CheckCircle size={18} weight="duotone" />
                  <span className="font-medium text-[13px]">Cobro completado</span>
                </div>
                {envio.pago && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setIsAnularPagoModalOpen(true)}
                  >
                    Anular cobro
                  </Button>
                )}
              </div>
            ) : envio.pago?.estadoPago === 'pago_parcial' ? (
              <div className="flex flex-col gap-2">
                <Button size="sm" onClick={() => setIsPaymentModalOpen(true)} className="w-full">
                  Completar cobro
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setIsAnularPagoModalOpen(true)}
                >
                  Anular cobro
                </Button>
              </div>
            ) : (
              <Button size="sm" onClick={() => setIsPaymentModalOpen(true)} className="w-full">
                Registrar cobro
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="surface-card p-6">
            <h3 className="section-label mb-5">Historial del envío</h3>
            <Timeline eventos={envio.eventos} />
          </div>

          <div className="surface-card p-6">
            <h3 className="section-label mb-5">Quien recibe el paquete</h3>
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
                  <p className="section-label mb-0.5">Dirección</p>
                  <p className="font-medium text-[13px]">{envio.destinatarioDireccion}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Phone size={14} weight="duotone" className="text-muted-foreground/60" />
                <div>
                  <p className="section-label mb-0.5">Teléfono</p>
                  <p className="font-medium text-[13px] font-data">{envio.destinatarioTelefono}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <IntentosContactoCard envioId={envio.id} />

        <NotasInternas
          envioId={envio.id}
          notas={envio.notasInternas || []}
          onNotaAdded={handleNotaAdded}
        />
      </div>

      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        envioId={envio.id}
        montoTotal={envio.costo}
        onPaymentRegistered={handlePaymentRegistered}
      />

      {envio.pago && (
        <AnularPagoModal
          isOpen={isAnularPagoModalOpen}
          onClose={() => setIsAnularPagoModalOpen(false)}
          pagoId={envio.pago.id}
          montoRecibido={envio.pago.montoRecibido}
          esCuentaCorriente={envio.tipoPago === 'cuenta_corriente'}
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

      <Dialog open={showEstadoModal} onOpenChange={(open) => { setShowEstadoModal(open); if (!open) { setNuevoEstado(''); setEstadoDescripcion(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Actualizar Estado del Envío</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-[12px] font-medium mb-1.5 block">Nuevo estado</label>
              <Select value={nuevoEstado} onValueChange={setNuevoEstado}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar estado" />
                </SelectTrigger>
                <SelectContent>
                  {(VALID_TRANSITIONS[envio.estado] ?? []).map((estado) => (
                    <SelectItem key={estado} value={estado}>
                      {estadoLabels[estado] ?? estado}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[12px] font-medium mb-1.5 block">Descripción (opcional)</label>
              <textarea
                value={estadoDescripcion}
                onChange={(e) => setEstadoDescripcion(e.target.value)}
                placeholder="Detalle del cambio de estado..."
                rows={3}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-[13px] shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={() => setShowEstadoModal(false)} disabled={updateEstadoMut.isPending}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleUpdateStatus} disabled={!nuevoEstado || updateEstadoMut.isPending}>
              {updateEstadoMut.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Envío</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-2">
            <div>
              <h4 className="text-[13px] font-semibold mb-3">Ruta</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-[12px]">Origen</Label>
                  <Select value={editForm.origen} onValueChange={(v) => handleEditChange('origen', v)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {departamentosPY.map((d) => (
                        <SelectItem key={`eo-${d}`} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[12px]">Destino</Label>
                  <Select value={editForm.destino} onValueChange={(v) => handleEditChange('destino', v)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {departamentosPY.map((d) => (
                        <SelectItem key={`ed-${d}`} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-[13px] font-semibold mb-3">Destinatario</h4>
              <div className="space-y-3">
                <div>
                  <Label className="text-[12px]">Nombre</Label>
                  <Input
                    value={editForm.destinatarioNombre}
                    onChange={(e) => handleEditChange('destinatarioNombre', e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[12px]">Dirección</Label>
                  <Textarea
                    value={editForm.destinatarioDireccion}
                    onChange={(e) => handleEditChange('destinatarioDireccion', e.target.value)}
                    className="mt-1 text-[13px]"
                    rows={2}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-[12px]">Teléfono</Label>
                    <Input
                      value={editForm.destinatarioTelefono}
                      onChange={(e) => handleEditChange('destinatarioTelefono', e.target.value)}
                      placeholder={PHONE_PLACEHOLDER}
                      className="mt-1 font-data"
                    />
                  </div>
                  <div>
                    <Label className="text-[12px]">Ciudad</Label>
                    <Input
                      value={editForm.destinatarioCiudad}
                      onChange={(e) => handleEditChange('destinatarioCiudad', e.target.value)}
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-[13px] font-semibold mb-3">Paquete y Cobro</h4>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-[12px]">Peso (kg)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={editForm.peso}
                    onChange={(e) => handleEditChange('peso', e.target.value)}
                    className="mt-1 font-data"
                  />
                </div>
                <div>
                  <Label className="text-[12px]">Costo (Gs.)</Label>
                  <Input
                    type="number"
                    value={editForm.costo}
                    onChange={(e) => handleEditChange('costo', e.target.value)}
                    className="mt-1 font-data"
                  />
                </div>
                <div>
                  <Label className="text-[12px]">Tipo de Pago</Label>
                  <Select value={editForm.tipoPago} onValueChange={(v) => handleEditChange('tipoPago', v)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="anticipado">Anticipado</SelectItem>
                      <SelectItem value="contra_entrega">Contra Entrega</SelectItem>
                      <SelectItem value="cuenta_corriente">Cuenta Corriente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-[13px] font-semibold mb-3">Notas</h4>
              <div className="space-y-3">
                <div>
                  <Label className="text-[12px]">Notas generales</Label>
                  <Textarea
                    value={editForm.notas}
                    onChange={(e) => handleEditChange('notas', e.target.value)}
                    className="mt-1 text-[13px]"
                    rows={2}
                    placeholder="Notas sobre el envío..."
                  />
                </div>
                <div>
                  <Label className="text-[12px]">Instrucciones de entrega</Label>
                  <Textarea
                    value={editForm.instruccionesEntrega}
                    onChange={(e) => handleEditChange('instruccionesEntrega', e.target.value)}
                    className="mt-1 text-[13px]"
                    rows={2}
                    placeholder="Instrucciones para el repartidor..."
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={() => setShowEditModal(false)} disabled={updateEnvioMut.isPending}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSaveEdit} disabled={updateEnvioMut.isPending}>
              {updateEnvioMut.isPending ? 'Guardando...' : 'Guardar Cambios'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

function IncidenciaBanner({
  envioId,
  nota,
  reportadaEn,
}: { envioId: string; nota: string; reportadaEn: string | null }) {
  const resolverMut = useResolverIncidencia(envioId);

  async function handleResolve() {
    if (!window.confirm('¿Resolver la incidencia? Se registrará en el historial.')) return;
    try {
      await resolverMut.mutateAsync(undefined);
      toast.success('Incidencia resuelta');
    } catch {
      toast.error('No se pudo resolver');
    }
  }

  return (
    <Alert className="border-amber-300 bg-amber-50 text-amber-900">
      <Warning size={16} weight="duotone" className="text-amber-600" />
      <AlertTitle>Incidencia reportada por el repartidor</AlertTitle>
      <AlertDescription className="space-y-2">
        <p className="text-[13px]">{nota}</p>
        {reportadaEn && (
          <p className="text-[11px] text-amber-700">
            Reportada {formatDateSmart(reportadaEn).toLowerCase()}
          </p>
        )}
        <Button
          size="sm"
          variant="outline"
          className="mt-2 border-amber-400 text-amber-800 hover:bg-amber-100"
          onClick={handleResolve}
          disabled={resolverMut.isPending}
        >
          {resolverMut.isPending ? 'Resolviendo...' : 'Marcar como resuelta'}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function EntregaPODBanner({ envio }: { envio: Envio }) {
  const { data: pod } = useAdminPodDownloadUrl(envio.id, envio.fotoEntregaUrl ?? null);
  const isCod = envio.tipoPago === 'contra_entrega' && envio.montoACobrar > 0;
  const montoDiff = isCod && envio.montoCobrado != null && envio.montoCobrado !== envio.montoACobrar;

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4">
      <div className="flex items-start gap-3">
        {pod?.signedUrl ? (
          <a href={pod.signedUrl} target="_blank" rel="noopener noreferrer">
            <img
              src={pod.signedUrl}
              alt="Prueba de entrega"
              className="w-20 h-20 rounded-lg object-cover border border-emerald-300 flex-shrink-0"
            />
          </a>
        ) : (
          <div className="w-20 h-20 rounded-lg bg-emerald-100 border border-emerald-200 flex items-center justify-center flex-shrink-0">
            <span className="text-[10px] text-emerald-600 text-center px-1">Sin foto registrada</span>
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="text-[12px] font-bold text-emerald-800 uppercase tracking-wide">Prueba de entrega</div>
          {envio.entregadoPorNombre && (
            <div className="text-[14px] font-semibold">
              Entregado a {envio.entregadoPorNombre}
              {envio.entregadoPorDocumento && (
                <span className="text-[12px] font-normal text-emerald-700 ml-1">· Doc {envio.entregadoPorDocumento}</span>
              )}
            </div>
          )}
          {envio.fechaEntregaReal && (
            <div className="text-[12px] text-emerald-700">
              {formatDateSmart(envio.fechaEntregaReal)}
            </div>
          )}
          {isCod && envio.montoCobrado != null && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[13px] font-medium">
                Cobrado: {formatCurrency(envio.montoCobrado)}
              </span>
              {montoDiff && (
                <Badge variant="warning" className="text-[10px]">
                  ≠ pactado ({formatCurrency(envio.montoACobrar)})
                </Badge>
              )}
              {!montoDiff && (
                <Badge variant="success" className="text-[10px]">coincide</Badge>
              )}
            </div>
          )}
          {envio.entregaNotas && (
            <div className="text-[12px] text-emerald-800 italic mt-1">"{envio.entregaNotas}"</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default EnvioDetail;
