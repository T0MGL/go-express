import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { CheckCircle } from '@phosphor-icons/react';

interface ForgotPasswordSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  redirectPath: string;
  portal: 'cliente' | 'repartidor';
}

export function ForgotPasswordSheet({ open, onOpenChange, redirectPath, portal }: ForgotPasswordSheetProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      toast.error('Ingresá tu email');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', {
        email: trimmed,
        portal,
        redirectTo: `${window.location.origin}${redirectPath}`,
      });
      setSent(true);
    } catch {
      toast.error('No se pudo enviar el link. Reintentá en unos segundos.');
    } finally {
      setLoading(false);
    }
  }

  function handleClose(next: boolean) {
    if (!next) {
      setSent(false);
      setEmail('');
    }
    onOpenChange(next);
  }

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="bottom" className="max-h-[85vh]">
        <SheetHeader className="text-left">
          <SheetTitle>{sent ? 'Revisá tu email' : 'Recuperar contraseña'}</SheetTitle>
          <SheetDescription>
            {sent
              ? 'Te enviamos un link para crear una nueva contraseña. Puede tardar un minuto en llegar.'
              : 'Te enviamos un link a tu email para crear una nueva contraseña.'}
          </SheetDescription>
        </SheetHeader>
        {sent ? (
          <div className="py-6 flex flex-col items-center text-center gap-3">
            <CheckCircle size={40} weight="duotone" className="text-emerald-500" />
            <p className="text-[13px] text-muted-foreground">
              Si no lo ves, revisá spam o probá con otro email.
            </p>
            <Button className="w-full h-11 mt-2" onClick={() => handleClose(false)}>
              Cerrar
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="forgot-email">Email</Label>
              <Input
                id="forgot-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu-email@ejemplo.com"
                className="h-11 text-base"
                autoFocus
              />
            </div>
            <Button type="submit" className="w-full h-11" disabled={loading}>
              {loading ? 'Enviando...' : 'Enviar link'}
            </Button>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
