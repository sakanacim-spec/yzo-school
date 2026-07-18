-- ============================================================
-- Migration 010 : Yziow Networks (Groupes Scolaires)
-- Logique Métier pure : Regroupement de locataires (tenants)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.yziow_networks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_user_id UUID NOT NULL REFERENCES public.saas_profiles(id), 
    name VARCHAR(255) NOT NULL,
    country VARCHAR(100),
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.yziow_schools (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    network_id UUID NOT NULL REFERENCES public.yziow_networks(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    UNIQUE(tenant_id) 
);

ALTER TABLE public.yziow_networks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yziow_schools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "networks_owner_access" ON public.yziow_networks 
  FOR ALL 
  USING (owner_user_id = auth.uid() OR public.saas_is_platform_admin())
  WITH CHECK (owner_user_id = auth.uid() OR public.saas_is_platform_admin());

CREATE POLICY "schools_network_access" ON public.yziow_schools 
  FOR ALL 
  USING (
    tenant_id = public.saas_auth_tenant_id() OR 
    network_id IN (SELECT id FROM public.yziow_networks WHERE owner_user_id = auth.uid()) OR
    public.saas_is_platform_admin()
  )
  WITH CHECK (
    tenant_id = public.saas_auth_tenant_id() OR 
    network_id IN (SELECT id FROM public.yziow_networks WHERE owner_user_id = auth.uid()) OR
    public.saas_is_platform_admin()
  );

CREATE INDEX idx_yziow_schools_network ON public.yziow_schools(network_id);
