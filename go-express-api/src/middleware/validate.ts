import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema, ZodError } from 'zod';
import { AppError } from './errorHandler.js';

/**
 * Schema targets for request validation.
 * Provide one or more Zod schemas to validate the corresponding request property.
 */
interface ValidationSchemas {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
}

/**
 * Express middleware factory for Zod-based request validation.
 *
 * Validates `req.body`, `req.params`, and/or `req.query` against the provided
 * Zod schemas. On success, the raw values are **replaced** with the parsed
 * (cleaned / transformed) output, so downstream handlers receive safe data.
 *
 * On failure, throws an `AppError` with status 400 and formatted Zod details.
 *
 * @example
 * ```ts
 * router.post(
 *   '/envios',
 *   validate({ body: createEnvioSchema }),
 *   createEnvioHandler
 * );
 *
 * router.get(
 *   '/envios/:id',
 *   validate({ params: z.object({ id: z.string().uuid() }) }),
 *   getEnvioHandler
 * );
 * ```
 */
export function validate(schemas: ValidationSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const errors: Array<{ target: string; issues: Array<{ field: string; message: string }> }> = [];

    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (result.success) {
        req.body = result.data;
      } else {
        errors.push({
          target: 'body',
          issues: formatIssues(result.error),
        });
      }
    }

    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (result.success) {
        (req as Request).params = result.data as Record<string, string>;
      } else {
        errors.push({
          target: 'params',
          issues: formatIssues(result.error),
        });
      }
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (result.success) {
        (req as Request).query = result.data as Record<string, string>;
      } else {
        errors.push({
          target: 'query',
          issues: formatIssues(result.error),
        });
      }
    }

    if (errors.length > 0) {
      next(AppError.badRequest('Validation failed', errors));
      return;
    }

    next();
  };
}

function formatIssues(error: ZodError): Array<{ field: string; message: string }> {
  return error.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }));
}
