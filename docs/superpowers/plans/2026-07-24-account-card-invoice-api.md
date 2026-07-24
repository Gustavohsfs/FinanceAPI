# Account, Card, and Invoice API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add user-scoped editing and soft deletion for accounts and credit cards, recalculate credit settlements after card calendar changes, and filter invoice transactions by card.

**Architecture:** Keep the existing controller → service → repository dependency direction. Controllers expose Zod contracts, services map repository facts to domain errors and calculate settlement dates, and repositories alone use Prisma for user-scoped atomic writes and audit records.

**Tech Stack:** Node 22, NestJS 11.1, Fastify, Prisma 7.9, PostgreSQL/Neon, Zod 4, Vitest, OpenAPI 3.1.

## Global Constraints

- Money is always an integer number of cents; no `float`, `Decimal`, `parseFloat`, or `toFixed`.
- `userId` comes only from the authenticated token.
- All business records use soft delete; no physical account, card, or transaction deletion.
- A foreign or deleted resource returns 404, never 403.
- Only repositories import `PrismaService`.
- Controllers contain no business rules and services throw `DomainError`, not `HttpException`.
- Card and affected transaction audit writes are atomic with the mutation.
- No migration or Prisma schema change is needed.
- Files use `kebab-case.type.ts`; DTOs use `PascalCaseDto`; errors use stable `SCREAMING_SNAKE` codes.

---

## File Structure

- `src/modules/accounts/accounts.schemas.ts`: update account request contract.
- `src/modules/accounts/accounts.controller.ts`: `PATCH` and `DELETE` HTTP surface.
- `src/modules/accounts/accounts.service.ts`: account existence and deletion-conflict rules.
- `src/modules/accounts/accounts.repository.ts`: scoped account update, dependency facts, and soft delete.
- `src/modules/accounts/accounts.service.spec.ts`: service behavior and error-code tests.
- `src/modules/credit-cards/credit-cards.schemas.ts`: update card request contract.
- `src/modules/credit-cards/credit-cards.controller.ts`: `PATCH` and `DELETE` HTTP surface.
- `src/modules/credit-cards/credit-cards.service.ts`: account validation, settlement calculation, and conflict mapping.
- `src/modules/credit-cards/credit-cards.repository.ts`: scoped update/delete, audit, and atomic settlement writes.
- `src/modules/credit-cards/credit-cards.service.spec.ts`: card lifecycle tests.
- `src/modules/transactions/transactions.schemas.ts`: `creditCardId` list filter.
- `src/modules/transactions/transactions.repository.ts`: apply the card filter.
- `src/modules/transactions/transactions.repository.spec.ts`: query construction test.
- `src/modules/catalogs.schemas.spec.ts`: update DTO validation tests.
- `src/common/errors/error-codes.ts`: four stable conflict codes.
- `test/openapi.spec.ts`: new method and query-parameter assertions.
- `docs/openapi.json`: regenerated public contract.

### Task 1: Define update contracts and stable conflict codes

**Files:**
- Modify: `src/common/errors/error-codes.ts`
- Modify: `src/modules/accounts/accounts.schemas.ts`
- Modify: `src/modules/credit-cards/credit-cards.schemas.ts`
- Modify: `src/modules/catalogs.schemas.spec.ts`

**Interfaces:**
- Produces: `UpdateAccountDto`, `updateAccountSchema`
- Produces: `UpdateCreditCardDto`, `updateCreditCardSchema`
- Produces error codes: `ACCOUNT_LAST_ACTIVE`, `ACCOUNT_HAS_ACTIVE_CARDS`, `ACCOUNT_HAS_ACTIVE_RECURRENCES`, `CREDIT_CARD_HAS_ACTIVE_RECURRENCES`

- [ ] **Step 1: Write failing schema tests**

Add imports and cases to `src/modules/catalogs.schemas.spec.ts`:

```ts
import {
  createAccountSchema,
  updateAccountSchema,
} from './accounts/accounts.schemas.js';
import {
  createCreditCardSchema,
  updateCreditCardSchema,
} from './credit-cards/credit-cards.schemas.js';

it('accepts partial account updates and rejects empty bodies', () => {
  expect(updateAccountSchema.parse({ name: 'Conta conjunta' })).toEqual({
    name: 'Conta conjunta',
  });
  expect(() => updateAccountSchema.parse({})).toThrow();
  expect(() => updateAccountSchema.parse({ openingBalanceCents: 10.5 })).toThrow();
});

it('accepts partial card updates and validates calendar days', () => {
  expect(updateCreditCardSchema.parse({ closingDay: 20 })).toEqual({
    closingDay: 20,
  });
  expect(() => updateCreditCardSchema.parse({})).toThrow();
  expect(() => updateCreditCardSchema.parse({ dueDay: 32 })).toThrow();
});
```

