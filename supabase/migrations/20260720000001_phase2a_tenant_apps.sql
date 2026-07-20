-- ============================================================
-- Migration 002 (Phase 2A) : Extension Tenants & Table saas_tenant_apps
-- Permet à un tenant d'héberger plusieurs SaaS métiers (ex: Yziow, Mediow...)
-- ============================================================

-- 1. Extension de la table saas_tenants
ALTER TABLE public.saas_tenants
  ADD COLUMN IF NOT EXISTS country VARCHAR(3) DEFAULT 'FRA',
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active'
    CHECK (status IN ('active', 'trial', 'suspended', 'cancelled'));

-- INDEX sur le slug pour accélérer les recherches publiques / sous-domaines
CREATE INDEX IF NOT EXISTS idx_saas_tenants_slug ON public.saas_tenants(slug);

-- 2. Table de liaison saas_tenant_apps (Tenant ➔ SaaS Métiers installés)
CREATE TABLE IF NOT EXISTS public.saas_tenant_apps (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
  saas_id       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trial', 'suspended', 'cancelled')),
  modules       JSONB NOT NULL DEFAULT '[]',
  activated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, saas_id)
);

COMMENT ON TABLE public.saas_tenant_apps IS
  '[SaaS Platform] SaaS métiers activés par tenant (ex: Yziow, Mediow). '
  'Découple la relation Tenant -> Apps pour autoriser le multi-SaaS par établissement.';

-- 3. Activation RLS sur saas_tenant_apps
ALTER TABLE public.saas_tenant_apps ENABLE ROW LEVEL SECURITY;

-- Dynamic RLS Policy: les utilisateurs n'accèdent qu'aux apps de leur tenant
CREATE POLICY saas_tenant_apps_tenant_isolation ON public.saas_tenant_apps
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.saas_profiles WHERE id = auth.uid()
    )
  );
