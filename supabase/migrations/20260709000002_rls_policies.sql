-- ============================================================
-- Migration 002 : Row Level Security (RLS) — tables saas_*
-- ============================================================

ALTER TABLE public.saas_tenants        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_organizations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_roles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_user_roles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_notifications  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_files          ENABLE ROW LEVEL SECURITY;

-- ── Helpers JWT ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.saas_auth_tenant_id()
RETURNS UUID AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::UUID,
    NULL
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.saas_is_platform_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'SAAS_SUPER_ADMIN',
    FALSE
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ── POLICIES : saas_tenants ───────────────────────────────────
CREATE POLICY "saas_tenants_admin_all" ON public.saas_tenants
  FOR ALL USING (public.saas_is_platform_admin());

CREATE POLICY "saas_tenants_own_read" ON public.saas_tenants
  FOR SELECT USING (id = public.saas_auth_tenant_id());

-- ── POLICIES : saas_organizations ────────────────────────────
CREATE POLICY "saas_organizations_isolation" ON public.saas_organizations
  FOR ALL USING (
    tenant_id = public.saas_auth_tenant_id()
    OR public.saas_is_platform_admin()
  );

-- ── POLICIES : saas_profiles ─────────────────────────────────
CREATE POLICY "saas_profiles_read" ON public.saas_profiles
  FOR SELECT USING (
    id = auth.uid()
    OR tenant_id = public.saas_auth_tenant_id()
    OR public.saas_is_platform_admin()
  );

CREATE POLICY "saas_profiles_own_update" ON public.saas_profiles
  FOR UPDATE USING (id = auth.uid());

-- ── POLICIES : saas_roles ────────────────────────────────────
CREATE POLICY "saas_roles_isolation" ON public.saas_roles
  FOR ALL USING (
    tenant_id = public.saas_auth_tenant_id()
    OR public.saas_is_platform_admin()
  );

-- ── POLICIES : saas_user_roles ───────────────────────────────
CREATE POLICY "saas_user_roles_isolation" ON public.saas_user_roles
  FOR SELECT USING (
    user_id IN (
      SELECT id FROM public.saas_profiles
      WHERE tenant_id = public.saas_auth_tenant_id()
    )
    OR public.saas_is_platform_admin()
  );

-- ── POLICIES : saas_notifications ────────────────────────────
CREATE POLICY "saas_notifs_own_read" ON public.saas_notifications
  FOR SELECT USING (user_id = auth.uid() OR public.saas_is_platform_admin());

CREATE POLICY "saas_notifs_own_update" ON public.saas_notifications
  FOR UPDATE USING (user_id = auth.uid());

-- ── POLICIES : saas_files ────────────────────────────────────
CREATE POLICY "saas_files_isolation" ON public.saas_files
  FOR ALL USING (
    tenant_id = public.saas_auth_tenant_id()
    OR public.saas_is_platform_admin()
  );