- [ ] **Step 2: Run the focused test and verify the red state**

Run:

```powershell
corepack pnpm test -- src/modules/catalogs.schemas.spec.ts
```

Expected: FAIL because `updateAccountSchema` and `updateCreditCardSchema` are not exported.

- [ ] **Step 3: Implement the Zod contracts and codes**

In `accounts.schemas.ts`, derive a strict partial schema:

```ts
export const updateAccountSchema = createAccountSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'envie ao menos um campo');

export class UpdateAccountDto extends createZodDto(updateAccountSchema) {}
```

In `credit-cards.schemas.ts`:

```ts
export const updateCreditCardSchema = createCreditCardSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'envie ao menos um campo');

export class UpdateCreditCardDto extends createZodDto(updateCreditCardSchema) {}
```

Append the four exact conflict codes to `ERROR_CODES`.

- [ ] **Step 4: Run focused tests and static checks**

Run:

```powershell
corepack pnpm test -- src/modules/catalogs.schemas.spec.ts
corepack pnpm typecheck
```

Expected: both commands PASS.

- [ ] **Step 5: Commit the contracts**

```powershell
git add src/common/errors/error-codes.ts src/modules/accounts/accounts.schemas.ts src/modules/credit-cards/credit-cards.schemas.ts src/modules/catalogs.schemas.spec.ts
git commit -m "feat: add account and card update contracts"
```

### Task 2: Implement account update and protected soft deletion

**Files:**
- Create: `src/modules/accounts/accounts.service.spec.ts`
- Modify: `src/modules/accounts/accounts.controller.ts`
- Modify: `src/modules/accounts/accounts.service.ts`
- Modify: `src/modules/accounts/accounts.repository.ts`

**Interfaces:**
- Consumes: `UpdateAccountDto`, `AccountResponseDto`
- Produces:

```ts
type AccountDeleteFacts =
  | { status: 'deleted' }
  | { status: 'not-found' }
  | { status: 'last-active' }
  | { status: 'has-active-cards' }
  | { status: 'has-active-recurrences' };

AccountsRepository.findById(userId: string, id: string): Promise<Account | null>
AccountsRepository.update(userId: string, id: string, input: UpdateAccountDto): Promise<Account>
AccountsRepository.softDeleteGuarded(userId: string, id: string): Promise<AccountDeleteFacts>
AccountsService.update(userId: string, id: string, input: UpdateAccountDto): Promise<AccountResponse>
AccountsService.delete(userId: string, id: string): Promise<void>
```

- [ ] **Step 1: Write failing service tests**

Create `accounts.service.spec.ts` with a typed repository fake:

```ts
import { describe, expect, it, vi } from 'vitest';
import { AccountsService } from './accounts.service.js';

const account = {
  id: '67f04cc3-5b6d-4a87-a666-c84260d75e2c',
  userId: '50bf982c-13db-46a6-9fa2-6d2398654290',
  name: 'Principal',
  kind: 'CHECKING',
  openingBalanceCents: 0,
  currency: 'BRL',
  createdAt: new Date('2026-07-01T00:00:00.000Z'),
  updatedAt: new Date('2026-07-01T00:00:00.000Z'),
  deletedAt: null,
} as const;

function repository() {
  return {
    list: vi.fn(),
    create: vi.fn(),
    exists: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    softDeleteGuarded: vi.fn(),
  };
}

it('returns 404 when updating a foreign or deleted account', async () => {
  const repo = repository();
  repo.findById.mockResolvedValue(null);
  const service = new AccountsService(repo as never);
  await expect(service.update(account.userId, account.id, { name: 'Nova' }))
    .rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND', status: 404 });
});

it.each([
  ['last-active', 'ACCOUNT_LAST_ACTIVE'],
  ['has-active-cards', 'ACCOUNT_HAS_ACTIVE_CARDS'],
  ['has-active-recurrences', 'ACCOUNT_HAS_ACTIVE_RECURRENCES'],
] as const)('maps %s deletion facts to %s', async (status, code) => {
  const repo = repository();
  repo.softDeleteGuarded.mockResolvedValue({ status });
  const service = new AccountsService(repo as never);
  await expect(service.delete(account.userId, account.id))
    .rejects.toMatchObject({ code, status: 409 });
});
```

