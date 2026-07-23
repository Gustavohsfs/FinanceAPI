# BRIEF MESTRE — API Financeira (NestJS + Neon)

> Documento de Spec-Driven Development. Fonte da verdade do backend.
> Consumidores: `apps/mobile` (Expo) e `apps/web` (Next.js). Codinome: **Fluxo API**.
> Este brief é irmão do `BRIEF-app-financeiro.md` — o modelo de domínio da seção 5 daquele documento é normativo aqui.

---

## 0. Como usar este brief

1. Vive em `apps/api/docs/BRIEF.md` dentro do monorepo Turborepo.
2. A seção 11 vira o `apps/api/CLAUDE.md`.
3. Cada endpoint novo nasce de uma spec em `apps/api/docs/specs/NN-nome.md` com contrato e critérios de aceite antes do código.
4. **A API é a dona da verdade financeira.** Nenhum cálculo de saldo, parcela, orçamento ou meta é recalculado no cliente para exibição autoritativa. O cliente exibe; o servidor decide.

---

## 1. Princípios

- **Contrato antes de código.** OpenAPI gerado do código é a interface pública; mudança de contrato é mudança de versão.
- **Toda query é escopada por usuário.** Não existe leitura sem `userId`. Isso é regra de arquitetura, não de disciplina — a camada de dados força.
- **Nada de estado derivado persistido.** Saldo e totais são calculados. Se ficar lento, resolve com índice e view materializada, não com campo desatualizado.
- **Agregação acontece no Postgres.** Nunca puxar 5.000 lançamentos para somar em JavaScript.
- **Migration é artefato versionado.** Nenhuma alteração de schema chega ao banco sem arquivo SQL commitado.
- **Erro é dado.** Toda falha tem código estável, mensagem para humano e forma previsível.

---

## 2. Stack

| Camada | Escolha | Observação |
|---|---|---|
| Framework | **NestJS 11.1.x** | Estável. A v12 (ESM, tooling novo) está prevista para ~Q3/2026 — **não adotar agora**, mas escrever código ESM-friendly (sem `require`, sem `__dirname`) para a migração ser barata |
| HTTP | **Fastify** (`@nestjs/platform-fastify`) | Throughput bem maior que Express; ecossistema Nest suporta bem |
| Runtime | Node 22 LTS | Travar em `.nvmrc` e no `engines` do `package.json` |
| ORM | **Prisma 7.9+** | Rust-free desde a v7; exige driver adapter. Migrations declarativas com histórico em arquivo — exatamente o que o brief pede |
| Driver | `@prisma/adapter-pg` + `pg` | API roda em container long-running, não em edge. Não usar o driver serverless HTTP aqui |
| Banco | **Neon Postgres** (projeto novo, separado do ghtpromo) | Branching para preview e CI |
| Validação | **zod** + `nestjs-zod` | Schemas compartilhados com mobile e web via `packages/domain` |
| Auth | `@nestjs/jwt` + guards próprios + **argon2id** | Sem Passport: guard próprio é mais simples de auditar e tipar |
| Docs | `@nestjs/swagger` + `nestjs-zod` | OpenAPI 3.1 gerado do zod |
| Logs | `nestjs-pino` | JSON estruturado, request-id, redaction obrigatória |
| Jobs | `@nestjs/schedule` | Recorrências e fechamento de fatura. BullMQ + Redis só quando houver necessidade real |
| Rate limit | `@nestjs/throttler` | Global brando, agressivo em `/auth` |
| Segurança | `@fastify/helmet`, `@fastify/cors` | CORS por allowlist explícita |
| Health | `@nestjs/terminus` | `/health/live` e `/health/ready` |
| Erros | Sentry (`@sentry/nestjs`) | Com `beforeSend` limpando dado financeiro |
| Config | `@nestjs/config` + schema zod | App não sobe com env inválida |
| Lint | ESLint 9 flat + Prettier + Husky + commitlint | Conventional Commits |

Sem testes unitários nesta etapa, conforme combinado — mas **serviços de domínio são funções puras**, sem I/O, para que os testes entrem depois sem refatoração.

---

## 3. Arquitetura

**Monólito modular.** Um deploy, módulos com fronteira real. Cada módulo é um candidato a microserviço que provavelmente nunca vai precisar virar um.

Três camadas por módulo, com dependência em sentido único:

```
Controller  →  Service (regra)  →  Repository (Prisma)
   HTTP           domínio             persistência
```

