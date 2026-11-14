-- ==============================================================================
-- YZIOW — MIGRATION P29 : ALIGNEMENT COMMISSIONS BRUTES ET RESTRICTION PILOTE
-- ==============================================================================
-- Conformité avec la politique officielle : docs/pack-parent-pricing-international-policy-v1.md
--
-- RÈGLES APPLIQUÉES :
-- 1. Commission établissement : 20 % du montant brut payé.
-- 2. Commission ambassadeur : 10 % du montant brut payé (au lieu de 10 % du solde après frais et école).
-- 3. Sans ambassadeur : 0 %.
-- 4. YZIOW absorbe les frais FedaPay : Net YZIOW = Brut - Frais FedaPay - Part École - Part Ambassadeur.
-- 5. Invariant comptable préservé : fedapay_fee + school_share + ambassador_share + yziow_share = gross_amount.
-- 6. Aucune commission négative.
-- 7. Additif et non rétroactif : ne modifie aucune écriture existante des grands livres.
-- 8. Restriction réversible pilote : possibilité de bloquer les paiements annuels via global_settings
--    ('parent_pack_restrict_annual_pilot' = true) ou session parameter ('yziow.restrict_annual_pilot').
--    Par défaut, désactivé ('false') pour ne pas bloquer la production sans validation du propriétaire.
-- 9. Maintient l'intégralité des protections P28b (verrouillage intent, atomicité, RLS, permissions).
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. Table globale des paramètres (si non existante) et configuration pilote par défaut
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.global_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO public.global_settings (key, value, description)
VALUES ('parent_pack_restrict_annual_pilot', 'false'::jsonb, 'Restriction réversible du pilote Parent Pack aux paiements mensuels')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.global_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.global_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.global_settings TO authenticated;
GRANT ALL ON public.global_settings TO service_role;

