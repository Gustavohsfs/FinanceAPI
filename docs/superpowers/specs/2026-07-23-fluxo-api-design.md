# Fluxo API — Design

## Contexto e objetivo

Este repositório hospedará a API financeira consumida inicialmente pelo
`FinanceMobileApp`. O backend será a fonte autoritativa para autenticação,
persistência, parcelamento, competência versus caixa, metas e agregações do
dashboard. O contrato público terá base `/v1`, datas ISO 8601 em UTC, dinheiro
como inteiros em centavos e erros em `application/problem+json`.

O projeto começa como um serviço independente. Os schemas Zod e o OpenAPI serão
mantidos em fronteiras que permitam movê-los futuramente para
`packages/domain` e `packages/api-client` sem reescrever as regras.

## Decisões

- NestJS 11 com Fastify e Node 22.
- Prisma 7 com `@prisma/adapter-pg`; URL pooled no runtime e URL direta em
  migrations.
- `Int` (`int4`) para centavos. O limite cobre o domínio de finanças pessoais,
  é serializado naturalmente em JSON e coincide com os tipos atuais do mobile.
- Monólito modular com dependência `controller -> service -> repository`.
- Zod para todo input e output HTTP; OpenAPI gerado a partir desses contratos.
- JWT de acesso curto e refresh token opaco, rotativo e armazenado apenas como
  SHA-256.
- Consultas sempre recebem o `userId` do token. Recurso de outro usuário é
  indistinguível de recurso inexistente.
- Soft delete em entidades de negócio; nenhum endpoint executa delete físico.
- Agregações financeiras no PostgreSQL, com timezone
  `America/Sao_Paulo` explícito.
- Testes automatizados entram desde o início, apesar de o brief dispensar
  unitários nesta etapa: funções puras recebem unitários e fronteiras HTTP/banco
  recebem integração/e2e. Isso reduz risco nos invariantes financeiros e de
  segurança sem alterar o contrato.

## Arquitetura

`src/common` concentra decorators, guards, filtros, interceptors, contratos
transversais e o catálogo de erros. `src/database` é a única infraestrutura que
constrói o Prisma Client. Cada módulo em `src/modules` contém controller,
service, repository, schemas/DTOs e, quando necessário, funções puras em
`domain`.

Os módulos serão:

- `auth` e `users`: registro, sessão, rotação/reuso de refresh, perfil e senha.
- `accounts` e `credit-cards`: contas, cartões e cálculo de fatura.
- `categories`: categorias, subcategorias e orçamento mensal.
- `transactions`: listagem por cursor, criação idempotente, parcelamento,
  filtros, edição e remoção por escopo.
- `recurrences`: regras recorrentes e confirmação de previsto.
- `goals`: CRUD e progresso calculado.
- `insights`: as cinco agregações do dashboard em SQL parametrizado.
- `jobs`: materialização, fechamento e limpeza protegidos por lock no banco.
- `health`: liveness e readiness.

Controllers apenas validam/transmitem dados. Services orquestram regras e
lançam erros de domínio. Repositories são os únicos consumidores de Prisma e
sempre exigem `userId` nas operações de dados financeiros.

## Modelo de dados

A migration inicial cria usuários, refresh tokens, contas, cartões, categorias,
transações, recorrências, metas, chaves de idempotência, auditoria e locks de
jobs. Todas as entidades de negócio usam UUID, `created_at`, `updated_at` e
`deleted_at`, com tabelas em `snake_case`.

Valores monetários têm constraints não negativas. Relações financeiras são
escopadas por usuário e os índices de consulta iniciam com `user_id`.
`transactions` reserva `external_id` e `source` para futura integração Open
Finance, sem implementar sincronização ou câmbio.

O seed é idempotente. Categorias padrão são copiadas para cada usuário durante o
registro, em vez de compartilhadas globalmente.

## Fluxos críticos

### Autenticação

