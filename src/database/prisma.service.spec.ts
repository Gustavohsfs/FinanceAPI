import { describe, expect, it } from 'vitest';

import { readinessFromQuery } from './prisma.service.js';

describe('database readiness', () => {
  it('reports ready when SELECT 1 returns one row', () => {
    expect(readinessFromQuery([{ ready: 1 }])).toBe(true);
  });

  it('reports not ready for an unexpected response', () => {
    expect(readinessFromQuery([])).toBe(false);
  });
});
