-- ============================================================
-- Migration 007 (Phase 2B - Livraison 3) : Payment Methods, Amounts Minor & Provider Registry Capabilities
-- ============================================================

-- 1. SAAS_PAYMENT_METHODS (Moyens de paiement enregistrés par tenant)
CREATE TABLE IF NOT EXISTS public.saas_payment_methods (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
  provider            TEXT NOT NULL REFERENCES public.saas_payment_providers(code),
  payment_type        TEXT NOT NULL DEFAULT 'card' CHECK (payment_type IN ('card', 'momo', 'bank_transfer', 'ussd')),
  provider_method_id  TEXT NOT NULL,
  brand               TEXT,          -- 'visa', 'mastercard', 'orange_money', 'wave', 'mtn'
  last4               TEXT,          -- 4 derniers chiffres ou identifiant partiel
  is_default          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_methods_tenant ON public.saas_payment_methods(tenant_id);

ALTER TABLE public.saas_payment_methods ENABLE ROW LEVEL SECURITY;

-- 2. SOLDES & CAPACITÉS
ALTER TABLE public.saas_payment_intents
  ADD COLUMN IF NOT EXISTS authorized_amount_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS captured_amount_minor BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_amount_minor BIGINT NOT NULL DEFAULT 0;

ALTER TABLE public.saas_payment_providers
  ADD COLUMN IF NOT EXISTS maintenance_mode BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS degraded_mode BOOLEAN NOT NULL DEFAULT FALSE;
