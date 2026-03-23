import { z } from 'zod';
import { paginationSchema, searchSchema } from './common.schema.js';

const tipoServicioEnum = z.enum(['estandar', 'express', 'economico']);

export const createTarifaSchema = z.object({
  origen: z.string().min(1).max(100),
  destino: z.string().min(1).max(100),
  tipoServicio: tipoServicioEnum,
  precioBase: z.number().int().positive(),
  pesoBase: z.number().positive().max(999),
  precioPorKgExtra: z.number().int().min(0),
  factorDimensional: z.number().int().min(1000).max(10000).default(5000),
});

export const updateTarifaSchema = createTarifaSchema.partial();

export const tarifaQuerySchema = paginationSchema.merge(searchSchema).extend({
  origen: z.string().max(100).optional(),
  destino: z.string().max(100).optional(),
  tipoServicio: tipoServicioEnum.optional(),
  includeDeleted: z.coerce.boolean().default(false),
  activo: z.coerce.boolean().optional(),
});

// Cotizador request
export const cotizarSchema = z.object({
  origen: z.string().min(1).max(100),
  destino: z.string().min(1).max(100),
  peso: z.number().positive().max(9999),
  dimensiones: z.object({
    largo: z.number().positive().max(999),
    ancho: z.number().positive().max(999),
    alto: z.number().positive().max(999),
  }).optional(),
  tipoServicio: tipoServicioEnum.optional(),
});

export type CreateTarifaInput = z.infer<typeof createTarifaSchema>;
export type UpdateTarifaInput = z.infer<typeof updateTarifaSchema>;
export type TarifaQuery = z.infer<typeof tarifaQuerySchema>;
export type CotizarInput = z.infer<typeof cotizarSchema>;
