import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
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
  const profileRetryRef = useRef<ReturnType<typeof setTimeout>>();
  const mountedRef = useRef(true);
  const loginHandledRef = useRef(false);

  const fetchProfile = useCallback(async (_accessToken: string): Promise<AuthUser | null> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const profile = await api.get<AuthUser>('/auth/me', { signal: controller.signal });
      clearTimeout(timeoutId);
      return profile as AuthUser;
    } catch {
      return null;
    }
  }, []);

  const loadProfile = useCallback(async (session: Session, retryCount = 0, skipLoadingState = false) => {
    // When loading from a cached session (INITIAL_SESSION), set loading false
    // immediately so the UI doesn't block. Profile loads in background.
    if (skipLoadingState) {
      setState(prev => ({
        user: prev.user,
        session,
        loading: false,
        error: null,
      }));
    }

    const profile = await fetchProfile(session.access_token);

    if (!mountedRef.current) return;

    if (profile) {
      setState({ user: profile, session, loading: false, error: null });
      return;
    }

    // Profile fetch failed but session is valid: mark as authenticated anyway.
    setState(prev => ({
      user: prev.user,
      session,
      loading: false,
      error: null,
    }));

    if (retryCount < 3) {
      const delay = Math.min(2000 * Math.pow(2, retryCount), 8000);
      profileRetryRef.current = setTimeout(() => {
        if (mountedRef.current) {
          loadProfile(session, retryCount + 1);
        }
      }, delay);
    }
  }, [fetchProfile]);

  useEffect(() => {
    mountedRef.current = true;
    let initialResolved = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mountedRef.current) return;

      if (event === 'SIGNED_OUT' || !session) {
        setState({ user: null, session: null, loading: false, error: null });
        return;
      }

      // Handle all session-bearing events: INITIAL_SESSION, SIGNED_IN, TOKEN_REFRESHED
      if (session) {
        initialResolved = true;

        // If login() already handled the profile, skip the duplicate load
        if (event === 'SIGNED_IN' && loginHandledRef.current) {
          loginHandledRef.current = false;
          return;
        }

        // For INITIAL_SESSION (restoring from localStorage), unblock the UI immediately
        // and load the profile in the background. For other events, load normally.
        const skipLoading = event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED';
        await loadProfile(session, 0, skipLoading);
      }
    });

    // Fallback: if onAuthStateChange never fires INITIAL_SESSION within 100ms,
    // resolve loading to false. This handles edge cases where the listener
    // registers after the event has already fired.
    const fallbackTimer = setTimeout(() => {
      if (!initialResolved && mountedRef.current) {
        supabase.auth.getSession().then(async ({ data: { session } }) => {
          if (!mountedRef.current || initialResolved) return;
          initialResolved = true;
          if (!session) {
            setState({ user: null, session: null, loading: false, error: null });
            return;
          }
          await loadProfile(session, 0, true);
        }).catch(() => {
          if (mountedRef.current && !initialResolved) {
            initialResolved = true;
            setState(prev => ({ ...prev, loading: false }));
          }
        });
      }
    }, 100);

    return () => {
      mountedRef.current = false;
      clearTimeout(fallbackTimer);
      clearTimeout(profileRetryRef.current);
      subscription.unsubscribe();
    };
  }, [loadProfile]);

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

      // Mark that login handled the profile so onAuthStateChange skips duplicate load
      loginHandledRef.current = true;

      const profile = await fetchProfile(data.session.access_token);

      setState({
        user: profile,
        session: data.session,
        loading: false,
        error: profile ? null : 'No se pudo cargar el perfil',
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
    const session = state.session;

    // Clear state immediately for instant UI feedback
    setState({ user: null, session: null, loading: false, error: null });
    clearTimeout(profileRetryRef.current);

    try {
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
    } catch {
      // signOut failure is non-critical, state is already cleared
    }
  }, [state.session]);

  // isAuthenticated is true if we have a session, even if profile hasn't loaded yet.
  // This prevents the login flash: the Supabase session in localStorage is the
  // source of truth for whether the user is logged in.
  const value: AuthContextValue = {
    ...state,
    login,
    logout,
    isAuthenticated: !!state.session,
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
