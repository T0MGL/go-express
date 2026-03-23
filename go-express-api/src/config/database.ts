import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.js';
import { logger } from './logger.js';

/**
 * Supabase client using service_role key, bypasses RLS.
 * Use for all data queries on the server. Never expose this client or its key to the browser.
 */
export const supabase: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

/**
 * Separate Supabase client using the anon key, used exclusively for auth operations
 * (signInWithPassword, refreshSession). This prevents signInWithPassword from polluting
 * the service_role client's internal auth state, which would cause subsequent data queries
 * to run as the authenticated user instead of service_role (breaking RLS).
 */
export const supabaseAuth: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

/**
 * Test the database connection by running a lightweight query.
 * Returns `true` if the connection is healthy, `false` otherwise.
 */
export async function testConnection(): Promise<boolean> {
  try {
    const { error } = await supabase.from('configuracion').select('key').limit(1);

    if (error) {
      // If table doesn't exist yet, that's okay during initial setup
      if (error.code === '42P01' || error.message.includes('does not exist')) {
        logger.warn('Database tables not yet created — connection is healthy but schema is missing');
        return true;
      }
      logger.error({ error }, 'Database connection test failed');
      return false;
    }

    logger.info('Database connection verified');
    return true;
  } catch (err) {
    logger.error({ err }, 'Database connection test threw an exception');
    return false;
  }
}
