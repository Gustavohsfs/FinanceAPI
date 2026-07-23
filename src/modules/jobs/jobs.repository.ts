import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';

@Injectable()
export class JobsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async withLock(name: string, work: () => Promise<void>, ttlMinutes = 30): Promise<boolean> {
    const owner = randomUUID();
    const acquired = await this.prisma.$queryRaw<readonly { name: string }[]>(Prisma.sql`
      INSERT INTO job_locks (name, locked_by, locked_until, created_at, updated_at)
      VALUES (
        ${name},
        ${owner},
        now() + (${ttlMinutes} * INTERVAL '1 minute'),
        now(),
        now()
      )
      ON CONFLICT (name) DO UPDATE
      SET
        locked_by = EXCLUDED.locked_by,
        locked_until = EXCLUDED.locked_until,
        updated_at = now()
      WHERE job_locks.locked_until < now()
      RETURNING name
    `);
    if (acquired.length !== 1) return false;
    try {
      await work();
      return true;
    } finally {
      await this.prisma.jobLock.updateMany({
        where: { name, lockedBy: owner },
        data: { lockedUntil: new Date() },
      });
    }
  }

  async recalculateCreditSettlements(): Promise<void> {
    await this.prisma.$executeRaw(Prisma.sql`
      WITH invoice_dates AS (
        SELECT
          t.id,
          (
            (
              date_trunc('month', t.occurred_at AT TIME ZONE 'America/Sao_Paulo')
              + CASE
                  WHEN extract(day FROM t.occurred_at AT TIME ZONE 'America/Sao_Paulo')
                    > c.closing_day
                  THEN INTERVAL '1 month'
                  ELSE INTERVAL '0 month'
                END
              + CASE
                  WHEN c.due_day <= c.closing_day
                  THEN INTERVAL '1 month'
                  ELSE INTERVAL '0 month'
                END
            )::date
            + (
                LEAST(
                  c.due_day,
                  extract(day FROM (
                    date_trunc('month', t.occurred_at AT TIME ZONE 'America/Sao_Paulo')
                    + INTERVAL '2 month - 1 day'
                  ))::int
                ) - 1
              ) * INTERVAL '1 day'
          ) AT TIME ZONE 'America/Sao_Paulo' AS settled_at
        FROM transactions t
        JOIN credit_cards c
          ON c.id = t.credit_card_id
          AND c.user_id = t.user_id
          AND c.deleted_at IS NULL
        WHERE t.deleted_at IS NULL
          AND t.payment_method = 'CREDIT'
      )
      UPDATE transactions t
      SET settled_at = i.settled_at, updated_at = now()
      FROM invoice_dates i
      WHERE t.id = i.id
        AND t.settled_at IS DISTINCT FROM i.settled_at
    `);
  }

  async evaluateOverBudgetCount(): Promise<number> {
    const rows = await this.prisma.$queryRaw<readonly { count: number }[]>(Prisma.sql`
      SELECT COUNT(*)::int AS count
      FROM (
        SELECT c.id
        FROM categories c
        JOIN transactions t
          ON t.category_id = c.id
          AND t.user_id = c.user_id
          AND t.type = 'EXPENSE'
          AND t.deleted_at IS NULL
          AND date_trunc('month', t.occurred_at AT TIME ZONE 'America/Sao_Paulo')
            = date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')
        WHERE c.deleted_at IS NULL
          AND c.monthly_budget_cents > 0
        GROUP BY c.id, c.monthly_budget_cents
        HAVING SUM(t.amount_cents) > c.monthly_budget_cents
      ) over_budget
    `);
    return rows[0]?.count ?? 0;
  }

  async cleanupExpired(): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
      this.prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
      this.prisma.idempotencyKey.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
    ]);
  }
}
