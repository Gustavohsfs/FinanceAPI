import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service.js';
import type { CreateCategoryDto, UpdateCategoryDto } from './categories.schemas.js';

@Injectable()
export class CategoriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string, type: 'INCOME' | 'EXPENSE' | undefined, includeArchived: boolean) {
    return this.prisma.category.findMany({
      where: {
        userId,
        deletedAt: null,
        ...(type ? { type } : {}),
        ...(includeArchived ? {} : { isArchived: false }),
      },
      orderBy: [{ type: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    });
  }

  findById(userId: string, id: string) {
    return this.prisma.category.findFirst({ where: { id, userId, deletedAt: null } });
  }

  create(userId: string, input: CreateCategoryDto) {
    return this.prisma.category.create({
      data: {
        userId,
        name: input.name,
        icon: input.icon,
        color: input.color,
        type: input.type,
        ...(input.parentId ? { parentId: input.parentId } : {}),
        ...(input.monthlyBudgetCents !== undefined
          ? { monthlyBudgetCents: input.monthlyBudgetCents }
          : {}),
      },
    });
  }

  update(userId: string, id: string, input: UpdateCategoryDto) {
    return this.prisma.category.update({
      where: { id, userId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.icon !== undefined ? { icon: input.icon } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
        ...(input.monthlyBudgetCents !== undefined
          ? { monthlyBudgetCents: input.monthlyBudgetCents }
          : {}),
      },
    });
  }

  archive(userId: string, id: string) {
    return this.prisma.category.update({
      where: { id, userId },
      data: { isArchived: true },
    });
  }
}
