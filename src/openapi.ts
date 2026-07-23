import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';

import { AppModule } from './app.module.js';

const swaggerConfig = new DocumentBuilder()
  .setTitle('Fluxo API')
  .setDescription('API financeira autoritativa para os clientes Fluxo.')
  .setVersion('1.0.0')
  .addBearerAuth()
  .build();

export function buildOpenApiDocument(app: NestFastifyApplication): OpenAPIObject {
  return cleanupOpenApiDoc(SwaggerModule.createDocument(app, swaggerConfig));
}

export function setupSwagger(app: NestFastifyApplication): void {
  SwaggerModule.setup('docs', app, buildOpenApiDocument(app), {
    jsonDocumentUrl: 'docs/openapi.json',
  });
}

export async function createOpenApiDocument(): Promise<OpenAPIObject> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: false,
  });
  await app.init();
  try {
    return buildOpenApiDocument(app);
  } finally {
    await app.close();
  }
}
