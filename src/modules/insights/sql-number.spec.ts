import { describe, expect, it } from 'vitest';

import { toSafeInteger } from './sql-number.js';

describe('toSafeInteger', () => {
  it('normalizes PostgreSQL bigint representations', () => {
    expect(toSafeInteger(42n)).toBe(42);
    expect(toSafeInteger('9000')).toBe(9000);
    expect(toSafeInteger(0)).toBe(0);
  });

  it('rejects values that cannot be serialized safely', () => {
    expect(() => toSafeInteger(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toThrow();
    expect(() => toSafeInteger('not-a-number')).toThrow();
  });
});
