import 'dotenv/config';
import { Sentry } from './config/sentry.js';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';

import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { testConnection } from './config/database.js';
import { globalErrorHandler } from './middleware/errorHandler.js';
import { generalLimiter, authLimiter, authReadLimiter, sseLimiter, adminWriteLimiter, webhookLimiter } from './middleware/rateLimit.js';

import adminRoutes from './routes/admin/index.js';
import clienteRoutes from './routes/cliente/index.js';
import trackingRoutes from './routes/public/tracking.js';
import publicTarifaRoutes from './routes/public/tarifas.js';
import publicCiudadRoutes from './routes/public/ciudades.js';
import webhookRoutes from './routes/public/webhooks.js';
import repartidorRoutes from './routes/repartidor/index.js';
import authRoutes from './routes/auth.js';
import sseRoutes from './routes/sse.js';

const app = express();

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", ...env.CORS_ORIGINS.split(',').map(o => o.trim()).filter(Boolean), env.SUPABASE_URL],
      fontSrc: ["'self'", 'https:', 'data:'],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  next();
});

const corsOrigins = env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);

// Origen permitido: la lista explicita de CORS_ORIGINS (dev/localhost, previews) mas cualquier
// subdominio de goexpressparaguay.com (www, app, bare). Asi un CORS_ORIGINS incompleto en el
// entorno no rompe el panel: el dominio propio y sus subdominios quedan siempre habilitados.
const PROD_DOMAIN = /^https:\/\/([a-z0-9-]+\.)*goexpressparaguay\.com$/;
const isAllowedOrigin = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void): void => {
  if (!origin || corsOrigins.includes(origin) || PROD_DOMAIN.test(origin)) {
    callback(null, true);
    return;
  }
  callback(new Error(`Origin ${origin} no permitido por CORS`));
};

app.use(
  cors({
    origin: isAllowedOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Cliente-Id'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 3600,
  })
);

app.use((req, res, next) => {
  const requestId = randomUUID();
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
});

if (env.NODE_ENV !== 'test') {
  app.use(
    (pinoHttp as unknown as typeof pinoHttp.default)({
      logger,
      autoLogging: {
        ignore: (req: IncomingMessage) => req.url === '/health',
      },
      customProps: (req: IncomingMessage) => ({
        requestId: req.headers['x-request-id'],
      }),
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie'],
        censor: '[REDACTED]',
      },
      customLogLevel: (_req: IncomingMessage, res: { statusCode: number }) => {
        if (res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      customReceivedMessage: (req: IncomingMessage) => {
        const url = req.url?.replace(/token=[^&]+/, 'token=[REDACTED]') ?? req.url;
        return `${req.method} ${url}`;
      },
      customSuccessMessage: (req: IncomingMessage, res: { statusCode: number }) => {
        const url = req.url?.replace(/token=[^&]+/, 'token=[REDACTED]') ?? req.url;
        return `${req.method} ${url} ${res.statusCode}`;
      },
    })
  );
}

// El verify callback se ejecuta antes de parsear JSON. Guardamos el raw body
// solo para webhooks publicos: Meta firma cada POST con HMAC-SHA256 sobre el
// body crudo, y la firma no se puede recalcular desde el JSON ya parseado (orden
// de keys, espacios, etc). El resto del API no necesita rawBody, no lo guardamos
// para no duplicar memoria.
app.use(express.json({
  limit: '1mb',
  verify: (req: IncomingMessage & { rawBody?: Buffer }, _res, buf: Buffer) => {
    if (req.url?.startsWith('/api/public/webhooks/')) {
      req.rawBody = Buffer.from(buf);
    }
  },
}));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Global limiter covers the non-auth surface. /api/auth tiene sus propios
// limiters tunneados mas abajo (strict para credentials, loose para reads).
// /api/public/webhooks usa webhookLimiter dedicado (600/min/IP): Meta postea
// statuses en bursts desde un pool reducido de IPs y dispararia 429 con el
// limit general de 100. Anteriormente bypaseabamos totalmente, pero el HMAC
// se valida despues de express.json (1MB cap), entonces un atacante podia
// gastar CPU+JSON-parse a voluntad. Ahora hay piso anti-abuse sin pisar a Meta.
if (env.NODE_ENV !== 'test') {
  app.use('/api/public/webhooks', webhookLimiter);
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/auth/')) return next();
    if (req.path.startsWith('/api/public/webhooks/')) return next();
    return generalLimiter(req, res, next);
  });
}

app.get('/health', async (_req, res) => {
  const dbOk = await testConnection();
  const status = dbOk ? 'ok' : 'degraded';
  const statusCode = dbOk ? 200 : 503;
  res.status(statusCode).json({
    status,
    database: dbOk ? 'connected' : 'unreachable',
    timestamp: new Date().toISOString(),
  });
});

// Credential-bearing endpoints: 5/min per IP for brute-force protection.
const authStrictPaths = ['/api/auth/login', '/api/auth/portal/login', '/api/auth/repartidor/login', '/api/auth/forgot-password'];
// Read-only session endpoints: 300/min per IP. Fired on every INITIAL_SESSION
// and TOKEN_REFRESHED event, and per tab in multi-tab admins.
const authReadPaths = ['/api/auth/me', '/api/auth/refresh', '/api/auth/logout'];
if (env.NODE_ENV !== 'test') {
  authStrictPaths.forEach((p) => app.use(p, authLimiter));
  authReadPaths.forEach((p) => app.use(p, authReadLimiter));
}
app.use('/api/auth', authRoutes);
app.use('/api/events', env.NODE_ENV !== 'test' ? sseLimiter : (_r, _s, n) => n(), sseRoutes);
app.use('/api/admin', (req, res, next) => {
  if (env.NODE_ENV !== 'test' && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return adminWriteLimiter(req, res, next);
  }
  next();
}, adminRoutes);
app.use('/api/cliente', clienteRoutes);
app.use('/api/repartidor', repartidorRoutes);
app.use('/api/public/tarifas', publicTarifaRoutes);
app.use('/api/public/ciudades', publicCiudadRoutes);
app.use('/api/public/webhooks', webhookRoutes);
app.use('/api/public', trackingRoutes);

app.use((_req, res) => {
  res.status(404).json({
    error: 'Route not found',
    code: 'NOT_FOUND',
  });
});

Sentry.setupExpressErrorHandler(app);

app.use(globalErrorHandler);

export { app, corsOrigins };
export default app;
