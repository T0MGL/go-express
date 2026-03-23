import pino from 'pino';
import { env } from './env.js';

export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  ...(env.NODE_ENV === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:HH:MM:ss.l',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  serializers: {
    err: pino.stdSerializers.err,
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-cliente-id"]',
      'res.headers["set-cookie"]',
      'req.body.password',
      'req.body.destinatarioTelefono',
      'req.body.destinatarioCedula',
      'req.body.destinatarioDireccion',
      'req.body.destinatarioNombre',
      'req.body.ruc',
      'req.body.telefono',
      'req.body.email',
      'req.body.envios[*].destinatarioTelefono',
      'req.body.envios[*].destinatarioCedula',
      'req.body.envios[*].destinatarioDireccion',
      'req.body.envios[*].destinatarioNombre',
    ],
    censor: '[REDACTED]',
  },
});
