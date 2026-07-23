import { z } from 'zod';

import { DomainError } from '../errors/domain.error.js';

const cursorSchema = z.object({
  id: z.uuid(),
  occurredAt: z.iso.datetime({ offset: true }),
});

export type Cursor = z.infer<typeof cursorSchema>;

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCursor(value: string): Cursor {
  try {
    const decoded: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    return cursorSchema.parse(decoded);
  } catch {
    throw new DomainError(
      'PAGINATION_INVALID_CURSOR',
      400,
      'Cursor inválido',
      'O cursor de paginação é inválido ou expirou.',
    );
  }
}
