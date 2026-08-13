import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Isotipo } from '@/components/brand/BrandMark';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { CheckCircle } from '@phosphor-icons/react';

type PortalType = 'cliente' | 'repartidor' | 'admin';

interface ResetPasswordProps {
  portal: PortalType;
}

const portalConfig: Record<PortalType, { title: string; successPath: string; loginPath: string }> = {
  cliente: {
    title: 'Portal Clientes',
    successPath: '/portal',
    loginPath: '/portal/login',
  },
  repartidor: {
    title: 'Portal Repartidor',
    successPath: '/repartidor',
    loginPath: '/repartidor/login',
  },
  admin: {
    title: 'Portal Admin',
    successPath: '/admin',
    loginPath: '/admin/login',
  },
};

export default function ResetPassword({ portal }: ResetPasswordProps) {
  const navigate = useNavigate();
  const cfg = portalConfig[portal];

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const passwordsMatch = useMemo(() => password.length > 0 && password === confirm, [password, confirm]);
  const lengthOk = password.length >= 8;

  useEffect(() => {
    document.title = `Recuperar contraseña · ${cfg.title} · GO EXPRESS`;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true);
    });

    // Also check if a session was resumed from recovery link already
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });

    return () => subscription.unsubscribe();
  }, [cfg.title]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!lengthOk) {
      setError('La contraseña debe tener al menos 8 caracteres');
      return;
    }
    if (!passwordsMatch) {
      setError('Las contraseñas no coinciden');
      return;
    }

    setLoading(true);
    try {
      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) throw updateErr;
      setDone(true);
      toast.success('Contraseña actualizada');
      setTimeout(() => navigate(cfg.successPath, { replace: true }), 1400);
    } catch (err) {
      setError((err as Error).message || 'No se pudo actualizar la contraseña. Reintentá.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] as const }}
        className="w-full max-w-sm"
      >
        <div className="flex flex-col items-center mb-8">
          <Isotipo className="w-12 h-12 mb-4" />
          <h1 className="text-xl font-semibold tracking-tight">GO EXPRESS</h1>
          <p className="text-sm text-muted-foreground mt-1">{cfg.title}</p>
        </div>

        {!ready ? (
          <div className="rounded-lg bg-muted/50 p-4 text-center text-[13px] text-muted-foreground space-y-2">
            <p>Abrí este link desde el email que te enviamos.</p>
            <Button variant="outline" size="sm" onClick={() => navigate(cfg.loginPath)}>
              Volver al login
            </Button>
          </div>
        ) : done ? (
          <div className="flex flex-col items-center text-center gap-3 py-6">
            <CheckCircle size={40} weight="duotone" className="text-emerald-500" />
            <p className="text-[14px] font-medium">Contraseña actualizada</p>
            <p className="text-[12px] text-muted-foreground">Redirigiéndote al portal...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive" role="alert">
                {error}
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="new-password">Nueva contraseña</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null); }}
                className="h-11 text-base"
                placeholder="Mínimo 8 caracteres"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Confirmá la contraseña</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => { setConfirm(e.target.value); setError(null); }}
                className="h-11 text-base"
              />
            </div>
            <Button type="submit" className="w-full h-11" disabled={loading || !lengthOk || !passwordsMatch}>
              {loading ? 'Guardando...' : 'Guardar contraseña'}
            </Button>
          </form>
        )}
      </motion.div>
    </div>
  );
}
