import { Injectable } from '@nestjs/common';

import { DomainError, notFound } from '../../common/errors/domain.error.js';
import type { Account } from '../../generated/prisma/client.js';
import type { AccountResponse, CreateAccountDto, UpdateAccountDto } from './accounts.schemas.js';
import { AccountsRepository } from './accounts.repository.js';

function toResponse(account: Account): AccountResponse {
  return {
    id: account.id,
    userId: account.userId,
    name: account.name,
    kind: account.kind,
    openingBalanceCents: account.openingBalanceCents,
    currency: account.currency,
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  };
}

function isRecordNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2025'
  );
}

@Injectable()
export class AccountsService {
  constructor(private readonly repository: AccountsRepository) {}

  async list(userId: string): Promise<AccountResponse[]> {
    return (await this.repository.list(userId)).map(toResponse);
  }

  async create(userId: string, input: CreateAccountDto): Promise<AccountResponse> {
    return toResponse(await this.repository.create(userId, input));
  }

  async update(userId: string, id: string, input: UpdateAccountDto): Promise<AccountResponse> {
    if (!(await this.repository.findById(userId, id))) throw notFound('Conta');
    try {
      return toResponse(await this.repository.update(userId, id, input));
    } catch (error) {
      if (isRecordNotFound(error)) throw notFound('Conta');
      throw error;
    }
  }

  async delete(userId: string, id: string): Promise<void> {
    const facts = await this.repository.softDeleteGuarded(userId, id);
    switch (facts.status) {
      case 'deleted':
        return;
      case 'not-found':
        throw notFound('Conta');
      case 'last-active':
        throw new DomainError(
          'ACCOUNT_LAST_ACTIVE',
          409,
          'Última conta ativa',
          'Crie outra conta antes de excluir esta.',
        );
      case 'has-active-cards':
        throw new DomainError(
          'ACCOUNT_HAS_ACTIVE_CARDS',
          409,
          'Conta com cartões ativos',
          'Exclua ou desative os cartões vinculados antes de excluir esta conta.',
        );
      case 'has-active-recurrences':
        throw new DomainError(
          'ACCOUNT_HAS_ACTIVE_RECURRENCES',
          409,
          'Conta com recorrências ativas',
          'Exclua ou desative as recorrências vinculadas antes de excluir esta conta.',
        );
    }
  }
}
