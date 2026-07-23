import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { toSafeInteger } from '../insights/sql-number.js';
import type { CreateGoalDto, UpdateGoalDto } from './goals.schemas.js';

@Injectable()
export class GoalsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.goal.findMany({
      where: { userId, deletedAt: null },
      orderBy: [{ deadline: 'asc' }, { id: 'asc' }],
    });
  }

  findById(userId: string, id: string) {
    return this.prisma.goal.findFirst({ where: { id, userId, deletedAt: null } });
  }

  async create(userId: string, input: CreateGoalDto) {
    return this.prisma.$transaction(async (database) => {
      const goal = await database.goal.create({
        data: {
          userId,
          name: input.name,
          kind: input.kind,
          targetCents: input.targetCents,
          ...(input.categoryId ? { categoryId: input.categoryId } : {}),
          startDate: new Date(input.startDate),
          deadline: new Date(input.deadline),
          recurrence: input.recurrence,
        },
      });
      await database.auditLog.create({
        data: {
          userId,
          entityType: 'goal',
          entityId: goal.id,
          action: 'created',
          after: {
            name: input.name,
            kind: input.kind,
            targetCents: input.targetCents,
            categoryId: input.categoryId ?? null,
            startDate: input.startDate,
            deadline: input.deadline,
            recurrence: input.recurrence,
          },
        },
      });
      return goal;
    });
  }

  async update(userId: string, id: string, input: UpdateGoalDto) {
    return this.prisma.$transaction(async (database) => {
      const before = await database.goal.findFirst({
        where: { id, userId, deletedAt: null },
      });
      if (!before) return null;
      const after = await database.goal.update({
        where: { id, userId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.targetCents !== undefined ? { targetCents: input.targetCents } : {}),
          ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
          ...(input.startDate !== undefined ? { startDate: new Date(input.startDate) } : {}),
          ...(input.deadline !== undefined ? { deadline: new Date(input.deadline) } : {}),
          ...(input.recurrence !== undefined ? { recurrence: input.recurrence } : {}),
        },
      });
      await database.auditLog.create({
        data: {
          userId,
          entityType: 'goal',
          entityId: id,
          action: 'updated',
          before: {
            targetCents: before.targetCents,
            deadline: before.deadline.toISOString(),
          },
          after: {
            targetCents: after.targetCents,
            deadline: after.deadline.toISOString(),
          },
        },
      });
      return after;
    });
  }

  async effectuated(
    userId: string,
    goal: {
      kind: 'SAVING' | 'INVESTMENT' | 'SPEND_LIMIT';
      categoryId: string | null;
      startDate: Date;
    },
    basis: 'accrual' | 'cash',
  ): Promise<number> {
    const date =
      basis === 'cash'
        ? Prisma.sql`COALESCE(t.settled_at, t.occurred_at)`
        : Prisma.sql`t.occurred_at`;
    const rows = await this.prisma.$queryRaw<readonly { total: unknown }[]>(Prisma.sql`
      SELECT COALESCE(SUM(
        CASE
          WHEN ${goal.kind} = 'SPEND_LIMIT' AND t.type = 'EXPENSE' THEN t.amount_cents
          WHEN ${goal.kind} <> 'SPEND_LIMIT' AND t.type = 'INCOME' THEN t.amount_cents
          WHEN ${goal.kind} <> 'SPEND_LIMIT' AND t.type = 'EXPENSE' THEN -t.amount_cents
          ELSE 0
        END
      ), 0)::bigint AS total
      FROM transactions t
      WHERE t.user_id = ${userId}::uuid
        AND t.deleted_at IS NULL
        AND ${date} >= ${goal.startDate}
        AND (
          ${goal.kind} <> 'SPEND_LIMIT'
          OR (
            t.category_id = ${goal.categoryId}::uuid
            AND date_trunc('month', ${date} AT TIME ZONE 'America/Sao_Paulo')
              = date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')
          )
        )
    `);
    return Math.max(0, toSafeInteger(rows[0]?.total ?? 0));
  }
}
