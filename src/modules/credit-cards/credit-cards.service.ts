import { Injectable } from '@nestjs/common';

import { DomainError, notFound } from '../../common/errors/domain.error.js';
import type { CreditCard } from '../../generated/prisma/client.js';
import { calculateSettlementDate } from '../../shared/date/credit-card-settlement.js';
import { AccountsRepository } from '../accounts/accounts.repository.js';
import type {
  CreateCreditCardDto,
  CreditCardResponse,
  InvoiceResponse,
  UpdateCreditCardDto,
} from './credit-cards.schemas.js';
import { CreditCardsRepository } from './credit-cards.repository.js';

function toResponse(card: CreditCard): CreditCardResponse {
  return {
    id: card.id,
    userId: card.userId,
    accountId: card.accountId,
    name: card.name,
    limitCents: card.limitCents,
    closingDay: card.closingDay,
    dueDay: card.dueDay,
    createdAt: card.createdAt.toISOString(),
    updatedAt: card.updatedAt.toISOString(),
  };
}

@Injectable()
export class CreditCardsService {
  constructor(
    private readonly repository: CreditCardsRepository,
    private readonly accounts: AccountsRepository,
  ) {}

  async list(userId: string): Promise<CreditCardResponse[]> {
    return (await this.repository.list(userId)).map(toResponse);
  }

  async create(userId: string, input: CreateCreditCardDto): Promise<CreditCardResponse> {
    if (!(await this.accounts.exists(userId, input.accountId))) throw notFound('Conta');
    return toResponse(await this.repository.create(userId, input));
  }

  async update(
    userId: string,
    id: string,
    input: UpdateCreditCardDto,
  ): Promise<CreditCardResponse> {
    const updated = await this.repository.updateWithSettlements(
      userId,
      id,
      input,
      (occurredAt, closingDay, dueDay) =>
        new Date(calculateSettlementDate(occurredAt.toISOString(), closingDay, dueDay)),
    );
    if (!updated) throw notFound('Cartão');
    return toResponse(updated);
  }

  async delete(userId: string, id: string): Promise<void> {
    const facts = await this.repository.softDeleteGuarded(userId, id);
    switch (facts.status) {
      case 'deleted':
        return;
      case 'not-found':
        throw notFound('Cartão');
      case 'has-active-recurrences':
        throw new DomainError(
          'CREDIT_CARD_HAS_ACTIVE_RECURRENCES',
          409,
          'Cartão com recorrências ativas',
          'Exclua ou desative as recorrências vinculadas antes de excluir este cartão.',
        );
    }
  }

  async invoice(userId: string, id: string, month: string): Promise<InvoiceResponse> {
    const card = await this.repository.findById(userId, id);
    if (!card) throw notFound('Cartão');
    const now = new Date();
    const currentMonth = now.toLocaleDateString('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
    });
    return {
      creditCardId: card.id,
      month,
      totalCents: await this.repository.invoiceTotal(userId, id, month),
      status: month < currentMonth ? 'CLOSED' : 'OPEN',
    };
  }
}
