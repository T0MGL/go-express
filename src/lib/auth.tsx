import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { supabase } from './supabase';
import { api } from './api';
import type { Session } from '@supabase/supabase-js';

interface AuthUser {
  id: string;
  nombre: string;
  email: string;
  rol: 'admin' | 'operador';
}

interface AuthState {
  user: AuthUser | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
    error: null,
  });

  const fetchProfile = useCallback(async (_accessToken: string): Promise<AuthUser | null> => {
    try {
      const timeout = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('profile_timeout')), 5000)
      );
      const profile = await Promise.race([api.get<AuthUser>('/auth/me'), timeout]);
      return profile as AuthUser;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    // getSession() reads from localStorage — no network required, resolves immediately
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;
      if (!session) {
        setState({ user: null, session: null, loading: false, error: null });
        return;
      }
      const profile = await fetchProfile(session.access_token);
      if (mounted) {
        setState({ user: profile, session, loading: false, error: null });
      }
    }).catch(() => {
      if (mounted) setState(prev => ({ ...prev, loading: false }));
    });

    // onAuthStateChange handles subsequent events (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      if (event === 'SIGNED_OUT' || !session) {
        setState({ user: null, session: null, loading: false, error: null });
        return;
      }

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        const profile = await fetchProfile(session.access_token);
        if (mounted) {
          setState({ user: profile, session, loading: false, error: null });
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const login = useCallback(async (email: string, password: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error || !data.session) {
        setState(prev => ({
          ...prev,
          loading: false,
          error: error?.message ?? 'Credenciales invalidas',
        }));
        return;
      }

      const profile = await fetchProfile(data.session.access_token);

      setState({
        user: profile,
        session: data.session,
        loading: false,
        error: null,
      });
    } catch (err) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Error de autenticacion',
      }));
    }
  }, [fetchProfile]);

  const logout = useCallback(async () => {
    try {
      const session = state.session;
      if (session?.access_token) {
        try {
          await fetch(`${import.meta.env.VITE_API_URL || '/api'}/auth/logout`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
          });
        } catch {
          // Non-critical, proceed with client-side logout
        }
      }

      await supabase.auth.signOut();
    } finally {
      setState({ user: null, session: null, loading: false, error: null });
    }
  }, [state.session]);

  const value: AuthContextValue = {
    ...state,
    login,
    logout,
    isAuthenticated: !!state.user && !!state.session,
    isAdmin: state.user?.rol === 'admin',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
