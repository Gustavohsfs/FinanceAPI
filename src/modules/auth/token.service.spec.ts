import { JwtService } from '@nestjs/jwt';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { TokenService } from './token.service.js';

describe('TokenService', () => {
  const service = new TokenService(new JwtService());

  it('creates an opaque 32-byte refresh token and a stable hash', () => {
    const token = service.createRefreshToken();

    expect(Buffer.from(token.raw, 'base64url')).toHaveLength(32);
    expect(token.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(service.hashRefreshToken(token.raw)).toBe(token.hash);
  });

  it('creates an access token with minimal claims and 15 minute expiry', async () => {
    const accessToken = await service.createAccessToken({
      id: '67f04cc3-5b6d-4a87-a666-c84260d75e2c',
      email: 'gustavo@example.com',
    });
    const secret = process.env.JWT_SECRET_CURRENT;
    if (!secret) throw new Error('test secret is missing');
    const decoded = z
      .object({
        sub: z.uuid(),
        email: z.email(),
        jti: z.uuid(),
        iat: z.number().int(),
        exp: z.number().int(),
      })
      .parse(new JwtService().verify<Record<string, unknown>>(accessToken, { secret }));

    expect(decoded).toMatchObject({
      sub: '67f04cc3-5b6d-4a87-a666-c84260d75e2c',
      email: 'gustavo@example.com',
    });
    expect(decoded.exp - decoded.iat).toBe(15 * 60);
    expect(Object.keys(decoded).sort()).toEqual(['email', 'exp', 'iat', 'jti', 'sub']);
  });
});
