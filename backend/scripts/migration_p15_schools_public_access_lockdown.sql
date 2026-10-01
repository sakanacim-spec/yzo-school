-- Security hardening: public.schools
-- Applied successfully to YZIOW Staging on 2026-10-01.
-- Requires explicit Production authorization before any Production execution.

BEGIN;

DO $$
BEGIN
    -- 1. Preflight checks
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'schools'
    ) THEN
        RAISE EXCEPTION 'Table public.schools does not exist.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'schools' AND c.relrowsecurity = true
    ) THEN
        RAISE EXCEPTION 'RLS is not enabled on public.schools.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'schools' AND policyname = 'schools_read_all'
    ) THEN
        RAISE EXCEPTION 'Policy schools_read_all does not exist.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.role_table_grants 
        WHERE table_schema = 'public' AND table_name = 'schools' AND grantee = 'service_role' AND privilege_type = 'SELECT'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.role_table_grants 
        WHERE table_schema = 'public' AND table_name = 'schools' AND grantee = 'service_role' AND privilege_type = 'INSERT'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.role_table_grants 
        WHERE table_schema = 'public' AND table_name = 'schools' AND grantee = 'service_role' AND privilege_type = 'UPDATE'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.role_table_grants 
        WHERE table_schema = 'public' AND table_name = 'schools' AND grantee = 'service_role' AND privilege_type = 'DELETE'
    ) THEN
        RAISE EXCEPTION 'service_role is missing required privileges on public.schools.';
    END IF;
END $$;

-- 2. Remove direct privileges
REVOKE ALL PRIVILEGES ON TABLE public.schools FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.schools FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.schools FROM authenticated;

-- 3. Remove insecure policy
DROP POLICY IF EXISTS "schools_read_all" ON public.schools;

DO $$
BEGIN
    -- 4. Postflight checks
    IF EXISTS (
        SELECT 1 FROM information_schema.role_table_grants 
        WHERE table_schema = 'public' AND table_name = 'schools' AND grantee = 'anon' AND privilege_type = 'SELECT'
    ) THEN
        RAISE EXCEPTION 'anon still has SELECT privilege on public.schools.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.role_table_grants 
        WHERE table_schema = 'public' AND table_name = 'schools' AND grantee = 'authenticated' AND privilege_type = 'SELECT'
    ) THEN
        RAISE EXCEPTION 'authenticated still has SELECT privilege on public.schools.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'schools' AND policyname = 'schools_read_all'
    ) THEN
        RAISE EXCEPTION 'Policy schools_read_all still exists.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'schools' AND c.relrowsecurity = true
    ) THEN
        RAISE EXCEPTION 'RLS is no longer enabled on public.schools.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.role_table_grants 
        WHERE table_schema = 'public' AND table_name = 'schools' AND grantee = 'service_role' AND privilege_type = 'SELECT'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.role_table_grants 
        WHERE table_schema = 'public' AND table_name = 'schools' AND grantee = 'service_role' AND privilege_type = 'INSERT'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.role_table_grants 
        WHERE table_schema = 'public' AND table_name = 'schools' AND grantee = 'service_role' AND privilege_type = 'UPDATE'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.role_table_grants 
        WHERE table_schema = 'public' AND table_name = 'schools' AND grantee = 'service_role' AND privilege_type = 'DELETE'
    ) THEN
        RAISE EXCEPTION 'service_role is missing required privileges on public.schools after lockdown.';
    END IF;
END $$;

COMMIT;
