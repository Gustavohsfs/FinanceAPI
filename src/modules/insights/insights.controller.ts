import { Controller, Get, Query } from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';

import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator.js';
import {
  type BalancePoint,
  BalancePointDto,
  BudgetQueryDto,
  type BudgetStatus,
  BudgetStatusDto,
  type CategoryInsight,
  CategoryInsightDto,
  ComparisonQueryDto,
  type MonthlyComparison,
  MonthlyComparisonDto,
  RangeQueryDto,
  SeriesQueryDto,
  SummaryQueryDto,
  type SummaryResponse,
  SummaryResponseDto,
} from './insights.schemas.js';
import { InsightsService } from './insights.service.js';

@Controller('v1/insights')
export class InsightsController {
  constructor(private readonly service: InsightsService) {}

  @Get('summary')
  @ZodResponse({ type: SummaryResponseDto })
  summary(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SummaryQueryDto,
  ): Promise<SummaryResponse> {
    return this.service.summary(user.id, query.month, query.basis);
  }

  @Get('by-category')
  @ZodResponse({ type: [CategoryInsightDto] })
  @ApiQuery({
    name: 'from',
    type: 'string',
    format: 'date-time',
    required: true,
    description: 'Limite inferior inclusivo do intervalo [from, to).',
  })
  @ApiQuery({
    name: 'to',
    type: 'string',
    format: 'date-time',
    required: true,
    description: 'Limite superior exclusivo do intervalo [from, to).',
  })
  byCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: RangeQueryDto,
  ): Promise<CategoryInsight[]> {
    return this.service.byCategory(user.id, query.from, query.to, query.type);
  }

  @Get('balance-series')
  @ZodResponse({ type: [BalancePointDto] })
  @ApiQuery({
    name: 'from',
    type: 'string',
    format: 'date-time',
    required: true,
    description: 'Limite inferior inclusivo do intervalo [from, to).',
  })
  @ApiQuery({
    name: 'to',
    type: 'string',
    format: 'date-time',
    required: true,
    description: 'Limite superior exclusivo do intervalo [from, to).',
  })
  balanceSeries(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SeriesQueryDto,
  ): Promise<BalancePoint[]> {
    return this.service.balanceSeries(user.id, query.from, query.to, query.basis);
  }

  @Get('monthly-comparison')
  @ZodResponse({ type: [MonthlyComparisonDto] })
  monthlyComparison(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ComparisonQueryDto,
  ): Promise<MonthlyComparison[]> {
    return this.service.monthlyComparison(user.id, query.months);
  }

  @Get('budget-status')
  @ZodResponse({ type: [BudgetStatusDto] })
  budgetStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: BudgetQueryDto,
  ): Promise<BudgetStatus[]> {
    return this.service.budgetStatus(user.id, query.month, query.basis);
  }
}
