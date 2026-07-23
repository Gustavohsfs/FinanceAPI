import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const categoryTypeSchema = z.enum(['INCOME', 'EXPENSE']);

export const createCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    icon: z.string().min(1).max(64),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    type: categoryTypeSchema,
    parentId: z.uuid().optional(),
    monthlyBudgetCents: z.number().int().nonnegative().optional(),
  })
  .strict();

export class CreateCategoryDto extends createZodDto(createCategorySchema) {}

export class UpdateCategoryDto extends createZodDto(
  createCategorySchema
    .omit({ type: true })
    .partial()
    .refine((value) => Object.keys(value).length > 0, 'envie ao menos um campo'),
) {}

export class CategoriesQueryDto extends createZodDto(
  z
    .object({
      type: categoryTypeSchema.optional(),
      includeArchived: z
        .enum(['true', 'false'])
        .transform((value) => value === 'true')
        .default(false),
    })
    .strict(),
) {}

export const categoryResponseSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  name: z.string(),
  icon: z.string(),
  color: z.string(),
  type: categoryTypeSchema,
  parentId: z.uuid().nullable(),
  monthlyBudgetCents: z.number().int().nonnegative().nullable(),
  isArchived: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type CategoryResponse = z.infer<typeof categoryResponseSchema>;
export class CategoryResponseDto extends createZodDto(categoryResponseSchema) {}
