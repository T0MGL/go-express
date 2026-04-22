import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, AppError } from '../../middleware/errorHandler.js';
import { validate } from '../../middleware/validate.js';
import { adminWriteLimiter } from '../../middleware/rateLimit.js';
import { supabase } from '../../config/database.js';
import { auditoriaService } from '../../services/auditoria.service.js';
import { notificacionesConfigService } from '../../services/notificacionesConfig.service.js';
import { parseSeguroConfig, validateSeguroConfigInput, SEGURO_DEFAULTS } from '../../lib/seguro.js';
import {
  parseNotificacionesConfig,
  validateNotificacionesConfigInput,
  NOTIFICACIONES_DEFAULTS,
} from '../../lib/notificaciones.js';
import type { ConfiguracionRow } from '../../types/index.js';

const router = Router();

const keyParamSchema = z.object({
  key: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_]+$/, 'Key must be alphanumeric with underscores only'),
});

// Accept string (for legacy simple configs), number, boolean or object (for JSONB structured configs).
// Arrays deliberately excluded: no current config uses array shape.
const updateConfigSchema = z.object({
  value: z.union([
    z.string().min(1).max(5000),
    z.number(),
    z.boolean(),
    z.record(z.unknown()),
  ]),
});

const seguroConfigSchema = z.object({
  umbralIncluido: z.number().int().nonnegative().max(1_000_000_000),
  tasaAdicional: z.number().min(0).max(1),
  minimoAdicional: z.number().int().nonnegative().max(1_000_000_000),
  maximoAsegurable: z.number().int().nonnegative().max(1_000_000_000_000),
});

const notificacionesConfigSchema = z.object({
  envio_creado: z.boolean(),
  recolectado: z.boolean(),
  en_transito: z.boolean(),
  en_reparto: z.boolean(),
  entregado: z.boolean(),
  fallido: z.boolean(),
  problema: z.boolean(),
});

/**
 * GET /: list all config (raw).
 */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const { data, error } = await supabase
      .from('configuracion')
      .select('key, value, updated_at, updated_by')
      .order('key', { ascending: true });

    if (error) {
      throw new AppError('Error fetching configuracion', 500, 'DB_ERROR');
    }

    const configs = ((data ?? []) as ConfiguracionRow[]).map((row) => ({
      key: row.key,
      value: row.value,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
    }));

    res.json(configs);
  })
);

/**
 * GET /seguro: fetch seguro config (typed, with defaults fallback).
 * Admin-only. Cliente portal NEVER reads this directly; it uses its own cliente endpoint
 * that returns only per-envio calculation results, never the raw rates.
 * NOTE: must be declared BEFORE /:key so express route matching resolves the static path first.
 */
router.get(
  '/seguro',
  asyncHandler(async (_req, res) => {
    const { data, error } = await supabase
      .from('configuracion')
      .select('value, updated_at, updated_by')
      .eq('key', 'seguro_config')
      .maybeSingle();

    if (error) {
      throw new AppError('Error fetching seguro config', 500, 'DB_ERROR');
    }

    if (!data) {
      res.json({
        config: { ...SEGURO_DEFAULTS },
        updatedAt: null,
        updatedBy: null,
      });
      return;
    }

    const row = data as { value: unknown; updated_at: string; updated_by: string | null };
    res.json({
      config: parseSeguroConfig(row.value),
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
    });
  })
);

/**
 * PUT /seguro: replace seguro config. Validates structure and writes audit log.
 * NOTE: must be declared BEFORE /:key so express route matching resolves the static path first.
 */
router.put(
  '/seguro',
  validate({ body: seguroConfigSchema }),
  asyncHandler(async (req, res) => {
    let cfg;
    try {
      cfg = validateSeguroConfigInput(req.body);
    } catch (err) {
      throw AppError.badRequest(err instanceof Error ? err.message : 'Invalid seguro config');
    }

    const { data: previous } = await supabase
      .from('configuracion')
      .select('value')
      .eq('key', 'seguro_config')
      .maybeSingle();

    const previousValue = previous ? (previous as { value: unknown }).value : null;

    const { data, error } = await supabase
      .from('configuracion')
      .upsert(
        { key: 'seguro_config', value: cfg, updated_by: req.userId! },
        { onConflict: 'key' }
      )
      .select('value, updated_at, updated_by')
      .single();

    if (error || !data) {
      throw new AppError('Error upserting seguro config', 500, 'DB_ERROR');
    }

    const row = data as { value: unknown; updated_at: string; updated_by: string | null };

    await auditoriaService.log({
      usuario: req.userName ?? 'Admin GoExpress',
      usuarioId: req.userId!,
      accion: 'editar',
      entidad: 'sistema',
      entidadId: 'seguro_config',
      descripcion: 'Configuracion de seguro de envios actualizada',
      valorAnterior: previousValue !== null ? { value: previousValue } : null,
      valorNuevo: { value: cfg },
      ipAddress: req.ip ?? undefined,
      userAgent: req.headers['user-agent'] ?? undefined,
    });

    res.json({
      config: parseSeguroConfig(row.value),
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
    });
  })
);

