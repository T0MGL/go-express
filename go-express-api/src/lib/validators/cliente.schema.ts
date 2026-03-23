import { z } from 'zod';
import { phoneSchema, paginationSchema, searchSchema, uuidSchema } from './common.schema.js';

const clienteEstadoEnum = z.enum(['activo', 'inactivo', 'suspendido']);
const clientePlanEnum = z.enum(['basico', 'profesional', 'enterprise']);

export const createClienteSchema = z.object({
  razonSocial: z.string().min(2).max(300),
  ruc: z.string().min(5).max(20), // Paraguayan RUC format
  contactoNombre: z.string().min(2).max(200),
  contactoCargo: z.string().max(100).optional(),
  telefono: phoneSchema,
  email: z.string().min(1).email().max(320),
  direccion: z.string().min(5).max(500),
  ciudad: z.string().min(2).max(100),
  plan: clientePlanEnum.default('basico'),
  notas: z.string().max(2000).optional(),
});

export const updateClienteSchema = createClienteSchema.partial();

export const updateClienteCuentaSchema = createClienteSchema
  .omit({ plan: true, ruc: true })
  .partial();

export const updateClienteEstadoSchema = z.object({
  estado: clienteEstadoEnum,
  motivo: z.string().min(3).max(500).optional(), // Required for suspendido/inactivo
});

export const clienteQuerySchema = paginationSchema.merge(searchSchema).extend({
  estado: clienteEstadoEnum.optional(),
  plan: clientePlanEnum.optional(),
});

export type CreateClienteInput = z.infer<typeof createClienteSchema>;
export type UpdateClienteInput = z.infer<typeof updateClienteSchema>;
export type UpdateClienteCuentaInput = z.infer<typeof updateClienteCuentaSchema>;
export type ClienteQuery = z.infer<typeof clienteQuerySchema>;
