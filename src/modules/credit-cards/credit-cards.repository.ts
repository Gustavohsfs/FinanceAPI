import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { CreateCreditCardDto } from './credit-cards.schemas.js';

@Injectable()
export class CreditCardsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.creditCard.findMany({
      where: { userId, deletedAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  findById(userId: string, id: string) {
    return this.prisma.creditCard.findFirst({
      where: { id, userId, deletedAt: null },
    });
  }

  async create(userId: string, input: CreateCreditCardDto) {
    return this.prisma.$transaction(async (transaction) => {
      const card = await transaction.creditCard.create({
        data: {
          userId,
          accountId: input.accountId,
          name: input.name,
          limitCents: input.limitCents,
          closingDay: input.closingDay,
          dueDay: input.dueDay,
        },
      });
      await transaction.auditLog.create({
        data: {
          userId,
          entityType: 'credit_card',
          entityId: card.id,
          action: 'created',
          after: {
            accountId: input.accountId,
            name: input.name,
            limitCents: input.limitCents,
            closingDay: input.closingDay,
            dueDay: input.dueDay,
          },
        },
      });
      return card;
    });
  }

  async invoiceTotal(userId: string, creditCardId: string, month: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<readonly { totalCents: number }[]>(Prisma.sql`
      SELECT COALESCE(SUM(amount_cents), 0)::int AS "totalCents"
      FROM transactions
      WHERE user_id = ${userId}::uuid
        AND credit_card_id = ${creditCardId}::uuid
        AND type = 'EXPENSE'
        AND deleted_at IS NULL
        AND to_char(
          COALESCE(settled_at, occurred_at) AT TIME ZONE 'America/Sao_Paulo',
          'YYYY-MM'
        ) = ${month}
    `);
    return rows[0]?.totalCents ?? 0;
  }
}
