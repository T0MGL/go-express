// Re-export everything from constants so existing imports continue to work
export {
  type BadgeVariant,
  estadoLabels,
  estadoColors,
  estadoAlmacenLabels,
  estadoAlmacenColors,
  prioridadLabels,
  prioridadColors,
  estadoClienteLabels,
  estadoClienteColors,
  departamentosPY,
  metodosPago,
  metodosPagoLabels,
  estadosPagoColors,
  tipoServicioLabels,
  tipoServicioColors,
  accionLabels,
  accionColors,
} from './constants';

import type { BadgeVariant } from './constants';

// Pago

export interface Pago {
  id: string;
  envioId: string;
  montoTotal: number;
  montoRecibido: number;
  metodoPago: 'efectivo' | 'transferencia' | 'tarjeta' | 'contra_entrega';
  estadoPago: 'pendiente' | 'pagado' | 'pago_parcial';
  fechaPago: string | null;
  referencia: string | null;
  notas: string | null;
  creadoPor: string;
  creadoEn: string;
  updatedAt: string;
  trackingNumber?: string;
  clienteNombre?: string;
  costoEnvio?: number;
}

export interface NotaInterna {
  id: string;
  envioId: string;
  usuario: string;
  usuarioId: string;
  texto: string;
  creadoEn: string;
}

// Envio

export interface Envio {
  id: string;
  trackingNumber: string;
  clienteId: string;
  clienteNombre: string;
  codigoReferencia: string | null;
  origen: string;
  destino: string;
  destinatarioNombre: string;
  destinatarioDireccion: string;
  destinatarioTelefono: string;
  destinatarioTelefono2: string | null;
  destinatarioCedula: string | null;
  destinatarioCiudad: string;
  destinatarioDepartamento: string;
  destinatarioBarrio: string | null;
  destinatarioReferencia: string | null;
  destinatarioUbicacionUrl: string | null;
  destinatarioEmail: string | null;
  cantidad: number;
  producto: string;
  estado: 'pendiente' | 'recolectado' | 'en_transito' | 'en_reparto' | 'entregado' | 'fallido' | 'problema';
  peso: number;
  dimensiones: {
    largo: number | null;
    ancho: number | null;
    alto: number | null;
  };
  fragil: boolean;
  valorDeclarado: number;
  instruccionesEntrega: string | null;
  horarioEntrega: string | null;
  notas: string | null;
  eventos: EventoEnvio[];
  costo: number;
  montoACobrar: number;
  tipoPago: 'anticipado' | 'contra_entrega' | 'cuenta_corriente';
  seguroAdicional: boolean;
  costoSeguro: number;
  pago: Pago | null;
  repartidorId: string | null;
  repartidorAsignadoEn: string | null;
  problemaDescripcion: string | null;
  problemaFecha: string | null;
  fotoEntregaUrl?: string | null;
  entregadoPorNombre?: string | null;
  entregadoPorDocumento?: string | null;
  fechaEntregaReal?: string | null;
  montoCobrado?: number | null;
  recolectadoEn?: string | null;
  entregaNotas?: string | null;
  tieneIncidencia?: boolean;
  incidenciaNota?: string | null;
  incidenciaReportadaEn?: string | null;
  incidenciaReportadaPor?: string | null;
  notasInternas: NotaInterna[];
  tags: string[];
  tarifaId: string | null;
  fecha: string;
  creadoEn: string;
  updatedAt: string;
  eliminado: boolean;
  eliminadoPor: string | null;
  eliminadoEn: string | null;
  motivoEliminacion: string | null;
}

export interface EventoEnvio {
  id: string;
  envioId: string;
  estado: 'pendiente' | 'recolectado' | 'en_transito' | 'en_reparto' | 'entregado' | 'fallido' | 'problema';
  descripcion: string;
  ubicacion: string | null;
  creadoEn: string;
}

// Warehouse

export interface PaqueteInventario {
  id: string;
  envioId: string | null;
  trackingNumber: string;
  clienteNombre: string;
  ubicacion: string;
  zona: string;
  estante: string | null;
  estadoAlmacen: 'recibido' | 'en_almacen' | 'listo_despacho' | 'despachado' | 'devuelto';
  fechaIngreso: string;
  fechaSalida: string | null;
  peso: number;
  dimensiones: { largo: number | null; ancho: number | null; alto: number | null };
  volumen: number | null;
  notas: string | null;
  prioridad: 'normal' | 'alta' | 'urgente';
  creadoEn: string;
  updatedAt: string;
}

