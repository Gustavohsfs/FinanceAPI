import type { ErrorCode } from './error-codes.js';

export interface FieldError {
  readonly field: string;
  readonly message: string;
}

export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    readonly title: string,
    readonly detail: string,
    readonly errors?: readonly FieldError[],
  ) {
    super(detail);
    this.name = 'DomainError';
  }
}

export function notFound(resource = 'Recurso'): DomainError {
  return new DomainError(
    'RESOURCE_NOT_FOUND',
    404,
    `${resource} não encontrado`,
    'O recurso solicitado não existe.',
  );
}
