import { describe, expect, it } from 'vitest';

import { splitInstallments } from './split-installments.js';

describe('splitInstallments', () => {
  it('distributes the remainder through the first installments', () => {
    expect(splitInstallments(100_000, 3)).toEqual([33_334, 33_333, 33_333]);
  });

  it('always closes exactly even when installments exceed cents', () => {
    const installments = splitInstallments(1, 2);

    expect(installments).toEqual([1, 0]);
    expect(installments.reduce((total, value) => total + value, 0)).toBe(1);
  });

  it('rejects invalid counts and monetary inputs', () => {
    expect(() => splitInstallments(-1, 2)).toThrow();
    expect(() => splitInstallments(100, 25)).toThrow();
  });
});
