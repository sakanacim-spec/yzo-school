-- ============================================================
-- MIGRATION SUPABASE — Ajout type de reversement Yziow Pay
-- ============================================================

ALTER TABLE schools 
ADD COLUMN IF NOT EXISTS payout_method VARCHAR(20) DEFAULT 'momo';

-- Vérification
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'schools' 
  AND column_name = 'payout_method';
