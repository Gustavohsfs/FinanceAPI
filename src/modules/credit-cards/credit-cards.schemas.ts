import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { monthSchema } from '../../common/dto/period.schema.js';

export const createCreditCardSchema = z
  .object({
    accountId: z.uuid(),
    name: z.string().trim().min(1).max(80),
    limitCents: z.number().int().nonnegative(),
    closingDay: z.number().int().min(1).max(31),
    dueDay: z.number().int().min(1).max(31),
  })
  .strict();

export class CreateCreditCardDto extends createZodDto(createCreditCardSchema) {}
export class InvoiceQueryDto extends createZodDto(z.object({ month: monthSchema }).strict()) {}

export const creditCardResponseSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  accountId: z.uuid(),
  name: z.string(),
  limitCents: z.number().int().nonnegative(),
  closingDay: z.number().int().min(1).max(31),
  dueDay: z.number().int().min(1).max(31),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type CreditCardResponse = z.infer<typeof creditCardResponseSchema>;
export class CreditCardResponseDto extends createZodDto(creditCardResponseSchema) {}

export const invoiceResponseSchema = z.object({
  creditCardId: z.uuid(),
  month: monthSchema,
  totalCents: z.number().int().nonnegative(),
  status: z.enum(['OPEN', 'CLOSED']),
});

export type InvoiceResponse = z.infer<typeof invoiceResponseSchema>;
export class InvoiceResponseDto extends createZodDto(invoiceResponseSchema) {}
