const env = {
  apiUrl: import.meta.env.VITE_API_URL || '/api',
  appEnv: (import.meta.env.VITE_APP_ENV || 'production') as 'development' | 'staging' | 'production',
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  siteUrl: import.meta.env.VITE_SITE_URL || 'https://goexpressparaguay.com',
  isDev: import.meta.env.DEV,
  isProd: import.meta.env.PROD,
} as const;

export default env;
