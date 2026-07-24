import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const accountKindSchema = z.enum(['CHECKING', 'CASH', 'SAVINGS', 'INVESTMENT']);

export const createAccountSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    kind: accountKindSchema,
    openingBalanceCents: z.number().int().nonnegative().default(0),
    currency: z.string().length(3).default('BRL'),
  })
  .strict();

export class CreateAccountDto extends createZodDto(createAccountSchema) {}

export const updateAccountSchema = createAccountSchema
  .extend({
    openingBalanceCents: createAccountSchema.shape.openingBalanceCents.unwrap(),
    currency: createAccountSchema.shape.currency.unwrap(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'envie ao menos um campo')
  .meta({ minProperties: 1 });

export class UpdateAccountDto extends createZodDto(updateAccountSchema) {}

export const accountResponseSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  name: z.string(),
  kind: accountKindSchema,
  openingBalanceCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type AccountResponse = z.infer<typeof accountResponseSchema>;
export class AccountResponseDto extends createZodDto(accountResponseSchema) {}
