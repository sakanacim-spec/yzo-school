-- Migration: Retrait définitif des essais d'établissement YZIOW
-- Règle métier : Les établissements sont gratuits et illimités à vie.

BEGIN;

-- 1. Changer le statut par défaut des écoles
ALTER TABLE public.schools ALTER COLUMN status SET DEFAULT 'active';

-- 2. Basculer les écoles actuellement en essai vers actives
UPDATE public.schools SET status = 'active' WHERE status = 'trial';

-- 3. Retirer la colonne `trial_ends_at`
-- On vérifie que la colonne est bien supprimée. Elle n'est plus lue par les RPC ni par le code.
ALTER TABLE public.schools DROP COLUMN IF EXISTS trial_ends_at;

-- NOTE TECHNIQUE SUR LES COLONNES SAAS (`subscription_plan`, `paid_tranches_count`, `first_successful_payment_at`) :
-- Ces colonnes ne sont pas supprimées ici.
-- Raison (blocage) : Elles sont explicitement référencées dans le corps de fonctions RPC de webhooks
-- historiques (ex: process_fedapay_webhook_event_v2 défini dans p7 et p13).
-- La suppression casserait ces RPC si un vieil événement devait être retraité.
-- Une future passe de refactoring des vieux webhooks (ex: migration_p18) pourra les nettoyer.

COMMIT;
