import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Buildings, UserCircle, FloppyDisk, CircleNotch } from '@phosphor-icons/react';
import { useCuenta, useUpdateCuenta, type CuentaData } from '@/hooks/api/use-cuenta';

const defaultCuenta: CuentaData = {
  razonSocial: '',
  ruc: '',
  direccion: '',
  telefono: '',
  email: '',
  contactoNombre: '',
  contactoCargo: '',
};

const ClienteCuenta = () => {
  const { data: apiCuenta, isLoading } = useCuenta();
  const updateMutation = useUpdateCuenta();

  const cuentaData: CuentaData = apiCuenta ?? defaultCuenta;

  const [form, setForm] = useState<CuentaData>(cuentaData);

  // Sync form when API data loads
  useEffect(() => {
    if (apiCuenta) {
      setForm(apiCuenta);
    }
  }, [apiCuenta]);

  const handleChange = (field: keyof CuentaData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.razonSocial.trim()) {
      toast.error('La razon social es obligatoria');
      return;
    }
    if (!form.email.trim()) {
      toast.error('El email es obligatorio');
      return;
    }
    if (!form.contactoNombre.trim()) {
      toast.error('El nombre de contacto es obligatorio');
      return;
    }

    updateMutation.mutate(form, {
      onSuccess: () => {
        toast.success('Datos actualizados correctamente');
      },
      onError: () => {
        toast.error('Error al actualizar los datos');
      },
    });
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <div className="page-header">
          <div>
            <div className="h-6 w-32 bg-muted/40 rounded animate-pulse" />
            <div className="h-4 w-48 bg-muted/30 rounded animate-pulse mt-2" />
          </div>
        </div>
        <div className="surface-card p-6 space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i}>
              <div className="h-3 w-20 bg-muted/30 rounded animate-pulse mb-2" />
              <div className="h-9 bg-muted/20 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Mi Cuenta</h1>
          <p className="page-header-subtitle">Informacion de tu empresa y datos de contacto</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <div className="surface-card p-5">
          <h3 className="text-[13px] font-semibold mb-4 flex items-center gap-2">
            <Buildings size={16} weight="duotone" className="text-primary" />
            Datos de la Empresa
          </h3>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px]">Razon Social</Label>
                <Input value={form.razonSocial} onChange={(e) => handleChange('razonSocial', e.target.value)} className="mt-1.5" />
              </div>
              <div>
                <Label className="text-[11px]">RUC</Label>
                <Input value={form.ruc} onChange={(e) => handleChange('ruc', e.target.value)} className="mt-1.5 font-data" />
              </div>
            </div>
            <div>
              <Label className="text-[11px]">Direccion</Label>
              <Input value={form.direccion} onChange={(e) => handleChange('direccion', e.target.value)} className="mt-1.5" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px]">Telefono</Label>
                <Input value={form.telefono} onChange={(e) => handleChange('telefono', e.target.value)} className="mt-1.5 font-data" />
              </div>
              <div>
                <Label className="text-[11px]">Email</Label>
                <Input value={form.email} onChange={(e) => handleChange('email', e.target.value)} className="mt-1.5" />
              </div>
            </div>
          </div>
        </div>

        <div className="surface-card p-5">
          <h3 className="text-[13px] font-semibold mb-4 flex items-center gap-2">
            <UserCircle size={16} weight="duotone" className="text-primary" />
            Contacto Principal
          </h3>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px]">Nombre</Label>
                <Input value={form.contactoNombre} onChange={(e) => handleChange('contactoNombre', e.target.value)} className="mt-1.5" />
              </div>
              <div>
                <Label className="text-[11px]">Cargo</Label>
                <Input value={form.contactoCargo} onChange={(e) => handleChange('contactoCargo', e.target.value)} className="mt-1.5" />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="submit" size="sm" className="gap-1.5" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? (
              <CircleNotch size={14} weight="bold" className="animate-spin" />
            ) : (
              <FloppyDisk size={14} weight="duotone" />
            )}
            {updateMutation.isPending ? 'Guardando...' : 'Guardar Cambios'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default ClienteCuenta;
