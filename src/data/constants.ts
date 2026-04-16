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

// Ciudades PY que Go Express opera. Esta lista es la fuente unica:
// (1) dropdown de origen/destino en admin Tarifas,
// (2) dropdown de ciudad en el alta de cliente en admin,
// (3) si crece, se puede mover a la DB con un catalog table.
// Orden: Asuncion primero (caso base), despues por departamento.
export const ciudadesPY: ReadonlyArray<{ ciudad: string; departamento: string }> = [
  { ciudad: 'Asunción', departamento: 'Asunción' },
  { ciudad: 'Areguá', departamento: 'Central' },
  { ciudad: 'Capiatá', departamento: 'Central' },
  { ciudad: 'Fernando de la Mora', departamento: 'Central' },
  { ciudad: 'Itauguá', departamento: 'Central' },
  { ciudad: 'Lambaré', departamento: 'Central' },
  { ciudad: 'Limpio', departamento: 'Central' },
  { ciudad: 'Luque', departamento: 'Central' },
  { ciudad: 'Mariano Roque Alonso', departamento: 'Central' },
  { ciudad: 'Ñemby', departamento: 'Central' },
  { ciudad: 'San Antonio', departamento: 'Central' },
  { ciudad: 'San Lorenzo', departamento: 'Central' },
  { ciudad: 'Villa Elisa', departamento: 'Central' },
  { ciudad: 'Ciudad del Este', departamento: 'Alto Paraná' },
  { ciudad: 'Hernandarias', departamento: 'Alto Paraná' },
  { ciudad: 'Minga Guazú', departamento: 'Alto Paraná' },
  { ciudad: 'Presidente Franco', departamento: 'Alto Paraná' },
  { ciudad: 'Encarnación', departamento: 'Itapúa' },
  { ciudad: 'Caacupé', departamento: 'Cordillera' },
  { ciudad: 'Villarrica', departamento: 'Guairá' },
  { ciudad: 'Caaguazú', departamento: 'Caaguazú' },
  { ciudad: 'Coronel Oviedo', departamento: 'Caaguazú' },
  { ciudad: 'Pedro Juan Caballero', departamento: 'Amambay' },
  { ciudad: 'Concepción', departamento: 'Concepción' },
  { ciudad: 'Paraguarí', departamento: 'Paraguarí' },
  { ciudad: 'San Pedro', departamento: 'San Pedro' },
  { ciudad: 'San Juan Bautista', departamento: 'Misiones' },
  { ciudad: 'Salto del Guairá', departamento: 'Canindeyú' },
  { ciudad: 'Caazapá', departamento: 'Caazapá' },
  { ciudad: 'Pilar', departamento: 'Ñeembucú' },
  { ciudad: 'Fuerte Olimpo', departamento: 'Alto Paraguay' },
  { ciudad: 'Filadelfia', departamento: 'Boquerón' },
  { ciudad: 'Villa Hayes', departamento: 'Presidente Hayes' },
];

export const ciudadesPYNombres: string[] = ciudadesPY.map((c) => c.ciudad);

export function departamentoDeCiudad(ciudad: string): string | null {
  return ciudadesPY.find((c) => c.ciudad === ciudad)?.departamento ?? null;
}

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
