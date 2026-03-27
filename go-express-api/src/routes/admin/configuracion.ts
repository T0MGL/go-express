import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, AppError } from '../../middleware/errorHandler.js';
import { validate } from '../../middleware/validate.js';
import { supabase } from '../../config/database.js';
import { auditoriaService } from '../../services/auditoria.service.js';
import type { ConfiguracionRow } from '../../types/index.js';

const router = Router();

const keyParamSchema = z.object({
  key: z.string().min(1).max(100),
});

const updateConfigSchema = z.object({
  value: z.string().min(1).max(5000),
});

/**
 * GET /:Get all config
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
 * PUT /:key:Update config value
 */
router.put(
  '/:key',
  validate({ params: keyParamSchema, body: updateConfigSchema }),
  asyncHandler(async (req, res) => {
    const key = req.params['key'] as string;
    const value = req.body.value as string;

    const { data: previous } = await supabase
      .from('configuracion')
      .select('value')
      .eq('key', key)
      .maybeSingle();

    const previousValue = previous ? (previous as { value: string }).value : null;

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
