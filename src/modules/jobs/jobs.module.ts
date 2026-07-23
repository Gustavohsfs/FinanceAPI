import { Module } from '@nestjs/common';

import { RecurrencesModule } from '../recurrences/recurrences.module.js';
import { JobsRepository } from './jobs.repository.js';
import { JobsService } from './jobs.service.js';

@Module({
  imports: [RecurrencesModule],
  providers: [JobsRepository, JobsService],
  exports: [JobsService],
})
export class JobsModule {}
