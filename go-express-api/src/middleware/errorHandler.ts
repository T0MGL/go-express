import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import * as Sentry from '@sentry/node';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

// Structured application error

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details: unknown;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;

    // Maintains proper stack trace in V8
    Error.captureStackTrace(this, this.constructor);
  }

  /** 400 Bad Request */
  static badRequest(message: string, details?: unknown): AppError {
    return new AppError(message, 400, 'BAD_REQUEST', details);
  }

  /** 401 Unauthorized */
  static unauthorized(message = 'Authentication required'): AppError {
    return new AppError(message, 401, 'UNAUTHORIZED');
  }

  /** 403 Forbidden */
  static forbidden(message = 'Insufficient permissions'): AppError {
    return new AppError(message, 403, 'FORBIDDEN');
  }

  /** 404 Not Found */
  static notFound(entity: string, id?: string): AppError {
    const msg = id ? `${entity} with id '${id}' not found` : `${entity} not found`;
    return new AppError(msg, 404, 'NOT_FOUND');
  }

  /** 409 Conflict */
  static conflict(message: string): AppError {
    return new AppError(message, 409, 'CONFLICT');
  }

  /** 422 Unprocessable Entity */
  static unprocessable(message: string, details?: unknown): AppError {
    return new AppError(message, 422, 'UNPROCESSABLE_ENTITY', details);
  }

  /** 429 Too Many Requests */
  static tooManyRequests(message = 'Too many requests'): AppError {
    return new AppError(message, 429, 'TOO_MANY_REQUESTS');
  }
}


interface FormattedZodIssue {
  field: string;
  message: string;
}

function formatZodError(error: ZodError): FormattedZodIssue[] {
  return error.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }));
}

// http-errors (raw-body, body-parser, cors) llega con su propio status 4xx: el
// cliente aborto la conexion, mando un body invalido o excedio el limite. Son
// errores del cliente y no fallas del servidor, asi que responden con su status
// real y no se reportan. Sin esto un bot que corta el request queda como 500.
function clientErrorStatus(err: unknown): number | null {
  if (typeof err !== 'object' || err === null) return null;

  const candidate = err as { status?: unknown; statusCode?: unknown };
  const status = typeof candidate.status === 'number'
    ? candidate.status
    : typeof candidate.statusCode === 'number'
      ? candidate.statusCode
      : null;

  return status !== null && status >= 400 && status < 500 ? status : null;
}

// Must be registered as the last middleware

export function globalErrorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (res.headersSent) {
    logger.warn(
      { path: req.path, method: req.method },
      'Error occurred after headers were already sent'
    );
    return;
  }

  if (err instanceof AppError) {
    logger.warn(
      {
        statusCode: err.statusCode,
        code: err.code,
        message: err.message,
        path: req.path,
        method: req.method,
        requestId: req.headers['x-request-id'],
      },
      'Application error'
    );

    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      ...(err.details !== undefined ? { details: err.details } : {}),
    });
    return;
  }

  if (err instanceof ZodError) {
    const details = formatZodError(err);

    logger.warn(
      {
        path: req.path,
        method: req.method,
        requestId: req.headers['x-request-id'],
        validationErrors: details,
      },
      'Validation error'
    );

    res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details,
    });
    return;
  }

  if (err instanceof SyntaxError && 'body' in err) {
    logger.warn(
      {
        path: req.path,
        method: req.method,
        requestId: req.headers['x-request-id'],
      },
      'Malformed JSON in request body'
    );

    res.status(400).json({
      error: 'Malformed JSON in request body',
      code: 'BAD_REQUEST',
    });
    return;
  }

  const clientStatus = clientErrorStatus(err);
  if (clientStatus !== null) {
    logger.warn(
      {
        statusCode: clientStatus,
        message: err instanceof Error ? err.message : String(err),
        path: req.path,
        method: req.method,
        requestId: req.headers['x-request-id'],
      },
      'Client error'
    );

    res.status(clientStatus).json({
      error: err instanceof Error ? err.message : 'Bad request',
      code: 'BAD_REQUEST',
    });
    return;
  }

  const error = err instanceof Error ? err : new Error(String(err));

  Sentry.captureException(error, {
    extra: { path: req.path, method: req.method, requestId: req.headers['x-request-id'] },
  });

  logger.error(
    {
      err: error,
      path: req.path,
      method: req.method,
      requestId: req.headers['x-request-id'],
    },
    'Unhandled error'
  );

  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    ...(env.NODE_ENV !== 'production' ? { stack: error.stack } : {}),
  });
}

// Catches promise rejections in route handlers

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

export function asyncHandler(fn: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
