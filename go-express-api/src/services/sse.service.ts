import type { Response } from 'express';
import { logger } from '../config/logger.js';

type ConnectionRole = 'admin' | 'operador' | 'cliente';

interface SSEConnection {
  res: Response;
  role: ConnectionRole;
  clienteId: string | null;
  connectedAt: number;
}

interface SSEEvent {
  entity: string[];
  action: string;
  id?: string;
  estado?: string;
}

const HEARTBEAT_INTERVAL_MS = 25_000;
const MAX_CONNECTIONS_PER_USER = 3;

class SSEService {
  private connections = new Map<string, SSEConnection[]>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.startHeartbeat();
  }

  addConnection(res: Response, userId: string, role: ConnectionRole, clienteId: string | null): boolean {
    const existing = this.connections.get(userId) ?? [];

    if (existing.length >= MAX_CONNECTIONS_PER_USER) {
      const oldest = existing.shift();
      if (oldest && !oldest.res.writableEnded) {
        oldest.res.end();
      }
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    res.write(': connected\n\n');

    const conn: SSEConnection = {
      res,
      role,
      clienteId,
      connectedAt: Date.now(),
    };

    existing.push(conn);
    this.connections.set(userId, existing);

    logger.info({ userId, role, activeConnections: this.totalConnections() }, 'SSE connection opened');

    return true;
  }

  removeConnection(userId: string, res: Response): void {
    const conns = this.connections.get(userId);
    if (!conns) return;

    const filtered = conns.filter((c) => c.res !== res);

    if (filtered.length === 0) {
      this.connections.delete(userId);
    } else {
      this.connections.set(userId, filtered);
    }

    logger.info({ userId, activeConnections: this.totalConnections() }, 'SSE connection closed');
  }

  broadcast(event: SSEEvent): void {
    const payload = this.formatEvent(event);
    this.connections.forEach((conns) => {
      for (const conn of conns) {
        this.safeSend(conn, payload);
      }
    });
  }

  broadcastToRole(event: SSEEvent, role: ConnectionRole): void {
    const payload = this.formatEvent(event);
    this.connections.forEach((conns) => {
      for (const conn of conns) {
        if (role === 'admin') {
          if (conn.role === 'admin' || conn.role === 'operador') {
            this.safeSend(conn, payload);
          }
        } else if (conn.role === role) {
          this.safeSend(conn, payload);
        }
      }
    });
  }

  broadcastToCliente(event: SSEEvent, clienteId: string): void {
    const payload = this.formatEvent(event);
    this.connections.forEach((conns) => {
      for (const conn of conns) {
        if (conn.clienteId === clienteId) {
          this.safeSend(conn, payload);
        }
      }
    });
  }

  totalConnections(): number {
    let count = 0;
    this.connections.forEach((conns) => {
      count += conns.length;
    });
    return count;
  }

  shutdown(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    this.connections.forEach((conns) => {
      for (const conn of conns) {
        if (!conn.res.writableEnded) {
          conn.res.end();
        }
      }
    });

    this.connections.clear();
  }

  private formatEvent(event: SSEEvent): string {
    return `data: ${JSON.stringify(event)}\n\n`;
  }

  private safeSend(conn: SSEConnection, payload: string): void {
    if (conn.res.writableEnded) return;

    try {
      conn.res.write(payload);
    } catch {
      // Connection died, will be cleaned up by heartbeat
    }
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.connections.forEach((conns, userId) => {
        const alive: SSEConnection[] = [];

        for (const conn of conns) {
          if (conn.res.writableEnded) {
            continue;
          }

          try {
            conn.res.write(': heartbeat\n\n');
            alive.push(conn);
          } catch {
            // Dead connection, skip
          }
        }

        if (alive.length === 0) {
          this.connections.delete(userId);
        } else if (alive.length !== conns.length) {
          this.connections.set(userId, alive);
        }
      });
    }, HEARTBEAT_INTERVAL_MS);

    this.heartbeatTimer.unref();
  }
}

export const sseService = new SSEService();
