-- ============================================================
-- MIGRATION SUPABASE — Ajout colonnes internationales à la table schools
-- À exécuter dans : Supabase → SQL Editor → New Query
-- ============================================================

ALTER TABLE schools 
  ADD COLUMN IF NOT EXISTS country        TEXT,
  ADD COLUMN IF NOT EXISTS city           TEXT,
  ADD COLUMN IF NOT EXISTS address        TEXT,
  ADD COLUMN IF NOT EXISTS phone          TEXT,
  ADD COLUMN IF NOT EXISTS email          TEXT,
  ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'fr';

-- Vérification (optionnel)
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'schools'
ORDER BY ordinal_position;
