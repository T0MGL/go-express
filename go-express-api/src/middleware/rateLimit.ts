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
 * Strict: 5 requests per minute per IP to mitigate brute-force attacks.
 * Tighter than general API limit because login attempts are high-value targets.
 */
export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: rateLimitResponse,
  message: 'Too many authentication attempts, please try again later',
  keyGenerator: (req) => req.ip ?? 'unknown',
});

/**
 * Auth read-only endpoints rate limiter (/auth/me, /auth/refresh, /auth/logout).
 * High: 300 requests per minute per IP. These endpoints fire on every Supabase
 * auth event (INITIAL_SESSION, TOKEN_REFRESHED) and on multi-tab admins the
 * count scales per-tab. Treating them like mutations caused 429 cascades where
 * the UI lost the profile and AdminOnlyRoute redirected to the dashboard.
 * Still IP-scoped for safety, but loose enough to absorb legitimate bursts.
 */
export const authReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: rateLimitResponse,
  message: 'Too many auth read requests, please try again later',
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
 * 30 connections per minute per IP. Admins and cliente portal users routinely
 * open multiple tabs and reconnect on visibility changes; the previous limit of
 * 5 caused 429 cascades that the UI interpreted as auth failure.
 */
export const sseLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
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

/**
 * Webhook rate limiter (Meta WhatsApp Cloud API).
 * Generous: 600 requests per minute per IP. Meta postea delivery statuses en
 * bursts (1 mensaje = sent + delivered + read = 3 events), y un escenario de
 * 100 envios/dia con 5 status events cada uno cabe holgadamente.
 * No usamos el bypass total que tenia antes porque permitia floodear el endpoint
 * con POST 1MB sin firma (ataque CPU/JSON parse). Cualquier flood real va a
 * disparar 429 antes de gastar handler.
 */
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: rateLimitResponse,
  message: 'Too many webhook requests, please try again later',
  keyGenerator: (req) => req.ip ?? 'unknown',
});

/**
 * API Gateway v1 rate limiter, keyed por API key (no por IP).
 * 60 requests por minuto por key. Integraciones server-to-server suelen salir de una
 * sola IP (o un pool NAT compartido); limitar por IP haria que una key ruidosa ahogue
 * a las demas del mismo datacenter. Se monta DESPUES de requireApiKey, que popula
 * req.apiKeyId; el fallback a IP solo aplica si algo se monta fuera de orden.
 * El generalLimiter (100/min/IP) sigue actuando como piso anti-abuse pre-auth.
 */
export const apiKeyLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: rateLimitResponse,
  message: 'Too many requests for this API key, please try again later',
  keyGenerator: (req) => req.apiKeyId ?? req.ip ?? 'unknown',
});
