import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { RecurrencesRepository } from '../recurrences/recurrences.repository.js';
import { JobsRepository } from './jobs.repository.js';

@Injectable()
export class JobsService {
  constructor(
    private readonly jobs: JobsRepository,
    private readonly recurrences: RecurrencesRepository,
  ) {}

  @Cron('0 3 * * *', { timeZone: 'America/Sao_Paulo' })
  async materializeRecurrences(): Promise<void> {
    await this.jobs.withLock('materialize-recurrences', () =>
      this.recurrences.materializeNext45Days(),
    );
  }

  @Cron('0 4 * * *', { timeZone: 'America/Sao_Paulo' })
  async recalculateInvoices(): Promise<void> {
    await this.jobs.withLock('recalculate-invoices', () =>
      this.jobs.recalculateCreditSettlements(),
    );
  }

  @Cron('0 9 * * *', { timeZone: 'America/Sao_Paulo' })
  async evaluateBudgets(): Promise<void> {
    await this.jobs.withLock('evaluate-budgets', async () => {
      await this.jobs.evaluateOverBudgetCount();
    });
  }

  @Cron('0 5 * * 0', { timeZone: 'America/Sao_Paulo' })
  async cleanupExpired(): Promise<void> {
    await this.jobs.withLock('cleanup-expired', () => this.jobs.cleanupExpired());
  }
}
