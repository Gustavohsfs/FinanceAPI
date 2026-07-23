import { describe, expect, it } from 'vitest';

import { createOpenApiDocument } from '../src/openapi.js';

describe('OpenAPI contract', () => {
  it('publishes the mobile-critical routes', async () => {
    const document = await createOpenApiDocument();

    expect(document.openapi).toBe('3.1.0');
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([
        '/v1/auth/login',
        '/v1/accounts',
        '/v1/categories',
        '/v1/transactions',
        '/v1/insights/summary',
        '/v1/goals',
      ]),
    );
  });
});
