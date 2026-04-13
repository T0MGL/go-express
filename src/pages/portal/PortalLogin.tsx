import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Button } from '@/components/ui/button';

import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';

interface PortalLoginResponse {
  token: string;
  refreshToken: string;
  expiresAt: number;
  cliente: {
    id: string;
    razonSocial: string;
    contactoNombre: string;
    email: string;
    portalActivo: boolean;
    portalStatus: string;
  };
}

const PortalLogin = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        try {
          const me = await api.get<{ tipo: string }>('/auth/me');
          if (me.tipo === 'cliente') {
            navigate('/cliente', { replace: true });
          }
        } catch {
          // Not authenticated or not a client
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
      setError('Ingrese su email');
      return;
    }
    if (password.length < 6) {
      setError('La contrasena debe tener al menos 6 caracteres');
      return;
    }

    setLoading(true);

    try {
      const response = await api.post<PortalLoginResponse>('/auth/portal/login', {
        email: trimmedEmail,
        password,
      });

      await supabase.auth.setSession({
        access_token: response.token,
        refresh_token: response.refreshToken,
      });

      localStorage.setItem('go_express_cliente', JSON.stringify(response.cliente));

      navigate('/cliente', { replace: true });
    } catch (err) {
      const apiErr = err as { data?: { error?: string } };
      setError(apiErr?.data?.error || 'Credenciales invalidas. Verifique su email y contrasena.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] as const }}
        className="w-full max-w-sm"
      >
        <div className="flex flex-col items-center mb-8">
          <img src="/isotipo.png" alt="Go Express" className="w-12 h-12 mb-4" />
          <h1 className="text-xl font-semibold tracking-tight">GO EXPRESS</h1>
          <p className="text-sm text-muted-foreground mt-1">Portal de clientes</p>
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
            <label htmlFor="portal-email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="portal-email"
              type="email"
              autoComplete="email"
              required
              aria-required="true"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(null); }}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="su-email@empresa.com"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="portal-password" className="text-sm font-medium">
              Contrasena
            </label>
            <input
              id="portal-password"
              type="password"
              autoComplete="current-password"
              required
              aria-required="true"
              minLength={6}
              value={password}
              onChange={e => { setPassword(e.target.value); setError(null); }}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Ingrese su contrasena"
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
            ) : (
              'Ingresar al portal'
            )}
          </Button>
        </form>

        <p className="text-[11px] text-muted-foreground text-center mt-6">
          Si no tiene acceso al portal, solicite una invitacion a GO EXPRESS.
        </p>
      </motion.div>
    </div>
  );
};

export default PortalLogin;
