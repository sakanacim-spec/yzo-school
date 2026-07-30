-- ============================================================
-- MIGRATION SUPABASE — Ajout de l'email pour les ambassadeurs
-- ============================================================

ALTER TABLE affiliates 
  ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE;
