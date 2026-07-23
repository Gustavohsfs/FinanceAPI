import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { DomainError } from '../errors/domain.error.js';

const accessClaimsSchema = z.object({
  sub: z.uuid(),
  email: z.email(),
  jti: z.uuid(),
  iat: z.number().int(),
  exp: z.number().int(),
});

function bearerToken(request: FastifyRequest): string {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw invalidToken();
  }
  return header.slice('Bearer '.length);
}

function invalidToken(): DomainError {
  return new DomainError(
    'AUTH_INVALID_TOKEN',
    401,
    'Não autenticado',
    'Apresente um access token válido.',
  );
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const token = bearerToken(request);
    const secrets = [process.env.JWT_SECRET_CURRENT, process.env.JWT_SECRET_PREVIOUS].filter(
      (value): value is string => Boolean(value),
    );

    for (const secret of secrets) {
      try {
        const claims = accessClaimsSchema.parse(await this.jwt.verifyAsync(token, { secret }));
        request.user = { id: claims.sub, email: claims.email };
        return true;
      } catch {
        continue;
      }
    }
    throw invalidToken();
  }
}
