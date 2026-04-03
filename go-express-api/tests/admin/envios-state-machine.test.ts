import { request, adminHeaders } from '../setup/test-client.js';
import { seedTestData, cleanupTestData, makeEnvioPayload, type TestData } from '../setup/seed.js';

let testData: TestData;

beforeAll(async () => {
  testData = await seedTestData();
});

afterAll(async () => {
  await cleanupTestData(testData);
});

async function createPendienteEnvio(): Promise<string> {
  const payload = makeEnvioPayload(testData.clienteId);
  const res = await request
    .post('/api/admin/envios')
    .set(adminHeaders())
    .send(payload);
  expect(res.status).toBe(201);
  expect(res.body.estado).toBe('pendiente');
  return res.body.id;
}

async function transitionTo(envioId: string, estado: string, descripcion: string): Promise<ReturnType<typeof request.patch>> {
  return request
    .patch(`/api/admin/envios/${envioId}/estado`)
    .set(adminHeaders())
    .send({ estado, descripcion });
}

describe('Envio state machine: happy path (full lifecycle)', () => {
  let envioId: string;

  it('creates envio in pendiente state', async () => {
    envioId = await createPendienteEnvio();
  });

  it('transitions pendiente -> recolectado', async () => {
    const res = await transitionTo(envioId, 'recolectado', 'Paquete recolectado del cliente');

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('recolectado');
  });

  it('transitions recolectado -> en_transito', async () => {
    const res = await transitionTo(envioId, 'en_transito', 'En camino al centro de distribucion');

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('en_transito');
  });

  it('transitions en_transito -> en_reparto', async () => {
    const res = await transitionTo(envioId, 'en_reparto', 'Saliendo a reparto local');

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('en_reparto');
  });

  it('transitions en_reparto -> entregado (terminal)', async () => {
    const res = await transitionTo(envioId, 'entregado', 'Entregado al destinatario');

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('entregado');
  });

  it('rejects transition from entregado (terminal state) with 422', async () => {
    const res = await transitionTo(envioId, 'pendiente', 'Attempting invalid rollback');

    expect(res.status).toBe(422);
    expect(res.body).toHaveProperty('code', 'UNPROCESSABLE_ENTITY');
    expect(res.body).toHaveProperty('details');
    expect(res.body.details).toHaveProperty('allowedTransitions');
    expect(res.body.details.allowedTransitions).toEqual([]);
  });
});

describe('Envio state machine: invalid skips', () => {
  it('rejects pendiente -> entregado (skipping intermediate states)', async () => {
    const envioId = await createPendienteEnvio();

    const res = await transitionTo(envioId, 'entregado', 'Trying to skip');

    expect(res.status).toBe(422);
    expect(res.body.details.currentEstado).toBe('pendiente');
    expect(res.body.details.requestedEstado).toBe('entregado');
  });

  it('rejects pendiente -> en_reparto (skipping intermediate states)', async () => {
    const envioId = await createPendienteEnvio();

    const res = await transitionTo(envioId, 'en_reparto', 'Trying to skip');

    expect(res.status).toBe(422);
    expect(res.body.details.currentEstado).toBe('pendiente');
  });

  it('rejects pendiente -> en_transito (skipping recolectado)', async () => {
    const envioId = await createPendienteEnvio();

    const res = await transitionTo(envioId, 'en_transito', 'Trying to skip');

    expect(res.status).toBe(422);
  });

  it('rejects recolectado -> entregado (skipping en_transito and en_reparto)', async () => {
    const envioId = await createPendienteEnvio();
    await transitionTo(envioId, 'recolectado', 'Recolectado');

    const res = await transitionTo(envioId, 'entregado', 'Trying to skip');

    expect(res.status).toBe(422);
  });

  it('rejects recolectado -> en_reparto (skipping en_transito)', async () => {
    const envioId = await createPendienteEnvio();
    await transitionTo(envioId, 'recolectado', 'Recolectado');

    const res = await transitionTo(envioId, 'en_reparto', 'Trying to skip');

    expect(res.status).toBe(422);
  });
});

