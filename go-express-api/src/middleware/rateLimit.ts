import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

/**
 * Rate-limit error response in JSON format (not HTML).
 */
function rateLimitResponse(_req: unknown, res: { status: (code: number) => { json: (body: unknown) => void } }) {
  res.status(429).json({
    error: 'Too many requests, please try again later',
    code: 'TOO_MANY_REQUESTS',
  });
}

/**
 * General API rate limiter.
 * Default: 100 requests per minute per IP (configurable via API_RATE_LIMIT env).
 */
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: env.API_RATE_LIMIT,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: rateLimitResponse,
  message: 'Too many requests, please try again later',
  keyGenerator: (req) => req.ip ?? 'unknown',
});

/**
 * Auth endpoints rate limiter.
 * Strict: 10 requests per minute per IP to mitigate brute-force attacks.
 */
export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: rateLimitResponse,
  message: 'Too many authentication attempts, please try again later',
  keyGenerator: (req) => req.ip ?? 'unknown',
});

/**
 * Public tracking rate limiter.
 * Moderate: 30 requests per minute per IP to prevent enumeration.
 */
export const trackingLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: rateLimitResponse,
  message: 'Too many tracking requests, please try again later',
  keyGenerator: (req) => req.ip ?? 'unknown',
});

/**
 * Bulk operation rate limiter.
 * Very strict: 5 requests per minute per IP for heavy operations (imports, exports).
 */
export const bulkLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: rateLimitResponse,
  message: 'Too many bulk requests, please try again later',
  keyGenerator: (req) => req.ip ?? 'unknown',
});

/**
 * SSE connection rate limiter.
 * Strict: 5 connections per minute per IP (long-lived, memory-intensive).
 */
export const sseLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: rateLimitResponse,
  message: 'Too many SSE connections, please try again later',
  keyGenerator: (req) => req.ip ?? 'unknown',
});

/**
 * Admin write operations rate limiter.
 * 30 mutations per minute per IP to protect against automated abuse.
 */
export const adminWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: rateLimitResponse,
  message: 'Too many admin write requests, please try again later',
  keyGenerator: (req) => req.ip ?? 'unknown',
});
