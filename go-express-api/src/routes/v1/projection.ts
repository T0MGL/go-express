import type { Envio } from '../../types/index.js';

// Proyeccion publica del gateway: el tercero identifica el envio por tracking number.
// No se exponen ids internos, repartidor, incidencias ni campos de soft-delete.
export interface V1Envio {
  trackingNumber: string;
  codigoReferencia: string | null;
  estado: string;
  origen: string;
  destino: string;
  destinatarioNombre: string;
  destinatarioDireccion: string;
  destinatarioTelefono: string;
  destinatarioCiudad: string;
  destinatarioDepartamento: string;
  cantidad: number;
  producto: string;
  peso: number;
  dimensiones: { largo: number | null; ancho: number | null; alto: number | null };
  fragil: boolean;
  valorDeclarado: number;
  costo: number;
  costoSeguro: number;
  montoACobrar: number;
  tipoPago: string;
  seguroAdicional: boolean;
  fecha: string;
  fechaEntregaReal: string | null;
  creadoEn: string;
}

export interface V1EnvioEvento {
  estado: string;
  descripcion: string | null;
  ubicacion: string | null;
  fecha: string;
}

export function toV1Envio(envio: Envio): V1Envio {
  return {
    trackingNumber: envio.trackingNumber,
    codigoReferencia: envio.codigoReferencia,
    estado: envio.estado,
    origen: envio.origen,
    destino: envio.destino,
    destinatarioNombre: envio.destinatarioNombre,
    destinatarioDireccion: envio.destinatarioDireccion,
    destinatarioTelefono: envio.destinatarioTelefono,
    destinatarioCiudad: envio.destinatarioCiudad,
    destinatarioDepartamento: envio.destinatarioDepartamento,
    cantidad: envio.cantidad,
    producto: envio.producto,
    peso: envio.peso,
    dimensiones: envio.dimensiones,
    fragil: envio.fragil,
    valorDeclarado: envio.valorDeclarado,
    costo: envio.costo,
    costoSeguro: envio.costoSeguro,
    montoACobrar: envio.montoACobrar,
    tipoPago: envio.tipoPago,
    seguroAdicional: envio.seguroAdicional,
    fecha: envio.fecha,
    fechaEntregaReal: envio.fechaEntregaReal,
    creadoEn: envio.creadoEn,
  };
}