describe('Envio state machine: problema flow', () => {
  it('transitions pendiente -> problema', async () => {
    const envioId = await createPendienteEnvio();

    const res = await transitionTo(envioId, 'problema', 'Direccion incorrecta');

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('problema');
    expect(res.body.problemaDescripcion).toBe('Direccion incorrecta');
    expect(res.body.problemaFecha).toBeTruthy();
  });

  it('recovers from problema -> pendiente', async () => {
    const envioId = await createPendienteEnvio();
    await transitionTo(envioId, 'problema', 'Problema temporal');

    const res = await transitionTo(envioId, 'pendiente', 'Problema resuelto, reintentando');

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('pendiente');
    expect(res.body.problemaDescripcion).toBeNull();
    expect(res.body.problemaFecha).toBeNull();
  });

  it('recovers from problema -> en_transito', async () => {
    const envioId = await createPendienteEnvio();
    await transitionTo(envioId, 'problema', 'Retraso en transito');

    const res = await transitionTo(envioId, 'en_transito', 'Retomando transito');

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('en_transito');
  });

  it('recovers from problema -> en_reparto', async () => {
    const envioId = await createPendienteEnvio();
    await transitionTo(envioId, 'problema', 'Problema en reparto');

    const res = await transitionTo(envioId, 'en_reparto', 'Reintentando reparto');

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('en_reparto');
  });

  it('recovers from problema -> fallido', async () => {
    const envioId = await createPendienteEnvio();
    await transitionTo(envioId, 'problema', 'Problema critico');

    const res = await transitionTo(envioId, 'fallido', 'No se pudo resolver');

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('fallido');
  });

  it('problema cannot transition to entregado directly', async () => {
    const envioId = await createPendienteEnvio();
    await transitionTo(envioId, 'problema', 'Test problema');

    const res = await transitionTo(envioId, 'entregado', 'Trying direct delivery');

    expect(res.status).toBe(422);
  });

  it('any active state can transition to problema', async () => {
    const envioId1 = await createPendienteEnvio();
    await transitionTo(envioId1, 'recolectado', 'Recolectado');
    const r1 = await transitionTo(envioId1, 'problema', 'Problema desde recolectado');
    expect(r1.status).toBe(200);

    const envioId2 = await createPendienteEnvio();
    await transitionTo(envioId2, 'recolectado', 'Recolectado');
    await transitionTo(envioId2, 'en_transito', 'En transito');
    const r2 = await transitionTo(envioId2, 'problema', 'Problema desde en_transito');
    expect(r2.status).toBe(200);

    const envioId3 = await createPendienteEnvio();
    await transitionTo(envioId3, 'recolectado', 'Recolectado');
    await transitionTo(envioId3, 'en_transito', 'En transito');
    await transitionTo(envioId3, 'en_reparto', 'En reparto');
    const r3 = await transitionTo(envioId3, 'problema', 'Problema desde en_reparto');
    expect(r3.status).toBe(200);
  });
});

describe('Envio state machine: fallido flow', () => {
  it('transitions en_reparto -> fallido', async () => {
    const envioId = await createPendienteEnvio();
    await transitionTo(envioId, 'recolectado', 'Recolectado');
    await transitionTo(envioId, 'en_transito', 'En transito');
    await transitionTo(envioId, 'en_reparto', 'En reparto');

    const res = await transitionTo(envioId, 'fallido', 'Destinatario no encontrado');

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('fallido');
  });

  it('recovers from fallido -> en_reparto (retry delivery)', async () => {
    const envioId = await createPendienteEnvio();
    await transitionTo(envioId, 'recolectado', 'Recolectado');
    await transitionTo(envioId, 'en_transito', 'En transito');
    await transitionTo(envioId, 'en_reparto', 'En reparto');
    await transitionTo(envioId, 'fallido', 'Primer intento fallido');

    const res = await transitionTo(envioId, 'en_reparto', 'Segundo intento de entrega');

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('en_reparto');
  });

  it('fallido -> problema is valid', async () => {
    const envioId = await createPendienteEnvio();
    await transitionTo(envioId, 'recolectado', 'Recolectado');
    await transitionTo(envioId, 'en_transito', 'En transito');
    await transitionTo(envioId, 'en_reparto', 'En reparto');
    await transitionTo(envioId, 'fallido', 'Fallido');

    const res = await transitionTo(envioId, 'problema', 'Investigar falla');

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('problema');
  });
});

describe('Envio state machine: validation', () => {
  it('rejects estado change without descripcion', async () => {
    const envioId = await createPendienteEnvio();

    const res = await request
      .patch(`/api/admin/envios/${envioId}/estado`)
      .set(adminHeaders())
      .send({ estado: 'recolectado' });

    expect(res.status).toBe(400);
  });

  it('rejects empty descripcion', async () => {
    const envioId = await createPendienteEnvio();

    const res = await request
      .patch(`/api/admin/envios/${envioId}/estado`)
      .set(adminHeaders())
      .send({ estado: 'recolectado', descripcion: '' });

    expect(res.status).toBe(400);
  });

  it('rejects invalid estado value', async () => {
    const envioId = await createPendienteEnvio();

    const res = await request
      .patch(`/api/admin/envios/${envioId}/estado`)
      .set(adminHeaders())
      .send({ estado: 'invented_state', descripcion: 'Test' });

    expect(res.status).toBe(400);
  });

  it('rejects estado change on nonexistent envio with 404', async () => {
    const res = await request
      .patch('/api/admin/envios/00000000-0000-4000-a000-000000000099/estado')
      .set(adminHeaders())
      .send({ estado: 'recolectado', descripcion: 'Test' });

    expect(res.status).toBe(404);
  });

  it('accepts optional ubicacion field', async () => {
    const envioId = await createPendienteEnvio();

    const res = await request
      .patch(`/api/admin/envios/${envioId}/estado`)
      .set(adminHeaders())
      .send({ estado: 'recolectado', descripcion: 'Recolectado', ubicacion: 'Asuncion Centro' });

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('recolectado');
  });
});
