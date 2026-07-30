-- ============================================================
-- MIGRATION SUPABASE — Ajout suivi des revenus d'abonnement
-- À exécuter dans : Supabase → SQL Editor → New Query
-- ============================================================

-- Ajoute la colonne total_revenue_paid (si elle n'existe pas déjà)
ALTER TABLE schools 
  ADD COLUMN IF NOT EXISTS total_revenue_paid NUMERIC DEFAULT 0;

-- Vérification
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'schools' AND column_name = 'total_revenue_paid';