- **Controller** não conhece Prisma. Recebe DTO validado, chama service, devolve DTO de saída. Zero `if` de negócio.
- **Service** não conhece HTTP. Não recebe `Request`, não lança `HttpException` — lança erro de domínio, que o filter traduz.
- **Repository** não conhece regra. Só query. É o único lugar do sistema que importa `PrismaService`.

Módulo **nunca** importa o service de outro módulo diretamente por caminho relativo — importa pelo `index.ts` do módulo e via injeção. Se dois módulos precisam da mesma regra, ela sobe para `packages/domain`.

### 3.1 Estrutura de pastas

```
apps/api/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/                    # histórico versionado — nunca editado após aplicado
│   │   ├── 20260723120000_init/migration.sql
│   │   └── migration_lock.toml
│   └── seed/
│       ├── seed.ts
│       └── data/default-categories.ts
├── prisma.config.ts                   # aponta migrations.path explicitamente
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   │
│   ├── config/
│   │   ├── env.schema.ts              # zod — falha rápido no boot
│   │   └── configuration.ts
│   │
│   ├── common/
│   │   ├── decorators/                # @CurrentUser, @Public, @IdempotencyKey
│   │   ├── guards/                    # JwtAuthGuard (global), RolesGuard
│   │   ├── interceptors/              # LoggingInterceptor, TransformInterceptor
│   │   ├── filters/                   # DomainExceptionFilter, PrismaExceptionFilter
│   │   ├── pipes/                     # ZodValidationPipe (global)
│   │   ├── errors/                    # DomainError + catálogo de códigos
│   │   ├── dto/                       # PaginationQueryDto, PeriodQueryDto
│   │   └── types/
│   │
│   ├── database/
│   │   ├── prisma.module.ts
│   │   ├── prisma.service.ts          # extensões: soft delete, scope por usuário
│   │   └── extensions/
│   │       ├── soft-delete.extension.ts
│   │       └── user-scope.extension.ts
│   │
│   ├── modules/
│   │   ├── auth/                      # login, refresh, logout, me, troca de senha
│   │   ├── users/
│   │   ├── accounts/                  # contas e cartões de crédito
│   │   ├── categories/
│   │   ├── transactions/              # inclui parcelamento e recorrência
│   │   ├── goals/
│   │   ├── insights/                  # agregações do dashboard (SQL puro)
│   │   └── jobs/                      # cron: recorrências, fatura, alertas
│   │
│   └── shared/
│       ├── money/                     # espelho de packages/domain (centavos)
│       ├── date/                      # competência, caixa, America/Sao_Paulo
│       └── idempotency/
└── docs/
    ├── BRIEF.md
    ├── specs/
    └── openapi.json                   # gerado no build, commitado
```

Anatomia de módulo:

```
modules/transactions/
├── transactions.module.ts
├── transactions.controller.ts
├── transactions.service.ts            # orquestração
├── transactions.repository.ts         # Prisma
├── domain/
│   ├── installments.ts                # puro: divide parcelas
│   └── settlement.ts                  # puro: competência → caixa
├── dto/
│   ├── create-transaction.dto.ts      # derivado do zod compartilhado
│   └── transaction-response.dto.ts
└── index.ts
```

---

## 4. Banco de dados e migrations

Esta seção é normativa. O agente não improvisa aqui.

### 4.1 Conexão Neon

Duas URLs, sempre:

```env
DATABASE_URL="postgresql://...-pooler.sa-east-1.aws.neon.tech/fluxo?sslmode=require"   # pooled — runtime
DIRECT_URL="postgresql://....sa-east-1.aws.neon.tech/fluxo?sslmode=require"            # direto — migrations
```

O Prisma Migrate precisa de conexão direta (o pooler não suporta as operações de DDL/advisory lock que ele usa). Runtime usa o endpoint com `-pooler`. Confundir os dois causa erro intermitente e difícil de diagnosticar.

Pool do `pg`: `max: 10` por instância, `idleTimeoutMillis: 30000`. Neon derruba conexão ociosa; o pool tem que estar preparado.

**Branches Neon:**
- `main` → produção
- `develop` → staging
- branch efêmera por PR → criada no CI, roda `migrate deploy` + seed, destruída no merge

### 4.2 Fluxo de migration

```bash
# desenvolvimento — SEMPRE com nome descritivo
pnpm prisma migrate dev --name add_installment_group_to_transactions

# produção/staging — no release, nunca no start da aplicação
pnpm prisma migrate deploy
```

