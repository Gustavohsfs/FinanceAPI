import { describe, expect, it, vi } from 'vitest';

import { CreditCardsService } from './credit-cards.service.js';

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

function repository() {
  return {
    findById: vi.fn(),
    listSettlementSources: vi.fn(),
    updateWithSettlements: vi.fn(),
    softDeleteGuarded: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    invoiceTotal: vi.fn(),
  };
}

describe('CreditCardsService', () => {
  it('recalculates only changed settlements when a calendar day changes', async () => {
    const repo = repository();
    repo.findById.mockResolvedValue(card);
    repo.listSettlementSources.mockResolvedValue([
      {
        id: 'dfdd4f54-a32b-4814-8ec0-8da723a142e0',
        occurredAt: new Date('2026-07-23T15:00:00.000Z'),
        settledAt: new Date('2026-08-10T03:00:00.000Z'),
      },
      {
        id: '4cc5c8e1-a092-4750-ae91-bd77b993f2cf',
        occurredAt: new Date('2026-07-01T15:00:00.000Z'),
        settledAt: new Date('2026-08-10T03:00:00.000Z'),
      },
    ]);
    repo.updateWithSettlements.mockResolvedValue({ ...card, closingDay: 20 });
    const accounts = { exists: vi.fn().mockResolvedValue(true) };
    const service = new CreditCardsService(repo as never, accounts as never);

    await service.update(card.userId, card.id, { closingDay: 20 });

    expect(repo.updateWithSettlements).toHaveBeenCalledWith(
      card.userId,
      card.id,
      { closingDay: 20 },
      [
        {
          id: 'dfdd4f54-a32b-4814-8ec0-8da723a142e0',
          before: new Date('2026-08-10T03:00:00.000Z'),
          after: new Date('2026-09-10T03:00:00.000Z'),
        },
      ],
    );
  });

  it('does not load settlement sources when calendar days stay unchanged', async () => {
    const repo = repository();
    repo.findById.mockResolvedValue(card);
    repo.updateWithSettlements.mockResolvedValue({ ...card, name: 'Viagens' });
    const service = new CreditCardsService(
      repo as never,
      { exists: vi.fn().mockResolvedValue(true) } as never,
    );

    await service.update(card.userId, card.id, { name: 'Viagens' });

    expect(repo.listSettlementSources).not.toHaveBeenCalled();
    expect(repo.updateWithSettlements).toHaveBeenCalledWith(
      card.userId,
      card.id,
      { name: 'Viagens' },
      [],
    );
  });

  it('validates a supplied account in the user scope', async () => {
    const repo = repository();
    repo.findById.mockResolvedValue(card);
    const accounts = { exists: vi.fn().mockResolvedValue(false) };
    const service = new CreditCardsService(repo as never, accounts as never);
    const accountId = 'ac9ae116-3127-4d0e-9ae8-910d3ddba93f';

    await expect(service.update(card.userId, card.id, { accountId })).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
      status: 404,
    });

    expect(accounts.exists).toHaveBeenCalledWith(card.userId, accountId);
    expect(repo.updateWithSettlements).not.toHaveBeenCalled();
  });

  it('returns 404 when updating a foreign, deleted, or concurrently deleted card', async () => {
    const repo = repository();
    repo.findById.mockResolvedValueOnce(null).mockResolvedValueOnce(card);
    repo.updateWithSettlements.mockResolvedValue(null);
    const service = new CreditCardsService(
      repo as never,
      { exists: vi.fn().mockResolvedValue(true) } as never,
    );

    await expect(service.update(card.userId, card.id, { name: 'Nova' })).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
      status: 404,
    });
    await expect(service.update(card.userId, card.id, { name: 'Nova' })).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
      status: 404,
    });
  });

  it('rejects deletion when an active recurrence uses the card', async () => {
    const repo = repository();
    repo.softDeleteGuarded.mockResolvedValue({ status: 'has-active-recurrences' });
    const service = new CreditCardsService(repo as never, { exists: vi.fn() } as never);

    await expect(service.delete(card.userId, card.id)).rejects.toMatchObject({
      code: 'CREDIT_CARD_HAS_ACTIVE_RECURRENCES',
      status: 409,
    });
  });

  it('returns 404 when deleting a foreign or deleted card', async () => {
    const repo = repository();
    repo.softDeleteGuarded.mockResolvedValue({ status: 'not-found' });
    const service = new CreditCardsService(repo as never, { exists: vi.fn() } as never);

    await expect(service.delete(card.userId, card.id)).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
      status: 404,
    });
  });
});
