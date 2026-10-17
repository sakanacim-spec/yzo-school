-- ==============================================================================
-- PREFLIGHT AUDIT P27 : Audit en lecture seule des intentions et réconciliations
-- ==============================================================================
-- Objectif : Détecter et inventorier en mode STRICTEMENT LECTURE SEULE :
--   1. Les intentions Parent Pack en statut 'reconciliation_required'.
--   2. Les éventuels doublons historiques d'intentions sur (school_slug, target_id)
--      dans les statuts non résolus ('initializing', 'pending', 'reconciliation_required').
--   3. L'état d'enregistrement du provider_transaction_id sur ces intentions.
--
-- RÈGLE ABSOLUE : Aucune écriture (aucun INSERT, UPDATE, DELETE, ALTER ou DROP).
-- ==============================================================================

-- 1. Inventaire des intentions Parent Pack en statut 'reconciliation_required'
SELECT 
    pi.id AS intent_id,
    pi.school_slug,
    pi.target_id AS subscription_id,
    pi.status,
    pi.expected_amount,
    pi.expected_currency,
    pi.provider_transaction_id,
    pi.reconciliation_reason,
    pi.created_at,
    pi.updated_at,
    ps.parent_ref,
    ps.student_global_id,
    ps.status AS subscription_status
FROM public.payment_intents pi
LEFT JOIN public.parent_subscriptions ps ON ps.id::text = pi.target_id
WHERE pi.payment_type = 'parent_pack'
  AND pi.status = 'reconciliation_required'
ORDER BY pi.created_at DESC;

-- 2. Détection des doublons potentiels sur les statuts non résolus
-- Si ce SELECT renvoie des lignes, des doublons historiques existent et l'index unique
-- uq_active_parent_pack_intent étendu ne pourra pas être posé sans revue administrative préalable.
SELECT 
    pi.school_slug,
    pi.target_id AS subscription_id,
    COUNT(*) AS unresolved_intent_count,
    array_agg(pi.id ORDER BY pi.created_at DESC) AS intent_ids,
    array_agg(pi.status ORDER BY pi.created_at DESC) AS statuses,
    array_agg(COALESCE(pi.provider_transaction_id, 'NULL') ORDER BY pi.created_at DESC) AS provider_tx_ids,
    min(pi.created_at) AS first_attempt_at,
    max(pi.created_at) AS last_attempt_at
FROM public.payment_intents pi
WHERE pi.payment_type = 'parent_pack'
  AND pi.status IN ('initializing', 'pending', 'reconciliation_required')
GROUP BY pi.school_slug, pi.target_id
HAVING COUNT(*) > 1;

-- 3. Synthèse globale de volumétrie par statut pour le type parent_pack
SELECT 
    pi.status,
    COUNT(*) AS total_count,
    COUNT(pi.provider_transaction_id) AS with_provider_tx_id,
    COUNT(*) - COUNT(pi.provider_transaction_id) AS without_provider_tx_id,
    min(pi.created_at) AS earliest_intent,
    max(pi.created_at) AS latest_intent
FROM public.payment_intents pi
WHERE pi.payment_type = 'parent_pack'
GROUP BY pi.status
ORDER BY total_count DESC;
