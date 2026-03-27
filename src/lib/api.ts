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
      const retryHeaders = {
        ...config.headers as Record<string, string>,
        'Authorization': `Bearer ${data.session.access_token}`,
      };
      const retryResponse = await fetch(url, { ...config, headers: retryHeaders });
      if (!retryResponse.ok) {
        const retryData = await retryResponse.json().catch(() => null);
        if (retryResponse.status === 401 || retryResponse.status === 403) {
          await supabase.auth.signOut();
        }
        throw new ApiError(retryResponse.status, retryResponse.statusText, retryData);
      }
      if (retryResponse.status === 204) {
        return undefined as T;
      }
      return retryResponse.json();
    }

    // Refresh failed: session is expired, sign out
    await supabase.auth.signOut();
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