export interface MovimientoAlmacen {
  id: string;
  paqueteId: string;
  trackingNumber: string;
  tipo: 'entrada' | 'salida' | 'movimiento_interno' | 'devolucion';
  ubicacionOrigen: string | null;
  ubicacionDestino: string | null;
  usuario: string;
  usuarioId: string;
  notas: string | null;
  creadoEn: string;
}

export interface PickingItem {
  id: string;
  envioId: string;
  trackingNumber: string;
  clienteNombre: string;
  ubicacion: string;
  destino: string;
  peso: number;
  prioridad: 'normal' | 'alta' | 'urgente';
  pickeado: boolean;
  empaquetado: boolean;
  creadoEn: string;
  updatedAt: string;
}

// Cliente

export type PortalStatus = 'sin_invitar' | 'invitado' | 'activo' | 'desactivado';

export interface Cliente {
  id: string;
  razonSocial: string;
  ruc: string;
  contactoNombre: string;
  contactoCargo: string | null;
  telefono: string;
  email: string;
  direccion: string | null;
  ciudad: string | null;
  estado: 'activo' | 'inactivo' | 'suspendido';
  plan: 'basico' | 'profesional' | 'enterprise';
  saldoCuentaCorriente: number;
  totalEnvios: number;
  enviosActivos: number;
  notas: string | null;
  portalActivo: boolean;
  portalStatus: PortalStatus;
  portalInvitedAt: string | null;
  eliminado: boolean;
  eliminadoPor: string | null;
  eliminadoEn: string | null;
  motivoEliminacion: string | null;
  creadoEn: string;
  updatedAt: string;
}

export const portalStatusLabels: Record<string, string> = {
  sin_invitar: 'Sin invitar',
  invitado: 'Invitado',
  activo: 'Portal activo',
  desactivado: 'Portal desactivado',
};

export const portalStatusColors: Record<string, BadgeVariant> = {
  sin_invitar: 'muted',
  invitado: 'warning',
  activo: 'success',
  desactivado: 'destructive',
};

// Repartidor

export interface Repartidor {
  id: string;
  nombre: string;
  telefono: string;
  vehiculo: 'Moto' | 'Auto' | 'Camioneta';
  placa: string;
  licencia: string | null;
  estado: 'activo' | 'inactivo';
  email?: string | null;
  portalStatus?: 'no_invitado' | 'invitado' | 'activo';
  portalInvitedAt?: string | null;
  enviosHoy: number;
  eliminado: boolean;
  eliminadoPor: string | null;
  eliminadoEn: string | null;
  motivoEliminacion: string | null;
  creadoEn: string;
  updatedAt: string;
}

// Usuario

export interface Usuario {
  id: string;
  authId: string | null;
  nombre: string;
  email: string;
  rol: 'admin' | 'operador';
  estado: 'activo' | 'inactivo';
  creadoEn: string;
  updatedAt: string;
}

// Tarifa

export interface Tarifa {
  id: string;
  origen: string;
  destino: string;
  tipoServicio: 'estandar' | 'express' | 'economico';
  precioBase: number;
  pesoBase: number;
  precioPorKgExtra: number;
  factorDimensional: number;
  activo: boolean;
  creadoPor: string;
  eliminado: boolean;
  eliminadoPor: string | null;
  eliminadoEn: string | null;
  motivoEliminacion: string | null;
  creadoEn: string;
  updatedAt: string;
}

// Auditoria

export interface AuditoriaLog {
  id: string;
  usuario: string;
  usuarioId: string;
  accion: 'crear' | 'editar' | 'eliminar' | 'exportar' | 'cambio_estado' | 'pago' | 'nota' | 'asignar' | 'importar' | 'login' | 'logout';
  entidad: 'envio' | 'cliente' | 'repartidor' | 'pago' | 'nota_interna' | 'tarifa' | 'usuario' | 'almacen' | 'sistema';
  entidadId: string;
  descripcion: string;
  valorAnterior: Record<string, unknown> | null;
  valorNuevo: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  creadoEn: string;
}

// Producto Guardado

export interface ProductoGuardado {
  id: string;
  clienteId: string;
  nombre: string;
  descripcion: string | null;
  peso: number;
  dimensiones: {
    largo: number | null;
    ancho: number | null;
    alto: number | null;
  };
  fragil: boolean;
  valorDeclarado: number | null;
  creadoEn: string;
  updatedAt: string;
}

export interface Tag {
  id: string;
  clienteId: string;
  nombre: string;
  color: string;
  creadoEn: string;
}
