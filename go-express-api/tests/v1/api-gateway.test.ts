import { createClient } from '@supabase/supabase-js';
import { request, adminHeaders, publicHeaders } from '../setup/test-client.js';
import { seedTestData, cleanupTestData, type TestData } from '../setup/seed.js';

// Ciclo completo del API Gateway Fase 1: admin emite/lista/rota/revoca keys y un tercero
// opera /api/v1 con ellas. Corre contra el stack Supabase local (docs/test-db-local.md);
// requiere sql/053 aplicada (scripts/test-db-reset.sh ya la incluye).

const supabase = createClient(
  process.env['SUPABASE_URL']!,
  process.env['SUPABASE_SERVICE_ROLE_KEY']!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

let testData: TestData;
let cliente2Id: string;

function apiHeaders(key: string): Record<string, string> {
  return { 'X-API-Key': key, 'Content-Type': 'application/json' };
}

function envioPayload(overrides: Record<string, unknown> = {}) {
  return {
    destinatarioNombre: 'Maria Gateway Lopez',
    destinatarioDireccion: 'Av. Irrazabal 456, Encarnacion',
    destinatarioTelefono: '+595971654321',
    destinatarioCiudad: 'Encarnacion',
    destinatarioDepartamento: 'Itapua',
    peso: 2,
    ...overrides,
  };
}

async function crearKey(body: Record<string, unknown>): Promise<{ id: string; key: string; keyPrefix: string }> {
  const res = await request.post('/api/admin/api-keys').set(adminHeaders()).send(body);
  expect(res.status).toBe(201);
  return res.body as { id: string; key: string; keyPrefix: string };
}

beforeAll(async () => {
  testData = await seedTestData();

  // Segundo cliente para probar el aislamiento cross-cliente, sembrado directo como seed.ts.
  cliente2Id = crypto.randomUUID();
  const suffix = cliente2Id.slice(0, 8);
  const { error } = await supabase.from('clientes').insert({
    id: cliente2Id,
    razon_social: `Test Client Dos SA ${suffix}`,
    ruc: `TEST2-${suffix}`,
    contacto_nombre: 'Test Contact Dos',
    telefono: '+595971000003',
    email: `test2-${suffix}@goexpress.test`,
    direccion: 'Test Address 456, Asuncion',
    ciudad: 'Asuncion',
    estado: 'activo',
    plan: 'profesional',
    portal_activo: false,
    portal_status: 'sin_invitar',
    total_envios: 0,
    envios_activos: 0,
    eliminado: false,
  });
  if (error) throw new Error(`Seed cliente2: ${error.message}`);
});

afterAll(async () => {
  await supabase.from('api_keys').delete().in('cliente_id', [testData.clienteId, cliente2Id]);

  const { data: envios2 } = await supabase.from('envios').select('id').eq('cliente_id', cliente2Id);
  if (envios2 && envios2.length > 0) {
    const ids = envios2.map((e: { id: string }) => e.id);
    await supabase.from('eventos_envio').delete().in('envio_id', ids);
    await supabase.from('envios').delete().in('id', ids);
  }
  await supabase.from('clientes').delete().eq('id', cliente2Id);

  await cleanupTestData(testData);
});

describe('POST /api/admin/api-keys', () => {
  it('crea una key y devuelve el plaintext una sola vez', async () => {
    const body = await crearKey({
      clienteId: testData.clienteId,
      nombre: 'ERP integracion test',
      permisos: ['crear_envios', 'consultar_envios', 'consultar_tarifas'],
    });

    expect(body.key).toMatch(/^ge_live_[0-9A-Za-z]{43}$/);
    expect(body.keyPrefix).toHaveLength(12);
    expect(body.key.startsWith(body.keyPrefix)).toBe(true);
    expect(body).not.toHaveProperty('keyHash');
    expect(body).not.toHaveProperty('key_hash');
  });

  it('rechaza cliente inexistente con 404', async () => {
    const res = await request
      .post('/api/admin/api-keys')
      .set(adminHeaders())
      .send({ clienteId: crypto.randomUUID(), nombre: 'Huerfana', permisos: ['consultar_tarifas'] });

    expect(res.status).toBe(404);
  });

  it('rechaza expiraEn en el pasado con 400', async () => {
    const res = await request
      .post('/api/admin/api-keys')
      .set(adminHeaders())
      .send({
        clienteId: testData.clienteId,
        nombre: 'Key nacida muerta',
        permisos: ['consultar_tarifas'],
        expiraEn: new Date(Date.now() - 60_000).toISOString(),
      });

    expect(res.status).toBe(400);
  });

  it('rechaza permisos invalidos con 400', async () => {
    const res = await request
      .post('/api/admin/api-keys')
      .set(adminHeaders())
      .send({ clienteId: testData.clienteId, nombre: 'Permisos rotos', permisos: ['borrar_todo'] });

    expect(res.status).toBe(400);
  });

  it('exige auth admin', async () => {
    const res = await request
      .post('/api/admin/api-keys')
      .set(publicHeaders())
      .send({ clienteId: testData.clienteId, nombre: 'Sin auth', permisos: ['consultar_tarifas'] });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/admin/api-keys', () => {
  it('lista con prefix y sin hash ni plaintext', async () => {
    const creada = await crearKey({
      clienteId: testData.clienteId,
      nombre: 'Key para listar',
      permisos: ['consultar_envios'],
    });

    const res = await request
      .get('/api/admin/api-keys')
      .query({ clienteId: testData.clienteId })
      .set(adminHeaders());

    expect(res.status).toBe(200);
    const fila = (res.body as Array<Record<string, unknown>>).find((k) => k['id'] === creada.id);
    expect(fila).toBeDefined();
    expect(fila!['keyPrefix']).toBe(creada.keyPrefix);
    expect(fila!['key']).toBeUndefined();
    expect(fila!['keyHash']).toBeUndefined();
    expect(fila!['key_hash']).toBeUndefined();
  });
});

describe('POST /api/v1/envios', () => {
  it('crea un envio con costo server-side y responde tracking', async () => {
    const { key } = await crearKey({
      clienteId: testData.clienteId,
      nombre: 'Key crear envios',
      permisos: ['crear_envios', 'consultar_envios'],
    });

    const res = await request.post('/api/v1/envios').set(apiHeaders(key)).send(envioPayload());

    expect(res.status).toBe(201);
    expect(res.body.trackingNumber).toMatch(/^GE/);
    expect(res.body.estado).toBe('pendiente');
    // Tarifa seed Asuncion -> Encarnacion: base 35000, peso 2 <= peso_base 5.
    expect(res.body.costo).toBe(35000);
    expect(res.body.tipoPago).toBe('anticipado');
    expect(res.body.montoACobrar).toBe(res.body.costo + res.body.costoSeguro);
    expect(res.body.id).toBeUndefined();
    expect(res.body.clienteId).toBeUndefined();
  });

  it('ignora todo intento de mandar costo o clienteId propios', async () => {
    const { key } = await crearKey({
      clienteId: testData.clienteId,
      nombre: 'Key tamper',
      permisos: ['crear_envios'],
    });

    const res = await request
      .post('/api/v1/envios')
      .set(apiHeaders(key))
      .send(envioPayload({ costo: 1, clienteId: cliente2Id }));

    expect(res.status).toBe(201);
    expect(res.body.costo).toBe(35000);
    expect(res.body.tipoPago).toBe('anticipado');
  });

  it('tipoPago anticipado explicito se comporta igual que omitirlo', async () => {
    const { key } = await crearKey({
      clienteId: testData.clienteId,
      nombre: 'Key anticipado explicito',
      permisos: ['crear_envios'],
    });

    const res = await request
      .post('/api/v1/envios')
      .set(apiHeaders(key))
      .send(envioPayload({ tipoPago: 'anticipado' }));

    expect(res.status).toBe(201);
    expect(res.body.tipoPago).toBe('anticipado');
    expect(res.body.montoACobrar).toBe(res.body.costo + res.body.costoSeguro);
  });

  it('400 cuando anticipado viene con montoACobrar: el monto lo fija el servidor', async () => {
    const { key } = await crearKey({
      clienteId: testData.clienteId,
      nombre: 'Key anticipado con monto',
      permisos: ['crear_envios'],
    });

    const res = await request
      .post('/api/v1/envios')
      .set(apiHeaders(key))
      .send(envioPayload({ montoACobrar: 185000 }));

    expect(res.status).toBe(400);
    const issues = res.body.details[0].issues as Array<{ field: string }>;
    expect(issues.some((i) => i.field === 'montoACobrar')).toBe(true);
  });

  it('422 RUTA_SIN_TARIFA cuando el destino no tiene tarifa: no crea envio a costo cero', async () => {
    const { key } = await crearKey({
      clienteId: testData.clienteId,
      nombre: 'Key ruta sin tarifa',
      permisos: ['crear_envios'],
    });

    const res = await request
      .post('/api/v1/envios')
      .set(apiHeaders(key))
      .send(envioPayload({ destinatarioCiudad: 'Fuerte Olimpo' }));

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('RUTA_SIN_TARIFA');
  });

  it('con Idempotency-Key el retry devuelve el mismo envio en vez de duplicarlo', async () => {
    const { key } = await crearKey({
      clienteId: testData.clienteId,
      nombre: 'Key idempotente',
      permisos: ['crear_envios', 'consultar_envios'],
    });
    const idem = `retry-test-${crypto.randomUUID()}`;

    const primera = await request
      .post('/api/v1/envios')
      .set({ ...apiHeaders(key), 'Idempotency-Key': idem })
      .send(envioPayload());
    const segunda = await request
      .post('/api/v1/envios')
      .set({ ...apiHeaders(key), 'Idempotency-Key': idem })
      .send(envioPayload());

    expect(primera.status).toBe(201);
    expect(segunda.status).toBe(200);
    expect(segunda.body.trackingNumber).toBe(primera.body.trackingNumber);

    const { count } = await supabase
      .from('envios')
      .select('id', { count: 'exact', head: true })
      .eq('cliente_id', testData.clienteId)
      .eq('api_idempotency_key', idem);
    expect(count).toBe(1);
  });

  it('rechaza Idempotency-Key con formato invalido con 400', async () => {
    const { key } = await crearKey({
      clienteId: testData.clienteId,
      nombre: 'Key idem invalida',
      permisos: ['crear_envios'],
    });

    const res = await request
      .post('/api/v1/envios')
      .set({ ...apiHeaders(key), 'Idempotency-Key': 'corta' })
      .send(envioPayload());

    expect(res.status).toBe(400);
  });

  it('401 sin key y 401 con key inventada', async () => {
    const sinKey = await request.post('/api/v1/envios').set(publicHeaders()).send(envioPayload());
    expect(sinKey.status).toBe(401);

    const inventada = await request
      .post('/api/v1/envios')
      .set(apiHeaders(`ge_live_${'A'.repeat(43)}`))
      .send(envioPayload());
    expect(inventada.status).toBe(401);
  });

  it('403 cuando la key no tiene el permiso crear_envios', async () => {
    const { key } = await crearKey({
      clienteId: testData.clienteId,
      nombre: 'Key solo lectura',
      permisos: ['consultar_tarifas'],
    });

    const res = await request.post('/api/v1/envios').set(apiHeaders(key)).send(envioPayload());
    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/envios contra_entrega', () => {
  // Tarifa seed Asuncion -> Encarnacion: 35000, sin seguro => minimo I1 = 35000.
  const MINIMO = 35000;

  it('crea un envio COD con el monto exacto al minimo', async () => {
    const { key } = await crearKey({
      clienteId: testData.clienteId,
      nombre: 'Key cod exacto',
      permisos: ['crear_envios'],
    });

    const res = await request
      .post('/api/v1/envios')
      .set(apiHeaders(key))
      .send(envioPayload({ tipoPago: 'contra_entrega', montoACobrar: MINIMO }));

    expect(res.status).toBe(201);
    expect(res.body.tipoPago).toBe('contra_entrega');
    expect(res.body.costo).toBe(MINIMO);
    expect(res.body.montoACobrar).toBe(MINIMO);
    expect(res.body.id).toBeUndefined();
    expect(res.body.clienteId).toBeUndefined();
  });

  it('crea un envio COD con excedente y lo persiste tal cual (el excedente es producto de la tienda)', async () => {
    const { key } = await crearKey({
      clienteId: testData.clienteId,
      nombre: 'Key cod excedente',
      permisos: ['crear_envios'],
    });

    const res = await request
      .post('/api/v1/envios')
      .set(apiHeaders(key))
      .send(envioPayload({ tipoPago: 'contra_entrega', montoACobrar: 250000 }));

    expect(res.status).toBe(201);
    expect(res.body.costo).toBe(MINIMO);
    expect(res.body.montoACobrar).toBe(250000);

    const { data } = await supabase
      .from('envios')
      .select('tipo_pago, monto_a_cobrar, costo')
      .eq('tracking_number', res.body.trackingNumber)
      .single();
    const row = data as { tipo_pago: string; monto_a_cobrar: number; costo: number };
    expect(row.tipo_pago).toBe('contra_entrega');
    expect(row.monto_a_cobrar).toBe(250000);
    expect(row.costo).toBe(MINIMO);
  });

  it('422 MONTO_INSUFICIENTE con el minimo exacto y su composicion, sin crear nada', async () => {
    const { key } = await crearKey({
      clienteId: testData.clienteId,
      nombre: 'Key cod insuficiente',
      permisos: ['crear_envios'],
    });

    const res = await request
      .post('/api/v1/envios')
      .set(apiHeaders(key))
      .send(envioPayload({ tipoPago: 'contra_entrega', montoACobrar: MINIMO - 1, codigoReferencia: 'COD-CORTO' }));

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('MONTO_INSUFICIENTE');
    expect(res.body.details).toEqual({ minimo: MINIMO, costo: MINIMO, costoSeguro: 0, montoACobrar: MINIMO - 1 });
    expect(res.body.error).toContain(String(MINIMO));

    const { count } = await supabase
      .from('envios')
      .select('id', { count: 'exact', head: true })
      .eq('cliente_id', testData.clienteId)
      .eq('codigo_referencia', 'COD-CORTO');
    expect(count).toBe(0);
  });

  it('el minimo incluye el costo del seguro cuando aplica', async () => {
    const { key } = await crearKey({
      clienteId: testData.clienteId,
      nombre: 'Key cod con seguro',
      permisos: ['crear_envios'],
    });
    // seguro_config seed: umbral 200000, tasa 0.1 sobre el valor declarado completo
    // => valorDeclarado 300000 cuesta 30000 y el minimo I1 pasa a 35000 + 30000.
    const conSeguro = { tipoPago: 'contra_entrega', seguroAdicional: true, valorDeclarado: 300000 };

    const corto = await request
      .post('/api/v1/envios')
      .set(apiHeaders(key))
      .send(envioPayload({ ...conSeguro, montoACobrar: 64999 }));
    expect(corto.status).toBe(422);
    expect(corto.body.details.minimo).toBe(65000);
    expect(corto.body.details.costoSeguro).toBe(30000);

    const justo = await request
      .post('/api/v1/envios')
      .set(apiHeaders(key))
      .send(envioPayload({ ...conSeguro, montoACobrar: 65000 }));
    expect(justo.status).toBe(201);
    expect(justo.body.costoSeguro).toBe(30000);
    expect(justo.body.montoACobrar).toBe(65000);
  });

  it('400 cuando contra_entrega viene sin montoACobrar', async () => {
    const { key } = await crearKey({
      clienteId: testData.clienteId,
      nombre: 'Key cod sin monto',
      permisos: ['crear_envios'],
    });

    const res = await request
      .post('/api/v1/envios')
      .set(apiHeaders(key))
      .send(envioPayload({ tipoPago: 'contra_entrega' }));

    expect(res.status).toBe(400);
    const issues = res.body.details[0].issues as Array<{ field: string }>;
    expect(issues.some((i) => i.field === 'montoACobrar')).toBe(true);
  });

  it('idempotencia COD: el retry devuelve el mismo envio, la misma key con otro monto es 409', async () => {
    const { key } = await crearKey({
      clienteId: testData.clienteId,
      nombre: 'Key cod idempotente',
      permisos: ['crear_envios'],
    });
    const idem = `cod-retry-${crypto.randomUUID()}`;
    const body = envioPayload({ tipoPago: 'contra_entrega', montoACobrar: 180000 });

    const primera = await request
      .post('/api/v1/envios')
      .set({ ...apiHeaders(key), 'Idempotency-Key': idem })
      .send(body);
    expect(primera.status).toBe(201);

    const replay = await request
      .post('/api/v1/envios')
      .set({ ...apiHeaders(key), 'Idempotency-Key': idem })
      .send(body);
    expect(replay.status).toBe(200);
    expect(replay.body.trackingNumber).toBe(primera.body.trackingNumber);
    expect(replay.body.montoACobrar).toBe(180000);

    const conOtroMonto = await request
      .post('/api/v1/envios')
      .set({ ...apiHeaders(key), 'Idempotency-Key': idem })
      .send(envioPayload({ tipoPago: 'contra_entrega', montoACobrar: 200000 }));
    expect(conOtroMonto.status).toBe(409);
    expect(conOtroMonto.body.code).toBe('IDEMPOTENCY_KEY_REUSED');

    const { count } = await supabase
      .from('envios')
      .select('id', { count: 'exact', head: true })
      .eq('cliente_id', testData.clienteId)
      .eq('api_idempotency_key', idem);
    expect(count).toBe(1);
  });
});

describe('GET /api/v1/envios/:tracking', () => {
  it('devuelve estado + eventos del envio propio', async () => {
    const { key } = await crearKey({
      clienteId: testData.clienteId,
      nombre: 'Key tracking',
      permisos: ['crear_envios', 'consultar_envios'],
    });

    const creado = await request.post('/api/v1/envios').set(apiHeaders(key)).send(envioPayload());
    expect(creado.status).toBe(201);

    const res = await request
      .get(`/api/v1/envios/${creado.body.trackingNumber}`)
      .set(apiHeaders(key));

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('pendiente');
    expect(Array.isArray(res.body.eventos)).toBe(true);
    expect(res.body.eventos.length).toBeGreaterThanOrEqual(1);
    expect(res.body.eventos[0].estado).toBe('pendiente');
  });

  it('404 para tracking de otro cliente (mismo 404 que inexistente)', async () => {
    const { key: keyCliente1 } = await crearKey({
      clienteId: testData.clienteId,
      nombre: 'Key cliente 1',
      permisos: ['crear_envios', 'consultar_envios'],
    });
    const { key: keyCliente2 } = await crearKey({
      clienteId: cliente2Id,
      nombre: 'Key cliente 2',
      permisos: ['consultar_envios'],
    });

    const creado = await request.post('/api/v1/envios').set(apiHeaders(keyCliente1)).send(envioPayload());
    expect(creado.status).toBe(201);

    const ajeno = await request
      .get(`/api/v1/envios/${creado.body.trackingNumber}`)
      .set(apiHeaders(keyCliente2));
    const inexistente = await request.get('/api/v1/envios/GE0000000000').set(apiHeaders(keyCliente2));

    expect(ajeno.status).toBe(404);
    expect(inexistente.status).toBe(404);
    expect(ajeno.body.code).toBe(inexistente.body.code);
  });
});

describe('GET /api/v1/envios', () => {
  it('lista solo envios del cliente de la key, paginado', async () => {
    const { key } = await crearKey({
      clienteId: testData.clienteId,
      nombre: 'Key listado',
      permisos: ['crear_envios', 'consultar_envios'],
    });
    const creado = await request.post('/api/v1/envios').set(apiHeaders(key)).send(envioPayload());
    expect(creado.status).toBe(201);

    const res = await request
      .get('/api/v1/envios')
      .query({ estado: 'pendiente', limit: 50 })
      .set(apiHeaders(key));

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBeGreaterThanOrEqual(1);
    const trackings = (res.body.data as Array<{ trackingNumber: string }>).map((e) => e.trackingNumber);
    expect(trackings).toContain(creado.body.trackingNumber);

    // La key del cliente 2 no ve nada de cliente 1.
    const { key: keyCliente2 } = await crearKey({
      clienteId: cliente2Id,
      nombre: 'Key listado cliente 2',
      permisos: ['consultar_envios'],
    });
    const resAjeno = await request.get('/api/v1/envios').set(apiHeaders(keyCliente2));
    expect(resAjeno.status).toBe(200);
    const trackingsAjenos = (resAjeno.body.data as Array<{ trackingNumber: string }>).map((e) => e.trackingNumber);
    expect(trackingsAjenos).not.toContain(creado.body.trackingNumber);
  });
});

describe('GET /api/v1/tarifas', () => {
  it('cotiza una ruta con tarifa', async () => {
    const { key } = await crearKey({
      clienteId: testData.clienteId,
      nombre: 'Key tarifas',
      permisos: ['consultar_tarifas'],
    });

    const res = await request
      .get('/api/v1/tarifas')
      .query({ origen: 'Asuncion', destino: 'Encarnacion', peso: 2 })
      .set(apiHeaders(key));

    expect(res.status).toBe(200);
    expect(res.body.matched).toBe(true);
    expect(res.body.costo).toBe(35000);
    expect(res.body.moneda).toBe('PYG');
  });

  it('dice explicitamente cuando no hay tarifa, sin inventar precio', async () => {
    const { key } = await crearKey({
      clienteId: testData.clienteId,
      nombre: 'Key sin ruta',
      permisos: ['consultar_tarifas'],
    });

    const res = await request
      .get('/api/v1/tarifas')
      .query({ origen: 'Asuncion', destino: 'Fuerte Olimpo', peso: 2 })
      .set(apiHeaders(key));

    expect(res.status).toBe(200);
    expect(res.body.matched).toBe(false);
    expect(res.body.costo).toBeNull();
    expect(typeof res.body.mensaje).toBe('string');
  });

  it('403 sin el permiso consultar_tarifas', async () => {
    const { key } = await crearKey({
      clienteId: testData.clienteId,
      nombre: 'Key sin permiso tarifas',
      permisos: ['consultar_envios'],
    });

    const res = await request
      .get('/api/v1/tarifas')
      .query({ origen: 'Asuncion', destino: 'Encarnacion', peso: 2 })
      .set(apiHeaders(key));

    expect(res.status).toBe(403);
  });
});

describe('rotacion y revocacion', () => {
  it('rotar emite sucesora funcional y deja la vieja con expiracion futura', async () => {
    const creada = await crearKey({
      clienteId: testData.clienteId,
      nombre: 'Key a rotar',
      permisos: ['consultar_tarifas'],
    });

    const rotada = await request
      .post(`/api/admin/api-keys/${creada.id}/rotar`)
      .set(adminHeaders())
      .send({ ventanaHoras: 48 });

    expect(rotada.status).toBe(201);
    expect(rotada.body.key).toMatch(/^ge_live_/);
    expect(rotada.body.key).not.toBe(creada.key);
    expect(new Date(rotada.body.keyAnteriorExpiraEn).getTime()).toBeGreaterThan(Date.now());

    // Ambas keys operan durante la ventana.
    const conNueva = await request
      .get('/api/v1/tarifas')
      .query({ origen: 'Asuncion', destino: 'Encarnacion', peso: 1 })
      .set(apiHeaders(rotada.body.key));
    const conVieja = await request
      .get('/api/v1/tarifas')
      .query({ origen: 'Asuncion', destino: 'Encarnacion', peso: 1 })
      .set(apiHeaders(creada.key));

    expect(conNueva.status).toBe(200);
    expect(conVieja.status).toBe(200);
  });

  it('una key con expira_en vencido deja de operar', async () => {
    const creada = await crearKey({
      clienteId: testData.clienteId,
      nombre: 'Key vencida',
      permisos: ['consultar_tarifas'],
    });

    const { error } = await supabase
      .from('api_keys')
      .update({ expira_en: new Date(Date.now() - 60_000).toISOString() })
      .eq('id', creada.id);
    expect(error).toBeNull();

    const res = await request
      .get('/api/v1/tarifas')
      .query({ origen: 'Asuncion', destino: 'Encarnacion', peso: 1 })
      .set(apiHeaders(creada.key));

    expect(res.status).toBe(401);
  });

  it('revocar corta el acceso de inmediato y repetir revoca da 400', async () => {
    const creada = await crearKey({
      clienteId: testData.clienteId,
      nombre: 'Key a revocar',
      permisos: ['consultar_tarifas'],
    });

    const antes = await request
      .get('/api/v1/tarifas')
      .query({ origen: 'Asuncion', destino: 'Encarnacion', peso: 1 })
      .set(apiHeaders(creada.key));
    expect(antes.status).toBe(200);

    const revocada = await request
      .post(`/api/admin/api-keys/${creada.id}/revocar`)
      .set(adminHeaders())
      .send({});
    expect(revocada.status).toBe(200);
    expect(revocada.body.activo).toBe(false);

    const despues = await request
      .get('/api/v1/tarifas')
      .query({ origen: 'Asuncion', destino: 'Encarnacion', peso: 1 })
      .set(apiHeaders(creada.key));
    expect(despues.status).toBe(401);

    const otraVez = await request
      .post(`/api/admin/api-keys/${creada.id}/revocar`)
      .set(adminHeaders())
      .send({});
    expect(otraVez.status).toBe(400);
  });
});
