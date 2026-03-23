import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Package } from 'lucide-react';
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

  // Check if already authenticated as a client
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        // Verify this is a client user
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
    setLoading(true);
    setError(null);

    try {
      // Use the portal-specific login endpoint
      const response = await api.post<PortalLoginResponse>('/auth/portal/login', {
        email,
        password,
      });

      // Set the session in Supabase client so the auth headers work
      await supabase.auth.setSession({
        access_token: response.token,
        refresh_token: response.refreshToken,
      });

      // Store client info for the portal
      sessionStorage.setItem('go_express_cliente', JSON.stringify(response.cliente));

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
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
            <Package className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">GO EXPRESS</h1>
          <p className="text-sm text-muted-foreground mt-1">Portal de clientes</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive"
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
              value={email}
              onChange={e => setEmail(e.target.value)}
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
              value={password}
              onChange={e => setPassword(e.target.value)}
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
