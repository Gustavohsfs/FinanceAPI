import { Injectable } from '@nestjs/common';

import type { Recurrence } from '../../generated/prisma/client.js';
import { notFound } from '../../common/errors/domain.error.js';
import { AccountsRepository } from '../accounts/accounts.repository.js';
import { CategoriesRepository } from '../categories/categories.repository.js';
import { CreditCardsRepository } from '../credit-cards/credit-cards.repository.js';
import type { TransactionResponse } from '../transactions/transactions.schemas.js';
import type { CreateRecurrenceDto, RecurrenceResponse } from './recurrences.schemas.js';
import { RecurrencesRepository } from './recurrences.repository.js';

function toResponse(recurrence: Recurrence): RecurrenceResponse {
  return {
    id: recurrence.id,
    userId: recurrence.userId,
    type: recurrence.type as 'INCOME' | 'EXPENSE',
    amountCents: recurrence.amountCents,
    description: recurrence.description,
    categoryId: recurrence.categoryId,
    accountId: recurrence.accountId,
    creditCardId: recurrence.creditCardId,
    paymentMethod: recurrence.paymentMethod,
    frequency: recurrence.frequency,
    dayOfMonth: recurrence.dayOfMonth,
    nextOccurrenceAt: recurrence.nextOccurrenceAt.toISOString(),
    isActive: recurrence.isActive,
    currency: recurrence.currency,
    notes: recurrence.notes,
    createdAt: recurrence.createdAt.toISOString(),
    updatedAt: recurrence.updatedAt.toISOString(),
  };
}

@Injectable()
export class RecurrencesService {
  constructor(
    private readonly repository: RecurrencesRepository,
    private readonly accounts: AccountsRepository,
    private readonly categories: CategoriesRepository,
    private readonly creditCards: CreditCardsRepository,
  ) {}

  async list(userId: string): Promise<RecurrenceResponse[]> {
    return (await this.repository.list(userId)).map(toResponse);
  }

  async create(userId: string, input: CreateRecurrenceDto): Promise<RecurrenceResponse> {
    if (!(await this.accounts.exists(userId, input.accountId))) throw notFound('Conta');
    if (input.categoryId && !(await this.categories.findById(userId, input.categoryId))) {
      throw notFound('Categoria');
    }
    if (input.creditCardId && !(await this.creditCards.findById(userId, input.creditCardId))) {
      throw notFound('Cartão');
    }
    return toResponse(await this.repository.create(userId, input));
  }

  confirm(userId: string, id: string): Promise<TransactionResponse> {
    return this.repository.confirm(userId, id);
  }
}
