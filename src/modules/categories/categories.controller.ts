import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ZodResponse } from 'nestjs-zod';

import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator.js';
import {
  CategoriesQueryDto,
  type CategoryResponse,
  CategoryResponseDto,
  CreateCategoryDto,
  UpdateCategoryDto,
} from './categories.schemas.js';
import { CategoriesService } from './categories.service.js';

@Controller('v1/categories')
export class CategoriesController {
  constructor(private readonly service: CategoriesService) {}

  @Get()
  @ZodResponse({ type: [CategoryResponseDto] })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CategoriesQueryDto,
  ): Promise<CategoryResponse[]> {
    return this.service.list(user.id, query.type, query.includeArchived);
  }

  @Post()
  @ZodResponse({ status: 201, type: CategoryResponseDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateCategoryDto,
  ): Promise<CategoryResponse> {
    return this.service.create(user.id, input);
  }

  @Patch(':id')
  @ZodResponse({ type: CategoryResponseDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() input: UpdateCategoryDto,
  ): Promise<CategoryResponse> {
    return this.service.update(user.id, id, input);
  }

  @Post(':id/archive')
  @ZodResponse({ type: CategoryResponseDto })
  archive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<CategoryResponse> {
    return this.service.archive(user.id, id);
  }
}
