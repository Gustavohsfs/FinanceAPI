import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { decodeCursor, encodeCursor } from '../../common/crypto/cursor.js';
import { DomainError, notFound } from '../../common/errors/domain.error.js';
import {
  lockActiveCreditCardForUpdate,
  lockUserForUpdate,
} from '../../database/financial-row-locks.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma, type Transaction } from '../../generated/prisma/client.js';
import type { NewTransactionRow } from './domain/build-transactions.js';
import {
  transactionResponseSchema,
  type TransactionResponse,
  type TransactionsPage,
  type TransactionsQueryDto,
  type UpdateTransactionDto,
} from './transactions.schemas.js';

export type TransactionSettlementCalculator = (
  occurredAt: Date,
  closingDay: number,
  dueDay: number,
) => Date;

function invalidPaymentMethodRelation(): DomainError {
  return new DomainError(
    'TRANSACTION_INVALID_PAYMENT_METHOD',
    422,
    'Método de pagamento inválido',
    'Transações no crédito exigem cartão ativo; os demais métodos não aceitam cartão.',
  );
}

function toResponse(transaction: Transaction): TransactionResponse {
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

function responseJson(response: readonly TransactionResponse[]): Prisma.InputJsonValue {
  return response.map((item) => ({
    id: item.id,
    userId: item.userId,
    type: item.type,
    amountCents: item.amountCents,
    description: item.description,
    occurredAt: item.occurredAt,
    settledAt: item.settledAt,
    categoryId: item.categoryId,
    accountId: item.accountId,
    creditCardId: item.creditCardId,
    paymentMethod: item.paymentMethod,
    installmentGroupId: item.installmentGroupId,
    installmentNumber: item.installmentNumber,
    installmentTotal: item.installmentTotal,
    isProjected: item.isProjected,
    recurrenceId: item.recurrenceId,
    currency: item.currency,
    notes: item.notes,
    source: item.source,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    deletedAt: item.deletedAt,
  }));
}

@Injectable()
export class TransactionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createIdempotent(
    userId: string,
    key: string,
    requestHash: string,
    rows: readonly NewTransactionRow[],
    calculateSettlement: TransactionSettlementCalculator,
  ): Promise<TransactionResponse[]> {
    return this.prisma.$transaction(
      async (database) => {
        const previous = await database.idempotencyKey.findUnique({
          where: { userId_key: { userId, key } },
        });
        if (previous) {
          if (previous.requestHash !== requestHash) {
            throw new DomainError(
              'IDEMPOTENCY_KEY_REUSED',
              409,
              'Chave de idempotência reutilizada',
              'A chave já foi usada com outro conteúdo.',
            );
          }
          return z.array(transactionResponseSchema).parse(previous.responseBody);
        }

        const userExists = await lockUserForUpdate(database, userId);
        if (!userExists) throw notFound('Conta');
        const accountIds = [...new Set(rows.map((row) => row.accountId))].sort();
        for (const accountId of accountIds) {
          const account = await database.account.findFirst({
            where: { id: accountId, userId, deletedAt: null },
            select: { id: true },
          });
          if (!account) throw notFound('Conta');
        }

        const creditCardIds = [
          ...new Set(
            rows.flatMap((row) =>
              row.paymentMethod === 'CREDIT' && row.creditCardId ? [row.creditCardId] : [],
            ),
          ),
        ].sort();
        const lockedCards = new Map<string, { id: string; closingDay: number; dueDay: number }>();
        for (const creditCardId of creditCardIds) {
          const card = await lockActiveCreditCardForUpdate(database, userId, creditCardId);
          if (!card) throw notFound('Cartão');
          lockedCards.set(card.id, card);
        }
        const settledRows = rows.map((row): NewTransactionRow => {
          if (row.paymentMethod !== 'CREDIT' || !row.creditCardId) return row;
          const card = lockedCards.get(row.creditCardId);
          if (!card) throw notFound('Cartão');
          return {
            ...row,
            settledAt: calculateSettlement(row.occurredAt, card.closingDay, card.dueDay),
          };
        });

        await database.transaction.createMany({ data: settledRows });
        const created = await database.transaction.findMany({
          where: { userId, id: { in: settledRows.map((row) => row.id) } },
          orderBy: [{ installmentNumber: 'asc' }, { id: 'asc' }],
        });
        const response = created.map(toResponse);
        await database.auditLog.createMany({
          data: response.map((item) => ({
            userId,
            entityType: 'transaction',
            entityId: item.id,
            action: 'created',
            after: responseJson([item]),
          })),
        });
        await database.idempotencyKey.create({
          data: {
            userId,
            key,
            requestHash,
            responseBody: responseJson(response),
            statusCode: 201,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });
        return response;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  async list(userId: string, query: TransactionsQueryDto): Promise<TransactionsPage> {
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
    const dateFilter = {
      ...(query.from ? { gte: new Date(query.from) } : {}),
      ...(query.to ? { lte: new Date(query.to) } : {}),
    };
    const dateWhere: Prisma.TransactionWhereInput =
      query.basis === 'cash'
        ? {
            OR: [{ settledAt: dateFilter }, { settledAt: null, occurredAt: dateFilter }],
          }
        : { occurredAt: dateFilter };
    const cursorWhere: Prisma.TransactionWhereInput | undefined = cursor
      ? {
          OR: [
            { occurredAt: { lt: new Date(cursor.occurredAt) } },
            { occurredAt: new Date(cursor.occurredAt), id: { gt: cursor.id } },
          ],
        }
      : undefined;
    const where: Prisma.TransactionWhereInput = {
      userId,
      deletedAt: null,
      AND: [dateWhere, ...(cursorWhere ? [cursorWhere] : [])],
      ...(query.type ? { type: query.type } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.accountId ? { accountId: query.accountId } : {}),
      ...(query.creditCardId ? { creditCardId: query.creditCardId } : {}),
      ...(query.method ? { paymentMethod: query.method } : {}),
    };
    const rows = await this.prisma.transaction.findMany({
      where,
      orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
      take: query.limit + 1,
    });
    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      data: page.map(toResponse),
      meta: {
        nextCursor:
          hasMore && last
            ? encodeCursor({ id: last.id, occurredAt: last.occurredAt.toISOString() })
            : null,
        hasMore,
        limit: query.limit,
      },
    };
  }

  findById(userId: string, id: string) {
    return this.prisma.transaction.findFirst({
      where: { id, userId, deletedAt: null },
    });
  }

  async updateScoped(
    userId: string,
    id: string,
    scope: 'one' | 'future' | 'all',
    input: UpdateTransactionDto,
    calculateSettlement: TransactionSettlementCalculator,
  ): Promise<TransactionResponse[]> {
    return this.prisma.$transaction(
      async (database) => {
        const userExists = await lockUserForUpdate(database, userId);
        if (!userExists) throw notFound('Transação');

        const base = await database.transaction.findFirst({
          where: { id, userId, deletedAt: null },
        });
        if (!base) throw notFound('Transação');
        const where = this.scopeWhere(userId, base, scope);
        const before = await database.transaction.findMany({ where });

        if (input.accountId !== undefined) {
          const account = await database.account.findFirst({
            where: { id: input.accountId, userId, deletedAt: null },
            select: { id: true },
          });
          if (!account) throw notFound('Conta');
        }

        const effectiveRelations = before.map((transaction) => {
          const paymentMethod = input.paymentMethod ?? transaction.paymentMethod;
          const creditCardId =
            input.creditCardId !== undefined ? input.creditCardId : transaction.creditCardId;
          if (
            (paymentMethod === 'CREDIT' && !creditCardId) ||
            (paymentMethod !== 'CREDIT' && creditCardId !== null)
          ) {
            throw invalidPaymentMethodRelation();
          }
          return { transactionId: transaction.id, paymentMethod, creditCardId };
        });
        const creditCardIds = [
          ...new Set([
            ...before.flatMap((item) => (item.creditCardId ? [item.creditCardId] : [])),
            ...effectiveRelations.flatMap((item) => (item.creditCardId ? [item.creditCardId] : [])),
          ]),
        ].sort();
        const lockedCards = new Map<string, { id: string; closingDay: number; dueDay: number }>();
        for (const creditCardId of creditCardIds) {
          const card = await lockActiveCreditCardForUpdate(database, userId, creditCardId);
          if (card) lockedCards.set(card.id, card);
        }
        for (const relation of effectiveRelations) {
          if (
            relation.paymentMethod === 'CREDIT' &&
            relation.creditCardId &&
            !lockedCards.has(relation.creditCardId)
          ) {
            throw notFound('Cartão');
          }
        }

        const recalculatesSettlement =
          input.settledAt === undefined &&
          (input.occurredAt !== undefined ||
            input.creditCardId !== undefined ||
            input.paymentMethod !== undefined);
        for (const transaction of before) {
          const relation = effectiveRelations.find((item) => item.transactionId === transaction.id);
          if (!relation) throw new Error('Transaction relation snapshot missing');
          const occurredAt =
            input.occurredAt !== undefined ? new Date(input.occurredAt) : transaction.occurredAt;
          const { paymentMethod, creditCardId } = relation;
          let settledAt: Date | null | undefined;
          if (input.settledAt !== undefined) {
            settledAt = input.settledAt ? new Date(input.settledAt) : null;
          } else if (recalculatesSettlement) {
            if (paymentMethod === 'CREDIT' && creditCardId) {
              const card = lockedCards.get(creditCardId);
              if (!card) throw notFound('Cartão');
              settledAt = calculateSettlement(occurredAt, card.closingDay, card.dueDay);
            } else {
              settledAt = null;
            }
          }

          await database.transaction.update({
            where: { id: transaction.id, userId, deletedAt: null },
            data: {
              ...(input.amountCents !== undefined ? { amountCents: input.amountCents } : {}),
              ...(input.description !== undefined ? { description: input.description } : {}),
              ...(input.occurredAt !== undefined ? { occurredAt } : {}),
              ...(settledAt !== undefined ? { settledAt } : {}),
              ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
              ...(input.accountId !== undefined ? { accountId: input.accountId } : {}),
              ...(input.creditCardId !== undefined ? { creditCardId: input.creditCardId } : {}),
              ...(input.paymentMethod !== undefined ? { paymentMethod } : {}),
              ...(input.notes !== undefined ? { notes: input.notes } : {}),
              ...(input.isProjected !== undefined ? { isProjected: input.isProjected } : {}),
            },
          });
        }
        const after = await database.transaction.findMany({
          where: { id: { in: before.map((item) => item.id) }, userId, deletedAt: null },
          orderBy: [{ installmentNumber: 'asc' }, { id: 'asc' }],
        });
        const beforeById = new Map(before.map((item) => [item.id, item]));
        await database.auditLog.createMany({
          data: after.map((item) => ({
            userId,
            entityType: 'transaction',
            entityId: item.id,
            action: 'updated',
            before: responseJson([toResponse(beforeById.get(item.id) ?? item)]),
            after: responseJson([toResponse(item)]),
          })),
        });
        return after.map(toResponse);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  async softDeleteScoped(
    userId: string,
    id: string,
    scope: 'one' | 'future' | 'all',
  ): Promise<void> {
    await this.prisma.$transaction(async (database) => {
      const userExists = await lockUserForUpdate(database, userId);
      if (!userExists) throw notFound('Transação');

      const base = await database.transaction.findFirst({
        where: { id, userId, deletedAt: null },
      });
      if (!base) throw notFound('Transação');
      const where = this.scopeWhere(userId, base, scope);
      const before = await database.transaction.findMany({ where });
      const deletedAt = new Date();
      await database.transaction.updateMany({ where, data: { deletedAt } });
      await database.auditLog.createMany({
        data: before.map((item) => ({
          userId,
          entityType: 'transaction',
          entityId: item.id,
          action: 'deleted',
          before: responseJson([toResponse(item)]),
          after: { deletedAt: deletedAt.toISOString() },
        })),
      });
    });
  }

  private scopeWhere(
    userId: string,
    base: Transaction,
    scope: 'one' | 'future' | 'all',
  ): Prisma.TransactionWhereInput {
    if (!base.installmentGroupId || scope === 'one') {
      return { id: base.id, userId, deletedAt: null };
    }
    return {
      userId,
      installmentGroupId: base.installmentGroupId,
      deletedAt: null,
      ...(scope === 'future' ? { installmentNumber: { gte: base.installmentNumber ?? 1 } } : {}),
    };
  }
}
