import { Module } from '@nestjs/common';

import { AccountsController } from './accounts.controller.js';
import { AccountsRepository } from './accounts.repository.js';
import { AccountsService } from './accounts.service.js';

@Module({
  controllers: [AccountsController],
  providers: [AccountsRepository, AccountsService],
  exports: [AccountsRepository],
})
export class AccountsModule {}
