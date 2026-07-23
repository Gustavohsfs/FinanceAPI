import { Injectable } from '@nestjs/common';

import { notFound } from '../../common/errors/domain.error.js';
import type { Goal } from '../../generated/prisma/client.js';
import { CategoriesRepository } from '../categories/categories.repository.js';
import type { CreateGoalDto, GoalProgress, GoalResponse, UpdateGoalDto } from './goals.schemas.js';
import { GoalsRepository } from './goals.repository.js';

function toResponse(goal: Goal): GoalResponse {
  return {
    id: goal.id,
    userId: goal.userId,
    name: goal.name,
    kind: goal.kind,
    targetCents: goal.targetCents,
    categoryId: goal.categoryId,
    startDate: goal.startDate.toISOString(),
    deadline: goal.deadline.toISOString(),
    recurrence: goal.recurrence as 'ONCE' | 'MONTHLY',
    createdAt: goal.createdAt.toISOString(),
    updatedAt: goal.updatedAt.toISOString(),
  };
}

@Injectable()
export class GoalsService {
  constructor(
    private readonly repository: GoalsRepository,
    private readonly categories: CategoriesRepository,
  ) {}

  async list(userId: string): Promise<GoalResponse[]> {
    return (await this.repository.list(userId)).map(toResponse);
  }

  async create(userId: string, input: CreateGoalDto): Promise<GoalResponse> {
    await this.ensureCategory(userId, input.categoryId);
    return toResponse(await this.repository.create(userId, input));
  }

  async update(userId: string, id: string, input: UpdateGoalDto): Promise<GoalResponse> {
    await this.ensureCategory(userId, input.categoryId ?? undefined);
    const goal = await this.repository.update(userId, id, input);
    if (!goal) throw notFound('Meta');
    return toResponse(goal);
  }

  async progress(userId: string, id: string, basis: 'accrual' | 'cash'): Promise<GoalProgress> {
    const goal = await this.repository.findById(userId, id);
    if (!goal) throw notFound('Meta');
    const effectuatedCents = await this.repository.effectuated(userId, goal, basis);
    const ratio = effectuatedCents / goal.targetCents;
    const isOver = goal.kind === 'SPEND_LIMIT' && effectuatedCents > goal.targetCents;
    let projectionLabel: string;
    if (goal.kind === 'SPEND_LIMIT') {
      projectionLabel = isOver
        ? 'limite estourado neste mês'
        : `restam ${String(Math.max(0, Math.round((1 - ratio) * 100)))}% do limite`;
    } else if (effectuatedCents >= goal.targetCents) {
      projectionLabel = 'alvo atingido';
    } else {
      const elapsedDays = Math.max(
        1,
        Math.floor((Date.now() - goal.startDate.getTime()) / 86_400_000),
      );
      const pace = effectuatedCents / elapsedDays;
      if (pace <= 0) {
        projectionLabel = 'sem ritmo de aporte ainda';
      } else {
        const eta = new Date(
          Date.now() + Math.ceil((goal.targetCents - effectuatedCents) / pace) * 86_400_000,
        );
        const etaMonth = eta.toISOString().slice(0, 7);
        projectionLabel =
          eta > goal.deadline
            ? `no ritmo atual você chega em ${etaMonth} — depois do alvo`
            : `no ritmo atual você chega em ${etaMonth}`;
      }
    }
    return {
      goalId: goal.id,
      plannedCents: goal.targetCents,
      effectuatedCents,
      ratio,
      isOver,
      projectionLabel,
    };
  }

  private async ensureCategory(userId: string, categoryId: string | undefined): Promise<void> {
    if (categoryId && !(await this.categories.findById(userId, categoryId))) {
      throw notFound('Categoria');
    }
  }
}
