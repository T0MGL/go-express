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

export interface Envio {
  id: string;
  trackingNumber: string;
  clienteId: string;      // Referencia a Cliente.id
  clienteNombre: string;  // Desnormalizado para acceso rápido
  codigoReferencia?: string; // Código interno del cliente para su propio tracking
  origen: string;
  destino: string;
  // ─── Datos del destinatario ──────────────────────────────────────────────────
  destinatarioNombre: string;
  destinatarioDireccion: string;
  destinatarioTelefono: string;
  destinatarioTelefono2?: string;   // Teléfono alternativo
  destinatarioCiudad: string;       // Ciudad de destino
  destinatarioDepartamento?: string; // Departamento de Paraguay
  destinatarioBarrio?: string;       // Barrio
  destinatarioReferencia?: string;   // Referencia de ubicación ("frente a la iglesia", etc.)
  destinatarioUbicacionUrl?: string; // Link de Google Maps
  // ─── Datos del paquete ───────────────────────────────────────────────────────
  cantidad: number;                  // Número de bultos
  producto?: string;                 // Descripción de lo que se envía
  estado: 'pendiente' | 'recolectado' | 'en_transito' | 'en_reparto' | 'entregado' | 'fallido' | 'problema';
  peso: number;
  dimensiones: {
    largo: number;
    ancho: number;
    alto: number;
  };
  fragil?: boolean;                   // Requiere manejo especial
  valorDeclarado?: number;            // Valor declarado del contenido (Gs.) — para seguro
  // ─── Entrega ─────────────────────────────────────────────────────────────────
  instruccionesEntrega?: string;      // "dejar con el portero", "llamar antes", etc.
  horarioEntrega?: string;            // Horario preferido de entrega
  notas?: string;
  eventos: EventoEnvio[];
  // ─── Cobro y pago ────────────────────────────────────────────────────────────
  costo: number;                      // Costo del servicio de envío (Gs.)
  montoACobrar: number;               // Monto total a cobrar al destinatario (Gs.) — 0 si no hay nada a cobrar
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

export const mockEnvios: Envio[] = [
  {
    id: '1',
    trackingNumber: 'GE2026001234',
    clienteId: 'cli1',
    clienteNombre: 'Distribuidora Central SA',
    codigoReferencia: '#DC-2026-0451',
    origen: 'Asunción',
    destino: 'Ciudad del Este',
    destinatarioNombre: 'Juan Pérez García',
    destinatarioDireccion: 'Av. San Blas 1234',
    destinatarioTelefono: '+595 983 123 456',
    destinatarioTelefono2: '+595 961 456 789',
    destinatarioCiudad: 'Ciudad del Este',
    destinatarioDepartamento: 'Alto Paraná',
    destinatarioBarrio: 'Centro',
    destinatarioReferencia: 'Frente al Shopping Paris',
    destinatarioUbicacionUrl: 'https://maps.app.goo.gl/abc123ejemplo',
    cantidad: 2,
    producto: 'Materiales de oficina',
    estado: 'en_transito',
    peso: 5.5,
    dimensiones: { largo: 40, ancho: 30, alto: 20 },
    fragil: true,
    valorDeclarado: 850000,
    instruccionesEntrega: 'Llamar 30 min antes de llegar',
    notas: 'Frágil - Manejar con cuidado',
    costo: 50000,
    montoACobrar: 0,
    tipoPago: 'anticipado',
    pago: {
      id: 'pago1',
      envioId: '1',
      montoTotal: 50000,
      montoRecibido: 50000,
      metodoPago: 'efectivo',
      estadoPago: 'pagado',
      fechaPago: '2026-02-18',
      referencia: '',
      notas: 'Pago recibido en efectivo',
      creadoPor: 'admin',
      creadoEn: '2026-02-18T09:00:00'
    },
    repartidorId: 'rep1',
    repartidorAsignadoEn: '2026-02-20T08:00:00',
    notasInternas: [
      {
        id: 'nota1',
        envioId: '1',
        texto: 'Cliente solicitó cambio de dirección de entrega',
        usuario: 'Admin Principal',
        fecha: '2026-02-20',
        hora: '10:30'
      },
      {
        id: 'nota2',
        envioId: '1',
        texto: 'Repartidor reporta dirección difícil de encontrar',
        usuario: 'Carlos Gómez',
        fecha: '2026-02-20',
        hora: '15:45'
      }
    ],
    eventos: [
      {
        id: '1',
        fecha: '2026-02-18',
        hora: '09:00',
        estado: 'Pendiente',
        descripcion: 'Envío registrado en el sistema',
      },
      {
        id: '2',
        fecha: '2026-02-18',
        hora: '14:30',
        estado: 'Recolectado',
        descripcion: 'Paquete recolectado en sucursal',
        ubicacion: 'Centro de Distribución Asunción',
      },
      {
        id: '3',
        fecha: '2026-02-20',
        hora: '08:15',
        estado: 'En Tránsito',
        descripcion: 'En ruta hacia destino',
        ubicacion: 'Hub de Transferencia Coronel Oviedo',
      },
    ],
    fecha: '2026-02-18',
  },
  {
    id: '2',
    trackingNumber: 'GE2026001235',
    clienteId: 'cli2',
    clienteNombre: 'Tecnología y Soluciones SRL',
    codigoReferencia: '#TYS-0087',
    origen: 'Ciudad del Este',
    destino: 'Encarnación',
    destinatarioNombre: 'María López Hernández',
    destinatarioDireccion: 'Calle Padre Bolik 567',
    destinatarioTelefono: '+595 984 987 654',
    destinatarioCiudad: 'Encarnación',
    destinatarioDepartamento: 'Itapúa',
    destinatarioBarrio: 'Centro',
    destinatarioReferencia: 'Al lado de la Farmacia Catedral',
    destinatarioUbicacionUrl: 'https://maps.app.goo.gl/def456ejemplo',
    cantidad: 1,
    producto: 'Laptop HP ProBook 450',
    estado: 'entregado',
    peso: 2.3,
    dimensiones: { largo: 30, ancho: 25, alto: 15 },
    fragil: true,
    valorDeclarado: 4500000,
    costo: 75000,
    montoACobrar: 0,
    tipoPago: 'anticipado',
    pago: {
      id: 'pago2',
      envioId: '2',
      montoTotal: 75000,
      montoRecibido: 75000,
      metodoPago: 'transferencia',
      estadoPago: 'pagado',
      fechaPago: '2026-02-10',
      referencia: 'TRANS-20260210-001',
      notas: '',
      creadoPor: 'admin',
      creadoEn: '2026-02-10T10:00:00'
    },
    eventos: [
      {
        id: '1',
        fecha: '2026-02-10',
        hora: '10:00',
        estado: 'Pendiente',
        descripcion: 'Envío registrado',
      },
      {
        id: '2',
        fecha: '2026-02-10',
        hora: '15:00',
        estado: 'Recolectado',
        descripcion: 'Recolectado en origen',
      },
      {
        id: '3',
        fecha: '2026-02-18',
        hora: '09:30',
        estado: 'En Tránsito',
        descripcion: 'En ruta',
      },
      {
        id: '4',
        fecha: '2026-02-18',
        hora: '18:45',
        estado: 'Entregado',
        descripcion: 'Entregado exitosamente',
        ubicacion: 'Recibido por: María López',
      },
    ],
    fecha: '2026-02-10',
  },
  {
    id: '3',
    trackingNumber: 'GE2026001236',
    clienteId: 'cli3',
    clienteNombre: 'Comercializadora del Norte SA',
    codigoReferencia: '#CN-PED-320',
    origen: 'Pedro Juan Caballero',
    destino: 'Asunción',
    destinatarioNombre: 'Carlos Sánchez',
    destinatarioDireccion: 'Av. España 890',
    destinatarioTelefono: '+595 985 876 543',
    destinatarioTelefono2: '+595 21 600 123',
    destinatarioCiudad: 'Asunción',
    destinatarioDepartamento: 'Asunción (Capital)',
    destinatarioBarrio: 'Recoleta',
    destinatarioReferencia: 'Edificio Torre Paraná, piso 3, oficina B',
    cantidad: 3,
    producto: 'Artículos electrónicos varios',
    estado: 'pendiente',
    peso: 8.0,
    dimensiones: { largo: 50, ancho: 40, alto: 30 },
    valorDeclarado: 2400000,
    instruccionesEntrega: 'Preguntar por Carlos en recepción',
    costo: 120000,
    montoACobrar: 2520000,
    tipoPago: 'contra_entrega',
    pago: {
      id: 'pago3',
      envioId: '3',
      montoTotal: 120000,
      montoRecibido: 0,
      metodoPago: 'contra_entrega',
      estadoPago: 'pendiente',
      creadoPor: 'admin',
      creadoEn: '2026-02-20T11:20:00'
    },
    eventos: [
      {
        id: '1',
        fecha: '2026-02-20',
        hora: '11:20',
        estado: 'Pendiente',
        descripcion: 'Envío registrado en el sistema',
      },
    ],
    fecha: '2026-02-20',
  },
  {
    id: '4',
    trackingNumber: 'GE2026001237',
    clienteId: 'cli4',
    clienteNombre: 'Importaciones Global SA',
    codigoReferencia: '#IG-4521',
    origen: 'Asunción',
    destino: 'Luque',
    destinatarioNombre: 'Roberto Mendoza',
    destinatarioDireccion: 'Ruta 2 Km 15.5',
    destinatarioTelefono: '+595 986 765 432',
    destinatarioCiudad: 'Luque',
    destinatarioDepartamento: 'Central',
    destinatarioBarrio: 'Zona Aeropuerto',
    destinatarioReferencia: 'Portón verde al lado de la cancha de fútbol',
    destinatarioUbicacionUrl: 'https://maps.app.goo.gl/ghi789ejemplo',
    cantidad: 1,
    producto: 'Repuestos automotrices',
    estado: 'en_reparto',
    peso: 3.8,
    dimensiones: { largo: 35, ancho: 25, alto: 20 },
    valorDeclarado: 650000,
    instruccionesEntrega: 'Entregar antes de las 17:00, preguntar por Roberto',
    notas: 'Entregar antes de las 17:00',
    costo: 85000,
    montoACobrar: 735000,
    tipoPago: 'contra_entrega',
    pago: {
      id: 'pago4',
      envioId: '4',
      montoTotal: 85000,
      montoRecibido: 0,
      metodoPago: 'contra_entrega',
      estadoPago: 'pendiente',
      creadoPor: 'admin',
      creadoEn: '2026-02-20T08:00:00'
    },
    eventos: [
      {
        id: '1',
        fecha: '2026-02-20',
        hora: '08:00',
        estado: 'Pendiente',
        descripcion: 'Envío registrado',
      },
      {
        id: '2',
        fecha: '2026-02-20',
        hora: '09:45',
        estado: 'Recolectado',
        descripcion: 'Recolectado',
      },
      {
        id: '3',
        fecha: '2026-02-20',
        hora: '13:30',
        estado: 'En Reparto',
        descripcion: 'Asignado a repartidor',
        ubicacion: 'Con repartidor Pedro Ramírez',
      },
    ],
    fecha: '2026-02-20',
  },
  {
    id: '5',
    trackingNumber: 'GE2026001238',
    clienteId: 'cli5',
    clienteNombre: 'Farmacia San Roque SA',
    codigoReferencia: '#FSR-RX-1120',
    origen: 'Asunción',
    destino: 'Villarrica',
    destinatarioNombre: 'Ana Benítez',
    destinatarioDireccion: 'Calle 14 de Mayo 234',
    destinatarioTelefono: '+595 987 654 321',
    destinatarioTelefono2: '+595 541 222 333',
    destinatarioCiudad: 'Villarrica',
    destinatarioDepartamento: 'Guairá',
    destinatarioBarrio: 'San Miguel',
    destinatarioReferencia: 'Casa esquinera con reja blanca',
    cantidad: 1,
    producto: 'Medicamentos recetados',
    estado: 'fallido',
    peso: 1.2,
    dimensiones: { largo: 20, ancho: 15, alto: 10 },
    fragil: true,
    valorDeclarado: 380000,
    instruccionesEntrega: 'Entregar solo a la destinataria con CI',
    costo: 95000,
    montoACobrar: 0,
    tipoPago: 'cuenta_corriente',
    pago: {
      id: 'pago5',
      envioId: '5',
      montoTotal: 95000,
      montoRecibido: 50000,
      metodoPago: 'transferencia',
      estadoPago: 'pago_parcial',
      fechaPago: '2026-02-18',
      referencia: 'TRANS-20260218-002',
      notas: 'Pago parcial - pendiente saldo de Gs. 45.000',
      creadoPor: 'admin',
      creadoEn: '2026-02-18T10:00:00'
    },
    eventos: [
      {
        id: '1',
        fecha: '2026-02-18',
        hora: '10:00',
        estado: 'Pendiente',
        descripcion: 'Envío registrado',
      },
      {
        id: '2',
        fecha: '2026-02-18',
        hora: '14:00',
        estado: 'Recolectado',
        descripcion: 'Recolectado',
      },
      {
        id: '3',
        fecha: '2026-02-20',
        hora: '10:00',
        estado: 'En Reparto',
        descripcion: 'En proceso de entrega',
      },
      {
        id: '4',
        fecha: '2026-02-20',
        hora: '15:30',
        estado: 'Fallido',
        descripcion: 'Destinatario ausente - Reprogramar entrega',
      },
    ],
    fecha: '2026-02-18',
  },
  {
    id: '6',
    trackingNumber: 'GE2026001239',
    clienteId: 'cli6',
    clienteNombre: 'Comercial Guaraní SRL',
    codigoReferencia: '#CG-0098',
    origen: 'Asunción',
    destino: 'Luque',
    destinatarioNombre: 'Roberto Silva',
    destinatarioDireccion: 'Av. Santísima Trinidad 890',
    destinatarioTelefono: '+595 981 555 888',
    destinatarioCiudad: 'Luque',
    destinatarioDepartamento: 'Central',
    destinatarioBarrio: 'Itá Enramada',
    cantidad: 1,
    producto: 'Productos de limpieza industrial',
    estado: 'problema',
    peso: 3.2,
    dimensiones: { largo: 35, ancho: 28, alto: 18 },
    valorDeclarado: 180000,
    costo: 35000,
    montoACobrar: 215000,
    tipoPago: 'contra_entrega',
    pago: {
      id: 'pago6',
      envioId: '6',
      montoTotal: 35000,
      montoRecibido: 0,
      metodoPago: 'contra_entrega',
      estadoPago: 'pendiente',
      creadoPor: 'admin',
      creadoEn: '2026-02-22T09:00:00'
    },
    problemaDescripcion: 'Dirección incorrecta, no se pudo contactar al destinatario',
    problemaFecha: '2026-02-22',
    repartidorId: 'rep2',
    repartidorAsignadoEn: '2026-02-22T08:00:00',
    eventos: [
      {
        id: '1',
        fecha: '2026-02-22',
        hora: '09:00',
        estado: 'Pendiente',
        descripcion: 'Envío registrado en el sistema',
      },
      {
        id: '2',
        fecha: '2026-02-22',
        hora: '10:30',
        estado: 'Recolectado',
        descripcion: 'Paquete recolectado',
      },
      {
        id: '3',
        fecha: '2026-02-22',
        hora: '14:00',
        estado: 'En Reparto',
        descripcion: 'En proceso de entrega',
      },
      {
        id: '4',
        fecha: '2026-02-22',
        hora: '16:30',
        estado: 'Problema',
        descripcion: 'Problema reportado - Dirección incorrecta',
      },
    ],
    fecha: '2026-02-22',
  },
];

export const estadoLabels: Record<string, string> = {
  pendiente: 'Pendiente',
  recolectado: 'Recolectado',
  en_transito: 'En Tránsito',
  en_reparto: 'En Reparto',
  entregado: 'Entregado',
  fallido: 'Fallido',
  problema: 'Problema/Incidencia',
};

export type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'success' | 'warning' | 'muted' | 'outline';

export const estadoColors: Record<string, BadgeVariant> = {
  pendiente: 'muted',
  recolectado: 'default',
  en_transito: 'default',
  en_reparto: 'warning',
  entregado: 'success',
  fallido: 'destructive',
  problema: 'destructive',
};

// Warehouse interfaces
export interface PaqueteInventario {
  id: string;
  trackingNumber: string;
  clienteNombre: string;
  ubicacion: string;
  zona: string;
  estante?: string;
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

// Mock data for warehouse
export const mockInventario: PaqueteInventario[] = [
  {
    id: 'inv1',
    trackingNumber: 'GE2026001240',
    clienteNombre: 'Distribuidora Central SA',
    ubicacion: 'Zona A - Estante 3',
    zona: 'A',
    estante: '3',
    estadoAlmacen: 'en_almacen',
    fechaIngreso: '2026-02-18',
    peso: 5.5,
    dimensiones: { largo: 40, ancho: 30, alto: 20 },
    volumen: 24,
    prioridad: 'normal',
    notas: 'Frágil - Manejar con cuidado'
  },
  {
    id: 'inv2',
    trackingNumber: 'GE2026001241',
    clienteNombre: 'Tecnología y Soluciones',
    ubicacion: 'Zona B - Estante 1',
    zona: 'B',
    estante: '1',
    estadoAlmacen: 'listo_despacho',
    fechaIngreso: '2026-02-20',
    peso: 2.3,
    dimensiones: { largo: 30, ancho: 25, alto: 15 },
    volumen: 11.25,
    prioridad: 'alta'
  },
  {
    id: 'inv3',
    trackingNumber: 'GE2026001242',
    clienteNombre: 'Comercializadora del Norte',
    ubicacion: 'Zona A - Estante 5',
    zona: 'A',
    estante: '5',
    estadoAlmacen: 'en_almacen',
    fechaIngreso: '2026-02-10',
    peso: 8.0,
    dimensiones: { largo: 50, ancho: 40, alto: 30 },
    volumen: 60,
    prioridad: 'urgente'
  },
  {
    id: 'inv4',
    trackingNumber: 'GE2026001243',
    clienteNombre: 'Importaciones Global',
    ubicacion: 'Zona C - Estante 2',
    zona: 'C',
    estante: '2',
    estadoAlmacen: 'recibido',
    fechaIngreso: '2026-02-22',
    peso: 3.8,
    dimensiones: { largo: 35, ancho: 25, alto: 20 },
    volumen: 17.5,
    prioridad: 'normal'
  },
  {
    id: 'inv5',
    trackingNumber: 'GE2026001244',
    clienteNombre: 'Farmacia San Roque',
    ubicacion: 'Zona B - Estante 4',
    zona: 'B',
    estante: '4',
    estadoAlmacen: 'listo_despacho',
    fechaIngreso: '2026-02-18',
    fechaSalida: '2026-02-22',
    peso: 1.2,
    dimensiones: { largo: 20, ancho: 15, alto: 10 },
    volumen: 3,
    prioridad: 'alta'
  },
];

export const mockMovimientos: MovimientoAlmacen[] = [
  {
    id: 'mov1',
    paqueteId: 'inv1',
    trackingNumber: 'GE2026001240',
    tipo: 'entrada',
    ubicacionDestino: 'Zona A - Estante 3',
    fecha: '2026-02-18',
    hora: '09:00',
    usuario: 'Admin Principal',
    notas: 'Recepción inicial'
  },
  {
    id: 'mov2',
    paqueteId: 'inv2',
    trackingNumber: 'GE2026001241',
    tipo: 'movimiento_interno',
    ubicacionOrigen: 'Zona A - Estante 2',
    ubicacionDestino: 'Zona B - Estante 1',
    fecha: '2026-02-20',
    hora: '14:30',
    usuario: 'Carlos Gómez',
    notas: 'Reorganización de inventario'
  },
  {
    id: 'mov3',
    paqueteId: 'inv5',
    trackingNumber: 'GE2026001244',
    tipo: 'salida',
    ubicacionOrigen: 'Zona B - Estante 4',
    fecha: '2026-02-22',
    hora: '10:15',
    usuario: 'Pedro Ramírez',
    notas: 'Despacho a repartidor'
  },
];

export const mockPickingList: PickingItem[] = [
  {
    id: 'pick1',
    envioId: '1',
    trackingNumber: 'GE2026001240',
    clienteNombre: 'Distribuidora Central SA',
    ubicacion: 'Zona A - Estante 3',
    destino: 'Ciudad del Este',
    peso: 5.5,
    prioridad: 'normal',
    pickeado: false,
    empaquetado: false,
    fechaCreacion: '2026-02-22'
  },
  {
    id: 'pick2',
    envioId: '2',
    trackingNumber: 'GE2026001241',
    clienteNombre: 'Tecnología y Soluciones',
    ubicacion: 'Zona B - Estante 1',
    destino: 'Encarnación',
    peso: 2.3,
    prioridad: 'alta',
    pickeado: true,
    empaquetado: false,
    fechaCreacion: '2026-02-22'
  },
  {
    id: 'pick3',
    envioId: '3',
    trackingNumber: 'GE2026001242',
    clienteNombre: 'Comercializadora del Norte',
    ubicacion: 'Zona A - Estante 5',
    destino: 'Asunción',
    peso: 8.0,
    prioridad: 'urgente',
    pickeado: true,
    empaquetado: true,
    fechaCreacion: '2026-02-20'
  },
];

export const estadoAlmacenLabels: Record<string, string> = {
  recibido: 'Recibido',
  en_almacen: 'En Almacén',
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

// ─── Empresas Cliente ─────────────────────────────────────────────────────────
// Empresas que contratan a GoExpress para gestionar su logística.
// El portal /cliente es la vista de una de estas empresas autenticada.

export type PortalStatus = 'sin_invitar' | 'invitado' | 'activo' | 'desactivado';

export interface Cliente {
  id: string;
  razonSocial: string;          // Nombre legal de la empresa
  ruc: string;                  // RUC paraguayo
  contactoNombre: string;       // Persona de contacto principal
  contactoCargo?: string;       // Cargo del contacto
  telefono: string;
  email: string;                // Email de acceso al portal
  direccion?: string;
  ciudad: string;
  estado: 'activo' | 'inactivo' | 'suspendido';
  plan?: 'basico' | 'profesional' | 'enterprise';
  saldoCuentaCorriente: number; // Gs. — negativo = deuda con GoExpress
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

export const mockClientes: Cliente[] = [
  {
    id: 'cli1',
    razonSocial: 'Distribuidora Central SA',
    ruc: '80012345-1',
    contactoNombre: 'Juan Rodríguez',
    contactoCargo: 'Gerente de Logística',
    telefono: '+595 21 555 1000',
    email: 'logistica@distribuidoracentral.py',
    direccion: 'Av. España 1234',
    ciudad: 'Asunción',
    estado: 'activo',
    saldoCuentaCorriente: -250000,
    totalEnvios: 145,
    enviosActivos: 3,
    creadoEn: '2025-08-10',
  },
  {
    id: 'cli2',
    razonSocial: 'Tecnología y Soluciones SRL',
    ruc: '80098765-2',
    contactoNombre: 'María López',
    contactoCargo: 'Directora de Operaciones',
    telefono: '+595 61 555 2000',
    email: 'operaciones@tecysol.py',
    direccion: 'Ruta 7 Km 12, Centro Empresarial',
    ciudad: 'Ciudad del Este',
    estado: 'activo',
    saldoCuentaCorriente: 0,
    totalEnvios: 87,
    enviosActivos: 1,
    creadoEn: '2025-10-03',
  },
  {
    id: 'cli3',
    razonSocial: 'Comercializadora del Norte SA',
    ruc: '80054321-3',
    contactoNombre: 'Pedro Martínez',
    contactoCargo: 'Jefe de Compras',
    telefono: '+595 36 555 3000',
    email: 'compras@comnorte.py',
    direccion: 'Av. Mariscal López 890',
    ciudad: 'Pedro Juan Caballero',
    estado: 'activo',
    saldoCuentaCorriente: -120000,
    totalEnvios: 32,
    enviosActivos: 1,
    creadoEn: '2025-11-15',
  },
  {
    id: 'cli4',
    razonSocial: 'Importaciones Global SA',
    ruc: '80076543-4',
    contactoNombre: 'Ana García',
    contactoCargo: 'Coordinadora Logística',
    telefono: '+595 21 555 4000',
    email: 'logistica@importglobal.py',
    direccion: 'Zona Franca, Av. San Blas 500',
    ciudad: 'Asunción',
    estado: 'activo',
    saldoCuentaCorriente: 85000,
    totalEnvios: 63,
    enviosActivos: 1,
    creadoEn: '2025-09-20',
  },
  {
    id: 'cli5',
    razonSocial: 'Farmacia San Roque SA',
    ruc: '80023456-5',
    contactoNombre: 'Laura Benítez',
    contactoCargo: 'Gerente General',
    telefono: '+595 21 555 5000',
    email: 'gerencia@farmsanroque.py',
    direccion: 'Calle Palma 234, Local 3',
    ciudad: 'Asunción',
    estado: 'activo',
    saldoCuentaCorriente: -45000,
    totalEnvios: 19,
    enviosActivos: 1,
    creadoEn: '2026-01-08',
  },
  {
    id: 'cli6',
    razonSocial: 'Comercial Guaraní SRL',
    ruc: '80087654-6',
    contactoNombre: 'Roberto Silva',
    contactoCargo: 'Socio Gerente',
    telefono: '+595 21 555 6000',
    email: 'administracion@comguarani.py',
    direccion: 'Av. Santísima Trinidad 890',
    ciudad: 'Luque',
    estado: 'suspendido',
    saldoCuentaCorriente: -35000,
    totalEnvios: 11,
    enviosActivos: 1,
    creadoEn: '2026-01-20',
    notas: 'Cuenta suspendida por deuda pendiente',
  },
  {
    id: 'cli7',
    razonSocial: 'Agropecuaria Don Pedro SA',
    ruc: '80034567-7',
    contactoNombre: 'Carlos Insaurralde',
    contactoCargo: 'Administrador',
    telefono: '+595 45 555 7000',
    email: 'admin@agropdonpedro.py',
    direccion: 'Ruta 2 Km 145',
    ciudad: 'Caaguazú',
    estado: 'activo',
    saldoCuentaCorriente: 320000,
    totalEnvios: 54,
    enviosActivos: 0,
    creadoEn: '2025-07-12',
  },
  {
    id: 'cli8',
    razonSocial: 'Constructora Ñandutí SA',
    ruc: '80045678-8',
    contactoNombre: 'Diego Gavilán',
    contactoCargo: 'Director de Proyectos',
    telefono: '+595 21 555 8000',
    email: 'proyectos@constructnanduti.py',
    direccion: 'Av. Mcal. López 3421',
    ciudad: 'Asunción',
    estado: 'inactivo',
    saldoCuentaCorriente: 0,
    totalEnvios: 7,
    enviosActivos: 0,
    creadoEn: '2025-12-01',
    notas: 'Empresa pausó operaciones temporalmente',
  },
];

export interface Repartidor {
  id: string;
  nombre: string;
  telefono: string;
  vehiculo: 'Moto' | 'Auto' | 'Camioneta';
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

export const mockRepartidores: Repartidor[] = [
  {
    id: '1',
    nombre: 'Pedro Ramírez',
    telefono: '+595 981 111 222',
    vehiculo: 'Moto',
    placa: 'ABC 123',
    licencia: 'LIC-123456',
    estado: 'activo',
    enviosHoy: 8,
  },
  {
    id: '2',
    nombre: 'Juan Méndez',
    telefono: '+595 982 222 333',
    vehiculo: 'Auto',
    placa: 'DEF 456',
    licencia: 'LIC-234567',
    estado: 'activo',
    enviosHoy: 12,
  },
  {
    id: '3',
    nombre: 'Ricardo Silva',
    telefono: '+595 983 333 444',
    vehiculo: 'Camioneta',
    placa: 'GHI 789',
    licencia: 'LIC-345678',
    estado: 'activo',
    enviosHoy: 5,
  },
  {
    id: '4',
    nombre: 'Marcos Flores',
    telefono: '+595 984 444 555',
    vehiculo: 'Moto',
    placa: 'JKL 012',
    licencia: 'LIC-456789',
    estado: 'inactivo',
    enviosHoy: 0,
  },
  {
    id: '5',
    nombre: 'Luis Cabrera',
    telefono: '+595 985 555 666',
    vehiculo: 'Auto',
    placa: 'MNO 345',
    licencia: 'LIC-567890',
    estado: 'activo',
    enviosHoy: 15,
  },
  {
    id: '6',
    nombre: 'Alberto Rojas',
    telefono: '+595 986 666 777',
    vehiculo: 'Moto',
    placa: 'PQR 678',
    licencia: 'LIC-678901',
    estado: 'activo',
    enviosHoy: 6,
  },
  {
    id: '7',
    nombre: 'Fernando Vera',
    telefono: '+595 987 777 888',
    vehiculo: 'Camioneta',
    placa: 'STU 901',
    licencia: 'LIC-789012',
    estado: 'inactivo',
    enviosHoy: 0,
  },
  {
    id: '8',
    nombre: 'Gustavo Arias',
    telefono: '+595 988 888 999',
    vehiculo: 'Auto',
    placa: 'VWX 234',
    licencia: 'LIC-890123',
    estado: 'activo',
    enviosHoy: 10,
  },
];

export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: 'Admin' | 'Operador' | 'Repartidor' | 'admin' | 'operador';
  estado: 'activo' | 'inactivo';
}

export const mockUsuarios: Usuario[] = [
  {
    id: '1',
    nombre: 'Juan Pérez',
    email: 'juan.perez@goexpress.py',
    rol: 'Admin',
    estado: 'activo',
  },
  {
    id: '2',
    nombre: 'María González',
    email: 'maria.gonzalez@goexpress.py',
    rol: 'Operador',
    estado: 'activo',
  },
  {
    id: '3',
    nombre: 'Pedro Ramírez',
    email: 'pedro.ramirez@goexpress.py',
    rol: 'Repartidor',
    estado: 'activo',
  },
  {
    id: '4',
    nombre: 'Ana Martínez',
    email: 'ana.martinez@goexpress.py',
    rol: 'Operador',
    estado: 'inactivo',
  },
];

export const departamentosPY = [
  'Asunción (Capital)',
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
  contra_entrega: 'Pago contra entrega'
};

export const estadosPagoColors: Record<string, BadgeVariant> = {
  pendiente: 'secondary',
  pagado: 'success',
  pago_parcial: 'warning'
};

// ─── Tarifas ──────────────────────────────────────────────────────────────────

export interface Tarifa {
  id: string;
  origen: string;
  destino: string;
  tipoServicio: 'estandar' | 'express' | 'economico';
  precioBase: number;        // Gs. - incluye el peso base
  pesoBase: number;          // kg incluidos en el precio base
  precioPorKgExtra: number;  // Gs. por kg adicional
  factorDimensional: number; // cm³/kg (estándar: 5000)
  activo: boolean;
  creadoPor: string;
  creadoEn: string;
  updatedAt?: string;
  eliminado?: boolean;
  eliminadoPor?: string;
  eliminadoEn?: string;
  motivoEliminacion?: string;
}

export const mockTarifas: Tarifa[] = [
  { id: 't1', origen: 'Asunción', destino: 'Ciudad del Este', tipoServicio: 'estandar', precioBase: 45000, pesoBase: 3, precioPorKgExtra: 8000, factorDimensional: 5000, activo: true, creadoPor: 'Admin Principal', creadoEn: '2026-01-10T08:00:00' },
  { id: 't2', origen: 'Asunción', destino: 'Ciudad del Este', tipoServicio: 'express', precioBase: 75000, pesoBase: 3, precioPorKgExtra: 12000, factorDimensional: 5000, activo: true, creadoPor: 'Admin Principal', creadoEn: '2026-01-10T08:00:00' },
  { id: 't3', origen: 'Asunción', destino: 'Encarnación', tipoServicio: 'estandar', precioBase: 50000, pesoBase: 3, precioPorKgExtra: 9000, factorDimensional: 5000, activo: true, creadoPor: 'Admin Principal', creadoEn: '2026-01-10T08:00:00' },
  { id: 't4', origen: 'Asunción', destino: 'Encarnación', tipoServicio: 'express', precioBase: 85000, pesoBase: 3, precioPorKgExtra: 14000, factorDimensional: 5000, activo: true, creadoPor: 'Admin Principal', creadoEn: '2026-01-10T08:00:00' },
  { id: 't5', origen: 'Asunción', destino: 'Luque', tipoServicio: 'estandar', precioBase: 25000, pesoBase: 5, precioPorKgExtra: 5000, factorDimensional: 5000, activo: true, creadoPor: 'Admin Principal', creadoEn: '2026-01-10T08:00:00' },
  { id: 't6', origen: 'Asunción', destino: 'San Lorenzo', tipoServicio: 'estandar', precioBase: 22000, pesoBase: 5, precioPorKgExtra: 4500, factorDimensional: 5000, activo: true, creadoPor: 'Admin Principal', creadoEn: '2026-01-10T08:00:00' },
  { id: 't7', origen: 'Asunción', destino: 'Pedro Juan Caballero', tipoServicio: 'estandar', precioBase: 70000, pesoBase: 3, precioPorKgExtra: 12000, factorDimensional: 5000, activo: true, creadoPor: 'Admin Principal', creadoEn: '2026-01-10T08:00:00' },
  { id: 't8', origen: 'Asunción', destino: 'Villarrica', tipoServicio: 'estandar', precioBase: 40000, pesoBase: 3, precioPorKgExtra: 7500, factorDimensional: 5000, activo: true, creadoPor: 'Admin Principal', creadoEn: '2026-01-10T08:00:00' },
  { id: 't9', origen: 'Asunción', destino: 'Concepción', tipoServicio: 'estandar', precioBase: 65000, pesoBase: 3, precioPorKgExtra: 11000, factorDimensional: 5000, activo: true, creadoPor: 'Admin Principal', creadoEn: '2026-01-10T08:00:00' },
  { id: 't10', origen: 'Ciudad del Este', destino: 'Asunción', tipoServicio: 'estandar', precioBase: 45000, pesoBase: 3, precioPorKgExtra: 8000, factorDimensional: 5000, activo: true, creadoPor: 'Admin Principal', creadoEn: '2026-01-10T08:00:00' },
  { id: 't11', origen: 'Encarnación', destino: 'Asunción', tipoServicio: 'estandar', precioBase: 50000, pesoBase: 3, precioPorKgExtra: 9000, factorDimensional: 5000, activo: true, creadoPor: 'Admin Principal', creadoEn: '2026-01-10T08:00:00' },
  { id: 't12', origen: 'Asunción', destino: 'Caaguazú', tipoServicio: 'estandar', precioBase: 38000, pesoBase: 3, precioPorKgExtra: 7000, factorDimensional: 5000, activo: false, creadoPor: 'Admin Principal', creadoEn: '2026-01-10T08:00:00', eliminado: true, eliminadoPor: 'Admin Principal', eliminadoEn: '2026-02-01T10:00:00', motivoEliminacion: 'Ruta temporalmente suspendida' },
];

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

// ─── Auditoría ────────────────────────────────────────────────────────────────

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

export const accionLabels: Record<string, string> = {
  crear: 'Crear',
  editar: 'Editar',
  eliminar: 'Eliminar',
  exportar: 'Exportar',
  cambio_estado: 'Cambio de Estado',
  pago: 'Registro de Pago',
  nota: 'Nota Interna',
  asignar: 'Asignar',
  importar: 'Importación Masiva',
  login: 'Inicio de Sesión',
};

export const accionColors: Record<string, string> = {
  crear: 'success',
  editar: 'primary',
  eliminar: 'destructive',
  exportar: 'muted',
  cambio_estado: 'warning',
  pago: 'success',
  nota: 'primary',
  asignar: 'warning',
  importar: 'primary',
  login: 'muted',
};

// ═══════════════════════════════════════════════════════════════
// Productos Guardados (catálogo del cliente)
// ═══════════════════════════════════════════════════════════════

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

export const mockProductosGuardados: ProductoGuardado[] = [
  {
    id: 'prod1',
    clienteId: 'cli1',
    nombre: 'Caja de documentos A4',
    descripcion: 'Caja estandar con documentos de oficina',
    peso: 2.5,
    dimensiones: { largo: 35, ancho: 25, alto: 15 },
    fragil: false,
    creadoEn: '2026-02-10',
  },
  {
    id: 'prod2',
    clienteId: 'cli1',
    nombre: 'Monitor LED 24"',
    descripcion: 'Monitor empacado con proteccion de espuma',
    peso: 5.2,
    dimensiones: { largo: 60, ancho: 40, alto: 15 },
    fragil: true,
    valorDeclarado: 1500000,
    creadoEn: '2026-02-12',
  },
  {
    id: 'prod3',
    clienteId: 'cli1',
    nombre: 'Paquete de ropa (mediano)',
    descripcion: 'Bolsa con prendas de vestir',
    peso: 1.8,
    dimensiones: { largo: 40, ancho: 30, alto: 20 },
    fragil: false,
    creadoEn: '2026-02-14',
  },
  {
    id: 'prod4',
    clienteId: 'cli1',
    nombre: 'Notebook empacada',
    descripcion: 'Laptop con caja original y accesorios',
    peso: 3.0,
    dimensiones: { largo: 45, ancho: 35, alto: 12 },
    fragil: true,
    valorDeclarado: 5000000,
    creadoEn: '2026-02-16',
  },
  {
    id: 'prod5',
    clienteId: 'cli1',
    nombre: 'Sobre con facturas',
    descripcion: 'Sobre manila con documentacion contable',
    peso: 0.3,
    dimensiones: { largo: 35, ancho: 25, alto: 3 },
    fragil: false,
    creadoEn: '2026-02-18',
  },
];

export const mockAuditoriaLogs: AuditoriaLog[] = [
  { id: 'aud1', fecha: '2026-02-22', hora: '09:15', usuario: 'Admin Principal', usuarioId: '1', accion: 'crear', entidad: 'envio', entidadId: 'GE2026001234', descripcion: 'Creó el envío GE2026001234 para Distribuidora Central SA', valorNuevo: 'Pendiente' },
  { id: 'aud2', fecha: '2026-02-22', hora: '09:45', usuario: 'María González', usuarioId: '2', accion: 'cambio_estado', entidad: 'envio', entidadId: 'GE2026001234', descripcion: 'Cambió estado del envío GE2026001234', valorAnterior: 'Pendiente', valorNuevo: 'Recolectado' },
  { id: 'aud3', fecha: '2026-02-22', hora: '10:30', usuario: 'Admin Principal', usuarioId: '1', accion: 'nota', entidad: 'nota_interna', entidadId: 'GE2026001234', descripcion: 'Agregó nota interna al envío GE2026001234: "Cliente solicitó cambio de dirección de entrega"' },
  { id: 'aud4', fecha: '2026-02-22', hora: '11:00', usuario: 'María González', usuarioId: '2', accion: 'asignar', entidad: 'envio', entidadId: 'GE2026001234', descripcion: 'Asignó repartidor Pedro Ramírez al envío GE2026001234', valorNuevo: 'Pedro Ramírez' },
  { id: 'aud5', fecha: '2026-02-22', hora: '11:20', usuario: 'Admin Principal', usuarioId: '1', accion: 'crear', entidad: 'tarifa', entidadId: 't1', descripcion: 'Creó tarifa Asunción → Ciudad del Este (Estándar) - Gs. 45.000' },
  { id: 'aud6', fecha: '2026-02-22', hora: '13:00', usuario: 'María González', usuarioId: '2', accion: 'pago', entidad: 'pago', entidadId: 'pago3', descripcion: 'Registró pago del envío GE2026001236 - Gs. 120.000 en efectivo', valorNuevo: 'Pagado' },
  { id: 'aud7', fecha: '2026-02-22', hora: '14:15', usuario: 'Admin Principal', usuarioId: '1', accion: 'exportar', entidad: 'envio', entidadId: 'todos', descripcion: 'Exportó listado completo de envíos a CSV (82 registros)' },
  { id: 'aud8', fecha: '2026-02-22', hora: '15:30', usuario: 'Admin Principal', usuarioId: '1', accion: 'cambio_estado', entidad: 'envio', entidadId: 'GE2026001237', descripcion: 'Cambió estado del envío GE2026001237', valorAnterior: 'En Tránsito', valorNuevo: 'En Reparto' },
  { id: 'aud9', fecha: '2026-02-21', hora: '09:00', usuario: 'Admin Principal', usuarioId: '1', accion: 'login', entidad: 'sistema', entidadId: 'sistema', descripcion: 'Inició sesión en el sistema' },
  { id: 'aud10', fecha: '2026-02-21', hora: '09:05', usuario: 'Admin Principal', usuarioId: '1', accion: 'crear', entidad: 'cliente', entidadId: '1', descripcion: 'Creó el cliente corporativo: Distribuidora Central SA' },
  { id: 'aud11', fecha: '2026-02-21', hora: '10:40', usuario: 'María González', usuarioId: '2', accion: 'importar', entidad: 'envio', entidadId: 'lote_20260221', descripcion: 'Importó 15 envíos masivamente desde archivo CSV (cliente: Tecnología y Soluciones)' },
  { id: 'aud12', fecha: '2026-02-21', hora: '11:50', usuario: 'Admin Principal', usuarioId: '1', accion: 'eliminar', entidad: 'tarifa', entidadId: 't12', descripcion: 'Desactivó tarifa Asunción → Caaguazú (Estándar)', valorAnterior: 'Activo', valorNuevo: 'Eliminado - Ruta temporalmente suspendida' },
  { id: 'aud13', fecha: '2026-02-21', hora: '16:20', usuario: 'María González', usuarioId: '2', accion: 'editar', entidad: 'repartidor', entidadId: '4', descripcion: 'Actualizó datos del repartidor Marcos Flores', valorAnterior: 'activo', valorNuevo: 'inactivo' },
  { id: 'aud14', fecha: '2026-02-20', hora: '08:30', usuario: 'Admin Principal', usuarioId: '1', accion: 'login', entidad: 'sistema', entidadId: 'sistema', descripcion: 'Inició sesión en el sistema' },
  { id: 'aud15', fecha: '2026-02-20', hora: '09:15', usuario: 'Admin Principal', usuarioId: '1', accion: 'crear', entidad: 'envio', entidadId: 'GE2026001239', descripcion: 'Creó el envío GE2026001239 para Comercial Guaraní' },
];

