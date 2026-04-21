import { createClient } from '@supabase/supabase-js';
import { request, adminHeaders } from '../setup/test-client.js';

const SUPABASE_URL = process.env['SUPABASE_URL']!;
const SERVICE_ROLE = process.env['SUPABASE_SERVICE_ROLE_KEY']!;
const ANON_KEY = process.env['SUPABASE_ANON_KEY']!;

// Service-role client. Only used to provision a throwaway auth user + usuario
// row before the tests, and to clean it up afterwards. The test exercises the
// admin endpoints, not Supabase directly.
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Anon client. Used to verify that the admin-set password actually authenticates
// the target user end-to-end.
const anon = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const uniqueSuffix = Date.now().toString(36);
const testEmail = `pw-reset-${uniqueSuffix}@goexpress.test`;
const testNombre = `Pw Reset Test ${uniqueSuffix}`;
const initialPassword = `Init-${uniqueSuffix}-Aa1!`;

let authId: string;
let usuarioId: string;

beforeAll(async () => {
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: testEmail,
    password: initialPassword,
    email_confirm: true,
    user_metadata: { role: 'operador', nombre: testNombre },
  });

  if (createErr || !created.user) {
    throw new Error(`Test setup: failed to create auth user: ${createErr?.message}`);
  }
  authId = created.user.id;

  const { data: row, error: insertErr } = await admin
    .from('usuarios')
    .insert({
      auth_id: authId,
      nombre: testNombre,
      email: testEmail,
      rol: 'operador',
      estado: 'activo',
    })
    .select('id')
    .single();

  if (insertErr || !row) {
    await admin.auth.admin.deleteUser(authId).catch(() => {});
    throw new Error(`Test setup: failed to insert usuario row: ${insertErr?.message}`);
  }
  usuarioId = row.id as string;
});

afterAll(async () => {
  if (usuarioId) {
    await admin.from('usuarios').delete().eq('id', usuarioId);
  }
  if (authId) {
    await admin.auth.admin.deleteUser(authId).catch(() => {});
  }
});

describe('POST /api/admin/usuarios/:id/password', () => {
  it('rotates the password and lets the user sign in with it', async () => {
    const newPassword = `Rotated-${uniqueSuffix}-Bb2@`;

    const res = await request
      .post(`/api/admin/usuarios/${usuarioId}/password`)
      .set(adminHeaders())
      .send({ password: newPassword });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: usuarioId, email: testEmail, estado: 'activo' });

    const { data: signInData, error: signInErr } = await anon.auth.signInWithPassword({
      email: testEmail,
      password: newPassword,
    });

    expect(signInErr).toBeNull();
    expect(signInData.session).not.toBeNull();
    expect(signInData.user?.id).toBe(authId);

    // Old password must no longer authenticate.
    const { error: oldSignInErr } = await anon.auth.signInWithPassword({
      email: testEmail,
      password: initialPassword,
    });
    expect(oldSignInErr).not.toBeNull();
  });

  it('rejects a password that is too short with 400', async () => {
    const res = await request
      .post(`/api/admin/usuarios/${usuarioId}/password`)
      .set(adminHeaders())
      .send({ password: 'short1' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('code', 'BAD_REQUEST');
  });

  it('rejects a password without a digit with 400', async () => {
    const res = await request
      .post(`/api/admin/usuarios/${usuarioId}/password`)
      .set(adminHeaders())
      .send({ password: 'onlyletters' });

    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown user id', async () => {
    const fakeId = '00000000-0000-4000-a000-0000000000ff';
    const res = await request
      .post(`/api/admin/usuarios/${fakeId}/password`)
      .set(adminHeaders())
      .send({ password: `Works-${uniqueSuffix}-Cc3$` });

    expect(res.status).toBe(404);
  });

  it('returns 401 without auth', async () => {
    const res = await request
      .post(`/api/admin/usuarios/${usuarioId}/password`)
      .send({ password: `Works-${uniqueSuffix}-Dd4%` });

    expect(res.status).toBe(401);
  });

  it('writes an auditoria entry on success', async () => {
    const newPassword = `Audited-${uniqueSuffix}-Ee5^`;

    const res = await request
      .post(`/api/admin/usuarios/${usuarioId}/password`)
      .set(adminHeaders())
      .send({ password: newPassword });

    expect(res.status).toBe(200);

    // Give the async auditoria write a moment to land.
    await new Promise((r) => setTimeout(r, 250));

    const { data: auditRows, error: auditErr } = await admin
      .from('auditoria_log')
      .select('accion, entidad, entidad_id, descripcion')
      .eq('entidad', 'usuario')
      .eq('entidad_id', usuarioId)
      .ilike('descripcion', '%restablecida%')
      .order('created_at', { ascending: false })
      .limit(1);

    expect(auditErr).toBeNull();
    expect(auditRows?.length).toBeGreaterThan(0);
    expect(auditRows?.[0]).toMatchObject({
      accion: 'editar',
      entidad: 'usuario',
      entidad_id: usuarioId,
    });
  });
});

describe('POST /api/admin/usuarios/:id/send-password-reset', () => {
  it('returns ok when the user is active and linked', async () => {
    const res = await request
      .post(`/api/admin/usuarios/${usuarioId}/send-password-reset`)
      .set(adminHeaders());

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, email: testEmail });
  });

  it('returns 404 for an unknown user id', async () => {
    const fakeId = '00000000-0000-4000-a000-0000000000fe';
    const res = await request
      .post(`/api/admin/usuarios/${fakeId}/send-password-reset`)
      .set(adminHeaders());

    expect(res.status).toBe(404);
  });

  it('returns 401 without auth', async () => {
    const res = await request.post(`/api/admin/usuarios/${usuarioId}/send-password-reset`);

    expect(res.status).toBe(401);
  });
});
