import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { basisSchema, isoDateTimeSchema } from '../../common/dto/period.schema.js';
import { paginationMetaSchema } from '../../common/dto/pagination.schema.js';

export const transactionTypeSchema = z.enum(['INCOME', 'EXPENSE', 'TRANSFER']);
export const paymentMethodSchema = z.enum(['CASH', 'PIX', 'DEBIT', 'CREDIT']);

export const createTransactionSchema = z
  .object({
    type: transactionTypeSchema,
    amountCents: z.number().int().positive(),
    description: z.string().trim().max(120).default(''),
    occurredAt: isoDateTimeSchema,
    settledAt: isoDateTimeSchema.nullable().optional(),
    categoryId: z.uuid().optional(),
    accountId: z.uuid(),
    creditCardId: z.uuid().optional(),
    paymentMethod: paymentMethodSchema,
    installmentTotal: z.number().int().min(1).max(24).default(1),
    currency: z.string().length(3).default('BRL'),
    notes: z.string().max(2_000).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.installmentTotal > 1 && value.paymentMethod !== 'CREDIT') {
      context.addIssue({
        code: 'custom',
        path: ['installmentTotal'],
        message: 'parcelamento exige pagamento no crédito',
      });
    }
    if (value.paymentMethod === 'CREDIT' && !value.creditCardId) {
      context.addIssue({
        code: 'custom',
        path: ['creditCardId'],
        message: 'pagamento no crédito exige um cartão',
      });
    }
    if (value.paymentMethod !== 'CREDIT' && value.creditCardId) {
      context.addIssue({
        code: 'custom',
        path: ['creditCardId'],
        message: 'cartão só pode ser informado para pagamento no crédito',
      });
    }
    if (value.type !== 'TRANSFER' && !value.categoryId) {
      context.addIssue({
        code: 'custom',
        path: ['categoryId'],
        message: 'categoria é obrigatória para entrada ou saída',
      });
    }
  });

export class CreateTransactionDto extends createZodDto(createTransactionSchema) {}

export class UpdateTransactionDto extends createZodDto(
  z
    .object({
      amountCents: z.number().int().positive().optional(),
      description: z.string().trim().min(1).max(120).optional(),
      occurredAt: isoDateTimeSchema.optional(),
      settledAt: isoDateTimeSchema.nullable().optional(),
      categoryId: z.uuid().nullable().optional(),
      accountId: z.uuid().optional(),
      creditCardId: z.uuid().nullable().optional(),
      paymentMethod: paymentMethodSchema.optional(),
      notes: z.string().max(2_000).nullable().optional(),
      isProjected: z.boolean().optional(),
    })
    .strict()
    .refine((value) => Object.keys(value).length > 0, 'envie ao menos um campo'),
) {}

export class TransactionScopeQueryDto extends createZodDto(
  z.object({ scope: z.enum(['one', 'future', 'all']).default('one') }).strict(),
) {}

export const transactionsQuerySchema = z
  .object({
    from: isoDateTimeSchema.optional(),
    to: isoDateTimeSchema.optional(),
    type: transactionTypeSchema.optional(),
    categoryId: z.uuid().optional(),
    accountId: z.uuid().optional(),
    creditCardId: z.uuid().optional(),
    method: paymentMethodSchema.optional(),
    basis: basisSchema,
    cursor: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict()
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    path: ['to'],
    message: 'to deve ser posterior a from',
  });

export class TransactionsQueryDto extends createZodDto(transactionsQuerySchema) {}

export const transactionResponseSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  type: transactionTypeSchema,
  amountCents: z.number().int().nonnegative(),
  description: z.string(),
  occurredAt: z.iso.datetime(),
  settledAt: z.iso.datetime().nullable(),
  categoryId: z.uuid().nullable(),
  accountId: z.uuid(),
  creditCardId: z.uuid().nullable(),
  paymentMethod: paymentMethodSchema,
  installmentGroupId: z.uuid().nullable(),
  installmentNumber: z.number().int().nullable(),
  installmentTotal: z.number().int().nullable(),
  isProjected: z.boolean(),
  recurrenceId: z.uuid().nullable(),
  currency: z.string().length(3),
  notes: z.string().nullable(),
  source: z.enum(['MANUAL', 'RECURRENCE', 'OPEN_FINANCE']),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
});

export type TransactionResponse = z.infer<typeof transactionResponseSchema>;
export class TransactionResponseDto extends createZodDto(transactionResponseSchema) {}

export const transactionsPageSchema = z.object({
  data: z.array(transactionResponseSchema),
  meta: paginationMetaSchema,
});
export type TransactionsPage = z.infer<typeof transactionsPageSchema>;
export class TransactionsPageDto extends createZodDto(transactionsPageSchema) {}
