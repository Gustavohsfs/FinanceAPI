import { Module } from '@nestjs/common';

import { AccountsModule } from '../accounts/accounts.module.js';
import { CategoriesModule } from '../categories/categories.module.js';
import { CreditCardsModule } from '../credit-cards/credit-cards.module.js';
import { RecurrencesController } from './recurrences.controller.js';
import { RecurrencesRepository } from './recurrences.repository.js';
import { RecurrencesService } from './recurrences.service.js';

@Module({
  imports: [AccountsModule, CategoriesModule, CreditCardsModule],
  controllers: [RecurrencesController],
  providers: [RecurrencesRepository, RecurrencesService],
  exports: [RecurrencesRepository],
})
export class RecurrencesModule {}
