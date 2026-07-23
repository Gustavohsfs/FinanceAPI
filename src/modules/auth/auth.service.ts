import { randomBytes, randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { argon2id, hash, verify } from 'argon2';

import { DomainError, notFound } from '../../common/errors/domain.error.js';
import type {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  SessionResponse,
  UserResponse,
} from './auth.schemas.js';
import { AuthRepository, type SessionRecord } from './auth.repository.js';
import { TokenService } from './token.service.js';

export interface RequestMetadata {
  readonly userAgent?: string;
  readonly ipAddress?: string;
}

const ARGON_OPTIONS = {
  type: argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly tokens: TokenService,
  ) {}

  async register(input: RegisterDto, metadata: RequestMetadata): Promise<SessionResponse> {
    const email = input.email.trim().toLowerCase();
    if (await this.repository.findUserByEmail(email)) {
      throw new DomainError(
        'AUTH_EMAIL_ALREADY_EXISTS',
        409,
        'E-mail já cadastrado',
        'Já existe uma conta para este e-mail.',
      );
    }
    const id = randomUUID();
    const passwordHash = await hash(input.password, ARGON_OPTIONS);
    const refresh = this.tokens.createRefreshToken();
    const user = await this.repository.register(
      { id, email, name: input.name.trim(), passwordHash },
      this.sessionRecord(refresh.hash, randomUUID(), metadata),
    );
    return this.response(user, refresh.raw);
  }

  async login(input: LoginDto, metadata: RequestMetadata): Promise<SessionResponse> {
    const user = await this.repository.findUserByEmail(input.email.trim().toLowerCase());
    if (!user || !(await verify(user.passwordHash, input.password))) {
      throw new DomainError(
        'AUTH_INVALID_CREDENTIALS',
        401,
        'Credenciais inválidas',
        'E-mail ou senha inválidos.',
      );
    }
    const refresh = this.tokens.createRefreshToken();
    await this.repository.createSession(
      user.id,
      this.sessionRecord(refresh.hash, randomUUID(), metadata),
    );
    const safeUser: UserResponse = {
      id: user.id,
      email: user.email,
      name: user.name,
      timezone: user.timezone,
      currency: user.currency,
    };
    return this.response(safeUser, refresh.raw);
  }

  async refresh(rawToken: string, metadata: RequestMetadata): Promise<SessionResponse> {
    const next = this.tokens.createRefreshToken();
    const result = await this.repository.rotateSession(
      this.tokens.hashRefreshToken(rawToken),
      this.sessionRecord(next.hash, randomUUID(), metadata),
      new Date(),
    );
    if (result.state === 'reused') {
      throw new DomainError(
        'AUTH_REFRESH_REUSED',
        401,
        'Sessão comprometida',
        'O refresh token já foi utilizado; faça login novamente.',
      );
    }
    if (result.state !== 'active') {
      throw new DomainError(
        'AUTH_REFRESH_REVOKED',
        401,
        'Sessão expirada',
        'A sessão não é mais válida; faça login novamente.',
      );
    }
    return this.response(result.user, next.raw);
  }

  async logout(rawToken: string): Promise<void> {
    await this.repository.revokeFamilyByTokenHash(
      this.tokens.hashRefreshToken(rawToken),
      new Date(),
    );
  }

  async logoutAll(userId: string): Promise<void> {
    await this.repository.revokeAll(userId, new Date());
  }

  async me(userId: string): Promise<UserResponse> {
    const user = await this.repository.findUserById(userId);
    if (!user) throw notFound('Usuário');
    return user;
  }

  async changePassword(userId: string, input: ChangePasswordDto): Promise<void> {
    const user = await this.repository.findUserById(userId);
    const withPassword = user ? await this.repository.findUserByEmail(user.email) : null;
    if (!withPassword || !(await verify(withPassword.passwordHash, input.currentPassword))) {
      throw new DomainError(
        'AUTH_INVALID_CREDENTIALS',
        401,
        'Senha atual inválida',
        'A senha atual não confere.',
      );
    }
    await this.repository.updatePassword(
      userId,
      await hash(input.newPassword, ARGON_OPTIONS),
      new Date(),
    );
  }

  async forgotPassword(input: ForgotPasswordDto): Promise<void> {
    const user = await this.repository.findUserByEmail(input.email.trim().toLowerCase());
    if (!user) return;
    const raw = randomBytes(32).toString('base64url');
    await this.repository.createPasswordReset(
      user.id,
      this.tokens.hashRefreshToken(raw),
      new Date(Date.now() + 15 * 60 * 1000),
    );
  }

  async resetPassword(input: ResetPasswordDto): Promise<void> {
    const consumed = await this.repository.consumePasswordReset(
      this.tokens.hashRefreshToken(input.token),
      await hash(input.newPassword, ARGON_OPTIONS),
      new Date(),
    );
    if (!consumed) {
      throw new DomainError(
        'AUTH_RESET_TOKEN_INVALID',
        422,
        'Token inválido',
        'O token de redefinição é inválido, expirou ou já foi usado.',
      );
    }
  }

  private sessionRecord(
    tokenHash: string,
    familyId: string,
    metadata: RequestMetadata,
  ): SessionRecord {
    return {
      tokenHash,
      familyId,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      ...(metadata.userAgent ? { userAgent: metadata.userAgent } : {}),
      ...(metadata.ipAddress ? { ipAddress: metadata.ipAddress } : {}),
    };
  }

  private async response(user: UserResponse, refreshToken: string): Promise<SessionResponse> {
    return {
      accessToken: await this.tokens.createAccessToken(user),
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: 900,
      user,
    };
  }
}
