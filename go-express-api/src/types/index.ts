export type UserRole = 'admin' | 'operador';
export type UserStatus = 'activo' | 'inactivo';
export type ClienteEstado = 'activo' | 'inactivo' | 'suspendido';
export type ClientePlan = 'basico' | 'profesional' | 'enterprise';
export type EnvioEstado =
  | 'pendiente'
  | 'recolectado'
  | 'en_transito'
  | 'en_reparto'
  | 'entregado'
  | 'fallido'
  | 'problema';
export type TipoPago = 'anticipado' | 'contra_entrega' | 'cuenta_corriente';
export type MetodoPago = 'efectivo' | 'transferencia' | 'tarjeta' | 'contra_entrega';
export type EstadoPago = 'pendiente' | 'pagado' | 'pago_parcial';
export type TipoServicio = 'estandar' | 'express' | 'economico';
export type VehiculoTipo = 'Moto' | 'Auto' | 'Camioneta';
export type RepartidorEstado = 'activo' | 'inactivo';
export type EstadoAlmacen =
  | 'recibido'
  | 'en_almacen'
  | 'listo_despacho'
  | 'despachado'
  | 'devuelto';
export type PrioridadTipo = 'normal' | 'alta' | 'urgente';
export type MovimientoTipo = 'entrada' | 'salida' | 'movimiento_interno' | 'devolucion';
export type AuditoriaAccion =
  | 'crear'
  | 'editar'
  | 'eliminar'
  | 'exportar'
  | 'cambio_estado'
  | 'pago'
  | 'nota'
  | 'asignar'
  | 'importar'
  | 'login'
  | 'logout';
export type AuditoriaEntidad =
  | 'envio'
  | 'cliente'
  | 'repartidor'
  | 'pago'
  | 'nota_interna'
  | 'tarifa'
  | 'usuario'
  | 'almacen'
  | 'sistema';

// DB Row types (snake_case, match PostgreSQL column names exactly)

export interface UsuarioRow {
  id: string;
  auth_id: string | null;
  nombre: string;
  email: string;
  rol: UserRole;
  estado: UserStatus;
  created_at: string;
  updated_at: string;
}

export type PortalStatus = 'sin_invitar' | 'invitado' | 'activo' | 'desactivado';

export interface ClienteRow {
  id: string;
  auth_id: string | null;
  razon_social: string;
  ruc: string;
  contacto_nombre: string;
  contacto_cargo: string | null;
  telefono: string;
  email: string;
  direccion: string | null;
  ciudad: string | null;
  estado: ClienteEstado;
  plan: ClientePlan;
  saldo_cuenta_corriente: number;
  total_envios: number;
  envios_activos: number;
  notas: string | null;
  portal_activo: boolean;
  portal_status: PortalStatus;
  portal_invited_at: string | null;
  eliminado: boolean;
  eliminado_por: string | null;
  eliminado_en: string | null;
  motivo_eliminacion: string | null;
  created_at: string;
  updated_at: string;
}

