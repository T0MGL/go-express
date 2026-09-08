import { createClient } from '@supabase/supabase-js';
import { normalizeCiudad } from '../../src/lib/ciudad.js';

const ADMIN_USER_ID = '00000000-0000-4000-a000-000000000001';
const ORIGEN_RUTA = 'Asuncion';
const DESTINO_RUTA = 'Encarnacion';
// El API cotiza server-side y descarta el costo que manda el caller, asi que este es el
// costo real de todo envio de la suite: peso 2,5 no supera el peso_base de 5.
export const TARIFA_PRECIO_BASE = 35000;

const supabase = createClient(
  process.env['SUPABASE_URL']!,
  process.env['SUPABASE_SERVICE_ROLE_KEY']!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export interface TestData {
  clienteId: string;
  repartidorId: string;
  tarifaId: string;
  // La tarifa de la ruta es compartida: si otra corrida la dejo viva, esta la adopta en vez
  // de duplicarla, y entonces no le corresponde borrarla.
  tarifaPropia: boolean;
}

let seeded: TestData | null = null;

async function ensureAdminUser(): Promise<void> {
  const { error } = await supabase.from('usuarios').upsert(
    {
      id: ADMIN_USER_ID,
      nombre: 'Admin GoExpress',
      email: 'admin@goexpress.com.py',
      rol: 'admin',
      estado: 'activo',
    },
    { onConflict: 'id', ignoreDuplicates: false }
  );

  if (error) {
    throw new Error(`Seed: failed to ensure admin user exists: ${error.message}`);
  }
}

// Espejo del seguro_config vivo de prod. Los tests de bulk import (A3) dependen de estos
// valores para asserts exactos de costo_seguro; si cambia en prod, actualizar aca.
async function ensureSeguroConfig(): Promise<void> {
  const { error } = await supabase.from('configuracion').upsert(
    {
      key: 'seguro_config',
      value: {
        tasaAdicional: 0.1,
        umbralIncluido: 200000,
        minimoAdicional: 5000,
        maximoAsegurable: 50000000,
      },
    },
    { onConflict: 'key', ignoreDuplicates: false }
  );

  if (error) {
    throw new Error(`Seed: failed to ensure seguro_config: ${error.message}`);
  }
}

// generate_tracking_number() lee estos keys de configuracion; sin ellos devuelve NULL y
// cualquier INSERT de envios muere contra el NOT NULL de tracking_number.
async function ensureTrackingConfig(): Promise<void> {
  const { error } = await supabase.from('configuracion').upsert(
    [
      { key: 'tracking_prefix', value: 'GE' },
      { key: 'tracking_year', value: '2026' },
    ],
    { onConflict: 'key', ignoreDuplicates: false }
  );

  if (error) {
    throw new Error(`Seed: failed to ensure tracking config: ${error.message}`);
  }
}

// tarifas_ruta_servicio_unica es un unique parcial sobre (origen, destino, tipo_servicio)
// normalizados, con activo y no eliminado. El seed insertaba siempre la misma ruta con un uuid
// nuevo: si una corrida moria antes del cleanup, la fila quedaba viva y TODAS las corridas
// siguientes reventaban para siempre. Se inserta y, si la ruta ya existe, se adopta la fila
// que esta ahi en vez de pelearse con ella.
async function ensureTarifaRuta(tarifaId: string): Promise<{ tarifaId: string; tarifaPropia: boolean }> {
  const { error } = await supabase.from('tarifas').insert({
    id: tarifaId,
    origen: ORIGEN_RUTA,
    destino: DESTINO_RUTA,
    tipo_servicio: 'estandar',
    precio_base: 35000,
    peso_base: 5,
    precio_por_kg_extra: 5000,
    factor_dimensional: 5000,
    activo: true,
    eliminado: false,
    creado_por: ADMIN_USER_ID,
  });

  if (!error) {
    return { tarifaId, tarifaPropia: true };
  }

  if (error.code !== '23505') {
    throw new Error(`Seed: failed to create test tarifa: ${error.message}`);
  }

  const { data, error: lookupError } = await supabase
    .from('tarifas')
    .select('id, origen, destino')
    .eq('tipo_servicio', 'estandar')
    .eq('activo', true)
    .eq('eliminado', false);

  if (lookupError) {
    throw new Error(`Seed: failed to look up existing tarifa: ${lookupError.message}`);
  }

  const existente = (data ?? []).find(
    (row: { origen: string; destino: string }) =>
      normalizeCiudad(row.origen) === normalizeCiudad(ORIGEN_RUTA) &&
      normalizeCiudad(row.destino) === normalizeCiudad(DESTINO_RUTA)
  ) as { id: string } | undefined;

  if (!existente) {
    throw new Error(
      `Seed: la tarifa ${ORIGEN_RUTA} a ${DESTINO_RUTA} choco contra el unique pero no aparece activa. Revisar tarifas a mano.`
    );
  }

  return { tarifaId: existente.id, tarifaPropia: false };
}

export async function seedTestData(): Promise<TestData> {
  if (seeded) return seeded;

  await Promise.all([ensureAdminUser(), ensureSeguroConfig(), ensureTrackingConfig()]);

  const clienteId = crypto.randomUUID();
  const repartidorId = crypto.randomUUID();
  const tarifaId = crypto.randomUUID();
  const suffix = clienteId.slice(0, 8);

  const { error: clienteErr } = await supabase.from('clientes').insert({
    id: clienteId,
    razon_social: `Test Client SA ${suffix}`,
    ruc: `TEST-${suffix}`,
    contacto_nombre: 'Test Contact',
    telefono: '+595971000001',
    email: `test-${suffix}@goexpress.test`,
    direccion: 'Test Address 123, Asuncion',
    ciudad: 'Asuncion',
    estado: 'activo',
    plan: 'profesional',
    portal_activo: true,
    portal_status: 'activo',
    total_envios: 0,
    envios_activos: 0,
    eliminado: false,
  });

  if (clienteErr) {
    throw new Error(`Seed: failed to create test client: ${clienteErr.message}`);
  }

  const { error: repartidorErr } = await supabase.from('repartidores').insert({
    id: repartidorId,
    nombre: `Test Repartidor ${suffix}`,
    telefono: '+595971000002',
    vehiculo: 'Moto',
    placa: `T${suffix.slice(0, 5).toUpperCase()}`,
    licencia: `LIC-${suffix}`,
    estado: 'activo',
    eliminado: false,
  });

  if (repartidorErr) {
    throw new Error(`Seed: failed to create test repartidor: ${repartidorErr.message}`);
  }

  const tarifa = await ensureTarifaRuta(tarifaId);

  seeded = { clienteId, repartidorId, ...tarifa };
  return seeded;
}

// Recibe undefined a proposito: cuando seedTestData tira, el afterAll corre igual con la
// variable sin asignar, y un cleanup que explota ahi convierte un fallo en dos.
export async function cleanupTestData(data: TestData | undefined): Promise<void> {
  if (!data) {
    seeded = null;
    return;
  }

  const { data: envios } = await supabase
    .from('envios')
    .select('id')
    .eq('cliente_id', data.clienteId);

  if (envios && envios.length > 0) {
    const envioIds = envios.map((e: { id: string }) => e.id);
    await supabase.from('notas_internas').delete().in('envio_id', envioIds);
    await supabase.from('eventos_envio').delete().in('envio_id', envioIds);
    await supabase.from('pagos').delete().in('envio_id', envioIds);
    await supabase.from('envios').delete().in('id', envioIds);
  }

  if (data.tarifaPropia) {
    await supabase.from('tarifas').delete().eq('id', data.tarifaId);
  }
  await supabase.from('repartidores').delete().eq('id', data.repartidorId);
  await supabase.from('clientes').delete().eq('id', data.clienteId);

  seeded = null;
}

export function makeEnvioPayload(clienteId: string, overrides: Record<string, unknown> = {}) {
  return {
    clienteId,
    origen: 'Asuncion',
    destino: 'Encarnacion',
    destinatarioNombre: 'Juan Test Perez',
    destinatarioDireccion: 'Av. Mcal Lopez 1234, Barrio Jara',
    destinatarioTelefono: '+595971123456',
    destinatarioCiudad: 'Encarnacion',
    destinatarioDepartamento: 'Itapua',
    peso: 2.5,
    costo: 45000,
    montoACobrar: 45000,
    tipoPago: 'contra_entrega' as const,
    ...overrides,
  };
}

// I1 exige monto_a_cobrar >= costo + seguro, y el costo sale de la tarifa (35000), no del
// payload. Un test que necesita otro flete tiene que pedirlo por donde lo pide el admin:
// costo manual explicito con motivo, que queda en auditoria.
export function makeEnvioPayloadCostoManual(
  clienteId: string,
  costo: number,
  overrides: Record<string, unknown> = {}
) {
  return makeEnvioPayload(clienteId, {
    costo,
    montoACobrar: costo,
    forzarCostoManual: true,
    motivoCostoManual: 'Costo pactado para el escenario de prueba',
    ...overrides,
  });
}
