-- backend/integration-tests/bootstrap_parent_pack_test_db.sql
-- ==============================================================================
-- BOOTSTRAP DE BASE DE DONNÉES DE TEST ISOLÉE POSTGRESQL 17
-- Ce script est STRICTEMENT RÉSERVÉ AUX TESTS et reproduit l'infrastructure
-- initiale de Supabase (rôles, plate-forme schools et ambassadeur test) absente
-- d'une image PostgreSQL vierge standard (postgres:17-alpine).
-- ==============================================================================

BEGIN;

-- 1. Rôles Supabase standards requis par les mécanismes RLS des migrations
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    END IF;
END $$;

-- 2. Table racine plate-forme : public.schools
CREATE TABLE IF NOT EXISTS public.schools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    affiliate_id UUID,
    first_successful_payment_at TIMESTAMPTZ,
    total_revenue NUMERIC DEFAULT 0,
    plan TEXT DEFAULT 'free',
    tranches_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Table des affiliés / ambassadeurs (Lot affiliation historique)
CREATE TABLE IF NOT EXISTS public.affiliates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nom VARCHAR(255) NOT NULL,
    telephone VARCHAR(20) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    referral_code VARCHAR(50) UNIQUE NOT NULL,
    commission_rate NUMERIC DEFAULT 20.0,
    wallet_balance NUMERIC DEFAULT 0,
    total_earned NUMERIC DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Ambassadeur et établissement requis pour les flux de test Parent Pack
INSERT INTO public.affiliates (id, nom, telephone, password_hash, referral_code, status)
VALUES ('11111111-1111-1111-1111-111111111111', 'Ambassadeur Test', '+22990000000', 'hash', 'REF_TEST', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.schools (slug, affiliate_id)
VALUES ('school', '11111111-1111-1111-1111-111111111111')
ON CONFLICT (slug) DO UPDATE SET affiliate_id = EXCLUDED.affiliate_id;

COMMIT;
