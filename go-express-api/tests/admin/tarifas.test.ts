import { request, adminHeaders } from '../setup/test-client.js';

let createdTarifaId: string;
const uniqueSuffix = Date.now().toString(36);

const validTarifa = {
  origen: `TestOrigen${uniqueSuffix}`,
  destino: `TestDestino${uniqueSuffix}`,
  tipoServicio: 'estandar',
  precioBase: 25000,
  pesoBase: 5,
  precioPorKgExtra: 3000,
  factorDimensional: 5000,
};

describe('POST /api/admin/tarifas', () => {
  it('creates a tarifa with valid data and returns 201', async () => {
    const res = await request
      .post('/api/admin/tarifas')
      .set(adminHeaders())
      .send(validTarifa);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('origen', validTarifa.origen);
    expect(res.body).toHaveProperty('destino', validTarifa.destino);
    expect(res.body).toHaveProperty('tipoServicio', 'estandar');
    expect(res.body).toHaveProperty('precioBase', 25000);
    expect(res.body).toHaveProperty('pesoBase', 5);

    createdTarifaId = res.body.id;
  });

  it('rejects missing required fields with 400', async () => {
    const res = await request
      .post('/api/admin/tarifas')
      .set(adminHeaders())
      .send({ origen: 'Asuncion' });

    expect(res.status).toBe(400);
  });

  it('rejects invalid tipoServicio with 400', async () => {
    const res = await request
      .post('/api/admin/tarifas')
      .set(adminHeaders())
      .send({ ...validTarifa, tipoServicio: 'premium' });

    expect(res.status).toBe(400);
  });

  it('rejects negative precioBase with 400', async () => {
    const res = await request
      .post('/api/admin/tarifas')
      .set(adminHeaders())
      .send({ ...validTarifa, precioBase: -1000 });

    expect(res.status).toBe(400);
  });

  it('rejects factorDimensional out of range with 400', async () => {
    const res = await request
      .post('/api/admin/tarifas')
      .set(adminHeaders())
      .send({ ...validTarifa, factorDimensional: 500 });

    expect(res.status).toBe(400);
  });

  it('returns 401 without auth', async () => {
    const res = await request
      .post('/api/admin/tarifas')
      .send(validTarifa);

    expect(res.status).toBe(401);
  });
});

describe('GET /api/admin/tarifas', () => {
  it('returns 200 with list of tarifas', async () => {
    const res = await request
      .get('/api/admin/tarifas')
      .set(adminHeaders());

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('pagination');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('filters by tipoServicio', async () => {
    const res = await request
      .get('/api/admin/tarifas')
      .query({ tipoServicio: 'estandar' })
      .set(adminHeaders());

    expect(res.status).toBe(200);
    for (const t of res.body.data) {
      expect(t.tipoServicio).toBe('estandar');
    }
  });

  it('filters by origen', async () => {
    const res = await request
      .get('/api/admin/tarifas')
      .query({ origen: validTarifa.origen })
      .set(adminHeaders());

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });
});

describe('PUT /api/admin/tarifas/:id', () => {
  it('updates tarifa fields and returns 200', async () => {
    const res = await request
      .put(`/api/admin/tarifas/${createdTarifaId}`)
      .set(adminHeaders())
      .send({ precioBase: 30000 });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('precioBase', 30000);
  });

  it('returns 404 for nonexistent tarifa', async () => {
    const res = await request
      .put('/api/admin/tarifas/00000000-0000-4000-a000-000000000099')
      .set(adminHeaders())
      .send({ precioBase: 10000 });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/admin/tarifas/:id (soft delete)', () => {
  it('soft-deletes tarifa with motivo and returns 204', async () => {
    const res = await request
      .delete(`/api/admin/tarifas/${createdTarifaId}`)
      .set(adminHeaders())
      .send({ motivo: 'Rate no longer applicable' });

    expect(res.status).toBe(204);
  });

  it('rejects delete without motivo with 400', async () => {
    const suffix = Date.now().toString(36);
    const createRes = await request
      .post('/api/admin/tarifas')
      .set(adminHeaders())
      .send({
        ...validTarifa,
        origen: `NoMotivo${suffix}`,
        destino: `NoMotivo${suffix}`,
      });
    const id = createRes.body.id;

    const res = await request
      .delete(`/api/admin/tarifas/${id}`)
      .set(adminHeaders())
      .send({});

    expect(res.status).toBe(400);

    // Cleanup
    await request
      .delete(`/api/admin/tarifas/${id}`)
      .set(adminHeaders())
      .send({ motivo: 'Cleanup' });
  });
});

describe('PATCH /api/admin/tarifas/:id/restore', () => {
  it('restores a soft-deleted tarifa and returns 200', async () => {
    const res = await request
      .patch(`/api/admin/tarifas/${createdTarifaId}/restore`)
      .set(adminHeaders());

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', createdTarifaId);
  });

  it('tarifa is visible in list after restore', async () => {
    const res = await request
      .get('/api/admin/tarifas')
      .query({ origen: validTarifa.origen })
      .set(adminHeaders());

    expect(res.status).toBe(200);
    const found = res.body.data.find(
      (t: Record<string, unknown>) => t.id === createdTarifaId
    );
    expect(found).toBeDefined();
  });

  // Final cleanup
  afterAll(async () => {
    await request
      .delete(`/api/admin/tarifas/${createdTarifaId}`)
      .set(adminHeaders())
      .send({ motivo: 'Final cleanup after tarifa tests' });
  });
});
