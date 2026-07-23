import { describe, expect, it, vi } from 'vitest';

import type { JobsRepository } from './jobs.repository.js';
import { JobsService } from './jobs.service.js';
import type { RecurrencesRepository } from '../recurrences/recurrences.repository.js';

describe('JobsService locking', () => {
  it('does not execute work when another instance owns the lock', async () => {
    const jobs = {
      withLock: vi.fn().mockResolvedValue(false),
    } as unknown as JobsRepository;
    const materializeNext45Days = vi.fn();
    const recurrences = {
      materializeNext45Days,
    } as unknown as RecurrencesRepository;
    const service = new JobsService(jobs, recurrences);

    await service.materializeRecurrences();

    expect(materializeNext45Days).not.toHaveBeenCalled();
  });

  it('runs daily maintenance and Sunday cleanup in order', async () => {
    const calls: string[] = [];
    const jobs = {
      withLock: vi.fn(async (_name: string, work: () => Promise<void>) => {
        await work();
        return true;
      }),
      recalculateCreditSettlements: vi.fn(async () => {
        calls.push('recalculate');
      }),
      evaluateOverBudgetCount: vi.fn(async () => {
        calls.push('evaluate');
        return 0;
      }),
      cleanupExpired: vi.fn(async () => {
        calls.push('cleanup');
      }),
    } as unknown as JobsRepository;
    const recurrences = {
      materializeNext45Days: vi.fn(async () => {
        calls.push('materialize');
      }),
    } as unknown as RecurrencesRepository;
    const service = new JobsService(jobs, recurrences);

    await service.runDailyMaintenance(new Date('2026-07-26T12:00:00.000Z'));

    expect(calls).toEqual(['materialize', 'recalculate', 'evaluate', 'cleanup']);
  });

  it('does not clean up outside Sunday in Sao Paulo', async () => {
    const calls: string[] = [];
    const jobs = {
      withLock: vi.fn(async (_name: string, work: () => Promise<void>) => {
        await work();
        return true;
      }),
      recalculateCreditSettlements: vi.fn(async () => {
        calls.push('recalculate');
      }),
      evaluateOverBudgetCount: vi.fn(async () => {
        calls.push('evaluate');
        return 0;
      }),
      cleanupExpired: vi.fn(async () => {
        calls.push('cleanup');
      }),
    } as unknown as JobsRepository;
    const recurrences = {
      materializeNext45Days: vi.fn(async () => {
        calls.push('materialize');
      }),
    } as unknown as RecurrencesRepository;
    const service = new JobsService(jobs, recurrences);

    await service.runDailyMaintenance(new Date('2026-07-27T12:00:00.000Z'));

    expect(calls).toEqual(['materialize', 'recalculate', 'evaluate']);
  });
});
