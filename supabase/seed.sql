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

-- ── Plans d'abonnement (Billing) ──────────────────────────────
INSERT INTO public.saas_billing_plans (id, name, description, price_amount, currency, modules, quotas, stripe_price_id)
VALUES 
  ('10000000-0000-0000-0000-000000000001', 'Free', 'Plan gratuit pour tester', 0, 'EUR', 
   '{"auth", "organizations", "users"}', 
   '{"max_users": 5}', 
   NULL),
  ('10000000-0000-0000-0000-000000000002', 'Pro', 'Plan standard pour PME', 2900, 'EUR', 
   '{"auth", "organizations", "users", "roles", "files", "knowledge_base"}', 
   '{"max_users": 50, "max_ai_tokens": 10000}', 
   'price_1ProPlanId'),
  ('10000000-0000-0000-0000-000000000003', 'Enterprise', 'Illimité avec IA avancée', 9900, 'EUR', 
   '{"auth", "organizations", "users", "roles", "files", "knowledge_base", "ai_concierge", "api_keys", "audit_logs"}', 
   '{"max_users": 10000, "max_ai_tokens": 1000000}', 
   'price_1EnterprisePlanId')
ON CONFLICT (id) DO NOTHING;

-- ── Abonnement actif pour Yziow (Enterprise) ─────────────────
INSERT INTO public.saas_subscriptions (id, tenant_id, plan_id, status, gateway, gateway_subscription_id)
VALUES (
  '20000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000003',
  'active',
  'stripe',
  'sub_1StripeMockId'
) ON CONFLICT (tenant_id) DO NOTHING;
