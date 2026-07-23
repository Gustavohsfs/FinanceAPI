import { Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/prisma/client.js';

export function readinessFromQuery(rows: readonly { ready: number }[]): boolean {
  return rows.length === 1 && rows[0]?.ready === 1;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnApplicationShutdown {
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is required');
    }
    super({
      adapter: new PrismaPg({
        connectionString,
        max: 10,
        idleTimeoutMillis: 30_000,
      }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
  }

  async isReady(): Promise<boolean> {
    const rows = await this.$queryRaw<readonly { ready: number }[]>`SELECT 1 AS ready`;
    return readinessFromQuery(rows);
  }
}
