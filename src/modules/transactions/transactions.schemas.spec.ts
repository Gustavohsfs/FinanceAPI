import { describe, expect, it } from 'vitest';

import { createTransactionSchema } from './transactions.schemas.js';

describe('createTransactionSchema', () => {
  it('accepts the mobile quick-entry payload without an optional description', () => {
    expect(
      createTransactionSchema.parse({
        type: 'EXPENSE',
        amountCents: 1_000,
        occurredAt: '2026-07-23T12:00:00.000Z',
        categoryId: '67f04cc3-5b6d-4a87-a666-c84260d75e2c',
        accountId: '50bf982c-13db-46a6-9fa2-6d2398654290',
        paymentMethod: 'PIX',
      }),
    ).toMatchObject({ description: '', installmentTotal: 1, currency: 'BRL' });
  });
});
