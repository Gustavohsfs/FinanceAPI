import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { isoDateTimeSchema } from '../../common/dto/period.schema.js';
import {
  paymentMethodSchema,
  transactionResponseSchema,
  transactionTypeSchema,
} from '../transactions/transactions.schemas.js';

export const createRecurrenceSchema = z
  .object({
    type: transactionTypeSchema.exclude(['TRANSFER']),
    amountCents: z.number().int().positive(),
    description: z.string().trim().min(1).max(120),
    categoryId: z.uuid().optional(),
    accountId: z.uuid(),
    creditCardId: z.uuid().optional(),
    paymentMethod: paymentMethodSchema,
    frequency: z.literal('MONTHLY').default('MONTHLY'),
    dayOfMonth: z.number().int().min(1).max(31),
    nextOccurrenceAt: isoDateTimeSchema,
    currency: z.string().length(3).default('BRL'),
    notes: z.string().max(2_000).optional(),
  })
  .strict();
export class CreateRecurrenceDto extends createZodDto(createRecurrenceSchema) {}

export const recurrenceResponseSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  type: transactionTypeSchema.exclude(['TRANSFER']),
  amountCents: z.number().int().positive(),
  description: z.string(),
  categoryId: z.uuid().nullable(),
  accountId: z.uuid(),
  creditCardId: z.uuid().nullable(),
  paymentMethod: paymentMethodSchema,
  frequency: z.literal('MONTHLY'),
  dayOfMonth: z.number().int().min(1).max(31),
  nextOccurrenceAt: z.iso.datetime(),
  isActive: z.boolean(),
  currency: z.string().length(3),
  notes: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type RecurrenceResponse = z.infer<typeof recurrenceResponseSchema>;
export class RecurrenceResponseDto extends createZodDto(recurrenceResponseSchema) {}
export class ConfirmedTransactionDto extends createZodDto(transactionResponseSchema) {}
