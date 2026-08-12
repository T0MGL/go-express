import { z } from 'zod';
import { phoneSchema, optionalPhoneSchema, paginationSchema, searchSchema, dateRangeSchema, uuidSchema } from './common.schema.js';

// Envio states enum. Exportado: el filtro de estado del API v1 (api-key.schema.ts) reusa
// exactamente este contrato para no divergir cuando aparezca un estado nuevo.
export const envioEstadoEnum = z.enum(['pendiente', 'recolectado', 'en_transito', 'en_deposito', 'en_reparto', 'entregado', 'fallido', 'problema']);
const tipoPagoEnum = z.enum(['anticipado', 'contra_entrega']);

export const createEnvioSchema = z.object({
  clienteId: uuidSchema,
  // Override del cliente_nombre denormalizado. Solo se aplica si el clienteId
  // apunta al cliente mostrador (es_mostrador = true); para otros clientes se
  // ignora silenciosamente porque cliente_nombre se deriva de razon_social.
  clienteNombreOverride: z.string().trim().min(3).max(300).optional(),
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
  destinatarioEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email('Email invalido')
    .max(320)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' || v === undefined ? undefined : v)),

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
  // costo: input opcional. Por default el servidor cotiza server-side desde la tarifa que
  // matchea origen/destino. costo solo se usa como override cuando el admin pasa
  // forzarCostoManual=true (queda en auditoria). Nunca es un default silencioso.
  costo: z.number().int().min(0).optional(),
  montoACobrar: z.number().int().min(0).default(0),
  tipoPago: tipoPagoEnum,

  // Seguro: opt-in. El costo se recalcula server-side en base a la config y valorDeclarado,
  // no se confia en lo que mande el cliente (previene tampering).
  seguroAdicional: z.boolean().default(false),

  // Tags
  tags: z.array(z.string().max(50)).max(10).optional(),

  // Tarifa reference
  tarifaId: uuidSchema.optional(),
});

export const updateEnvioEstadoSchema = z.object({
  estado: envioEstadoEnum,
  descripcion: z.string().min(1).max(500),
  ubicacion: z.string().max(200).optional(),
  repartidorId: uuidSchema.optional(),
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
  repartidorId: z.union([uuidSchema, z.literal('sin_asignar')]).optional(),
  fechaEntregaDesde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  fechaEntregaHasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  soloIncidencias: z
    .union([z.boolean(), z.string()])
    .transform((v) => v === true || v === 'true' || v === '1')
    .optional(),
});

// Bulk import: array of envios
export const bulkImportSchema = z.object({
  envios: z.array(createEnvioSchema).min(1).max(500),
});

// Cliente portal: shape que puede enviar el cliente desde /portal/nuevo-paquete.
// El cliente NO decide clienteId, origen, destino, costo ni tipoPago: el servidor
// los deriva (clienteId desde auth, origen desde cliente.ciudad, destino desde
// destinatarioCiudad, costo desde la tarifa que matchee, tipoPago siempre 'anticipado').
export const createClienteEnvioSchema = z.object({
  codigoReferencia: z.string().max(100).optional(),

  destinatarioNombre: z.string().min(1).max(200),
  destinatarioDireccion: z.string().min(1).max(500),
  destinatarioTelefono: phoneSchema,
  destinatarioTelefono2: optionalPhoneSchema,
  destinatarioCedula: z.string().max(20).optional(),
  destinatarioCiudad: z.string().min(1).max(100),
  destinatarioDepartamento: z.string().max(100).optional(),
  destinatarioBarrio: z.string().max(100).optional(),
  destinatarioReferencia: z.string().max(500).optional(),
  destinatarioUbicacionUrl: z.string().url().max(2000).optional().or(z.literal('')),
  destinatarioEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email('Email invalido')
    .max(320)
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' || v === undefined ? undefined : v)),

  cantidad: z.number().int().min(1).max(999).default(1),
  producto: z.string().max(500).optional(),
  peso: z.number().positive().max(9999),
  dimensiones: z
    .object({
      largo: z.number().nonnegative().max(999),
      ancho: z.number().nonnegative().max(999),
      alto: z.number().nonnegative().max(999),
    })
    .optional(),
  fragil: z.boolean().default(false),
  valorDeclarado: z.number().int().min(0).optional(),

  instruccionesEntrega: z.string().max(1000).optional(),
  horarioEntrega: z.string().max(100).optional(),
  notas: z.string().max(1000).optional(),

  seguroAdicional: z.boolean().default(false),

  tags: z.array(z.string().max(50)).max(10).optional(),
});

export type CreateClienteEnvioInput = z.infer<typeof createClienteEnvioSchema>;

// Gateway v1: a diferencia del portal, el integrador SI elige tipoPago. Default
// anticipado para que las integraciones existentes no cambien de contrato. Con
// contra_entrega manda montoACobrar (lo que el repartidor cobra al destinatario:
// mercaderia + flete segun el modelo del integrador); con anticipado ese campo se
// rechaza con 400 en vez de ignorarse, para que el integrador no crea que controla
// un monto que fija el servidor. La cobertura de tarifa (I1: monto >= costo+seguro)
// se valida en la ruta, que es donde existe la cotizacion.
export const createV1EnvioSchema = createClienteEnvioSchema
  .extend({
    tipoPago: tipoPagoEnum.default('anticipado'),
    montoACobrar: z.number().int().positive().max(999_999_999).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.tipoPago === 'contra_entrega' && data.montoACobrar === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['montoACobrar'],
        message: 'montoACobrar es requerido con tipoPago contra_entrega',
      });
    }
    if (data.tipoPago === 'anticipado' && data.montoACobrar !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['montoACobrar'],
        message: 'montoACobrar solo aplica a contra_entrega: en anticipado el monto lo fija el servidor (costo + seguro)',
      });
    }
  });

export type CreateV1EnvioInput = z.infer<typeof createV1EnvioSchema>;

// Bulk import del cliente portal: array de envios con el shape del cliente (sin costo,
// montoACobrar, tipoPago ni tarifaId). El servidor deriva todo igual que el unitario. Cierra
// la causa raiz C en el path bulk del cliente: el afiliado no puede mover plata a costo cero.
export const bulkClienteImportSchema = z.object({
  envios: z.array(createClienteEnvioSchema).min(1).max(500),
});

export type BulkClienteImportInput = z.infer<typeof bulkClienteImportSchema>;

// Bulk actions over existing envios (change estado or assign repartidor).
// The frontend ticks rows in EnviosList and sends their IDs; the server
// validates each one can take the action and applies per-id (all in a
// transaction, with a per-id report so the user sees what failed).
export const bulkActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('cambiar_estado'),
    ids: z.array(uuidSchema).min(1).max(200),
    payload: z.object({
      estado: z.enum(['pendiente', 'recolectado', 'en_transito', 'en_reparto', 'entregado', 'fallido', 'problema']),
      descripcion: z.string().min(1).max(500),
    }),
  }),
  z.object({
    action: z.literal('asignar_repartidor'),
    ids: z.array(uuidSchema).min(1).max(200),
    payload: z.object({
      repartidorId: uuidSchema,
    }),
  }),
]);

export type CreateEnvioInput = z.infer<typeof createEnvioSchema>;
export type UpdateEnvioEstadoInput = z.infer<typeof updateEnvioEstadoSchema>;
export type EnvioQuery = z.infer<typeof envioQuerySchema>;
export type BulkImportInput = z.infer<typeof bulkImportSchema>;
export type BulkActionInput = z.infer<typeof bulkActionSchema>;
