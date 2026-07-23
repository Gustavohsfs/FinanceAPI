import { Injectable } from '@nestjs/common';

import { notFound } from '../../common/errors/domain.error.js';
import type { CreditCard } from '../../generated/prisma/client.js';
import { AccountsRepository } from '../accounts/accounts.repository.js';
import type {
  CreateCreditCardDto,
  CreditCardResponse,
  InvoiceResponse,
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
