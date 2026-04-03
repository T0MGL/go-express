import * as Sentry from '@sentry/node';
import { env } from './env.js';

const dsn = process.env['SENTRY_DSN'] ?? 'https://fc06a278d94179ebdeba41078b622fc1@o4511073760575488.ingest.us.sentry.io/4511153066868736';

if (dsn) {
  Sentry.init({
    dsn,
    environment: env.NODE_ENV,
    tracesSampleRate: 0.2,
    sendDefaultPii: true,
  });
}

export { Sentry };
