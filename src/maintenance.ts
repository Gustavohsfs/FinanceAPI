import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';
import { JobsService } from './modules/jobs/jobs.service.js';

export type MaintenanceApplicationFactory = () => Promise<INestApplicationContext>;

async function createMaintenanceApplication(): Promise<INestApplicationContext> {
  return NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
}

export async function runMaintenance(
  createApplication: MaintenanceApplicationFactory = createMaintenanceApplication,
): Promise<void> {
  const app = await createApplication();
  app.useLogger(app.get(Logger));
  try {
    await app.get(JobsService).runDailyMaintenance();
  } finally {
    await app.close();
  }
}

if (process.env.NODE_ENV !== 'test') {
  void runMaintenance().catch(() => {
    process.stderr.write('Maintenance job failed.\n');
    process.exitCode = 1;
  });
}
