-- ============================================================
-- Migration 006 (Phase 2B - Livraison 2.1) : Payment Intents, Optimistic Locking & Audit Context
-- ============================================================

-- 1. SAAS_PAYMENT_INTENTS (Abstraction des intentions de paiement)
CREATE TABLE IF NOT EXISTS public.saas_payment_intents (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
  subscription_id          UUID REFERENCES public.saas_subscriptions(id),
  invoice_id               UUID REFERENCES public.saas_invoices(id),
  provider                 TEXT NOT NULL REFERENCES public.saas_payment_providers(code),
  payment_method           TEXT NOT NULL DEFAULT 'card', -- 'card', 'momo', 'bank_transfer', 'ussd'
  provider_intent_id       TEXT,
  amount_minor             BIGINT NOT NULL,
  currency                 CHAR(3) NOT NULL REFERENCES public.saas_currencies(code),
  status                   TEXT NOT NULL DEFAULT 'created'
                             CHECK (status IN ('created', 'requires_action', 'processing', 'succeeded', 'failed', 'canceled', 'refunded')),
  metadata                 JSONB NOT NULL DEFAULT '{}',
  correlation_id           UUID,
  causation_id             UUID,
  request_id               TEXT,
  trace_id                 TEXT,
  actor_ip                 TEXT,
  user_agent               TEXT,
  occurred_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intents_tenant_status ON public.saas_payment_intents(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_intents_provider_id ON public.saas_payment_intents(provider, provider_intent_id);

ALTER TABLE public.saas_payment_intents ENABLE ROW LEVEL SECURITY;

-- 2. EXTENSION SAAS_PAYMENT_PROVIDERS (Capacités & Priorités)
ALTER TABLE public.saas_payment_providers
  ADD COLUMN IF NOT EXISTS priority INT NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS supports_refund BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS supports_subscription BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS supports_webhook BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS supports_partial_capture BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_test_mode BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. VERROUILLAGE OPTIMISTE ET METADONNÉES D'AUDIT
ALTER TABLE public.saas_subscriptions
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'card',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.saas_webhook_events
  ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.saas_outbox_events
  ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
