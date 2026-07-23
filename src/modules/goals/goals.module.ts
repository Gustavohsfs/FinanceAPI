import { Module } from '@nestjs/common';

import { CategoriesModule } from '../categories/categories.module.js';
import { GoalsController } from './goals.controller.js';
import { GoalsRepository } from './goals.repository.js';
import { GoalsService } from './goals.service.js';

@Module({
  imports: [CategoriesModule],
  controllers: [GoalsController],
  providers: [GoalsRepository, GoalsService],
})
export class GoalsModule {}
