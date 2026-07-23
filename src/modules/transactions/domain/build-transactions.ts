import { addMonthsIso } from '../../../shared/date/credit-card-settlement.js';
import { splitInstallments } from '../../../shared/money/split-installments.js';
import type { CreateTransactionDto } from '../transactions.schemas.js';

export interface BuildDependencies {
  readonly userId: string;
  readonly now: Date;
  readonly newId: () => string;
  readonly settledAtFor: (occurredAt: string) => string | null;
}

export interface NewTransactionRow {
  readonly id: string;
  readonly userId: string;
  readonly type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  readonly amountCents: number;
  readonly description: string;
  readonly occurredAt: Date;
  readonly settledAt: Date | null;
  readonly categoryId: string | null;
  readonly accountId: string;
  readonly creditCardId: string | null;
  readonly paymentMethod: 'CASH' | 'PIX' | 'DEBIT' | 'CREDIT';
  readonly installmentGroupId: string | null;
  readonly installmentNumber: number | null;
  readonly installmentTotal: number | null;
  readonly isProjected: boolean;
  readonly currency: string;
  readonly notes: string | null;
  readonly source: 'MANUAL';
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export function buildTransactions(
  input: CreateTransactionDto,
  dependencies: BuildDependencies,
): NewTransactionRow[] {
  const count = input.installmentTotal;
  const amounts = splitInstallments(input.amountCents, count);
  const groupId = count > 1 ? dependencies.newId() : null;
  const rows = amounts.map((amountCents, index): NewTransactionRow => {
    const occurredAtIso = addMonthsIso(input.occurredAt, index);
    const settledAtIso =
      input.paymentMethod === 'CREDIT'
        ? dependencies.settledAtFor(occurredAtIso)
        : input.settledAt
          ? addMonthsIso(input.settledAt, index)
          : null;
    return {
      id: dependencies.newId(),
      userId: dependencies.userId,
      type: input.type,
      amountCents,
      description: input.description,
      occurredAt: new Date(occurredAtIso),
      settledAt: settledAtIso ? new Date(settledAtIso) : null,
      categoryId: input.categoryId ?? null,
      accountId: input.accountId,
      creditCardId: input.creditCardId ?? null,
      paymentMethod: input.paymentMethod,
      installmentGroupId: groupId,
      installmentNumber: count > 1 ? index + 1 : null,
      installmentTotal: count > 1 ? count : null,
      isProjected: new Date(occurredAtIso) > dependencies.now,
      currency: input.currency,
      notes: input.notes ?? null,
      source: 'MANUAL',
      createdAt: dependencies.now,
      updatedAt: dependencies.now,
    };
  });
  const sum = rows.reduce((total, row) => total + row.amountCents, 0);
  if (sum !== input.amountCents) {
    throw new Error('installment invariant violated');
  }
  return rows;
}
