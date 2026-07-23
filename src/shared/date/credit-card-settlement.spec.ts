import { describe, expect, it } from 'vitest';

import { calculateSettlementDate } from './credit-card-settlement.js';

describe('calculateSettlementDate', () => {
  it('uses the current invoice when purchase is on the closing day', () => {
    expect(calculateSettlementDate('2026-07-20T12:00:00.000Z', 20, 27)).toBe(
      '2026-07-27T03:00:00.000Z',
    );
  });

  it('moves a purchase after closing to the next invoice', () => {
    expect(calculateSettlementDate('2026-07-21T12:00:00.000Z', 20, 27)).toBe(
      '2026-08-27T03:00:00.000Z',
    );
  });

  it('moves due date to the following month when due day precedes closing', () => {
    expect(calculateSettlementDate('2026-07-10T12:00:00.000Z', 28, 5)).toBe(
      '2026-08-05T03:00:00.000Z',
    );
  });
});