export interface EnvioRow {
  id: string;
  tracking_number: string;
  cliente_id: string;
  cliente_nombre: string;
  codigo_referencia: string | null;
  origen: string;
  destino: string;
  destinatario_nombre: string;
  destinatario_direccion: string;
  destinatario_telefono: string;
  destinatario_telefono2: string | null;
  destinatario_cedula: string | null;
  destinatario_ciudad: string;
  destinatario_departamento: string;
  destinatario_barrio: string | null;
  destinatario_referencia: string | null;
  destinatario_ubicacion_url: string | null;
  cantidad: number;
  producto: string;
  peso: number;
  dimensiones_largo: number | null;
  dimensiones_ancho: number | null;
  dimensiones_alto: number | null;
  fragil: boolean;
  valor_declarado: number;
  instrucciones_entrega: string | null;
  horario_entrega: string | null;
  notas: string | null;
  estado: EnvioEstado;
  costo: number;
  monto_a_cobrar: number;
  tipo_pago: TipoPago;
  seguro_adicional: boolean;
  costo_seguro: number;
  repartidor_id: string | null;
  repartidor_asignado_en: string | null;
  problema_descripcion: string | null;
  problema_fecha: string | null;
  tags: string[];
  tarifa_id: string | null;
  fecha: string;
  eliminado: boolean;
  eliminado_por: string | null;
  eliminado_en: string | null;
  motivo_eliminacion: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventoEnvioRow {
  id: string;
  envio_id: string;
  estado: EnvioEstado;
  descripcion: string;
  ubicacion: string | null;
  created_at: string;
}

export interface PagoRow {
  id: string;
  envio_id: string;
  monto_total: number;
  monto_recibido: number;
  metodo_pago: MetodoPago;
  estado_pago: EstadoPago;
  fecha_pago: string | null;
  referencia: string | null;
  notas: string | null;
  creado_por: string;
  created_at: string;
  updated_at: string;
}

export interface NotaInternaRow {
  id: string;
  envio_id: string;
  texto: string;
  usuario: string;
  usuario_id: string;
  created_at: string;
}

export interface RepartidorRow {
  id: string;
  nombre: string;
  telefono: string;
  vehiculo: VehiculoTipo;
  placa: string;
  licencia: string | null;
  estado: RepartidorEstado;
  eliminado: boolean;
  eliminado_por: string | null;
  eliminado_en: string | null;
  motivo_eliminacion: string | null;
  created_at: string;
  updated_at: string;
}

export interface TarifaRow {
  id: string;
  origen: string;
  destino: string;
  tipo_servicio: TipoServicio;
  precio_base: number;
  peso_base: number;
  precio_por_kg_extra: number;
  factor_dimensional: number;
  activo: boolean;
  creado_por: string;
  eliminado: boolean;
  eliminado_por: string | null;
  eliminado_en: string | null;
  motivo_eliminacion: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventarioAlmacenRow {
  id: string;
  envio_id: string | null;
  tracking_number: string;
  cliente_nombre: string;
  ubicacion: string;
  zona: string;
  estante: string | null;
  estado_almacen: EstadoAlmacen;
  fecha_ingreso: string;
  fecha_salida: string | null;
  peso: number;
  dimensiones_largo: number | null;
  dimensiones_ancho: number | null;
  dimensiones_alto: number | null;
  volumen: number | null;
  notas: string | null;
  prioridad: PrioridadTipo;
  created_at: string;
  updated_at: string;
}

export interface MovimientoAlmacenRow {
  id: string;
  paquete_id: string;
  tracking_number: string;
  tipo: MovimientoTipo;
  ubicacion_origen: string | null;
  ubicacion_destino: string | null;
  usuario: string;
  usuario_id: string;
  notas: string | null;
  created_at: string;
}

export interface PickingItemRow {
  id: string;
  envio_id: string;
  tracking_number: string;
  cliente_nombre: string;
  ubicacion: string;
  destino: string;
  peso: number;
  prioridad: PrioridadTipo;
  pickeado: boolean;
  empaquetado: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductoGuardadoRow {
  id: string;
  cliente_id: string;
  nombre: string;
  descripcion: string | null;
  peso: number;
  dimensiones_largo: number | null;
  dimensiones_ancho: number | null;
  dimensiones_alto: number | null;
  fragil: boolean;
  valor_declarado: number | null;
  created_at: string;
  updated_at: string;
}

export interface TagRow {
  id: string;
  cliente_id: string;
  nombre: string;
  color: string;
  created_at: string;
}

export interface AuditoriaLogRow {
  id: string;
  usuario: string;
  usuario_id: string;
  accion: AuditoriaAccion;
  entidad: AuditoriaEntidad;
  entidad_id: string;
  descripcion: string;
  valor_anterior: Record<string, unknown> | null;
  valor_nuevo: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface ConfiguracionRow {
  key: string;
  value: unknown;
  updated_at: string;
  updated_by: string | null;
}

// API Response types (camelCase, frontend-friendly)

export interface Usuario {
  id: string;
  authId: string | null;
  nombre: string;
  email: string;
  rol: UserRole;
  estado: UserStatus;
  creadoEn: string;
  updatedAt: string;
}

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
  estado: ClienteEstado;
  plan: ClientePlan;
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
  cantidad: number;
  producto: string;
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
  estado: EnvioEstado;
  costo: number;
  montoACobrar: number;
  tipoPago: TipoPago;
  seguroAdicional: boolean;
  costoSeguro: number;
  repartidorId: string | null;
  repartidorAsignadoEn: string | null;
  problemaDescripcion: string | null;
  problemaFecha: string | null;
  tags: string[];
  tarifaId: string | null;
  fecha: string;
  eliminado: boolean;
  eliminadoPor: string | null;
  eliminadoEn: string | null;
  motivoEliminacion: string | null;
  eventos: EventoEnvio[];
  pago: Pago | null;
  notasInternas: NotaInterna[];
  creadoEn: string;
  updatedAt: string;
}

export interface EventoEnvio {
  id: string;
  envioId: string;
  estado: EnvioEstado;
  descripcion: string;
  ubicacion: string | null;
  creadoEn: string;
}

export interface Pago {
  id: string;
  envioId: string;
  montoTotal: number;
  montoRecibido: number;
  metodoPago: MetodoPago;
  estadoPago: EstadoPago;
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
  texto: string;
  usuario: string;
  usuarioId: string;
  creadoEn: string;
}

export interface Repartidor {
  id: string;
  nombre: string;
  telefono: string;
  vehiculo: VehiculoTipo;
  placa: string;
  licencia: string | null;
  estado: RepartidorEstado;
  enviosHoy: number;
  eliminado: boolean;
  eliminadoPor: string | null;
  eliminadoEn: string | null;
  motivoEliminacion: string | null;
  creadoEn: string;
  updatedAt: string;
}

export interface Tarifa {
  id: string;
  origen: string;
  destino: string;
  tipoServicio: TipoServicio;
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

export interface InventarioAlmacen {
  id: string;
  envioId: string | null;
  trackingNumber: string;
  clienteNombre: string;
  ubicacion: string;
  zona: string;
  estante: string | null;
  estadoAlmacen: EstadoAlmacen;
  fechaIngreso: string;
  fechaSalida: string | null;
  peso: number;
  dimensiones: {
    largo: number | null;
    ancho: number | null;
    alto: number | null;
  };
  volumen: number | null;
  notas: string | null;
  prioridad: PrioridadTipo;
  creadoEn: string;
  updatedAt: string;
}

export interface MovimientoAlmacen {
  id: string;
  paqueteId: string;
  trackingNumber: string;
  tipo: MovimientoTipo;
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
  prioridad: PrioridadTipo;
  pickeado: boolean;
  empaquetado: boolean;
  creadoEn: string;
  updatedAt: string;
}

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

export interface AuditoriaLog {
  id: string;
  usuario: string;
  usuarioId: string;
  accion: AuditoriaAccion;
  entidad: AuditoriaEntidad;
  entidadId: string;
  descripcion: string;
  valorAnterior: Record<string, unknown> | null;
  valorNuevo: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  creadoEn: string;
}

export interface Configuracion {
  key: string;
  value: unknown;
  updatedAt: string;
  updatedBy: string | null;
}

export interface PagoStats {
  totalCobrado: number;
  totalPendiente: number;
  cobradoHoy: number;
  enviosPendientesCobro: number;
}

// Pagination

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
  nextCursor: string | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

// Notifications (WhatsApp / email extensibility hook)

export type NotificationEvent =
  | 'envio_creado'
  | 'cambio_estado'
  | 'entregado'
  | 'problema'
  | 'fallido';

export interface NotificationPayload {
  event: NotificationEvent;
  envio: Envio;
  previousEstado?: EnvioEstado;
}
