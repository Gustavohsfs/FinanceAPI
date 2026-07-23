import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: z.url().startsWith('postgresql://'),
  DIRECT_URL: z.url().startsWith('postgresql://'),
  JWT_SECRET_CURRENT: z.string().min(32),
  JWT_SECRET_PREVIOUS: z.string().min(32).optional(),
  REFRESH_TOKEN_PEPPER: z.string().min(32),
  CORS_ORIGINS: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnvironment(raw: Record<string, unknown>): Env {
  return envSchema.parse(raw);
}
