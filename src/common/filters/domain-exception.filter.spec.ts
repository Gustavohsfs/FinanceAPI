import { describe, expect, it } from 'vitest';

import { DomainError } from '../errors/domain.error.js';
import { domainErrorToProblem } from './domain-exception.filter.js';

describe('domainErrorToProblem', () => {
  it('creates RFC 9457 problem details without internals', () => {
    const problem = domainErrorToProblem(
      new DomainError(
        'TRANSACTION_INVALID_INSTALLMENTS',
        422,
        'Número de parcelas inválido',
        'Parcelamento exige entre 2 e 24 parcelas.',
        [{ field: 'installmentTotal', message: 'deve estar entre 2 e 24' }],
      ),
      '/v1/transactions',
      'trace-123',
    );

    expect(problem).toEqual({
      type: 'https://api.fluxo.app/errors/transaction-invalid-installments',
      title: 'Número de parcelas inválido',
      status: 422,
      code: 'TRANSACTION_INVALID_INSTALLMENTS',
      detail: 'Parcelamento exige entre 2 e 24 parcelas.',
      instance: '/v1/transactions',
      traceId: 'trace-123',
      errors: [{ field: 'installmentTotal', message: 'deve estar entre 2 e 24' }],
    });
  });
});
