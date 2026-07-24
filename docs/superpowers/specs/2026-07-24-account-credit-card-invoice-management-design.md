# Gerenciamento de contas, cartões e faturas — Design

## Contexto

Hoje a API expõe apenas listagem e criação para contas e cartões. O web permite
criar ambos e consultar o total calculado da fatura, mas não editar nem excluir.
O mobile também permite apenas criar e ainda não apresenta a fatura.

Lançamentos já possuem `PATCH` e `DELETE` com escopo de parcelamento. A fatura é
calculada pela soma dos lançamentos de crédito compensados no mês e continuará
sendo um valor derivado. Não haverá campo de total manual nem tabela de
sobrescrita de fatura.

Esta entrega abrange três repositórios:

- `FinanceAPI`: contrato, regras, persistência, auditoria e cálculo;
- `FinanceWebApp`: gerenciamento desktop e detalhe da fatura;
- `FinanceMobileApp`: gerenciamento mobile, fatura e edição de lançamento.

## Objetivos

- Editar e excluir contas por soft delete.
- Editar e excluir cartões por soft delete.
- Exibir a fatura mensal no web e no mobile.
- Permitir corrigir a fatura editando ou excluindo os lançamentos que a compõem.
- Preservar histórico, isolamento por usuário e auditoria.
- Evitar que itens excluídos sejam recriados automaticamente pelo mobile.

## Fora de escopo

- Informar manualmente um total de fatura diferente dos lançamentos.
- Persistir snapshots de fatura ou estados de pagamento.
- Pagamento de fatura, parcelamento de fatura, juros ou encargos.
- Exclusão física de qualquer entidade.
- Refatorações não relacionadas das telas de lançamentos.

## Alternativas consideradas

### 1. Gerenciamento integrado nos três clientes — escolhido

A API ganha o CRUD ausente e filtro de lançamentos por cartão. Web e mobile
expõem as mesmas capacidades e usam os lançamentos como itens editáveis da
fatura. É a opção com maior consistência entre superfícies e mantém uma única
fonte de verdade.

### 2. CRUD mínimo com redirecionamento à lista geral

Contas e cartões poderiam ser editados/excluídos, mas a fatura apenas levaria o
usuário à listagem global de lançamentos. Reduz código, porém cria um fluxo
confuso no mobile e não deixa claro quais compras formam a fatura.

### 3. Total manual de fatura

Uma tabela de ajustes permitiria sobrescrever o total calculado. Foi descartada
porque criaria duas verdades financeiras e exigiria regras adicionais de
conciliação, auditoria e precedência.

## Contrato da API

### Contas

```text
PATCH  /v1/accounts/:id
DELETE /v1/accounts/:id
```

O `PATCH` aceita ao menos um dos campos:

```ts
{
  name?: string;
  kind?: "CHECKING" | "CASH" | "SAVINGS" | "INVESTMENT";
  openingBalanceCents?: number;
  currency?: string;
}
```

O recurso é buscado por `id`, `userId` e `deletedAt: null`. Recurso inexistente,
excluído ou pertencente a outro usuário responde 404. O `DELETE` marca
`deletedAt` e responde 204.

Uma conta não pode ser excluída quando:

- é a última conta ativa do usuário;
- possui cartão ativo;
- possui recorrência ativa.

Lançamentos históricos não bloqueiam a exclusão, pois continuam referenciando a
linha preservada pelo soft delete.

### Cartões

```text
PATCH  /v1/credit-cards/:id
DELETE /v1/credit-cards/:id
```

O `PATCH` aceita ao menos um dos campos:

```ts
{
  accountId?: string;
  name?: string;
  limitCents?: number;
  closingDay?: number;
  dueDay?: number;
}
```

Quando `accountId` for informado, a conta precisa estar ativa e pertencer ao
usuário. Recurso inexistente, excluído ou alheio responde 404. O `DELETE` marca
`deletedAt` e responde 204.

Um cartão não pode ser excluído enquanto for usado por uma recorrência ativa.
Compras históricas não bloqueiam a exclusão.

Se `closingDay` ou `dueDay` mudar, a API recalcula `settledAt` de todos os
lançamentos de crédito ativos associados ao cartão usando
`calculateSettlementDate`. A alteração do cartão, os valores anteriores e os
novos valores de `settledAt` são auditados na mesma transação de banco.

### Lançamentos de uma fatura

`GET /v1/transactions` passa a aceitar o filtro opcional:

```ts
creditCardId?: string;
```

Os clientes obtêm os itens de uma fatura combinando:

```text
creditCardId=<id>
basis=cash
from=<início UTC do mês em America/Sao_Paulo>
to=<fim UTC do mês em America/Sao_Paulo>
type=EXPENSE
```

O total continua vindo de:

```text
GET /v1/credit-cards/:id/invoices?month=YYYY-MM
```

Após qualquer `PATCH` ou `DELETE` de lançamento, os clientes invalidam tanto as
queries de lançamentos quanto a query da fatura correspondente. Não será criado
um endpoint para editar diretamente a fatura.

## Regras de domínio e dependências

- Dinheiro permanece inteiro em centavos.
- Toda exclusão é soft delete.
- Toda query é escopada pelo `userId` do token.
- Conta/cartão alheio é indistinguível de inexistente.
- Dependências ativas geram 409 com código estável.
- Lançamentos históricos continuam disponíveis após a exclusão da conta/cartão.
- Edição ou exclusão de parcela sempre pede escopo `one`, `future` ou `all`.
- Mudanças em fechamento/vencimento podem mover compras entre faturas; os
  clientes atualizam as queries de fatura e lançamentos após a edição.

Os novos códigos de conflito são:

