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
});
