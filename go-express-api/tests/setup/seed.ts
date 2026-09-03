import { createClient } from '@supabase/supabase-js';

const ADMIN_USER_ID = '00000000-0000-4000-a000-000000000001';

const supabase = createClient(
  process.env['SUPABASE_URL']!,
  process.env['SUPABASE_SERVICE_ROLE_KEY']!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export interface TestData {
  clienteId: string;
  repartidorId: string;
  tarifaId: string;
  /** Falso cuando el seed reuso una tarifa que ya existia: no es suya para borrar. */
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

  // La ruta tiene un indice unico normalizado (tarifas_ruta_servicio_unica), asi que la
  // tarifa es estado compartido entre archivos de test: el primero que la crea la deja
  // puesta. El cleanup no siempre puede borrarla, porque los envios que la referencian
  // sobreviven cuando tienen pagos, y pagos es append-only por trigger. Reusarla en vez de
  // insertar a ciegas es lo que evita que el segundo archivo muera con duplicate key.
  const { data: tarifaExistente } = await supabase
    .from('tarifas')
    .select('id')
    .eq('tipo_servicio', 'estandar')
    .eq('activo', true)
    .eq('eliminado', false)
    .ilike('origen', 'asuncion')
    .ilike('destino', 'encarnacion')
    .maybeSingle();

  if (tarifaExistente) {
    seeded = {
      clienteId,
      repartidorId,
      tarifaId: (tarifaExistente as { id: string }).id,
      tarifaPropia: false,
    };
    return seeded;
  }

  const { error: tarifaErr } = await supabase.from('tarifas').insert({
    id: tarifaId,
    origen: 'Asuncion',
    destino: 'Encarnacion',
    tipo_servicio: 'estandar',
    precio_base: 35000,
    peso_base: 5,
    precio_por_kg_extra: 5000,
    factor_dimensional: 5000,
    activo: true,
    eliminado: false,
    creado_por: ADMIN_USER_ID,
  });

  if (tarifaErr) {
    throw new Error(`Seed: failed to create test tarifa: ${tarifaErr.message}`);
  }

  seeded = { clienteId, repartidorId, tarifaId, tarifaPropia: true };
  return seeded;
}

// El cleanup borra lo que puede y deja constancia de lo que no. Antes ignoraba el
// resultado de cada delete, asi que el borrado de pagos fallaba en silencio contra el
// trigger append-only y arrastraba a envios, tarifa y cliente por FK. El sintoma aparecia
// recien en el archivo siguiente, como un duplicate key del seed.
type QueryDelete = ReturnType<ReturnType<typeof supabase.from>['delete']>;
type Filtro = (q: QueryDelete) => PromiseLike<{ error: { message: string } | null }>;

async function borrar(tabla: string, filtro: Filtro, fallosTolerados: string[] = []): Promise<void> {
  const { error } = await filtro(supabase.from(tabla).delete());
  if (error && !fallosTolerados.some((f) => error.message.includes(f))) {
    console.warn(`cleanup: no se pudo limpiar ${tabla}: ${error.message}`);
  }
}

export async function cleanupTestData(data: TestData): Promise<void> {
  const { data: envios } = await supabase
    .from('envios')
    .select('id')
    .eq('cliente_id', data.clienteId);

  if (envios && envios.length > 0) {
    const envioIds = envios.map((e: { id: string }) => e.id);

    // pagos es append-only por trigger (trg_pagos_no_delete), igual que en prod. Los envios
    // que tengan pago quedan en pie a proposito: cada archivo usa un cliente nuevo, asi que
    // el remanente no colisiona con nada.
    const { data: conPago } = await supabase.from('pagos').select('envio_id').in('envio_id', envioIds);
    const bloqueados = new Set((conPago ?? []).map((p: { envio_id: string }) => p.envio_id));
    const borrables = envioIds.filter((id) => !bloqueados.has(id));

    await borrar('notas_internas', (q) => q.in('envio_id', envioIds));
    await borrar('eventos_envio', (q) => q.in('envio_id', envioIds));

    if (borrables.length > 0) {
      await borrar('envios', (q) => q.in('id', borrables));
    }
  }

  if (data.tarifaPropia) {
    await borrar('tarifas', (q) => q.eq('id', data.tarifaId), ['violates foreign key']);
  }
  await borrar('repartidores', (q) => q.eq('id', data.repartidorId), ['violates foreign key']);
  await borrar('clientes', (q) => q.eq('id', data.clienteId), ['violates foreign key']);

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
