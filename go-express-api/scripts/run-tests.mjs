#!/usr/bin/env node
import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, '../.env') });

const PRODUCTION_DB_HOSTS = new Set([
  'db.oxyvhexsgppnkgcnqpkl.supabase.co',
  'oxyvhexsgppnkgcnqpkl.supabase.co',
]);

const PRODUCTION_SUPABASE_HOSTS = new Set([
  'oxyvhexsgppnkgcnqpkl.supabase.co',
]);

function extractHost(url) {
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
// Las keys del stack local acompanan a la URL local: mezclar SUPABASE_URL de test con la
// service key de prod deja el harness apuntando a un GoTrue que rechaza todo.
if (process.env['TEST_SUPABASE_SERVICE_ROLE_KEY']) {
  process.env['SUPABASE_SERVICE_ROLE_KEY'] = process.env['TEST_SUPABASE_SERVICE_ROLE_KEY'];
}
if (process.env['TEST_SUPABASE_ANON_KEY']) {
  process.env['SUPABASE_ANON_KEY'] = process.env['TEST_SUPABASE_ANON_KEY'];
}

const databaseHost = extractHost(process.env['DATABASE_URL']);
const supabaseHost = extractHost(process.env['SUPABASE_URL']);

const pointsToProdDatabase =
  (databaseHost !== null && PRODUCTION_DB_HOSTS.has(databaseHost)) ||
  (supabaseHost !== null && PRODUCTION_SUPABASE_HOSTS.has(supabaseHost));

const runningInsideDeployedProd = process.env['RAILWAY_ENVIRONMENT'] === 'production';
const hasTestDbOverride = Boolean(testDatabaseUrl);

if (!hasTestDbOverride && pointsToProdDatabase && !runningInsideDeployedProd) {
  console.log(
    [
      '',
      'Tests skipped: no TEST_DATABASE_URL set and DATABASE_URL points to production.',
      'Set TEST_DATABASE_URL (and TEST_SUPABASE_URL when applicable) to enable DB tests.',
      '',
      `  DATABASE_URL host: ${databaseHost ?? '(unset)'}`,
      `  SUPABASE_URL host: ${supabaseHost ?? '(unset)'}`,
      '',
    ].join('\n')
  );
  process.exit(0);
}

const args = process.argv.slice(2);
const vitestArgs = args.length > 0 ? args : ['run'];
const child = spawn('vitest', vitestArgs, {
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
