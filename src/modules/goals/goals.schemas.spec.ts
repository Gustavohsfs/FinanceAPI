import { describe, expect, it } from 'vitest';

import { createGoalSchema } from './goals.schemas.js';

describe('goal contract', () => {
  it('requires a category for spending limits', () => {
    const result = createGoalSchema.safeParse({
      name: 'Mercado',
      kind: 'SPEND_LIMIT',
      targetCents: 80_000,
      startDate: '2026-07-01T03:00:00.000Z',
      deadline: '2026-07-31T23:59:59.000Z',
      recurrence: 'MONTHLY',
    });

    expect(result.success).toBe(false);
  });

  it('rejects a deadline before the start date', () => {
    const result = createGoalSchema.safeParse({
      name: 'Reserva',
      kind: 'SAVING',
      targetCents: 100_000,
      startDate: '2026-08-01T03:00:00.000Z',
      deadline: '2026-07-01T03:00:00.000Z',
      recurrence: 'ONCE',
    });

    expect(result.success).toBe(false);
  });
});
