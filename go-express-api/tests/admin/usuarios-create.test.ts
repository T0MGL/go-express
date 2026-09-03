import { createClient } from '@supabase/supabase-js';
import { request, adminHeaders } from '../setup/test-client.js';

const SUPABASE_URL = process.env['SUPABASE_URL']!;
const SERVICE_ROLE = process.env['SUPABASE_SERVICE_ROLE_KEY']!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const uniqueSuffix = Date.now().toString(36);

// Tracks every auth user and usuarios row we create so afterAll can wipe them
// regardless of which assertions landed first.
const createdUsuarioIds: string[] = [];
const createdAuthIds: string[] = [];

afterAll(async () => {
  for (const id of createdUsuarioIds) {
    // El query builder de supabase-js es un thenable, no una Promise: no tiene .catch.
    const { error } = await admin.from('usuarios').delete().eq('id', id);
    if (error) console.warn(`cleanup usuarios ${id}: ${error.message}`);
  }
  for (const authId of createdAuthIds) {
    await admin.auth.admin.deleteUser(authId).catch(() => undefined);
  }
});

async function collectForCleanup(email: string, usuarioId?: string): Promise<void> {
  if (usuarioId) {
    createdUsuarioIds.push(usuarioId);
  }
  const { data: row } = await admin
    .from('usuarios')
    .select('id, auth_id')
    .eq('email', email)
    .maybeSingle();
  if (row?.id && !createdUsuarioIds.includes(row.id as string)) {
    createdUsuarioIds.push(row.id as string);
  }
  if (row?.auth_id && !createdAuthIds.includes(row.auth_id as string)) {
    createdAuthIds.push(row.auth_id as string);
  }
}

describe('POST /api/admin/usuarios', () => {
  it('creates an admin user with lowercase rol and returns 201', async () => {
    const email = `invite-admin-${uniqueSuffix}@goexpress.test`;
    const payload = { nombre: `Admin ${uniqueSuffix}`, email, rol: 'admin' };

    const res = await request
      .post('/api/admin/usuarios')
      .set(adminHeaders())
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      nombre: payload.nombre,
      email,
      rol: 'admin',
      estado: 'activo',
    });
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('authId');

    await collectForCleanup(email, res.body.id);
  });

  it('creates an operador user and returns 201', async () => {
    const email = `invite-op-${uniqueSuffix}@goexpress.test`;
    const payload = { nombre: `Operador ${uniqueSuffix}`, email, rol: 'operador' };

    const res = await request
      .post('/api/admin/usuarios')
      .set(adminHeaders())
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email, rol: 'operador' });

    await collectForCleanup(email, res.body.id);
  });

  it('rejects capitalized rol with 400 and surfaces the field', async () => {
    const res = await request
      .post('/api/admin/usuarios')
      .set(adminHeaders())
      .send({
        nombre: 'Bad Rol',
        email: `bad-rol-${uniqueSuffix}@goexpress.test`,
        rol: 'Admin',
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('code', 'BAD_REQUEST');
    const issues = (res.body.details as Array<{ target: string; issues: Array<{ field: string }> }>) ?? [];
    const fields = issues.flatMap((d) => d.issues.map((i) => i.field));
    expect(fields).toContain('rol');
  });

  it('rejects an unknown rol with 400', async () => {
    const res = await request
      .post('/api/admin/usuarios')
      .set(adminHeaders())
      .send({
        nombre: 'Bad Rol',
        email: `repartidor-${uniqueSuffix}@goexpress.test`,
        rol: 'repartidor',
      });

    expect(res.status).toBe(400);
  });

  it('rejects missing nombre with 400', async () => {
    const res = await request
      .post('/api/admin/usuarios')
      .set(adminHeaders())
      .send({ email: `no-nombre-${uniqueSuffix}@goexpress.test`, rol: 'admin' });

    expect(res.status).toBe(400);
  });

  it('rejects invalid email with 400', async () => {
    const res = await request
      .post('/api/admin/usuarios')
      .set(adminHeaders())
      .send({ nombre: 'Bad Email', email: 'not-an-email', rol: 'admin' });

    expect(res.status).toBe(400);
  });

  it('normalizes email to lowercase and trimmed', async () => {
    const raw = `  MixedCase-${uniqueSuffix}@GoExpress.Test  `;
    const normalized = raw.trim().toLowerCase();

    const res = await request
      .post('/api/admin/usuarios')
      .set(adminHeaders())
      .send({ nombre: 'Mixed Case', email: raw, rol: 'operador' });

    expect(res.status).toBe(201);
    expect(res.body.email).toBe(normalized);

    await collectForCleanup(normalized, res.body.id);
  });

  it('rejects duplicate email with 409', async () => {
    const email = `dup-${uniqueSuffix}@goexpress.test`;

    const first = await request
      .post('/api/admin/usuarios')
      .set(adminHeaders())
      .send({ nombre: 'First', email, rol: 'operador' });
    expect(first.status).toBe(201);
    await collectForCleanup(email, first.body.id);

    const dup = await request
      .post('/api/admin/usuarios')
      .set(adminHeaders())
      .send({ nombre: 'Second', email, rol: 'operador' });

    expect(dup.status).toBe(409);
    expect(dup.body).toHaveProperty('code', 'CONFLICT');
  });

  it('returns 401 without auth', async () => {
    const res = await request.post('/api/admin/usuarios').send({
      nombre: 'No Auth',
      email: `noauth-${uniqueSuffix}@goexpress.test`,
      rol: 'admin',
    });

    expect(res.status).toBe(401);
  });
});
