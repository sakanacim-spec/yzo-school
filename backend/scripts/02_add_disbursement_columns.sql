-- ============================================================
-- MIGRATION SUPABASE — Ajout suivi des reversements (Disbursements)
-- À exécuter dans : Supabase → SQL Editor → New Query
-- ============================================================

-- Ajoute les colonnes pour la gestion de l'argent collecté par la plateforme
ALTER TABLE schools 
  ADD COLUMN IF NOT EXISTS platform_collected_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_disbursed_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_commission_rate NUMERIC DEFAULT 5.0;

-- Vérification
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'schools' 
  AND column_name IN ('platform_collected_amount', 'platform_disbursed_amount', 'platform_commission_rate');
