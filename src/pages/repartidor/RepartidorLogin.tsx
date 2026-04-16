import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useIsStandalone } from '@/hooks/use-is-standalone';
import { InstallAppButton } from '@/components/repartidor/InstallAppButton';
import { ForgotPasswordSheet } from '@/components/auth/ForgotPasswordSheet';

interface RepartidorLoginResponse {
  token: string;
  refreshToken: string;
  expiresAt: number;
  repartidor: {
    id: string;
    nombre: string;
    email: string | null;
    vehiculo: string;
  };
}

const RepartidorLogin = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const isStandalone = useIsStandalone();

  useEffect(() => {
    document.title = 'Portal Repartidor · GO EXPRESS';
  }, []);

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        try {
          const me = await api.get<{ tipo: string }>('/auth/me');
          if (me.tipo === 'repartidor') {
            navigate('/repartidor', { replace: true });
          }
        } catch {
          // not authenticated or not a delivery user
        }
      }
    };
    checkSession();
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Ingresá tu email');
      return;
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    setLoading(true);

    try {
      const response = await api.post<RepartidorLoginResponse>('/auth/repartidor/login', {
        email: trimmedEmail,
        password,
      });

      await supabase.auth.setSession({
        access_token: response.token,
        refresh_token: response.refreshToken,
      });

      localStorage.setItem('go_express_repartidor', JSON.stringify(response.repartidor));

      navigate('/repartidor', { replace: true });
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      setError(apiErr?.data?.error || 'Credenciales inválidas. Revisá tu email y contraseña.');
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
          <img src="/isotipo.png" alt="Go Express" className="w-12 h-12 mb-4" />
          <h1 className="text-xl font-semibold tracking-tight">GO EXPRESS</h1>
          <p className="text-sm text-muted-foreground mt-1">Portal Repartidor</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {error}
            </motion.div>
          )}

          <div className="space-y-2">
            <label htmlFor="rep-email" className="text-sm font-medium">Email</label>
            <input
              id="rep-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null); }}
              className="w-full rounded-md border border-input bg-background px-3 py-3 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="tu-email@ejemplo.com"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="rep-password" className="text-sm font-medium">Contraseña</label>
            <input
              id="rep-password"
              type="password"
              autoComplete="current-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null); }}
              className="w-full rounded-md border border-input bg-background px-3 py-3 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Tu contraseña"
            />
          </div>

          <Button type="submit" className="w-full h-12 text-base" disabled={loading}>
            {loading ? (
              <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
            ) : (
              'Ingresar'
            )}
          </Button>

          <button
            type="button"
            onClick={() => setForgotOpen(true)}
            className="w-full text-[12px] text-muted-foreground hover:text-foreground transition-colors text-center"
          >
            Olvidé mi contraseña
          </button>
        </form>

        <ForgotPasswordSheet
          open={forgotOpen}
          onOpenChange={setForgotOpen}
          redirectPath="/repartidor/reset-password"
          portal="repartidor"
        />

        {!isStandalone && (
          <div className="mt-6 rounded-lg bg-muted/50 p-4 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Consejo</p>
            <p>Agregá esto a la pantalla de inicio para usarlo como una app.</p>
            <InstallAppButton />
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default RepartidorLogin;
