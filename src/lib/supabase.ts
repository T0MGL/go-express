import { createClient } from '@supabase/supabase-js';
import env from './env';

const url = env.supabaseUrl || 'https://placeholder.supabase.co';
const key = env.supabaseAnonKey || 'placeholder';

export const supabase = createClient(url, key, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
