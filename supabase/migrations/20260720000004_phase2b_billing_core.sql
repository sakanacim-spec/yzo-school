-- ============================================================
-- Migration 005 (Phase 2B - Livraison 2) : Billing Core, State Machine History & Concurrence Locks
-- ============================================================

-- 1. SAAS_PAYMENT_PROVIDERS (Catalogue des fournisseurs de paiement)
CREATE TABLE IF NOT EXISTS public.saas_payment_providers (
  code                  TEXT PRIMARY KEY, -- 'mock', 'stripe', 'paystack', 'lemonsqueezy', 'flutterwave'
  name                  TEXT NOT NULL,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  supported_currencies  JSONB NOT NULL DEFAULT '["EUR", "USD", "XOF"]',
  config_schema         JSONB NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.saas_payment_providers (code, name, is_active) VALUES
  ('mock', 'Mock Internal Provider', TRUE),
  ('stripe', 'Stripe Payments', TRUE),
  ('paystack', 'Paystack Africa & Mobile Money', TRUE)
ON CONFLICT (code) DO NOTHING;

-- 2. SAAS_SUBSCRIPTION_HISTORY (Historique immuable des transitions d'abonnements)
CREATE TABLE IF NOT EXISTS public.saas_subscription_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES public.saas_subscriptions(id) ON DELETE CASCADE,
  from_status     TEXT NOT NULL,
  to_status       TEXT NOT NULL,
  from_plan_id    TEXT REFERENCES public.saas_plans(id),
  to_plan_id      TEXT REFERENCES public.saas_plans(id),
  reason          TEXT,
  actor_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_source    TEXT NOT NULL DEFAULT 'system' CHECK (actor_source IN ('webhook', 'dashboard', 'cron', 'api', 'support', 'system')),
  correlation_id  UUID,
  causation_id    UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_hist_subscription ON public.saas_subscription_history(subscription_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sub_hist_correlation ON public.saas_subscription_history(correlation_id);

ALTER TABLE public.saas_subscription_history ENABLE ROW LEVEL SECURITY;

-- 3. AJOUT DES COLONNES DE CORRÉLATION, CAUSALITÉ & RETRY SUR LES TABLES DE FONDATION
ALTER TABLE public.saas_webhook_events
  ADD COLUMN IF NOT EXISTS correlation_id UUID DEFAULT gen_random_uuid();

ALTER TABLE public.saas_billing_transactions
  ADD COLUMN IF NOT EXISTS correlation_id UUID,
  ADD COLUMN IF NOT EXISTS causation_id UUID,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_source TEXT NOT NULL DEFAULT 'webhook';

ALTER TABLE public.saas_outbox_events
  ADD COLUMN IF NOT EXISTS correlation_id UUID,
  ADD COLUMN IF NOT EXISTS causation_id UUID,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_billing_tx_correlation ON public.saas_billing_transactions(correlation_id);
CREATE INDEX IF NOT EXISTS idx_outbox_retry ON public.saas_outbox_events(status, next_retry_at) WHERE status = 'pending';