/**
 * GET /notificaciones: fetch notifications toggles (typed, with defaults fallback).
 * NOTE: must be declared BEFORE /:key so express route matching resolves the static path first.
 */
router.get(
  '/notificaciones',
  asyncHandler(async (_req, res) => {
    const { data, error } = await supabase
      .from('configuracion')
      .select('value, updated_at, updated_by')
      .eq('key', 'notificaciones_config')
      .maybeSingle();

    if (error) {
      throw new AppError('Error fetching notificaciones config', 500, 'DB_ERROR');
    }

    if (!data) {
      res.json({
        config: { ...NOTIFICACIONES_DEFAULTS },
        updatedAt: null,
        updatedBy: null,
      });
      return;
    }

    const row = data as { value: unknown; updated_at: string; updated_by: string | null };
    res.json({
      config: parseNotificacionesConfig(row.value),
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
    });
  })
);

/**
 * PUT /notificaciones: replace the notifications toggles map. Invalidates the in-memory
 * cache so the next email dispatch reads the new values immediately.
 */
router.put(
  '/notificaciones',
  adminWriteLimiter,
  validate({ body: notificacionesConfigSchema }),
  asyncHandler(async (req, res) => {
    let cfg;
    try {
      cfg = validateNotificacionesConfigInput(req.body);
    } catch (err) {
      throw AppError.badRequest(err instanceof Error ? err.message : 'Invalid notificaciones config');
    }

    const { data: previous } = await supabase
      .from('configuracion')
      .select('value')
      .eq('key', 'notificaciones_config')
      .maybeSingle();

    const previousValue = previous ? (previous as { value: unknown }).value : null;

    const { data, error } = await supabase
      .from('configuracion')
      .upsert(
        { key: 'notificaciones_config', value: cfg, updated_by: req.userId! },
        { onConflict: 'key' }
      )
      .select('value, updated_at, updated_by')
      .single();

    if (error || !data) {
      throw new AppError('Error upserting notificaciones config', 500, 'DB_ERROR');
    }

    const row = data as { value: unknown; updated_at: string; updated_by: string | null };

    notificacionesConfigService.invalidate();

    await auditoriaService.log({
      usuario: req.userName ?? 'Admin GoExpress',
      usuarioId: req.userId!,
      accion: 'editar',
      entidad: 'sistema',
      entidadId: 'notificaciones_config',
      descripcion: 'Configuracion de notificaciones por email actualizada',
      valorAnterior: previousValue !== null ? { value: previousValue } : null,
      valorNuevo: { value: cfg },
      ipAddress: req.ip ?? undefined,
      userAgent: req.headers['user-agent'] ?? undefined,
    });

    res.json({
      config: parseNotificacionesConfig(row.value),
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
    });
  })
);

/**
 * PUT /:key: upsert a single config entry. Accepts string, number, boolean or object (JSONB).
 */
router.put(
  '/:key',
  validate({ params: keyParamSchema, body: updateConfigSchema }),
  asyncHandler(async (req, res) => {
    const key = req.params['key'] as string;
    const value = req.body.value as unknown;

    // Hard guard: seguro_config must go through the typed /seguro endpoint so it is validated.
    if (key === 'seguro_config') {
      throw AppError.badRequest('Use PUT /admin/configuracion/seguro to update seguro_config');
    }

    // Hard guard: notificaciones_config must go through the typed /notificaciones endpoint.
    if (key === 'notificaciones_config') {
      throw AppError.badRequest('Use PUT /admin/configuracion/notificaciones to update notificaciones_config');
    }

    const { data: previous } = await supabase
      .from('configuracion')
      .select('value')
      .eq('key', key)
      .maybeSingle();

    const previousValue = previous ? (previous as { value: unknown }).value : null;

    const { data, error } = await supabase
      .from('configuracion')
      .upsert(
        { key, value, updated_by: req.userId! },
        { onConflict: 'key' }
      )
      .select('key, value, updated_at, updated_by')
      .single();

    if (error || !data) {
      throw new AppError('Error upserting config', 500, 'DB_ERROR');
    }

    const result = data as ConfiguracionRow;

    await auditoriaService.log({
      usuario: req.userName ?? 'Admin GoExpress',
      usuarioId: req.userId!,
      accion: 'editar',
      entidad: 'sistema',
      entidadId: key,
      descripcion: `Configuracion "${key}" actualizada`,
      valorAnterior: previousValue !== null ? { value: previousValue } : null,
      valorNuevo: { value },
      ipAddress: req.ip ?? undefined,
      userAgent: req.headers['user-agent'] ?? undefined,
    });

    res.json({
      key: result.key,
      value: result.value,
      updatedAt: result.updated_at,
      updatedBy: result.updated_by,
    });
  })
);

export default router;
