-- ============================================================
-- Migration 003 (Phase 2A.1) : Abstractions, Audit Logs, Modules Normalisés & Feature Flags
-- ============================================================

-- 1. SAAS_AUDIT_LOGS (Journal d'événements traçables)
CREATE TABLE IF NOT EXISTS public.saas_audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email   TEXT,
  event_type    TEXT NOT NULL,
  payload       JSONB NOT NULL DEFAULT '{}',
  ip_address    TEXT,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saas_audit_logs_tenant ON public.saas_audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_saas_audit_logs_event ON public.saas_audit_logs(event_type);

ALTER TABLE public.saas_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY saas_audit_logs_tenant_isolation ON public.saas_audit_logs
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.saas_profiles WHERE id = auth.uid()
    )
  );

-- 2. SAAS_MODULES & SAAS_TENANT_MODULES (Modèle normalisé de modules)
CREATE TABLE IF NOT EXISTS public.saas_modules (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL,
  publisher     TEXT NOT NULL DEFAULT 'OZIOW Official',
  version       TEXT NOT NULL DEFAULT '1.0.0',
  description   TEXT,
  is_system     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.saas_tenant_modules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
  module_id     TEXT NOT NULL REFERENCES public.saas_modules(id) ON DELETE CASCADE,
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  configuration JSONB NOT NULL DEFAULT '{}',
  activated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, module_id)
);

ALTER TABLE public.saas_tenant_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY saas_tenant_modules_tenant_isolation ON public.saas_tenant_modules
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.saas_profiles WHERE id = auth.uid()
    )
  );

-- 3. SAAS_TENANT_DOMAINS (Gestion des sous-domaines & domaines personnalisés)
CREATE TABLE IF NOT EXISTS public.saas_tenant_domains (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
  domain         TEXT UNIQUE NOT NULL,
  is_primary     BOOLEAN NOT NULL DEFAULT FALSE,
  verified       BOOLEAN NOT NULL DEFAULT FALSE,
  ssl_status     TEXT NOT NULL DEFAULT 'pending' CHECK (ssl_status IN ('pending', 'active', 'failed')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.saas_tenant_domains ENABLE ROW LEVEL SECURITY;

-- 4. SAAS_TENANT_FEATURES (Feature Flags par tenant)
CREATE TABLE IF NOT EXISTS public.saas_tenant_features (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
  feature_key   TEXT NOT NULL,
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, feature_key)
);

ALTER TABLE public.saas_tenant_features ENABLE ROW LEVEL SECURITY;
