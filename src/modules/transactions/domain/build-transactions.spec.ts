import { describe, expect, it } from 'vitest';

import { buildTransactions } from './build-transactions.js';

describe('buildTransactions', () => {
  it('builds one row per installment and closes the purchase total', () => {
    let sequence = 0;
    const rows = buildTransactions(
      {
        type: 'EXPENSE',
        amountCents: 100_000,
        description: 'Notebook',
        occurredAt: '2026-07-23T12:00:00.000Z',
        categoryId: '67f04cc3-5b6d-4a87-a666-c84260d75e2c',
        accountId: '50bf982c-13db-46a6-9fa2-6d2398654290',
        creditCardId: '97d84e6f-8085-49da-879b-59d40e5b01d9',
        paymentMethod: 'CREDIT',
        installmentTotal: 3,
        currency: 'BRL',
      },
      {
        userId: '8babec10-44aa-49b2-859e-887338644b80',
        now: new Date('2026-07-23T13:00:00.000Z'),
        newId: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
        settledAtFor: (occurredAt) => occurredAt,
      },
    );

    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.amountCents)).toEqual([33_334, 33_333, 33_333]);
    expect(rows.reduce((total, row) => total + row.amountCents, 0)).toBe(100_000);
    expect(rows.map((row) => row.installmentNumber)).toEqual([1, 2, 3]);
    expect(new Set(rows.map((row) => row.installmentGroupId))).toHaveLength(1);
  });
});
