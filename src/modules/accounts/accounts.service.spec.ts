import { describe, expect, it, vi } from 'vitest';

import { AccountsService } from './accounts.service.js';

const account = {
  id: '67f04cc3-5b6d-4a87-a666-c84260d75e2c',
  userId: '50bf982c-13db-46a6-9fa2-6d2398654290',
  name: 'Principal',
  kind: 'CHECKING',
  openingBalanceCents: 0,
  currency: 'BRL',
  createdAt: new Date('2026-07-01T00:00:00.000Z'),
  updatedAt: new Date('2026-07-01T00:00:00.000Z'),
  deletedAt: null,
} as const;

function repository() {
  return {
    list: vi.fn(),
    create: vi.fn(),
    exists: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    softDeleteGuarded: vi.fn(),
  };
}

describe('AccountsService', () => {
  it('returns 404 when updating a foreign or deleted account', async () => {
    const repo = repository();
    repo.findById.mockResolvedValue(null);
    const service = new AccountsService(repo as never);

    await expect(service.update(account.userId, account.id, { name: 'Nova' })).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
      status: 404,
    });
  });

  it('returns 404 when an account is deleted after the update lookup', async () => {
    const repo = repository();
    repo.findById.mockResolvedValue(account);
    repo.update.mockRejectedValue({ code: 'P2025' });
    const service = new AccountsService(repo as never);

    await expect(service.update(account.userId, account.id, { name: 'Nova' })).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
      status: 404,
    });
  });

  it.each([
    ['last-active', 'ACCOUNT_LAST_ACTIVE'],
    ['has-active-cards', 'ACCOUNT_HAS_ACTIVE_CARDS'],
    ['has-active-recurrences', 'ACCOUNT_HAS_ACTIVE_RECURRENCES'],
  ] as const)('maps %s deletion facts to %s', async (status, code) => {
    const repo = repository();
    repo.softDeleteGuarded.mockResolvedValue({ status });
    const service = new AccountsService(repo as never);

    await expect(service.delete(account.userId, account.id)).rejects.toMatchObject({ code, status: 409 });
  });
});
