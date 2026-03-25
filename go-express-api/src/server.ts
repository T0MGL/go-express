import 'dotenv/config';
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
import { generalLimiter, authLimiter } from './middleware/rateLimit.js';

import adminRoutes from './routes/admin/index.js';
import clienteRoutes from './routes/cliente/index.js';
import trackingRoutes from './routes/public/tracking.js';
import authRoutes from './routes/auth.js';

const app = express();

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,
}));

const corsOrigins = env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);

app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Cliente-Id'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 3600, // 1 hour
  })
);

app.use((req, res, next) => {
  const requestId = randomUUID();
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
});

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
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.use(generalLimiter);

let dbHealthy = false;

app.get('/health', async (_req, res) => {
  const dbOk = await testConnection();
  dbHealthy = dbOk;
  const status = dbOk ? 'ok' : 'degraded';
  const statusCode = dbOk ? 200 : 503;
  res.status(statusCode).json({
    status,
    database: dbOk ? 'connected' : 'unreachable',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/cliente', clienteRoutes);
app.use('/api/public', trackingRoutes);

app.use((_req, res) => {
  res.status(404).json({
    error: 'Route not found',
    code: 'NOT_FOUND',
  });
});

app.use(globalErrorHandler);

const server = app.listen(env.PORT, async () => {
  logger.info(
    {
      port: env.PORT,
      environment: env.NODE_ENV,
      corsOrigins,
    },
    `GO EXPRESS API running on port ${env.PORT}`
  );

  const dbOk = await testConnection();
  dbHealthy = dbOk;
  if (!dbOk) {
    logger.error('Database connection failed at startup. API will return 503 on /health until connection is restored.');
  }
});

server.timeout = 30000;
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

function gracefulShutdown(signal: string) {
  logger.info({ signal }, 'Received shutdown signal, closing server...');

  server.close((err) => {
    if (err) {
      logger.error({ err }, 'Error during server close');
      process.exit(1);
    }

    logger.info('Server closed successfully');
    process.exit(0);
  });

  // Force shutdown after 10s if graceful close hangs
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason: unknown) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection, shutting down');
  process.exit(1);
});

process.on('uncaughtException', (err: Error) => {
  logger.fatal({ err }, 'Uncaught exception, shutting down');
  process.exit(1);
});

export default app;
