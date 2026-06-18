import { z } from 'zod';
import { paginationSchema, uuidSchema, dateRangeSchema } from './common.schema.js';

export const estadoLiquidacionEnum = z.enum(['pendiente', 'cerrada', 'con_diferencia']);

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha debe estar en formato YYYY-MM-DD');

// Crear liquidacion: admin elige repartidor y rango. El RPC calcula monto esperado a partir
// de los envios COD entregados del rango (TZ Asuncion). fechaDesde/fechaHasta son dias PY.
export const crearLiquidacionSchema = z
  .object({
    repartidorId: uuidSchema,
    fechaDesde: dateSchema,
    fechaHasta: dateSchema,
  })
  .refine((v) => v.fechaHasta >= v.fechaDesde, {
    message: 'fechaHasta debe ser mayor o igual a fechaDesde',
    path: ['fechaHasta'],
  });

// Cerrar liquidacion: admin pesa el efectivo fisico del repartidor y lo ingresa.
// La nota es opcional cuando cierra sin diferencia, el RPC la exige (>= 10 chars) cuando hay
// diferencia. Lo validamos tambien aca como defensa temprana, pero la decision final la
// toma el RPC porque solo alli se conoce el monto esperado real.
export const cerrarLiquidacionSchema = z.object({
  montoRecibido: z.number().int().min(0, 'montoRecibido debe ser >= 0'),
  notas: z.string().trim().max(500, 'notas no puede exceder 500 caracteres').optional(),
});

export const liquidacionQuerySchema = paginationSchema.merge(dateRangeSchema).extend({
  repartidorId: uuidSchema.optional(),
  estado: estadoLiquidacionEnum.optional(),
});

// Reabrir una liquidacion cerrada o con_diferencia: vuelve a pendiente, des-concilia sus envios
// y habilita la correccion del cobro. Operacion forense de admin: exige un motivo de al menos
// 10 caracteres que queda en auditoria_log.
export const reabrirLiquidacionSchema = z.object({
  motivo: z.string().trim().min(10, 'El motivo debe tener al menos 10 caracteres').max(500),
});

export type CrearLiquidacionInput = z.infer<typeof crearLiquidacionSchema>;
export type CerrarLiquidacionInput = z.infer<typeof cerrarLiquidacionSchema>;
export type LiquidacionQuery = z.infer<typeof liquidacionQuerySchema>;
export type ReabrirLiquidacionInput = z.infer<typeof reabrirLiquidacionSchema>;
