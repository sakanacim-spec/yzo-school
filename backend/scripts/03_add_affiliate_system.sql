-- ============================================================
-- MIGRATION SUPABASE — Ajout Système de Parrainage (Affiliation)
-- À exécuter dans : Supabase → SQL Editor → New Query
-- ============================================================

-- 1. Création de la table des Ambassadeurs (Affiliés)
CREATE TABLE IF NOT EXISTS affiliates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nom VARCHAR(255) NOT NULL,
    telephone VARCHAR(20) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    referral_code VARCHAR(50) UNIQUE NOT NULL,
    commission_rate NUMERIC DEFAULT 20.0, -- 20% par défaut
    wallet_balance NUMERIC DEFAULT 0, -- Solde actuel disponible pour retrait
    total_earned NUMERIC DEFAULT 0, -- Total gagné depuis le début
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Ajout de la colonne affiliate_id dans la table schools
ALTER TABLE schools 
  ADD COLUMN IF NOT EXISTS affiliate_id UUID REFERENCES affiliates(id) ON DELETE SET NULL;

-- 3. Création de la table des transactions d'affiliation (Historique)
CREATE TABLE IF NOT EXISTS affiliate_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    affiliate_id UUID NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
    school_id UUID REFERENCES schools(id) ON DELETE SET NULL, -- Rempli si c'est une commission liée à une école
    type VARCHAR(50) NOT NULL, -- 'commission' (gain) ou 'payout' (retrait)
    amount NUMERIC NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Vérification
SELECT table_name 
FROM information_schema.tables 
WHERE table_name IN ('affiliates', 'affiliate_transactions');
