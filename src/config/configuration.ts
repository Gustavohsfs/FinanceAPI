import type { Env } from './env.schema.js';

export interface AppConfiguration {
  readonly nodeEnv: Env['NODE_ENV'];
  readonly port: number;
  readonly databaseUrl: string;
  readonly directUrl: string;
  readonly jwtSecretCurrent: string;
  readonly jwtSecretPrevious?: string;
  readonly refreshTokenPepper: string;
  readonly corsOrigins: readonly string[];
}

export function configuration(): AppConfiguration {
  const env = process.env as unknown as Env;
  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    directUrl: env.DIRECT_URL,
    jwtSecretCurrent: env.JWT_SECRET_CURRENT,
    ...(env.JWT_SECRET_PREVIOUS ? { jwtSecretPrevious: env.JWT_SECRET_PREVIOUS } : {}),
    refreshTokenPepper: env.REFRESH_TOKEN_PEPPER,
    corsOrigins: env.CORS_ORIGINS.split(',').map((origin) => origin.trim()),
  };
}
