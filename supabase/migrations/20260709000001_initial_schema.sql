-- ============================================================
-- Migration 001 : Schéma initial SaaS Modulaire
-- Tables préfixées `saas_` pour isolation dans le projet Supabase
-- de Yziow (MVP). Permettra la migration vers un projet dédié
-- sans réécriture : seul SUPABASE_URL changera dans les env vars.
-- ============================================================

-- ── Extensions ────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── SAAS_TENANTS (Clients du SaaS) ────────────────────────────
CREATE TABLE IF NOT EXISTS public.saas_tenants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT UNIQUE NOT NULL CHECK (slug ~ '^[a-z0-9-]+$'),
  name        TEXT NOT NULL,
  plan        TEXT NOT NULL DEFAULT 'free'
                CHECK (plan IN ('free', 'starter', 'pro', 'enterprise')),
  settings    JSONB NOT NULL DEFAULT '{}',
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.saas_tenants IS
  '[SaaS Platform] Clients du SaaS (ex: Yziow). '
  'Préfixe saas_ = séparable vers un projet Supabase dédié sans réécriture.';

-- ── SAAS_ORGANIZATIONS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.saas_organizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  code        TEXT,
  address     TEXT,
  metadata    JSONB NOT NULL DEFAULT '{}',
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);

COMMENT ON TABLE public.saas_organizations IS
  '[SaaS Platform] Organisations par tenant (ex: écoles pour Yziow). '
  'metadata JSONB = extensible sans migration pour données custom.';

-- ── SAAS_PROFILES (Extension Supabase Auth) ───────────────────
CREATE TABLE IF NOT EXISTS public.saas_profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id   UUID REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
  org_id      UUID REFERENCES public.saas_organizations(id) ON DELETE SET NULL,
  first_name  TEXT,
  last_name   TEXT,
  avatar_url  TEXT,
  phone       TEXT,
  locale      TEXT DEFAULT 'fr',
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.saas_profiles IS
  '[SaaS Platform] Profils enrichis (étend auth.users de Supabase).';

-- ── SAAS_ROLES ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.saas_roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  level       INT NOT NULL DEFAULT 20,
  permissions JSONB NOT NULL DEFAULT '[]',
  is_system   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, name)
);

COMMENT ON TABLE public.saas_roles IS
  '[SaaS Platform] Rôles RBAC custom par tenant.';

-- ── SAAS_USER_ROLES ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.saas_user_roles (
  user_id     UUID NOT NULL REFERENCES public.saas_profiles(id) ON DELETE CASCADE,
  role_id     UUID NOT NULL REFERENCES public.saas_roles(id) ON DELETE CASCADE,
  org_id      UUID REFERENCES public.saas_organizations(id) ON DELETE CASCADE,
  granted_by  UUID REFERENCES public.saas_profiles(id),
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, role_id)
);

-- Un utilisateur ne peut avoir le même rôle qu'une fois par org (NULL inclus)
CREATE UNIQUE INDEX IF NOT EXISTS idx_saas_user_roles_unique
  ON public.saas_user_roles (user_id, role_id, COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::UUID));

-- ── SAAS_NOTIFICATIONS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.saas_notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.saas_profiles(id) ON DELETE CASCADE,
  type        TEXT NOT NULL DEFAULT 'in_app'
                CHECK (type IN ('email', 'in_app', 'sms', 'push')),
  title       TEXT NOT NULL,
  body        TEXT,
  read        BOOLEAN NOT NULL DEFAULT FALSE,
  metadata    JSONB NOT NULL DEFAULT '{}',
  sent_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── SAAS_FILES ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.saas_files (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
  org_id        UUID REFERENCES public.saas_organizations(id) ON DELETE SET NULL,
  uploaded_by   UUID REFERENCES public.saas_profiles(id) ON DELETE SET NULL,
  storage_path  TEXT NOT NULL UNIQUE,
  filename      TEXT NOT NULL,
  mime_type     TEXT,
  size_bytes    BIGINT DEFAULT 0,
  metadata      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── INDEX pour performance ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_saas_orgs_tenant    ON public.saas_organizations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_saas_orgs_active    ON public.saas_organizations(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_saas_profiles_tenant ON public.saas_profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_saas_profiles_org   ON public.saas_profiles(org_id);
CREATE INDEX IF NOT EXISTS idx_saas_user_roles     ON public.saas_user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_saas_notifs_user    ON public.saas_notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_saas_notifs_tenant  ON public.saas_notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_saas_files_tenant   ON public.saas_files(tenant_id);
CREATE INDEX IF NOT EXISTS idx_saas_files_org      ON public.saas_files(org_id);

-- ── TRIGGER : updated_at automatique ──────────────────────────
CREATE OR REPLACE FUNCTION public.saas_handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER saas_tenants_updated_at
  BEFORE UPDATE ON public.saas_tenants
  FOR EACH ROW EXECUTE FUNCTION public.saas_handle_updated_at();

CREATE TRIGGER saas_organizations_updated_at
  BEFORE UPDATE ON public.saas_organizations
  FOR EACH ROW EXECUTE FUNCTION public.saas_handle_updated_at();

CREATE TRIGGER saas_profiles_updated_at
  BEFORE UPDATE ON public.saas_profiles
  FOR EACH ROW EXECUTE FUNCTION public.saas_handle_updated_at();

-- ── TRIGGER : Profil auto-créé à l'inscription ───────────────
CREATE OR REPLACE FUNCTION public.saas_handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.saas_profiles (id, tenant_id, first_name, last_name)
  VALUES (
    NEW.id,
    (NEW.raw_app_meta_data->>'tenant_id')::UUID,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- N'appliquer ce trigger que si aucun trigger similaire n'existe déjà
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'saas_on_auth_user_created'
  ) THEN
    CREATE TRIGGER saas_on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.saas_handle_new_user();
  END IF;
END;
$$;
