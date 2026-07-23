import {
  ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

import { DomainError, type FieldError } from '../errors/domain.error.js';
import type { ErrorCode } from '../errors/error-codes.js';

export interface ProblemDetails {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly code: ErrorCode;
  readonly detail: string;
  readonly instance: string;
  readonly traceId: string;
  readonly errors?: readonly FieldError[];
}

export function domainErrorToProblem(
  error: DomainError,
  instance: string,
  traceId: string,
): ProblemDetails {
  return {
    type: `https://api.fluxo.app/errors/${error.code.toLowerCase().replaceAll('_', '-')}`,
    title: error.title,
    status: error.status,
    code: error.code,
    detail: error.detail,
    instance,
    traceId,
    ...(error.errors ? { errors: error.errors } : {}),
  };
}

function validationError(error: ZodError): DomainError {
  return new DomainError(
    'VALIDATION_FAILED',
    HttpStatus.UNPROCESSABLE_ENTITY,
    'Dados inválidos',
    'Um ou mais campos não atendem ao contrato.',
    error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    })),
  );
}

function normalizeException(exception: unknown): DomainError {
  if (exception instanceof DomainError) return exception;
  if (exception instanceof ZodError) return validationError(exception);
  if (exception instanceof HttpException && exception.getStatus() < 500) {
    return new DomainError(
      exception.getStatus() === 401 ? 'AUTH_INVALID_TOKEN' : 'VALIDATION_FAILED',
      exception.getStatus(),
      exception.getStatus() === 401 ? 'Não autenticado' : 'Requisição inválida',
      exception.getStatus() === 401
        ? 'Apresente um access token válido.'
        : 'A requisição não pôde ser processada.',
    );
  }
  return new DomainError(
    'INTERNAL_ERROR',
    HttpStatus.INTERNAL_SERVER_ERROR,
    'Erro interno',
    'Não foi possível concluir a operação.',
  );
}

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<FastifyRequest>();
    const response = context.getResponse<FastifyReply>();
    const error = normalizeException(exception);
    const problem = domainErrorToProblem(error, request.url, request.id);

    void response
      .status(error.status)
      .header('content-type', 'application/problem+json')
      .send(problem);
  }
}
