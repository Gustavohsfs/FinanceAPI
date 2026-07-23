import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class HealthRepository {
  constructor(private readonly prisma: PrismaService) {}

  isReady(): Promise<boolean> {
    return this.prisma.isReady();
  }
}
