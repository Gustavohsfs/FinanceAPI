import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { basisSchema, isoDateTimeSchema } from '../../common/dto/period.schema.js';

export const goalKindSchema = z.enum(['SAVING', 'INVESTMENT', 'SPEND_LIMIT']);

export const createGoalSchema = z
  .object({
    name: z.string().trim().min(1).max(50),
    kind: goalKindSchema,
    targetCents: z.number().int().positive(),
    categoryId: z.uuid().optional(),
    startDate: isoDateTimeSchema,
    deadline: isoDateTimeSchema,
    recurrence: z.enum(['ONCE', 'MONTHLY']),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.kind === 'SPEND_LIMIT' && !value.categoryId) {
      context.addIssue({
        code: 'custom',
        path: ['categoryId'],
        message: 'limite de gasto exige uma categoria',
      });
    }
    if (value.deadline < value.startDate) {
      context.addIssue({
        code: 'custom',
        path: ['deadline'],
        message: 'deadline deve ser posterior ao início',
      });
    }
  });

export class CreateGoalDto extends createZodDto(createGoalSchema) {}
export class UpdateGoalDto extends createZodDto(
  z
    .object({
      name: z.string().trim().min(1).max(50).optional(),
      targetCents: z.number().int().positive().optional(),
      categoryId: z.uuid().nullable().optional(),
      startDate: isoDateTimeSchema.optional(),
      deadline: isoDateTimeSchema.optional(),
      recurrence: z.enum(['ONCE', 'MONTHLY']).optional(),
    })
    .strict()
    .refine((value) => Object.keys(value).length > 0, 'envie ao menos um campo'),
) {}
export class GoalProgressQueryDto extends createZodDto(z.object({ basis: basisSchema }).strict()) {}

export const goalResponseSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  name: z.string(),
  kind: goalKindSchema,
  targetCents: z.number().int().positive(),
  categoryId: z.uuid().nullable(),
  startDate: z.iso.datetime(),
  deadline: z.iso.datetime(),
  recurrence: z.enum(['ONCE', 'MONTHLY']),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type GoalResponse = z.infer<typeof goalResponseSchema>;
export class GoalResponseDto extends createZodDto(goalResponseSchema) {}

export const goalProgressSchema = z.object({
  goalId: z.uuid(),
  plannedCents: z.number().int().positive(),
  effectuatedCents: z.number().int().nonnegative(),
  ratio: z.number().nonnegative(),
  isOver: z.boolean(),
  projectionLabel: z.string(),
});
export type GoalProgress = z.infer<typeof goalProgressSchema>;
export class GoalProgressDto extends createZodDto(goalProgressSchema) {}
