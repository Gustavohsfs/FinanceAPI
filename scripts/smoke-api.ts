import assert from 'node:assert/strict';

const baseUrl = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3000';
const runId = `${String(Date.now())}-${crypto.randomUUID().slice(0, 8)}`;
const password = 'FluxoSmoke123';

interface Session {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly user: { readonly id: string };
}

interface Account {
  readonly id: string;
}

interface Category {
  readonly id: string;
  readonly type: 'INCOME' | 'EXPENSE';
}

interface Transaction {
  readonly id: string;
  readonly amountCents: number;
}

interface Problem {
  readonly code: string;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  expectedStatus = 200,
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = response.status === 204 ? undefined : await response.json();
  assert.equal(
    response.status,
    expectedStatus,
    `${options.method ?? 'GET'} ${path}: ${String(response.status)} ${JSON.stringify(body)}`,
  );
  return body as T;
}

function authenticated(accessToken: string, options: RequestInit = {}): RequestInit {
  const headers = new Headers(options.headers);
  headers.set('authorization', `Bearer ${accessToken}`);
  headers.set('content-type', 'application/json');
  return {
    ...options,
    headers,
  };
}

async function register(label: string): Promise<Session> {
  return request<Session>(
    '/v1/auth/register',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: `smoke-${label}-${runId}@example.com`,
        name: `Smoke ${label}`,
        password,
      }),
    },
    201,
  );
}

await request<{ status: string }>('/health/live');
assert.equal((await request<{ status: string }>('/health/ready')).status, 'ok');
await request<Record<string, unknown>>('/docs/openapi.json');

const firstSession = await register('a');
const refreshedSession = await request<Session>('/v1/auth/refresh', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ refreshToken: firstSession.refreshToken }),
});
assert.notEqual(refreshedSession.refreshToken, firstSession.refreshToken);
const replayProblem = await request<Problem>(
  '/v1/auth/refresh',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: firstSession.refreshToken }),
  },
  401,
);
assert.equal(replayProblem.code, 'AUTH_REFRESH_REUSED');

const accessToken = refreshedSession.accessToken;
const categories = await request<Category[]>('/v1/categories', authenticated(accessToken));
const expenseCategory = categories.find((category) => category.type === 'EXPENSE');
assert.ok(expenseCategory, 'registration must create default expense categories');

const account = await request<Account>(
  '/v1/accounts',
  authenticated(accessToken, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Conta smoke',
      kind: 'CHECKING',
      openingBalanceCents: 100_000,
      currency: 'BRL',
    }),
  }),
  201,
);

const idempotencyKey = crypto.randomUUID();
const transactionPayload = {
  type: 'EXPENSE',
  amountCents: 12_345,
  description: 'Compra smoke',
  occurredAt: new Date().toISOString(),
  categoryId: expenseCategory.id,
  accountId: account.id,
  paymentMethod: 'PIX',
  installmentTotal: 1,
  currency: 'BRL',
};
const transactionHeaders = {
  'idempotency-key': idempotencyKey,
};
const created = await request<Transaction[]>(
  '/v1/transactions',
  authenticated(accessToken, {
    method: 'POST',
    headers: transactionHeaders,
    body: JSON.stringify(transactionPayload),
  }),
  201,
);
const replayed = await request<Transaction[]>(
  '/v1/transactions',
  authenticated(accessToken, {
    method: 'POST',
    headers: transactionHeaders,
    body: JSON.stringify(transactionPayload),
  }),
  201,
);
assert.deepEqual(replayed, created);
assert.equal(created.length, 1);
const createdTransaction = created[0];
assert.ok(createdTransaction);

const conflict = await request<Problem>(
  '/v1/transactions',
  authenticated(accessToken, {
    method: 'POST',
    headers: transactionHeaders,
    body: JSON.stringify({ ...transactionPayload, amountCents: 12_346 }),
  }),
  409,
);
assert.equal(conflict.code, 'IDEMPOTENCY_KEY_REUSED');

const secondSession = await register('b');
await request<Problem>(
  `/v1/transactions/${createdTransaction.id}`,
  authenticated(secondSession.accessToken),
  404,
);

const month = new Date().toISOString().slice(0, 7);
const summary = await request<{ expenseCents: number }>(
  `/v1/insights/summary?month=${month}&basis=accrual`,
  authenticated(accessToken),
);
assert.ok(summary.expenseCents >= transactionPayload.amountCents);

const page = await request<{ data: Transaction[] }>(
  '/v1/transactions?basis=accrual&limit=10',
  authenticated(accessToken),
);
assert.equal(page.data.filter((transaction) => transaction.id === createdTransaction.id).length, 1);

console.log(
  JSON.stringify({
    status: 'ok',
    checks: [
      'health',
      'swagger',
      'auth-rotation-reuse',
      'default-categories',
      'account',
      'idempotency',
      'tenant-isolation',
      'insights',
    ],
  }),
);
