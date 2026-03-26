import { z } from 'zod';
import { phoneSchema, optionalPhoneSchema, paginationSchema, searchSchema, dateRangeSchema, uuidSchema } from './common.schema.js';

// Envio states enum
const envioEstadoEnum = z.enum(['pendiente', 'recolectado', 'en_transito', 'en_reparto', 'entregado', 'fallido', 'problema']);
const tipoPagoEnum = z.enum(['anticipado', 'contra_entrega', 'cuenta_corriente']);

export const createEnvioSchema = z.object({
  clienteId: uuidSchema,
  codigoReferencia: z.string().max(100).optional(),
  origen: z.string().min(1).max(100),
  destino: z.string().min(1).max(100),

  // Destinatario
  destinatarioNombre: z.string().min(1).max(200),
  destinatarioDireccion: z.string().min(1).max(500),
  destinatarioTelefono: phoneSchema,
  destinatarioTelefono2: optionalPhoneSchema,
  destinatarioCedula: z.string().max(20).optional(),
  destinatarioCiudad: z.string().max(100).optional(),
  destinatarioDepartamento: z.string().max(100).optional(),
  destinatarioBarrio: z.string().max(100).optional(),
  destinatarioReferencia: z.string().max(500).optional(),
  destinatarioUbicacionUrl: z.string().url().max(2000).optional().or(z.literal('')),

  // Paquete
  cantidad: z.number().int().min(1).max(999).default(1),
  producto: z.string().max(500).optional(),
  peso: z.number().positive().max(9999),
  dimensiones: z.object({
    largo: z.number().positive().max(999),
    ancho: z.number().positive().max(999),
    alto: z.number().positive().max(999),
  }).optional(),
  fragil: z.boolean().default(false),
  valorDeclarado: z.number().int().min(0).optional(),

  // Entrega
  instruccionesEntrega: z.string().max(1000).optional(),
  horarioEntrega: z.string().max(100).optional(),
  notas: z.string().max(1000).optional(),

  // Cobro
  costo: z.number().int().min(0),
  montoACobrar: z.number().int().min(0).default(0),
  tipoPago: tipoPagoEnum,

  // Tags
  tags: z.array(z.string().max(50)).max(10).optional(),

  // Tarifa reference
  tarifaId: uuidSchema.optional(),
});

export const updateEnvioEstadoSchema = z.object({
  estado: envioEstadoEnum,
  descripcion: z.string().min(1).max(500),
  ubicacion: z.string().max(200).optional(),
});

export const asignarRepartidorSchema = z.object({
  repartidorId: uuidSchema,
});

export const reportarProblemaSchema = z.object({
  descripcion: z.string().min(5).max(1000),
});

export const agregarNotaSchema = z.object({
  texto: z.string().min(1).max(2000),
});

export const envioQuerySchema = paginationSchema.merge(searchSchema).merge(dateRangeSchema).extend({
  estado: envioEstadoEnum.optional(),
  clienteId: uuidSchema.optional(),
  repartidorId: uuidSchema.optional(),
});

// Bulk import: array of envios
export const bulkImportSchema = z.object({
  envios: z.array(createEnvioSchema).min(1).max(500),
});

export type CreateEnvioInput = z.infer<typeof createEnvioSchema>;
export type UpdateEnvioEstadoInput = z.infer<typeof updateEnvioEstadoSchema>;
export type EnvioQuery = z.infer<typeof envioQuerySchema>;
export type BulkImportInput = z.infer<typeof bulkImportSchema>;
