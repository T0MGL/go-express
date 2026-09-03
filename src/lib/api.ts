import * as Sentry from '@sentry/react';
import env from './env';
import { supabase } from './supabase';

export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public data?: unknown,
  ) {
    super(`API Error ${status}: ${statusText}`);
    this.name = 'ApiError';
  }
}

// Extrae el mensaje de error de un ApiError o cualquier error no tipado, devolviendo
// el fallback cuando no se puede parsear. El backend devuelve { error, code, details }
// vía globalErrorHandler en errorHandler.ts.
export function extractApiError(err: unknown, fallback = 'Ocurrio un error inesperado'): string {
  if (err instanceof ApiError) {
    const data = err.data as { error?: string; message?: string } | null;
    return data?.error || data?.message || err.message || fallback;
  }
  if (err && typeof err === 'object' && 'data' in err) {
    const data = (err as { data?: { error?: string; message?: string } }).data;
    return data?.error || data?.message || fallback;
  }
  if (err instanceof Error) {
    return err.message || fallback;
  }
  return fallback;
}

// Pull the server-provided message when available, fall back to a generic one
// per HTTP code so the operator gets something actionable instead of silence.
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    const data = error.data as { error?: { message?: string }; message?: string } | null;
    const serverMessage = data?.error?.message ?? data?.message;
    if (serverMessage && typeof serverMessage === 'string') return serverMessage;
    switch (error.status) {
      case 400:
      case 422:
        return 'Los datos enviados no son válidos. Revisalos e intentá de nuevo.';
      case 403:
        return 'No tenés permiso para hacer esa acción.';
      case 404:
        return 'No encontramos lo que buscabas. Puede que se haya eliminado.';
      case 409:
        return 'La información cambió mientras trabajabas. Recargá e intentá de nuevo.';
      case 429:
        return 'Demasiadas solicitudes seguidas. Esperá un momento y reintentá.';
      case 500:
      case 502:
      case 503:
      case 504:
        return 'El servidor tuvo un problema. Reintentá en unos segundos.';
    }
    return 'Algo salió mal. Intentá de nuevo.';
  }
  if (error instanceof Error && error.message) {
    if (error.message.toLowerCase().includes('failed to fetch')) {
      return 'No pudimos conectar con el servidor. Revisá tu internet.';
    }
    return error.message;
  }
  return 'Ocurrió un error inesperado.';
}

let currentClienteId: string | null = null;

export function setClienteId(id: string) {
  currentClienteId = id;
}

export function getClienteId(): string | null {
  return currentClienteId;
}

// Token cache: avoids calling supabase.auth.getSession() on every API request.
// The listener below keeps the cache in sync whenever the session changes.
let cachedAccessToken: string | null = null;
let tokenListenerReady = false;

function setupTokenListener() {
  if (tokenListenerReady) return;
  tokenListenerReady = true;
  supabase.auth.onAuthStateChange((_event, session) => {
    cachedAccessToken = session?.access_token ?? null;
  });
  // Seed from current session
  supabase.auth.getSession().then(({ data: { session } }) => {
    cachedAccessToken = session?.access_token ?? null;
  }).catch(() => {});
}

setupTokenListener();

async function getAccessToken(): Promise<string | null> {
  if (cachedAccessToken) return cachedAccessToken;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    cachedAccessToken = session?.access_token ?? null;
    return cachedAccessToken;
  } catch {
    return null;
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${env.apiUrl}${endpoint}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const isPublic = endpoint.startsWith('/public');
  const token = isPublic ? null : await getAccessToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (currentClienteId && endpoint.startsWith('/cliente') && !token) {
    headers['X-Cliente-Id'] = currentClienteId;
  }

  const config: RequestInit = {
    headers: {
      ...headers,
      ...(options.headers as Record<string, string>),
    },
    ...options,
  };

  const response = await fetch(url, config);

  if (response.status === 401 && token) {
    const { data } = await supabase.auth.refreshSession();
    if (data.session) {
      cachedAccessToken = data.session.access_token;
      const retryHeaders = {
        ...config.headers as Record<string, string>,
        'Authorization': `Bearer ${data.session.access_token}`,
      };
      const retryResponse = await fetch(url, { ...config, headers: retryHeaders });
      if (!retryResponse.ok) {
        const retryData = await retryResponse.json().catch(() => null);
        throw new ApiError(retryResponse.status, retryResponse.statusText, retryData);
      }
      if (retryResponse.status === 204) {
        return undefined as T;
      }
      return retryResponse.json();
    }

    Sentry.addBreadcrumb({
      category: 'auth',
      level: 'warning',
      message: 'API 401 and refreshSession returned no session',
      data: { endpoint },
    });

    // Refresh failed. Before clearing the cache, re-read the session from storage:
    // another tab or Supabase's own background refresh may have produced a fresh
    // token in the meantime. Only null the cache if the session is truly gone.
    const { data: { session: recoveredSession } } = await supabase.auth.getSession();
    if (recoveredSession?.access_token) {
      cachedAccessToken = recoveredSession.access_token;
      const retryHeaders = {
        ...config.headers as Record<string, string>,
        'Authorization': `Bearer ${recoveredSession.access_token}`,
      };
      const retryResponse = await fetch(url, { ...config, headers: retryHeaders });
      if (!retryResponse.ok) {
        const retryData = await retryResponse.json().catch(() => null);
        throw new ApiError(retryResponse.status, retryResponse.statusText, retryData);
      }
      if (retryResponse.status === 204) {
        return undefined as T;
      }
      return retryResponse.json();
    }

    cachedAccessToken = null;
  }

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new ApiError(response.status, response.statusText, data);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export const api = {
  get: <T>(endpoint: string, options?: RequestInit) => request<T>(endpoint, options),
  post: <T>(endpoint: string, body: unknown) =>
    request<T>(endpoint, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(endpoint: string, body: unknown) =>
    request<T>(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(endpoint: string, body: unknown) =>
    request<T>(endpoint, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(endpoint: string, body?: unknown) =>
    request<T>(endpoint, {
      method: 'DELETE',
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
};
