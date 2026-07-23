import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { DEFAULT_CATEGORIES } from '../categories/default-categories.js';
import type { UserResponse } from './auth.schemas.js';

export interface UserWithPassword extends UserResponse {
  readonly passwordHash: string;
}

export interface SessionRecord {
  readonly tokenHash: string;
  readonly familyId: string;
  readonly expiresAt: Date;
  readonly userAgent?: string;
  readonly ipAddress?: string;
}

export type RotationResult =
  | { readonly state: 'active'; readonly user: UserResponse }
  | { readonly state: 'missing' | 'expired' | 'reused' };

const userSelect = {
  id: true,
  email: true,
  name: true,
  timezone: true,
  currency: true,
} satisfies Prisma.UserSelect;

const userWithPasswordSelect = {
  ...userSelect,
  passwordHash: true,
} satisfies Prisma.UserSelect;

const sessionUserSelect = {
  ...userSelect,
  deletedAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  findUserByEmail(email: string): Promise<UserWithPassword | null> {
    return this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      select: userWithPasswordSelect,
    });
  }

  findUserById(userId: string): Promise<UserResponse | null> {
    return this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: userSelect,
    });
  }

  async register(
    input: { id: string; email: string; name: string; passwordHash: string },
    session: SessionRecord,
  ): Promise<UserResponse> {
    return this.prisma.$transaction(
      async (transaction) => {
        const user = await transaction.user.create({
          data: input,
          select: userSelect,
        });
        await transaction.category.createMany({
          data: DEFAULT_CATEGORIES.map((category) => ({
            ...category,
            userId: user.id,
          })),
        });
        await transaction.refreshToken.create({
          data: { ...session, userId: user.id },
        });
        return user;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  async createSession(userId: string, session: SessionRecord): Promise<void> {
    await this.prisma.refreshToken.create({ data: { ...session, userId } });
  }

  async rotateSession(
    currentHash: string,
    next: SessionRecord,
    now: Date,
  ): Promise<RotationResult> {
    return this.prisma.$transaction(
      async (transaction) => {
        const existing = await transaction.refreshToken.findUnique({
          where: { tokenHash: currentHash },
          include: { user: { select: sessionUserSelect } },
        });
        if (!existing || existing.user.deletedAt) return { state: 'missing' };
        if (existing.revokedAt) {
          await transaction.refreshToken.updateMany({
            where: { userId: existing.userId, familyId: existing.familyId, revokedAt: null },
            data: { revokedAt: now },
          });
          return { state: 'reused' };
        }
        if (existing.expiresAt <= now) {
          await transaction.refreshToken.update({
            where: { id: existing.id },
            data: { revokedAt: now },
          });
          return { state: 'expired' };
        }
        const revoked = await transaction.refreshToken.updateMany({
          where: { id: existing.id, revokedAt: null },
          data: { revokedAt: now },
        });
        if (revoked.count !== 1) {
          await transaction.refreshToken.updateMany({
            where: { userId: existing.userId, familyId: existing.familyId, revokedAt: null },
            data: { revokedAt: now },
          });
          return { state: 'reused' };
        }
        await transaction.refreshToken.create({
          data: {
            ...next,
            userId: existing.userId,
            familyId: existing.familyId,
          },
        });
        const user: UserResponse = {
          id: existing.user.id,
          email: existing.user.email,
          name: existing.user.name,
          timezone: existing.user.timezone,
          currency: existing.user.currency,
        };
        return { state: 'active', user };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  async revokeFamilyByTokenHash(tokenHash: string, now: Date): Promise<void> {
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: { userId: true, familyId: true },
    });
    if (!token) return;
    await this.prisma.refreshToken.updateMany({
      where: { ...token, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  async revokeAll(userId: string, now: Date): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  async updatePassword(userId: string, passwordHash: string, now: Date): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.user.updateMany({
        where: { id: userId, deletedAt: null },
        data: { passwordHash },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);
  }

  async createPasswordReset(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.prisma.passwordResetToken.create({
      data: { userId, tokenHash, expiresAt },
    });
  }

  async consumePasswordReset(tokenHash: string, passwordHash: string, now: Date): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const token = await transaction.passwordResetToken.findUnique({
        where: { tokenHash },
      });
      if (!token || token.usedAt || token.expiresAt <= now) return false;
      const consumed = await transaction.passwordResetToken.updateMany({
        where: { id: token.id, usedAt: null },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) return false;
      await transaction.user.update({
        where: { id: token.userId },
        data: { passwordHash },
      });
      await transaction.refreshToken.updateMany({
        where: { userId: token.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      return true;
    });
  }
}
