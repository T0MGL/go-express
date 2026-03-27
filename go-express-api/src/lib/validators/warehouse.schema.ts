import { z } from 'zod';
import { paginationSchema, searchSchema, uuidSchema } from './common.schema.js';

const estadoAlmacenEnum = z.enum(['recibido', 'en_almacen', 'listo_despacho', 'despachado', 'devuelto']);
const prioridadEnum = z.enum(['normal', 'alta', 'urgente']);

export const ingresoSchema = z.object({
  envioId: uuidSchema.optional(),
  trackingNumber: z.string().min(1).max(20),
  clienteNombre: z.string().min(1).max(300),
  ubicacion: z.string().min(1).max(200),
  zona: z.string().min(1).max(10),
  estante: z.string().max(10).optional(),
  peso: z.number().positive().max(9999),
  dimensiones: z.object({
    largo: z.number().positive().max(999),
    ancho: z.number().positive().max(999),
    alto: z.number().positive().max(999),
  }).optional(),
  notas: z.string().max(1000).optional(),
  prioridad: prioridadEnum.default('normal'),
});

export const despachoSchema = z.object({
  paqueteId: uuidSchema,
  notas: z.string().max(1000).optional(),
});

export const devolucionSchema = z.object({
  paqueteId: uuidSchema,
  ubicacionDestino: z.string().min(1).max(200),
  notas: z.string().max(1000).optional(),
});

export const pickingUpdateSchema = z.object({
  pickeado: z.boolean().optional(),
  empaquetado: z.boolean().optional(),
});

export const inventarioQuerySchema = paginationSchema.merge(searchSchema).extend({
  estadoAlmacen: estadoAlmacenEnum.optional(),
  zona: z.string().max(10).optional(),
  prioridad: prioridadEnum.optional(),
});

export type IngresoInput = z.infer<typeof ingresoSchema>;
export type DespachoInput = z.infer<typeof despachoSchema>;
export type InventarioQuery = z.infer<typeof inventarioQuerySchema>;
