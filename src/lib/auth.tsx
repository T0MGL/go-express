import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import * as Sentry from '@sentry/react';
import { supabase } from './supabase';
import env from './env';
import type { Session } from '@supabase/supabase-js';

interface AuthUser {
  id: string;
  nombre: string;
  email: string;
  rol: 'admin' | 'operador' | 'cliente' | 'repartidor';
  razonSocial?: string;
  vehiculo?: string;
}

// Profile cache eliminates the race where INITIAL_SESSION sets loading=false
// before /auth/me resolves: AdminOnlyRoute saw isAdmin=false and redirected.
// Cached entries are scoped to the Supabase user id, so a new login or signout
// cannot leak a previous user's profile. Server still re-validates estado/rol
// on every admin request via adminAuth middleware, so stale rol cannot grant
// real privilege: the worst case is a momentary UI render before the real
// API call rejects.
const PROFILE_CACHE_PREFIX = 'goexpress:profile:';

function profileCacheKey(userId: string): string {
  return `${PROFILE_CACHE_PREFIX}${userId}`;
}

function readCachedProfile(userId: string): AuthUser | null {
  try {
    const raw = localStorage.getItem(profileCacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthUser;
    if (parsed.id && parsed.rol && parsed.email) return parsed;
    return null;
  } catch {
    return null;
  }
}

function writeCachedProfile(userId: string, user: AuthUser): void {
  try {
    localStorage.setItem(profileCacheKey(userId), JSON.stringify(user));
  } catch {
    // Storage unavailable (private mode, quota): cache is best-effort
  }
}

function clearProfileCache(userId?: string): void {
  try {
    if (userId) {
      localStorage.removeItem(profileCacheKey(userId));
      return;
    }
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(PROFILE_CACHE_PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // Storage unavailable
  }
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

  const fetchProfile = useCallback(async (accessToken: string): Promise<AuthUser | null | 'rate_limited'> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${env.apiUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (response.status === 429) return 'rate_limited';
      if (!response.ok) return null;
      return (await response.json()) as AuthUser;
    } catch {
      return null;
    }
  }, []);

  const loadProfile = useCallback(async (session: Session, retryCount = 0, skipLoadingState = false) => {
    // On the fast path (INITIAL_SESSION / TOKEN_REFRESHED), hydrate from cache
    // synchronously so AdminOnlyRoute sees isAdmin=true before the network
    // round-trip resolves. Cache is keyed by the Supabase user id, so it only
    // applies to the same user.
    const cached = readCachedProfile(session.user.id);
    if (skipLoadingState) {
      setState(prev => ({
        user: cached ?? prev.user,
        session,
        loading: false,
        error: null,
      }));
    }

    const profile = await fetchProfile(session.access_token);

    if (!mountedRef.current) return;

    if (profile && profile !== 'rate_limited') {
      writeCachedProfile(session.user.id, profile);
      setState({ user: profile, session, loading: false, error: null });
      return;
    }

    // Profile fetch failed (429 or transient): keep cached user if any,
    // otherwise leave the previous state. Session stays valid.
    setState(prev => ({
      user: cached ?? prev.user,
      session,
      loading: false,
      error: null,
    }));

    // Don't retry on 429, the next TOKEN_REFRESHED (or a manual action) will
    // try again. Retrying immediately only amplifies the limit.
    if (profile !== 'rate_limited' && retryCount < 3) {
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
        // Before clearing the auth state, double-check that the session is truly
        // gone from storage. Supabase can fire spurious SIGNED_OUT events when a
        // background-tab token refresh races with the internal recovery cycle.
        // If the storage still holds a valid session, ignore the SIGNED_OUT event
        // and let the next TOKEN_REFRESHED event restore normal state.
        if (event === 'SIGNED_OUT') {
          try {
            const { data: { session: storedSession } } = await supabase.auth.getSession();
            if (storedSession) {
              Sentry.addBreadcrumb({
                category: 'auth',
                level: 'info',
                message: 'Spurious SIGNED_OUT ignored, session still present',
              });
              await loadProfile(storedSession, 0, true);
              return;
            }
          } catch {
            // Storage read failed, proceed with sign-out
          }
        }
        Sentry.addBreadcrumb({
          category: 'auth',
          level: 'warning',
          message: 'Auth state cleared',
          data: { event, hasSession: !!session },
        });
        clearProfileCache();
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
      const resolvedProfile = profile && profile !== 'rate_limited' ? profile : null;

      if (resolvedProfile) {
        writeCachedProfile(data.session.user.id, resolvedProfile);
      }

      setState({
        user: resolvedProfile,
        session: data.session,
        loading: false,
        error: resolvedProfile ? null : 'No se pudo cargar el perfil',
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
    clearProfileCache();
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
