import { describe, expect, it } from 'vitest';

import { createAccountSchema, updateAccountSchema } from './accounts/accounts.schemas.js';
import { createCategorySchema } from './categories/categories.schemas.js';
import {
  createCreditCardSchema,
  updateCreditCardSchema,
} from './credit-cards/credit-cards.schemas.js';

describe('financial catalog input contracts', () => {
  it('rejects userId supplied by the client', () => {
    expect(() =>
      createAccountSchema.parse({
        userId: '67f04cc3-5b6d-4a87-a666-c84260d75e2c',
        name: 'Conta principal',
        kind: 'CHECKING',
        openingBalanceCents: 0,
      }),
    ).toThrow();
  });

  it('accepts the category contract used by the mobile app', () => {
    expect(
      createCategorySchema.parse({
        name: 'Alimentação',
        icon: 'utensils',
        color: '#F97316',
        type: 'EXPENSE',
        monthlyBudgetCents: 80_000,
      }),
    ).toMatchObject({ type: 'EXPENSE', monthlyBudgetCents: 80_000 });
  });

  it('rejects invalid credit card calendar days', () => {
    expect(() =>
      createCreditCardSchema.parse({
        accountId: '67f04cc3-5b6d-4a87-a666-c84260d75e2c',
        name: 'Cartão',
        limitCents: 100_000,
        closingDay: 0,
        dueDay: 40,
      }),
    ).toThrow();
  });

  it('accepts partial account updates and rejects empty bodies', () => {
    expect(updateAccountSchema.parse({ name: 'Conta conjunta' })).toEqual({
      name: 'Conta conjunta',
    });
    expect(() => updateAccountSchema.parse({})).toThrow();
    expect(() => updateAccountSchema.parse({ openingBalanceCents: 10.5 })).toThrow();
  });

  it('accepts partial card updates and validates calendar days', () => {
    expect(updateCreditCardSchema.parse({ closingDay: 20 })).toEqual({
      closingDay: 20,
    });
    expect(() => updateCreditCardSchema.parse({})).toThrow();
    expect(() => updateCreditCardSchema.parse({ dueDay: 32 })).toThrow();
  });
});
