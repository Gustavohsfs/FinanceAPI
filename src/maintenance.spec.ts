import type { INestApplicationContext } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';

import { JobsService } from './modules/jobs/jobs.service.js';
import { runMaintenance } from './maintenance.js';

describe('runMaintenance', () => {
  it('runs maintenance and closes the Nest context', async () => {
    const runDailyMaintenance = vi.fn().mockResolvedValue(undefined);
    const logger = {};
    const app = {
      get: vi.fn((token: unknown) => {
        if (token === Logger) return logger;
        if (token === JobsService) return { runDailyMaintenance };
        throw new Error('Unexpected token');
      }),
      useLogger: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as INestApplicationContext;
    const createApplication = vi.fn().mockResolvedValue(app);

    await runMaintenance(createApplication);

    expect(createApplication).toHaveBeenCalledOnce();
    expect(app.useLogger).toHaveBeenCalledWith(logger);
    expect(runDailyMaintenance).toHaveBeenCalledOnce();
    expect(app.close).toHaveBeenCalledOnce();
  });

  it('closes the Nest context when maintenance fails', async () => {
    const failure = new Error('maintenance failed');
    const app = {
      get: vi.fn((token: unknown) => {
        if (token === Logger) return {};
        if (token === JobsService) {
          return { runDailyMaintenance: vi.fn().mockRejectedValue(failure) };
        }
        throw new Error('Unexpected token');
      }),
      useLogger: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as INestApplicationContext;

    await expect(runMaintenance(async () => app)).rejects.toBe(failure);
    expect(app.close).toHaveBeenCalledOnce();
  });
});
