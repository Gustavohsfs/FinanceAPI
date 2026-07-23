import { Injectable } from '@nestjs/common';

import { notFound } from '../../common/errors/domain.error.js';
import type { Category } from '../../generated/prisma/client.js';
import type {
  CategoryResponse,
  CreateCategoryDto,
  UpdateCategoryDto,
} from './categories.schemas.js';
import { CategoriesRepository } from './categories.repository.js';

function toResponse(category: Category): CategoryResponse {
  return {
    id: category.id,
    userId: category.userId,
    name: category.name,
    icon: category.icon,
    color: category.color,
    type: category.type as 'INCOME' | 'EXPENSE',
    parentId: category.parentId,
    monthlyBudgetCents: category.monthlyBudgetCents,
    isArchived: category.isArchived,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  };
}

@Injectable()
export class CategoriesService {
  constructor(private readonly repository: CategoriesRepository) {}

  async list(
    userId: string,
    type: 'INCOME' | 'EXPENSE' | undefined,
    includeArchived: boolean,
  ): Promise<CategoryResponse[]> {
    return (await this.repository.list(userId, type, includeArchived)).map(toResponse);
  }

  async create(userId: string, input: CreateCategoryDto): Promise<CategoryResponse> {
    await this.ensureParent(userId, input.parentId);
    return toResponse(await this.repository.create(userId, input));
  }

  async update(userId: string, id: string, input: UpdateCategoryDto): Promise<CategoryResponse> {
    if (!(await this.repository.findById(userId, id))) throw notFound('Categoria');
    await this.ensureParent(userId, input.parentId);
    return toResponse(await this.repository.update(userId, id, input));
  }

  async archive(userId: string, id: string): Promise<CategoryResponse> {
    if (!(await this.repository.findById(userId, id))) throw notFound('Categoria');
    return toResponse(await this.repository.archive(userId, id));
  }

  private async ensureParent(userId: string, parentId: string | undefined): Promise<void> {
    if (parentId && !(await this.repository.findById(userId, parentId))) {
      throw notFound('Categoria pai');
    }
  }
}
