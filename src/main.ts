import helmet from '@fastify/helmet';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';
import { validateEnvironment } from './config/env.schema.js';

export async function bootstrap(): Promise<NestFastifyApplication> {
  const env = validateEnvironment(process.env);
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));
  await app.register(helmet);
  app.enableCors({
    origin: env.CORS_ORIGINS.split(',').map((origin) => origin.trim()),
    credentials: true,
  });
  app.enableShutdownHooks();
  await app.listen(env.PORT, '0.0.0.0');
  return app;
}

if (process.env.NODE_ENV !== 'test') {
  void bootstrap();
}
