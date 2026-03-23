import { z } from 'zod';
import { paginationSchema, searchSchema, uuidSchema } from './common.schema.js';

const metodoPagoEnum = z.enum(['efectivo', 'transferencia', 'tarjeta', 'contra_entrega']);
const estadoPagoEnum = z.enum(['pendiente', 'pagado', 'pago_parcial']);

export const createPagoSchema = z.object({
  envioId: uuidSchema,
  montoTotal: z.number().int().positive(),
  montoRecibido: z.number().int().min(0).default(0),
  metodoPago: metodoPagoEnum,
  fechaPago: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  referencia: z.string().max(200).optional(),
  notas: z.string().max(1000).optional(),
});

export const updatePagoSchema = z.object({
  montoRecibido: z.number().int().min(0),
  metodoPago: metodoPagoEnum.optional(),
  fechaPago: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  referencia: z.string().max(200).optional(),
  notas: z.string().max(1000).optional(),
});

export const pagoQuerySchema = paginationSchema.merge(searchSchema).extend({
  estadoPago: estadoPagoEnum.optional(),
  metodoPago: metodoPagoEnum.optional(),
});

export type CreatePagoInput = z.infer<typeof createPagoSchema>;
export type UpdatePagoInput = z.infer<typeof updatePagoSchema>;
export type PagoQuery = z.infer<typeof pagoQuerySchema>;
