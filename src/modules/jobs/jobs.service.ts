import { Injectable } from '@nestjs/common';

import { RecurrencesRepository } from '../recurrences/recurrences.repository.js';
import { JobsRepository } from './jobs.repository.js';

@Injectable()
export class JobsService {
  constructor(
    private readonly jobs: JobsRepository,
    private readonly recurrences: RecurrencesRepository,
  ) {}

  async runDailyMaintenance(now = new Date()): Promise<void> {
    await this.materializeRecurrences();
    await this.recalculateInvoices();
    await this.evaluateBudgets();

    const weekday = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      weekday: 'short',
    }).format(now);
    if (weekday === 'Sun') {
      await this.cleanupExpired();
    }
  }

  async materializeRecurrences(): Promise<void> {
    await this.jobs.withLock('materialize-recurrences', () =>
      this.recurrences.materializeNext45Days(),
    );
  }

  async recalculateInvoices(): Promise<void> {
    await this.jobs.withLock('recalculate-invoices', () =>
      this.jobs.recalculateCreditSettlements(),
    );
  }

  async evaluateBudgets(): Promise<void> {
    await this.jobs.withLock('evaluate-budgets', async () => {
      await this.jobs.evaluateOverBudgetCount();
    });
  }

  async cleanupExpired(): Promise<void> {
    await this.jobs.withLock('cleanup-expired', () => this.jobs.cleanupExpired());
  }
}
