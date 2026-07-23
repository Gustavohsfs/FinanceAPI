import type { AuthenticatedUser } from '../decorators/current-user.decorator.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthenticatedUser;
  }
}
