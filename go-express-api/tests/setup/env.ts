import { config } from 'dotenv';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

config({ path: resolve(import.meta.dirname, '../../.env') });

process.env['NODE_ENV'] = 'test';
process.env['CORS_ORIGINS'] = 'http://localhost:3000,http://localhost:8080';

// The shared dev Supabase instance can drift between CI runs. Every admin
// mutation path in the service layer validates that req.userId exists in
// usuarios, so ensure the seed admin is always there before any test runs.
const ADMIN_USER_ID = '00000000-0000-4000-a000-000000000001';

const supabaseUrl = process.env['SUPABASE_URL'];
const serviceRoleKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];

if (supabaseUrl && serviceRoleKey) {
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await admin.from('usuarios').upsert(
    {
      id: ADMIN_USER_ID,
      nombre: 'Admin GoExpress',
      email: 'admin@goexpress.com.py',
      rol: 'admin',
      estado: 'activo',
    },
    { onConflict: 'id', ignoreDuplicates: false }
  );

  if (error) {
    throw new Error(`Test setup: failed to ensure admin user: ${error.message}`);
  }
}