Regras invioláveis:

1. **`prisma db push` é proibido** fora de branch descartável. Ele altera o banco sem gerar arquivo, e o histórico deixa de refletir a realidade.
2. **Migration aplicada nunca é editada.** Errou? Nova migration corrigindo.
3. **Nome descreve a intenção**, em snake_case, verbo primeiro: `add_`, `drop_`, `rename_`, `backfill_`, `index_`.
4. **Toda migration é lida antes de commitada.** O agente abre o `.sql` gerado e confere: houve `DROP`? `NOT NULL` em tabela com dado? Índice em coluna grande sem `CONCURRENTLY`?
5. **Mudança destrutiva usa expand/contract**, em três releases: (a) adiciona a coluna nova, (b) faz backfill e passa a escrever nas duas, (c) remove a antiga. Nunca renomear coluna em produção num passo só.
6. **Migrate deploy roda como passo de release**, separado do start do processo. Nada de `migrate deploy && node dist/main` no comando do container — duas instâncias subindo simultaneamente disputam o lock.
7. **CI valida drift**: `prisma migrate diff --from-migrations ./prisma/migrations --to-schema-datamodel ./prisma/schema.prisma --exit-code` falha o build se o schema mudou sem migration.
8. **Seed é idempotente.** `upsert` sempre. Rodar duas vezes não pode duplicar categoria padrão.

`prisma.config.ts` fixa o caminho, para o histórico ter lugar próprio e explícito:

```ts
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed/seed.ts',
  },
});
```

### 4.3 Schema

Convenções: tabelas em `snake_case` plural via `@@map`, campos `camelCase` no client com `@map`, PK `uuid` (`gen_random_uuid()`), `createdAt`/`updatedAt`/`deletedAt` em toda tabela de negócio, timestamps `timestamptz`.

**Dinheiro:** `Int` representando centavos. Teto do `int4` é R$ 21.474.836,47 — folgado para finanças pessoais. Se um dia entrar patrimônio de investimento acima disso, migrar para `BigInt` (a migration é trivial; o serializer é que dá trabalho, então decidir cedo). Toda coluna monetária ganha `CHECK (amount_cents >= 0)`.

```prisma
model User {
  id           String   @id @default(uuid()) @db.Uuid
  email        String   @unique
  passwordHash String   @map("password_hash")
  name         String
  timezone     String   @default("America/Sao_Paulo")
  currency     String   @default("BRL")
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt    DateTime @updatedAt @map("updated_at") @db.Timestamptz
  deletedAt    DateTime? @map("deleted_at") @db.Timestamptz

  refreshTokens RefreshToken[]
  transactions  Transaction[]
  categories    Category[]
  accounts      Account[]
  goals         Goal[]

  @@map("users")
}

model RefreshToken {
  id         String   @id @default(uuid()) @db.Uuid
  userId     String   @map("user_id") @db.Uuid
  tokenHash  String   @unique @map("token_hash")   // SHA-256 do token, nunca o token
  familyId   String   @map("family_id") @db.Uuid   // rotação: detecta reuso
  expiresAt  DateTime @map("expires_at") @db.Timestamptz
  revokedAt  DateTime? @map("revoked_at") @db.Timestamptz
  userAgent  String?  @map("user_agent")
  ipAddress  String?  @map("ip_address")
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, expiresAt])
  @@index([familyId])
  @@map("refresh_tokens")
}

model Transaction {
  id                 String          @id @default(uuid()) @db.Uuid
  userId             String          @map("user_id") @db.Uuid
  type               TransactionType
  amountCents        Int             @map("amount_cents")
  description        String
  occurredAt         DateTime        @map("occurred_at") @db.Timestamptz  // competência
  settledAt          DateTime?       @map("settled_at") @db.Timestamptz   // caixa
  categoryId         String?         @map("category_id") @db.Uuid
  accountId          String          @map("account_id") @db.Uuid
  creditCardId       String?         @map("credit_card_id") @db.Uuid
  paymentMethod      PaymentMethod   @map("payment_method")
  installmentGroupId String?         @map("installment_group_id") @db.Uuid
  installmentNumber  Int?            @map("installment_number")
  installmentTotal   Int?            @map("installment_total")
  isProjected        Boolean         @default(false) @map("is_projected")
  recurrenceId       String?         @map("recurrence_id") @db.Uuid
  notes              String?
  createdAt          DateTime        @default(now()) @map("created_at") @db.Timestamptz
  updatedAt          DateTime        @updatedAt @map("updated_at") @db.Timestamptz
  deletedAt          DateTime?       @map("deleted_at") @db.Timestamptz

  @@index([userId, occurredAt(sort: Desc)])
  @@index([userId, categoryId, occurredAt])
  @@index([installmentGroupId])
  @@index([userId, settledAt])
  @@map("transactions")
}
```

