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
import { generalLimiter, authLimiter, sseLimiter, adminWriteLimiter } from './middleware/rateLimit.js';

import adminRoutes from './routes/admin/index.js';
import clienteRoutes from './routes/cliente/index.js';
import trackingRoutes from './routes/public/tracking.js';
import publicTarifaRoutes from './routes/public/tarifas.js';
import publicCiudadRoutes from './routes/public/ciudades.js';
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

app.use(
  cors({
    origin: corsOrigins,
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

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

if (env.NODE_ENV !== 'test') {
  app.use(generalLimiter);
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

// Login/forgot-password: strict limit (brute-force protection, 5/min).
// /me, /refresh, /logout: general limit (100/min) — called on every page load
// and token refresh, the strict limit caused 429 cascade loops.
const authStrictPaths = ['/api/auth/login', '/api/auth/portal/login', '/api/auth/repartidor/login', '/api/auth/forgot-password'];
if (env.NODE_ENV !== 'test') {
  authStrictPaths.forEach((p) => app.use(p, authLimiter));
}
app.use('/api/auth', env.NODE_ENV !== 'test' ? generalLimiter : (_r, _s, n) => n(), authRoutes);
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
