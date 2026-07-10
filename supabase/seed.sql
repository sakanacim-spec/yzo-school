-- ============================================================
-- Seed : Données initiales de développement
-- Tables préfixées saas_ (isolation MVP dans projet Yziow)
-- ============================================================

-- ── Tenant Yziow (client pilote) ──────────────────────────────
INSERT INTO public.saas_tenants (id, slug, name, plan, settings)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'yziow',
  'Yziow',
  'pro',
  '{
    "modules": ["auth", "organizations", "users", "roles", "notifications", "files"],
    "branding": { "primaryColor": "#4F46E5", "logo": null },
    "quotas": { "maxOrganizations": 100, "maxUsersPerOrg": 500, "maxStorageGb": 50 }
  }'
) ON CONFLICT (slug) DO NOTHING;

-- ── Rôles système Yziow ───────────────────────────────────────
INSERT INTO public.saas_roles (tenant_id, name, level, permissions, is_system)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'TENANT_ADMIN', 80, '"[\"*\"]"', TRUE),
  ('00000000-0000-0000-0000-000000000001', 'ORG_ADMIN', 60,
    '"[\"organization:read\",\"organization:update\",\"user:*\",\"file:*\",\"notification:*\"]"', TRUE),
  ('00000000-0000-0000-0000-000000000001', 'ORG_STAFF', 40,
    '"[\"organization:read\",\"user:read\",\"file:read\",\"file:create\",\"notification:read\"]"', TRUE),
  ('00000000-0000-0000-0000-000000000001', 'USER', 20,
    '"[\"organization:read\",\"file:read\",\"notification:read\",\"notification:update\"]"', TRUE)
ON CONFLICT (tenant_id, name) DO NOTHING;

-- ── Organisations exemples (Écoles Yziow) ────────────────────
INSERT INTO public.saas_organizations (tenant_id, name, code, metadata)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'École Al-Manar',       'ALM-001',
    '{"type":"primaire","city":"Casablanca","capacity":300}'),
  ('00000000-0000-0000-0000-000000000001', 'Institut Ibn Khaldoun','IBK-002',
    '{"type":"college","city":"Rabat","capacity":500}'),
  ('00000000-0000-0000-0000-000000000001', 'Lycée Averroès',        'LAV-003',
    '{"type":"lycee","city":"Marrakech","capacity":800}')
ON CONFLICT (tenant_id, code) DO NOTHING;
