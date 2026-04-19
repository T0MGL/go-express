import { z } from 'zod';
import { paginationSchema, uuidSchema, dateRangeSchema } from './common.schema.js';

export const tipoMovimientoCcEnum = z.enum([
  'debito',
  'credito',
  'ajuste',
  'nota_credito',
  'reverso',
]);

// Ajuste: monto positivo o negativo (excepto 0). Lo positivo aumenta deuda del cliente,
// negativo la reduce. Caso de uso: corregir errores manuales de carga, asentar saldos
// iniciales al onboarding, etc.
export const crearAjusteSchema = z.object({
  monto: z
    .number()
    .int('monto debe ser entero (Gs)')
    .refine((v) => v !== 0, { message: 'monto no puede ser cero' }),
  descripcion: z.string().min(10, 'descripcion debe tener al menos 10 caracteres').max(1000),
  envioId: uuidSchema.optional(),
});

// Nota de credito: el operador ingresa el monto positivo (ej: 50000) y el ledger lo asienta
// como negativo (-50000). Reduce deuda del cliente. Caso de uso: bonificacion comercial,
// devolucion documentada, error de facturacion.
export const crearNotaCreditoSchema = z.object({
  monto: z
    .number()
    .int('monto debe ser entero (Gs)')
    .positive('monto debe ser positivo'),
  descripcion: z.string().min(10, 'descripcion debe tener al menos 10 caracteres').max(1000),
  envioId: uuidSchema.optional(),
});

export const movimientoQuerySchema = paginationSchema.merge(dateRangeSchema).extend({
  tipo: tipoMovimientoCcEnum.optional(),
  envioId: uuidSchema.optional(),
});

// Override para crear envio cuenta_corriente saltando el limite (admin only).
// Requiere motivo. Aplica solo cuando se enviaria un POST con tipo_pago=cuenta_corriente
// y el saldo + costo excederia el limite_credito configurado.
export const forzarSobreLimiteSchema = z.object({
  forzarSobreLimite: z.boolean().default(false),
  motivoOverride: z.string().min(10).max(500).optional(),
});

export const updateLimiteCreditoSchema = z.object({
  limiteCredito: z.number().int().min(0).max(99_999_999_999),
  motivo: z.string().min(5).max(500),
});

export type CrearAjusteInput = z.infer<typeof crearAjusteSchema>;
export type CrearNotaCreditoInput = z.infer<typeof crearNotaCreditoSchema>;
export type MovimientoQuery = z.infer<typeof movimientoQuerySchema>;
export type ForzarSobreLimiteInput = z.infer<typeof forzarSobreLimiteSchema>;
export type UpdateLimiteCreditoInput = z.infer<typeof updateLimiteCreditoSchema>;
