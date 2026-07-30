-- ============================================================
-- MIGRATION SUPABASE — Ajout compte de retrait Yziow Pay
-- ============================================================

ALTER TABLE schools 
ADD COLUMN IF NOT EXISTS payout_momo_number VARCHAR(50);

-- Vérification
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'schools' 
  AND column_name = 'payout_momo_number';
