import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ZodResponse } from 'nestjs-zod';

import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator.js';
import {
  CreateGoalDto,
  type GoalProgress,
  GoalProgressDto,
  GoalProgressQueryDto,
  type GoalResponse,
  GoalResponseDto,
  UpdateGoalDto,
} from './goals.schemas.js';
import { GoalsService } from './goals.service.js';

@Controller('v1/goals')
export class GoalsController {
  constructor(private readonly service: GoalsService) {}

  @Get()
  @ZodResponse({ type: [GoalResponseDto] })
  list(@CurrentUser() user: AuthenticatedUser): Promise<GoalResponse[]> {
    return this.service.list(user.id);
  }

  @Post()
  @ZodResponse({ status: 201, type: GoalResponseDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateGoalDto,
  ): Promise<GoalResponse> {
    return this.service.create(user.id, input);
  }

  @Patch(':id')
  @ZodResponse({ type: GoalResponseDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: UpdateGoalDto,
  ): Promise<GoalResponse> {
    return this.service.update(user.id, id, input);
  }

  @Get(':id/progress')
  @ZodResponse({ type: GoalProgressDto })
  progress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: GoalProgressQueryDto,
  ): Promise<GoalProgress> {
    return this.service.progress(user.id, id, query.basis);
  }
}
