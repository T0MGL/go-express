import { z } from 'zod';
import { paginationSchema, searchSchema, uuidSchema } from './common.schema.js';

const tipoServicioEnum = z.enum(['estandar', 'express', 'economico']);

/**
 * Crear tarifa. Cada extremo entra por id de ciudad (lo que manda el panel) o por nombre
 * (integraciones y cargas viejas). El nombre no es una segunda identidad: el service lo
 * resuelve contra el catalogo y guarda el id, o rechaza con 400 si no resuelve. La base lo
 * respalda con tarifas_ruta_ciudad_resuelta (057), asi que no existe una tarifa viva sin
 * ciudad.
 */
export const createTarifaSchema = z
  .object({
    origenCiudadId: uuidSchema.optional(),
    destinoCiudadId: uuidSchema.optional(),
    origen: z.string().min(1).max(100).optional(),
    destino: z.string().min(1).max(100).optional(),
    tipoServicio: tipoServicioEnum,
    precioBase: z.number().int().positive(),
    pesoBase: z.number().positive().max(999),
    precioPorKgExtra: z.number().int().min(0),
    factorDimensional: z.number().int().min(1000).max(10000).default(5000),
  })
  .refine((v) => v.origenCiudadId || v.origen, {
    message: 'origen requerido (origenCiudadId o origen)',
    path: ['origen'],
  })
  .refine((v) => v.destinoCiudadId || v.destino, {
    message: 'destino requerido (destinoCiudadId o destino)',
    path: ['destino'],
  });

export const updateTarifaSchema = z.object({
  origenCiudadId: uuidSchema.optional(),
  destinoCiudadId: uuidSchema.optional(),
  origen: z.string().min(1).max(100).optional(),
  destino: z.string().min(1).max(100).optional(),
  tipoServicio: tipoServicioEnum.optional(),
  precioBase: z.number().int().positive().optional(),
  pesoBase: z.number().positive().max(999).optional(),
  precioPorKgExtra: z.number().int().min(0).optional(),
  factorDimensional: z.number().int().min(1000).max(10000).optional(),
});

export const tarifaQuerySchema = paginationSchema.merge(searchSchema).extend({
  origen: z.string().max(100).optional(),
  destino: z.string().max(100).optional(),
  tipoServicio: tipoServicioEnum.optional(),
  includeDeleted: z.coerce.boolean().default(false),
  activo: z.coerce.boolean().optional(),
});

// Cotizador request. Acepta el id de ciudad (lo que manda el portal) o el nombre, que se
// resuelve contra el catalogo antes de buscar. Al menos una forma requerida por extremo.
export const cotizarSchema = z
  .object({
    origenCiudadId: uuidSchema.optional(),
    destinoCiudadId: uuidSchema.optional(),
    origen: z.string().min(1).max(100).optional(),
    destino: z.string().min(1).max(100).optional(),
    peso: z.number().positive().max(9999),
    dimensiones: z
      .object({
        largo: z.number().positive().max(999),
        ancho: z.number().positive().max(999),
        alto: z.number().positive().max(999),
      })
      .optional(),
    tipoServicio: tipoServicioEnum.optional(),
  })
  .refine((v) => v.origenCiudadId || v.origen, {
    message: 'origen requerido (origenCiudadId o nombre)',
    path: ['origen'],
  })
  .refine((v) => v.destinoCiudadId || v.destino, {
    message: 'destino requerido (destinoCiudadId o nombre)',
    path: ['destino'],
  });

export type CreateTarifaInput = z.infer<typeof createTarifaSchema>;
export type UpdateTarifaInput = z.infer<typeof updateTarifaSchema>;
export type TarifaQuery = z.infer<typeof tarifaQuerySchema>;
export type CotizarInput = z.infer<typeof cotizarSchema>;
