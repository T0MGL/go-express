import { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';


const Login = () => {
  const { login, loading, error, isAuthenticated, user } = useAuth();
  const location = useLocation();
  const isAdminUser = user?.rol === 'admin' || user?.rol === 'operador';

  useEffect(() => {
    if (isAuthenticated && user && !isAdminUser) {
      supabase.auth.signOut();
      localStorage.removeItem('go_express_cliente');
    }
  }, [isAuthenticated, user, isAdminUser]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setLocalError('Ingrese su email');
      return;
    }
    if (password.length < 6) {
      setLocalError('La contrasena debe tener al menos 6 caracteres');
      return;
    }

    setSubmitting(true);
    try {
      await login(trimmedEmail, password);
    } finally {
      setSubmitting(false);
    }
  }

  // While checking auth state, show nothing to prevent flash
  if (loading && !submitting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" role="status" aria-label="Verificando sesión">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isAuthenticated && isAdminUser) {
    const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/admin';
    return <Navigate to={from} replace />;
  }

  const displayError = localError || error;

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
          <p className="text-sm text-muted-foreground mt-1">Panel de administracion</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {displayError && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {displayError}
            </motion.div>
          )}

          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              aria-required="true"
              value={email}
              onChange={e => { setEmail(e.target.value); setLocalError(null); }}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="admin@goexpress.com.py"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium">
              Contrasena
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              aria-required="true"
              minLength={6}
              value={password}
              onChange={e => { setPassword(e.target.value); setLocalError(null); }}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Ingrese su contrasena"
            />
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? (
              <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" aria-label="Iniciando sesión" />
            ) : (
              'Iniciar sesión'
            )}
          </Button>
        </form>
      </motion.div>
    </div>
  );
};

export default Login;
