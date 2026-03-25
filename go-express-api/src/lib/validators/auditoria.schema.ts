import { z } from 'zod';
import { paginationSchema, searchSchema, dateRangeSchema, uuidSchema } from './common.schema.js';

const accionEnum = z.enum(['crear', 'editar', 'eliminar', 'exportar', 'cambio_estado', 'pago', 'nota', 'asignar', 'importar', 'login', 'logout']);
const entidadEnum = z.enum(['envio', 'cliente', 'repartidor', 'pago', 'nota_interna', 'tarifa', 'usuario', 'almacen', 'sistema']);

export const auditoriaQuerySchema = paginationSchema.merge(searchSchema).merge(dateRangeSchema).extend({
  usuarioId: uuidSchema.optional(),
  accion: accionEnum.optional(),
  entidad: entidadEnum.optional(),
});

export type AuditoriaQuery = z.infer<typeof auditoriaQuerySchema>;
