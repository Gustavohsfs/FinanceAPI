import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import { Prisma, type CreditCard } from '../../generated/prisma/client.js';
import type { CreateCreditCardDto, UpdateCreditCardDto } from './credit-cards.schemas.js';

export interface SettlementSource {
  id: string;
  occurredAt: Date;
  settledAt: Date | null;
}

export interface SettlementChange {
  id: string;
  before: Date | null;
  after: Date;
}

export type CreditCardDeleteFacts =
  | { status: 'deleted' }
  | { status: 'not-found' }
  | { status: 'has-active-recurrences' };

class CreditCardMutationLostRace extends Error {}

function isRecordNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2025'
  );
}

function editableFields(card: CreditCard): Prisma.InputJsonObject {
  return {
    accountId: card.accountId,
    name: card.name,
    limitCents: card.limitCents,
    closingDay: card.closingDay,
    dueDay: card.dueDay,
  };
}

function definedCardFields(input: UpdateCreditCardDto) {
  return {
    ...(input.accountId !== undefined ? { accountId: input.accountId } : {}),
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.limitCents !== undefined ? { limitCents: input.limitCents } : {}),
    ...(input.closingDay !== undefined ? { closingDay: input.closingDay } : {}),
    ...(input.dueDay !== undefined ? { dueDay: input.dueDay } : {}),
  };
}

@Injectable()
export class CreditCardsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.creditCard.findMany({
      where: { userId, deletedAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  findById(userId: string, id: string) {
    return this.prisma.creditCard.findFirst({
      where: { id, userId, deletedAt: null },
    });
  }

  listSettlementSources(userId: string, id: string): Promise<SettlementSource[]> {
    return this.prisma.transaction.findMany({
      where: {
        userId,
        creditCardId: id,
        paymentMethod: 'CREDIT',
        deletedAt: null,
      },
      select: { id: true, occurredAt: true, settledAt: true },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    });
  }

  async updateWithSettlements(
    userId: string,
    id: string,
    input: UpdateCreditCardDto,
    changes: readonly SettlementChange[],
  ): Promise<CreditCard | null> {
    try {
      return await this.prisma.$transaction(
        async (database) => {
          const before = await database.creditCard.findFirst({
            where: { id, userId, deletedAt: null },
          });
          if (!before) return null;

          const after = await database.creditCard.update({
            where: { id, userId, deletedAt: null },
            data: definedCardFields(input),
          });

          for (const change of changes) {
            const updated = await database.transaction.updateMany({
              where: {
                id: change.id,
                userId,
                creditCardId: id,
                paymentMethod: 'CREDIT',
                deletedAt: null,
                settledAt: change.before,
              },
              data: { settledAt: change.after },
            });
            if (updated.count !== 1) {
              throw new Error('Settlement source changed during credit card update');
            }
          }

          await database.auditLog.create({
            data: {
              userId,
              entityType: 'credit_card',
              entityId: id,
              action: 'updated',
              before: editableFields(before),
              after: editableFields(after),
            },
          });
          if (changes.length > 0) {
            await database.auditLog.createMany({
              data: changes.map((change) => ({
                userId,
                entityType: 'transaction',
                entityId: change.id,
                action: 'updated',
                before: { settledAt: change.before?.toISOString() ?? null },
                after: { settledAt: change.after.toISOString() },
              })),
            });
          }
          return after;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      );
    } catch (error) {
      if (isRecordNotFound(error)) return null;
      throw error;
    }
  }

  async softDeleteGuarded(userId: string, id: string): Promise<CreditCardDeleteFacts> {
    try {
      return await this.prisma.$transaction(
        async (database) => {
          const card = await database.creditCard.findFirst({
            where: { id, userId, deletedAt: null },
          });
          if (!card) return { status: 'not-found' };

          const activeRecurrences = await database.recurrence.count({
            where: { userId, creditCardId: id, isActive: true, deletedAt: null },
          });
          if (activeRecurrences > 0) return { status: 'has-active-recurrences' };

          const deletedAt = new Date();
          await database.auditLog.create({
            data: {
              userId,
              entityType: 'credit_card',
              entityId: id,
              action: 'deleted',
              before: editableFields(card),
              after: { deletedAt: deletedAt.toISOString() },
            },
          });
          const deleted = await database.creditCard.updateMany({
            where: { id, userId, deletedAt: null },
            data: { deletedAt },
          });
          if (deleted.count !== 1) throw new CreditCardMutationLostRace();
          return { status: 'deleted' };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      );
    } catch (error) {
      if (error instanceof CreditCardMutationLostRace) return { status: 'not-found' };
      throw error;
    }
  }

  async create(userId: string, input: CreateCreditCardDto) {
    return this.prisma.$transaction(async (transaction) => {
      const card = await transaction.creditCard.create({
        data: {
          userId,
          accountId: input.accountId,
          name: input.name,
          limitCents: input.limitCents,
          closingDay: input.closingDay,
          dueDay: input.dueDay,
        },
      });
      await transaction.auditLog.create({
        data: {
          userId,
          entityType: 'credit_card',
          entityId: card.id,
          action: 'created',
          after: {
            accountId: input.accountId,
            name: input.name,
            limitCents: input.limitCents,
            closingDay: input.closingDay,
            dueDay: input.dueDay,
          },
        },
      });
      return card;
    });
  }

  async invoiceTotal(userId: string, creditCardId: string, month: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<readonly { totalCents: number }[]>(Prisma.sql`
      SELECT COALESCE(SUM(amount_cents), 0)::int AS "totalCents"
      FROM transactions
      WHERE user_id = ${userId}::uuid
        AND credit_card_id = ${creditCardId}::uuid
        AND type = 'EXPENSE'
        AND deleted_at IS NULL
        AND to_char(
          COALESCE(settled_at, occurred_at) AT TIME ZONE 'America/Sao_Paulo',
          'YYYY-MM'
        ) = ${month}
    `);
    return rows[0]?.totalCents ?? 0;
  }
}
