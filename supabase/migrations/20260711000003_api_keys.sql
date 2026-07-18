-- Migration pour les API Keys (M2M)

CREATE TABLE public.saas_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'production' CHECK (environment IN ('production', 'sandbox')),
  scopes JSONB DEFAULT '[]'::jsonb,
  is_revoked BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour la recherche de hash
CREATE INDEX idx_saas_api_keys_hash ON public.saas_api_keys(key_hash);
-- Index pour lister les clés d'un tenant
CREATE INDEX idx_saas_api_keys_tenant ON public.saas_api_keys(tenant_id);

-- Trigger pour updated_at
CREATE TRIGGER update_saas_api_keys_updated_at
BEFORE UPDATE ON public.saas_api_keys
FOR EACH ROW EXECUTE FUNCTION public.saas_handle_updated_at();

-- Row Level Security (RLS)
ALTER TABLE public.saas_api_keys ENABLE ROW LEVEL SECURITY;

-- Seuls les Super Admins (tenant Yziow par exemple, si on maintient l'isolation SaaS pure)
-- Mais pour l'instant, on laisse le backend gérer l'accès via Service Key pour l'auth,
-- et on ajoute une policy pour le dashboard tenant admin
CREATE POLICY "Tenants can manage their own API keys"
  ON public.saas_api_keys
  FOR ALL
  USING (
    tenant_id = (SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id', '')::uuid)
  );

-- Service Role a tous les droits
CREATE POLICY "Service Role can manage all API keys"
  ON public.saas_api_keys
  FOR ALL
  USING (
    current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role'
  );
