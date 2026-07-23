import { Injectable } from '@nestjs/common';

import type {
  BalancePoint,
  BudgetStatus,
  CategoryInsight,
  MonthlyComparison,
  SummaryResponse,
} from './insights.schemas.js';
import { InsightsRepository } from './insights.repository.js';

@Injectable()
export class InsightsService {
  constructor(private readonly repository: InsightsRepository) {}

  async summary(
    userId: string,
    month: string,
    basis: 'accrual' | 'cash',
  ): Promise<SummaryResponse> {
    const totals = await this.repository.summary(userId, month, basis);
    const balanceCents = totals.incomeCents - totals.expenseCents;
    const previousBalanceCents = totals.previousIncomeCents - totals.previousExpenseCents;
    return {
      month,
      basis,
      incomeCents: totals.incomeCents,
      expenseCents: totals.expenseCents,
      balanceCents,
      previousBalanceCents,
      deltaPercent:
        previousBalanceCents === 0
          ? null
          : Math.round(
              ((balanceCents - previousBalanceCents) / Math.abs(previousBalanceCents)) * 100,
            ),
    };
  }

  byCategory(
    userId: string,
    from: string,
    to: string,
    type: 'INCOME' | 'EXPENSE',
  ): Promise<CategoryInsight[]> {
    return this.repository.byCategory(userId, new Date(from), new Date(to), type);
  }

  balanceSeries(
    userId: string,
    from: string,
    to: string,
    basis: 'accrual' | 'cash',
  ): Promise<BalancePoint[]> {
    return this.repository.balanceSeries(userId, new Date(from), new Date(to), basis);
  }

  monthlyComparison(userId: string, months: number): Promise<MonthlyComparison[]> {
    return this.repository.monthlyComparison(userId, months);
  }

  budgetStatus(
    userId: string,
    month: string,
    basis: 'accrual' | 'cash',
  ): Promise<BudgetStatus[]> {
    return this.repository.budgetStatus(userId, month, basis);
  }
}
