import { request, adminHeaders } from '../setup/test-client.js';

// Desde 057 una tarifa viva no puede existir sin sus dos ciudades resueltas contra el catalogo,
// asi que el fixture no puede seguir inventando nombres. Estas tres son ciudades reales de Alto
// Paraguay sin tarifa en ningun otro test: la suite comparte base y una tarifa viva a una ciudad
// que otro archivo usa como "sin cobertura" lo romperia.
const CIUDAD_ORIGEN = 'Bahía Negra';
const CIUDAD_DESTINO = 'Capitán Carmelo Peralta';
const CIUDAD_DESTINO_ALT = 'Puerto Casado';

const preciosTarifa = {
  tipoServicio: 'estandar' as const,
  precioBase: 25000,
  pesoBase: 5,
  precioPorKgExtra: 3000,
  factorDimensional: 5000,
};

let createdTarifaId: string;
let origenCiudadId: string;
let destinoCiudadId: string;
let destinoAltCiudadId: string;

async function ciudadIdPorNombre(nombre: string): Promise<string> {
  const res = await request.get('/api/public/ciudades');
  if (res.status !== 200) {
    throw new Error(`No se pudo leer el catalogo de ciudades: ${res.status}`);
  }
  const ciudades = res.body.data as Array<{ id: string; nombre: string }>;
  const ciudad = ciudades.find((c) => c.nombre === nombre);
  if (!ciudad) {
    throw new Error(`La ciudad "${nombre}" no esta en el catalogo. Correr scripts/test-db-reset.sh.`);
  }
  return ciudad.id;
}

beforeAll(async () => {
  [origenCiudadId, destinoCiudadId, destinoAltCiudadId] = await Promise.all([
    ciudadIdPorNombre(CIUDAD_ORIGEN),
    ciudadIdPorNombre(CIUDAD_DESTINO),
    ciudadIdPorNombre(CIUDAD_DESTINO_ALT),
  ]);
});

describe('POST /api/admin/tarifas', () => {
  it('creates a tarifa with valid data and returns 201', async () => {
    const res = await request
      .post('/api/admin/tarifas')
      .set(adminHeaders())
      .send({ ...preciosTarifa, origenCiudadId, destinoCiudadId });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('origen', CIUDAD_ORIGEN);
    expect(res.body).toHaveProperty('destino', CIUDAD_DESTINO);
    expect(res.body).toHaveProperty('origenCiudadId', origenCiudadId);
    expect(res.body).toHaveProperty('destinoCiudadId', destinoCiudadId);
    expect(res.body).toHaveProperty('tipoServicio', 'estandar');
    expect(res.body).toHaveProperty('precioBase', 25000);
    expect(res.body).toHaveProperty('pesoBase', 5);

    createdTarifaId = res.body.id;
  });

  it('rejects missing required fields with 400', async () => {
    const res = await request
      .post('/api/admin/tarifas')
      .set(adminHeaders())
      .send({ origen: CIUDAD_ORIGEN });

    expect(res.status).toBe(400);
  });

  // El caso que 057 cierra por el lado del borde: un nombre que no existe en el catalogo ya no
  // se guarda "tal cual" con la FK en NULL, porque esa tarifa quedaba viva, invisible para el
  // panel de cobertura y compitiendo por el cotizador.
  it('rejects a ciudad name that is not in the catalog with 400', async () => {
    const res = await request
      .post('/api/admin/tarifas')
      .set(adminHeaders())
      .send({ ...preciosTarifa, origen: 'NowhereCity', destino: CIUDAD_DESTINO });

    expect(res.status).toBe(400);
    expect(String(res.body.error)).toContain('NowhereCity');
  });

  it('accepts a ciudad name written without accents and stores the canonical one', async () => {
    const res = await request
      .post('/api/admin/tarifas')
      .set(adminHeaders())
      .send({
        ...preciosTarifa,
        origen: 'Bahia Negra',
        destinoCiudadId: destinoAltCiudadId,
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('origen', CIUDAD_ORIGEN);
    expect(res.body).toHaveProperty('origenCiudadId', origenCiudadId);

    await request
      .delete(`/api/admin/tarifas/${res.body.id}`)
      .set(adminHeaders())
      .send({ motivo: 'Cleanup del caso de nombre sin tildes' });
  });

  it('rejects invalid tipoServicio with 400', async () => {
    const res = await request
      .post('/api/admin/tarifas')
      .set(adminHeaders())
      .send({ ...preciosTarifa, origenCiudadId, destinoCiudadId, tipoServicio: 'premium' });

    expect(res.status).toBe(400);
  });

  it('rejects negative precioBase with 400', async () => {
    const res = await request
      .post('/api/admin/tarifas')
      .set(adminHeaders())
      .send({ ...preciosTarifa, origenCiudadId, destinoCiudadId, precioBase: -1000 });

    expect(res.status).toBe(400);
  });

  it('rejects factorDimensional out of range with 400', async () => {
    const res = await request
      .post('/api/admin/tarifas')
      .set(adminHeaders())
      .send({ ...preciosTarifa, origenCiudadId, destinoCiudadId, factorDimensional: 500 });

    expect(res.status).toBe(400);
  });

  it('returns 401 without auth', async () => {
    const res = await request
      .post('/api/admin/tarifas')
      .send({ ...preciosTarifa, origenCiudadId, destinoCiudadId });

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
      .query({ origen: CIUDAD_ORIGEN })
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
    const createRes = await request
      .post('/api/admin/tarifas')
      .set(adminHeaders())
      .send({ ...preciosTarifa, origenCiudadId, destinoCiudadId: destinoAltCiudadId });
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
      .query({ origen: CIUDAD_ORIGEN })
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