-- ------------------------------------------------------------------------------
-- 2. RPC prepare_parent_pack_checkout (avec contrôle réversible pilote annuel)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prepare_parent_pack_checkout(
    p_parent_ref TEXT,
    p_student_global_id UUID,
    p_school_slug TEXT,
    p_student_local_id TEXT,
    p_pricing_id UUID,
    p_cycle_name TEXT,
    p_duration_months INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_pricing RECORD;
    v_sub RECORD;
    v_subscription_id UUID;
    v_intent_id UUID;
    v_amount_minor BIGINT;
    v_max_end_date DATE;
    v_existing_intent_status TEXT;
    v_has_paid_history BOOLEAN := false;
    v_has_validated_transfer BOOLEAN := false;
BEGIN
    -- 1. Validation des entrées
    IF p_student_global_id IS NULL THEN
        RAISE EXCEPTION 'FAIL CLOSED: student_global_id cannot be null';
    END IF;
    IF p_parent_ref IS NULL OR trim(p_parent_ref) = '' THEN
        RAISE EXCEPTION 'FAIL CLOSED: parent_ref cannot be empty';
    END IF;
    IF p_school_slug IS NULL OR p_school_slug !~ '^[a-z0-9_]{1,50}$' THEN
        RAISE EXCEPTION 'FAIL CLOSED: school_slug invalid format';
    END IF;
    IF p_student_local_id IS NULL OR trim(p_student_local_id) = '' THEN
        RAISE EXCEPTION 'FAIL CLOSED: student_local_id cannot be empty';
    END IF;

    -- 2. Verrou transactionnel consultatif par enfant global (sérialise les checkouts concurrents)
    PERFORM pg_advisory_xact_lock(hashtext('parent_pack_checkout_' || p_student_global_id::text));

    -- 3. Vérification et verrouillage de l'identité globale de l'élève
    PERFORM 1
    FROM public.global_students
    WHERE student_global_id = p_student_global_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'FAIL CLOSED: Global student % not found', p_student_global_id;
    END IF;

    -- 4. Vérification du lien parent-enfant actif
    PERFORM 1
    FROM public.parent_child_links
    WHERE parent_ref = p_parent_ref
      AND student_global_id = p_student_global_id
      AND current_link_active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'FAIL CLOSED: Parent % is not authorized for student %', p_parent_ref, p_student_global_id;
    END IF;

    -- 5. Validation de la grille tarifaire (colonne réelle P19 : active = true)
    SELECT *
    INTO v_pricing
    FROM public.parent_pack_pricing
    WHERE id = p_pricing_id
      AND active = true
      AND cycle_name = p_cycle_name;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'FAIL CLOSED: Invalid or inactive pricing_id % for cycle %', p_pricing_id, p_cycle_name;
    END IF;

    IF p_duration_months = 1 THEN
        v_amount_minor := v_pricing.monthly_price_minor;
    ELSIF p_duration_months = v_pricing.annual_duration_months THEN
        -- Contrôle réversible du mode pilote : blocage des souscriptions annuelles si le mode pilote mensuel est activé
        IF EXISTS (
            SELECT 1 FROM public.global_settings
            WHERE key = 'parent_pack_restrict_annual_pilot'
              AND (value = 'true'::jsonb OR value = '"true"'::jsonb OR value = '1'::jsonb)
        ) OR current_setting('yziow.restrict_annual_pilot', true) = 'true' THEN
            RAISE EXCEPTION 'FAIL CLOSED: PILOT_MONTHLY_ONLY: Annual payments are temporarily disabled for the pilot phase. Please choose the monthly plan.';
        END IF;

        v_amount_minor := v_pricing.annual_price_minor;
    ELSE
        RAISE EXCEPTION 'FAIL CLOSED: Invalid duration_months %', p_duration_months;
    END IF;

    -- 6. Recherche et verrouillage de la souscription globale unique par enfant
    SELECT *
    INTO v_sub
    FROM public.parent_subscriptions
    WHERE student_global_id = p_student_global_id
    FOR UPDATE;

    IF FOUND THEN
        v_subscription_id := v_sub.id;

        -- 6a. Blocage si une intention de paiement non résolue existe déjà
        SELECT status
        INTO v_existing_intent_status
        FROM public.payment_intents
        WHERE payment_type = 'parent_pack'
          AND target_id = v_subscription_id::text
          AND status IN ('initializing', 'pending', 'reconciliation_required')
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE;

        IF FOUND THEN
            IF v_existing_intent_status = 'reconciliation_required' THEN
                RAISE EXCEPTION 'FAIL CLOSED: RECONCILIATION_REQUIRED_PENDING';
            ELSE
                RAISE EXCEPTION 'FAIL CLOSED: ACTIVE_INTENT_ALREADY_EXISTS';
            END IF;
        END IF;

        -- 6b. Règle de renouvellement anticipé J-30 (sur la date de fin maximale des périodes payées)
        SELECT max(end_date)
        INTO v_max_end_date
        FROM public.parent_subscription_periods
        WHERE subscription_id = v_subscription_id
          AND status IN ('active', 'expired');

        IF v_max_end_date IS NOT NULL THEN
            IF now()::date < (v_max_end_date - INTERVAL '30 days')::date THEN
                RAISE EXCEPTION 'FAIL CLOSED: RENEWAL_TOO_EARLY (max_end_date: %)', v_max_end_date;
            END IF;
        END IF;

        -- 6c. Détermination de l'existence d'un historique payé sur cette souscription
        v_has_paid_history := (
            v_max_end_date IS NOT NULL
            OR v_sub.status IN ('active', 'expired')
            OR EXISTS (
                SELECT 1
                FROM public.parent_subscription_periods
                WHERE subscription_id = v_subscription_id
                  AND status IN ('active', 'expired', 'refunded')
            )
        );

        -- 6d. Décision 1 : Si le checkout cible une autre école que l'école officielle de la souscription,
        --     exiger un transfert scolaire officiellement validé (P25-T.2a) et un mapping global cohérent.
        IF p_school_slug IS DISTINCT FROM v_sub.school_slug THEN
            SELECT EXISTS (
                SELECT 1
                FROM public.parent_student_identity_transfers t
                JOIN public.student_global_mappings m
                  ON m.student_global_id = t.student_global_id
                 AND m.school_slug = t.destination_school_slug
                 AND m.student_local_id = t.destination_student_local_id
                WHERE t.student_global_id = p_student_global_id
                  AND t.destination_school_slug = p_school_slug
                  AND t.destination_student_local_id = p_student_local_id
                  AND t.status = 'completed'
            ) INTO v_has_validated_transfer;

            IF NOT v_has_validated_transfer THEN
                RAISE EXCEPTION 'FAIL CLOSED: SCHOOL_MISMATCH_WITHOUT_VALIDATED_TRANSFER (official_school: %, requested_school: %)',
                    v_sub.school_slug, p_school_slug;
            END IF;
        END IF;

        -- 6e. Décision 2 : Conservation de l'identité historique lors d'un checkout non payé.
        --     Si la souscription possède déjà un historique payé, AUCUN champ de parent_subscriptions
        --     (school_slug, student_ref, parent_ref, pricing_id, status) n'est écrasé avant confirmation
        --     effective du paiement par le webhook.
        --     Si la souscription est encore 'inactive' sans aucune période payée (ex. après annulation
        --     d'un premier intent), parent_ref initial est préservé et l'école/référence/tarif peuvent
        --     être rafraîchis dans le respect du contrôle de transfert ci-dessus.
        IF NOT v_has_paid_history THEN
            UPDATE public.parent_subscriptions
            SET updated_at = clock_timestamp(),
                school_slug = CASE WHEN v_has_validated_transfer THEN p_school_slug ELSE school_slug END,
                student_ref = CASE WHEN p_school_slug = school_slug OR v_has_validated_transfer THEN p_student_local_id ELSE student_ref END,
                pricing_id = p_pricing_id
            WHERE id = v_subscription_id;
        END IF;
    ELSE
        -- Première création de la souscription globale pour cet enfant
        INSERT INTO public.parent_subscriptions (
            parent_ref,
            student_global_id,
            school_slug,
            student_ref,
            pricing_id,
            status
        ) VALUES (
            p_parent_ref,
            p_student_global_id,
            p_school_slug,
            p_student_local_id,
            p_pricing_id,
            'inactive'
        )
        RETURNING id INTO v_subscription_id;
    END IF;

    -- 7. Création de l'intention de paiement Parent Pack
    INSERT INTO public.payment_intents (
        target_id,
        expected_amount,
        expected_currency,
        status,
        payment_type,
        school_slug,
        plan_type,
        metadata,
        expires_at
    ) VALUES (
        v_subscription_id::text,
        v_amount_minor,
        v_pricing.currency,
        'initializing',
        'parent_pack',
        p_school_slug,
        NULL,
        jsonb_build_object(
            'pricing_id', p_pricing_id,
            'duration_months', p_duration_months,
            'student_ref', p_student_local_id,
            'parent_ref', p_parent_ref,
            'school_slug', p_school_slug,
            'checkout_date', now(),
            'max_end_date', v_max_end_date,
            'j30_deadline', CASE WHEN v_max_end_date IS NOT NULL THEN (v_max_end_date - INTERVAL '30 days')::date ELSE NULL END,
            'checkout_allowed', true
        ),
        now() + INTERVAL '1 hour'
    )
    RETURNING id INTO v_intent_id;

    RETURN jsonb_build_object(
        'subscription_id', v_subscription_id,
        'payment_intent_id', v_intent_id
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prepare_parent_pack_checkout(TEXT, UUID, TEXT, TEXT, UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_parent_pack_checkout(TEXT, UUID, TEXT, TEXT, UUID, TEXT, INTEGER) TO service_role;

-- ------------------------------------------------------------------------------
-- 3. RPC process_parent_pack_webhook_event (avec commissions calculées sur le brut)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_parent_pack_webhook_event(
    p_provider VARCHAR(32),
    p_provider_event_id VARCHAR(128),
    p_event_type VARCHAR(64),
    p_intent_id UUID,
    p_provider_transaction_id TEXT,
    p_remote_amount NUMERIC,
    p_remote_currency TEXT,
    p_remote_status TEXT,
    p_certified_payment_at TIMESTAMPTZ,
    p_fedapay_fee NUMERIC,
    p_tax_amount NUMERIC,
    p_is_nominal_event BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_event_id UUID;
    v_intent RECORD;
    v_subscription RECORD;
    v_pricing RECORD;
    v_school RECORD;
    v_affiliate_id UUID := NULL;
    v_currency_config RECORD;

    v_duration_months INTEGER;
    v_pricing_id UUID;
    v_expected_price_minor BIGINT;

    v_max_end_date DATE;
    v_start_date DATE;
    v_end_date DATE;
    v_payment_date DATE;
    v_anchor_date DATE;
    v_cumulative_months INTEGER;

    v_gross_amount_minor BIGINT;
    v_fedapay_fee_minor BIGINT;
    v_school_share_minor BIGINT;
    v_amount_after_fee_and_school_minor BIGINT;
    v_ambassador_share_minor BIGINT := 0;
    v_yziow_share_minor BIGINT;

    v_period_id UUID;
    v_school_ledger_id UUID;
    v_maturation_at TIMESTAMPTZ;
    v_has_active_affiliate BOOLEAN := false;
    v_had_paid_history BOOLEAN := false;
    v_has_validated_transfer BOOLEAN := false;
BEGIN
    -- 1. Validation stricte des paramètres RPC (Contrat P27)
    IF p_provider IS NULL OR p_provider <> 'fedapay'
       OR p_provider_event_id IS NULL OR length(trim(p_provider_event_id)) = 0
       OR p_event_type IS NULL OR p_event_type <> 'transaction.approved'
       OR p_intent_id IS NULL
       OR p_provider_transaction_id IS NULL OR length(trim(p_provider_transaction_id)) = 0
       OR p_remote_amount IS NULL OR p_remote_amount <= 0 OR floor(p_remote_amount) <> p_remote_amount
       OR p_remote_currency IS NULL OR p_remote_currency <> 'XOF'
       OR p_remote_status IS NULL OR p_remote_status <> 'approved' THEN
        RETURN jsonb_build_object('status', 'rejected', 'error_code', 'INVALID_PARENT_PACK_RPC_PARAMETERS');
    END IF;

    -- 2. Déduplication de l'événement webhook (colonnes réelles de public.webhook_events)
    INSERT INTO public.webhook_events (provider, provider_event_id, event_type, intent_id, status)
    VALUES (p_provider, p_provider_event_id, p_event_type, p_intent_id, 'processing')
    ON CONFLICT (provider, provider_event_id) DO NOTHING
    RETURNING id INTO v_event_id;

    IF v_event_id IS NULL THEN
        RETURN jsonb_build_object('status', 'duplicate', 'provider_event_id', p_provider_event_id);
    END IF;

    -- 3. Verrouillage et vérification de l'intention de paiement
    SELECT *
    INTO v_intent
    FROM public.payment_intents
    WHERE id = p_intent_id
    FOR UPDATE;

    IF NOT FOUND THEN
        UPDATE public.webhook_events
        SET status = 'failed', error_code = 'INTENT_NOT_FOUND', processed_at = clock_timestamp()
        WHERE id = v_event_id;
        RETURN jsonb_build_object('status', 'rejected', 'error_code', 'INTENT_NOT_FOUND');
    END IF;

    IF v_intent.payment_type <> 'parent_pack' THEN
        UPDATE public.webhook_events
        SET status = 'failed', error_code = 'WRONG_PAYMENT_TYPE', processed_at = clock_timestamp()
        WHERE id = v_event_id;
        RETURN jsonb_build_object('status', 'rejected', 'error_code', 'WRONG_PAYMENT_TYPE');
    END IF;

    IF v_intent.expected_currency <> p_remote_currency OR v_intent.expected_amount <> p_remote_amount THEN
        UPDATE public.payment_intents
        SET status = 'reconciliation_required',
            reconciliation_reason = 'PARENT_PACK_CURRENCY_OR_AMOUNT_MISMATCH',
            updated_at = clock_timestamp()
        WHERE id = p_intent_id;
        UPDATE public.webhook_events
        SET status = 'reconciliation_required', error_code = 'PARENT_PACK_CURRENCY_OR_AMOUNT_MISMATCH', processed_at = clock_timestamp()
        WHERE id = v_event_id;
        RETURN jsonb_build_object('status', 'reconciliation_required', 'error_code', 'PARENT_PACK_CURRENCY_OR_AMOUNT_MISMATCH');
    END IF;

    IF v_intent.status = 'completed' THEN
        UPDATE public.webhook_events
        SET status = 'duplicate', processed_at = clock_timestamp()
        WHERE id = v_event_id;
        RETURN jsonb_build_object('status', 'duplicate', 'reason', 'intent_already_completed', 'message', 'Payment intent already completed');
    END IF;

    IF v_intent.status NOT IN ('initializing', 'pending') THEN
        UPDATE public.payment_intents
        SET status = 'reconciliation_required',
            reconciliation_reason = 'PARENT_PACK_INTENT_NOT_PAYABLE',
            updated_at = clock_timestamp()
        WHERE id = p_intent_id;
        UPDATE public.webhook_events
        SET status = 'reconciliation_required', error_code = 'PARENT_PACK_INTENT_NOT_PAYABLE', processed_at = clock_timestamp()
        WHERE id = v_event_id;
        RETURN jsonb_build_object('status', 'reconciliation_required', 'error_code', 'PARENT_PACK_INTENT_NOT_PAYABLE');
    END IF;

    -- 4. Garde-fou P27 sur la certification des métadonnées FedaPay
    IF p_is_nominal_event IS NOT TRUE
       OR p_provider_event_id LIKE 'uncertified_%'
       OR p_certified_payment_at IS NULL
       OR p_fedapay_fee IS NULL OR p_fedapay_fee < 0 OR floor(p_fedapay_fee) <> p_fedapay_fee
       OR p_tax_amount IS NULL OR p_tax_amount < 0 OR floor(p_tax_amount) <> p_tax_amount THEN
        UPDATE public.payment_intents
        SET status = 'reconciliation_required',
            reconciliation_reason = 'PARENT_PACK_UNCERTIFIED_PAYMENT_METADATA',
            updated_at = clock_timestamp()
        WHERE id = p_intent_id;
        UPDATE public.webhook_events
        SET status = 'reconciliation_required', error_code = 'PARENT_PACK_UNCERTIFIED_PAYMENT_METADATA', processed_at = clock_timestamp()
        WHERE id = v_event_id;
        RETURN jsonb_build_object('status', 'reconciliation_required', 'error_code', 'PARENT_PACK_UNCERTIFIED_PAYMENT_METADATA');
    END IF;

    -- 5. Verrouillage de la souscription Parent Pack
    BEGIN
        SELECT *
        INTO v_subscription
        FROM public.parent_subscriptions
        WHERE id = v_intent.target_id::uuid
        FOR UPDATE;
    EXCEPTION WHEN invalid_text_representation THEN
        UPDATE public.payment_intents
        SET status = 'reconciliation_required',
            reconciliation_reason = 'INVALID_TARGET_UUID',
            updated_at = clock_timestamp()
        WHERE id = p_intent_id;
        UPDATE public.webhook_events
        SET status = 'reconciliation_required', error_code = 'INVALID_TARGET_UUID', processed_at = clock_timestamp()
        WHERE id = v_event_id;
        RETURN jsonb_build_object('status', 'reconciliation_required', 'error_code', 'INVALID_TARGET_UUID');
    END;

    IF NOT FOUND THEN
        UPDATE public.payment_intents
        SET status = 'reconciliation_required',
            reconciliation_reason = 'PARENT_PACK_SUBSCRIPTION_NOT_FOUND',
            updated_at = clock_timestamp()
        WHERE id = p_intent_id;
        UPDATE public.webhook_events
        SET status = 'reconciliation_required', error_code = 'PARENT_PACK_SUBSCRIPTION_NOT_FOUND', processed_at = clock_timestamp()
        WHERE id = v_event_id;
        RETURN jsonb_build_object('status', 'reconciliation_required', 'error_code', 'PARENT_PACK_SUBSCRIPTION_NOT_FOUND');
    END IF;

    -- 6. Validation des métadonnées tarifaires de l'intention
    IF v_intent.metadata IS NULL
       OR NOT (v_intent.metadata ? 'pricing_id')
       OR NOT (v_intent.metadata ? 'duration_months') THEN
        UPDATE public.payment_intents
        SET status = 'reconciliation_required',
            reconciliation_reason = 'PARENT_PACK_MISSING_METADATA',
            updated_at = clock_timestamp()
        WHERE id = p_intent_id;
        UPDATE public.webhook_events
        SET status = 'reconciliation_required', error_code = 'PARENT_PACK_MISSING_METADATA', processed_at = clock_timestamp()
        WHERE id = v_event_id;
        RETURN jsonb_build_object('status', 'reconciliation_required', 'error_code', 'PARENT_PACK_MISSING_METADATA');
    END IF;

    BEGIN
        v_pricing_id := (v_intent.metadata->>'pricing_id')::uuid;
        v_duration_months := (v_intent.metadata->>'duration_months')::integer;
    EXCEPTION WHEN OTHERS THEN
        UPDATE public.payment_intents
        SET status = 'reconciliation_required',
            reconciliation_reason = 'CORRUPTED_INTENT_METADATA',
            updated_at = clock_timestamp()
        WHERE id = p_intent_id;
        UPDATE public.webhook_events
        SET status = 'reconciliation_required', error_code = 'CORRUPTED_INTENT_METADATA', processed_at = clock_timestamp()
        WHERE id = v_event_id;
        RETURN jsonb_build_object('status', 'reconciliation_required', 'error_code', 'CORRUPTED_INTENT_METADATA');
    END;

    SELECT *
    INTO v_pricing
    FROM public.parent_pack_pricing
    WHERE id = v_pricing_id;

    IF NOT FOUND THEN
        UPDATE public.payment_intents
        SET status = 'reconciliation_required',
            reconciliation_reason = 'PRICING_NOT_FOUND',
            updated_at = clock_timestamp()
        WHERE id = p_intent_id;
        UPDATE public.webhook_events
        SET status = 'reconciliation_required', error_code = 'PRICING_NOT_FOUND', processed_at = clock_timestamp()
        WHERE id = v_event_id;
        RETURN jsonb_build_object('status', 'reconciliation_required', 'error_code', 'PRICING_NOT_FOUND');
    END IF;

    IF v_duration_months = 1 THEN
        v_expected_price_minor := v_pricing.monthly_price_minor;
    ELSIF v_duration_months = v_pricing.annual_duration_months THEN
        v_expected_price_minor := v_pricing.annual_price_minor;
    ELSE
        UPDATE public.payment_intents
        SET status = 'reconciliation_required',
            reconciliation_reason = 'PARENT_PACK_INVALID_DURATION',
            updated_at = clock_timestamp()
        WHERE id = p_intent_id;
        UPDATE public.webhook_events
        SET status = 'reconciliation_required', error_code = 'PARENT_PACK_INVALID_DURATION', processed_at = clock_timestamp()
        WHERE id = v_event_id;
        RETURN jsonb_build_object('status', 'reconciliation_required', 'error_code', 'PARENT_PACK_INVALID_DURATION');
    END IF;

    IF v_intent.expected_amount <> v_expected_price_minor THEN
        UPDATE public.payment_intents
        SET status = 'reconciliation_required',
            reconciliation_reason = 'INTENT_AMOUNT_VS_PRICING_MISMATCH',
            updated_at = clock_timestamp()
        WHERE id = p_intent_id;
        UPDATE public.webhook_events
        SET status = 'reconciliation_required', error_code = 'INTENT_AMOUNT_VS_PRICING_MISMATCH', processed_at = clock_timestamp()
        WHERE id = v_event_id;
        RETURN jsonb_build_object('status', 'reconciliation_required', 'error_code', 'INTENT_AMOUNT_VS_PRICING_MISMATCH');
    END IF;

    -- 7. Décisions 1 & 2 (P28b) : Contrôle de cohérence de l'école bénéficiaire et transfert officiel
    SELECT (
        v_subscription.status IN ('active', 'expired')
        OR EXISTS (
            SELECT 1
            FROM public.parent_subscription_periods
            WHERE subscription_id = v_subscription.id
              AND status IN ('active', 'expired', 'refunded')
        )
    ) INTO v_had_paid_history;

    IF v_intent.school_slug IS DISTINCT FROM v_subscription.school_slug THEN
        SELECT EXISTS (
            SELECT 1
            FROM public.parent_student_identity_transfers t
            JOIN public.student_global_mappings m
              ON m.student_global_id = t.student_global_id
             AND m.school_slug = t.destination_school_slug
             AND m.student_local_id = t.destination_student_local_id
            WHERE t.student_global_id = v_subscription.student_global_id
              AND t.destination_school_slug = v_intent.school_slug
              AND (
                  (v_intent.metadata->>'student_ref') IS NULL
                  OR t.destination_student_local_id = (v_intent.metadata->>'student_ref')
              )
              AND t.status = 'completed'
        ) INTO v_has_validated_transfer;

        IF NOT v_has_validated_transfer THEN
            UPDATE public.payment_intents
            SET status = 'reconciliation_required',
                reconciliation_reason = 'PARENT_PACK_SCHOOL_MISMATCH_NO_TRANSFER',
                updated_at = clock_timestamp()
            WHERE id = p_intent_id;
            UPDATE public.webhook_events
            SET status = 'reconciliation_required', error_code = 'PARENT_PACK_SCHOOL_MISMATCH_NO_TRANSFER', processed_at = clock_timestamp()
            WHERE id = v_event_id;
            RETURN jsonb_build_object('status', 'reconciliation_required', 'error_code', 'PARENT_PACK_SCHOOL_MISMATCH_NO_TRANSFER');
        END IF;
    END IF;

    -- 8. Calcul continu des dates de période et vérification J-30 (Logique intégrale P27)
    SELECT max(end_date)
    INTO v_max_end_date
    FROM public.parent_subscription_periods
    WHERE subscription_id = v_subscription.id
      AND status IN ('active', 'expired');

    v_payment_date := (p_certified_payment_at AT TIME ZONE 'UTC')::date;

    IF v_max_end_date IS NOT NULL THEN
        IF (v_intent.metadata ? 'checkout_allowed') AND (v_intent.metadata->>'checkout_allowed')::boolean = true THEN
            IF (v_intent.metadata ? 'j30_deadline') AND v_intent.metadata->>'j30_deadline' IS NOT NULL THEN
                IF v_max_end_date - INTERVAL '30 days' > (v_intent.metadata->>'j30_deadline')::date THEN
                    IF v_payment_date < (v_max_end_date - INTERVAL '30 days')::date THEN
                        UPDATE public.payment_intents
                        SET status = 'reconciliation_required',
                            reconciliation_reason = 'PARENT_PACK_RENEWAL_TOO_EARLY',
                            updated_at = clock_timestamp()
                        WHERE id = p_intent_id;
                        UPDATE public.webhook_events
                        SET status = 'reconciliation_required', error_code = 'PARENT_PACK_RENEWAL_TOO_EARLY', processed_at = clock_timestamp()
                        WHERE id = v_event_id;
                        RETURN jsonb_build_object('status', 'reconciliation_required', 'error_code', 'PARENT_PACK_RENEWAL_TOO_EARLY');
                    END IF;
                END IF;
            END IF;
        ELSE
            IF v_payment_date < (v_max_end_date - INTERVAL '30 days')::date THEN
                UPDATE public.payment_intents
                SET status = 'reconciliation_required',
                    reconciliation_reason = 'PARENT_PACK_RENEWAL_TOO_EARLY',
                    updated_at = clock_timestamp()
                WHERE id = p_intent_id;
                UPDATE public.webhook_events
                SET status = 'reconciliation_required', error_code = 'PARENT_PACK_RENEWAL_TOO_EARLY', processed_at = clock_timestamp()
                WHERE id = v_event_id;
                RETURN jsonb_build_object('status', 'reconciliation_required', 'error_code', 'PARENT_PACK_RENEWAL_TOO_EARLY');
            END IF;
        END IF;
    END IF;

    IF v_max_end_date IS NULL OR v_payment_date > v_max_end_date THEN
        v_start_date := v_payment_date;
        v_anchor_date := v_payment_date;
        v_cumulative_months := v_duration_months;
    ELSE
        v_start_date := (v_max_end_date + INTERVAL '1 day')::date;

        IF v_subscription.billing_anchor_date IS NOT NULL AND v_subscription.cumulative_months > 0 THEN
            v_anchor_date := v_subscription.billing_anchor_date;
            v_cumulative_months := v_subscription.cumulative_months + v_duration_months;
        ELSE
            WITH RECURSIVE chain AS (
                SELECT p.id, p.start_date, p.end_date, p.payment_intent_id
                FROM public.parent_subscription_periods p
                WHERE p.subscription_id = v_subscription.id
                  AND p.status IN ('active', 'expired')
                  AND p.end_date = v_max_end_date
                UNION ALL
                SELECT prev.id, prev.start_date, prev.end_date, prev.payment_intent_id
                FROM public.parent_subscription_periods prev
                JOIN chain c ON prev.end_date = (c.start_date - INTERVAL '1 day')::date
                WHERE prev.subscription_id = v_subscription.id
                  AND prev.status IN ('active', 'expired')
            )
            SELECT min(c.start_date), coalesce(sum((pi.metadata->>'duration_months')::int), 0)
            INTO v_anchor_date, v_cumulative_months
            FROM chain c
            JOIN public.payment_intents pi ON pi.id = c.payment_intent_id;

            IF v_anchor_date IS NULL OR v_cumulative_months = 0 THEN
                v_anchor_date := v_start_date;
                v_cumulative_months := v_duration_months;
            ELSE
                v_cumulative_months := v_cumulative_months + v_duration_months;
            END IF;
        END IF;
    END IF;

    v_end_date := (v_anchor_date + make_interval(months => v_cumulative_months) - INTERVAL '1 day')::date;

    -- 9. Vérification de l'école bénéficiaire, de la devise et du calcul des commissions
    SELECT *
    INTO v_school
    FROM public.schools
    WHERE slug = v_intent.school_slug
    FOR UPDATE;

    IF NOT FOUND OR v_school.status <> 'active' THEN
        UPDATE public.payment_intents
        SET status = 'reconciliation_required',
            reconciliation_reason = 'PARENT_PACK_SCHOOL_NOT_FOUND',
            updated_at = clock_timestamp()
        WHERE id = p_intent_id;
        UPDATE public.webhook_events
        SET status = 'reconciliation_required', error_code = 'PARENT_PACK_SCHOOL_NOT_FOUND', processed_at = clock_timestamp()
        WHERE id = v_event_id;
        RETURN jsonb_build_object('status', 'reconciliation_required', 'error_code', 'PARENT_PACK_SCHOOL_NOT_FOUND');
    END IF;

    SELECT *
    INTO v_currency_config
    FROM public.currency_configurations
    WHERE code = 'XOF'
      AND is_active = true;

    IF NOT FOUND THEN
        UPDATE public.payment_intents
        SET status = 'reconciliation_required',
            reconciliation_reason = 'CURRENCY_CONFIG_MISSING',
            updated_at = clock_timestamp()
        WHERE id = p_intent_id;
        UPDATE public.webhook_events
        SET status = 'reconciliation_required', error_code = 'CURRENCY_CONFIG_MISSING', processed_at = clock_timestamp()
        WHERE id = v_event_id;
        RETURN jsonb_build_object('status', 'reconciliation_required', 'error_code', 'CURRENCY_CONFIG_MISSING');
    END IF;

    IF v_school.affiliate_id IS NOT NULL THEN
        SELECT id
        INTO v_affiliate_id
        FROM public.affiliates
        WHERE id = v_school.affiliate_id
          AND status = 'active'
        FOR UPDATE;
        IF FOUND THEN
            v_has_active_affiliate := true;
        ELSE
            v_affiliate_id := NULL;
        END IF;
    END IF;

    v_gross_amount_minor := p_remote_amount::BIGINT;
    v_fedapay_fee_minor := p_fedapay_fee::BIGINT;

    -- 1. Commission établissement : 20 % du montant brut payé (Politique officielle V1)
    v_school_share_minor := FLOOR(v_gross_amount_minor::NUMERIC * 20 / 100)::BIGINT;

    -- 2. Commission ambassadeur : 10 % du montant brut payé si ambassadeur actif, sinon 0 % (Politique officielle V1)
    IF v_has_active_affiliate THEN
        v_ambassador_share_minor := FLOOR(v_gross_amount_minor::NUMERIC * 10 / 100)::BIGINT;
    ELSE
        v_ambassador_share_minor := 0;
    END IF;

    -- 3. Part nette YZIOW : absorption des frais réels FedaPay et déduction des commissions
    v_yziow_share_minor := v_gross_amount_minor - v_fedapay_fee_minor - v_school_share_minor - v_ambassador_share_minor;

    -- 4. Sécurité fail-closed si les frais et commissions excèdent le montant brut
    IF v_yziow_share_minor < 0 THEN
        UPDATE public.payment_intents
        SET status = 'reconciliation_required',
            reconciliation_reason = 'PARENT_PACK_FEES_AND_COMMISSIONS_EXCEED_GROSS',
            updated_at = clock_timestamp()
        WHERE id = p_intent_id;
        UPDATE public.webhook_events
        SET status = 'reconciliation_required', error_code = 'PARENT_PACK_FEES_AND_COMMISSIONS_EXCEED_GROSS', processed_at = clock_timestamp()
        WHERE id = v_event_id;
        RETURN jsonb_build_object('status', 'reconciliation_required', 'error_code', 'PARENT_PACK_FEES_AND_COMMISSIONS_EXCEED_GROSS');
    END IF;

    IF v_school_share_minor < 0 OR v_ambassador_share_minor < 0 OR v_yziow_share_minor < 0 THEN
        UPDATE public.payment_intents
        SET status = 'reconciliation_required',
            reconciliation_reason = 'NEGATIVE_SHARE_COMPUTED',
            updated_at = clock_timestamp()
        WHERE id = p_intent_id;
        UPDATE public.webhook_events
        SET status = 'reconciliation_required', error_code = 'NEGATIVE_SHARE_COMPUTED', processed_at = clock_timestamp()
        WHERE id = v_event_id;
        RETURN jsonb_build_object('status', 'reconciliation_required', 'error_code', 'NEGATIVE_SHARE_COMPUTED');
    END IF;

    IF (v_fedapay_fee_minor + v_school_share_minor + v_ambassador_share_minor + v_yziow_share_minor) <> v_gross_amount_minor THEN
        RAISE EXCEPTION 'PARENT_PACK_ALLOCATION_INVARIANT_BROKEN';
    END IF;

    -- 10. ORDRE TRANSACTIONNEL P28b :
    --     a) Marquer d'abord payment_intents comme 'completed' (avec processed_at non nul)
    --        pour que le déclencheur trg_validate_parent_pack_intent autorise l'insertion
    --        de la période 'active'.
    UPDATE public.payment_intents
    SET status = 'completed',
        provider_transaction_id = p_provider_transaction_id,
        processed_at = p_certified_payment_at,
        updated_at = clock_timestamp()
    WHERE id = p_intent_id;

    --     b) Insérer la période active dans parent_subscription_periods
    INSERT INTO public.parent_subscription_periods (
        subscription_id,
        payment_intent_id,
        start_date,
        end_date,
        status
    ) VALUES (
        v_subscription.id,
        p_intent_id,
        v_start_date,
        v_end_date,
        'active'
    )
    RETURNING id INTO v_period_id;

    --     c) Insérer l'écriture comptable dans school_commission_ledger (schéma exact P19/P27)
    INSERT INTO public.school_commission_ledger (
        period_id,
        school_slug,
        ambassador_ref,
        gross_amount_minor,
        fedapay_fee_minor,
        school_share_minor,
        ambassador_share_minor,
        yziow_share_minor,
        currency,
        type
    ) VALUES (
        v_period_id,
        v_intent.school_slug,
        CASE WHEN v_has_active_affiliate THEN v_affiliate_id::text ELSE NULL END,
        v_gross_amount_minor,
        v_fedapay_fee_minor,
        v_school_share_minor,
        v_ambassador_share_minor,
        v_yziow_share_minor,
        'XOF',
        'credit'
    )
    RETURNING id INTO v_school_ledger_id;

    --     d) Créditer l'ambassadeur dans affiliate_ledger et affiliate_balances si applicable
    --        (Schéma exact P13 et contrat comptable P27 : aucune colonne school_id sur affiliate_ledger,
    --         colonnes pending_balance_minor / available_balance_minor / reserved_balance_minor / debt_balance_minor
    --         sur affiliate_balances avec UPSERT préservant les soldes et dettes existants).
    IF v_has_active_affiliate AND v_ambassador_share_minor > 0 THEN
        v_maturation_at := p_certified_payment_at + (v_currency_config.cooling_off_days || ' days')::interval;

        INSERT INTO public.affiliate_ledger (
            affiliate_id,
            currency,
            entry_type,
            amount_minor,
            payment_intent_id,
            maturation_at,
            metadata
        ) VALUES (
            v_affiliate_id,
            'XOF',
            'commission',
            v_ambassador_share_minor,
            p_intent_id,
            v_maturation_at,
            jsonb_build_object(
                'source', 'parent_pack',
                'period_id', v_period_id,
                'school_commission_ledger_id', v_school_ledger_id,
                'gross_amount_minor', v_gross_amount_minor,
                'fedapay_fee_minor', v_fedapay_fee_minor,
                'school_share_minor', v_school_share_minor,
                'ambassador_share_minor', v_ambassador_share_minor,
                'yziow_share_minor', v_yziow_share_minor,
                'provider_event_id', p_provider_event_id,
                'certified_payment_at', p_certified_payment_at,
                'payer_parent_ref', v_intent.metadata->>'parent_ref'
            )
        );

        INSERT INTO public.affiliate_balances (
            affiliate_id,
            currency,
            pending_balance_minor,
            available_balance_minor,
            reserved_balance_minor,
            debt_balance_minor,
            updated_at
        ) VALUES (
            v_affiliate_id,
            'XOF',
            v_ambassador_share_minor,
            0,
            0,
            0,
            clock_timestamp()
        )
        ON CONFLICT (affiliate_id, currency) DO UPDATE
        SET pending_balance_minor = public.affiliate_balances.pending_balance_minor + EXCLUDED.pending_balance_minor,
            updated_at = clock_timestamp();
    END IF;

    --     e) Mettre à jour parent_subscriptions (Décision 2 : parent_ref initial n'est jamais
    --        écrasé ; school_slug et student_ref ne sont mis à jour qu'au premier paiement
    --        ou après un transfert scolaire officiellement validé).
    UPDATE public.parent_subscriptions
    SET status = 'active',
        billing_anchor_date = v_anchor_date,
        cumulative_months = v_cumulative_months,
        school_slug = CASE
            WHEN NOT v_had_paid_history OR v_has_validated_transfer THEN v_intent.school_slug
            ELSE school_slug
        END,
        student_ref = CASE
            WHEN NOT v_had_paid_history OR v_has_validated_transfer THEN COALESCE(v_intent.metadata->>'student_ref', student_ref)
            ELSE student_ref
        END,
        pricing_id = CASE
            WHEN NOT v_had_paid_history OR v_has_validated_transfer THEN v_pricing_id
            ELSE pricing_id
        END,
        updated_at = clock_timestamp()
    WHERE id = v_subscription.id;

    --     f) Marquer l'événement webhook comme traité
    UPDATE public.webhook_events
    SET status = 'processed',
        processed_at = clock_timestamp()
    WHERE id = v_event_id;

    RETURN jsonb_build_object(
        'status', 'completed',
        'payment_type', 'parent_pack',
        'subscription_id', v_subscription.id,
        'period_id', v_period_id,
        'school_share_minor', v_school_share_minor,
        'ambassador_share_minor', v_ambassador_share_minor,
        'yziow_share_minor', v_yziow_share_minor
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_parent_pack_webhook_event(VARCHAR, VARCHAR, VARCHAR, UUID, TEXT, NUMERIC, TEXT, TEXT, TIMESTAMPTZ, NUMERIC, NUMERIC, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_parent_pack_webhook_event(VARCHAR, VARCHAR, VARCHAR, UUID, TEXT, NUMERIC, TEXT, TEXT, TIMESTAMPTZ, NUMERIC, NUMERIC, BOOLEAN) TO service_role;

COMMIT;
