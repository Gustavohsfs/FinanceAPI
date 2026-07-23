-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'PIX', 'DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "AccountKind" AS ENUM ('CHECKING', 'CASH', 'SAVINGS', 'INVESTMENT');

-- CreateEnum
CREATE TYPE "GoalKind" AS ENUM ('SAVING', 'INVESTMENT', 'SPEND_LIMIT');

-- CreateEnum
CREATE TYPE "RecurrenceFrequency" AS ENUM ('MONTHLY');

-- CreateEnum
CREATE TYPE "TransactionSource" AS ENUM ('MANUAL', 'RECURRENCE', 'OPEN_FINANCE');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(254) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'America/Sao_Paulo',
    "currency" CHAR(3) NOT NULL DEFAULT 'BRL',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "family_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "user_agent" VARCHAR(512),
    "ip_address" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "kind" "AccountKind" NOT NULL,
    "opening_balance_cents" INTEGER NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL DEFAULT 'BRL',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_cards" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "limit_cents" INTEGER NOT NULL,
    "closing_day" INTEGER NOT NULL,
    "due_day" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "credit_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "icon" VARCHAR(64) NOT NULL,
    "color" CHAR(7) NOT NULL,
    "type" "TransactionType" NOT NULL,
    "parent_id" UUID,
    "monthly_budget_cents" INTEGER,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "description" VARCHAR(120) NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "settled_at" TIMESTAMPTZ(3),
    "category_id" UUID,
    "account_id" UUID NOT NULL,
    "credit_card_id" UUID,
    "payment_method" "PaymentMethod" NOT NULL,
    "installment_group_id" UUID,
    "installment_number" INTEGER,
    "installment_total" INTEGER,
    "is_projected" BOOLEAN NOT NULL DEFAULT false,
    "recurrence_id" UUID,
    "currency" CHAR(3) NOT NULL DEFAULT 'BRL',
    "notes" TEXT,
    "external_id" VARCHAR(191),
    "source" "TransactionSource" NOT NULL DEFAULT 'MANUAL',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurrences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "description" VARCHAR(120) NOT NULL,
    "category_id" UUID,
    "account_id" UUID NOT NULL,
    "credit_card_id" UUID,
    "payment_method" "PaymentMethod" NOT NULL,
    "frequency" "RecurrenceFrequency" NOT NULL DEFAULT 'MONTHLY',
    "day_of_month" INTEGER NOT NULL,
    "next_occurrence_at" TIMESTAMPTZ(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "currency" CHAR(3) NOT NULL DEFAULT 'BRL',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "recurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "kind" "GoalKind" NOT NULL,
    "target_cents" INTEGER NOT NULL,
    "category_id" UUID,
    "start_date" TIMESTAMPTZ(3) NOT NULL,
    "deadline" TIMESTAMPTZ(3) NOT NULL,
    "recurrence" VARCHAR(16) NOT NULL DEFAULT 'ONCE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "key" UUID NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "response_body" JSONB NOT NULL,
    "status_code" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "entity_type" VARCHAR(40) NOT NULL,
    "entity_id" UUID NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_locks" (
    "name" VARCHAR(100) NOT NULL,
    "locked_by" VARCHAR(100) NOT NULL,
    "locked_until" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "job_locks_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_expires_at_idx" ON "refresh_tokens"("user_id", "expires_at");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_family_id_idx" ON "refresh_tokens"("user_id", "family_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_expires_at_idx" ON "password_reset_tokens"("user_id", "expires_at");

-- CreateIndex
CREATE INDEX "accounts_user_id_deleted_at_idx" ON "accounts"("user_id", "deleted_at");

-- CreateIndex
CREATE INDEX "credit_cards_user_id_deleted_at_idx" ON "credit_cards"("user_id", "deleted_at");

-- CreateIndex
CREATE INDEX "credit_cards_user_id_account_id_idx" ON "credit_cards"("user_id", "account_id");

-- CreateIndex
CREATE INDEX "categories_user_id_type_is_archived_idx" ON "categories"("user_id", "type", "is_archived");

-- CreateIndex
CREATE INDEX "categories_user_id_parent_id_idx" ON "categories"("user_id", "parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_user_id_name_type_key" ON "categories"("user_id", "name", "type");

-- CreateIndex
CREATE INDEX "transactions_user_id_occurred_at_id_idx" ON "transactions"("user_id", "occurred_at" DESC, "id");

-- CreateIndex
CREATE INDEX "transactions_user_id_category_id_occurred_at_idx" ON "transactions"("user_id", "category_id", "occurred_at");

-- CreateIndex
CREATE INDEX "transactions_user_id_installment_group_id_idx" ON "transactions"("user_id", "installment_group_id");

-- CreateIndex
CREATE INDEX "transactions_user_id_settled_at_idx" ON "transactions"("user_id", "settled_at");

-- CreateIndex
CREATE INDEX "transactions_user_id_recurrence_id_idx" ON "transactions"("user_id", "recurrence_id");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_user_id_source_external_id_key" ON "transactions"("user_id", "source", "external_id");

-- CreateIndex
CREATE INDEX "recurrences_user_id_next_occurrence_at_idx" ON "recurrences"("user_id", "next_occurrence_at");

-- CreateIndex
CREATE INDEX "recurrences_user_id_is_active_deleted_at_idx" ON "recurrences"("user_id", "is_active", "deleted_at");

-- CreateIndex
CREATE INDEX "goals_user_id_kind_deleted_at_idx" ON "goals"("user_id", "kind", "deleted_at");

-- CreateIndex
CREATE INDEX "goals_user_id_category_id_idx" ON "goals"("user_id", "category_id");

-- CreateIndex
CREATE INDEX "idempotency_keys_user_id_expires_at_idx" ON "idempotency_keys"("user_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_user_id_key_key" ON "idempotency_keys"("user_id", "key");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_entity_type_entity_id_created_at_idx" ON "audit_logs"("user_id", "entity_type", "entity_id", "created_at" DESC);

-- Financial and calendar invariants intentionally live in PostgreSQL as a
-- second line of defense behind the Zod contracts and domain services.
ALTER TABLE "accounts"
  ADD CONSTRAINT "accounts_opening_balance_nonnegative"
  CHECK ("opening_balance_cents" >= 0);

ALTER TABLE "credit_cards"
  ADD CONSTRAINT "credit_cards_limit_nonnegative"
  CHECK ("limit_cents" >= 0),
  ADD CONSTRAINT "credit_cards_closing_day_valid"
  CHECK ("closing_day" BETWEEN 1 AND 31),
  ADD CONSTRAINT "credit_cards_due_day_valid"
  CHECK ("due_day" BETWEEN 1 AND 31);

ALTER TABLE "categories"
  ADD CONSTRAINT "categories_budget_nonnegative"
  CHECK ("monthly_budget_cents" IS NULL OR "monthly_budget_cents" >= 0),
  ADD CONSTRAINT "categories_type_valid"
  CHECK ("type" IN ('INCOME', 'EXPENSE')),
  ADD CONSTRAINT "categories_color_valid"
  CHECK ("color" ~ '^#[0-9A-Fa-f]{6}$');

ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_amount_nonnegative"
  CHECK ("amount_cents" >= 0),
  ADD CONSTRAINT "transactions_installments_valid"
  CHECK (
    (
      "installment_group_id" IS NULL
      AND "installment_number" IS NULL
      AND "installment_total" IS NULL
    )
    OR
    (
      "installment_group_id" IS NOT NULL
      AND "installment_number" BETWEEN 1 AND 24
      AND "installment_total" BETWEEN 2 AND 24
      AND "installment_number" <= "installment_total"
      AND "payment_method" = 'CREDIT'
    )
  );

ALTER TABLE "recurrences"
  ADD CONSTRAINT "recurrences_amount_positive"
  CHECK ("amount_cents" > 0),
  ADD CONSTRAINT "recurrences_day_valid"
  CHECK ("day_of_month" BETWEEN 1 AND 31),
  ADD CONSTRAINT "recurrences_type_valid"
  CHECK ("type" IN ('INCOME', 'EXPENSE'));

ALTER TABLE "goals"
  ADD CONSTRAINT "goals_target_positive"
  CHECK ("target_cents" > 0),
  ADD CONSTRAINT "goals_dates_valid"
  CHECK ("deadline" >= "start_date"),
  ADD CONSTRAINT "goals_recurrence_valid"
  CHECK ("recurrence" IN ('ONCE', 'MONTHLY')),
  ADD CONSTRAINT "goals_spend_limit_category_required"
  CHECK ("kind" <> 'SPEND_LIMIT' OR "category_id" IS NOT NULL);

ALTER TABLE "idempotency_keys"
  ADD CONSTRAINT "idempotency_status_valid"
  CHECK ("status_code" BETWEEN 100 AND 599);

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_cards" ADD CONSTRAINT "credit_cards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_cards" ADD CONSTRAINT "credit_cards_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_credit_card_id_fkey" FOREIGN KEY ("credit_card_id") REFERENCES "credit_cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_recurrence_id_fkey" FOREIGN KEY ("recurrence_id") REFERENCES "recurrences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurrences" ADD CONSTRAINT "recurrences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurrences" ADD CONSTRAINT "recurrences_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurrences" ADD CONSTRAINT "recurrences_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurrences" ADD CONSTRAINT "recurrences_credit_card_id_fkey" FOREIGN KEY ("credit_card_id") REFERENCES "credit_cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
