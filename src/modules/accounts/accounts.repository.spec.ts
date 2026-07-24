import { describe, expect, it, vi } from 'vitest';

import type { Prisma } from '../../generated/prisma/client.js';
import { AccountsRepository } from './accounts.repository.js';

const account = {
  id: '67f04cc3-5b6d-4a87-a666-c84260d75e2c',
  userId: '50bf982c-13db-46a6-9fa2-6d2398654290',
};

interface ScopedDeleteInput {
  where: { id: string; userId: string; deletedAt: null };
  data: { deletedAt: Date };
}

function repository(updatedCount = 1) {
  const queryRaw = vi
    .fn<(query: Prisma.Sql) => Promise<readonly { id: string }[]>>()
    .mockResolvedValue([{ id: account.userId }]);
  const updateMany = vi
    .fn<(input: ScopedDeleteInput) => Promise<{ count: number }>>()
    .mockResolvedValue({ count: updatedCount });
  const database = {
    $queryRaw: queryRaw,
    account: {
      findFirst: vi.fn().mockResolvedValue(account),
      count: vi.fn().mockResolvedValue(2),
      update: vi.fn().mockResolvedValue(account),
      updateMany: updateMany,
    },
    creditCard: { count: vi.fn().mockResolvedValue(0) },
    recurrence: { count: vi.fn().mockResolvedValue(0) },
  };
  const prisma = {
    $transaction: vi.fn((callback: (transaction: typeof database) => unknown) => callback(database)),
  };

  return { database, repository: new AccountsRepository(prisma as never) };
}

describe('AccountsRepository', () => {
  it('serializes guarded account deletion per user before counting active accounts', async () => {
    const { database, repository: accounts } = repository();

    await expect(accounts.softDeleteGuarded(account.userId, account.id)).resolves.toEqual({
      status: 'deleted',
    });

    expect(database.$queryRaw).toHaveBeenCalledOnce();
    const query = database.$queryRaw.mock.calls[0]?.[0];
    if (!query) throw new Error('Expected user lock query');
    expect(query.strings.join('')).toContain('FOR UPDATE');
    expect(query.values).toEqual([account.userId]);
    expect(database.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      database.account.count.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });

  it('reports not found when the active scoped delete loses a race', async () => {
    const { database, repository: accounts } = repository(0);

    await expect(accounts.softDeleteGuarded(account.userId, account.id)).resolves.toEqual({
      status: 'not-found',
    });

    const deleteInput = database.account.updateMany.mock.calls[0]?.[0];
    if (!deleteInput) throw new Error('Expected scoped account deletion');
    expect(deleteInput.where).toEqual({ id: account.id, userId: account.userId, deletedAt: null });
    expect(deleteInput.data.deletedAt).toBeInstanceOf(Date);
  });
});
