import { describe, it, expect, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { request, adminHeaders } from '../setup/test-client.js';

const supabase = createClient(
  process.env['SUPABASE_URL']!,
  process.env['SUPABASE_SERVICE_ROLE_KEY']!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const POD_BUCKET = 'pod-entregas';
const TEST_PREFIX = `aaaaaaaa-aaaa-aaaa-aaaa-${Date.now().toString().padStart(12, '0')}`;
const FRESH_PATH = `${TEST_PREFIX}/pod_fresh.webp`;
const STALE_PATH = `${TEST_PREFIX}/pod_stale.webp`;

const TINY_WEBP = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00,
  0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c,
  0x0d, 0x00, 0x00, 0x00, 0x2f, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00,
]);

async function uploadObject(path: string): Promise<void> {
  const { error } = await supabase.storage
    .from(POD_BUCKET)
    .upload(path, TINY_WEBP, {
      contentType: 'image/webp',
      upsert: true,
    });
  if (error) throw new Error(`upload ${path} failed: ${error.message}`);
}

async function objectExists(path: string): Promise<boolean> {
  const { data, error } = await supabase
    .schema('storage')
    .from('objects')
    .select('id')
    .eq('bucket_id', POD_BUCKET)
    .eq('name', path)
    .maybeSingle();
  if (error) throw new Error(`objects lookup failed: ${error.message}`);
  return !!data;
}

async function backdateObject(path: string, daysAgo: number): Promise<void> {
  const cutoff = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase
    .schema('storage')
    .from('objects')
    .update({ created_at: cutoff })
    .eq('bucket_id', POD_BUCKET)
    .eq('name', path);
  if (error) throw new Error(`backdate ${path} failed: ${error.message}`);
}

afterAll(async () => {
  await supabase.storage.from(POD_BUCKET).remove([FRESH_PATH, STALE_PATH]);
});

describe('POST /api/admin/maintenance/pod-cleanup/run', () => {
  it('removes objects older than 30 days and keeps fresh ones', async () => {
    await uploadObject(FRESH_PATH);
    await uploadObject(STALE_PATH);
    await backdateObject(STALE_PATH, 31);

    expect(await objectExists(FRESH_PATH)).toBe(true);
    expect(await objectExists(STALE_PATH)).toBe(true);

    const res = await request
      .post('/api/admin/maintenance/pod-cleanup/run')
      .set(adminHeaders());

    expect(res.status).toBe(200);
    expect(res.body.skipped).toBe(false);
    expect(res.body.scanned).toBeGreaterThanOrEqual(1);
    expect(res.body.deletedFromStorage).toBeGreaterThanOrEqual(1);

    expect(await objectExists(STALE_PATH)).toBe(false);
    expect(await objectExists(FRESH_PATH)).toBe(true);
  }, 60_000);

  it('returns last result via GET pod-cleanup/last after a run', async () => {
    const res = await request
      .get('/api/admin/maintenance/pod-cleanup/last')
      .set(adminHeaders());

    expect(res.status).toBe(200);
    expect(res.body.lastResult).toBeTruthy();
    expect(res.body.lastResult).toHaveProperty('finishedAt');
    expect(res.body.lastResult).toHaveProperty('cutoffISO');
  });

  it('rejects non-admin requests with 401', async () => {
    const res = await request.post('/api/admin/maintenance/pod-cleanup/run');
    expect(res.status).toBe(401);
  });
});
