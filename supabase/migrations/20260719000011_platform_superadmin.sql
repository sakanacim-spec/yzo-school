-- ============================================================
-- Migration 011 : Super Admin Platform (Metrics, Impersonation & KPIs)
-- Ne contient aucune logique métier Yziow (Vues isolées)
-- ============================================================

-- ── 1. FONCTIONS DE SÉCURITÉ JWT (Robustesse accrue) ────────
CREATE OR REPLACE FUNCTION public.saas_has_platform_role(role_name TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  roles JSONB;
BEGIN
  roles := auth.jwt() -> 'app_metadata' -> 'platform_roles';
  IF roles IS NULL OR jsonb_typeof(roles) != 'array' THEN
    RETURN FALSE;
  END IF;
  RETURN roles ? role_name;
EXCEPTION WHEN OTHERS THEN
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Redéfinition de l'ancienne fonction pour rétrocompatibilité
CREATE OR REPLACE FUNCTION public.saas_is_platform_admin()
RETURNS BOOLEAN AS $$
DECLARE
  roles JSONB;
BEGIN
  roles := auth.jwt() -> 'app_metadata' -> 'platform_roles';
  IF roles IS NULL OR jsonb_typeof(roles) != 'array' THEN
    RETURN FALSE;
  END IF;
  RETURN jsonb_array_length(roles) > 0;
EXCEPTION WHEN OTHERS THEN
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


-- ── 2. TABLES FINANCIÈRES (Oziow SaaS) ──────────────────────
CREATE TABLE public.saas_metrics_current (
    tenant_id UUID PRIMARY KEY REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
    current_mrr NUMERIC(10,2) DEFAULT 0,
    current_arr NUMERIC(10,2) DEFAULT 0,
    active_subscriptions INT DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE public.saas_financial_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
    -- Idempotence : La contrainte UNIQUE sur stripe_event_id garantit qu'un même webbhook n'est pas traité deux fois.
    stripe_event_id VARCHAR(255) UNIQUE, 
    event_type VARCHAR(50) NOT NULL,
    amount NUMERIC(10,2) DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'USD',
    metadata JSONB DEFAULT '{}'::jsonb,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_financial_events_tenant ON public.saas_financial_events(tenant_id, event_type);


-- ── 3. TABLE D'IMPERSONATION (Sécurité Durcie) ──────────────
CREATE TABLE public.platform_impersonation_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    super_admin_id UUID NOT NULL REFERENCES public.saas_profiles(id),
    tenant_id UUID NOT NULL REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
    justification TEXT NOT NULL CHECK (length(trim(justification)) >= 10),
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'REVOKED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT check_impersonation_duration 
      CHECK (expires_at > created_at AND expires_at <= created_at + interval '60 minutes')
);

CREATE INDEX idx_impersonation_fast_lookup ON public.platform_impersonation_sessions (tenant_id, super_admin_id, expires_at);

-- Politique claire sur les sessions simultanées : Un admin ne peut avoir qu'une session active à la fois.
CREATE UNIQUE INDEX idx_impersonation_single_active ON public.platform_impersonation_sessions (super_admin_id) WHERE status = 'ACTIVE';

-- Révocation immédiate et journal d'audit via trigger
CREATE OR REPLACE FUNCTION public.trigger_audit_impersonation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.saas_audit_logs (tenant_id, actor_id, action, severity, entity_type, entity_id, metadata)
    VALUES (NEW.tenant_id, NEW.super_admin_id, 'impersonation.started', 'SECURITY', 'impersonation_session', NEW.id, jsonb_build_object('justification', NEW.justification, 'expires_at', NEW.expires_at));
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'ACTIVE' AND NEW.status = 'REVOKED' THEN
    INSERT INTO public.saas_audit_logs (tenant_id, actor_id, action, severity, entity_type, entity_id, metadata)
    VALUES (NEW.tenant_id, NEW.super_admin_id, 'impersonation.revoked', 'SECURITY', 'impersonation_session', NEW.id, jsonb_build_object('revoked_at', NEW.revoked_at));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER audit_impersonation_trigger
AFTER INSERT OR UPDATE ON public.platform_impersonation_sessions
FOR EACH ROW EXECUTE FUNCTION public.trigger_audit_impersonation();


-- ── 4. SÉCURITÉ RLS PLATEFORME ──────────────────────────────
ALTER TABLE public.saas_metrics_current ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_financial_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_impersonation_sessions ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.saas_metrics_current TO anon, authenticated, service_role;
GRANT ALL ON public.saas_financial_events TO anon, authenticated, service_role;
GRANT ALL ON public.platform_impersonation_sessions TO anon, authenticated, service_role;

CREATE POLICY "platform_read_only" ON public.saas_metrics_current 
  FOR SELECT USING (public.saas_has_platform_role('PLATFORM_OWNER') OR public.saas_has_platform_role('PLATFORM_FINANCE'));

CREATE POLICY "platform_read_events" ON public.saas_financial_events 
  FOR SELECT USING (public.saas_has_platform_role('PLATFORM_OWNER') OR public.saas_has_platform_role('PLATFORM_FINANCE'));

CREATE POLICY "platform_read_impersonation" ON public.platform_impersonation_sessions 
  FOR SELECT USING (public.saas_has_platform_role('PLATFORM_OWNER') OR public.saas_has_platform_role('PLATFORM_SUPPORT'));


-- ── 5. VUES MATÉRIALISÉES D'AGRÉGATION (Lecture Seule) ──────

DROP MATERIALIZED VIEW IF EXISTS public.platform_global_kpis_mv;
CREATE MATERIALIZED VIEW public.platform_global_kpis_mv AS
SELECT 
  1 AS id,
  (SELECT count(*) FROM public.saas_tenants WHERE is_active = true) as total_active_tenants,
  (SELECT count(*) FROM public.yziow_networks) as total_networks,
  (SELECT count(*) FROM public.saas_profiles) as total_users,
  (SELECT count(*) FROM public.yziow_students) as total_students,
  (SELECT count(*) FROM public.yziow_user_roles ur JOIN public.yziow_roles r ON ur.role_id = r.id WHERE r.code = 'enseignant') as total_teachers;
CREATE UNIQUE INDEX idx_platform_global_kpis ON public.platform_global_kpis_mv (id);

DROP MATERIALIZED VIEW IF EXISTS public.platform_financial_kpis_mv;
CREATE MATERIALIZED VIEW public.platform_financial_kpis_mv AS
SELECT 
  1 AS id,
  COALESCE(SUM(current_mrr), 0) as total_mrr,
  COALESCE(SUM(current_arr), 0) as total_arr,
  COALESCE(SUM(active_subscriptions), 0) as total_active_subscriptions
FROM public.saas_metrics_current;
CREATE UNIQUE INDEX idx_platform_financial_kpis ON public.platform_financial_kpis_mv (id);

DROP MATERIALIZED VIEW IF EXISTS public.platform_usage_kpis_mv;
CREATE MATERIALIZED VIEW public.platform_usage_kpis_mv AS
SELECT 
  1 AS id,
  (SELECT count(*) FROM public.saas_audit_logs WHERE created_at > NOW() - INTERVAL '24 hours') as actions_last_24h,
  (SELECT count(*) FROM public.platform_impersonation_sessions WHERE status = 'ACTIVE' AND expires_at > NOW()) as active_impersonations;
CREATE UNIQUE INDEX idx_platform_usage_kpis ON public.platform_usage_kpis_mv (id);

GRANT SELECT ON public.platform_global_kpis_mv TO anon, authenticated, service_role;
GRANT SELECT ON public.platform_financial_kpis_mv TO anon, authenticated, service_role;
GRANT SELECT ON public.platform_usage_kpis_mv TO anon, authenticated, service_role;
