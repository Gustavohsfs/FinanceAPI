import { Injectable } from '@nestjs/common';

import { notFound } from '../../common/errors/domain.error.js';
import {
  lockActiveCreditCardForUpdate,
  lockUserForUpdate,
} from '../../database/financial-row-locks.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma, type Recurrence, type Transaction } from '../../generated/prisma/client.js';
import { addMonthsIso, calculateSettlementDate } from '../../shared/date/credit-card-settlement.js';
import type { TransactionResponse } from '../transactions/transactions.schemas.js';
import type { CreateRecurrenceDto } from './recurrences.schemas.js';

function transactionResponse(transaction: Transaction): TransactionResponse {
  return {
    id: transaction.id,
    userId: transaction.userId,
    type: transaction.type,
    amountCents: transaction.amountCents,
    description: transaction.description,
    occurredAt: transaction.occurredAt.toISOString(),
    settledAt: transaction.settledAt?.toISOString() ?? null,
    categoryId: transaction.categoryId,
    accountId: transaction.accountId,
    creditCardId: transaction.creditCardId,
    paymentMethod: transaction.paymentMethod,
    installmentGroupId: transaction.installmentGroupId,
    installmentNumber: transaction.installmentNumber,
    installmentTotal: transaction.installmentTotal,
    isProjected: transaction.isProjected,
    recurrenceId: transaction.recurrenceId,
    currency: transaction.currency,
    notes: transaction.notes,
    source: transaction.source,
    createdAt: transaction.createdAt.toISOString(),
    updatedAt: transaction.updatedAt.toISOString(),
    deletedAt: transaction.deletedAt?.toISOString() ?? null,
  };
}

@Injectable()
export class RecurrencesRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.recurrence.findMany({
      where: { userId, deletedAt: null },
      orderBy: [{ nextOccurrenceAt: 'asc' }, { id: 'asc' }],
    });
  }

  create(userId: string, input: CreateRecurrenceDto) {
    return this.prisma.$transaction(
      async (database) => {
        const userExists = await lockUserForUpdate(database, userId);
        if (!userExists) throw notFound('Conta');
        const account = await database.account.findFirst({
          where: { id: input.accountId, userId, deletedAt: null },
          select: { id: true },
        });
        if (!account) throw notFound('Conta');

        if (input.creditCardId) {
          const card = await lockActiveCreditCardForUpdate(database, userId, input.creditCardId);
          if (!card) throw notFound('Cartão');
        }
        return database.recurrence.create({
          data: {
            userId,
            type: input.type,
            amountCents: input.amountCents,
            description: input.description,
            ...(input.categoryId ? { categoryId: input.categoryId } : {}),
            accountId: input.accountId,
            ...(input.creditCardId ? { creditCardId: input.creditCardId } : {}),
            paymentMethod: input.paymentMethod,
            frequency: input.frequency,
            dayOfMonth: input.dayOfMonth,
            nextOccurrenceAt: new Date(input.nextOccurrenceAt),
            currency: input.currency,
            ...(input.notes ? { notes: input.notes } : {}),
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  async confirm(userId: string, recurrenceId: string): Promise<TransactionResponse> {
    return this.prisma.$transaction(
      async (database) => {
        const userExists = await lockUserForUpdate(database, userId);
        if (!userExists) throw notFound('Recorrência');

        const recurrence = await database.recurrence.findFirst({
          where: { id: recurrenceId, userId, deletedAt: null },
        });
        if (!recurrence) throw notFound('Recorrência');
        const projected = await database.transaction.findFirst({
          where: { userId, recurrenceId, isProjected: true, deletedAt: null },
          orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
        });
        if (!projected) {
          const alreadyConfirmed = await database.transaction.findFirst({
            where: { userId, recurrenceId, isProjected: false, deletedAt: null },
            orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
          });
          if (!alreadyConfirmed) throw notFound('Lançamento previsto');
          return transactionResponse(alreadyConfirmed);
        }
        const confirmed = await database.transaction.update({
          where: { id: projected.id, userId },
          data: { isProjected: false },
        });
        await database.auditLog.create({
          data: {
            userId,
            entityType: 'transaction',
            entityId: confirmed.id,
            action: 'confirmed',
            before: { isProjected: true },
            after: { isProjected: false },
          },
        });
        return transactionResponse(confirmed);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  async materializeNext45Days(): Promise<void> {
    const horizon = new Date(Date.now() + 45 * 86_400_000);
    const recurrences = await this.prisma.recurrence.findMany({
      where: { isActive: true, deletedAt: null, nextOccurrenceAt: { lte: horizon } },
      include: { creditCard: true },
    });
    for (const recurrence of recurrences) {
      await this.materializeRecurrence(recurrence, horizon);
    }
  }

  private async materializeRecurrence(recurrence: Recurrence, horizon: Date): Promise<void> {
    await this.prisma.$transaction(
      async (database) => {
        const userExists = await lockUserForUpdate(database, recurrence.userId);
        if (!userExists) throw notFound('Conta');
        const account = await database.account.findFirst({
          where: { id: recurrence.accountId, userId: recurrence.userId, deletedAt: null },
          select: { id: true },
        });
        if (!account) throw notFound('Conta');

        const lockedCard = recurrence.creditCardId
          ? await lockActiveCreditCardForUpdate(
              database,
              recurrence.userId,
              recurrence.creditCardId,
            )
          : null;
        if (recurrence.creditCardId && !lockedCard) throw notFound('Cartão');

        let occurrence = recurrence.nextOccurrenceAt.toISOString();
        while (new Date(occurrence) <= horizon) {
          const externalId = `${recurrence.id}:${occurrence.slice(0, 10)}`;
          const settledAt =
            lockedCard && recurrence.paymentMethod === 'CREDIT'
              ? new Date(
                  calculateSettlementDate(occurrence, lockedCard.closingDay, lockedCard.dueDay),
                )
              : null;
          await database.transaction.upsert({
            where: {
              userId_source_externalId: {
                userId: recurrence.userId,
                source: 'RECURRENCE',
                externalId,
              },
            },
            create: {
              userId: recurrence.userId,
              type: recurrence.type,
              amountCents: recurrence.amountCents,
              description: recurrence.description,
              occurredAt: new Date(occurrence),
              settledAt,
              categoryId: recurrence.categoryId,
              accountId: recurrence.accountId,
              creditCardId: recurrence.creditCardId,
              paymentMethod: recurrence.paymentMethod,
              isProjected: true,
              recurrenceId: recurrence.id,
              currency: recurrence.currency,
              notes: recurrence.notes,
              externalId,
              source: 'RECURRENCE',
            },
            update: {},
          });
          occurrence = addMonthsIso(occurrence, 1);
        }
        await database.recurrence.update({
          where: { id: recurrence.id, userId: recurrence.userId },
          data: { nextOccurrenceAt: new Date(occurrence) },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }
}
