import { describe, expect, it } from 'vitest';

import { decodeCursor, encodeCursor } from './cursor.js';

describe('cursor', () => {
  it('round-trips an ordered transaction cursor', () => {
    const value = {
      id: '67f04cc3-5b6d-4a87-a666-c84260d75e2c',
      occurredAt: '2026-07-23T12:00:00.000Z',
    };

    expect(decodeCursor(encodeCursor(value))).toEqual(value);
  });

  it('rejects malformed input with a stable error code', () => {
    expect(() => decodeCursor('not-base64-json')).toThrow(
      expect.objectContaining({ code: 'PAGINATION_INVALID_CURSOR' }),
    );
  });
});
