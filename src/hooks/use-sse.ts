import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import env from '@/lib/env';

interface SSEEvent {
  entity: string[];
  action: string;
  id?: string;
  estado?: string;
}

const MAX_RECONNECT_DELAY_MS = 30_000;
const BASE_RECONNECT_DELAY_MS = 1_000;

function getReconnectDelay(attempt: number): number {
  const delay = BASE_RECONNECT_DELAY_MS * Math.pow(2, attempt);
  return Math.min(delay, MAX_RECONNECT_DELAY_MS);
}

export function useSSE() {
  const queryClient = useQueryClient();
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const handleEvent = useCallback((event: SSEEvent) => {
    const { entity, id } = event;

    if (!entity || entity.length === 0) return;

    const primary = entity[0];
    const secondary = entity.length > 1 ? entity[1] : null;

    switch (primary) {
      case 'envios': {
        if (secondary === 'list') {
          queryClient.invalidateQueries({ queryKey: ['envios', 'list'] });
          queryClient.invalidateQueries({ queryKey: ['cliente-envios'] });
        } else if (secondary === 'detail' && id) {
          queryClient.invalidateQueries({ queryKey: ['envios', 'detail', id] });
          queryClient.invalidateQueries({ queryKey: ['cliente-envios', 'detail', id] });
        }
        break;
      }
      case 'dashboard': {
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        queryClient.invalidateQueries({ queryKey: ['cliente-dashboard'] });
        break;
      }
      case 'pagos': {
        queryClient.invalidateQueries({ queryKey: ['pagos'] });
        break;
      }
      case 'warehouse': {
        queryClient.invalidateQueries({ queryKey: ['warehouse'] });
        break;
      }
      case 'ciudad': {
        queryClient.invalidateQueries({ queryKey: ['ciudades'] });
        break;
      }
      default:
        break;
    }
  }, [queryClient]);

  const connect = useCallback(async () => {
    if (!mountedRef.current) return;
    if (document.visibilityState === 'hidden') return;

    let { data: { session } } = await supabase.auth.getSession();

    // If the access token expires within 60 seconds, refresh proactively
    // to avoid connecting with a stale token that the backend will reject.
    if (session?.expires_at) {
      const expiresInSec = session.expires_at - Math.floor(Date.now() / 1000);
      if (expiresInSec < 60) {
        const { data } = await supabase.auth.refreshSession();
        session = data.session;
      }
    }

    if (!session?.access_token) return;

    const controller = new AbortController();
    abortRef.current = controller;

    const url = `${env.apiUrl}/events?token=${encodeURIComponent(session.access_token)}`;

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'Accept': 'text/event-stream' },
      });

      if (!response.ok || !response.body) {
        throw new Error(`SSE connection failed: ${response.status}`);
      }

      reconnectAttemptRef.current = 0;

      const reader = response.body.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();
      let buffer = '';

      while (mountedRef.current) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(line.slice(6)) as SSEEvent;
              handleEvent(parsed);
            } catch {
              // Malformed event, skip
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
    }

    readerRef.current = null;
    abortRef.current = null;

    if (!mountedRef.current) return;

    const delay = getReconnectDelay(reconnectAttemptRef.current);
    reconnectAttemptRef.current += 1;
    reconnectTimerRef.current = setTimeout(() => {
      connect();
    }, delay);
  }, [handleEvent]);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    if (readerRef.current) {
      readerRef.current.cancel().catch(() => {});
      readerRef.current = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        disconnect();
        reconnectAttemptRef.current = 0;
        connect();
      } else {
        disconnect();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      mountedRef.current = false;
      disconnect();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [connect, disconnect]);
}
