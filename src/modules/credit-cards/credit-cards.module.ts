import { Module } from '@nestjs/common';

import { AccountsModule } from '../accounts/accounts.module.js';
import { CreditCardsController } from './credit-cards.controller.js';
import { CreditCardsRepository } from './credit-cards.repository.js';
import { CreditCardsService } from './credit-cards.service.js';

@Module({
  imports: [AccountsModule],
  controllers: [CreditCardsController],
  providers: [CreditCardsRepository, CreditCardsService],
  exports: [CreditCardsRepository],
})
export class CreditCardsModule {}
