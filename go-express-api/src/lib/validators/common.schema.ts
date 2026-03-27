import { z } from 'zod';

// UUID validation
export const uuidSchema = z.string().uuid('ID must be a valid UUID');

// Pagination query params
export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  page: z.coerce.number().int().min(1).default(1),
  cursor: z.string().uuid().optional(),
});

// Search query param
export const searchSchema = z.object({
  search: z.string().max(200).optional(),
});

// Soft-delete body
export const softDeleteSchema = z.object({
  motivo: z.string().min(3, 'Motivo must be at least 3 characters').max(500),
});

// ID param
export const idParamSchema = z.object({
  id: uuidSchema,
});

// Tracking number param (alphanumeric, 3 to 20 chars; normalized to uppercase for consistent lookup)
export const trackingParamSchema = z.object({
  trackingNumber: z.string().min(3).max(20).regex(/^[A-Za-z0-9]+$/, 'Tracking number must be alphanumeric').transform(v => v.toUpperCase()),
});

// Date range filter
export const dateRangeSchema = z.object({
  fechaDesde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  fechaHasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// Paraguayan phone number
export const phoneSchema = z.string().regex(
  /^\+?595\s?\d{3}\s?\d{3}\s?\d{3}$/,
  'Phone must be in Paraguayan format: +595 XXX XXX XXX'
);

// Optional phone
export const optionalPhoneSchema = phoneSchema.optional().or(z.literal(''));

// Sort order
export const sortSchema = z.object({
  sortBy: z.string().max(50).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * Escape special SQL LIKE pattern characters (%, _) in user input.
 * Prevents users from injecting wildcards into ILIKE queries.
 */
export function escapeLikePattern(input: string): string {
  return input.replace(/[%_\\]/g, (ch) => `\\${ch}`);
}
