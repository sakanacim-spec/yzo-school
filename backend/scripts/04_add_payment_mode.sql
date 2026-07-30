-- Ajout des colonnes pour gérer le verrouillage du mode de paiement (SaaS)

-- 1. Mode d'abonnement choisi ('annual' ou 'tranche')
ALTER TABLE public.schools 
ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(20) DEFAULT NULL;

-- 2. Nombre de tranches payées
ALTER TABLE public.schools 
ADD COLUMN IF NOT EXISTS paid_tranches_count INTEGER DEFAULT 0;
