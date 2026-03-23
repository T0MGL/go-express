/**
 * Type definitions for the Go Express application.
 * Constants (labels, colors, departamentos) live in constants.ts.
 */

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

// ── Pago ─────────────────────────────────────────────────────────────────────

export interface Pago {
  id: string;
  envioId: string;
  montoTotal: number;
  montoRecibido: number;
  metodoPago: 'efectivo' | 'transferencia' | 'tarjeta' | 'contra_entrega';
  estadoPago: 'pendiente' | 'pagado' | 'pago_parcial';
  fechaPago?: string | null;
  referencia?: string | null;
  notas?: string | null;
  creadoPor: string;
  creadoEn: string;
  updatedAt?: string;
}

export interface NotaInterna {
  id: string;
  envioId?: string;
  usuario: string;
  usuarioId?: string;
  texto: string;
  fecha: string;
  hora: string;
  creadoEn?: string;
}

// ── Envio ────────────────────────────────────────────────────────────────────

export interface Envio {
  id: string;
  trackingNumber: string;
  clienteId: string;
  clienteNombre: string;
  codigoReferencia?: string;
  origen: string;
  destino: string;
  destinatarioNombre: string;
  destinatarioDireccion: string;
  destinatarioTelefono: string;
  destinatarioTelefono2?: string;
  destinatarioCiudad: string;
  destinatarioDepartamento?: string;
  destinatarioBarrio?: string;
  destinatarioReferencia?: string;
  destinatarioUbicacionUrl?: string;
  cantidad: number;
  producto?: string;
  estado: 'pendiente' | 'recolectado' | 'en_transito' | 'en_reparto' | 'entregado' | 'fallido' | 'problema';
  peso: number;
  dimensiones: {
    largo: number;
    ancho: number;
    alto: number;
  };
  fragil?: boolean;
  valorDeclarado?: number;
  instruccionesEntrega?: string;
  horarioEntrega?: string;
  notas?: string;
  eventos: EventoEnvio[];
  costo: number;
  montoACobrar: number;
  tipoPago: 'anticipado' | 'contra_entrega' | 'cuenta_corriente';
  pago?: Pago;
  repartidorId?: string;
  repartidorAsignadoEn?: string;
  problemaDescripcion?: string;
  problemaFecha?: string;
  notasInternas?: NotaInterna[];
  tags?: string[];
  tarifaId?: string;
  fecha: string;
  creadoEn?: string;
  eliminado?: boolean;
  eliminadoPor?: string;
  eliminadoEn?: string;
  motivoEliminacion?: string;
  destinatarioCedula?: string;
}

export interface EventoEnvio {
  id: string;
  envioId?: string;
  estado: string;
  descripcion: string;
  ubicacion?: string;
  fecha: string;
  hora: string;
  creadoEn?: string;
}

// ── Warehouse ────────────────────────────────────────────────────────────────

export interface PaqueteInventario {
  id: string;
  trackingNumber: string;
  clienteNombre: string;
  ubicacion: string;
  zona: string;
  estante: string;
  estadoAlmacen: 'recibido' | 'en_almacen' | 'listo_despacho' | 'despachado' | 'devuelto';
  fechaIngreso: string;
  fechaSalida?: string;
  peso: number;
  dimensiones: { largo: number; ancho: number; alto: number };
  volumen: number;
  notas?: string;
  prioridad: 'normal' | 'alta' | 'urgente';
}

export interface MovimientoAlmacen {
  id: string;
  paqueteId: string;
  trackingNumber: string;
  tipo: 'entrada' | 'salida' | 'movimiento_interno' | 'devolucion';
  ubicacionOrigen?: string;
  ubicacionDestino?: string;
  fecha: string;
  hora: string;
  usuario: string;
  notas?: string;
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
  fechaCreacion: string;
}

// ── Cliente ──────────────────────────────────────────────────────────────────

export type PortalStatus = 'sin_invitar' | 'invitado' | 'activo' | 'desactivado';

export interface Cliente {
  id: string;
  razonSocial: string;
  ruc: string;
  contactoNombre: string;
  contactoCargo?: string;
  telefono: string;
  email: string;
  direccion?: string;
  ciudad: string;
  estado: 'activo' | 'inactivo' | 'suspendido';
  plan?: 'basico' | 'profesional' | 'enterprise';
  saldoCuentaCorriente: number;
  totalEnvios: number;
  enviosActivos: number;
  portalActivo?: boolean;
  portalStatus?: PortalStatus;
  portalInvitedAt?: string | null;
  creadoEn: string;
  updatedAt?: string;
  notas?: string;
  eliminado?: boolean;
  eliminadoPor?: string;
  eliminadoEn?: string;
  motivoEliminacion?: string;
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

// ── Repartidor ───────────────────────────────────────────────────────────────

export interface Repartidor {
  id: string;
  nombre: string;
  telefono: string;
  vehiculo: string;
  placa: string;
  licencia?: string;
  estado: 'activo' | 'inactivo';
  enviosHoy: number;
  eliminado?: boolean;
  eliminadoPor?: string;
  eliminadoEn?: string;
  motivoEliminacion?: string;
  creadoEn?: string;
  updatedAt?: string;
}

// ── Usuario ──────────────────────────────────────────────────────────────────

export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: 'Admin' | 'Operador' | 'Repartidor' | 'admin' | 'operador';
  estado: 'activo' | 'inactivo';
}

// ── Tarifa ───────────────────────────────────────────────────────────────────

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
  creadoEn: string;
  updatedAt?: string;
  eliminado?: boolean;
  eliminadoPor?: string;
  eliminadoEn?: string;
  motivoEliminacion?: string;
}

// ── Auditoria ────────────────────────────────────────────────────────────────

export interface AuditoriaLog {
  id: string;
  fecha: string;
  hora: string;
  usuario: string;
  usuarioId: string;
  accion: 'crear' | 'editar' | 'eliminar' | 'exportar' | 'cambio_estado' | 'pago' | 'nota' | 'asignar' | 'importar' | 'login';
  entidad: 'envio' | 'cliente' | 'repartidor' | 'pago' | 'nota_interna' | 'tarifa' | 'usuario' | 'almacen' | 'sistema';
  entidadId?: string;
  descripcion: string;
  valorAnterior?: string | Record<string, unknown> | null;
  valorNuevo?: string | Record<string, unknown> | null;
  creadoEn?: string;
  ipAddress?: string;
  userAgent?: string;
}

// ── Producto Guardado ────────────────────────────────────────────────────────

export interface ProductoGuardado {
  id: string;
  clienteId: string;
  nombre: string;
  descripcion?: string;
  peso: number;
  dimensiones: {
    largo: number;
    ancho: number;
    alto: number;
  };
  fragil: boolean;
  valorDeclarado?: number;
  creadoEn: string;
  updatedAt?: string;
}
