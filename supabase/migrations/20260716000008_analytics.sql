-- Migration : 20260716000008_analytics.sql
-- Module : Analytics (Vues Matérialisées)

-- 0. Ajout du suivi des tokens dans les sessions IA
ALTER TABLE public.saas_ai_sessions ADD COLUMN IF NOT EXISTS total_tokens INTEGER DEFAULT 0;

-- 1. Vue matérialisée : Agrégation quotidienne par locataire
-- Combine les données des Audit Logs, Sessions IA, et API Keys
CREATE MATERIALIZED VIEW public.saas_analytics_daily_tenant AS
WITH 
  -- Agrégation des Audit Logs
  daily_audit AS (
    SELECT 
      tenant_id,
      DATE_TRUNC('day', created_at) AS date,
      COUNT(DISTINCT actor_id) AS active_users_count,
      COUNT(CASE WHEN severity = 'ERROR' OR severity = 'SECURITY' THEN 1 END) AS api_errors_count
    FROM public.saas_audit_logs
    GROUP BY tenant_id, DATE_TRUNC('day', created_at)
  ),
  -- Agrégation des Sessions IA
  daily_ai AS (
    SELECT 
      tenant_id,
      DATE_TRUNC('day', created_at) AS date,
      COUNT(*) AS ai_requests_count,
      SUM(total_tokens) AS ai_tokens_used
    FROM public.saas_ai_sessions
    GROUP BY tenant_id, DATE_TRUNC('day', created_at)
  )
SELECT 
  COALESCE(a.tenant_id, ai.tenant_id) AS tenant_id,
  COALESCE(a.date, ai.date) AS date,
  COALESCE(a.active_users_count, 0) AS active_users_count,
  COALESCE(a.api_errors_count, 0) AS api_errors_count,
  COALESCE(ai.ai_requests_count, 0) AS ai_requests_count,
  COALESCE(ai.ai_tokens_used, 0) AS ai_tokens_used
FROM daily_audit a
FULL OUTER JOIN daily_ai ai 
  ON a.tenant_id = ai.tenant_id AND a.date = ai.date;

-- 2. Index Unique obligatoire pour permettre le REFRESH CONCURRENTLY
-- L'unicité est garantie par la combinaison tenant_id + date
CREATE UNIQUE INDEX idx_analytics_daily_tenant_unique ON public.saas_analytics_daily_tenant (tenant_id, date);

-- 3. Sécurité (RLS sur Vue Matérialisée)
-- PostgreSQL ne supporte pas le RLS direct sur les Materialized Views.
-- Cependant, puisque l'API Analytics (Backend) est la seule à interroger cette vue
-- à l'aide de la Service Role Key, et qu'elle filtre par `tenant_id` au niveau SQL 
-- depuis le JWT vérifié par NestJS, l'isolation est garantie côté applicatif.
-- 
-- Pour bloquer l'accès direct via l'API REST de Supabase (PostgREST) aux utilisateurs authentifiés :
REVOKE ALL ON public.saas_analytics_daily_tenant FROM authenticated;
REVOKE ALL ON public.saas_analytics_daily_tenant FROM anon;
GRANT SELECT ON public.saas_analytics_daily_tenant TO service_role;

-- 4. Fonction RPC pour permettre au Backend (Service Role) de rafraîchir la vue
CREATE OR REPLACE FUNCTION public.refresh_analytics_daily_tenant_view()
RETURNS void AS $$
BEGIN
  -- Le refresh CONCURRENTLY nécessite l'index unique
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.saas_analytics_daily_tenant;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- S'assurer que seule la Service Role peut l'appeler via l'API REST
REVOKE EXECUTE ON FUNCTION public.refresh_analytics_daily_tenant_view() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_analytics_daily_tenant_view() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_analytics_daily_tenant_view() FROM anon;
GRANT EXECUTE ON FUNCTION public.refresh_analytics_daily_tenant_view() TO service_role;
