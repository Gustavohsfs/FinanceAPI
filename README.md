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
pnpm build:check
pnpm openapi:generate
pnpm prisma:validate
pnpm verify
```

Migrations são executadas como passo de release:

```bash
pnpm prisma:deploy
```

O processo da aplicação nunca executa migration automaticamente.

Com a API iniciada, o smoke end-to-end valida health, Swagger,
autenticação, catálogos, idempotência, isolamento entre usuários e insights:

```bash
pnpm smoke
```

## Deploy no Google Cloud Run

O deploy usa uma imagem para dois recursos:

- `fluxo-api`: serviço público para o app mobile;
- `fluxo-api-maintenance`: job privado para recorrências, faturas, orçamentos e
  limpeza.

O serviço usa faturamento por requisição, 1 vCPU, 512 MiB, concorrência 10,
mínimo 0 e máximo 3 instâncias. O job é acionado diariamente por um único Cloud
Scheduler em `America/Sao_Paulo`. Os antigos crons internos não são usados
porque uma instância com faturamento por requisição não possui CPU garantida
fora de uma requisição.

Requisitos:

- Google Cloud CLI autenticado;
- projeto com faturamento ativo;
- `.env` local preenchido com os endpoints pooled e direto do Neon.

No PowerShell:

```powershell
.\scripts\deploy-cloud-run.ps1 -ProjectId seu-projeto-google
```

O script aplica as migrations antes do deploy, cria o Artifact Registry, faz o
build remoto, configura o serviço, o job e o Scheduler e cria um orçamento
mensal de R$ 50. Os alertas de gasto são enviados em 10%, 20%, 40% e 100% —
R$ 5, R$ 10, R$ 20 e R$ 50. Um orçamento envia alertas, mas não bloqueia gastos.

Os valores abaixo são enviados diretamente do `.env` ao Secret Manager por
entrada padrão e ficam fixados a uma versão numérica:

- `DATABASE_URL`
- `DIRECT_URL`
- `JWT_SECRET_CURRENT`
- `REFRESH_TOKEN_PEPPER`

`NODE_ENV` e `CORS_ORIGINS` são configurações não secretas do serviço. O arquivo
`.gcloudignore` impede o envio do `.env` ao Cloud Build.

Para executar a manutenção manualmente:

```powershell
gcloud run jobs execute fluxo-api-maintenance `
  --region=southamerica-east1 `
  --wait
```

Para voltar o tráfego a uma revisão anterior:

```powershell
gcloud run services update-traffic fluxo-api `
  --region=southamerica-east1 `
  --to-revisions REVISAO_ANTERIOR=100
```

Rollback de código não desfaz migrations. Mudanças de banco continuam seguindo
expand/contract.

## Contrato

Todas as rotas de produto vivem em `/v1`. Dinheiro é inteiro em centavos, datas
são ISO 8601 UTC e erros usam `application/problem+json` com `code` estável.
Criação de transações exige `Idempotency-Key` UUID.
