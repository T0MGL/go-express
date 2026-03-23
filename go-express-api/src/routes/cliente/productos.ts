import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, AppError } from '../../middleware/errorHandler.js';
import { validate } from '../../middleware/validate.js';
import { supabase } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { idParamSchema } from '../../lib/validators/common.schema.js';
import type { ProductoGuardadoRow, ProductoGuardado } from '../../types/index.js';

const router = Router();

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const createProductoSchema = z.object({
  nombre: z.string().min(1).max(300),
  descripcion: z.string().max(1000).optional(),
  peso: z.number().positive().max(9999),
  dimensiones: z.object({
    largo: z.number().positive().max(999),
    ancho: z.number().positive().max(999),
    alto: z.number().positive().max(999),
  }),
  fragil: z.boolean().default(false),
  valorDeclarado: z.number().int().min(0).optional(),
});

const updateProductoSchema = createProductoSchema.partial();

type CreateProductoInput = z.infer<typeof createProductoSchema>;
type UpdateProductoInput = z.infer<typeof updateProductoSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapRow(row: ProductoGuardadoRow): ProductoGuardado {
  return {
    id: row.id,
    clienteId: row.cliente_id,
    nombre: row.nombre,
    descripcion: row.descripcion,
    peso: row.peso,
    dimensiones: {
      largo: row.dimensiones_largo,
      ancho: row.dimensiones_ancho,
      alto: row.dimensiones_alto,
    },
    fragil: row.fragil,
    valorDeclarado: row.valor_declarado,
    creadoEn: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// GET / — My saved products
// ---------------------------------------------------------------------------

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const clienteId = req.clienteId!;

    const { data, error } = await supabase
      .from('productos_guardados')
      .select('id, cliente_id, nombre, descripcion, peso, dimensiones_largo, dimensiones_ancho, dimensiones_alto, fragil, valor_declarado, created_at, updated_at')
      .eq('cliente_id', clienteId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error({ error, clienteId }, 'Error fetching products');
      throw new AppError(`Error fetching products: ${error.message}`, 500, 'DB_ERROR');
    }

    res.json({ data: ((data ?? []) as ProductoGuardadoRow[]).map(mapRow) });
  })
);

// ---------------------------------------------------------------------------
// POST / — Create product
// ---------------------------------------------------------------------------

router.post(
  '/',
  validate({ body: createProductoSchema }),
  asyncHandler(async (req, res) => {
    const clienteId = req.clienteId!;
    const input = req.body as CreateProductoInput;

    const insertData = {
      cliente_id: clienteId,
      nombre: input.nombre,
      descripcion: input.descripcion ?? null,
      peso: input.peso,
      dimensiones_largo: input.dimensiones.largo,
      dimensiones_ancho: input.dimensiones.ancho,
      dimensiones_alto: input.dimensiones.alto,
      fragil: input.fragil,
      valor_declarado: input.valorDeclarado ?? 0,
    };

    const { data, error } = await supabase
      .from('productos_guardados')
      .insert(insertData)
      .select('id, cliente_id, nombre, descripcion, peso, dimensiones_largo, dimensiones_ancho, dimensiones_alto, fragil, valor_declarado, created_at, updated_at')
      .single();

    if (error) {
      logger.error({ error, clienteId }, 'Error creating product');
      throw new AppError(`Error creating product: ${error.message}`, 500, 'DB_ERROR');
    }

    res.status(201).json(mapRow(data as ProductoGuardadoRow));
  })
);

// ---------------------------------------------------------------------------
// PUT /:id — Update product (only if mine)
// ---------------------------------------------------------------------------

router.put(
  '/:id',
  validate({ params: idParamSchema, body: updateProductoSchema }),
  asyncHandler(async (req, res) => {
    const clienteId = req.clienteId!;
    const id = req.params['id'] as string;
    const input = req.body as UpdateProductoInput;

    // Build update object — only include provided fields
    const updateData: Record<string, unknown> = {};
    if (input.nombre !== undefined) updateData['nombre'] = input.nombre;
    if (input.descripcion !== undefined) updateData['descripcion'] = input.descripcion;
    if (input.peso !== undefined) updateData['peso'] = input.peso;
    if (input.dimensiones !== undefined) {
      updateData['dimensiones_largo'] = input.dimensiones.largo;
      updateData['dimensiones_ancho'] = input.dimensiones.ancho;
      updateData['dimensiones_alto'] = input.dimensiones.alto;
    }
    if (input.fragil !== undefined) updateData['fragil'] = input.fragil;
    if (input.valorDeclarado !== undefined) updateData['valor_declarado'] = input.valorDeclarado;

    const { data, error } = await supabase
      .from('productos_guardados')
      .update(updateData)
      .eq('id', id)
      .eq('cliente_id', clienteId)
      .select('id, cliente_id, nombre, descripcion, peso, dimensiones_largo, dimensiones_ancho, dimensiones_alto, fragil, valor_declarado, created_at, updated_at')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw AppError.notFound('Producto', id);
      }
      logger.error({ error, clienteId, id }, 'Error updating product');
      throw new AppError(`Error updating product: ${error.message}`, 500, 'DB_ERROR');
    }

    res.json(mapRow(data as ProductoGuardadoRow));
  })
);

// ---------------------------------------------------------------------------
// DELETE /:id — Delete product (hard delete, it's just a template)
// ---------------------------------------------------------------------------

router.delete(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const clienteId = req.clienteId!;
    const id = req.params['id'] as string;

    const { error, count } = await supabase
      .from('productos_guardados')
      .delete()
      .eq('id', id)
      .eq('cliente_id', clienteId);

    if (error) {
      logger.error({ error, clienteId, id }, 'Error deleting product');
      throw new AppError(`Error deleting product: ${error.message}`, 500, 'DB_ERROR');
    }

    if (count === 0) {
      throw AppError.notFound('Producto', id);
    }

    res.status(204).send();
  })
);

export default router;
