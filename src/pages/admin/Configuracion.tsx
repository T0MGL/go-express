import { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { estadoLabels } from '@/data/constants';
import { UserPlus, ShieldCheck, Warning, DotsThreeVertical, Key, EnvelopeSimple } from '@phosphor-icons/react';
import { useAuth } from '@/lib/auth';
import { useUsuarios, useCreateUsuario, useSendUsuarioPasswordReset } from '@/hooks/api/use-usuarios';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UsuarioPasswordDialog } from '@/components/admin/UsuarioPasswordDialog';
import { extractApiError } from '@/lib/api';
import type { Usuario } from '@/data/types';
import { useConfiguracion, useUpdateConfiguracion } from '@/hooks/api/use-configuracion';
import { useSeguroConfig, useUpdateSeguroConfig } from '@/hooks/api/use-seguro-config';
import {
  useNotificacionesConfig,
  useUpdateNotificacionesConfig,
  NOTIFICACIONES_DEFAULTS,
  type NotificacionesConfig,
} from '@/hooks/api/use-notificaciones-config';
import { calcularSeguroAdicional, SEGURO_DEFAULTS, type SeguroConfig } from '@/lib/seguro';
import { formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';

const PREVIEW_VALORES = [100_000, 500_000, 1_000_000, 5_000_000, 20_000_000];

interface SeguroFormState {
  umbralIncluido: string;
  tasaAdicionalPct: string;
  minimoAdicional: string;
  maximoAsegurable: string;
}

function seguroToForm(cfg: SeguroConfig): SeguroFormState {
  return {
    umbralIncluido: String(cfg.umbralIncluido),
    tasaAdicionalPct: (cfg.tasaAdicional * 100).toString(),
    minimoAdicional: String(cfg.minimoAdicional),
    maximoAsegurable: String(cfg.maximoAsegurable),
  };
}

function formToSeguro(form: SeguroFormState): SeguroConfig | { error: string } {
  const umbralIncluido = Number(form.umbralIncluido);
  const tasaAdicional = Number(form.tasaAdicionalPct) / 100;
  const minimoAdicional = Number(form.minimoAdicional);
  const maximoAsegurable = Number(form.maximoAsegurable);

  if (!Number.isFinite(umbralIncluido) || umbralIncluido < 0) {
    return { error: 'Umbral incluido debe ser un número positivo' };
  }
  if (!Number.isFinite(tasaAdicional) || tasaAdicional < 0 || tasaAdicional > 1) {
    return { error: 'Tasa debe estar entre 0% y 100%' };
  }
  if (!Number.isFinite(minimoAdicional) || minimoAdicional < 0) {
    return { error: 'Monto mínimo debe ser positivo' };
  }
  if (!Number.isFinite(maximoAsegurable) || maximoAsegurable < umbralIncluido) {
    return { error: 'Máximo asegurable debe ser mayor o igual al umbral incluido' };
  }

  return {
    umbralIncluido: Math.round(umbralIncluido),
    tasaAdicional,
    minimoAdicional: Math.round(minimoAdicional),
    maximoAsegurable: Math.round(maximoAsegurable),
  };
}

const SeguroTab = () => {
  const { data: seguroData, isLoading } = useSeguroConfig();
  const updateSeguroMut = useUpdateSeguroConfig();
  const [form, setForm] = useState<SeguroFormState>(() => seguroToForm(SEGURO_DEFAULTS));

  useEffect(() => {
    if (seguroData?.config) {
      setForm(seguroToForm(seguroData.config));
    }
  }, [seguroData]);

  // Live preview: usa el form en edicion para calcular sin esperar al save
  const previewCfg: SeguroConfig = {
    umbralIncluido: Number(form.umbralIncluido) || 0,
    tasaAdicional: (Number(form.tasaAdicionalPct) || 0) / 100,
    minimoAdicional: Number(form.minimoAdicional) || 0,
    maximoAsegurable: Number(form.maximoAsegurable) || 0,
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = formToSeguro(form);
    if ('error' in result) {
      toast.error(result.error);
      return;
    }
    updateSeguroMut.mutate(result, {
      onSuccess: () => toast.success('Configuración de seguro actualizada'),
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? 'Error al guardar la configuración';
        toast.error(msg);
      },
    });
  };

  return (
    <div className="space-y-4">
      <div className="surface-card p-4 border-l-2 border-l-primary/40 bg-primary/[0.02]">
        <div className="flex items-start gap-2.5">
          <ShieldCheck size={16} weight="duotone" className="text-primary flex-shrink-0 mt-0.5" />
          <div className="text-[12px] text-muted-foreground leading-relaxed">
            Estos parametros controlan el seguro de envío. Todos los envíos tienen cobertura
            incluida por debajo del umbral. Arriba del umbral, el cliente puede optar por agregar
            seguro adicional (checkbox opt-in en el wizard). El costo se recalcula server-side
            siempre, el cliente nunca puede forzar un monto distinto.
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="surface-card p-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <Label htmlFor="seguro-umbral" className="text-[12px]">Umbral incluido (Gs)</Label>
            <Input
              id="seguro-umbral"
              type="number"
              inputMode="numeric"
              min="0"
              step="1000"
              value={form.umbralIncluido}
              onChange={(e) => setForm((p) => ({ ...p, umbralIncluido: e.target.value }))}
              className="mt-1.5 font-data"
              disabled={isLoading}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Valor declarado máximo con seguro incluido (sin cargo)
            </p>
          </div>

          <div>
            <Label htmlFor="seguro-tasa" className="text-[12px]">Tasa adicional (%)</Label>
            <Input
              id="seguro-tasa"
              type="number"
              inputMode="decimal"
              min="0"
              max="100"
              step="0.1"
              value={form.tasaAdicionalPct}
              onChange={(e) => setForm((p) => ({ ...p, tasaAdicionalPct: e.target.value }))}
              className="mt-1.5 font-data"
              disabled={isLoading}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Porcentaje del valor declarado sobre el umbral
            </p>
          </div>

          <div>
            <Label htmlFor="seguro-minimo" className="text-[12px]">Monto mínimo adicional (Gs)</Label>
            <Input
              id="seguro-minimo"
              type="number"
              inputMode="numeric"
              min="0"
              step="500"
              value={form.minimoAdicional}
              onChange={(e) => setForm((p) => ({ ...p, minimoAdicional: e.target.value }))}
              className="mt-1.5 font-data"
              disabled={isLoading}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Monto mínimo cobrado cuando el seguro adicional aplica
            </p>
          </div>

          <div>
            <Label htmlFor="seguro-maximo" className="text-[12px]">Máximo asegurable (Gs)</Label>
            <Input
              id="seguro-maximo"
              type="number"
              inputMode="numeric"
              min="0"
              step="100000"
              value={form.maximoAsegurable}
              onChange={(e) => setForm((p) => ({ ...p, maximoAsegurable: e.target.value }))}
              className="mt-1.5 font-data"
              disabled={isLoading}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Techo para seguro automático. Arriba de esto requiere revisión manual
            </p>
          </div>
        </div>

        <div className="border-t pt-5">
          <h4 className="section-label mb-3">Preview del calculo</h4>
          <p className="text-[11px] text-muted-foreground mb-3">
            Simulacion con los valores actualmente editados. Guarda para aplicar.
          </p>
          <div className="overflow-x-auto">
            <table className="premium-table">
              <thead>
                <tr>
                  <th>Valor declarado</th>
                  <th>Cobertura</th>
                  <th className="text-right">Costo del seguro</th>
                </tr>
              </thead>
              <tbody>
                {PREVIEW_VALORES.map((valor) => {
                  const costo = calcularSeguroAdicional(valor, previewCfg);
                  const excede = valor > previewCfg.maximoAsegurable;
                  const incluido = valor <= previewCfg.umbralIncluido;
                  return (
                    <tr key={valor}>
                      <td className="font-data">{formatCurrency(valor)}</td>
                      <td>
                        {excede ? (
                          <span className="inline-flex items-center gap-1 text-[12px] text-warning">
                            <Warning size={12} weight="fill" />
                            Requiere revisión manual
                          </span>
                        ) : incluido ? (
                          <Badge variant="success" className="text-[11px]">Incluida</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[11px]">Opt-in cliente</Badge>
                        )}
                      </td>
                      <td className="text-right font-data font-semibold">
                        {excede ? '-' : incluido ? formatCurrency(0) : formatCurrency(costo)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button type="submit" size="sm" disabled={updateSeguroMut.isPending || isLoading}>
            Guardar configuración
          </Button>
        </div>
      </form>
    </div>
  );
};

// Template fijo por ahora: solo lectura en la UI, editable en una sesion futura
// cuando cerremos la historia de templates dinamicos.
const EMAIL_TEMPLATE_PREVIEW =
  'Hola {customer_name},\n\nTu envío con número de seguimiento {tracking_number} ha sido registrado.\n\nGracias por confiar en Go Express.';

interface NotificacionToggle {
  key: keyof NotificacionesConfig;
  label: string;
  description: string;
}

const NOTIFICACION_TOGGLES: NotificacionToggle[] = [
  { key: 'envio_creado', label: 'Envío creado', description: 'Cuando se registra un nuevo envío (estado Pendiente)' },
  { key: 'recolectado', label: 'Retirado del remitente', description: 'Cuando el envío se recolecta del cliente' },
  { key: 'en_transito', label: 'En tránsito', description: 'Cuando el envío sale a ruta entre centros' },
  { key: 'en_reparto', label: 'En reparto', description: 'Cuando el repartidor sale a entregar' },
  { key: 'entregado', label: 'Entregado', description: 'Cuando el paquete llega al destinatario' },
  { key: 'fallido', label: 'Entrega fallida', description: 'Cuando un intento de entrega no pudo completarse' },
  { key: 'problema', label: 'Con problema', description: 'Cuando el envío se marca como problema' },
];

const NotificacionesTab = () => {
  const { data, isLoading } = useNotificacionesConfig();
  const updateMut = useUpdateNotificacionesConfig();
  const [form, setForm] = useState<NotificacionesConfig>(NOTIFICACIONES_DEFAULTS);

  useEffect(() => {
    if (data?.config) setForm(data.config);
  }, [data]);

  const handleToggle = (key: keyof NotificacionesConfig, value: boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMut.mutate(form, {
      onSuccess: () => toast.success('Notificaciones actualizadas'),
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error ?? 'Error al guardar notificaciones';
        toast.error(msg);
      },
    });
  };

  return (
    <div className="space-y-4">
      <div className="surface-card p-4 border-l-2 border-l-primary/40 bg-primary/[0.02]">
        <div className="flex items-start gap-2.5">
          <EnvelopeSimple size={16} weight="duotone" className="text-primary flex-shrink-0 mt-0.5" />
          <div className="text-[12px] text-muted-foreground leading-relaxed">
            Elegí en qué momentos del ciclo del envío GO EXPRESS envía un email al destinatario.
            Los cambios impactan a envíos nuevos y a transiciones futuras. Si desactivás un evento,
            el sistema deja de enviar ese email aunque la transición ocurra.
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="surface-card p-6 space-y-6">
        <div>
          <h3 className="section-label mb-4">Eventos que disparan email al destinatario</h3>
          <div className="space-y-3">
            {NOTIFICACION_TOGGLES.map((toggle) => (
              <label
                key={toggle.key}
                htmlFor={`notif-${toggle.key}`}
                className="flex items-start gap-3 p-3 rounded-md border border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
              >
                <Checkbox
                  id={`notif-${toggle.key}`}
                  checked={form[toggle.key]}
                  onCheckedChange={(val) => handleToggle(toggle.key, Boolean(val))}
                  disabled={isLoading}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium">{toggle.label}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{toggle.description}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="border-t pt-6">
          <h3 className="section-label mb-4">Otros canales</h3>
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox id="sms" disabled />
              <Label htmlFor="sms" className="font-normal text-[13px] text-muted-foreground">
                Notificar por SMS (disponible proximamente)
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox id="whatsapp" disabled />
              <Label htmlFor="whatsapp" className="font-normal text-[13px] text-muted-foreground">
                Avisar al repartidor por WhatsApp (disponible proximamente)
              </Label>
            </div>
          </div>
        </div>

        <div className="border-t pt-6 opacity-70">
          <div className="flex items-center justify-between mb-2">
            <Label htmlFor="template" className="text-[13px]">Texto del email</Label>
            <Badge variant="outline" className="text-[10px]">Template fijo por ahora</Badge>
          </div>
          <p className="text-[12px] text-muted-foreground mt-1 mb-3">
            Variables disponibles: {'{tracking_number}'}, {'{customer_name}'}, {'{status}'}.
            Editable en una proxima version.
          </p>
          <Textarea
            id="template"
            value={EMAIL_TEMPLATE_PREVIEW}
            readOnly
            rows={6}
            className="font-data text-[13px] bg-muted/30"
            disabled
          />
        </div>

        <div className="flex justify-end pt-2">
          <Button type="submit" size="sm" disabled={updateMut.isPending || isLoading}>
            Guardar configuración
          </Button>
        </div>
      </form>
    </div>
  );
};

const Configuracion = () => {
  const { isAdmin } = useAuth();
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [passwordDialogUsuario, setPasswordDialogUsuario] = useState<Usuario | null>(null);

  // Gestion de usuarios es estrictamente admin. El backend devuelve 403 a
  // operadores, asi que deshabilitamos la query y ocultamos la pestana para
  // evitar ruido en la UI y un 403 log spammy.
  const { data: apiUsuarios, isLoading: isLoadingUsuarios } = useUsuarios({ enabled: isAdmin });
  useConfiguracion();
  const createUsuarioMut = useCreateUsuario();
  const sendResetMut = useSendUsuarioPasswordReset();
  const updateConfigMut = useUpdateConfiguracion();

  const usuarios = apiUsuarios ?? [];

  const handleSendReset = (usuario: Usuario) => {
    sendResetMut.mutate(
      { id: usuario.id },
      {
        onSuccess: (data) => toast.success(`Email de recuperacion enviado a ${data.email}`),
        onError: (err) => toast.error(extractApiError(err, 'No se pudo enviar el email de recuperacion')),
      },
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const fd = new FormData(form);
    const nombre = String(fd.get('nombre') ?? '').trim();
    const email = String(fd.get('email') ?? '').trim();
    const rol = String(fd.get('rol') ?? '').trim().toLowerCase();

    if (rol !== 'admin' && rol !== 'operador') {
      toast.error('Selecciona un rol valido');
      return;
    }

    createUsuarioMut.mutate(
      { nombre, email, rol },
      {
        onSuccess: () => {
          setIsInviteModalOpen(false);
          form.reset();
          toast.success('Usuario invitado correctamente');
        },
        onError: (err) => toast.error(extractApiError(err, 'Error al invitar usuario')),
      },
    );
  };

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const fd = new FormData(form);
    const telefono = fd.get('telefono') as string;
    const email = fd.get('email') as string;
    const direccion = fd.get('direccion') as string;
    Promise.all([
      updateConfigMut.mutateAsync({ key: 'telefono', value: telefono }),
      updateConfigMut.mutateAsync({ key: 'email', value: email }),
      updateConfigMut.mutateAsync({ key: 'direccion', value: direccion }),
    ])
      .then(() => toast.success('Configuración guardada'))
      .catch(() => toast.error('Error al guardar configuración'));
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Configuración</h1>
          <p className="page-header-subtitle">Datos de la empresa, seguros, notificaciones y usuarios</p>
        </div>
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="general">Empresa</TabsTrigger>
          <TabsTrigger value="estados">Estados de envío</TabsTrigger>
          <TabsTrigger value="seguro">Seguro</TabsTrigger>
          <TabsTrigger value="notificaciones">Notificaciones</TabsTrigger>
          {isAdmin && <TabsTrigger value="usuarios">Usuarios</TabsTrigger>}
        </TabsList>

        <TabsContent value="general">
          <div className="surface-card p-6">
            <form className="space-y-6" onSubmit={handleSaveConfig}>
              <div>
                <Label htmlFor="telefono" className="text-[13px]">Teléfono de contacto</Label>
                <Input id="telefono" name="telefono" type="tel" defaultValue="+595211234567" className="mt-1.5 font-data" />
                <p className="text-[11px] text-muted-foreground mt-1">El número que los clientes ven en recibos y emails</p>
              </div>
              <div>
                <Label htmlFor="email-config" className="text-[13px]">Email de contacto</Label>
                <Input id="email-config" name="email" type="email" defaultValue="contacto@goexpress.py" className="mt-1.5" />
              </div>
              <div>
                <Label htmlFor="direccion" className="text-[13px]">Dirección de la oficina principal</Label>
                <Textarea
                  id="direccion"
                  name="direccion"
                  defaultValue="Av. Espana 1234, Asunción, Paraguay"
                  className="mt-1.5"
                  rows={3}
                />
              </div>
              <div className="flex justify-end pt-4">
                <Button type="submit" size="sm" disabled={updateConfigMut.isPending}>Guardar cambios</Button>
              </div>
            </form>
          </div>
        </TabsContent>

        <TabsContent value="estados">
          <div className="space-y-3">
            <div className="surface-card p-4 bg-muted/30 border-border/60 flex items-start gap-2.5 mb-2">
              <p className="text-[12px] text-muted-foreground">
                Los estados por los que pasa un envío son fijos. Más adelante se podran personalizar.
              </p>
            </div>
            {Object.entries(estadoLabels).map(([key, label]) => (
              <div key={key} className="surface-card p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="font-medium text-[13px]">{label}</span>
                    <Badge variant="success" className="text-[11px]">Activo</Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="seguro">
          <SeguroTab />
        </TabsContent>

        <TabsContent value="notificaciones">
          <NotificacionesTab />
        </TabsContent>

        {isAdmin && (
        <TabsContent value="usuarios">
          <div className="surface-card p-6">
            <div className="flex justify-between items-center mb-5">
              <h3 className="section-label">Usuarios que pueden usar el sistema</h3>
              <Button size="sm" onClick={() => setIsInviteModalOpen(true)} className="gap-1.5">
                <UserPlus size={14} weight="duotone" />
                Invitar usuario
              </Button>
            </div>

            {isLoadingUsuarios ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 py-2">
                    <div className="h-4 w-32 bg-muted/40 rounded animate-pulse" />
                    <div className="h-4 w-40 bg-muted/30 rounded animate-pulse" />
                    <div className="h-5 w-16 bg-muted/40 rounded-full animate-pulse" />
                    <div className="h-5 w-14 bg-muted/30 rounded-full animate-pulse" />
                  </div>
                ))}
              </div>
            ) : (
            <div className="overflow-x-auto">
              <table className="premium-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Email</th>
                    <th>Rol</th>
                    <th>Estado</th>
                    <th className="text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map((usuario) => (
                    <tr key={usuario.id}>
                      <td className="font-medium text-[13px]">{usuario.nombre}</td>
                      <td className="text-[13px] text-muted-foreground">{usuario.email}</td>
                      <td>
                        <Badge variant="outline" className="text-[11px]">{usuario.rol}</Badge>
                      </td>
                      <td>
                        <Badge variant={usuario.estado === 'activo' ? 'success' : 'muted'} className="text-[11px]">
                          {usuario.estado === 'activo' ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </td>
                      <td>
                        <div className="flex gap-1 justify-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                aria-label={`Acciones para ${usuario.nombre}`}
                              >
                                <DotsThreeVertical size={14} weight="bold" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuItem
                                onClick={() => setPasswordDialogUsuario(usuario)}
                                className="gap-2"
                              >
                                <Key size={14} weight="duotone" />
                                Establecer contrasena
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleSendReset(usuario)}
                                disabled={sendResetMut.isPending}
                                className="gap-2"
                              >
                                <EnvelopeSimple size={14} weight="duotone" />
                                Enviar email de recuperacion
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                disabled
                                className="text-[11px] text-muted-foreground"
                              >
                                Id: {usuario.id.slice(0, 8)}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}
          </div>
        </TabsContent>
        )}
      </Tabs>

      <Dialog open={isInviteModalOpen} onOpenChange={setIsInviteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invitar Usuario</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <Label htmlFor="nombre" className="text-[13px]">Nombre completo *</Label>
                <Input id="nombre" name="nombre" required className="mt-1.5" />
              </div>
              <div>
                <Label htmlFor="invite-email" className="text-[13px]">Email *</Label>
                <Input id="invite-email" name="email" type="email" required className="mt-1.5" />
              </div>
              <div>
                <Label htmlFor="rol" className="text-[13px]">Rol *</Label>
                <Select name="rol" required>
                  <SelectTrigger id="rol" className="mt-1.5">
                    <SelectValue placeholder="Seleccionar rol" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="operador">Operador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsInviteModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={createUsuarioMut.isPending}>Enviar Invitacion</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <UsuarioPasswordDialog
        usuario={passwordDialogUsuario}
        open={passwordDialogUsuario !== null}
        onOpenChange={(open) => {
          if (!open) setPasswordDialogUsuario(null);
        }}
      />
    </div>
  );
};

export default Configuracion;
