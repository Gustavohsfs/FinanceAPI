import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import type { CreateAccountDto } from './accounts.schemas.js';

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
}
