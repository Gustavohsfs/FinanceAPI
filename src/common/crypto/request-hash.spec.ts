import { describe, expect, it } from 'vitest';

import { canonicalRequestHash } from './request-hash.js';

describe('canonicalRequestHash', () => {
  it('is independent from object key order at every level', () => {
    const first = { b: 2, nested: { z: true, a: 'x' }, a: 1 };
    const second = { a: 1, nested: { a: 'x', z: true }, b: 2 };

    expect(canonicalRequestHash(first)).toBe(canonicalRequestHash(second));
  });

  it('changes when request semantics change', () => {
    expect(canonicalRequestHash({ amountCents: 100 })).not.toBe(
      canonicalRequestHash({ amountCents: 101 }),
    );
  });
});
