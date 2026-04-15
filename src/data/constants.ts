export type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'success' | 'warning' | 'muted' | 'outline';

export const estadoLabels: Record<string, string> = {
  pendiente: 'Pendiente',
  recolectado: 'Retirado del cliente',
  en_transito: 'En tránsito',
  en_reparto: 'En reparto',
  entregado: 'Entregado',
  fallido: 'Entrega fallida',
  problema: 'Con problema',
};

export const estadoDescripciones: Record<string, string> = {
  pendiente: 'Esperando retiro del cliente',
  recolectado: 'Retirado del cliente, en nuestro almacén',
  en_transito: 'En camino al destino',
  en_reparto: 'En manos del repartidor para entregar',
  entregado: 'Entregado al destinatario',
  fallido: 'Intento de entrega sin éxito',
  problema: 'Requiere atención del equipo',
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
  recibido: 'Recién ingresado',
  en_almacen: 'En almacén',
  listo_despacho: 'Listo para salir',
  despachado: 'Ya despachado',
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
  'Asunción',
  'Alto Paraguay',
  'Alto Paraná',
  'Amambay',
  'Boquerón',
  'Caaguazú',
  'Caazapá',
  'Canindeyú',
  'Central',
  'Concepción',
  'Cordillera',
  'Guairá',
  'Itapúa',
  'Misiones',
  'Ñeembucú',
  'Paraguarí',
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
  estandar: 'Estándar',
  express: 'Express',
  economico: 'Económico',
};

export const tipoServicioColors: Record<string, string> = {
  estandar: 'primary',
  express: 'warning',
  economico: 'muted',
};

export const accionLabels: Record<string, string> = {
  crear: 'Creó',
  editar: 'Modificó',
  eliminar: 'Eliminó',
  exportar: 'Exportó',
  cambio_estado: 'Cambió estado',
  pago: 'Registró pago',
  nota: 'Agregó nota',
  asignar: 'Asignó',
  importar: 'Importó',
  login: 'Inició sesión',
  logout: 'Cerró sesión',
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
  logout: 'muted',
};