Demais tabelas (`categories`, `accounts`, `credit_cards`, `goals`, `recurrences`, `idempotency_keys`, `audit_logs`) seguem o modelo da seção 5 do brief do app, com as mesmas convenções.

Índices são parte da migration, não otimização posterior. **Todo índice cobre `userId` como primeira coluna** — é o filtro presente em 100% das queries.

---

## 5. Autenticação e segurança

### 5.1 Fluxo

- Senha com **argon2id** (`memoryCost: 19456, timeCost: 2, parallelism: 1` — parâmetros da OWASP). Nunca bcrypt em projeto novo.
- **Access token JWT**, 15 minutos, payload mínimo: `sub`, `email`, `iat`, `exp`, `jti`. Nada de dado financeiro no token.
- **Refresh token opaco** (32 bytes aleatórios), 30 dias, **rotativo**: cada uso invalida o anterior e emite um novo na mesma `family`. Armazenado só como hash SHA-256.
- **Detecção de reuso**: refresh já revogado sendo apresentado significa token vazado → revoga a família inteira e força novo login. Este comportamento é obrigatório.
- Segredos distintos para access e refresh.
- `JwtAuthGuard` registrado **globalmente**. Rota pública é exceção explícita com `@Public()`. Esquecer o guard não pode ser possível.

### 5.2 Superfície

```
POST   /v1/auth/register
POST   /v1/auth/login
POST   /v1/auth/refresh
POST   /v1/auth/logout          # revoga a família atual
POST   /v1/auth/logout-all      # revoga todas as sessões
GET    /v1/auth/me
PATCH  /v1/auth/password
POST   /v1/auth/forgot-password # token de uso único, 15 min, resposta sempre 202
POST   /v1/auth/reset-password
```

### 5.3 Isolamento por usuário

O bug mais caro que uma API financeira pode ter é o usuário A ler dado do usuário B. Três camadas independentes:

1. **`userId` vem do token, nunca do body ou da URL.** Se o body trouxer `userId`, o DTO rejeita.
2. **Repository exige `userId` na assinatura.** Não existe `findById(id)` — existe `findById(userId, id)`.
3. **Extensão do Prisma** injeta `where: { userId }` em `findMany`, `update`, `delete` e derivados quando o contexto de requisição tem usuário. É a rede de proteção, não a defesa principal.

Recurso de outro usuário responde **404, não 403**. 403 confirma a existência do recurso.

### 5.4 Outras defesas

- Throttler: 100 req/min global; 5 tentativas/min em `/auth/login`; 3/hora em `forgot-password`.
- Helmet, CORS por allowlist (`app://fluxo`, domínio da web, `localhost` só em dev).
- Redaction obrigatória no pino: `authorization`, `password`, `token`, `refreshToken`, `cookie`.
- Rotação de segredo prevista: `JWT_SECRET_CURRENT` + `JWT_SECRET_PREVIOUS`, aceita os dois na verificação.
- Nenhum `SELECT *` de usuário retorna `passwordHash` — omitido no `select` do repository, não filtrado depois.

---

## 6. Contrato da API

Base `/v1`. JSON. Datas em ISO 8601 UTC. Valores em centavos, com o campo sempre sufixado `Cents`.

### 6.1 Rotas

