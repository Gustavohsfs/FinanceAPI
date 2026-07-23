import { Module } from '@nestjs/common';

import { InsightsController } from './insights.controller.js';
import { InsightsRepository } from './insights.repository.js';
import { InsightsService } from './insights.service.js';

@Module({
  controllers: [InsightsController],
  providers: [InsightsRepository, InsightsService],
})
export class InsightsModule {}
