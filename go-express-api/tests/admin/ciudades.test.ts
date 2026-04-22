import { request, adminHeaders } from '../setup/test-client.js';

describe('GET /api/admin/ciudades', () => {
  it('returns 200 with the full catalog (262 ciudades)', async () => {
    const res = await request.get('/api/admin/ciudades').set(adminHeaders());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(260);
    expect(res.body.data.length).toBeLessThanOrEqual(263);
  });

  it('each ciudad has departamentoId, departamentoNombre, and habilitada flag', async () => {
    const res = await request.get('/api/admin/ciudades').set(adminHeaders());
    expect(res.status).toBe(200);
    const first = res.body.data[0];
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('nombre');
    expect(first).toHaveProperty('departamentoId');
    expect(first).toHaveProperty('departamentoNombre');
    expect(first).toHaveProperty('esCapital');
    expect(typeof first.habilitada).toBe('boolean');
  });

  it('Asuncion is the first item (orden=0)', async () => {
    const res = await request.get('/api/admin/ciudades').set(adminHeaders());
    expect(res.body.data[0].departamentoNombre).toBe('Asunción');
    expect(res.body.data[0].nombre).toBe('Asunción');
  });

  it('rejects without auth with 401', async () => {
    const res = await request.get('/api/admin/ciudades');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/admin/ciudades/departamentos', () => {
  it('returns the 18 departamentos', async () => {
    const res = await request
      .get('/api/admin/ciudades/departamentos')
      .set(adminHeaders());
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(18);
  });

  it('Asuncion comes first (orden=0)', async () => {
    const res = await request
      .get('/api/admin/ciudades/departamentos')
      .set(adminHeaders());
    expect(res.body.data[0].nombre).toBe('Asunción');
    expect(res.body.data[0].orden).toBe(0);
  });
});

describe('GET /api/admin/ciudades/cobertura', () => {
  it('returns aggregate + 18 departamento cards', async () => {
    const res = await request
      .get('/api/admin/ciudades/cobertura')
      .set(adminHeaders());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalCiudades');
    expect(res.body).toHaveProperty('ciudadesHabilitadas');
    expect(res.body).toHaveProperty('totalDepartamentos', 18);
    expect(res.body).toHaveProperty('departamentosConCobertura');
    expect(res.body.departamentos.length).toBe(18);

    const first = res.body.departamentos[0];
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('nombre');
    expect(first).toHaveProperty('totalCiudades');
    expect(first).toHaveProperty('ciudadesHabilitadas');
    expect(Array.isArray(first.ciudades)).toBe(true);
  });

  it('orders departamentos by coverage ascending (less covered first)', async () => {
    const res = await request
      .get('/api/admin/ciudades/cobertura')
      .set(adminHeaders());
    expect(res.status).toBe(200);
    const deptos = res.body.departamentos as Array<{
      totalCiudades: number;
      ciudadesHabilitadas: number;
    }>;
    for (let i = 1; i < deptos.length; i++) {
      const prev = deptos[i - 1]!;
      const curr = deptos[i]!;
      const ratioPrev = prev.totalCiudades === 0 ? 2 : prev.ciudadesHabilitadas / prev.totalCiudades;
      const ratioCurr = curr.totalCiudades === 0 ? 2 : curr.ciudadesHabilitadas / curr.totalCiudades;
      expect(ratioPrev).toBeLessThanOrEqual(ratioCurr);
    }
  });

  it('rejects without auth with 401', async () => {
    const res = await request.get('/api/admin/ciudades/cobertura');
    expect(res.status).toBe(401);
  });
});

describe('Tarifa creation habilita una ciudad', () => {
  let origenId: string;
  let destinoId: string;
  let tarifaId: string | null = null;

  beforeAll(async () => {
    const ciudadesRes = await request
      .get('/api/admin/ciudades')
      .set(adminHeaders());
    const ciudades = ciudadesRes.body.data as Array<{
      id: string;
      nombre: string;
      habilitada: boolean;
    }>;
    // Elegimos dos ciudades. Origen puede estar habilitada (no afecta). Destino debe
    // estar sin cobertura previa para que la nueva tarifa la habilite.
    const origen = ciudades.find((c) => c.nombre === 'Asunción');
    const destino = ciudades.find((c) => !c.habilitada && c.nombre !== 'Asunción');
    if (!origen || !destino) throw new Error('No hay ciudades apropiadas para el test');
    origenId = origen.id;
    destinoId = destino.id;
  });

  afterAll(async () => {
    if (tarifaId) {
      await request
        .delete(`/api/admin/tarifas/${tarifaId}`)
        .set(adminHeaders())
        .send({ motivo: 'Cleanup ciudades test' });
    }
  });

  it('creating a tarifa with unfamiliar destinoCiudadId habilita esa ciudad', async () => {
    const beforeCobertura = await request
      .get('/api/admin/ciudades/cobertura')
      .set(adminHeaders());
    const beforeCount = (beforeCobertura.body.ciudadesHabilitadas as number);

    const createRes = await request
      .post('/api/admin/tarifas')
      .set(adminHeaders())
      .send({
        origenCiudadId: origenId,
        destinoCiudadId: destinoId,
        tipoServicio: 'estandar',
        precioBase: 50000,
        pesoBase: 3,
        precioPorKgExtra: 5000,
        factorDimensional: 5000,
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.origenCiudadId).toBe(origenId);
    expect(createRes.body.destinoCiudadId).toBe(destinoId);
    tarifaId = createRes.body.id as string;

    const afterList = await request
      .get('/api/admin/ciudades')
      .set(adminHeaders());
    const destinoAhora = (afterList.body.data as Array<{ id: string; habilitada: boolean }>).find(
      (c) => c.id === destinoId,
    );
    expect(destinoAhora?.habilitada).toBe(true);

    const afterCobertura = await request
      .get('/api/admin/ciudades/cobertura')
      .set(adminHeaders());
    expect(afterCobertura.body.ciudadesHabilitadas).toBeGreaterThanOrEqual(beforeCount + 1);
  });
});
