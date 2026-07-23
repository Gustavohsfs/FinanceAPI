import { Module } from '@nestjs/common';

import { PrismaModule } from '../../database/prisma.module.js';
import { HealthController } from './health.controller.js';
import { HealthRepository } from './health.repository.js';

@Module({
  imports: [PrismaModule],
  controllers: [HealthController],
  providers: [HealthRepository],
})
export class HealthModule {}
