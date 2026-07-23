import { Injectable } from '@nestjs/common';

import type { Account } from '../../generated/prisma/client.js';
import type { AccountResponse, CreateAccountDto } from './accounts.schemas.js';
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

@Injectable()
export class AccountsService {
  constructor(private readonly repository: AccountsRepository) {}

  async list(userId: string): Promise<AccountResponse[]> {
    return (await this.repository.list(userId)).map(toResponse);
  }

  async create(userId: string, input: CreateAccountDto): Promise<AccountResponse> {
    return toResponse(await this.repository.create(userId, input));
  }
}
