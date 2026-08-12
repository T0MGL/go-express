import { randomBytes } from 'node:crypto';
import type { V1Envio, V1EnvioEvento } from './projection.js';

// Sandbox del gateway (keys ge_test_): el integrador prueba su parseo contra datos
// estables sin tocar envios reales. Los fixtures son deterministas a proposito, estan
// documentados en la guia del API y cubren los tres momentos del ciclo que un ERP
// necesita distinguir: pendiente, en_reparto y entregado.

export type V1EnvioSimulado = V1Envio & { simulated: true };

export const SANDBOX_TRACKING_PREFIX = 'GE-TEST-';

export function generateSandboxTracking(): string {
  return `${SANDBOX_TRACKING_PREFIX}${randomBytes(5).toString('hex').toUpperCase()}`;
}

interface SandboxFixture {
  envio: V1EnvioSimulado;
  eventos: V1EnvioEvento[];
}

function fixture(
  overrides: Partial<V1Envio> & { trackingNumber: string; estado: string },
  eventos: V1EnvioEvento[]
): SandboxFixture {
  return {
    envio: {
      codigoReferencia: null,
      origen: 'Asuncion',
      destino: 'Encarnacion',
      destinatarioNombre: 'Cliente de Prueba',
      destinatarioDireccion: 'Av. Ejemplo 1234',
      destinatarioTelefono: '+595971000000',
      destinatarioCiudad: 'Encarnacion',
      destinatarioDepartamento: 'Itapua',
      cantidad: 1,
      producto: 'Paquete de prueba',
      peso: 2,
      dimensiones: { largo: null, ancho: null, alto: null },
      fragil: false,
      valorDeclarado: 0,
      costo: 35000,
      costoSeguro: 0,
      montoACobrar: 35000,
      tipoPago: 'anticipado',
      seguroAdicional: false,
      fecha: '2026-08-01',
      fechaEntregaReal: null,
      creadoEn: '2026-08-01T09:00:00.000Z',
      simulated: true,
      ...overrides,
    },
    eventos,
  };
}

export const SANDBOX_FIXTURES: readonly SandboxFixture[] = [
  fixture(
    { trackingNumber: 'GE-TEST-0000000001', estado: 'pendiente', codigoReferencia: 'PEDIDO-001' },
    [{ estado: 'pendiente', descripcion: 'Envio creado via API', ubicacion: null, fecha: '2026-08-01T09:00:00.000Z' }]
  ),
  fixture(
    { trackingNumber: 'GE-TEST-0000000002', estado: 'en_reparto', codigoReferencia: 'PEDIDO-002', destino: 'Ciudad del Este', destinatarioCiudad: 'Ciudad del Este', destinatarioDepartamento: 'Alto Parana', costo: 30000, montoACobrar: 30000 },
    [
      { estado: 'pendiente', descripcion: 'Envio creado via API', ubicacion: null, fecha: '2026-08-01T09:00:00.000Z' },
      { estado: 'recolectado', descripcion: 'Paquete recolectado', ubicacion: 'Asuncion', fecha: '2026-08-01T13:30:00.000Z' },
      { estado: 'en_transito', descripcion: 'En camino al destino', ubicacion: 'Coronel Oviedo', fecha: '2026-08-02T08:15:00.000Z' },
      { estado: 'en_reparto', descripcion: 'En reparto final', ubicacion: 'Ciudad del Este', fecha: '2026-08-02T14:00:00.000Z' },
    ]
  ),
  fixture(
    { trackingNumber: 'GE-TEST-0000000003', estado: 'entregado', codigoReferencia: 'PEDIDO-003', fechaEntregaReal: '2026-08-02T16:45:00.000Z' },
    [
      { estado: 'pendiente', descripcion: 'Envio creado via API', ubicacion: null, fecha: '2026-08-01T09:00:00.000Z' },
      { estado: 'recolectado', descripcion: 'Paquete recolectado', ubicacion: 'Asuncion', fecha: '2026-08-01T13:30:00.000Z' },
      { estado: 'en_transito', descripcion: 'En camino al destino', ubicacion: 'San Ignacio', fecha: '2026-08-02T08:15:00.000Z' },
      { estado: 'en_reparto', descripcion: 'En reparto final', ubicacion: 'Encarnacion', fecha: '2026-08-02T14:00:00.000Z' },
      { estado: 'entregado', descripcion: 'Entregado al destinatario', ubicacion: 'Encarnacion', fecha: '2026-08-02T16:45:00.000Z' },
    ]
  ),
];

export function findSandboxFixture(trackingNumber: string): SandboxFixture | undefined {
  return SANDBOX_FIXTURES.find((f) => f.envio.trackingNumber === trackingNumber.toUpperCase());
}