```
# Categorias
GET    /v1/categories?type=EXPENSE&includeArchived=false
POST   /v1/categories
PATCH  /v1/categories/:id
POST   /v1/categories/:id/archive

# Contas e cartões
GET    /v1/accounts
POST   /v1/accounts
GET    /v1/credit-cards
POST   /v1/credit-cards
GET    /v1/credit-cards/:id/invoices?month=2026-07   # fatura fechada/aberta

# Lançamentos
GET    /v1/transactions?from&to&type&categoryId&accountId&method&basis=accrual|cash&cursor&limit
POST   /v1/transactions                              # Idempotency-Key obrigatório
GET    /v1/transactions/:id
PATCH  /v1/transactions/:id?scope=one|future|all     # parcelamento
DELETE /v1/transactions/:id?scope=one|future|all

# Recorrências
GET    /v1/recurrences
POST   /v1/recurrences
POST   /v1/recurrences/:id/confirm                   # previsto → efetivado

# Metas
GET    /v1/goals
POST   /v1/goals
PATCH  /v1/goals/:id
GET    /v1/goals/:id/progress                        # planejado × efetivado × projeção

# Insights (dashboard)
GET    /v1/insights/summary?month=2026-07&basis=accrual
GET    /v1/insights/by-category?from&to&type
GET    /v1/insights/balance-series?from&to&granularity=day
GET    /v1/insights/monthly-comparison?months=6
GET    /v1/insights/budget-status?month=2026-07
```

O endpoint `balance-series` é o que alimenta o gráfico com scrubber do app — devolve a série já agregada por dia, pronta para render, sem pós-processamento no cliente.

### 6.2 Paginação

Cursor, não offset. Offset em lista financeira ordenada por data produz item duplicado ou perdido quando chega lançamento novo durante a navegação.

```json
{
  "data": [],
  "meta": { "nextCursor": "eyJpZCI6...", "hasMore": true, "limit": 50 }
}
```

### 6.3 Erros — RFC 9457 (`application/problem+json`)

```json
{
  "type": "https://api.fluxo.app/errors/insufficient-installments",
  "title": "Número de parcelas inválido",
  "status": 422,
  "code": "TRANSACTION_INVALID_INSTALLMENTS",
  "detail": "Parcelamento exige entre 2 e 24 parcelas.",
  "instance": "/v1/transactions",
  "traceId": "01J8X...",
  "errors": [{ "field": "installmentTotal", "message": "deve estar entre 2 e 24" }]
}
```

`code` é o contrato real — string estável, em catálogo versionado, que o cliente usa em `switch`. `title` e `detail` são para humanos e podem mudar. Nenhuma mensagem de erro expõe SQL, stack ou nome de tabela.

### 6.4 Idempotência

`POST /v1/transactions` exige header `Idempotency-Key` (UUID do cliente). Tabela `idempotency_keys` guarda `(userId, key, requestHash, responseBody, statusCode)` por 24h. Chave repetida com mesmo hash devolve a resposta original; com hash diferente devolve `409 IDEMPOTENCY_KEY_REUSED`. É o que permite ao app registrar offline e reenviar sem medo.

### 6.5 OpenAPI

Gerado do zod via `nestjs-zod`, exportado em `docs/openapi.json` no build e commitado. O `packages/api-client` do monorepo é gerado dele — mobile e web nunca escrevem tipo de request na mão.

---

## 7. Regras financeiras no servidor

**Parcelamento.** `POST /transactions` com `paymentMethod: CREDIT` e `installmentTotal: N` cria N linhas numa transação de banco, mesmo `installmentGroupId`, com `splitInstallments` distribuindo o resto nas primeiras parcelas. Invariante: `SUM(amount_cents) = total`. Se não fechar, aborta.

**Competência × caixa.** Todo endpoint de leitura aceita `basis=accrual|cash` (padrão `accrual`). `accrual` filtra por `occurredAt`; `cash` por `settledAt`. `settledAt` de compra no crédito é calculado do `closingDay`/`dueDay` do cartão no momento da criação, e regravado se o cartão for editado.

**Agregação em SQL.** `insights/*` usa query raw parametrizada com `date_trunc(..., occurred_at AT TIME ZONE 'America/Sao_Paulo')`. Nunca `findMany` seguido de `reduce`. Um gasto às 22h de 31/jul pertence a julho, e só o Postgres com timezone explícito garante isso.

**Soft delete.** `deletedAt` em tudo, com extensão do Prisma filtrando por padrão. Restauração possível em 30 dias.

**Auditoria.** Toda mutação em `transactions`, `goals` e `credit_cards` grava em `audit_logs`: quem, quando, o quê, valor antes e depois.

**Transações de banco.** Operação que toca mais de uma linha (parcelamento, edição com `scope=future`, confirmação de recorrência) roda dentro de `$transaction`. Isolation `ReadCommitted` basta; escolha explícita, não padrão acidental.

**Jobs (`@nestjs/schedule`), todos com lock em tabela** para não duplicarem se houver mais de uma instância:

