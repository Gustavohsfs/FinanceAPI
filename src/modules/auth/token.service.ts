import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import type { UserResponse } from './auth.schemas.js';

export interface RefreshTokenMaterial {
  readonly raw: string;
  readonly hash: string;
}

@Injectable()
export class TokenService {
  constructor(private readonly jwt: JwtService) {}

  createRefreshToken(): RefreshTokenMaterial {
    const raw = randomBytes(32).toString('base64url');
    return { raw, hash: this.hashRefreshToken(raw) };
  }

  hashRefreshToken(raw: string): string {
    const pepper = process.env.REFRESH_TOKEN_PEPPER;
    if (!pepper) throw new Error('REFRESH_TOKEN_PEPPER is required');
    return createHash('sha256').update(`${raw}:${pepper}`).digest('hex');
  }

  async createAccessToken(user: Pick<UserResponse, 'id' | 'email'>): Promise<string> {
    const secret = process.env.JWT_SECRET_CURRENT;
    if (!secret) throw new Error('JWT_SECRET_CURRENT is required');
    return this.jwt.signAsync(
      { sub: user.id, email: user.email, jti: randomUUID() },
      { secret, expiresIn: '15m' },
    );
  }
}
