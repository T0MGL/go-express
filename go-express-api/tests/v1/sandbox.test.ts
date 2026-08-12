import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { request, adminHeaders } from '../setup/test-client.js';
import { seedTestData, cleanupTestData, type TestData } from '../setup/seed.js';
import { startWebhookReceiver, type WebhookReceiver } from '../setup/webhook-receiver.js';

// Sandbox del gateway (Fase 2): keys ge_test_ validan y cotizan de verdad pero no
// escriben nada, fixtures deterministas para el parseo, evento de prueba firmado con
// el secreto real, y el fingerprint del body en la idempotencia de keys live.

const supabase = createClient(
  process.env['SUPABASE_URL']!,
  process.env['SUPABASE_SERVICE_ROLE_KEY']!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

let testData: TestData;
let receiver: WebhookReceiver;

function apiHeaders(key: string): Record<string, string> {
  return { 'X-API-Key': key, 'Content-Type': 'application/json' };
}

function envioPayload(overrides: Record<string, unknown> = {}) {
  return {
    destinatarioNombre: 'Maria Sandbox Lopez',
    destinatarioDireccion: 'Av. Irrazabal 456, Encarnacion',
    destinatarioTelefono: '+595971654321',
    destinatarioCiudad: 'Encarnacion',
    destinatarioDepartamento: 'Itapua',
    peso: 2,
    ...overrides,
  };
}

async function crearKey(body: Record<string, unknown>): Promise<{ id: string; key: string; modoTest: boolean }> {
  const res = await request.post('/api/admin/api-keys').set(adminHeaders()).send(body);
  expect(res.status).toBe(201);
  return res.body as { id: string; key: string; modoTest: boolean };
}

async function contarEnvios(): Promise<number> {
  const { count } = await supabase
    .from('envios')
    .select('id', { count: 'exact', head: true })
    .eq('cliente_id', testData.clienteId);
  return count ?? 0;
}

beforeAll(async () => {
  testData = await seedTestData();
  receiver = await startWebhookReceiver();
});

afterAll(async () => {
  const { data } = await supabase.from('webhook_endpoints').select('id').eq('cliente_id', testData.clienteId);
  const ids = ((data ?? []) as Array<{ id: string }>).map((e) => e.id);
  if (ids.length > 0) {
    await supabase.from('webhook_deliveries').delete().in('endpoint_id', ids);
    await supabase.from('webhook_endpoints').delete().in('id', ids);
  }
  await supabase.from('api_keys').delete().eq('cliente_id', testData.clienteId);
  await cleanupTestData(testData);
  await receiver.close();
});

describe('emision de keys de test', () => {
  it('el admin crea una key ge_test_ con modoTest y la rotacion preserva el modo', async () => {
    const creada = await crearKey({
      clienteId: testData.clienteId,
      nombre: 'Key sandbox emision',
      permisos: ['crear_envios'],
      modoTest: true,
    });

    expect(creada.key).toMatch(/^ge_test_[0-9A-Za-z]{43}$/);
    expect(creada.modoTest).toBe(true);

    const rotada = await request
      .post(`/api/admin/api-keys/${creada.id}/rotar`)
      .set(adminHeaders())
      .send({ ventanaHoras: 1 });
    expect(rotada.status).toBe(201);
    expect(rotada.body.key).toMatch(/^ge_test_/);
    expect(rotada.body.modoTest).toBe(true);
  });
});

describe('POST /api/v1/envios en modo test', () => {
  it('valida y cotiza real pero devuelve un envio simulado sin escribir nada', async () => {
    const { key } = await crearKey({
      clienteId: testData.clienteId,
      nombre: 'Key sandbox crear',
      permisos: ['crear_envios'],
      modoTest: true,
    });

    const antes = await contarEnvios();
    const res = await request.post('/api/v1/envios').set(apiHeaders(key)).send(envioPayload());

    expect(res.status).toBe(201);
    expect(res.body.simulated).toBe(true);
    expect(res.body.trackingNumber).toMatch(/^GE-TEST-[0-9A-F]{10}$/);
    expect(res.body.estado).toBe('pendiente');
    // Cotizacion real contra la tarifa seed Asuncion -> Encarnacion.
    expect(res.body.costo).toBe(35000);
    expect(res.body.montoACobrar).toBe(35000);

    expect(await contarEnvios()).toBe(antes);
  });

  it('la validacion Zod y RUTA_SIN_TARIFA responden igual que en live', async () => {
    const { key } = await crearKey({
      clienteId: testData.clienteId,
      nombre: 'Key sandbox validacion',
      permisos: ['crear_envios'],
      modoTest: true,
    });

    const invalido = await request
      .post('/api/v1/envios')
      .set(apiHeaders(key))
      .send(envioPayload({ destinatarioTelefono: 'no-es-telefono' }));
    expect(invalido.status).toBe(400);

    const sinTarifa = await request
      .post('/api/v1/envios')
      .set(apiHeaders(key))
      .send(envioPayload({ destinatarioCiudad: 'Fuerte Olimpo' }));
    expect(sinTarifa.status).toBe(422);
    expect(sinTarifa.body.code).toBe('RUTA_SIN_TARIFA');

    expect(await contarEnvios()).toBe(0);
  });

  it('simula un envio COD con el desglose real y sin escribir nada', async () => {
    const { key } = await crearKey({
      clienteId: testData.clienteId,
      nombre: 'Key sandbox cod',
      permisos: ['crear_envios'],
      modoTest: true,
    });

    const antes = await contarEnvios();
    const res = await request
      .post('/api/v1/envios')
      .set(apiHeaders(key))
      .send(envioPayload({ tipoPago: 'contra_entrega', montoACobrar: 180000 }));

    expect(res.status).toBe(201);
    expect(res.body.simulated).toBe(true);
    expect(res.body.tipoPago).toBe('contra_entrega');
    expect(res.body.costo).toBe(35000);
    expect(res.body.costoSeguro).toBe(0);
    expect(res.body.montoACobrar).toBe(180000);

    expect(await contarEnvios()).toBe(antes);
  });

  it('COD con Idempotency-Key valida el header pero no hay replay: cada POST simula un envio nuevo', async () => {
    const { key } = await crearKey({
      clienteId: testData.clienteId,
      nombre: 'Key sandbox cod idem',
      permisos: ['crear_envios'],
      modoTest: true,
    });
    const idem = `sandbox-cod-${crypto.randomUUID()}`;
    const body = envioPayload({ tipoPago: 'contra_entrega', montoACobrar: 180000 });

    const primera = await request
      .post('/api/v1/envios')
      .set({ ...apiHeaders(key), 'Idempotency-Key': idem })
      .send(body);
    const segunda = await request
      .post('/api/v1/envios')
      .set({ ...apiHeaders(key), 'Idempotency-Key': idem })
      .send(body);

    expect(primera.status).toBe(201);
    expect(segunda.status).toBe(201);
    expect(segunda.body.trackingNumber).not.toBe(primera.body.trackingNumber);

    const invalida = await request
      .post('/api/v1/envios')
      .set({ ...apiHeaders(key), 'Idempotency-Key': 'corta' })
      .send(body);
    expect(invalida.status).toBe(400);

    expect(await contarEnvios()).toBe(0);
  });

  it('el 422 MONTO_INSUFICIENTE del sandbox es identico al de live, con el minimo exacto', async () => {
    const { key } = await crearKey({
      clienteId: testData.clienteId,
      nombre: 'Key sandbox cod corto',
      permisos: ['crear_envios'],
      modoTest: true,
    });

    const res = await request
      .post('/api/v1/envios')
      .set(apiHeaders(key))
      .send(envioPayload({ tipoPago: 'contra_entrega', montoACobrar: 10000 }));

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('MONTO_INSUFICIENTE');
    expect(res.body.details).toEqual({ minimo: 35000, costo: 35000, costoSeguro: 0, montoACobrar: 10000 });
    expect(res.body.error).toContain('35000');

    expect(await contarEnvios()).toBe(0);
  });
});

describe('GET fixtures en modo test', () => {
  it('lista 3 envios deterministas con estados distintos', async () => {
    const { key } = await crearKey({
      clienteId: testData.clienteId,
      nombre: 'Key sandbox listado',
      permisos: ['consultar_envios'],
      modoTest: true,
    });

    const res = await request.get('/api/v1/envios').set(apiHeaders(key));

    expect(res.status).toBe(200);
    const data = res.body.data as Array<{ trackingNumber: string; estado: string; simulated: boolean }>;
    expect(data).toHaveLength(3);
    expect(data.every((e) => e.simulated)).toBe(true);
    expect(new Set(data.map((e) => e.estado))).toEqual(new Set(['pendiente', 'en_reparto', 'entregado']));
    expect(res.body.pagination.total).toBe(3);

    const filtrado = await request.get('/api/v1/envios').query({ estado: 'entregado' }).set(apiHeaders(key));
    expect((filtrado.body.data as Array<{ estado: string }>)).toHaveLength(1);
  });

  it('detalle de un fixture trae eventos; tracking desconocido responde 404 real', async () => {
    const { key } = await crearKey({
      clienteId: testData.clienteId,
      nombre: 'Key sandbox detalle',
      permisos: ['consultar_envios'],
      modoTest: true,
    });

    const res = await request.get('/api/v1/envios/GE-TEST-0000000002').set(apiHeaders(key));
    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('en_reparto');
    expect(res.body.simulated).toBe(true);
    expect((res.body.eventos as unknown[]).length).toBeGreaterThanOrEqual(2);

    const notFound = await request.get('/api/v1/envios/GE-TEST-9999999999').set(apiHeaders(key));
    expect(notFound.status).toBe(404);
    expect(notFound.body.code).toBe('NOT_FOUND');
  });

  it('GET /tarifas responde live tambien con key de test', async () => {
    const { key } = await crearKey({
      clienteId: testData.clienteId,
      nombre: 'Key sandbox tarifas',
      permisos: ['consultar_tarifas'],
      modoTest: true,
    });

    const res = await request
      .get('/api/v1/tarifas')
      .query({ origen: 'Asuncion', destino: 'Encarnacion', peso: 2 })
      .set(apiHeaders(key));

    expect(res.status).toBe(200);
    expect(res.body.matched).toBe(true);
    expect(res.body.costo).toBe(35000);
  });
});

describe('POST /api/v1/test/webhook-event', () => {
  it('403 con key live, 400 sin endpoint registrado', async () => {
    const { key: keyLive } = await crearKey({
      clienteId: testData.clienteId,
      nombre: 'Key live para test-event',
      permisos: ['crear_envios'],
    });
    const conLive = await request.post('/api/v1/test/webhook-event').set(apiHeaders(keyLive)).send({});
    expect(conLive.status).toBe(403);

    const { key: keyTest } = await crearKey({
      clienteId: testData.clienteId,
      nombre: 'Key test sin endpoint',
      permisos: ['crear_envios'],
      modoTest: true,
    });
    const sinEndpoint = await request.post('/api/v1/test/webhook-event').set(apiHeaders(keyTest)).send({});
    expect(sinEndpoint.status).toBe(400);
  });

  it('dispara un evento de muestra firmado con el secreto real del endpoint', async () => {
    const { key } = await crearKey({
      clienteId: testData.clienteId,
      nombre: 'Key test evento firmado',
      permisos: ['webhooks'],
      modoTest: true,
    });

    const endpoint = await request.post('/api/v1/webhook-endpoints').set(apiHeaders(key)).send({ url: receiver.url });
    expect(endpoint.status).toBe(201);
    const secreto = endpoint.body.secreto as string;

    receiver.received.length = 0;
    const res = await request.post('/api/v1/test/webhook-event').set(apiHeaders(key)).send({});

    expect(res.status).toBe(200);
    expect(res.body.simulated).toBe(true);
    const resultados = res.body.resultados as Array<{ entregado: boolean; httpStatus: number }>;
    expect(resultados).toHaveLength(1);
    expect(resultados[0]!.entregado).toBe(true);
    expect(resultados[0]!.httpStatus).toBe(200);

    expect(receiver.received).toHaveLength(1);
    const recibida = receiver.received[0]!;
    const header = recibida.headers['x-goexpress-signature'] as string;
    const provided = Buffer.from(header.slice('sha256='.length), 'hex');
    const expected = createHmac('sha256', secreto).update(recibida.rawBody).digest();
    expect(provided.length === expected.length && timingSafeEqual(provided, expected)).toBe(true);

    const body = JSON.parse(recibida.rawBody.toString('utf8')) as Record<string, unknown>;
    expect(body['simulated']).toBe(true);
    expect(body['evento']).toBe('envio.estado_cambiado');
  });
});

describe('idempotencia con fingerprint del body (keys live)', () => {
  it('mismo body replay 200, body distinto 409 IDEMPOTENCY_KEY_REUSED', async () => {
    const { key } = await crearKey({
      clienteId: testData.clienteId,
      nombre: 'Key fingerprint',
      permisos: ['crear_envios'],
    });
    const idem = `fingerprint-${crypto.randomUUID()}`;

    const primera = await request
      .post('/api/v1/envios')
      .set({ ...apiHeaders(key), 'Idempotency-Key': idem })
      .send(envioPayload());
    expect(primera.status).toBe(201);

    const replay = await request
      .post('/api/v1/envios')
      .set({ ...apiHeaders(key), 'Idempotency-Key': idem })
      .send(envioPayload());
    expect(replay.status).toBe(200);
    expect(replay.body.trackingNumber).toBe(primera.body.trackingNumber);

    const conOtroBody = await request
      .post('/api/v1/envios')
      .set({ ...apiHeaders(key), 'Idempotency-Key': idem })
      .send(envioPayload({ peso: 4, destinatarioNombre: 'Otra Persona' }));
    expect(conOtroBody.status).toBe(409);
    expect(conOtroBody.body.code).toBe('IDEMPOTENCY_KEY_REUSED');

    // El fingerprint quedo persistido junto al envio original.
    const { data } = await supabase
      .from('envios')
      .select('api_idempotency_body_hash')
      .eq('cliente_id', testData.clienteId)
      .eq('api_idempotency_key', idem)
      .single();
    expect((data as { api_idempotency_body_hash: string | null }).api_idempotency_body_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