| Cron | O quê |
|---|---|
| `0 3 * * *` | Materializa recorrências dos próximos 45 dias como previstos |
| `0 4 * * *` | Recalcula `settledAt` de faturas que fecharam |
| `0 9 * * *` | Avalia orçamentos e metas, dispara alerta de estouro |
| `0 5 * * 0` | Limpa refresh tokens expirados e chaves de idempotência vencidas |

---

## 8. Guardrails

Invioláveis. O agente trata como falha de build:

1. Nenhum `float` ou `Decimal` em dinheiro. Inteiro em centavos, sempre.
2. Nenhum `userId` vindo de body ou query. Só do token.
3. Nenhum `PrismaService` fora de repository.
4. Nenhuma regra de negócio em controller.
5. Nenhum `HttpException` em service. Erro de domínio + filter.
6. Nenhum `prisma db push` fora de branch descartável.
7. Nenhuma migration editada depois de aplicada.
8. Nenhum `SELECT` sem filtro de `userId` e de `deletedAt`.
9. Nenhum delete físico.
10. Nenhum segredo, token, senha ou valor de transação em log.
11. Nenhuma agregação em memória quando o Postgres pode fazer.
12. Nenhum endpoint sem schema zod de entrada e de saída.
13. Nenhuma resposta de erro expondo detalhe interno.
14. Nenhum `any`. `unknown` + narrowing quando necessário.

---

## 9. Observabilidade e operação

- **Logs**: pino em JSON, `requestId` propagado (`x-request-id`, gerado se ausente), correlacionado com o `traceId` do erro.
- **Health**: `/health/live` (processo vivo) e `/health/ready` (banco respondendo). Plataforma de deploy usa o `ready`.
- **Sentry**: só erro 5xx e falha de job. `beforeSend` remove `amountCents`, `description` e `notes` — nome e valor de gasto são dado pessoal sensível.
- **Métricas**: latência p95 por rota e contagem de erro por `code`. Prometheus quando houver tráfego que justifique.
- **Backup**: Neon já faz PITR; validar restauração pelo menos uma vez antes do primeiro usuário real. Backup não testado não é backup.

---

## 10. Deploy

- **Railway ou Fly.io.** Nest quer processo long-running, com cron e pool de conexão vivo — serverless briga com os três.
- Dockerfile multi-stage, imagem final `node:22-alpine`, usuário não-root, `dumb-init` como PID 1.
- Pipeline: `lint → typecheck → build → migrate deploy (release) → deploy → smoke test em /health/ready`.
- Rollback de código é automático; **rollback de migration não existe**. Por isso expand/contract.
- Env por ambiente, validada com zod no boot. Faltou variável, o processo morre no start em vez de falhar em produção às três da manhã.

---

## 11. Configuração do Claude Code

### 11.1 `apps/api/CLAUDE.md`

Curto e direto: stack com versões travadas; as três camadas e o sentido da dependência; os 14 guardrails da seção 8; o fluxo de migration da seção 4.2; convenções (arquivo `kebab-case.tipo.ts`, DTO `PascalCaseDto`, código de erro `MODULO_CAUSA` em SCREAMING_SNAKE); Conventional Commits; e "leia `docs/BRIEF.md` e a spec da fase corrente antes de escrever código".

### 11.2 Skills (`.claude/skills/`)

| Skill | Dispara em | Conteúdo |
|---|---|---|
| `prisma-migrations` | qualquer mudança em `schema.prisma` ou `prisma/` | fluxo `migrate dev`, convenção de nome, expand/contract, checklist de revisão do SQL gerado, pooled × direct URL |
| `nest-module` | criar módulo, controller, service, repository | as três camadas, anatomia de pasta, injeção, o que cada camada pode importar |
| `money-domain` | qualquer valor, parcela, meta, agregação | centavos, `splitInstallments`, competência × caixa, timezone em SQL |
| `api-contract` | qualquer endpoint | zod in/out, RFC 9457, catálogo de códigos, paginação por cursor, idempotência |
| `auth-security` | `modules/auth`, guards, tokens | argon2id, rotação de refresh, detecção de reuso, 404 vs 403, redaction |
| `sql-performance` | query raw, `insights`, índice | agregação no banco, índices com `userId` na frente, `EXPLAIN ANALYZE` antes de otimizar |

Descrições no frontmatter precisam ser específicas — é o que determina se a skill dispara na hora certa:

