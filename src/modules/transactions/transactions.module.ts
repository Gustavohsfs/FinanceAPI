import { Module } from '@nestjs/common';

import { AccountsModule } from '../accounts/accounts.module.js';
import { CategoriesModule } from '../categories/categories.module.js';
import { CreditCardsModule } from '../credit-cards/credit-cards.module.js';
import { TransactionsController } from './transactions.controller.js';
import { TransactionsRepository } from './transactions.repository.js';
import { TransactionsService } from './transactions.service.js';

@Module({
  imports: [AccountsModule, CategoriesModule, CreditCardsModule],
  controllers: [TransactionsController],
  providers: [TransactionsRepository, TransactionsService],
  exports: [TransactionsRepository],
})
export class TransactionsModule {}
