-- Migration pour le module Audit Logs

-- 1. Enumération pour le niveau de sévérité
CREATE TYPE public.audit_severity AS ENUM ('INFO', 'WARNING', 'ERROR', 'SECURITY');

-- 2. Table des Audit Logs
CREATE TABLE public.saas_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.saas_profiles(id) ON DELETE SET NULL, -- Qui a fait l'action (User)
  api_key_id UUID REFERENCES public.saas_api_keys(id) ON DELETE SET NULL, -- Ou via quelle API Key (M2M)
  action VARCHAR(255) NOT NULL, -- ex: 'article.created', 'apikey.revoked', 'user.login'
  severity public.audit_severity NOT NULL DEFAULT 'INFO',
  correlation_id UUID, -- Optionnel, pour grouper plusieurs logs d'une même opération
  entity_type VARCHAR(255), -- ex: 'article', 'apikey'
  entity_id UUID, -- L'ID de l'objet modifié
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb, -- Diff (anciennes/nouvelles valeurs), IP, User-Agent, etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Note: Pas de trigger update_at car les logs d'audit sont immuables (Append-Only)

-- Index optimisés pour les requêtes de recherche et l'affichage paginé par le tenant
CREATE INDEX idx_audit_logs_tenant_action ON public.saas_audit_logs(tenant_id, action);
CREATE INDEX idx_audit_logs_created_at ON public.saas_audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_correlation ON public.saas_audit_logs(correlation_id);

-- RLS (Row Level Security)
ALTER TABLE public.saas_audit_logs ENABLE ROW LEVEL SECURITY;

-- 3. Politiques d'accès

-- Les locataires peuvent lire leurs propres logs (historique back-office)
CREATE POLICY "Tenants can read their own audit logs"
  ON public.saas_audit_logs
  FOR SELECT
  USING (
    tenant_id = (SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id', '')::uuid)
  );

-- Les logs sont "Append-Only", aucune modification ou suppression par qui que ce soit (sauf administrateurs DB directs / Service Role)
CREATE POLICY "Nobody can update audit logs"
  ON public.saas_audit_logs
  FOR UPDATE
  USING (false);

CREATE POLICY "Nobody can delete audit logs"
  ON public.saas_audit_logs
  FOR DELETE
  USING (false);

-- Les insertions de logs se font toujours depuis le backend (Admin Service Role ou M2M)
-- L'API backend utilise la clé de service (Service Role Key) pour s'affranchir de RLS lors de l'écriture (Fire-and-forget).
