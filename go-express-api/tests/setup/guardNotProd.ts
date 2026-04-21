import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(import.meta.dirname, '../../.env') });

const PRODUCTION_DB_HOSTS = new Set([
  'db.oxyvhexsgppnkgcnqpkl.supabase.co',
  'oxyvhexsgppnkgcnqpkl.supabase.co',
]);

const PRODUCTION_SUPABASE_HOSTS = new Set([
  'oxyvhexsgppnkgcnqpkl.supabase.co',
]);

function extractHost(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.split(':')[0] ?? null;
  } catch {
    return null;
  }
}

const testDatabaseUrl = process.env['TEST_DATABASE_URL'];
const testSupabaseUrl = process.env['TEST_SUPABASE_URL'];

if (testDatabaseUrl) {
  process.env['DATABASE_URL'] = testDatabaseUrl;
}
if (testSupabaseUrl) {
  process.env['SUPABASE_URL'] = testSupabaseUrl;
}

const databaseHost = extractHost(process.env['DATABASE_URL']);
const supabaseHost = extractHost(process.env['SUPABASE_URL']);

const pointsToProdDatabase =
  (databaseHost !== null && PRODUCTION_DB_HOSTS.has(databaseHost)) ||
  (supabaseHost !== null && PRODUCTION_SUPABASE_HOSTS.has(supabaseHost));

const runningInsideDeployedProd = process.env['RAILWAY_ENVIRONMENT'] === 'production';

if (pointsToProdDatabase && !runningInsideDeployedProd) {
  console.error(
    [
      '',
      'FATAL: tests cannot run against production DB.',
      '',
      `  DATABASE_URL host: ${databaseHost ?? '(unset)'}`,
      `  SUPABASE_URL host: ${supabaseHost ?? '(unset)'}`,
      '',
      'Set TEST_DATABASE_URL (and TEST_SUPABASE_URL for Supabase-backed tests) to a non-production',
      'database before running the suite. The pre-test guard should have caught this; if you see',
      'this message the guard was bypassed.',
      '',
    ].join('\n')
  );
  process.exit(1);
}
