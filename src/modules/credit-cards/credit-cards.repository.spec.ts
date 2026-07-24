import { describe, expect, it, vi } from 'vitest';

import { Prisma } from '../../generated/prisma/client.js';
import { CreditCardsRepository } from './credit-cards.repository.js';

const card = {
  id: '97d84e6f-8085-49da-879b-59d40e5b01d9',
  userId: '50bf982c-13db-46a6-9fa2-6d2398654290',
  accountId: '67f04cc3-5b6d-4a87-a666-c84260d75e2c',
  name: 'Cartão',
  limitCents: 100_000,
  closingDay: 25,
  dueDay: 10,
  createdAt: new Date('2026-07-01T00:00:00.000Z'),
  updatedAt: new Date('2026-07-01T00:00:00.000Z'),
  deletedAt: null,
} as const;

interface CardSoftDeleteInput {
  where: { id: string; userId: string; deletedAt: null };
  data: { deletedAt: Date };
}

function repository() {
  const database = {
    creditCard: {
      findFirst: vi.fn().mockResolvedValue(card),
      update: vi.fn().mockResolvedValue({ ...card, closingDay: 20 }),
      updateMany: vi
        .fn<(input: CardSoftDeleteInput) => Promise<{ count: number }>>()
        .mockResolvedValue({ count: 1 }),
    },
    transaction: {
      findMany: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    recurrence: { count: vi.fn().mockResolvedValue(0) },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const prisma = {
    transaction: database.transaction,
    $transaction: vi.fn((callback: (transaction: typeof database) => unknown) =>
      callback(database),
    ),
  };
  return { database, prisma, repository: new CreditCardsRepository(prisma as never) };
}

describe('CreditCardsRepository', () => {
  it('updates a scoped card, changed settlements, and their audits atomically', async () => {
    const { database, prisma, repository: cards } = repository();
    const before = new Date('2026-08-10T03:00:00.000Z');
    const after = new Date('2026-09-10T03:00:00.000Z');

    await expect(
      cards.updateWithSettlements(card.userId, card.id, { closingDay: 20 }, [
        { id: 'dfdd4f54-a32b-4814-8ec0-8da723a142e0', before, after },
      ]),
    ).resolves.toMatchObject({ closingDay: 20 });

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    });
    expect(database.transaction.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'dfdd4f54-a32b-4814-8ec0-8da723a142e0',
        userId: card.userId,
        creditCardId: card.id,
        paymentMethod: 'CREDIT',
        deletedAt: null,
      },
      data: { settledAt: after },
    });
    expect(database.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: card.userId,
        entityType: 'credit_card',
        entityId: card.id,
        action: 'updated',
        before: {
          accountId: card.accountId,
          name: card.name,
          limitCents: card.limitCents,
          closingDay: 25,
          dueDay: card.dueDay,
        },
        after: {
          accountId: card.accountId,
          name: card.name,
          limitCents: card.limitCents,
          closingDay: 20,
          dueDay: card.dueDay,
        },
      },
    });
    expect(database.auditLog.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: card.userId,
          entityType: 'transaction',
          entityId: 'dfdd4f54-a32b-4814-8ec0-8da723a142e0',
          action: 'updated',
          before: { settledAt: '2026-08-10T03:00:00.000Z' },
          after: { settledAt: '2026-09-10T03:00:00.000Z' },
        },
      ],
    });
  });

  it('returns null when the scoped card update loses a deletion race', async () => {
    const { database, repository: cards } = repository();
    database.creditCard.update.mockRejectedValue({ code: 'P2025' });

    await expect(
      cards.updateWithSettlements(card.userId, card.id, { name: 'Nova' }, []),
    ).resolves.toBeNull();
  });

  it('aborts the card update when a settlement source is no longer active', async () => {
    const { database, repository: cards } = repository();
    database.transaction.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      cards.updateWithSettlements(card.userId, card.id, { closingDay: 20 }, [
        {
          id: 'dfdd4f54-a32b-4814-8ec0-8da723a142e0',
          before: new Date('2026-08-10T03:00:00.000Z'),
          after: new Date('2026-09-10T03:00:00.000Z'),
        },
      ]),
    ).rejects.toThrow('Settlement source changed during credit card update');

    expect(database.auditLog.create).not.toHaveBeenCalled();
    expect(database.auditLog.createMany).not.toHaveBeenCalled();
  });

  it('scopes settlement sources to active credit transactions owned by the user', async () => {
    const { database, repository: cards } = repository();
    database.transaction.findMany.mockResolvedValue([]);

    await cards.listSettlementSources(card.userId, card.id);

    expect(database.transaction.findMany).toHaveBeenCalledWith({
      where: {
        userId: card.userId,
        creditCardId: card.id,
        paymentMethod: 'CREDIT',
        deletedAt: null,
      },
      select: { id: true, occurredAt: true, settledAt: true },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    });
  });

  it('blocks soft deletion while an active recurrence uses the scoped card', async () => {
    const { database, repository: cards } = repository();
    database.recurrence.count.mockResolvedValue(1);

    await expect(cards.softDeleteGuarded(card.userId, card.id)).resolves.toEqual({
      status: 'has-active-recurrences',
    });

    expect(database.recurrence.count).toHaveBeenCalledWith({
      where: {
        userId: card.userId,
        creditCardId: card.id,
        isActive: true,
        deletedAt: null,
      },
    });
    expect(database.auditLog.create).not.toHaveBeenCalled();
    expect(database.creditCard.updateMany).not.toHaveBeenCalled();
  });

  it('audits and soft deletes the scoped active card in one transaction', async () => {
    const { database, repository: cards } = repository();

    await expect(cards.softDeleteGuarded(card.userId, card.id)).resolves.toEqual({
      status: 'deleted',
    });

    const deleteInput = database.creditCard.updateMany.mock.calls[0]?.[0];
    if (!deleteInput) throw new Error('Expected scoped credit card deletion');
    expect(database.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: card.userId,
        entityType: 'credit_card',
        entityId: card.id,
        action: 'deleted',
        before: {
          accountId: card.accountId,
          name: card.name,
          limitCents: card.limitCents,
          closingDay: card.closingDay,
          dueDay: card.dueDay,
        },
        after: { deletedAt: deleteInput.data.deletedAt.toISOString() },
      },
    });
    expect(deleteInput.where).toEqual({ id: card.id, userId: card.userId, deletedAt: null });
    expect(deleteInput.data.deletedAt).toBeInstanceOf(Date);
    expect(database.auditLog.create.mock.invocationCallOrder[0]).toBeLessThan(
      database.creditCard.updateMany.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });

  it('returns not found when a scoped soft delete loses a race', async () => {
    const { database, repository: cards } = repository();
    database.creditCard.updateMany.mockResolvedValue({ count: 0 });

    await expect(cards.softDeleteGuarded(card.userId, card.id)).resolves.toEqual({
      status: 'not-found',
    });
  });
});
