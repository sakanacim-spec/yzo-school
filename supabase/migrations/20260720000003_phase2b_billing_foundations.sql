-- ============================================================
-- Migration 004 (Phase 2B - Livraison 1) : Fondations Billing Engine & Architectures Immuables
-- ============================================================

-- 1. SAAS_CURRENCIES (Enum & validation des devises)
CREATE TABLE IF NOT EXISTS public.saas_currencies (
  code           CHAR(3) PRIMARY KEY, -- 'EUR', 'XOF', 'USD', 'GBP'
  name           TEXT NOT NULL,
  symbol         TEXT NOT NULL,
  exponent       INT NOT NULL DEFAULT 2, -- 2 pour EUR/USD (100 minor = 1.00), 0 pour XOF (1 minor = 1)
  is_active      BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.saas_currencies (code, name, symbol, exponent) VALUES
  ('EUR', 'Euro', '€', 2),
  ('XOF', 'Franc CFA BCEAO', 'FCFA', 0),
  ('USD', 'US Dollar', '$', 2),
  ('GBP', 'Pound Sterling', '£', 2)
ON CONFLICT (code) DO NOTHING;

-- 2. SAAS_PLANS & SAAS_PLAN_PRICES (Catalogue des plans versionnés & tarifs multi-devises)
CREATE TABLE IF NOT EXISTS public.saas_plans (
  id           TEXT PRIMARY KEY, -- ex: 'professional_v1'
  plan_code    TEXT NOT NULL,    -- ex: 'professional'
  version      INT NOT NULL DEFAULT 1,
  name         TEXT NOT NULL,
  features     JSONB NOT NULL DEFAULT '[]',
  limits       JSONB NOT NULL DEFAULT '{}',
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (plan_code, version)
);

CREATE TABLE IF NOT EXISTS public.saas_plan_prices (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id                TEXT NOT NULL REFERENCES public.saas_plans(id) ON DELETE CASCADE,
  currency               CHAR(3) NOT NULL REFERENCES public.saas_currencies(code),
  amount_minor_monthly   BIGINT NOT NULL,  -- 2900 (29.00 EUR) ou 19000 (19000 XOF)
  amount_minor_yearly    BIGINT NOT NULL,  -- 29000 (290.00 EUR)
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (plan_id, currency)
);

-- Insertion des plans initiaux
INSERT INTO public.saas_plans (id, plan_code, version, name, features, limits) VALUES
  ('starter_v1', 'starter', 1, 'Starter', '["auth", "rls"]', '{"maxUsers": 5, "storageGb": 2}'),
  ('professional_v1', 'professional', 1, 'Professional', '["auth", "rls", "ai-concierge", "notifications"]', '{"maxUsers": 25, "storageGb": 20}'),
  ('enterprise_v1', 'enterprise', 1, 'Enterprise', '["auth", "rls", "ai-concierge", "notifications", "api-gateway", "custom-domain"]', '{"maxUsers": 1000, "storageGb": 500}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.saas_plan_prices (plan_id, currency, amount_minor_monthly, amount_minor_yearly) VALUES
  ('starter_v1', 'EUR', 900, 9000),
  ('starter_v1', 'XOF', 5900, 59000),
  ('professional_v1', 'EUR', 2900, 29000),
  ('professional_v1', 'XOF', 19000, 190000),
  ('enterprise_v1', 'EUR', 9900, 99000),
  ('enterprise_v1', 'XOF', 65000, 650000)
ON CONFLICT (plan_id, currency) DO NOTHING;

-- 3. SAAS_SUBSCRIPTIONS (Rattachée aux Tenant Apps & Machine à États)
CREATE TABLE IF NOT EXISTS public.saas_subscriptions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_app_id            UUID NOT NULL REFERENCES public.saas_tenant_apps(id) ON DELETE CASCADE,
  plan_id                  TEXT NOT NULL REFERENCES public.saas_plans(id),
  provider                 TEXT NOT NULL DEFAULT 'mock',
  provider_subscription_id TEXT,
  status                   TEXT NOT NULL DEFAULT 'trialing'
                             CHECK (status IN ('trialing', 'active', 'past_due', 'suspended', 'canceled')),
  trial_ends_at            TIMESTAMPTZ,
  starts_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at                  TIMESTAMPTZ,
  canceled_at              TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant_app ON public.saas_subscriptions(tenant_app_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.saas_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_provider ON public.saas_subscriptions(provider, provider_subscription_id);

ALTER TABLE public.saas_subscriptions ENABLE ROW LEVEL SECURITY;

-- 4. SAAS_INVOICES (Factures Dédiées)
CREATE TABLE IF NOT EXISTS public.saas_invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number  TEXT UNIQUE NOT NULL, -- INV-YYYYMM-XXXXX
  subscription_id UUID NOT NULL REFERENCES public.saas_subscriptions(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('draft', 'open', 'paid', 'uncollectible', 'void')),
  amount_minor    BIGINT NOT NULL,
  currency        CHAR(3) NOT NULL REFERENCES public.saas_currencies(code),
  due_date        TIMESTAMPTZ NOT NULL,
  paid_at         TIMESTAMPTZ,
  pdf_url         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_tenant_status ON public.saas_invoices(tenant_id, status);

ALTER TABLE public.saas_invoices ENABLE ROW LEVEL SECURITY;

-- 5. SAAS_BILLING_TRANSACTIONS (Grand Livre Comptable Immuable Append-Only)
CREATE TABLE IF NOT EXISTS public.saas_billing_transactions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id               UUID REFERENCES public.saas_invoices(id),
  tenant_id                UUID NOT NULL REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
  subscription_id          UUID REFERENCES public.saas_subscriptions(id),
  provider                 TEXT NOT NULL,
  transaction_type         TEXT NOT NULL CHECK (transaction_type IN (
                             'PAYMENT_AUTHORIZED', 'PAYMENT_CAPTURED', 'PAYMENT_FAILED',
                             'REFUND_CREATED', 'REFUND_COMPLETED', 'CHARGEBACK', 'INVOICE_PAID'
                           )),
  amount_minor             BIGINT NOT NULL,
  currency                 CHAR(3) NOT NULL REFERENCES public.saas_currencies(code),
  provider_transaction_id  TEXT,
  metadata                 JSONB NOT NULL DEFAULT '{}',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_tx_tenant ON public.saas_billing_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_billing_tx_invoice ON public.saas_billing_transactions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_billing_tx_created ON public.saas_billing_transactions(created_at DESC);

ALTER TABLE public.saas_billing_transactions ENABLE ROW LEVEL SECURITY;

-- 6. SAAS_WEBHOOK_EVENTS (Idempotence & Payload Brut)
CREATE TABLE IF NOT EXISTS public.saas_webhook_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider            TEXT NOT NULL,
  external_event_id   TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'processed', 'failed', 'duplicate')),
  raw_body            TEXT NOT NULL,
  headers             JSONB NOT NULL DEFAULT '{}',
  signature           TEXT,
  payload             JSONB NOT NULL DEFAULT '{}',
  received_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, external_event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_status_created ON public.saas_webhook_events(status, created_at DESC);

-- 7. SAAS_OUTBOX_EVENTS (Transactional Outbox Pattern)
CREATE TABLE IF NOT EXISTS public.saas_outbox_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name    TEXT NOT NULL,
  event_version INT NOT NULL DEFAULT 1,
  aggregate_id  TEXT NOT NULL,
  payload       JSONB NOT NULL DEFAULT '{}',
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'failed')),
  attempts      INT NOT NULL DEFAULT 0,
  published_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending ON public.saas_outbox_events(status, created_at ASC) WHERE status = 'pending';

-- 8. DEAD_LETTER_QUEUE (Queue de secours notifications)
CREATE TABLE IF NOT EXISTS public.dead_letter_queue (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_name     TEXT NOT NULL,
  payload        JSONB NOT NULL,
  error_message  TEXT NOT NULL,
  attempts       INT NOT NULL,
  failed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dlq_queue ON public.dead_letter_queue(queue_name, failed_at DESC);
