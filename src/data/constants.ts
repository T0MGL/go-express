/**
 * Shared constants: labels, colors, departamentos, payment methods.
 * These are NOT mock data. They are used in both production and mock mode.
 * Extracted from mockData.ts to allow production builds to tree-shake mock arrays.
 */

export type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'success' | 'warning' | 'muted' | 'outline';

export const estadoLabels: Record<string, string> = {
  pendiente: 'Pendiente',
  recolectado: 'Recolectado',
  en_transito: 'En Transito',
  en_reparto: 'En Reparto',
  entregado: 'Entregado',
  fallido: 'Fallido',
  problema: 'Problema/Incidencia',
};

export const estadoColors: Record<string, BadgeVariant> = {
  pendiente: 'muted',
  recolectado: 'default',
  en_transito: 'default',
  en_reparto: 'warning',
  entregado: 'success',
  fallido: 'destructive',
  problema: 'destructive',
};

export const estadoAlmacenLabels: Record<string, string> = {
  recibido: 'Recibido',
  en_almacen: 'En Almacen',
  listo_despacho: 'Listo para Despacho',
  despachado: 'Despachado',
  devuelto: 'Devuelto',
};

export const estadoAlmacenColors: Record<string, string> = {
  recibido: 'warning',
  en_almacen: 'primary',
  listo_despacho: 'success',
  despachado: 'muted',
  devuelto: 'destructive',
};

export const prioridadLabels: Record<string, string> = {
  normal: 'Normal',
  alta: 'Alta',
  urgente: 'Urgente',
};

export const prioridadColors: Record<string, string> = {
  normal: 'muted',
  alta: 'warning',
  urgente: 'destructive',
};

export const estadoClienteLabels: Record<string, string> = {
  activo: 'Activo',
  inactivo: 'Inactivo',
  suspendido: 'Suspendido',
};

export const estadoClienteColors: Record<string, BadgeVariant> = {
  activo: 'success',
  inactivo: 'muted',
  suspendido: 'destructive',
};

export const departamentosPY = [
  'Asuncion (Capital)',
  'Alto Paraguay',
  'Alto Parana',
  'Amambay',
  'Boqueron',
  'Caaguazu',
  'Caazapa',
  'Canindeyu',
  'Central',
  'Concepcion',
  'Cordillera',
  'Guaira',
  'Itapua',
  'Misiones',
  'Neembucu',
  'Paraguari',
  'Presidente Hayes',
  'San Pedro',
];

export const metodosPago = ['efectivo', 'transferencia', 'tarjeta', 'contra_entrega'] as const;

export const metodosPagoLabels: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia Bancaria',
  tarjeta: 'Tarjeta (POS)',
  contra_entrega: 'Pago contra entrega',
};

export const estadosPagoColors: Record<string, BadgeVariant> = {
  pendiente: 'secondary',
  pagado: 'success',
  pago_parcial: 'warning',
};

export const tipoServicioLabels: Record<string, string> = {
  estandar: 'Estandar',
  express: 'Express',
  economico: 'Economico',
};

export const tipoServicioColors: Record<string, string> = {
  estandar: 'primary',
  express: 'warning',
  economico: 'muted',
};

export const accionLabels: Record<string, string> = {
  crear: 'Crear',
  editar: 'Editar',
  eliminar: 'Eliminar',
  exportar: 'Exportar',
  cambio_estado: 'Cambio de Estado',
  pago: 'Pago',
  nota: 'Nota',
  asignar: 'Asignar',
  importar: 'Importar',
  login: 'Login',
};

export const accionColors: Record<string, string> = {
  crear: 'success',
  editar: 'primary',
  eliminar: 'destructive',
  exportar: 'muted',
  cambio_estado: 'warning',
  pago: 'success',
  nota: 'primary',
  asignar: 'default',
  importar: 'default',
  login: 'muted',
};
