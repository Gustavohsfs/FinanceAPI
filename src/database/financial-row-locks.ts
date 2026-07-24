import { Prisma } from '../generated/prisma/client.js';

export interface LockedCreditCardCalendar {
  id: string;
  closingDay: number;
  dueDay: number;
}

export async function lockUserForUpdate(
  database: Prisma.TransactionClient,
  userId: string,
): Promise<boolean> {
  const rows = await database.$queryRaw<readonly { id: string }[]>(Prisma.sql`
    SELECT id
    FROM users
    WHERE id = ${userId}::uuid
    FOR UPDATE
  `);
  return rows.length === 1;
}

export async function lockActiveCreditCardForUpdate(
  database: Prisma.TransactionClient,
  userId: string,
  creditCardId: string,
): Promise<LockedCreditCardCalendar | null> {
  const rows = await database.$queryRaw<readonly LockedCreditCardCalendar[]>(Prisma.sql`
    SELECT
      id,
      closing_day AS "closingDay",
      due_day AS "dueDay"
    FROM credit_cards
    WHERE id = ${creditCardId}::uuid
      AND user_id = ${userId}::uuid
      AND deleted_at IS NULL
    FOR UPDATE
  `);
  return rows[0] ?? null;
}
