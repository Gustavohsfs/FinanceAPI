import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';

import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator.js';
import {
  CreateTransactionDto,
  TransactionResponseDto,
  type TransactionResponse,
  TransactionScopeQueryDto,
  type TransactionsPage,
  TransactionsPageDto,
  TransactionsQueryDto,
  UpdateTransactionDto,
} from './transactions.schemas.js';
import { TransactionsService } from './transactions.service.js';

@Controller('v1/transactions')
export class TransactionsController {
  constructor(private readonly service: TransactionsService) {}

  @Get()
  @ZodResponse({ type: TransactionsPageDto })
  @ApiQuery({
    name: 'from',
    type: 'string',
    format: 'date-time',
    required: false,
    description: 'Limite inferior inclusivo do intervalo [from, to).',
  })
  @ApiQuery({
    name: 'to',
    type: 'string',
    format: 'date-time',
    required: false,
    description: 'Limite superior exclusivo do intervalo [from, to).',
  })
  @ApiQuery({ name: 'creditCardId', type: 'string', format: 'uuid', required: false })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: TransactionsQueryDto,
  ): Promise<TransactionsPage> {
    return this.service.list(user.id, query);
  }

  @Post()
  @ZodResponse({ status: 201, type: [TransactionResponseDto] })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateTransactionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<TransactionResponse[]> {
    return this.service.create(user.id, input, idempotencyKey);
  }

  @Get(':id')
  @ZodResponse({ type: TransactionResponseDto })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TransactionResponse> {
    return this.service.get(user.id, id);
  }

  @Patch(':id')
  @ZodResponse({ type: [TransactionResponseDto] })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: TransactionScopeQueryDto,
    @Body() input: UpdateTransactionDto,
  ): Promise<TransactionResponse[]> {
    return this.service.update(user.id, id, query.scope, input);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: TransactionScopeQueryDto,
  ): Promise<void> {
    await this.service.delete(user.id, id, query.scope);
  }
}
