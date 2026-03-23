import { z } from 'zod';
import { phoneSchema, paginationSchema, searchSchema } from './common.schema.js';

const vehiculoTipoEnum = z.enum(['Moto', 'Auto', 'Camioneta']);
const repartidorEstadoEnum = z.enum(['activo', 'inactivo']);

export const createRepartidorSchema = z.object({
  nombre: z.string().min(2).max(200),
  telefono: phoneSchema,
  vehiculo: vehiculoTipoEnum,
  placa: z.string().min(2).max(20),
  licencia: z.string().max(50).optional(),
});

export const updateRepartidorSchema = createRepartidorSchema.partial();

export const repartidorQuerySchema = paginationSchema.merge(searchSchema).extend({
  estado: repartidorEstadoEnum.optional(),
});

export type CreateRepartidorInput = z.infer<typeof createRepartidorSchema>;
export type UpdateRepartidorInput = z.infer<typeof updateRepartidorSchema>;
export type RepartidorQuery = z.infer<typeof repartidorQuerySchema>;
