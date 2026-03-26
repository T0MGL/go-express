import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { estadoLabels } from '@/data/constants';
import { Plus } from 'lucide-react';
import { PencilSimple, Trash, UserPlus } from '@phosphor-icons/react';
import { useUsuarios, useCreateUsuario } from '@/hooks/api/use-usuarios';
import { useConfiguracion, useUpdateConfiguracion } from '@/hooks/api/use-configuracion';
import { toast } from 'sonner';

const Configuracion = () => {
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [emailTemplate, setEmailTemplate] = useState(
    'Hola {customer_name},\n\nTu envio con numero de seguimiento {tracking_number} ha sido registrado.\n\nGracias por confiar en Go Express.'
  );
  const [notifCreate, setNotifCreate] = useState(true);
  const [notifReparto, setNotifReparto] = useState(true);
  const [notifEntrega, setNotifEntrega] = useState(true);

  const { data: apiUsuarios, isLoading: isLoadingUsuarios } = useUsuarios();
  useConfiguracion();
  const createUsuarioMut = useCreateUsuario();
  const updateConfigMut = useUpdateConfiguracion();

  const usuarios = apiUsuarios ?? [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const fd = new FormData(form);
    createUsuarioMut.mutate(
      {
        nombre: fd.get('nombre') as string,
        email: fd.get('email') as string,
        rol: fd.get('rol') as string,
      },
      {
        onSuccess: () => {
          setIsInviteModalOpen(false);
          toast.success('Usuario invitado correctamente');
        },
        onError: () => toast.error('Error al invitar usuario'),
      },
    );
  };

  const handleSaveNotificaciones = (e: React.FormEvent) => {
    e.preventDefault();
    Promise.all([
      updateConfigMut.mutateAsync({ key: 'notif_create', value: String(notifCreate) }),
      updateConfigMut.mutateAsync({ key: 'notif_reparto', value: String(notifReparto) }),
      updateConfigMut.mutateAsync({ key: 'notif_entrega', value: String(notifEntrega) }),
      updateConfigMut.mutateAsync({ key: 'email_template', value: emailTemplate }),
    ])
      .then(() => toast.success('Configuracion guardada'))
      .catch(() => toast.error('Error al guardar configuracion'));
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
      .then(() => toast.success('Configuracion guardada'))
      .catch(() => toast.error('Error al guardar configuracion'));
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Configuracion</h1>
          <p className="page-header-subtitle">Ajustes generales del sistema</p>
        </div>
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="estados">Estados de Envio</TabsTrigger>
          <TabsTrigger value="notificaciones">Notificaciones</TabsTrigger>
          <TabsTrigger value="usuarios">Usuarios</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <div className="surface-card p-6">
            <form className="space-y-6" onSubmit={handleSaveConfig}>
              <div>
                <Label htmlFor="telefono" className="text-[13px]">Telefono de contacto</Label>
                <Input id="telefono" name="telefono" type="tel" defaultValue="+595 21 123 4567" className="mt-1.5 font-data" />
              </div>
              <div>
                <Label htmlFor="email-config" className="text-[13px]">Email de contacto</Label>
                <Input id="email-config" name="email" type="email" defaultValue="contacto@goexpress.py" className="mt-1.5" />
              </div>
              <div>
                <Label htmlFor="direccion" className="text-[13px]">Direccion oficina principal</Label>
                <Textarea
                  id="direccion"
                  name="direccion"
                  defaultValue="Av. Espana 1234, Asuncion, Paraguay"
                  className="mt-1.5"
                  rows={3}
                />
              </div>
              <div className="flex justify-end pt-4">
                <Button type="submit" size="sm" disabled={updateConfigMut.isPending}>Guardar Cambios</Button>
              </div>
            </form>
          </div>
        </TabsContent>

        <TabsContent value="estados">
          <div className="space-y-3">
            {Object.entries(estadoLabels).map(([key, label]) => (
              <div key={key} className="surface-card p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="font-medium text-[13px]">{label}</span>
                    <Badge variant="success" className="text-[11px]">Activo</Badge>
                  </div>
                  <div className="flex items-center gap-4">
                    <Switch defaultChecked />
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                      <PencilSimple size={14} weight="duotone" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              Agregar Estado Custom
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="notificaciones">
          <div className="surface-card p-6">
            <form className="space-y-6" onSubmit={handleSaveNotificaciones}>
              <div>
                <h3 className="section-label mb-4">Notificaciones por Email</h3>
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="email-create"
                      checked={notifCreate}
                      onCheckedChange={(val) => setNotifCreate(Boolean(val))}
                    />
                    <Label htmlFor="email-create" className="font-normal text-[13px]">
                      Enviar email cuando se crea envio
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="email-reparto"
                      checked={notifReparto}
                      onCheckedChange={(val) => setNotifReparto(Boolean(val))}
                    />
                    <Label htmlFor="email-reparto" className="font-normal text-[13px]">
                      Enviar email cuando cambia a "En Reparto"
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="email-entrega"
                      checked={notifEntrega}
                      onCheckedChange={(val) => setNotifEntrega(Boolean(val))}
                    />
                    <Label htmlFor="email-entrega" className="font-normal text-[13px]">
                      Enviar email cuando se entrega
                    </Label>
                  </div>
                </div>
              </div>

              <div className="border-t pt-6">
                <h3 className="section-label mb-4">Otras Notificaciones</h3>
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox id="sms" disabled />
                    <Label htmlFor="sms" className="font-normal text-[13px] text-muted-foreground">
                      Enviar SMS (proximamente)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="whatsapp" disabled />
                    <Label htmlFor="whatsapp" className="font-normal text-[13px] text-muted-foreground">
                      Notificar al repartidor por WhatsApp (proximamente)
                    </Label>
                  </div>
                </div>
              </div>

              <div className="border-t pt-6">
                <Label htmlFor="template" className="text-[13px]">Template de Email</Label>
                <p className="text-[12px] text-muted-foreground mt-1 mb-3">
                  Variables disponibles: {'{tracking_number}'}, {'{customer_name}'}, {'{status}'}
                </p>
                <Textarea
                  id="template"
                  value={emailTemplate}
                  onChange={(e) => setEmailTemplate(e.target.value)}
                  rows={6}
                  className="font-data text-[13px]"
                />
              </div>

              <div className="flex justify-end pt-4">
                <Button type="submit" size="sm" disabled={updateConfigMut.isPending}>Guardar Configuracion</Button>
              </div>
            </form>
          </div>
        </TabsContent>

        <TabsContent value="usuarios">
          <div className="surface-card p-6">
            <div className="flex justify-between items-center mb-5">
              <h3 className="section-label">Usuarios del Sistema</h3>
              <Button size="sm" onClick={() => setIsInviteModalOpen(true)} className="gap-1.5">
                <UserPlus size={14} weight="duotone" />
                Invitar Usuario
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
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                            <PencilSimple size={14} weight="duotone" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                            <Trash size={14} weight="duotone" className="text-destructive" />
                          </Button>
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
                    <SelectItem value="Admin">Admin</SelectItem>
                    <SelectItem value="Operador">Operador</SelectItem>
                    <SelectItem value="Repartidor">Repartidor</SelectItem>
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
    </div>
  );
};

export default Configuracion;
