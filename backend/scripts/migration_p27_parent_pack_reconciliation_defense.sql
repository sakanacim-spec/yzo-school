-- ==============================================================================
-- Migration P27 : Défense transactionnelle anti-double paiement Parent Pack
-- ==============================================================================
-- Objectif :
--   1. Empêcher l'autorisation d'une nouvelle tentative de checkout Parent Pack
--      lorsqu'une intention précédente pour le même abonnement est encore en
--      'reconciliation_required', 'initializing' ou 'pending'.
--   2. Verrouiller atomiquement la souscription et vérifier les intentions
--      concurrentes directement au niveau de PostgreSQL (Fail-Closed).
--   3. Installer de manière non-destructive l'index partiel unique couvrant
--      'reconciliation_required', avec détection préalable et signalement clair
--      en cas de doublons historiques non résolus.
--
-- RÈGLE ABSOLUE :
--   - Non destructif : aucun DROP TABLE, aucun DELETE, aucune modification
--     des lignes historiques de payment_intents, parent_subscriptions ou ledgers.
-- ==============================================================================

BEGIN;

-- 1. Mise à jour de la fonction RPC de préparation du checkout
CREATE OR REPLACE FUNCTION public.prepare_parent_pack_checkout(
    p_parent_ref TEXT,
    p_student_global_id UUID,
    p_school_slug TEXT,
    p_student_local_id TEXT,
    p_pricing_id UUID,
    p_cycle_name TEXT,
    p_duration_months INTEGER
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
    v_pricing RECORD;
    v_subscription_id UUID;
    v_intent_id UUID;
    v_amount_minor BIGINT;
    v_existing_intent RECORD;
BEGIN
    -- Validation du tarif
    SELECT * INTO v_pricing
      FROM public.parent_pack_pricing
     WHERE id = p_pricing_id
       AND active = true
       AND cycle_name = p_cycle_name;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'FAIL CLOSED: Pricing invalide, inactif ou cycle non correspondant.';
    END IF;

    IF p_duration_months = 1 THEN
        v_amount_minor := v_pricing.monthly_price_minor;
    ELSIF p_duration_months = v_pricing.annual_duration_months THEN
        v_amount_minor := v_pricing.annual_price_minor;
    ELSE
        RAISE EXCEPTION 'FAIL CLOSED: Invalid duration_months %', p_duration_months;
    END IF;

    -- A. Sérialisation et vérification préalable si la souscription existe déjà
    SELECT id INTO v_subscription_id
      FROM public.parent_subscriptions
     WHERE parent_ref = p_parent_ref
       AND student_global_id = p_student_global_id
       FOR UPDATE;

    IF v_subscription_id IS NOT NULL THEN
        SELECT id, status INTO v_existing_intent
          FROM public.payment_intents
         WHERE payment_type = 'parent_pack'
           AND target_id = v_subscription_id::text
           AND status IN ('initializing', 'pending', 'reconciliation_required')
         ORDER BY created_at DESC
         LIMIT 1
           FOR UPDATE;

        IF FOUND THEN
            IF v_existing_intent.status = 'reconciliation_required' THEN
                RAISE EXCEPTION 'FAIL CLOSED: RECONCILIATION_REQUIRED_PENDING (intent_id: %)', v_existing_intent.id;
            ELSE
                RAISE EXCEPTION 'FAIL CLOSED: ACTIVE_INTENT_ALREADY_EXISTS (intent_id: %)', v_existing_intent.id;
            END IF;
        END IF;
    END IF;

    -- B. Upsert sécurisé de la souscription
    INSERT INTO public.parent_subscriptions (
        parent_ref, student_global_id, school_slug, student_ref, pricing_id, status
    )
    VALUES (
        p_parent_ref, p_student_global_id, p_school_slug, p_student_local_id, p_pricing_id, 'inactive'
    )
    ON CONFLICT (parent_ref, student_global_id) DO UPDATE
    SET updated_at = clock_timestamp(),
        school_slug = EXCLUDED.school_slug,
        student_ref = EXCLUDED.student_ref,
        pricing_id = EXCLUDED.pricing_id
    RETURNING id INTO v_subscription_id;

    -- C. Verrouillage souscription et contre-vérification défensive post-upsert (anti-race condition)
    PERFORM 1
       FROM public.parent_subscriptions
      WHERE id = v_subscription_id
        FOR UPDATE;

    SELECT id, status INTO v_existing_intent
      FROM public.payment_intents
     WHERE payment_type = 'parent_pack'
       AND target_id = v_subscription_id::text
       AND status IN ('initializing', 'pending', 'reconciliation_required')
     ORDER BY created_at DESC
     LIMIT 1
       FOR UPDATE;

    IF FOUND THEN
        IF v_existing_intent.status = 'reconciliation_required' THEN
            RAISE EXCEPTION 'FAIL CLOSED: RECONCILIATION_REQUIRED_PENDING (intent_id: %)', v_existing_intent.id;
        ELSE
            RAISE EXCEPTION 'FAIL CLOSED: ACTIVE_INTENT_ALREADY_EXISTS (intent_id: %)', v_existing_intent.id;
        END IF;
    END IF;

    -- D. Création de l'intention en statut 'initializing'
    INSERT INTO public.payment_intents (
        target_id, expected_amount, expected_currency, status, payment_type, school_slug, plan_type, metadata, expires_at
    )
    VALUES (
        v_subscription_id::text,
        v_amount_minor,
        v_pricing.currency,
        'initializing',
        'parent_pack',
        p_school_slug,
        NULL,
        jsonb_build_object('pricing_id', p_pricing_id, 'duration_months', p_duration_months),
        now() + interval '1 hour'
    )
    RETURNING id INTO v_intent_id;

    RETURN jsonb_build_object('subscription_id', v_subscription_id, 'payment_intent_id', v_intent_id);
END;
$$;

-- Préservation stricte des privilèges d'exécution
REVOKE EXECUTE ON FUNCTION public.prepare_parent_pack_checkout(text, uuid, text, text, uuid, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prepare_parent_pack_checkout(text, uuid, text, text, uuid, text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.prepare_parent_pack_checkout(text, uuid, text, text, uuid, text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_parent_pack_checkout(text, uuid, text, text, uuid, text, integer) TO service_role;

-- 2. Audit et déploiement conditionnel de l'index unique étendu
DO $$
DECLARE
    v_dupes_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_dupes_count
      FROM (
          SELECT school_slug, target_id
            FROM public.payment_intents
           WHERE payment_type = 'parent_pack'
             AND status IN ('initializing', 'pending', 'reconciliation_required')
           GROUP BY school_slug, target_id
          HAVING COUNT(*) > 1
      ) d;

    IF v_dupes_count > 0 THEN
        RAISE WARNING 'MIGRATION P27 NOTICE: % groupe(s) de doublons detectes sur les intentions non resolues. L index unique uq_active_parent_pack_intent NE PEUT PAS etre etendu automatiquement sans revue administrative. La protection atomique reste pleinement assuree par la fonction RPC prepare_parent_pack_checkout.', v_dupes_count;
    ELSE
        DROP INDEX IF EXISTS public.uq_active_parent_pack_intent;
        CREATE UNIQUE INDEX uq_active_parent_pack_intent
            ON public.payment_intents (school_slug, target_id)
            WHERE payment_type = 'parent_pack'
              AND status IN ('initializing', 'pending', 'reconciliation_required');
        RAISE NOTICE 'Index unique partiel uq_active_parent_pack_intent etendu avec succes.';
    END IF;
END $$;

COMMIT;
