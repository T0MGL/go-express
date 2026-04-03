import { z } from 'zod';

const envSchema = z.object({
  // Supabase
  SUPABASE_URL: z
    .string()
    .min(1, 'SUPABASE_URL is required')
    .url('SUPABASE_URL must be a valid URL'),
  SUPABASE_ANON_KEY: z
    .string()
    .min(1, 'SUPABASE_ANON_KEY is required'),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
  DATABASE_URL: z.string().optional().default(''),

  // Auth (Supabase Auth)
  JWT_SECRET: z.string().min(32, 'JWT_SECRET is required (min 32 chars)'),
  SUPABASE_JWT_SECRET: z.string().min(32, 'SUPABASE_JWT_SECRET is required (min 32 chars)'),

  // Admin API token (fallback for non-Supabase auth, e.g. CI/CD or external integrations)
  ADMIN_API_TOKEN: z.string().optional().default(''),

  // Email
  RESEND_API_KEY: z.string().optional().default(''),
  EMAIL_FROM: z.string().email('EMAIL_FROM must be a valid email').default('envios@goexpressparaguay.com'),

  // App
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  CORS_ORIGINS: z.string().min(1, 'CORS_ORIGINS is required').default('http://localhost:8080'),
  API_RATE_LIMIT: z.coerce.number().int().positive().default(100),

  // Tracking
  TRACKING_PREFIX: z.string().min(1).max(5).default('GE'),
  TRACKING_YEAR: z.coerce.number().int().min(2024).max(2100).default(2026),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.issues.map(
      (issue) => `  - ${issue.path.join('.')}: ${issue.message}`
    );
    console.error('Environment variable validation failed:');
    console.error(formatted.join('\n'));
    process.exit(1);
  }

  return result.data;
}

export const env = validateEnv();
