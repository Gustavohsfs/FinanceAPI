import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBody, ApiParam } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';

import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator.js';
import {
  type AccountResponse,
  AccountResponseDto,
  CreateAccountDto,
  UpdateAccountDto,
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

  @Patch(':id')
  @ZodResponse({ type: AccountResponseDto })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiBody({ type: UpdateAccountDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateAccountDto,
  ): Promise<AccountResponse> {
    return this.service.update(user.id, id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.service.delete(user.id, id);
  }
}
