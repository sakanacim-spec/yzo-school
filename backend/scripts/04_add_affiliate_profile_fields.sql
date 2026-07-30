-- ============================================================
-- MIGRATION SUPABASE — Ajout Profil Ambassadeur (Pays & Photo)
-- À exécuter dans : Supabase → SQL Editor → New Query
-- ============================================================

ALTER TABLE affiliates 
  ADD COLUMN IF NOT EXISTS country VARCHAR(100),
  ADD COLUMN IF NOT EXISTS photo_url TEXT;
