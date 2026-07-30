-- ============================================================
-- MIGRATION SUPABASE — Ajout du statut pour les ambassadeurs
-- ============================================================

ALTER TABLE affiliates 
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';