```text
ACCOUNT_LAST_ACTIVE
ACCOUNT_HAS_ACTIVE_CARDS
ACCOUNT_HAS_ACTIVE_RECURRENCES
CREDIT_CARD_HAS_ACTIVE_RECURRENCES
```

## Persistência e auditoria

Não há alteração de schema nem migration: `accounts` e `credit_cards` já possuem
`deleted_at`.

Repositories continuam sendo os únicos consumidores do Prisma. Updates,
validação de dependências, soft delete, recálculo de compensação e audit logs que
precisem ser atômicos executam em `$transaction` com isolamento
`ReadCommitted`.

Cartões registram auditoria para criação, edição e exclusão. O recálculo de
`settledAt` também registra auditoria das transações afetadas. Nenhum valor
financeiro é escrito em logs de aplicação.

## Web

### Contas e cartões

- Cada conta e cartão ganha menu de ações com `Editar` e `Excluir`.
- Os sheets existentes aceitam modo de criação ou edição e recebem os valores
  iniciais do recurso.
- Exclusão exige diálogo de confirmação.
- Conflitos 409 mostram a instrução correspondente, por exemplo, criar outra
  conta antes de excluir a última ou remover a recorrência ativa.
- Queries de contas, cartões, faturas, transações e insights são invalidadas de
  acordo com a mutação.

### Fatura

- O cartão exibe o total e o estado aberto/fechado como hoje.
- `Ver fatura` abre um sheet de detalhe do mês selecionado.
- O detalhe lista descrição, data de compensação, parcela e valor.
- Ações por item permitem editar e excluir.
- Edição de valor usa o mesmo parser monetário centralizado do web, sem
  `parseFloat`, cálculo monetário no componente ou arredondamento por ponto
  flutuante.
- Lançamento parcelado abre o seletor de escopo antes de editar ou excluir.
- Loading, erro e vazio são tratados no próprio detalhe.

## Mobile

### Contas e cartões

- Cada item ganha ação acessível de editar e excluir.
- O formulário de criação é reutilizado em modo de edição.
- Exclusão exige confirmação e apresenta conflitos de dependência em linguagem
  direta.
- Áreas de toque permanecem com no mínimo 44 pontos e ícones recebem labels de
  acessibilidade.

### Fatura e lançamentos

- Cada cartão consulta e mostra a fatura do mês selecionado.
- Tocar em `Ver fatura` abre uma rota modal com total, estado e itens.
- Tocar em um item abre o detalhe de lançamento existente.
- O detalhe passa a permitir editar o valor além de excluir.
- Parcelas exigem escolha de escopo nas duas operações.
- O repositório mobile passa a interpretar corretamente o array retornado por
  `PATCH /v1/transactions/:id`.

### Bootstrap

A conta continua obrigatória para registrar lançamentos, por isso a API impede
excluir a última conta ativa. O cartão é opcional. O mobile deixa de executar
`ensureDefaultCreditCard` em todo login; assim, excluir o último cartão é uma
ação persistente e ele não reaparece na próxima sessão. O estado sem cartão
orienta o usuário a criar um antes de escolher pagamento no crédito.

## Fluxo de dados

1. O cliente consulta cartões e o total da fatura do mês.
2. Ao abrir o detalhe, consulta lançamentos com `creditCardId` e período de
   caixa.
3. O usuário edita ou exclui um lançamento.
4. A API valida usuário e escopo, executa a mutação e grava auditoria.
5. O cliente invalida lançamentos, fatura e insights.
6. A nova consulta recalcula e apresenta o total derivado.

## Erros

- Validação de campos continua usando Problem Details com erros por campo.
- 404 cobre recurso inexistente, excluído ou de outro usuário.
- 409 cobre dependências que impedem exclusão.
- Falha de rede mantém o formulário aberto e preserva os valores digitados.
- A interface não aplica remoção otimista a conta/cartão, evitando sumir com um
  item antes de uma possível resposta 409.
- Mutações de lançamento podem continuar usando a estratégia atual, desde que
  revertam cache em erro.

## Testes e verificação

### API

- Schemas de update rejeitam corpo vazio, dinheiro fracionário e dias inválidos.
- Conta/cartão de outro usuário responde como inexistente.
- Soft delete remove o item das listagens sem apagar histórico.
- Exclusão respeita as quatro regras de conflito.
- Edição de fechamento/vencimento recalcula `settledAt` e grava auditoria.
- Filtro `creditCardId` combina corretamente com período e `basis=cash`.
- OpenAPI contém os novos métodos e parâmetro.

### Web

- Typecheck, lint e build passam.
- Formulários diferenciam criação e edição.
- Exclusão trata sucesso, 404 e conflitos 409.
- Detalhe da fatura invalida e apresenta o novo total após editar/excluir item.
- Edição monetária não usa operações de ponto flutuante.

### Mobile

- Typecheck e export Android de smoke passam.
- Criar, editar e excluir conta/cartão atualiza o cache.
- Último cartão excluído não é recriado no login seguinte.
- Fatura lista somente lançamentos do cartão e mês selecionados.
- Edição simples e parcelada interpreta o retorno da API corretamente.
- Estados de loading, erro, vazio e acessibilidade são preservados.

## Critérios de aceite

- Usuário edita nome, tipo e saldo inicial de uma conta no web e no mobile.
- Usuário exclui uma conta elegível e ela não volta às listagens.
- Usuário edita conta de pagamento, nome, limite, fechamento e vencimento de um
  cartão no web e no mobile.
- Usuário exclui um cartão elegível e ele não reaparece no próximo login.
- Web e mobile mostram o mesmo total de fatura retornado pela API.
- Alterar/excluir uma compra atualiza o total da fatura sem edição manual.
- Parcelas sempre exigem escolha explícita de escopo.
- Histórico financeiro permanece íntegro e nenhuma exclusão física ocorre.
