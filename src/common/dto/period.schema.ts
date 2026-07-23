import { z } from 'zod';

export const basisSchema = z.enum(['accrual', 'cash']).default('accrual');
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const isoDateTimeSchema = z.iso.datetime({ offset: true });
