import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ZodResponse } from 'nestjs-zod';

import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator.js';
import {
  CreateCreditCardDto,
  type CreditCardResponse,
  CreditCardResponseDto,
  type InvoiceResponse,
  InvoiceResponseDto,
  InvoiceQueryDto,
} from './credit-cards.schemas.js';
import { CreditCardsService } from './credit-cards.service.js';

@Controller('v1/credit-cards')
export class CreditCardsController {
  constructor(private readonly service: CreditCardsService) {}

  @Get()
  @ZodResponse({ type: [CreditCardResponseDto] })
  list(@CurrentUser() user: AuthenticatedUser): Promise<CreditCardResponse[]> {
    return this.service.list(user.id);
  }

  @Post()
  @ZodResponse({ status: 201, type: CreditCardResponseDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateCreditCardDto,
  ): Promise<CreditCardResponse> {
    return this.service.create(user.id, input);
  }

  @Get(':id/invoices')
  @ZodResponse({ type: InvoiceResponseDto })
  invoice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: InvoiceQueryDto,
  ): Promise<InvoiceResponse> {
    return this.service.invoice(user.id, id, query.month);
  }
}
