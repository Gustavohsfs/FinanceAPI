import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type {
  BalancePoint,
  BudgetStatus,
  CategoryInsight,
  MonthlyComparison,
} from './insights.schemas.js';
import { toSafeInteger } from './sql-number.js';

type Basis = 'accrual' | 'cash';

function basisExpression(basis: Basis): Prisma.Sql {
  return basis === 'cash'
    ? Prisma.sql`COALESCE(t.settled_at, t.occurred_at)`
    : Prisma.sql`t.occurred_at`;
}

function monthBounds(month: string): { start: Date; end: Date } {
  const [yearText, monthText] = month.split('-');
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  return {
    start: new Date(Date.UTC(year, monthIndex, 1, 3)),
    end: new Date(Date.UTC(year, monthIndex + 1, 1, 3)),
  };
}

function previousBounds(month: string): { start: Date; end: Date } {
  const current = monthBounds(month);
  const date = current.start;
  return {
    start: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1, 3)),
    end: current.start,
  };
}

@Injectable()
export class InsightsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async summary(
    userId: string,
    month: string,
    basis: Basis,
  ): Promise<{
    incomeCents: number;
    expenseCents: number;
    previousIncomeCents: number;
    previousExpenseCents: number;
  }> {
    const current = monthBounds(month);
    const previous = previousBounds(month);
    const date = basisExpression(basis);
    const rows = await this.prisma.$queryRaw<
      readonly {
        income: unknown;
        expense: unknown;
        previousIncome: unknown;
        previousExpense: unknown;
      }[]
    >(Prisma.sql`
      SELECT
        COALESCE(SUM(t.amount_cents) FILTER (
          WHERE t.type = 'INCOME' AND ${date} >= ${current.start} AND ${date} < ${current.end}
        ), 0)::bigint AS income,
        COALESCE(SUM(t.amount_cents) FILTER (
          WHERE t.type = 'EXPENSE' AND ${date} >= ${current.start} AND ${date} < ${current.end}
        ), 0)::bigint AS expense,
        COALESCE(SUM(t.amount_cents) FILTER (
          WHERE t.type = 'INCOME' AND ${date} >= ${previous.start} AND ${date} < ${previous.end}
        ), 0)::bigint AS "previousIncome",
        COALESCE(SUM(t.amount_cents) FILTER (
          WHERE t.type = 'EXPENSE' AND ${date} >= ${previous.start} AND ${date} < ${previous.end}
        ), 0)::bigint AS "previousExpense"
      FROM transactions t
      WHERE t.user_id = ${userId}::uuid
        AND t.deleted_at IS NULL
        AND ${date} >= ${previous.start}
        AND ${date} < ${current.end}
    `);
    const row = rows[0] ?? { income: 0, expense: 0, previousIncome: 0, previousExpense: 0 };
    return {
      incomeCents: toSafeInteger(row.income),
      expenseCents: toSafeInteger(row.expense),
      previousIncomeCents: toSafeInteger(row.previousIncome),
      previousExpenseCents: toSafeInteger(row.previousExpense),
    };
  }

  async byCategory(
    userId: string,
    from: Date,
    to: Date,
    type: 'INCOME' | 'EXPENSE',
  ): Promise<CategoryInsight[]> {
    const rows = await this.prisma.$queryRaw<
      readonly {
        categoryId: string | null;
        categoryName: string | null;
        totalCents: unknown;
      }[]
    >(Prisma.sql`
      SELECT
        t.category_id AS "categoryId",
        c.name AS "categoryName",
        SUM(t.amount_cents)::bigint AS "totalCents"
      FROM transactions t
      LEFT JOIN categories c
        ON c.id = t.category_id AND c.user_id = t.user_id AND c.deleted_at IS NULL
      WHERE t.user_id = ${userId}::uuid
        AND t.deleted_at IS NULL
        AND t.type = ${type}::"TransactionType"
        AND t.occurred_at >= ${from}
        AND t.occurred_at <= ${to}
      GROUP BY t.category_id, c.name
      ORDER BY SUM(t.amount_cents) DESC, t.category_id
    `);
    return rows.map((row) => ({
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      totalCents: toSafeInteger(row.totalCents),
    }));
  }

  async balanceSeries(
    userId: string,
    from: Date,
    to: Date,
    basis: Basis,
  ): Promise<BalancePoint[]> {
    const date = basisExpression(basis);
    const rows = await this.prisma.$queryRaw<
      readonly { day: Date | string; cumulativeCents: unknown }[]
    >(Prisma.sql`
      WITH daily AS (
        SELECT
          date_trunc('day', ${date} AT TIME ZONE 'America/Sao_Paulo')::date AS day,
          SUM(
            CASE t.type
              WHEN 'INCOME' THEN t.amount_cents
              WHEN 'EXPENSE' THEN -t.amount_cents
              ELSE 0
            END
          )::bigint AS delta
        FROM transactions t
        WHERE t.user_id = ${userId}::uuid
          AND t.deleted_at IS NULL
          AND ${date} >= ${from}
          AND ${date} <= ${to}
        GROUP BY 1
      )
      SELECT
        day,
        SUM(delta) OVER (ORDER BY day ROWS UNBOUNDED PRECEDING)::bigint AS "cumulativeCents"
      FROM daily
      ORDER BY day
    `);
    return rows.map((row) => ({
      day: row.day instanceof Date ? row.day.toISOString().slice(0, 10) : row.day,
      cumulativeCents: toSafeInteger(row.cumulativeCents),
    }));
  }

  async monthlyComparison(userId: string, months: number): Promise<MonthlyComparison[]> {
    const rows = await this.prisma.$queryRaw<
      readonly { month: string; incomeCents: unknown; expenseCents: unknown }[]
    >(Prisma.sql`
      WITH requested_months AS (
        SELECT generate_series(
          date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')
            - ${months - 1} * INTERVAL '1 month',
          date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo'),
          INTERVAL '1 month'
        ) AS month_start
      ),
      totals AS (
        SELECT
          date_trunc('month', t.occurred_at AT TIME ZONE 'America/Sao_Paulo') AS month_start,
          SUM(t.amount_cents) FILTER (WHERE t.type = 'INCOME')::bigint AS income,
          SUM(t.amount_cents) FILTER (WHERE t.type = 'EXPENSE')::bigint AS expense
        FROM transactions t
        WHERE t.user_id = ${userId}::uuid AND t.deleted_at IS NULL
        GROUP BY 1
      )
      SELECT
        to_char(m.month_start, 'YYYY-MM') AS month,
        COALESCE(t.income, 0)::bigint AS "incomeCents",
        COALESCE(t.expense, 0)::bigint AS "expenseCents"
      FROM requested_months m
      LEFT JOIN totals t USING (month_start)
      ORDER BY m.month_start
    `);
    return rows.map((row) => ({
      month: row.month,
      incomeCents: toSafeInteger(row.incomeCents),
      expenseCents: toSafeInteger(row.expenseCents),
    }));
  }

  async budgetStatus(userId: string, month: string, basis: Basis): Promise<BudgetStatus[]> {
    const bounds = monthBounds(month);
    const date = basisExpression(basis);
    const rows = await this.prisma.$queryRaw<
      readonly {
        categoryId: string;
        categoryName: string;
        budgetCents: unknown;
        spentCents: unknown;
      }[]
    >(Prisma.sql`
      SELECT
        c.id AS "categoryId",
        c.name AS "categoryName",
        c.monthly_budget_cents::bigint AS "budgetCents",
        COALESCE(SUM(t.amount_cents), 0)::bigint AS "spentCents"
      FROM categories c
      LEFT JOIN transactions t
        ON t.category_id = c.id
        AND t.user_id = c.user_id
        AND t.type = 'EXPENSE'
        AND t.deleted_at IS NULL
        AND ${date} >= ${bounds.start}
        AND ${date} < ${bounds.end}
      WHERE c.user_id = ${userId}::uuid
        AND c.deleted_at IS NULL
        AND c.is_archived = false
        AND c.monthly_budget_cents > 0
      GROUP BY c.id, c.name, c.monthly_budget_cents
      ORDER BY c.name, c.id
    `);
    return rows.map((row) => {
      const budgetCents = toSafeInteger(row.budgetCents);
      const spentCents = toSafeInteger(row.spentCents);
      return {
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        budgetCents,
        spentCents,
        overCents: Math.max(0, spentCents - budgetCents),
        ratio: spentCents / budgetCents,
      };
    });
  }
}
