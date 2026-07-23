import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { canonicalRequestHash } from '../../common/crypto/request-hash.js';
import { DomainError, notFound } from '../../common/errors/domain.error.js';
import { calculateSettlementDate } from '../../shared/date/credit-card-settlement.js';
import { AccountsRepository } from '../accounts/accounts.repository.js';
import { CategoriesRepository } from '../categories/categories.repository.js';
import { CreditCardsRepository } from '../credit-cards/credit-cards.repository.js';
import { buildTransactions } from './domain/build-transactions.js';
import type {
  CreateTransactionDto,
  TransactionResponse,
  TransactionsPage,
  TransactionsQueryDto,
  UpdateTransactionDto,
} from './transactions.schemas.js';
import { TransactionsRepository } from './transactions.repository.js';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly repository: TransactionsRepository,
    private readonly accounts: AccountsRepository,
    private readonly categories: CategoriesRepository,
    private readonly creditCards: CreditCardsRepository,
  ) {}

  async create(
    userId: string,
    input: CreateTransactionDto,
    idempotencyKey: string | undefined,
  ): Promise<TransactionResponse[]> {
    const keyResult = z.uuid().safeParse(idempotencyKey);
    if (!keyResult.success) {
      throw new DomainError(
        'IDEMPOTENCY_KEY_REQUIRED',
        400,
        'Chave de idempotência obrigatória',
        'Envie um UUID válido no header Idempotency-Key.',
      );
    }
    await this.ensureRelations(userId, input.accountId, input.categoryId, input.creditCardId);
    const card = input.creditCardId
      ? await this.creditCards.findById(userId, input.creditCardId)
      : null;
    const now = new Date();
    const rows = buildTransactions(input, {
      userId,
      now,
      newId: randomUUID,
      settledAtFor: (occurredAt) =>
        card ? calculateSettlementDate(occurredAt, card.closingDay, card.dueDay) : null,
    });
    return this.repository.createIdempotent(
      userId,
      keyResult.data,
      canonicalRequestHash(input),
      rows,
    );
  }

  list(userId: string, query: TransactionsQueryDto): Promise<TransactionsPage> {
    return this.repository.list(userId, query);
  }

  async get(userId: string, id: string): Promise<TransactionResponse> {
    const transaction = await this.repository.findById(userId, id);
    if (!transaction) throw notFound('Transação');
    return {
      id: transaction.id,
      userId: transaction.userId,
      type: transaction.type,
      amountCents: transaction.amountCents,
      description: transaction.description,
      occurredAt: transaction.occurredAt.toISOString(),
      settledAt: transaction.settledAt?.toISOString() ?? null,
      categoryId: transaction.categoryId,
      accountId: transaction.accountId,
      creditCardId: transaction.creditCardId,
      paymentMethod: transaction.paymentMethod,
      installmentGroupId: transaction.installmentGroupId,
      installmentNumber: transaction.installmentNumber,
      installmentTotal: transaction.installmentTotal,
      isProjected: transaction.isProjected,
      recurrenceId: transaction.recurrenceId,
      currency: transaction.currency,
      notes: transaction.notes,
      source: transaction.source,
      createdAt: transaction.createdAt.toISOString(),
      updatedAt: transaction.updatedAt.toISOString(),
      deletedAt: null,
    };
  }

  async update(
    userId: string,
    id: string,
    scope: 'one' | 'future' | 'all',
    input: UpdateTransactionDto,
  ): Promise<TransactionResponse[]> {
    await this.ensureRelations(userId, input.accountId, input.categoryId, input.creditCardId);
    return this.repository.updateScoped(userId, id, scope, input);
  }

  delete(userId: string, id: string, scope: 'one' | 'future' | 'all'): Promise<void> {
    return this.repository.softDeleteScoped(userId, id, scope);
  }

  private async ensureRelations(
    userId: string,
    accountId: string | undefined,
    categoryId: string | null | undefined,
    creditCardId: string | null | undefined,
  ): Promise<void> {
    if (accountId && !(await this.accounts.exists(userId, accountId))) throw notFound('Conta');
    if (categoryId && !(await this.categories.findById(userId, categoryId))) {
      throw notFound('Categoria');
    }
    if (creditCardId && !(await this.creditCards.findById(userId, creditCardId))) {
      throw notFound('Cartão');
    }
  }
}
