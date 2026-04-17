import * as Sentry from '@sentry/node';
import { env } from './env.js';
import { logger } from './logger.js';

const dsn = process.env['SENTRY_DSN'];

if (dsn) {
  Sentry.init({
    dsn,
    environment: env.NODE_ENV,
    tracesSampleRate: 0.2,
    sendDefaultPii: false,
  });
} else if (env.NODE_ENV === 'production') {
  logger.warn('SENTRY_DSN not set, error tracking disabled');
}

export { Sentry };
