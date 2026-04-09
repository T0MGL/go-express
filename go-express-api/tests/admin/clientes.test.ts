import { request, adminHeaders } from '../setup/test-client.js';

let createdClienteId: string;
const uniqueSuffix = Date.now().toString(36);

const validCliente = {
  razonSocial: `Test Corp ${uniqueSuffix}`,
  ruc: `80099${uniqueSuffix.slice(0, 5)}-1`,
  contactoNombre: 'Carlos Test',
  telefono: '+595981100200',
  email: `test-cliente-${uniqueSuffix}@goexpress.test`,
  direccion: 'Av. Espana 1234, Asuncion',
  ciudad: 'Asuncion',
  plan: 'basico',
};

afterAll(async () => {
  if (createdClienteId) {
    await request
      .delete(`/api/admin/clientes/${createdClienteId}`)
      .set(adminHeaders())
      .send({ motivo: 'Cleanup after integration tests' });
  }
});

describe('POST /api/admin/clientes', () => {
  it('creates a client with valid data and returns 201', async () => {
    const res = await request
      .post('/api/admin/clientes')
      .set(adminHeaders())
      .send(validCliente);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('razonSocial', validCliente.razonSocial);
    expect(res.body).toHaveProperty('email', validCliente.email);
    expect(res.body).toHaveProperty('estado', 'activo');
    expect(res.body).toHaveProperty('plan', 'basico');

    createdClienteId = res.body.id;
  });

  it('rejects duplicate email with 409', async () => {
    const duplicatePayload = {
      ...validCliente,
      razonSocial: 'Duplicate Email Corp',
      ruc: `99999${uniqueSuffix.slice(0, 5)}-2`,
    };

    const res = await request
      .post('/api/admin/clientes')
      .set(adminHeaders())
      .send(duplicatePayload);

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('code', 'CONFLICT');
  });

  it('rejects duplicate RUC with 409', async () => {
    const duplicatePayload = {
      ...validCliente,
      razonSocial: 'Duplicate RUC Corp',
      email: `unique-ruc-test-${Date.now()}@goexpress.test`,
    };

    const res = await request
      .post('/api/admin/clientes')
      .set(adminHeaders())
      .send(duplicatePayload);

    expect(res.status).toBe(409);
  });

  it('rejects invalid phone format with 400', async () => {
    const payload = {
      ...validCliente,
      ruc: '11111-new',
      email: 'new-phone-test@goexpress.test',
      telefono: '12345',
    };

    const res = await request
      .post('/api/admin/clientes')
      .set(adminHeaders())
      .send(payload);

    expect(res.status).toBe(400);
  });

  it('rejects missing required fields with 400', async () => {
    const res = await request
      .post('/api/admin/clientes')
      .set(adminHeaders())
      .send({ razonSocial: 'Incomplete' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('code', 'BAD_REQUEST');
  });

  it('rejects invalid email format with 400', async () => {
    const payload = {
      ...validCliente,
      ruc: '22222-new',
      email: 'not-an-email',
    };

    const res = await request
      .post('/api/admin/clientes')
      .set(adminHeaders())
      .send(payload);

    expect(res.status).toBe(400);
  });
});

describe('GET /api/admin/clientes', () => {
  it('returns 200 with paginated list', async () => {
    const res = await request
      .get('/api/admin/clientes')
      .set(adminHeaders());

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('pagination');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('filters by search query', async () => {
    const res = await request
      .get('/api/admin/clientes')
      .query({ search: validCliente.razonSocial })
      .set(adminHeaders());

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('filters by estado', async () => {
    const res = await request
      .get('/api/admin/clientes')
      .query({ estado: 'activo' })
      .set(adminHeaders());

    expect(res.status).toBe(200);
    for (const c of res.body.data) {
      expect(c.estado).toBe('activo');
    }
  });

  it('filters by plan', async () => {
    const res = await request
      .get('/api/admin/clientes')
      .query({ plan: 'basico' })
      .set(adminHeaders());

    expect(res.status).toBe(200);
    for (const c of res.body.data) {
      expect(c.plan).toBe('basico');
    }
  });

  it('returns 401 without auth', async () => {
    const res = await request.get('/api/admin/clientes');

    expect(res.status).toBe(401);
  });
});

describe('GET /api/admin/clientes/:id', () => {
  it('returns 200 with client detail', async () => {
    const res = await request
      .get(`/api/admin/clientes/${createdClienteId}`)
      .set(adminHeaders());

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', createdClienteId);
    expect(res.body).toHaveProperty('razonSocial', validCliente.razonSocial);
    expect(res.body).toHaveProperty('email', validCliente.email);
  });

  it('returns 404 for nonexistent client', async () => {
    const res = await request
      .get('/api/admin/clientes/00000000-0000-4000-a000-000000000099')
      .set(adminHeaders());

    expect(res.status).toBe(404);
  });
});

describe('PUT /api/admin/clientes/:id', () => {
  it('updates client fields and returns 200', async () => {
    const res = await request
      .put(`/api/admin/clientes/${createdClienteId}`)
      .set(adminHeaders())
      .send({ contactoNombre: 'Carlos Updated' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('contactoNombre', 'Carlos Updated');
  });

  it('returns 404 for nonexistent client', async () => {
    const res = await request
      .put('/api/admin/clientes/00000000-0000-4000-a000-000000000099')
      .set(adminHeaders())
      .send({ contactoNombre: 'Nobody' });

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/admin/clientes/:id/estado', () => {
  it('changes client estado', async () => {
    const res = await request
      .patch(`/api/admin/clientes/${createdClienteId}/estado`)
      .set(adminHeaders())
      .send({ estado: 'inactivo', motivo: 'Test deactivation' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('estado', 'inactivo');
  });

  it('restores client to activo', async () => {
    const res = await request
      .patch(`/api/admin/clientes/${createdClienteId}/estado`)
      .set(adminHeaders())
      .send({ estado: 'activo' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('estado', 'activo');
  });
});

describe('DELETE /api/admin/clientes/:id', () => {
  let clienteToDeleteId: string;

  beforeAll(async () => {
    const suffix = Date.now().toString(36);
    const res = await request
      .post('/api/admin/clientes')
      .set(adminHeaders())
      .send({
        ...validCliente,
        razonSocial: `Delete Test Corp ${suffix}`,
        ruc: `77777${suffix.slice(0, 5)}-1`,
        email: `delete-test-${suffix}@goexpress.test`,
      });
    clienteToDeleteId = res.body.id;
  });

  it('soft-deletes client with motivo and returns 204', async () => {
    const res = await request
      .delete(`/api/admin/clientes/${clienteToDeleteId}`)
      .set(adminHeaders())
      .send({ motivo: 'Client requested account removal' });

    expect(res.status).toBe(204);
  });

  it('returns 404 when fetching deleted client', async () => {
    const res = await request
      .get(`/api/admin/clientes/${clienteToDeleteId}`)
      .set(adminHeaders());

    expect(res.status).toBe(404);
  });
});
