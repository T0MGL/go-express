import { z } from 'zod';
import { uuidSchema, paginationSchema, dateRangeSchema } from './common.schema.js';
import { envioEstadoEnum } from './envio.schema.js';

// Fuente de verdad de los permisos del gateway. El CHECK de api_keys.permisos (sql/053)
// lista los mismos valores; si se agrega uno, va en ambos lados.
export const API_KEY_PERMISOS = ['crear_envios', 'consultar_envios', 'consultar_tarifas'] as const;

export const apiKeyPermisoEnum = z.enum(API_KEY_PERMISOS);

export const createApiKeySchema = z.object({
  clienteId: uuidSchema,
  nombre: z.string().trim().min(3).max(100),
  permisos: z
    .array(apiKeyPermisoEnum)
    .min(1)
    .max(API_KEY_PERMISOS.length)
    .transform((p) => [...new Set(p)]),
  // Expiracion opcional al crear (para keys de prueba con vida corta). Default: no expira.
  // Solo fechas futuras: una key que nace muerta es un error del operador, no un caso de uso.
  expiraEn: z
    .string()
    .datetime({ offset: true })
    .refine((d) => new Date(d).getTime() > Date.now(), {
      message: 'expiraEn debe ser una fecha futura',
    })
    .optional(),
});

// Idempotency-Key del POST /api/v1/envios. Charset acotado: va directo a un unique index.
export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, 'Idempotency-Key solo admite letras, numeros, guion y guion bajo');

export const rotarApiKeySchema = z.object({
  // Horas que la key vieja sigue valida tras la rotacion, para que el tercero haga el
  // switch sin corte. Tope 720 (30 dias): mas que eso ya no es una rotacion.
  ventanaHoras: z.number().int().min(1).max(720).default(48),
});

export const apiKeyListQuerySchema = z.object({
  clienteId: uuidSchema.optional(),
});

export const v1EnviosQuerySchema = paginationSchema.merge(dateRangeSchema).extend({
  estado: envioEstadoEnum.optional(),
});

export const v1TarifaQuerySchema = z
  .object({
    origen: z.string().trim().min(1).max(100),
    destino: z.string().trim().min(1).max(100),
    peso: z.coerce.number().positive().max(9999),
    largo: z.coerce.number().positive().max(999).optional(),
    ancho: z.coerce.number().positive().max(999).optional(),
    alto: z.coerce.number().positive().max(999).optional(),
  })
  .refine(
    (v) => {
      const dims = [v.largo, v.ancho, v.alto];
      const presentes = dims.filter((d) => d !== undefined).length;
      return presentes === 0 || presentes === 3;
    },
    { message: 'Dimensiones incompletas: enviar largo, ancho y alto juntos, o ninguno' }
  );

export type ApiKeyPermiso = z.infer<typeof apiKeyPermisoEnum>;
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
export type RotarApiKeyInput = z.infer<typeof rotarApiKeySchema>;
export type ApiKeyListQuery = z.infer<typeof apiKeyListQuerySchema>;
export type V1EnviosQuery = z.infer<typeof v1EnviosQuerySchema>;
export type V1TarifaQuery = z.infer<typeof v1TarifaQuerySchema>;
