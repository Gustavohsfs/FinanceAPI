import { JwtService } from '@nestjs/jwt';
import { describe, expect, it, vi } from 'vitest';

import type { AuthRepository } from './auth.repository.js';
import { AuthService } from './auth.service.js';
import { TokenService } from './token.service.js';

describe('AuthService refresh rotation', () => {
  it('maps detected token reuse to the stable security error', async () => {
    const repository = {
      rotateSession: vi.fn().mockResolvedValue({ state: 'reused' }),
    } as unknown as AuthRepository;
    const service = new AuthService(repository, new TokenService(new JwtService()));

    await expect(service.refresh('compromised-token', {})).rejects.toMatchObject({
      code: 'AUTH_REFRESH_REUSED',
    });
  });

  it('returns a completely new session after a valid rotation', async () => {
    const repository = {
      rotateSession: vi.fn().mockResolvedValue({
        state: 'active',
        user: {
          id: '67f04cc3-5b6d-4a87-a666-c84260d75e2c',
          email: 'gustavo@example.com',
          name: 'Gustavo',
          timezone: 'America/Sao_Paulo',
          currency: 'BRL',
        },
      }),
    } as unknown as AuthRepository;
    const service = new AuthService(repository, new TokenService(new JwtService()));

    const result = await service.refresh('valid-token', {});

    expect(result.refreshToken).not.toBe('valid-token');
    expect(result.expiresIn).toBe(900);
    expect(result.user.email).toBe('gustavo@example.com');
  });
});