- [ ] **Step 2: Run tests and verify missing methods**

Run:

```powershell
corepack pnpm test -- src/modules/accounts/accounts.service.spec.ts
```

Expected: FAIL because the lifecycle methods do not exist.

- [ ] **Step 3: Implement repository facts and atomic soft delete**

Add `findById` and partial `update`. Implement `softDeleteGuarded` inside
`this.prisma.$transaction(..., { isolationLevel: ReadCommitted })`:

```ts
const target = await database.account.findFirst({
  where: { id, userId, deletedAt: null },
});
if (!target) return { status: 'not-found' } as const;

const [activeCount, activeCards, activeRecurrences] = await Promise.all([
  database.account.count({ where: { userId, deletedAt: null } }),
  database.creditCard.count({ where: { userId, accountId: id, deletedAt: null } }),
  database.recurrence.count({
    where: { userId, accountId: id, isActive: true, deletedAt: null },
  }),
]);

if (activeCount === 1) return { status: 'last-active' } as const;
if (activeCards > 0) return { status: 'has-active-cards' } as const;
if (activeRecurrences > 0) return { status: 'has-active-recurrences' } as const;

await database.account.update({
  where: { id },
  data: { deletedAt: new Date() },
});
return { status: 'deleted' } as const;
```

The `update` data object includes only defined fields and never accepts `userId`
or `deletedAt`.

- [ ] **Step 4: Implement service conflict mapping**

Use `notFound('Conta')` for `not-found`. For each conflict, throw a `DomainError`
with status 409 and actionable Portuguese detail:

```ts
throw new DomainError(
  'ACCOUNT_LAST_ACTIVE',
  409,
  'Última conta ativa',
  'Crie outra conta antes de excluir esta.',
);
```

Map the other outcomes to their exact codes and messages about active cards or
recurrences.

- [ ] **Step 5: Add controller routes**

Import `Delete`, `HttpCode`, `Patch`, and `ParseUUIDPipe`. Add:

```ts
@Patch(':id')
@ZodResponse({ type: AccountResponseDto })
update(
  @CurrentUser() user: AuthenticatedUser,
  @Param('id', ParseUUIDPipe) id: string,
  @Body() input: UpdateAccountDto,
): Promise<AccountResponse> {
  return this.service.update(user.id, id, input);
}

@Delete(':id')
@HttpCode(204)
async delete(
  @CurrentUser() user: AuthenticatedUser,
  @Param('id', ParseUUIDPipe) id: string,
): Promise<void> {
  await this.service.delete(user.id, id);
}
```

- [ ] **Step 6: Run focused and module-wide verification**

Run:

```powershell
corepack pnpm test -- src/modules/accounts/accounts.service.spec.ts src/modules/catalogs.schemas.spec.ts
corepack pnpm lint
corepack pnpm typecheck
```

Expected: all PASS.

- [ ] **Step 7: Commit account lifecycle**

```powershell
git add src/modules/accounts
git commit -m "feat: manage account lifecycle"
```

### Task 3: Implement card update, settlement recalculation, audit, and soft deletion

**Files:**
- Create: `src/modules/credit-cards/credit-cards.service.spec.ts`
- Modify: `src/modules/credit-cards/credit-cards.controller.ts`
- Modify: `src/modules/credit-cards/credit-cards.service.ts`
- Modify: `src/modules/credit-cards/credit-cards.repository.ts`

**Interfaces:**
- Consumes: `UpdateCreditCardDto`, `calculateSettlementDate`
- Produces:

```ts
interface SettlementSource {
  id: string;
  occurredAt: Date;
  settledAt: Date | null;
}

interface SettlementChange {
  id: string;
  before: Date | null;
  after: Date;
}

type CreditCardDeleteFacts =
  | { status: 'deleted' }
  | { status: 'not-found' }
  | { status: 'has-active-recurrences' };

CreditCardsRepository.listSettlementSources(userId: string, id: string): Promise<SettlementSource[]>
CreditCardsRepository.updateWithSettlements(
  userId: string,
  id: string,
  input: UpdateCreditCardDto,
  changes: readonly SettlementChange[],
): Promise<CreditCard | null>
CreditCardsRepository.softDeleteGuarded(userId: string, id: string): Promise<CreditCardDeleteFacts>
CreditCardsService.update(userId: string, id: string, input: UpdateCreditCardDto): Promise<CreditCardResponse>
CreditCardsService.delete(userId: string, id: string): Promise<void>
```

- [ ] **Step 1: Write failing service tests**

