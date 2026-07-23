import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { basisSchema, isoDateTimeSchema, monthSchema } from '../../common/dto/period.schema.js';

export class SummaryQueryDto extends createZodDto(
  z.object({ month: monthSchema, basis: basisSchema }).strict(),
) {}

export class RangeQueryDto extends createZodDto(
  z
    .object({
      from: isoDateTimeSchema,
      to: isoDateTimeSchema,
      type: z.enum(['INCOME', 'EXPENSE']).default('EXPENSE'),
    })
    .strict()
    .refine((value) => value.from <= value.to, { path: ['to'], message: 'período inválido' }),
) {}

export class SeriesQueryDto extends createZodDto(
  z
    .object({
      from: isoDateTimeSchema,
      to: isoDateTimeSchema,
      granularity: z.literal('day').default('day'),
      basis: basisSchema,
    })
    .strict()
    .refine((value) => value.from <= value.to, { path: ['to'], message: 'período inválido' }),
) {}

export class ComparisonQueryDto extends createZodDto(
  z.object({ months: z.coerce.number().int().min(1).max(24).default(6) }).strict(),
) {}

export class BudgetQueryDto extends createZodDto(
  z.object({ month: monthSchema, basis: basisSchema }).strict(),
) {}

export const summaryResponseSchema = z.object({
  month: monthSchema,
  basis: z.enum(['accrual', 'cash']),
  incomeCents: z.number().int(),
  expenseCents: z.number().int(),
  balanceCents: z.number().int(),
  previousBalanceCents: z.number().int(),
  deltaPercent: z.number().int().nullable(),
});
export type SummaryResponse = z.infer<typeof summaryResponseSchema>;
export class SummaryResponseDto extends createZodDto(summaryResponseSchema) {}

export const categoryInsightSchema = z.object({
  categoryId: z.uuid().nullable(),
  categoryName: z.string().nullable(),
  totalCents: z.number().int().nonnegative(),
});
export type CategoryInsight = z.infer<typeof categoryInsightSchema>;
export class CategoryInsightDto extends createZodDto(categoryInsightSchema) {}

export const balancePointSchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cumulativeCents: z.number().int(),
});
export type BalancePoint = z.infer<typeof balancePointSchema>;
export class BalancePointDto extends createZodDto(balancePointSchema) {}

export const monthlyComparisonSchema = z.object({
  month: monthSchema,
  incomeCents: z.number().int().nonnegative(),
  expenseCents: z.number().int().nonnegative(),
});
export type MonthlyComparison = z.infer<typeof monthlyComparisonSchema>;
export class MonthlyComparisonDto extends createZodDto(monthlyComparisonSchema) {}

export const budgetStatusSchema = z.object({
  categoryId: z.uuid(),
  categoryName: z.string(),
  budgetCents: z.number().int().positive(),
  spentCents: z.number().int().nonnegative(),
  overCents: z.number().int().nonnegative(),
  ratio: z.number().nonnegative(),
});
export type BudgetStatus = z.infer<typeof budgetStatusSchema>;
export class BudgetStatusDto extends createZodDto(budgetStatusSchema) {}
