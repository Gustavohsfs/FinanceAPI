# Fluxo API

API financeira NestJS/Fastify para o aplicativo Fluxo. O servidor é a fonte de
verdade para saldos, parcelamento, metas, recorrências e insights.

## Requisitos

- Node.js 22
- pnpm 10.14 via Corepack
- PostgreSQL 17 ou Neon

## Primeiro start

```bash
corepack enable
corepack prepare pnpm@10.14.0 --activate
pnpm install
cp .env.example .env
pnpm prisma:generate
pnpm prisma:deploy
pnpm prisma:seed
pnpm start:dev
```

No Windows PowerShell, copie o env com
`Copy-Item .env.example .env`. Preencha `DATABASE_URL` com o endpoint pooled e
`DIRECT_URL` com o endpoint direto do Neon.

- API: `http://localhost:3000`
- Swagger: `http://localhost:3000/docs`
- OpenAPI JSON: `http://localhost:3000/docs/openapi.json`
- Liveness: `http://localhost:3000/health/live`
- Readiness: `http://localhost:3000/health/ready`

## Comandos

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
pnpm openapi:generate
pnpm verify
```

Migrations são executadas como passo de release:

```bash
pnpm prisma:deploy
```

O processo da aplicação nunca executa migration automaticamente.

## Contrato

Todas as rotas de produto vivem em `/v1`. Dinheiro é inteiro em centavos, datas
são ISO 8601 UTC e erros usam `application/problem+json` com `code` estável.
Criação de transações exige `Idempotency-Key` UUID.