Create `credit-cards.service.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { CreditCardsService } from './credit-cards.service.js';

it('recalculates settlements when a calendar day changes', async () => {
  const card = {
    id: '97d84e6f-8085-49da-879b-59d40e5b01d9',
    userId: '50bf982c-13db-46a6-9fa2-6d2398654290',
    accountId: '67f04cc3-5b6d-4a87-a666-c84260d75e2c',
    name: 'Cartão',
    limitCents: 100_000,
    closingDay: 25,
    dueDay: 10,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    deletedAt: null,
  } as const;
  const repository = {
    findById: vi.fn().mockResolvedValue(card),
    listSettlementSources: vi.fn().mockResolvedValue([{
      id: 'dfdd4f54-a32b-4814-8ec0-8da723a142e0',
      occurredAt: new Date('2026-07-23T15:00:00.000Z'),
      settledAt: new Date('2026-08-10T03:00:00.000Z'),
    }]),
    updateWithSettlements: vi.fn().mockResolvedValue({ ...card, closingDay: 20 }),
    softDeleteGuarded: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    invoiceTotal: vi.fn(),
  };
  const accounts = { exists: vi.fn().mockResolvedValue(true) };
  const service = new CreditCardsService(repository as never, accounts as never);

  await service.update(card.userId, card.id, { closingDay: 20 });

  expect(repository.updateWithSettlements).toHaveBeenCalledWith(
    card.userId,
    card.id,
    { closingDay: 20 },
    [expect.objectContaining({
      id: 'dfdd4f54-a32b-4814-8ec0-8da723a142e0',
      after: new Date('2026-09-10T03:00:00.000Z'),
    })],
  );
});

it('rejects deletion when an active recurrence uses the card', async () => {
  const repository = {
    softDeleteGuarded: vi.fn().mockResolvedValue({
      status: 'has-active-recurrences',
    }),
  };
  const service = new CreditCardsService(
    repository as never,
    { exists: vi.fn() } as never,
  );
  await expect(service.delete('user', 'card')).rejects.toMatchObject({
    code: 'CREDIT_CARD_HAS_ACTIVE_RECURRENCES',
    status: 409,
  });
});
```

- [ ] **Step 2: Run focused tests and verify the red state**

Run:

```powershell
corepack pnpm test -- src/modules/credit-cards/credit-cards.service.spec.ts
```

Expected: FAIL because `update`, `delete`, and repository contracts are absent.

- [ ] **Step 3: Implement service calculation and validation**

The service:

1. loads the active card by `(userId, id)`;
2. validates a supplied `accountId` through `AccountsRepository.exists`;
3. uses new day values, falling back to the stored card;
4. loads settlement sources only when `closingDay` or `dueDay` changes;
5. maps each source through `calculateSettlementDate(source.occurredAt.toISOString(), closingDay, dueDay)`;
6. calls `updateWithSettlements`;
7. maps deletion outcomes to 404 or the stable 409 code.

Only include a `SettlementChange` when `before?.getTime() !== after.getTime()`.

- [ ] **Step 4: Implement atomic repository update and audit**

Within `ReadCommitted`:

```ts
const before = await database.creditCard.findFirst({
  where: { id, userId, deletedAt: null },
});
if (!before) return null;

const after = await database.creditCard.update({
  where: { id },
  data: definedCardFields(input),
});

for (const change of changes) {
  await database.transaction.updateMany({
    where: {
      id: change.id,
      userId,
      creditCardId: id,
      paymentMethod: 'CREDIT',
      deletedAt: null,
    },
    data: { settledAt: change.after },
  });
}
```

Create one card audit record with `before`/`after`, and one transaction audit
record per changed settlement containing ISO strings for the old and new
`settledAt`. Do not emit application logs.

`softDeleteGuarded` checks the active card and an active recurrence in the same
transaction, creates a `credit_card/deleted` audit record, and then sets
`deletedAt`.

- [ ] **Step 5: Add controller routes**

Add `PATCH /v1/credit-cards/:id` returning `CreditCardResponseDto` and
`DELETE /v1/credit-cards/:id` returning 204, both with `ParseUUIDPipe`.

- [ ] **Step 6: Run focused and regression tests**

Run:

```powershell
corepack pnpm test -- src/modules/credit-cards/credit-cards.service.spec.ts src/shared/date/credit-card-settlement.spec.ts
corepack pnpm lint
corepack pnpm typecheck
```

Expected: all PASS.

- [ ] **Step 7: Commit card lifecycle**