Registro cria usuário, categorias padrão e sessão em uma transação. Login
compara Argon2id e emite JWT de 15 minutos mais refresh opaco de 30 dias. Refresh
rotaciona o token na mesma família. A apresentação de token revogado revoga a
família inteira. Logout revoga a família atual; logout-all revoga todas.

O guard JWT é global. Apenas rotas marcadas explicitamente como públicas não
exigem autenticação. Forgot-password sempre responde 202; a primeira versão
gera e persiste o token, mas usa um adaptador de notificação sem provedor
externo e nunca retorna o token em produção.

### Transações e idempotência

`POST /v1/transactions` exige `Idempotency-Key` UUID. O serviço calcula um hash
canônico do request e executa criação, auditoria e persistência da resposta em
uma única transação `ReadCommitted`. Repetição com o mesmo hash devolve a
resposta original; hash diferente retorna
`409 IDEMPOTENCY_KEY_REUSED`.

Parcelamento só é aceito para crédito, entre 2 e 24 parcelas. O resto da divisão
é distribuído nas primeiras parcelas e a soma é verificada antes do commit.
Edição/remoção com `one`, `future` ou `all` permanece atômica.

### Insights

Summary, categoria, série de saldo, comparação mensal e orçamento executam
agregações SQL parametrizadas. Datas são convertidas com
`AT TIME ZONE 'America/Sao_Paulo'`; `basis=accrual` usa `occurred_at` e
`basis=cash` usa `COALESCE(settled_at, occurred_at)`. A série já chega pronta
para o gráfico do mobile.

## Contrato e erros

O envelope de listas por cursor é `{ data, meta }`. Recursos únicos e mutações
retornam objetos tipados diretamente. Erros seguem RFC 9457 e sempre incluem
`type`, `title`, `status`, `code`, `detail`, `instance` e `traceId`; erros de
campo adicionam `errors`.

O contrato atual do mobile será preservado semanticamente:

- enums e nomes `*Cents` permanecem iguais;
- `occurredAt`, `settledAt`, `createdAt`, `updatedAt` são strings ISO;
- criação não aceita `userId`;
- o cliente pode tomar decisões apenas pelo `code` estável.

## Segurança e operação

Configuração Zod impede boot com env incompleta. Logs JSON propagam request ID e
removem authorization, senha, tokens e conteúdo financeiro. Helmet, CORS por
allowlist e throttling protegem a superfície. O handler global nunca expõe
stack, SQL ou nomes internos.

As credenciais Neon ficam somente em `.env`, ignorado pelo Git. `.env.example`
documenta apenas nomes e formatos. O runtime usa o host pooler e migrations usam
o host direto. Migração é aplicada como operação separada do start.

Docker usa imagem Node 22 Alpine, usuário não-root e `dumb-init`. CI executa
lint, typecheck, testes, build, validação de migration e geração/verificação do
OpenAPI.

## Testes e aceite

- Unitários: divisão de parcelas, datas de fatura, hashes canônicos, cursores,
  progresso de metas e erros de domínio.
- Integração: repositories, isolamento entre usuários, soft delete,
  idempotência e SQL de insights.
- E2E: health, auth/refresh/reuso, CRUD principal, paginação e contratos de
  erro.
- Verificação estática: TypeScript strict, ESLint sem `any`, OpenAPI gerado e
  Prisma validate.
- Smoke real no Neon: migration deploy, seed repetido e `/health/ready`.

O primeiro start é considerado concluído quando o projeto instala, compila,
testa, sobe com Docker ou Node 22, aplica a migration versionada no Neon e
expõe documentação e health checks. Rotas que dependam de serviços externos
(e-mail, push e Sentry) usarão adaptadores seguros e ficarão desativadas quando
as respectivas envs não existirem.

## Fora de escopo

- Conversão multi-moeda.
- Open Finance/Pluggy.
- Redis, BullMQ e cache de insights antes de evidência de performance.
- Provedor real de e-mail ou push.
- Alterações no repositório mobile nesta entrega.
