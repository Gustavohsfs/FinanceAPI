import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { CreateAccountDto, UpdateAccountDto } from './accounts.schemas.js';

export type AccountDeleteFacts =
  | { status: 'deleted' }
  | { status: 'not-found' }
  | { status: 'last-active' }
  | { status: 'has-active-cards' }
  | { status: 'has-active-recurrences' };

@Injectable()
export class AccountsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.account.findMany({
      where: { userId, deletedAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  create(userId: string, input: CreateAccountDto) {
    return this.prisma.account.create({
      data: {
        userId,
        name: input.name,
        kind: input.kind,
        openingBalanceCents: input.openingBalanceCents,
        currency: input.currency,
      },
    });
  }

  exists(userId: string, accountId: string): Promise<boolean> {
    return this.prisma.account
      .count({ where: { id: accountId, userId, deletedAt: null } })
      .then((count) => count === 1);
  }

  findById(userId: string, id: string) {
    return this.prisma.account.findFirst({ where: { id, userId, deletedAt: null } });
  }

  update(userId: string, id: string, input: UpdateAccountDto) {
    return this.prisma.account.update({
      where: { id, userId, deletedAt: null },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.kind !== undefined ? { kind: input.kind } : {}),
        ...(input.openingBalanceCents !== undefined
          ? { openingBalanceCents: input.openingBalanceCents }
          : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
      },
    });
  }

  async softDeleteGuarded(userId: string, id: string): Promise<AccountDeleteFacts> {
    return this.prisma.$transaction(
      async (database) => {
        const target = await database.account.findFirst({
          where: { id, userId, deletedAt: null },
        });
        if (!target) return { status: 'not-found' };

        const [activeCount, activeCards, activeRecurrences] = await Promise.all([
          database.account.count({ where: { userId, deletedAt: null } }),
          database.creditCard.count({ where: { userId, accountId: id, deletedAt: null } }),
          database.recurrence.count({
            where: { userId, accountId: id, isActive: true, deletedAt: null },
          }),
        ]);

        if (activeCount === 1) return { status: 'last-active' };
        if (activeCards > 0) return { status: 'has-active-cards' };
        if (activeRecurrences > 0) return { status: 'has-active-recurrences' };

        await database.account.update({
          where: { id },
          data: { deletedAt: new Date() },
        });
        return { status: 'deleted' };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }
}