```powershell
git add src/modules/credit-cards
git commit -m "feat: manage credit card lifecycle"
```

### Task 4: Add the credit-card transaction filter

**Files:**
- Create: `src/modules/transactions/transactions.repository.spec.ts`
- Modify: `src/modules/transactions/transactions.schemas.ts`
- Modify: `src/modules/transactions/transactions.schemas.spec.ts`
- Modify: `src/modules/transactions/transactions.repository.ts`

**Interfaces:**
- Produces: `TransactionsQueryDto.creditCardId?: string`
- Preserves all existing cursor, period, account, category, method, type, and basis filters.

- [ ] **Step 1: Write failing schema and repository tests**

In `transactions.schemas.spec.ts`:

```ts
it('accepts a credit card filter', () => {
  expect(new TransactionsQueryDto()).toBeDefined();
  expect(transactionsQuerySchema.parse({
    creditCardId: '97d84e6f-8085-49da-879b-59d40e5b01d9',
  })).toMatchObject({
    creditCardId: '97d84e6f-8085-49da-879b-59d40e5b01d9',
  });
});
```

Export `transactionsQuerySchema` from the schema file so the contract is
directly testable. In `transactions.repository.spec.ts`, provide a fake
`prisma.transaction.findMany` and assert:

```ts
expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
  where: expect.objectContaining({
    userId,
    creditCardId,
    deletedAt: null,
  }),
}));
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
corepack pnpm test -- src/modules/transactions/transactions.schemas.spec.ts src/modules/transactions/transactions.repository.spec.ts
```

Expected: FAIL because the schema and repository omit `creditCardId`.

- [ ] **Step 3: Implement the filter**

Add `creditCardId: z.uuid().optional()` to the exported query schema and:

```ts
...(query.creditCardId ? { creditCardId: query.creditCardId } : {}),
```

to the repository `where`.

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```powershell
corepack pnpm test -- src/modules/transactions/transactions.schemas.spec.ts src/modules/transactions/transactions.repository.spec.ts
corepack pnpm typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit invoice filtering**

```powershell
git add src/modules/transactions
git commit -m "feat: filter transactions by credit card"
```

### Task 5: Publish and verify the API contract

**Files:**
- Modify: `test/openapi.spec.ts`
- Modify: `docs/openapi.json`

**Interfaces:**
- Publishes `patch` and `delete` on `/v1/accounts/{id}`.
- Publishes `patch` and `delete` on `/v1/credit-cards/{id}`.
- Publishes `creditCardId` on `GET /v1/transactions`.

- [ ] **Step 1: Write failing OpenAPI assertions**

Add:

```ts
expect(document.paths['/v1/accounts/{id}']?.patch).toBeDefined();
expect(document.paths['/v1/accounts/{id}']?.delete).toBeDefined();
expect(document.paths['/v1/credit-cards/{id}']?.patch).toBeDefined();
expect(document.paths['/v1/credit-cards/{id}']?.delete).toBeDefined();

const transactionParameters =
  document.paths['/v1/transactions']?.get?.parameters ?? [];
expect(transactionParameters).toEqual(
  expect.arrayContaining([
    expect.objectContaining({ name: 'creditCardId', in: 'query' }),
  ]),
);
```

- [ ] **Step 2: Run the contract test before regeneration**

Run:

```powershell
corepack pnpm test -- test/openapi.spec.ts
```

Expected: PASS only when controllers and schemas are complete; otherwise fix the
contract surface before proceeding.

- [ ] **Step 3: Regenerate committed OpenAPI**

Run:

```powershell
corepack pnpm openapi:generate
git diff -- docs/openapi.json
```

Expected: only the new account/card methods, DTO schemas, and transaction query
parameter appear.

- [ ] **Step 4: Run the complete API verification**

Run:

```powershell
corepack pnpm verify
git diff --check
```

Expected: all validation, generation, lint, typecheck, unit tests, e2e tests,
build, OpenAPI generation, formatting, and whitespace checks PASS.

- [ ] **Step 5: Commit the published contract**

```powershell
git add test/openapi.spec.ts docs/openapi.json
git commit -m "docs: publish account and card lifecycle API"
```

## Final Review Gate

- Confirm `git diff HEAD~5 -- prisma` is empty.
- Confirm every new query includes `userId` and `deletedAt: null`.
- Confirm account/card DELETE routes return 204 and perform no physical delete.
- Confirm card day changes update only active CREDIT transactions for that card.
- Confirm audit records contain database values but no application log prints them.
- Confirm `corepack pnpm verify` passes from a clean process.
