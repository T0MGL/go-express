import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { testConnection } from './config/database.js';
import { sseService } from './services/sse.service.js';
import { startPodCleanupScheduler, stopPodCleanupScheduler } from './services/podCleanup.service.js';
import { webhookDispatcher } from './services/webhookDispatcher.service.js';

const server = app.listen(env.PORT, async () => {
  logger.info(
    {
      port: env.PORT,
      environment: env.NODE_ENV,
      corsOrigins: env.CORS_ORIGINS.split(',').map(o => o.trim()).filter(Boolean),
    },
    `GO EXPRESS API running on port ${env.PORT}`
  );

  const dbOk = await testConnection();
  if (!dbOk) {
    logger.error('Database connection failed at startup. API will return 503 on /health until connection is restored.');
  }

  // Rutina de retencion de fotos POD (30 dias). Corre dentro del proceso del API.
  // En test no arranca para no contaminar el env de vitest.
  if (env.NODE_ENV !== 'test') {
    startPodCleanupScheduler();
    // Dispatcher de webhooks salientes (Fase 2). In-process a proposito: el estado vive
    // en webhook_deliveries, asi que no necesita worker aparte y sobrevive restarts.
    webhookDispatcher.start();
  }
});

server.timeout = 30000;
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

function gracefulShutdown(signal: string) {
  logger.info({ signal }, 'Received shutdown signal, closing server...');
  sseService.shutdown();
  stopPodCleanupScheduler();
  webhookDispatcher.stop();

  server.close((err) => {
    if (err) {
      logger.error({ err }, 'Error during server close');
      process.exit(1);
    }

    logger.info('Server closed successfully');
    process.exit(0);
  });

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
