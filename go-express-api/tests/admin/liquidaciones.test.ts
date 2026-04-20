import { createClient } from '@supabase/supabase-js';
import { request, adminHeaders } from '../setup/test-client.js';
import { seedTestData, cleanupTestData, makeEnvioPayload, type TestData } from '../setup/seed.js';

const supabase = createClient(
  process.env['SUPABASE_URL']!,
  process.env['SUPABASE_SERVICE_ROLE_KEY']!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

let testData: TestData;
const createdLiquidaciones: string[] = [];

beforeAll(async () => {
  testData = await seedTestData();
});

// Cada caso empieza con cero liquidaciones del repartidor de test. El check de
// solapamiento agregado en migracion 023 rechaza cualquier liquidacion nueva que solape
// con una existente del mismo repartidor, asi que compartir estado entre tests haria
// que cada caso siguiente reciba 409. Limpiamos aca para mantener los casos aislados.
afterEach(async () => {
  const { data: existentes } = await supabase
    .from('liquidaciones_repartidor')
    .select('id')
    .eq('repartidor_id', testData.repartidorId);
  const ids = (existentes ?? []).map((row) => (row as { id: string }).id);
  if (ids.length > 0) {
    await supabase.from('liquidacion_envios').delete().in('liquidacion_id', ids);
    await supabase.from('liquidaciones_repartidor').delete().in('id', ids);
  }
  createdLiquidaciones.length = 0;
});

afterAll(async () => {
  if (createdLiquidaciones.length > 0) {
    await supabase
      .from('liquidacion_envios')
      .delete()
      .in('liquidacion_id', createdLiquidaciones);
    await supabase
      .from('liquidaciones_repartidor')
      .delete()
      .in('id', createdLiquidaciones);
  }
  await cleanupTestData(testData);
});

// Helper: crea un envio COD entregado por el repartidor de test con fecha_entrega_real
// controlada. montoACobrar = 50000 por default, monto_cobrado snapshot = monto recibido.
async function crearEnvioCodEntregado(options: {
  montoACobrar?: number;
  montoCobrado?: number;
  fechaEntregaReal?: string;
  asignar?: boolean;
}): Promise<string> {
  const monto = options.montoACobrar ?? 50000;
  const cobrado = options.montoCobrado ?? monto;

  const payload = makeEnvioPayload(testData.clienteId, {
    montoACobrar: monto,
    costo: monto,
    tipoPago: 'contra_entrega',
  });
  const envioRes = await request.post('/api/admin/envios').set(adminHeaders()).send(payload);
  if (envioRes.status !== 201) {
    throw new Error(`Failed to create envio: ${envioRes.status} ${JSON.stringify(envioRes.body)}`);
  }
  const envioId = envioRes.body.id as string;

  // Asignar al repartidor de test y avanzar estado a entregado via update directo.
  // Asignacion directa: supabase fetch del envio y update. Evitamos el flow del admin
  // envios para no disparar validaciones de state machine que pidan repartidor-portal.
  const update: Record<string, unknown> = {
    estado: 'entregado',
    monto_cobrado: cobrado,
    fecha_entrega_real: options.fechaEntregaReal ?? new Date().toISOString(),
    entregado_por_nombre: 'Receptor Test',
  };
  if (options.asignar !== false) {
    update['repartidor_id'] = testData.repartidorId;
    update['repartidor_asignado_en'] = new Date().toISOString();
  }

  const { error } = await supabase.from('envios').update(update).eq('id', envioId);
  if (error) {
    throw new Error(`Failed to update envio to entregado: ${error.message}`);
  }

  return envioId;
}

describe('POST /api/admin/liquidaciones', () => {
  it('crea liquidacion con N envios COD entregados en el rango y calcula monto total esperado', async () => {
    const hoyPy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Asuncion' });

    const envio1 = await crearEnvioCodEntregado({ montoACobrar: 30000 });
    const envio2 = await crearEnvioCodEntregado({ montoACobrar: 50000 });
    const envio3 = await crearEnvioCodEntregado({ montoACobrar: 20000 });

    const res = await request
      .post('/api/admin/liquidaciones')
      .set(adminHeaders())
      .send({
        repartidorId: testData.repartidorId,
        fechaDesde: hoyPy,
        fechaHasta: hoyPy,
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('estado', 'pendiente');
    expect(res.body).toHaveProperty('montoTotalEsperado');
    expect(res.body.montoTotalEsperado).toBeGreaterThanOrEqual(100000);
    expect(res.body.montoTotalRecibido).toBeNull();

    createdLiquidaciones.push(res.body.id as string);

    // Verificar snapshot de envios asociados
    const detRes = await request
      .get(`/api/admin/liquidaciones/${res.body.id}`)
      .set(adminHeaders());
    expect(detRes.status).toBe(200);
    expect(detRes.body.envios.length).toBeGreaterThanOrEqual(3);
    const ids = (detRes.body.envios as Array<{ envioId: string }>).map((e) => e.envioId);
    expect(ids).toContain(envio1);
    expect(ids).toContain(envio2);
    expect(ids).toContain(envio3);
  });

  it('crea liquidacion con rango sin envios y devuelve monto 0', async () => {
    // Rango futuro lejano donde no hay entregas
    const res = await request
      .post('/api/admin/liquidaciones')
      .set(adminHeaders())
      .send({
        repartidorId: testData.repartidorId,
        fechaDesde: '2099-01-01',
        fechaHasta: '2099-01-02',
      });

    expect(res.status).toBe(201);
    expect(res.body.montoTotalEsperado).toBe(0);
    expect(res.body.estado).toBe('pendiente');
    createdLiquidaciones.push(res.body.id as string);

    const detRes = await request
      .get(`/api/admin/liquidaciones/${res.body.id}`)
      .set(adminHeaders());
    expect(detRes.body.envios.length).toBe(0);
  });

  it('rechaza rango invalido (fechaHasta < fechaDesde) con 400', async () => {
    const res = await request
      .post('/api/admin/liquidaciones')
      .set(adminHeaders())
      .send({
        repartidorId: testData.repartidorId,
        fechaDesde: '2026-01-10',
        fechaHasta: '2026-01-05',
      });

    expect(res.status).toBe(400);
  });

  it('rechaza repartidor inexistente con 404', async () => {
    const res = await request
      .post('/api/admin/liquidaciones')
      .set(adminHeaders())
      .send({
        repartidorId: '00000000-0000-4000-a000-000000000099',
        fechaDesde: '2026-01-01',
        fechaHasta: '2026-01-02',
      });

    expect(res.status).toBe(404);
  });

  it('requiere auth', async () => {
    const res = await request.post('/api/admin/liquidaciones').send({});
    expect(res.status).toBe(401);
  });
});

describe('TZ Asuncion: entrega 22:30 PY cae en el dia PY correcto', () => {
  it('entrega reportada a las 22:30 PY del dia X aparece en liquidacion del dia X, no del dia X+1', async () => {
    // 22:30 PY del 2026-03-15 = 02:30 UTC del 2026-03-16. Construimos el timestamp UTC
    // explicitamente para no depender del TZ local del test runner.
    const fechaPY = '2026-03-15';
    // 22:30 PY = 02:30 UTC del dia siguiente
    const fechaEntregaUtc = new Date('2026-03-16T02:30:00Z').toISOString();

    const envio = await crearEnvioCodEntregado({
      montoACobrar: 77000,
      fechaEntregaReal: fechaEntregaUtc,
    });

    // Liquidacion del dia PY 2026-03-15 debe incluir al envio.
    const res = await request
      .post('/api/admin/liquidaciones')
      .set(adminHeaders())
      .send({
        repartidorId: testData.repartidorId,
        fechaDesde: fechaPY,
        fechaHasta: fechaPY,
      });

    expect(res.status).toBe(201);
    createdLiquidaciones.push(res.body.id as string);

    const detRes = await request
      .get(`/api/admin/liquidaciones/${res.body.id}`)
      .set(adminHeaders());
    const ids = (detRes.body.envios as Array<{ envioId: string }>).map((e) => e.envioId);
    expect(ids).toContain(envio);

    // Al contrario, una liquidacion del dia PY 2026-03-16 no deberia incluirlo porque
    // la entrega real fue el 15 PY aunque el UTC de fecha_entrega_real diga "16".
    const resDiaSiguiente = await request
      .post('/api/admin/liquidaciones')
      .set(adminHeaders())
      .send({
        repartidorId: testData.repartidorId,
        fechaDesde: '2026-03-16',
        fechaHasta: '2026-03-16',
      });

    expect(resDiaSiguiente.status).toBe(201);
    createdLiquidaciones.push(resDiaSiguiente.body.id as string);

    const detRes2 = await request
      .get(`/api/admin/liquidaciones/${resDiaSiguiente.body.id}`)
      .set(adminHeaders());
    const ids2 = (detRes2.body.envios as Array<{ envioId: string }>).map((e) => e.envioId);
    expect(ids2).not.toContain(envio);
  });
});

describe('PATCH /api/admin/liquidaciones/:id/cerrar', () => {
  it('cierra liquidacion con monto exacto: estado cerrada, envios marcados conciliados', async () => {
    const hoyPy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Asuncion' });
    const fechaEntrega = new Date().toISOString();

    await crearEnvioCodEntregado({ montoACobrar: 25000, fechaEntregaReal: fechaEntrega });
    await crearEnvioCodEntregado({ montoACobrar: 35000, fechaEntregaReal: fechaEntrega });

    const crearRes = await request
      .post('/api/admin/liquidaciones')
      .set(adminHeaders())
      .send({
        repartidorId: testData.repartidorId,
        fechaDesde: hoyPy,
        fechaHasta: hoyPy,
      });
    expect(crearRes.status).toBe(201);
    const liqId = crearRes.body.id as string;
    const esperado = crearRes.body.montoTotalEsperado as number;
    createdLiquidaciones.push(liqId);

    const cerrarRes = await request
      .patch(`/api/admin/liquidaciones/${liqId}/cerrar`)
      .set(adminHeaders())
      .send({ montoRecibido: esperado });

    expect(cerrarRes.status).toBe(200);
    expect(cerrarRes.body).toHaveProperty('estado', 'cerrada');
    expect(cerrarRes.body.montoTotalRecibido).toBe(esperado);
    expect(cerrarRes.body.diferencia).toBe(0);
    expect(cerrarRes.body.cerradaPor).toBeTruthy();
    expect(cerrarRes.body.cerradaEn).toBeTruthy();

    const { data: envios } = await supabase
      .from('liquidacion_envios')
      .select('conciliado')
      .eq('liquidacion_id', liqId);
    expect(envios).not.toBeNull();
    for (const e of (envios ?? []) as { conciliado: boolean }[]) {
      expect(e.conciliado).toBe(true);
    }
  });

  it('cierra con diferencia y notas -> estado con_diferencia', async () => {
    const hoyPy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Asuncion' });
    const fechaEntrega = new Date().toISOString();

    await crearEnvioCodEntregado({ montoACobrar: 40000, fechaEntregaReal: fechaEntrega });

    const crearRes = await request
      .post('/api/admin/liquidaciones')
      .set(adminHeaders())
      .send({
        repartidorId: testData.repartidorId,
        fechaDesde: hoyPy,
        fechaHasta: hoyPy,
      });
    const liqId = crearRes.body.id as string;
    const esperado = crearRes.body.montoTotalEsperado as number;
    createdLiquidaciones.push(liqId);

    const cerrarRes = await request
      .patch(`/api/admin/liquidaciones/${liqId}/cerrar`)
      .set(adminHeaders())
      .send({
        montoRecibido: esperado - 5000,
        notas: 'Faltaron Gs 5000, repartidor dice que se mojo un billete',
      });

    expect(cerrarRes.status).toBe(200);
    expect(cerrarRes.body.estado).toBe('con_diferencia');
    expect(cerrarRes.body.diferencia).toBe(-5000);
  });

  it('cerrar con diferencia SIN notas -> 422', async () => {
    const hoyPy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Asuncion' });
    await crearEnvioCodEntregado({ montoACobrar: 40000 });

    const crearRes = await request
      .post('/api/admin/liquidaciones')
      .set(adminHeaders())
      .send({
        repartidorId: testData.repartidorId,
        fechaDesde: hoyPy,
        fechaHasta: hoyPy,
      });
    const liqId = crearRes.body.id as string;
    const esperado = crearRes.body.montoTotalEsperado as number;
    createdLiquidaciones.push(liqId);

    const cerrarRes = await request
      .patch(`/api/admin/liquidaciones/${liqId}/cerrar`)
      .set(adminHeaders())
      .send({ montoRecibido: esperado - 5000 });

    expect(cerrarRes.status).toBe(422);
    expect(cerrarRes.body).toHaveProperty('code', 'UNPROCESSABLE_ENTITY');
  });

  it('cerrar liquidacion ya cerrada -> 409', async () => {
    const hoyPy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Asuncion' });
    await crearEnvioCodEntregado({ montoACobrar: 15000 });

    const crearRes = await request
      .post('/api/admin/liquidaciones')
      .set(adminHeaders())
      .send({
        repartidorId: testData.repartidorId,
        fechaDesde: hoyPy,
        fechaHasta: hoyPy,
      });
    const liqId = crearRes.body.id as string;
    const esperado = crearRes.body.montoTotalEsperado as number;
    createdLiquidaciones.push(liqId);

    const first = await request
      .patch(`/api/admin/liquidaciones/${liqId}/cerrar`)
      .set(adminHeaders())
      .send({ montoRecibido: esperado });
    expect(first.status).toBe(200);

    const second = await request
      .patch(`/api/admin/liquidaciones/${liqId}/cerrar`)
      .set(adminHeaders())
      .send({ montoRecibido: esperado });
    expect(second.status).toBe(409);
    expect(second.body).toHaveProperty('code', 'CONFLICT');
  });

  it('devuelve 404 para liquidacion inexistente', async () => {
    const res = await request
      .patch('/api/admin/liquidaciones/00000000-0000-4000-a000-000000000099/cerrar')
      .set(adminHeaders())
      .send({ montoRecibido: 1000 });
    expect(res.status).toBe(404);
  });
});

describe('Doble liquidacion del mismo envio rechazada', () => {
  it('segunda liquidacion con rango solapado es rechazada con 409', async () => {
    const hoyPy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Asuncion' });
    const fechaEntrega = new Date().toISOString();

    await crearEnvioCodEntregado({ montoACobrar: 12000, fechaEntregaReal: fechaEntrega });

    const aRes = await request
      .post('/api/admin/liquidaciones')
      .set(adminHeaders())
      .send({
        repartidorId: testData.repartidorId,
        fechaDesde: hoyPy,
        fechaHasta: hoyPy,
      });
    const aId = aRes.body.id as string;
    const aEsperado = aRes.body.montoTotalEsperado as number;
    createdLiquidaciones.push(aId);

    const cerrarA = await request
      .patch(`/api/admin/liquidaciones/${aId}/cerrar`)
      .set(adminHeaders())
      .send({ montoRecibido: aEsperado });
    expect(cerrarA.status).toBe(200);

    const bRes = await request
      .post('/api/admin/liquidaciones')
      .set(adminHeaders())
      .send({
        repartidorId: testData.repartidorId,
        fechaDesde: hoyPy,
        fechaHasta: hoyPy,
      });
    expect(bRes.status).toBe(409);
    expect(bRes.body).toHaveProperty('code', 'CONFLICT');
    expect(String(bRes.body.error ?? '')).toMatch(/solapa/i);
  });

  it('rangos no solapados del mismo repartidor se permiten', async () => {
    const hoyPy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Asuncion' });
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 3);
    const ayerPy = ayer.toLocaleDateString('en-CA', { timeZone: 'America/Asuncion' });
    const anteayer = new Date();
    anteayer.setDate(anteayer.getDate() - 6);
    const anteayerPy = anteayer.toLocaleDateString('en-CA', { timeZone: 'America/Asuncion' });

    const aRes = await request
      .post('/api/admin/liquidaciones')
      .set(adminHeaders())
      .send({ repartidorId: testData.repartidorId, fechaDesde: anteayerPy, fechaHasta: anteayerPy });
    expect(aRes.status).toBe(201);
    createdLiquidaciones.push(aRes.body.id as string);

    const bRes = await request
      .post('/api/admin/liquidaciones')
      .set(adminHeaders())
      .send({ repartidorId: testData.repartidorId, fechaDesde: ayerPy, fechaHasta: hoyPy });
    expect(bRes.status).toBe(201);
    createdLiquidaciones.push(bRes.body.id as string);
  });
});

describe('GET /api/admin/liquidaciones: filtros y paginacion', () => {
  it('filtra por repartidorId', async () => {
    const res = await request
      .get('/api/admin/liquidaciones')
      .query({ repartidorId: testData.repartidorId, limit: 50 })
      .set(adminHeaders());
    expect(res.status).toBe(200);
    for (const l of res.body.data) {
      expect(l.repartidorId).toBe(testData.repartidorId);
    }
  });

  it('filtra por estado', async () => {
    const res = await request
      .get('/api/admin/liquidaciones')
      .query({ estado: 'cerrada', limit: 50 })
      .set(adminHeaders());
    expect(res.status).toBe(200);
    for (const l of res.body.data) {
      expect(l.estado).toBe('cerrada');
    }
  });

  it('incluye repartidorNombre y cantidadEnvios en el listado', async () => {
    const res = await request
      .get('/api/admin/liquidaciones')
      .query({ repartidorId: testData.repartidorId, limit: 1 })
      .set(adminHeaders());
    expect(res.status).toBe(200);
    if (res.body.data.length > 0) {
      const first = res.body.data[0];
      expect(first).toHaveProperty('repartidorNombre');
      expect(first).toHaveProperty('cantidadEnvios');
    }
  });
});

describe('GET /api/admin/repartidores/:id/liquidaciones', () => {
  it('lista liquidaciones filtradas por repartidor', async () => {
    const res = await request
      .get(`/api/admin/repartidores/${testData.repartidorId}/liquidaciones`)
      .set(adminHeaders());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    for (const l of res.body.data) {
      expect(l.repartidorId).toBe(testData.repartidorId);
    }
  });
});

describe('Trigger sync pagos -> envios.monto_cobrado (cache)', () => {
  it('crear pago contra_entrega actualiza envios.monto_cobrado', async () => {
    const payload = makeEnvioPayload(testData.clienteId, {
      tipoPago: 'contra_entrega',
      costo: 20000,
      montoACobrar: 20000,
    });
    const envioRes = await request.post('/api/admin/envios').set(adminHeaders()).send(payload);
    const envioId = envioRes.body.id as string;

    const pagoRes = await request
      .post('/api/admin/pagos')
      .set(adminHeaders())
      .send({
        envioId,
        montoTotal: 20000,
        montoRecibido: 20000,
        metodoPago: 'contra_entrega',
      });
    expect(pagoRes.status).toBe(201);

    const { data: envio } = await supabase
      .from('envios')
      .select('monto_cobrado')
      .eq('id', envioId)
      .single();
    expect((envio as { monto_cobrado: number }).monto_cobrado).toBe(20000);
  });

  it('anular pago contra_entrega resetea envios.monto_cobrado a 0', async () => {
    const payload = makeEnvioPayload(testData.clienteId, {
      tipoPago: 'contra_entrega',
      costo: 15000,
      montoACobrar: 15000,
    });
    const envioRes = await request.post('/api/admin/envios').set(adminHeaders()).send(payload);
    const envioId = envioRes.body.id as string;

    const pagoRes = await request
      .post('/api/admin/pagos')
      .set(adminHeaders())
      .send({
        envioId,
        montoTotal: 15000,
        montoRecibido: 15000,
        metodoPago: 'contra_entrega',
      });
    const pagoId = pagoRes.body.id as string;

    const { data: envioDespuesPago } = await supabase
      .from('envios')
      .select('monto_cobrado')
      .eq('id', envioId)
      .single();
    expect((envioDespuesPago as { monto_cobrado: number }).monto_cobrado).toBe(15000);

    const anulRes = await request
      .post(`/api/admin/pagos/${pagoId}/anular`)
      .set(adminHeaders())
      .send({ motivo: 'Pago mal imputado al envio incorrecto' });
    expect(anulRes.status).toBe(200);

    const { data: envioDespuesAnular } = await supabase
      .from('envios')
      .select('monto_cobrado')
      .eq('id', envioId)
      .single();
    expect((envioDespuesAnular as { monto_cobrado: number }).monto_cobrado).toBe(0);
  });
});
