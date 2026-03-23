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

// Cliente context for portal routes (fallback when not using JWT auth)
let currentClienteId: string | null = env.isDev ? 'cli1' : null;

export function setClienteId(id: string) {
  currentClienteId = id;
}

export function getClienteId(): string | null {
  return currentClienteId;
}

async function getAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${env.apiUrl}${endpoint}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Add auth token
  const token = await getAccessToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Add X-Cliente-Id for cliente portal endpoints (fallback for dev)
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

  // Handle 401: token might be expired, try refresh
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
        throw new ApiError(retryResponse.status, retryResponse.statusText, retryData);
      }
      if (retryResponse.status === 204) {
        return undefined as T;
      }
      return retryResponse.json();
    }
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
  get: <T>(endpoint: string) => request<T>(endpoint),
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
