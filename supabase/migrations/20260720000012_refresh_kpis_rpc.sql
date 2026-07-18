-- Migration to add refresh_platform_kpis_mv function
-- Target: local database
-- Path: supabase/migrations/20260720000012_refresh_kpis_rpc.sql

-- 1. Verify and ensure unique indexes exist on the materialized views
-- (These unique indexes are required for REFRESH MATERIALIZED VIEW CONCURRENTLY)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c 
    JOIN pg_namespace n ON n.oid = c.relnamespace 
    WHERE c.relname = 'idx_platform_global_kpis' AND n.nspname = 'public'
  ) THEN
    CREATE UNIQUE INDEX idx_platform_global_kpis ON public.platform_global_kpis_mv (id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c 
    JOIN pg_namespace n ON n.oid = c.relnamespace 
    WHERE c.relname = 'idx_platform_financial_kpis' AND n.nspname = 'public'
  ) THEN
    CREATE UNIQUE INDEX idx_platform_financial_kpis ON public.platform_financial_kpis_mv (id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c 
    JOIN pg_namespace n ON n.oid = c.relnamespace 
    WHERE c.relname = 'idx_platform_usage_kpis' AND n.nspname = 'public'
  ) THEN
    CREATE UNIQUE INDEX idx_platform_usage_kpis ON public.platform_usage_kpis_mv (id);
  END IF;
END $$;

-- 2. Create the refresh function
CREATE OR REPLACE FUNCTION public.refresh_platform_kpis_mv()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with creator privileges (bypass RLS/grants on underlying tables)
SET search_path = public
AS $$
BEGIN
  -- Refresh platform_global_kpis_mv concurrently
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.platform_global_kpis_mv;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to refresh platform_global_kpis_mv concurrently: %', SQLERRM;
    -- Fallback to standard refresh if concurrent fails
    REFRESH MATERIALIZED VIEW public.platform_global_kpis_mv;
  END;

  -- Refresh platform_financial_kpis_mv concurrently
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.platform_financial_kpis_mv;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to refresh platform_financial_kpis_mv concurrently: %', SQLERRM;
    REFRESH MATERIALIZED VIEW public.platform_financial_kpis_mv;
  END;

  -- Refresh platform_usage_kpis_mv concurrently
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.platform_usage_kpis_mv;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to refresh platform_usage_kpis_mv concurrently: %', SQLERRM;
    REFRESH MATERIALIZED VIEW public.platform_usage_kpis_mv;
  END;
END;
$$;

-- 3. Restrict execute permissions to service_role only
REVOKE ALL ON FUNCTION public.refresh_platform_kpis_mv() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_platform_kpis_mv() TO service_role;
