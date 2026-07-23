import { Body, Controller, Get, Post } from '@nestjs/common';
import { ZodResponse } from 'nestjs-zod';

import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator.js';
import {
  type AccountResponse,
  AccountResponseDto,
  CreateAccountDto,
} from './accounts.schemas.js';
import { AccountsService } from './accounts.service.js';

@Controller('v1/accounts')
export class AccountsController {
  constructor(private readonly service: AccountsService) {}

  @Get()
  @ZodResponse({ type: [AccountResponseDto] })
  list(@CurrentUser() user: AuthenticatedUser): Promise<AccountResponse[]> {
    return this.service.list(user.id);
  }

  @Post()
  @ZodResponse({ status: 201, type: AccountResponseDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateAccountDto,
  ): Promise<AccountResponse> {
    return this.service.create(user.id, input);
  }
}