```yaml
---
name: prisma-migrations
description: Use sempre que houver alteração em prisma/schema.prisma, criação de migration, mudança de índice ou de coluna. Dispara também em qualquer discussão sobre banco, Neon, pooling ou deploy de schema.
---
```

### 11.3 Subagents (`.claude/agents/`)

- **`spec-writer`** — pedido → spec com contrato e critérios de aceite. Não escreve código.
- **`api-designer`** — desenha rota, schemas zod e códigos de erro antes da implementação.
- **`nest-implementer`** — implementa seguindo as três camadas. Não decide contrato.
- **`migration-reviewer`** — lê o `.sql` gerado e barra `DROP`, `NOT NULL` sem default em tabela populada, índice sem `CONCURRENTLY`, rename direto. **Roda obrigatoriamente em todo diff que toque `prisma/`.**
- **`security-auditor`** — caça vazamento entre usuários, log de dado sensível, rota sem guard, erro expondo interno.
- **`money-reviewer`** — guardrails financeiros; roda antes de commit que toque em domínio.

### 11.4 Slash commands (`.claude/commands/`)

- `/spec <feature>` — gera `docs/specs/NN-feature.md`.
- `/module <nome>` — esqueleto completo do módulo com as quatro camadas e barrel.
- `/endpoint <método> <rota>` — controller + DTO zod + service + repository + entrada no OpenAPI.
- `/migration <descrição>` — gera a migration, abre o SQL e dispara o `migration-reviewer`.
- `/audit-security` — roda o `security-auditor` no diff.

### 11.5 Higiene

Camada de prompting (`CLAUDE.md`, `docs/specs/`, `.claude/`) fora do repo público via `.git/info/exclude`, mesmo padrão do ghtpromo.

---

## 12. Roadmap

| Fase | Entrega | Pronto quando |
|---|---|---|
| 0 | Scaffolding: Nest 11 + Fastify, TS strict, zod env, pino, Prisma 7 + Neon, Docker, CI | `/health/ready` responde 200 conectado ao Neon; migration inicial commitada |
| 1 | Base transversal: filters, pipes, guards, catálogo de erros, paginação, Swagger | Erro em `problem+json` com `code` estável; `/docs` no ar |
| 2 | Auth completo: registro, login, refresh rotativo com detecção de reuso, guard global | Reuso de refresh derruba a família; rota sem `@Public()` exige token |
| 3 | Users, accounts, credit-cards, categories | CRUD com escopo por usuário; recurso alheio devolve 404; seed idempotente |
| 4 | Transactions: criação, parcelamento, idempotência, filtros, edição com escopo | 3x de R$ 1.000 soma exatamente R$ 1.000; reenvio com mesma chave não duplica |
| 5 | Insights: as cinco rotas de agregação em SQL | `balance-series` de 90 dias abaixo de 200ms; timezone correto na virada do mês |
| 6 | Goals e recurrences + jobs agendados | Progresso planejado × efetivado; recorrência materializa como previsto |
| 7 | Endurecimento: throttler, auditoria, Sentry, métricas, `openapi.json` publicado | `packages/api-client` gerado e consumido pelo mobile |

---

## 13. Definition of Done (todo endpoint)

- [ ] Schema zod de entrada e de saída, compartilhado com `packages/domain` quando aplicável
- [ ] Guardrails da seção 8 respeitados
- [ ] Escopo por usuário nas três camadas
- [ ] Migration gerada, SQL revisado e commitado
- [ ] Erros com `code` no catálogo
- [ ] Documentado no OpenAPI com exemplo de request e response
- [ ] Índice conferido para a query nova (`EXPLAIN ANALYZE` se ela varre transações)
- [ ] Sem `any`, sem `console.log`
- [ ] Conventional Commit

---

## 14. Decisões em aberto

- **BigInt vs Int para centavos** — decidir na fase 0, antes da primeira migration. Trocar depois é migration simples, mas mexe em serialização de toda a API.
- **BullMQ + Redis** — só quando cron com lock em tabela não bastar (envio de push em massa, importação de extrato).
- **Multi-moeda** — campo `currency` já existe em `User`; a lógica de conversão fica fora de escopo até haver demanda real.
- **Open Finance (Pluggy)** — futuro provável. Manter `transactions` com campos `externalId` e `source` reservados desde o início evita migration dolorosa depois.
- **Cache de insights** — se `balance-series` passar de 200ms, Redis com TTL curto invalidado por mutação, antes de partir para view materializada.
