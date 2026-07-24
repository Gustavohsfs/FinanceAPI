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
  Query,
} from '@nestjs/common';
import { ApiBody, ApiParam } from '@nestjs/swagger';
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
  UpdateCreditCardDto,
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

  @Patch(':id')
  @ZodResponse({ type: CreditCardResponseDto })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiBody({ type: UpdateCreditCardDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateCreditCardDto,
  ): Promise<CreditCardResponse> {
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
