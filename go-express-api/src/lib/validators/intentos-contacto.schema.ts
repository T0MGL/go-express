import { z } from 'zod';
import { uuidSchema } from './common.schema.js';

export const intentoContactoTipoEnum = z.enum(['llamada', 'whatsapp', 'visita_fallida']);

export const createIntentoContactoSchema = z.object({
  tipo: intentoContactoTipoEnum,
  descripcion: z.string().trim().max(200).optional(),
});

export const envioIdParamSchema = z.object({
  id: uuidSchema,
});

export type CreateIntentoContactoInput = z.infer<typeof createIntentoContactoSchema>;
