import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { request, adminHeaders } from '../setup/test-client.js';
import { seedTestData, cleanupTestData, type TestData } from '../setup/seed.js';
import { startWebhookReceiver, type WebhookReceiver } from '../setup/webhook-receiver.js';
import { webhookDispatcher } from '../../src/services/webhookDispatcher.service.js';

// Ciclo completo de webhooks salientes (Fase 2): registro admin + self-service v1,
// encolado al cambiar estado (outbox), delivery firmada contra un receptor local,
// retry con backoff hasta fallido definitivo y aislamiento por cliente.
// Requiere sql/054 aplicada (scripts/test-db-reset.sh ya la incluye).

const supabase = createClient(
  process.env['SUPABASE_URL']!,
  process.env['SUPABASE_SERVICE_ROLE_KEY']!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

let testData: TestData;
let cliente2Id: string;
let receiver: WebhookReceiver;

function apiHeaders(key: string): Record<string, string> {
  return { 'X-API-Key': key, 'Content-Type': 'application/json' };
}

function envioPayload(overrides: Record<string, unknown> = {}) {
  return {
    destinatarioNombre: 'Maria Webhook Lopez',
    destinatarioDireccion: 'Av. Irrazabal 456, Encarnacion',
    destinatarioTelefono: '+595971654321',
    destinatarioCiudad: 'Encarnacion',
    destinatarioDepartamento: 'Itapua',
    peso: 2,
    ...overrides,
  };
}

async function crearKey(body: Record<string, unknown>): Promise<{ id: string; key: string; keyPrefix: string; modoTest: boolean }> {
  const res = await request.post('/api/admin/api-keys').set(adminHeaders()).send(body);
  expect(res.status).toBe(201);
  return res.body as { id: string; key: string; keyPrefix: string; modoTest: boolean };
}

function verifySignature(secreto: string, rawBody: Buffer, header: string | undefined): boolean {
  if (!header || !header.startsWith('sha256=')) return false;
  const provided = Buffer.from(header.slice('sha256='.length), 'hex');
  const expected = createHmac('sha256', secreto).update(rawBody).digest();
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

// El reloj del Postgres local (VM de colima) puede correr adelantado respecto del host;
// el default NOW() de proximo_intento_en dejaria la delivery "en el futuro" para el
// dispatcher. Forzar el vencimiento hace el tick determinista. En prod app y DB comparten
// reloj (Railway/Supabase) y el poll de 20s absorbe cualquier drift menor.
async function forzarVencimiento(endpointId: string): Promise<void> {
  await supabase
    .from('webhook_deliveries')
    .update({ proximo_intento_en: new Date(Date.now() - 1000).toISOString() })
    .eq('endpoint_id', endpointId)
    .eq('status', 'pendiente');
}

async function limpiarWebhooks(): Promise<void> {
  const { data } = await supabase
    .from('webhook_endpoints')
    .select('id')
    .in('cliente_id', [testData.clienteId, cliente2Id]);
  const ids = ((data ?? []) as Array<{ id: string }>).map((e) => e.id);
  if (ids.length > 0) {
    await supabase.from('webhook_deliveries').delete().in('endpoint_id', ids);
    await supabase.from('webhook_endpoints').delete().in('id', ids);
  }
}

beforeAll(async () => {
  testData = await seedTestData();
  receiver = await startWebhookReceiver();

  cliente2Id = crypto.randomUUID();
  const suffix = cliente2Id.slice(0, 8);
  const { error } = await supabase.from('clientes').insert({
    id: cliente2Id,
    razon_social: `Test Webhook Dos SA ${suffix}`,
    ruc: `TESTW-${suffix}`,
    contacto_nombre: 'Test Contact Webhook',
    telefono: '+595971000004',
    email: `testw-${suffix}@goexpress.test`,
    direccion: 'Test Address 789, Asuncion',
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

beforeEach(async () => {
  receiver.received.length = 0;
  receiver.setStatus(200);
  await limpiarWebhooks();
});

afterAll(async () => {
  await limpiarWebhooks();
  await supabase.from('api_keys').delete().in('cliente_id', [testData.clienteId, cliente2Id]);
  await supabase.from('clientes').delete().eq('id', cliente2Id);
  await cleanupTestData(testData);
  await receiver.close();
});

describe('gestion de endpoints', () => {
  it('admin registra un endpoint y el secreto se muestra una sola vez', async () => {
    const res = await request
      .post('/api/admin/webhook-endpoints')
      .set(adminHeaders())
      .send({ clienteId: testData.clienteId, url: receiver.url });

    expect(res.status).toBe(201);
    expect(res.body.secreto).toMatch(/^whsec_/);
    expect(res.body.eventos).toEqual(['envio.estado_cambiado']);

    const lista = await request
      .get('/api/admin/webhook-endpoints')
      .query({ clienteId: testData.clienteId })
      .set(adminHeaders());

    expect(lista.status).toBe(200);
    const fila = (lista.body as Array<Record<string, unknown>>).find((e) => e['id'] === res.body.id);
    expect(fila).toBeDefined();
    expect(fila!['secreto']).toBeUndefined();
  });

  it('el tercero registra y elimina su endpoint con permiso webhooks, sin ver ajenos', async () => {
    const { key } = await crearKey({
      clienteId: testData.clienteId,
      nombre: 'Key webhooks self-service',
      permisos: ['webhooks'],
    });
    const { key: keyCliente2 } = await crearKey({
      clienteId: cliente2Id,
      nombre: 'Key webhooks cliente 2',
      permisos: ['webhooks'],
    });

    const creado = await request
      .post('/api/v1/webhook-endpoints')
      .set(apiHeaders(key))
      .send({ url: receiver.url });
    expect(creado.status).toBe(201);
    expect(creado.body.secreto).toMatch(/^whsec_/);

    const lista = await request.get('/api/v1/webhook-endpoints').set(apiHeaders(key));
    expect(lista.status).toBe(200);
    expect((lista.body as Array<{ id: string }>).some((e) => e.id === creado.body.id)).toBe(true);
    expect((lista.body as Array<Record<string, unknown>>).every((e) => e['secreto'] === undefined)).toBe(true);

    // La key del cliente 2 no ve ni puede borrar el endpoint del cliente 1.
    const listaAjena = await request.get('/api/v1/webhook-endpoints').set(apiHeaders(keyCliente2));
    expect((listaAjena.body as Array<{ id: string }>).some((e) => e.id === creado.body.id)).toBe(false);
    const deleteAjeno = await request.delete(`/api/v1/webhook-endpoints/${creado.body.id}`).set(apiHeaders(keyCliente2));
    expect(deleteAjeno.status).toBe(404);

    const borrado = await request.delete(`/api/v1/webhook-endpoints/${creado.body.id}`).set(apiHeaders(key));
    expect(borrado.status).toBe(204);

    const { data } = await supabase
      .from('webhook_endpoints')
      .select('activo')
      .eq('id', creado.body.id)
      .single();
    expect((data as { activo: boolean }).activo).toBe(false);
  });

  it('403 sin el permiso webhooks', async () => {
    const { key } = await crearKey({
      clienteId: testData.clienteId,
      nombre: 'Key sin webhooks',
      permisos: ['consultar_envios'],
    });

    const res = await request.post('/api/v1/webhook-endpoints').set(apiHeaders(key)).send({ url: receiver.url });
    expect(res.status).toBe(403);
  });

  it('rechaza URLs no https o hacia hosts internos', async () => {
    const { key } = await crearKey({
      clienteId: testData.clienteId,
      nombre: 'Key urls invalidas',
      permisos: ['webhooks'],
    });

    for (const url of ['http://example.com/hook', 'https://localhost/hook', 'https://10.0.0.5/hook', 'https://api.railway.internal/hook']) {
      const res = await request.post('/api/v1/webhook-endpoints').set(apiHeaders(key)).send({ url });
      expect(res.status).toBe(400);
    }
  });
});

describe('outbox y delivery', () => {
  async function setupEndpointYEnvio(): Promise<{ secreto: string; envioId: string; tracking: string; endpointId: string }> {
    const { key } = await crearKey({
      clienteId: testData.clienteId,
      nombre: 'Key outbox',
      permisos: ['crear_envios', 'webhooks'],
    });

    const endpoint = await request.post('/api/v1/webhook-endpoints').set(apiHeaders(key)).send({ url: receiver.url });
    expect(endpoint.status).toBe(201);

    const creado = await request.post('/api/v1/envios').set(apiHeaders(key)).send(envioPayload());
    expect(creado.status).toBe(201);

    const { data } = await supabase
      .from('envios')
      .select('id')
      .eq('tracking_number', creado.body.trackingNumber)
      .single();

    return {
      secreto: endpoint.body.secreto as string,
      endpointId: endpoint.body.id as string,
      envioId: (data as { id: string }).id,
      tracking: creado.body.trackingNumber as string,
    };
  }

  it('cambiar estado encola una delivery y el dispatcher la entrega firmada', async () => {
    const { secreto, envioId, tracking, endpointId } = await setupEndpointYEnvio();

    const cambio = await request
      .patch(`/api/admin/envios/${envioId}/estado`)
      .set(adminHeaders())
      .send({ estado: 'recolectado', descripcion: 'Recolectado por courier' });
    expect(cambio.status).toBe(200);

    const { data: pendientes } = await supabase
      .from('webhook_deliveries')
      .select('id, evento, payload, status, intento')
      .eq('endpoint_id', endpointId);

    expect(pendientes).toHaveLength(1);
    const delivery = (pendientes as Array<{ id: string; evento: string; payload: Record<string, unknown>; status: string; intento: number }>)[0]!;
    expect(delivery.status).toBe('pendiente');
    expect(delivery.evento).toBe('envio.estado_cambiado');
    expect(delivery.payload['tracking']).toBe(tracking);
    expect(delivery.payload['estadoAnterior']).toBe('pendiente');
    expect(delivery.payload['estadoNuevo']).toBe('recolectado');

    await forzarVencimiento(endpointId);
    await webhookDispatcher.processPendingDeliveries();

    expect(receiver.received).toHaveLength(1);
    const recibida = receiver.received[0]!;
    expect(recibida.headers['x-goexpress-event']).toBe('envio.estado_cambiado');
    expect(recibida.headers['x-goexpress-delivery']).toBe(delivery.id);
    expect(verifySignature(secreto, recibida.rawBody, recibida.headers['x-goexpress-signature'] as string)).toBe(true);

    const body = JSON.parse(recibida.rawBody.toString('utf8')) as Record<string, unknown>;
    expect(body['tracking']).toBe(tracking);
    expect(body['estadoNuevo']).toBe('recolectado');

    const { data: final } = await supabase
      .from('webhook_deliveries')
      .select('status, http_status, intento, entregado_en')
      .eq('id', delivery.id)
      .single();
    const row = final as { status: string; http_status: number; intento: number; entregado_en: string | null };
    expect(row.status).toBe('entregado');
    expect(row.http_status).toBe(200);
    expect(row.intento).toBe(1);
    expect(row.entregado_en).not.toBeNull();
  });

  it('ante 500 reintenta con backoff y termina en fallido definitivo', async () => {
    const { envioId, endpointId } = await setupEndpointYEnvio();
    receiver.setStatus(500);

    await request
      .patch(`/api/admin/envios/${envioId}/estado`)
      .set(adminHeaders())
      .send({ estado: 'recolectado', descripcion: 'Recolectado' });

    const { data: creadas } = await supabase
      .from('webhook_deliveries')
      .select('id')
      .eq('endpoint_id', endpointId);
    const deliveryId = (creadas as Array<{ id: string }>)[0]!.id;

    // Intento 1 falla: sigue pendiente, con proximo_intento_en en el futuro (backoff).
    await forzarVencimiento(endpointId);
    await webhookDispatcher.processPendingDeliveries();
    let { data: row } = await supabase
      .from('webhook_deliveries')
      .select('status, intento, http_status, proximo_intento_en')
      .eq('id', deliveryId)
      .single();
    let r = row as { status: string; intento: number; http_status: number; proximo_intento_en: string };
    expect(r.status).toBe('pendiente');
    expect(r.intento).toBe(1);
    expect(r.http_status).toBe(500);
    expect(new Date(r.proximo_intento_en).getTime()).toBeGreaterThan(Date.now());

    // Sin vencimiento, otro tick no lo toca.
    await webhookDispatcher.processPendingDeliveries();
    ({ data: row } = await supabase.from('webhook_deliveries').select('status, intento').eq('id', deliveryId).single());
    expect((row as { intento: number }).intento).toBe(1);

    // Intentos 2 a 4 (forzando el vencimiento): el cuarto fallo es definitivo.
    for (const intentoEsperado of [2, 3, 4]) {
      await supabase
        .from('webhook_deliveries')
        .update({ proximo_intento_en: new Date(Date.now() - 1000).toISOString() })
        .eq('id', deliveryId);
      await webhookDispatcher.processPendingDeliveries();
      ({ data: row } = await supabase.from('webhook_deliveries').select('status, intento').eq('id', deliveryId).single());
      expect((row as { intento: number }).intento).toBe(intentoEsperado);
    }

    r = (await supabase.from('webhook_deliveries').select('status, intento, http_status, proximo_intento_en').eq('id', deliveryId).single()).data as typeof r;
    expect(r.status).toBe('fallido');
    expect(receiver.received).toHaveLength(4);

    // Ya fallida, no se vuelve a intentar aunque este vencida.
    await webhookDispatcher.processPendingDeliveries();
    expect(receiver.received).toHaveLength(4);
  });

  it('si el receptor se recupera, el retry entrega', async () => {
    const { envioId, endpointId } = await setupEndpointYEnvio();
    receiver.setStatus(503);

    await request
      .patch(`/api/admin/envios/${envioId}/estado`)
      .set(adminHeaders())
      .send({ estado: 'recolectado', descripcion: 'Recolectado' });

    await forzarVencimiento(endpointId);
    await webhookDispatcher.processPendingDeliveries();

    receiver.setStatus(200);
    const { data: creadas } = await supabase.from('webhook_deliveries').select('id').eq('endpoint_id', endpointId);
    const deliveryId = (creadas as Array<{ id: string }>)[0]!.id;
    await supabase
      .from('webhook_deliveries')
      .update({ proximo_intento_en: new Date(Date.now() - 1000).toISOString() })
      .eq('id', deliveryId);

    await webhookDispatcher.processPendingDeliveries();

    const { data: final } = await supabase.from('webhook_deliveries').select('status, intento').eq('id', deliveryId).single();
    expect((final as { status: string }).status).toBe('entregado');
    expect((final as { intento: number }).intento).toBe(2);
  });

  it('aislamiento: el endpoint de otro cliente no recibe eventos ajenos', async () => {
    const { key: keyCliente2 } = await crearKey({
      clienteId: cliente2Id,
      nombre: 'Key webhooks aislamiento',
      permisos: ['webhooks'],
    });
    const endpointAjeno = await request
      .post('/api/v1/webhook-endpoints')
      .set(apiHeaders(keyCliente2))
      .send({ url: receiver.url });
    expect(endpointAjeno.status).toBe(201);

    const { envioId, endpointId } = await setupEndpointYEnvio();

    await request
      .patch(`/api/admin/envios/${envioId}/estado`)
      .set(adminHeaders())
      .send({ estado: 'recolectado', descripcion: 'Recolectado' });

    const { data: propias } = await supabase.from('webhook_deliveries').select('id').eq('endpoint_id', endpointId);
    const { data: ajenas } = await supabase.from('webhook_deliveries').select('id').eq('endpoint_id', endpointAjeno.body.id);

    expect(propias).toHaveLength(1);
    expect(ajenas).toHaveLength(0);
  });

  it('un endpoint desactivado con delivery pendiente muere sin POST', async () => {
    const { envioId, endpointId } = await setupEndpointYEnvio();

    await request
      .patch(`/api/admin/envios/${envioId}/estado`)
      .set(adminHeaders())
      .send({ estado: 'recolectado', descripcion: 'Recolectado' });

    await supabase.from('webhook_endpoints').update({ activo: false }).eq('id', endpointId);

    await forzarVencimiento(endpointId);
    await webhookDispatcher.processPendingDeliveries();

    const { data } = await supabase.from('webhook_deliveries').select('status, respuesta').eq('endpoint_id', endpointId);
    expect((data as Array<{ status: string }>)[0]!.status).toBe('fallido');
    expect(receiver.received).toHaveLength(0);
  });

  it('regenerar el secreto invalida las firmas del secreto anterior', async () => {
    const { secreto, envioId, endpointId } = await setupEndpointYEnvio();

    const regen = await request
      .post(`/api/admin/webhook-endpoints/${endpointId}/regenerar-secreto`)
      .set(adminHeaders())
      .send({});
    expect(regen.status).toBe(201);
    const secretoNuevo = regen.body.secreto as string;
    expect(secretoNuevo).not.toBe(secreto);

    await request
      .patch(`/api/admin/envios/${envioId}/estado`)
      .set(adminHeaders())
      .send({ estado: 'recolectado', descripcion: 'Recolectado' });
    await forzarVencimiento(endpointId);
    await webhookDispatcher.processPendingDeliveries();

    const recibida = receiver.received[0]!;
    const header = recibida.headers['x-goexpress-signature'] as string;
    expect(verifySignature(secreto, recibida.rawBody, header)).toBe(false);
    expect(verifySignature(secretoNuevo, recibida.rawBody, header)).toBe(true);
  });

  // COD entra al webhook por el mismo choke point de updateEstado: el payload no debe
  // sumar campos nuevos (montoACobrar, tipoPago) ni perder los existentes.
  it('un envio COD emite el evento con exactamente el mismo shape que anticipado', async () => {
    const { key } = await crearKey({
      clienteId: testData.clienteId,
      nombre: 'Key outbox cod',
      permisos: ['crear_envios', 'webhooks'],
    });

    const endpoint = await request.post('/api/v1/webhook-endpoints').set(apiHeaders(key)).send({ url: receiver.url });
    expect(endpoint.status).toBe(201);

    const creado = await request
      .post('/api/v1/envios')
      .set(apiHeaders(key))
      .send(envioPayload({ tipoPago: 'contra_entrega', montoACobrar: 180000, codigoReferencia: 'COD-WH-001' }));
    expect(creado.status).toBe(201);

    const { data } = await supabase
      .from('envios')
      .select('id')
      .eq('tracking_number', creado.body.trackingNumber)
      .single();
    const envioId = (data as { id: string }).id;

    await request
      .patch(`/api/admin/envios/${envioId}/estado`)
      .set(adminHeaders())
      .send({ estado: 'recolectado', descripcion: 'Recolectado' });

    await forzarVencimiento(endpoint.body.id as string);
    await webhookDispatcher.processPendingDeliveries();

    expect(receiver.received).toHaveLength(1);
    const body = JSON.parse(receiver.received[0]!.rawBody.toString('utf8')) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([
      'codigoReferencia',
      'estadoAnterior',
      'estadoNuevo',
      'evento',
      'timestamp',
      'tracking',
    ]);
    expect(body['evento']).toBe('envio.estado_cambiado');
    expect(body['tracking']).toBe(creado.body.trackingNumber);
    expect(body['estadoAnterior']).toBe('pendiente');
    expect(body['estadoNuevo']).toBe('recolectado');
    expect(body['codigoReferencia']).toBe('COD-WH-001');
  });
});
