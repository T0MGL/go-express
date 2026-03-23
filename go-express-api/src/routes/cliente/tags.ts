import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, AppError } from '../../middleware/errorHandler.js';
import { validate } from '../../middleware/validate.js';
import { supabase } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { idParamSchema } from '../../lib/validators/common.schema.js';
import type { TagRow, Tag } from '../../types/index.js';

const router = Router();

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const createTagSchema = z.object({
  nombre: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a valid hex color (#RRGGBB)'),
});

type CreateTagInput = z.infer<typeof createTagSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapRow(row: TagRow): Tag {
  return {
    id: row.id,
    clienteId: row.cliente_id,
    nombre: row.nombre,
    color: row.color,
    creadoEn: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// GET / — My tags (with envio count per tag)
// ---------------------------------------------------------------------------

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const clienteId = req.clienteId!;

    // Fetch all tags for this client
    const { data: tagsData, error: tagsError } = await supabase
      .from('tags')
      .select('*')
      .eq('cliente_id', clienteId)
      .order('created_at', { ascending: false });

    if (tagsError) {
      logger.error({ error: tagsError, clienteId }, 'Error fetching tags');
      throw new AppError(`Error fetching tags: ${tagsError.message}`, 500, 'DB_ERROR');
    }

    const tags = ((tagsData ?? []) as TagRow[]).map(mapRow);

    // For each tag, count envios that have this tag
    // Using the tags array column on envios
    const tagsWithCount = await Promise.all(
      tags.map(async (tag) => {
        const { count, error: countError } = await supabase
          .from('envios')
          .select('id', { count: 'exact', head: true })
          .eq('cliente_id', clienteId)
          .contains('tags', [tag.nombre]);

        if (countError) {
          logger.error({ error: countError, clienteId, tagNombre: tag.nombre }, 'Error counting envios for tag');
        }

        return {
          ...tag,
          envioCount: count ?? 0,
        };
      })
    );

    res.json({ data: tagsWithCount });
  })
);

// ---------------------------------------------------------------------------
// POST / — Create tag
// ---------------------------------------------------------------------------

router.post(
  '/',
  validate({ body: createTagSchema }),
  asyncHandler(async (req, res) => {
    const clienteId = req.clienteId!;
    const input = req.body as CreateTagInput;

    const { data, error } = await supabase
      .from('tags')
      .insert({
        cliente_id: clienteId,
        nombre: input.nombre,
        color: input.color,
      })
      .select('*')
      .single();

    if (error) {
      // UNIQUE(cliente_id, nombre) constraint violation
      if (error.code === '23505') {
        throw AppError.conflict(`Tag "${input.nombre}" already exists`);
      }
      logger.error({ error, clienteId }, 'Error creating tag');
      throw new AppError(`Error creating tag: ${error.message}`, 500, 'DB_ERROR');
    }

    res.status(201).json({ data: mapRow(data as TagRow) });
  })
);

// ---------------------------------------------------------------------------
// DELETE /:id — Delete tag (only if mine)
// ---------------------------------------------------------------------------

router.delete(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const clienteId = req.clienteId!;
    const id = req.params['id'] as string;

    const { error, count } = await supabase
      .from('tags')
      .delete()
      .eq('id', id)
      .eq('cliente_id', clienteId);

    if (error) {
      logger.error({ error, clienteId, id }, 'Error deleting tag');
      throw new AppError(`Error deleting tag: ${error.message}`, 500, 'DB_ERROR');
    }

    if (count === 0) {
      throw AppError.notFound('Tag', id);
    }

    res.status(204).send();
  })
);

export default router;
