-- ============================================================
-- 🔒 MIGRATION P5 — SÉCURISATION ET CONFINEMENT PRIVÉ DES BUCKETS STORAGE
-- BUCKETS : messages, devoirs, student-photos
-- Compatible Supabase SQL Editor (rôle standard postgres, sans privilèges sur storage.objects)
-- ============================================================
-- Script 100% transactionnel, idempotent et fail-closed.
-- Objectifs :
-- 1. Vérifier que storage.objects possède la RLS active et aucune policy non maîtrisée.
-- 2. Créer ou mettre à jour les 3 buckets privés dans storage.buckets avec public = false,
--    quotas stricts et listes blanches MIME.
-- 3. Vérifier post-migration la conformité absolue des 3 buckets et l'absence de policy.
-- ============================================================

BEGIN;

-- ── 1. Contrôles Préalables Fail-Closed (Catalogue pg_catalog) ──

DO $$
DECLARE
    policy_count integer;
BEGIN
    -- A. Vérification de l'activation de RLS sur storage.objects
    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n
          ON n.oid = c.relnamespace
        WHERE n.nspname = 'storage'
          AND c.relname = 'objects'
          AND c.relrowsecurity = true
    ) THEN
        RAISE EXCEPTION 'RLS_NOT_ENABLED_ON_STORAGE_OBJECTS';
    END IF;

    -- B. Vérification d'absence de toute policy résiduelle sur storage.objects
    SELECT count(*)
    INTO policy_count
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects';

    IF policy_count > 0 THEN
        RAISE EXCEPTION 'UNEXPECTED_STORAGE_POLICY_PRESENT';
    END IF;
END $$;

-- ── 2. Configuration Idempotente des Buckets Privés ──────────

-- Bucket : messages (Pièces jointes de messagerie école-famille)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'messages',
    'messages',
    false,
    5242880, -- 5 MB
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[];

-- Bucket : devoirs (Documents et devoirs scolaires)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'devoirs',
    'devoirs',
    false,
    10485760, -- 10 MB
    ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[];

-- Bucket : student-photos (Photos d'identité des élèves)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'student-photos',
    'student-photos',
    false,
    3145728, -- 3 MB
    ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 3145728,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[];

-- ── 3. Contrôle Post-Migration Fail-Closed ────────────────────

DO $$
DECLARE
    private_count integer;
    config_valid_count integer;
    policy_count_after integer;
BEGIN
    -- A. Vérifier que les 3 buckets sont bien configurés à public = false
    SELECT count(*)
    INTO private_count
    FROM storage.buckets
    WHERE id IN ('messages', 'devoirs', 'student-photos')
      AND public = false;

    IF private_count <> 3 THEN
        RAISE EXCEPTION 'PRIVATE_BUCKET_VERIFICATION_FAILED';
    END IF;

    -- B. Vérifier les tailles et les types MIME stricts
    SELECT count(*)
    INTO config_valid_count
    FROM storage.buckets
    WHERE (
        id = 'messages'
        AND file_size_limit = 5242880
        AND allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
    ) OR (
        id = 'devoirs'
        AND file_size_limit = 10485760
        AND allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[]
    ) OR (
        id = 'student-photos'
        AND file_size_limit = 3145728
        AND allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
    );

    IF config_valid_count <> 3 THEN
        RAISE EXCEPTION 'BUCKET_CONFIGURATION_VERIFICATION_FAILED';
    END IF;

    -- C. Vérifier qu'aucune policy n'a été ajoutée
    SELECT count(*)
    INTO policy_count_after
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects';

    IF policy_count_after > 0 THEN
        RAISE EXCEPTION 'UNEXPECTED_STORAGE_POLICY_PRESENT';
    END IF;
END $$;

COMMIT;
