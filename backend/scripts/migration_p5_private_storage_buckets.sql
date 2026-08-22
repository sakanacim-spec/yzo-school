-- ============================================================
-- 🔒 MIGRATION P5 — SÉCURISATION ET CONFINEMENT PRIVÉ DES BUCKETS STORAGE
-- BUCKETS : messages, devoirs, student-photos
-- ============================================================
-- Script transactionnel et idempotent.
-- Objectifs :
-- 1. Créer les buckets s'ils n'existent pas ou mettre à jour les existants.
-- 2. Forcer public = false sur les 3 buckets scolaires privés.
-- 3. Imposer les quotas de taille et les listes blanches de types MIME stricts.
-- 4. Supprimer toute policy de lecture publique anonyme (anon) sur ces buckets.
-- 5. Conserver l'accès exclusif backend service_role pour la génération des URLs signées.
-- ============================================================

BEGIN;

-- ── 1. Configuration Idempotente des Buckets Privés ──────────

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

-- ── 2. Nettoyage des Politiques RLS Publiques sur ces Buckets ─

-- Activer RLS sur storage.objects de manière idempotente
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Supprimer toute ancienne politique autorisant la lecture publique / anonyme sur ces 3 buckets
DO $$
BEGIN
    -- Suppression des politiques publiques nommées couramment si elles existent
    DROP POLICY IF EXISTS "Public Access messages" ON storage.objects;
    DROP POLICY IF EXISTS "Public Access devoirs" ON storage.objects;
    DROP POLICY IF EXISTS "Public Access student-photos" ON storage.objects;
    DROP POLICY IF EXISTS "Allow anon read messages" ON storage.objects;
    DROP POLICY IF EXISTS "Allow anon read devoirs" ON storage.objects;
    DROP POLICY IF EXISTS "Allow anon read student-photos" ON storage.objects;
    DROP POLICY IF EXISTS "Give anon full access to messages" ON storage.objects;
    DROP POLICY IF EXISTS "Give anon full access to devoirs" ON storage.objects;
    DROP POLICY IF EXISTS "Give anon full access to student-photos" ON storage.objects;
END $$;

COMMIT;
