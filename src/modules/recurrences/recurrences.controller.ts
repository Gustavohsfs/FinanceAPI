import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ZodResponse } from 'nestjs-zod';

import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator.js';
import type { TransactionResponse } from '../transactions/transactions.schemas.js';
import {
  ConfirmedTransactionDto,
  CreateRecurrenceDto,
  type RecurrenceResponse,
  RecurrenceResponseDto,
} from './recurrences.schemas.js';
import { RecurrencesService } from './recurrences.service.js';

@Controller('v1/recurrences')
export class RecurrencesController {
  constructor(private readonly service: RecurrencesService) {}

  @Get()
  @ZodResponse({ type: [RecurrenceResponseDto] })
  list(@CurrentUser() user: AuthenticatedUser): Promise<RecurrenceResponse[]> {
    return this.service.list(user.id);
  }

  @Post()
  @ZodResponse({ status: 201, type: RecurrenceResponseDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateRecurrenceDto,
  ): Promise<RecurrenceResponse> {
    return this.service.create(user.id, input);
  }

  @Post(':id/confirm')
  @ZodResponse({ type: ConfirmedTransactionDto })
  confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TransactionResponse> {
    return this.service.confirm(user.id, id);
  }
}
