import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, AppError } from '../../middleware/errorHandler.js';
import { validate } from '../../middleware/validate.js';
import { supabase } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { idParamSchema } from '../../lib/validators/common.schema.js';
import type { TagRow, Tag } from '../../types/index.js';

const router = Router();


const createTagSchema = z.object({
  nombre: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a valid hex color (#RRGGBB)'),
});

type CreateTagInput = z.infer<typeof createTagSchema>;


function mapRow(row: TagRow): Tag {
  return {
    id: row.id,
    clienteId: row.cliente_id,
    nombre: row.nombre,
    color: row.color,
    creadoEn: row.created_at,
  };
}

// GET /: my tags (with envio count per tag)

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const clienteId = req.clienteId!;

    const { data: tagsData, error: tagsError } = await supabase
      .from('tags')
      .select('id, cliente_id, nombre, color, created_at')
      .eq('cliente_id', clienteId)
      .order('created_at', { ascending: false });

    if (tagsError) {
      logger.error({ error: tagsError, clienteId }, 'Error fetching tags');
      throw new AppError(`Error fetching tags: ${tagsError.message}`, 500, 'DB_ERROR');
    }

    const tags = ((tagsData ?? []) as TagRow[]).map(mapRow);

    const countMap = new Map<string, number>();

    if (tags.length > 0) {
      const { data: enviosWithTags, error: countError } = await supabase
        .from('envios')
        .select('tags')
        .eq('cliente_id', clienteId)
        .eq('eliminado', false)
        .not('tags', 'eq', '{}');

      if (countError) {
        logger.error({ error: countError, clienteId }, 'Error fetching envio tags for count');
      } else if (enviosWithTags) {
        const tagNameSet = new Set(tags.map((t) => t.nombre));
        for (const row of enviosWithTags as Array<{ tags: string[] }>) {
          for (const tagName of row.tags) {
            if (tagNameSet.has(tagName)) {
              countMap.set(tagName, (countMap.get(tagName) ?? 0) + 1);
            }
          }
        }
      }
    }

    const tagsWithCount = tags.map((tag) => ({
      ...tag,
      envioCount: countMap.get(tag.nombre) ?? 0,
    }));

    res.json({ data: tagsWithCount });
  })
);

// POST /: create tag

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
      .select('id, cliente_id, nombre, color, created_at')
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

router.delete(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const clienteId = req.clienteId!;
    const id = req.params['id'] as string;

    const { data: existing } = await supabase
      .from('tags')
      .select('id')
      .eq('id', id)
      .eq('cliente_id', clienteId)
      .maybeSingle();

    if (!existing) {
      throw AppError.notFound('Tag', id);
    }

    const { error } = await supabase
      .from('tags')
      .delete()
      .eq('id', id)
      .eq('cliente_id', clienteId);

    if (error) {
      logger.error({ error, clienteId, id }, 'Error deleting tag');
      throw new AppError(`Error deleting tag: ${error.message}`, 500, 'DB_ERROR');
    }

    res.status(204).send();
  })
);

export default router;
