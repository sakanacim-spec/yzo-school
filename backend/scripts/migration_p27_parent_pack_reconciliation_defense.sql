-- ==============================================================================
-- Migration P27 : Défense transactionnelle anti-double paiement Parent Pack
-- ==============================================================================
-- Objectifs :
--   1. Empêcher l'autorisation d'une nouvelle tentative de checkout Parent Pack
--      lorsqu'une intention précédente pour le même abonnement est encore en
--      'reconciliation_required', 'initializing' ou 'pending'.
--   2. Verrouiller atomiquement la souscription et vérifier les intentions
--      concurrentes directement au niveau de PostgreSQL (Fail-Closed).
--   3. Empêcher la mutation prématurée de school_slug, student_ref et pricing_id
--      sur un abonnement actif lors d'une tentative de paiement non certifiée.
--   4. Mettre à jour atomiquement le contexte de la souscription uniquement lors
--      de la certification du paiement par le webhook.
--   5. Installer l'index partiel unique sur target_id seul, en mode STRICTEMENT
--      FAIL-CLOSED : si des doublons existent, la migration échoue (ROLLBACK)
--      immédiatement sans altérer les données existantes.
--
-- RÈGLE ABSOLUE :
--   - Non destructif : aucun DROP TABLE, aucun DELETE, aucune modification
--     des lignes historiques de payment_intents, parent_subscriptions ou ledgers.
-- ==============================================================================

BEGIN;

-- 0. Évolution du schéma parent_subscriptions : conservation de l'ancrage d'anniversaire et du cumul de mois
ALTER TABLE public.parent_subscriptions
    ADD COLUMN IF NOT EXISTS billing_anchor_date DATE,
    ADD COLUMN IF NOT EXISTS cumulative_months INTEGER NOT NULL DEFAULT 0;

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

    -- B. Upsert sécurisé de la souscription :
    -- Si la souscription existe déjà et est 'active', ne pas modifier prématurément school_slug,
    -- student_ref et pricing_id avant la confirmation du paiement.
    INSERT INTO public.parent_subscriptions (
        parent_ref, student_global_id, school_slug, student_ref, pricing_id, status
    )
    VALUES (
        p_parent_ref, p_student_global_id, p_school_slug, p_student_local_id, p_pricing_id, 'inactive'
    )
    ON CONFLICT (parent_ref, student_global_id) DO UPDATE
    SET updated_at = clock_timestamp(),
        school_slug = CASE WHEN parent_subscriptions.status = 'active' THEN parent_subscriptions.school_slug ELSE EXCLUDED.school_slug END,
        student_ref = CASE WHEN parent_subscriptions.status = 'active' THEN parent_subscriptions.student_ref ELSE EXCLUDED.student_ref END,
        pricing_id  = CASE WHEN parent_subscriptions.status = 'active' THEN parent_subscriptions.pricing_id  ELSE EXCLUDED.pricing_id END
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

    -- D. Création de l'intention en statut 'initializing' avec métadonnées complètes
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
        jsonb_build_object(
            'pricing_id', p_pricing_id,
            'duration_months', p_duration_months,
            'student_ref', p_student_local_id
        ),
        now() + interval '1 hour'
    )
    RETURNING id INTO v_intent_id;

    RETURN jsonb_build_object('subscription_id', v_subscription_id, 'payment_intent_id', v_intent_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prepare_parent_pack_checkout(text, uuid, text, text, uuid, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prepare_parent_pack_checkout(text, uuid, text, text, uuid, text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.prepare_parent_pack_checkout(text, uuid, text, text, uuid, text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_parent_pack_checkout(text, uuid, text, text, uuid, text, integer) TO service_role;

-- 2. Mise à jour de la fonction de traitement webhook (mise à jour du contexte uniquement à certification)
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
    v_existing_event RECORD;
    v_intent RECORD;
    v_subscription RECORD;
    v_school RECORD;
    v_affiliate RECORD;
    v_currency_cfg RECORD;
    v_expected_amount BIGINT;
    v_gross_amount_minor BIGINT;
    v_fedapay_fee_minor BIGINT;
    v_school_share_minor BIGINT;
    v_amount_after_fee_and_school_minor BIGINT;
    v_ambassador_share_minor BIGINT := 0;
    v_yziow_share_minor BIGINT;
    v_school_ledger_id UUID;
    v_affiliate_ledger_id UUID;
    v_maturation_at TIMESTAMPTZ;
    v_has_active_affiliate BOOLEAN := false;
    v_pricing_id UUID;
    v_duration_months INTEGER;
    v_start_date DATE;
    v_end_date DATE;
    v_max_end_date DATE;
    v_anchor_date DATE;
    v_cumulative_months INTEGER;
    v_period_id UUID;
BEGIN
    IF p_provider IS NULL OR length(trim(p_provider)) = 0
       OR p_provider IS DISTINCT FROM 'fedapay'
       OR p_provider_event_id IS NULL OR length(trim(p_provider_event_id)) = 0
       OR p_event_type IS NULL OR length(trim(p_event_type)) = 0
       OR p_event_type IS DISTINCT FROM 'transaction.approved'
       OR p_intent_id IS NULL
       OR p_provider_transaction_id IS NULL OR length(trim(p_provider_transaction_id)) = 0
       OR p_remote_amount IS NULL OR p_remote_amount <= 0 OR p_remote_amount <> trunc(p_remote_amount)
       OR p_remote_currency IS DISTINCT FROM 'XOF'
       OR p_remote_status IS DISTINCT FROM 'approved'
    THEN
        RETURN jsonb_build_object('status', 'rejected', 'error_code', 'INVALID_PARENT_PACK_RPC_PARAMETERS');
    END IF;

    INSERT INTO public.webhook_events (
        provider, provider_event_id, event_type, intent_id, status
    ) VALUES (
        p_provider, p_provider_event_id, p_event_type, p_intent_id, 'processing'
    )
    ON CONFLICT (provider, provider_event_id) DO NOTHING
    RETURNING id INTO v_event_id;

    IF v_event_id IS NULL THEN
        SELECT status INTO v_existing_event
          FROM public.webhook_events
         WHERE provider = p_provider
           AND provider_event_id = p_provider_event_id;
        RETURN jsonb_build_object('status', 'duplicate', 'message', 'Webhook event already recorded', 'existing_status', v_existing_event.status);
    END IF;

    SELECT * INTO v_intent FROM public.payment_intents WHERE id = p_intent_id FOR UPDATE;

    IF NOT FOUND THEN
        UPDATE public.webhook_events SET status = 'failed', error_code = 'INTENT_NOT_FOUND', processed_at = clock_timestamp() WHERE id = v_event_id;
        RETURN jsonb_build_object('status', 'error', 'error_code', 'INTENT_NOT_FOUND');
    END IF;

    IF v_intent.payment_type IS DISTINCT FROM 'parent_pack' THEN
        UPDATE public.webhook_events SET status = 'reconciliation_required', error_code = 'PARENT_PACK_INTENT_TYPE_MISMATCH', processed_at = clock_timestamp() WHERE id = v_event_id;
        RETURN jsonb_build_object('status', 'reconciliation_required', 'error_code', 'PARENT_PACK_INTENT_TYPE_MISMATCH');
    END IF;

    IF v_intent.expected_currency IS DISTINCT FROM p_remote_currency OR v_intent.expected_amount IS DISTINCT FROM p_remote_amount THEN
        UPDATE public.payment_intents SET status = 'reconciliation_required', reconciliation_reason = 'PARENT_PACK_CURRENCY_OR_AMOUNT_MISMATCH', updated_at = clock_timestamp() WHERE id = p_intent_id;
        UPDATE public.webhook_events SET status = 'reconciliation_required', error_code = 'PARENT_PACK_CURRENCY_OR_AMOUNT_MISMATCH', processed_at = clock_timestamp() WHERE id = v_event_id;
        RETURN jsonb_build_object('status', 'reconciliation_required', 'error_code', 'PARENT_PACK_CURRENCY_OR_AMOUNT_MISMATCH');
    END IF;

    IF v_intent.status = 'completed' THEN
        UPDATE public.webhook_events SET status = 'duplicate', processed_at = clock_timestamp() WHERE id = v_event_id;
        RETURN jsonb_build_object('status', 'duplicate', 'message', 'Payment intent already completed');
    END IF;

    IF v_intent.status NOT IN ('initializing', 'pending') THEN
        UPDATE public.webhook_events SET status = 'reconciliation_required', error_code = 'PARENT_PACK_INTENT_NOT_PAYABLE', processed_at = clock_timestamp() WHERE id = v_event_id;
        RETURN jsonb_build_object('status', 'reconciliation_required', 'error_code', 'PARENT_PACK_INTENT_NOT_PAYABLE');
    END IF;

    IF p_is_nominal_event IS NOT TRUE OR p_provider_event_id LIKE 'uncertified_%' OR p_certified_payment_at IS NULL OR p_fedapay_fee IS NULL OR p_fedapay_fee < 0 OR p_tax_amount IS NULL OR p_tax_amount < 0 THEN
        UPDATE public.payment_intents SET status = 'reconciliation_required', reconciliation_reason = 'PARENT_PACK_UNCERTIFIED_PAYMENT_METADATA', updated_at = clock_timestamp() WHERE id = p_intent_id;
        UPDATE public.webhook_events SET status = 'reconciliation_required', error_code = 'PARENT_PACK_UNCERTIFIED_PAYMENT_METADATA', processed_at = clock_timestamp() WHERE id = v_event_id;
        RETURN jsonb_build_object('status', 'reconciliation_required', 'error_code', 'PARENT_PACK_UNCERTIFIED_PAYMENT_METADATA');
    END IF;

    SELECT * INTO v_subscription FROM public.parent_subscriptions WHERE id = (v_intent.target_id)::uuid FOR UPDATE;

    IF NOT FOUND THEN
        UPDATE public.payment_intents SET status = 'reconciliation_required', reconciliation_reason = 'PARENT_PACK_SUBSCRIPTION_NOT_FOUND', updated_at = clock_timestamp() WHERE id = p_intent_id;
        UPDATE public.webhook_events SET status = 'reconciliation_required', error_code = 'PARENT_PACK_SUBSCRIPTION_NOT_FOUND', processed_at = clock_timestamp() WHERE id = v_event_id;
        RETURN jsonb_build_object('status', 'reconciliation_required', 'error_code', 'PARENT_PACK_SUBSCRIPTION_NOT_FOUND');
    END IF;

    -- Validation Metadata avant cast
    IF NOT (v_intent.metadata ? 'pricing_id') OR NOT (v_intent.metadata ? 'duration_months') THEN
        UPDATE public.payment_intents SET status = 'reconciliation_required', reconciliation_reason = 'PARENT_PACK_MISSING_METADATA', updated_at = clock_timestamp() WHERE id = p_intent_id;
        UPDATE public.webhook_events SET status = 'reconciliation_required', error_code = 'PARENT_PACK_MISSING_METADATA', processed_at = clock_timestamp() WHERE id = v_event_id;
        RETURN jsonb_build_object('status', 'reconciliation_required', 'error_code', 'PARENT_PACK_MISSING_METADATA');
    END IF;

    IF NOT (v_intent.metadata->>'pricing_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
        UPDATE public.payment_intents SET status = 'reconciliation_required', reconciliation_reason = 'PARENT_PACK_INVALID_PRICING_ID', updated_at = clock_timestamp() WHERE id = p_intent_id;
        UPDATE public.webhook_events SET status = 'reconciliation_required', error_code = 'PARENT_PACK_INVALID_PRICING_ID', processed_at = clock_timestamp() WHERE id = v_event_id;
        RETURN jsonb_build_object('status', 'reconciliation_required', 'error_code', 'PARENT_PACK_INVALID_PRICING_ID');
    END IF;

    IF NOT (v_intent.metadata->>'duration_months' ~ '^[0-9]+$') THEN
        UPDATE public.payment_intents SET status = 'reconciliation_required', reconciliation_reason = 'PARENT_PACK_INVALID_DURATION', updated_at = clock_timestamp() WHERE id = p_intent_id;
        UPDATE public.webhook_events SET status = 'reconciliation_required', error_code = 'PARENT_PACK_INVALID_DURATION', processed_at = clock_timestamp() WHERE id = v_event_id;
        RETURN jsonb_build_object('status', 'reconciliation_required', 'error_code', 'PARENT_PACK_INVALID_DURATION');
    END IF;

    v_pricing_id := (v_intent.metadata->>'pricing_id')::uuid;
    v_duration_months := (v_intent.metadata->>'duration_months')::integer;

    IF v_duration_months <= 0 THEN
        UPDATE public.payment_intents SET status = 'reconciliation_required', reconciliation_reason = 'PARENT_PACK_INVALID_DURATION', updated_at = clock_timestamp() WHERE id = p_intent_id;
        UPDATE public.webhook_events SET status = 'reconciliation_required', error_code = 'PARENT_PACK_INVALID_DURATION', processed_at = clock_timestamp() WHERE id = v_event_id;
        RETURN jsonb_build_object('status', 'reconciliation_required', 'error_code', 'PARENT_PACK_INVALID_DURATION');
    END IF;

    -- Calculate Dates avec préservation de la date anniversaire d'ancrage
    SELECT max(end_date) INTO v_max_end_date
      FROM public.parent_subscription_periods
     WHERE subscription_id = v_subscription.id
       AND status IN ('active', 'expired');

    IF v_max_end_date IS NOT NULL AND (v_max_end_date + INTERVAL '1 day')::date >= p_certified_payment_at::date THEN
        -- Renouvellement continu sans interruption de couverture
        v_start_date := (v_max_end_date + INTERVAL '1 day')::date;

        IF v_subscription.billing_anchor_date IS NOT NULL THEN
            v_anchor_date := v_subscription.billing_anchor_date;
            v_cumulative_months := COALESCE(v_subscription.cumulative_months, 0) + v_duration_months;
        ELSE
            -- Rétrocompatibilité données historiques : identifier le début de la chaîne continue
            WITH RECURSIVE chain AS (
                SELECT p.start_date, p.end_date,
                       COALESCE((pi.metadata->>'duration_months')::integer, 1) AS duration_months
                  FROM public.parent_subscription_periods p
                  LEFT JOIN public.payment_intents pi ON pi.id = p.payment_intent_id
                 WHERE p.subscription_id = v_subscription.id
                   AND p.status IN ('active', 'expired')
                   AND p.end_date = v_max_end_date
                UNION ALL
                SELECT p.start_date, p.end_date,
                       COALESCE((pi.metadata->>'duration_months')::integer, 1) AS duration_months
                  FROM public.parent_subscription_periods p
                  JOIN chain c ON p.end_date + INTERVAL '1 day' = c.start_date
                  LEFT JOIN public.payment_intents pi ON pi.id = p.payment_intent_id
                 WHERE p.subscription_id = v_subscription.id
                   AND p.status IN ('active', 'expired')
            )
            SELECT MIN(start_date), COALESCE(SUM(duration_months), 1)
              INTO v_anchor_date, v_cumulative_months
              FROM chain;

            v_anchor_date := COALESCE(v_anchor_date, v_start_date);
            v_cumulative_months := COALESCE(v_cumulative_months, 0) + v_duration_months;
        END IF;
    ELSE
        -- Première souscription ou nouvel ancrage après interruption réelle de couverture
        v_start_date := p_certified_payment_at::date;
        v_anchor_date := v_start_date;
        v_cumulative_months := v_duration_months;
    END IF;

    v_end_date := (v_anchor_date + make_interval(months => v_cumulative_months) - INTERVAL '1 day')::date;

    -- Commission logic uses intent school_slug!
    SELECT * INTO v_school FROM public.schools WHERE slug = v_intent.school_slug FOR UPDATE;

    IF NOT FOUND THEN
        UPDATE public.payment_intents SET status = 'reconciliation_required', reconciliation_reason = 'PARENT_PACK_SCHOOL_NOT_FOUND', updated_at = clock_timestamp() WHERE id = p_intent_id;
        UPDATE public.webhook_events SET status = 'reconciliation_required', error_code = 'PARENT_PACK_SCHOOL_NOT_FOUND', processed_at = clock_timestamp() WHERE id = v_event_id;
        RETURN jsonb_build_object('status', 'reconciliation_required', 'error_code', 'PARENT_PACK_SCHOOL_NOT_FOUND');
    END IF;

    SELECT * INTO v_currency_cfg
      FROM public.currency_configurations
     WHERE code = 'XOF'
       AND is_active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Currency XOF not supported or inactive';
    END IF;

    v_gross_amount_minor := p_remote_amount;
    v_fedapay_fee_minor := p_fedapay_fee;

    v_school_share_minor := FLOOR(v_gross_amount_minor * v_school.commission_rate_percentage / 100)::BIGINT;
    v_amount_after_fee_and_school_minor := v_gross_amount_minor - v_fedapay_fee_minor - v_school_share_minor;

    IF v_amount_after_fee_and_school_minor < 0 THEN
        UPDATE public.payment_intents SET status = 'reconciliation_required', reconciliation_reason = 'PARENT_PACK_FEE_EXCEEDS_REMAINING_AMOUNT', updated_at = clock_timestamp() WHERE id = p_intent_id;
        UPDATE public.webhook_events SET status = 'reconciliation_required', error_code = 'PARENT_PACK_FEE_EXCEEDS_REMAINING_AMOUNT', processed_at = clock_timestamp() WHERE id = v_event_id;
        RETURN jsonb_build_object('status', 'reconciliation_required', 'error_code', 'PARENT_PACK_FEE_EXCEEDS_REMAINING_AMOUNT');
    END IF;

    IF v_school.affiliate_id IS NOT NULL THEN
        SELECT * INTO v_affiliate FROM public.affiliates WHERE id = v_school.affiliate_id AND status = 'active' FOR UPDATE;
        IF FOUND THEN
            v_has_active_affiliate := true;
            v_ambassador_share_minor := FLOOR(v_amount_after_fee_and_school_minor::NUMERIC * 10 / 100)::BIGINT;
        END IF;
    END IF;

    v_yziow_share_minor := v_gross_amount_minor - v_fedapay_fee_minor - v_school_share_minor - v_ambassador_share_minor;

    IF v_yziow_share_minor < 0 OR v_gross_amount_minor <> v_fedapay_fee_minor + v_school_share_minor + v_ambassador_share_minor + v_yziow_share_minor THEN
        RAISE EXCEPTION 'PARENT_PACK_ALLOCATION_INVARIANT_BROKEN';
    END IF;

    -- Insert Period UNIQUEMENT après validation complète de toutes les règles métier et financières
    INSERT INTO public.parent_subscription_periods (
        subscription_id, payment_intent_id, start_date, end_date, status
    ) VALUES (
        v_subscription.id, p_intent_id, v_start_date, v_end_date, 'active'
    ) RETURNING id INTO v_period_id;

    INSERT INTO public.school_commission_ledger (
        period_id, school_slug, ambassador_ref, gross_amount_minor, fedapay_fee_minor, school_share_minor, ambassador_share_minor, yziow_share_minor, currency, type
    ) VALUES (
        v_period_id, v_intent.school_slug,
        CASE WHEN v_has_active_affiliate THEN v_affiliate.id::text ELSE NULL END,
        v_gross_amount_minor, v_fedapay_fee_minor, v_school_share_minor, v_ambassador_share_minor, v_yziow_share_minor, 'XOF', 'credit'
    ) RETURNING id INTO v_school_ledger_id;

    IF v_has_active_affiliate AND v_ambassador_share_minor > 0 THEN
        v_maturation_at := p_certified_payment_at + (v_currency_cfg.cooling_off_days || ' days')::interval;
        INSERT INTO public.affiliate_ledger (
            affiliate_id, currency, entry_type, amount_minor, payment_intent_id, maturation_at, metadata
        ) VALUES (
            v_affiliate.id, 'XOF', 'commission', v_ambassador_share_minor, p_intent_id, v_maturation_at,
            jsonb_build_object(
                'source', 'parent_pack', 'school_commission_ledger_id', v_school_ledger_id, 'gross_amount_minor', v_gross_amount_minor, 'fedapay_fee_minor', v_fedapay_fee_minor, 'school_share_minor', v_school_share_minor, 'ambassador_share_minor', v_ambassador_share_minor, 'yziow_share_minor', v_yziow_share_minor, 'provider_event_id', p_provider_event_id, 'certified_payment_at', p_certified_payment_at
            )
        ) RETURNING id INTO v_affiliate_ledger_id;

        INSERT INTO public.affiliate_balances (
            affiliate_id, currency, pending_balance_minor, available_balance_minor, reserved_balance_minor, debt_balance_minor, updated_at
        ) VALUES (
            v_affiliate.id, 'XOF', v_ambassador_share_minor, 0, 0, 0, clock_timestamp()
        )
        ON CONFLICT (affiliate_id, currency) DO UPDATE
           SET pending_balance_minor = public.affiliate_balances.pending_balance_minor + EXCLUDED.pending_balance_minor, updated_at = clock_timestamp();
    END IF;

    -- Mise à jour atomique de la souscription avec le contexte certifié
    UPDATE public.parent_subscriptions
       SET status = 'active',
           billing_anchor_date = v_anchor_date,
           cumulative_months = v_cumulative_months,
           school_slug = v_intent.school_slug,
           student_ref = COALESCE(v_intent.metadata->>'student_ref', student_ref),
           pricing_id = v_pricing_id,
           updated_at = clock_timestamp()
     WHERE id = v_subscription.id;

    UPDATE public.payment_intents SET status = 'completed', provider_transaction_id = p_provider_transaction_id, processed_at = p_certified_payment_at, updated_at = clock_timestamp() WHERE id = p_intent_id;
    UPDATE public.webhook_events SET status = 'processed', processed_at = clock_timestamp() WHERE id = v_event_id;

    RETURN jsonb_build_object('status', 'completed', 'payment_type', 'parent_pack', 'subscription_id', v_subscription.id, 'period_id', v_period_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_parent_pack_webhook_event(VARCHAR, VARCHAR, VARCHAR, UUID, TEXT, NUMERIC, TEXT, TEXT, TIMESTAMPTZ, NUMERIC, NUMERIC, BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_parent_pack_webhook_event(VARCHAR, VARCHAR, VARCHAR, UUID, TEXT, NUMERIC, TEXT, TEXT, TIMESTAMPTZ, NUMERIC, NUMERIC, BOOLEAN) FROM anon;
REVOKE EXECUTE ON FUNCTION public.process_parent_pack_webhook_event(VARCHAR, VARCHAR, VARCHAR, UUID, TEXT, NUMERIC, TEXT, TEXT, TIMESTAMPTZ, NUMERIC, NUMERIC, BOOLEAN) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.process_parent_pack_webhook_event(VARCHAR, VARCHAR, VARCHAR, UUID, TEXT, NUMERIC, TEXT, TEXT, TIMESTAMPTZ, NUMERIC, NUMERIC, BOOLEAN) TO service_role;

-- 3. Audit et déploiement STRICTEMENT FAIL-CLOSED de l'index unique étendu sur target_id
DO $$
DECLARE
    v_dupes_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_dupes_count
      FROM (
          SELECT target_id
            FROM public.payment_intents
           WHERE payment_type = 'parent_pack'
             AND status IN ('initializing', 'pending', 'reconciliation_required')
           GROUP BY target_id
          HAVING COUNT(*) > 1
      ) d;

    IF v_dupes_count > 0 THEN
        RAISE EXCEPTION 'FAIL CLOSED MIGRATION P27: Impossible d installer l index unique uq_active_parent_pack_intent car % groupe(s) de doublons historiques ont ete detectes sur les intentions non resolues (target_id). Executer d abord backend/scripts/preflight_p27_reconciliation_audit.sql pour auditer et resoudre ces doublons avant de rejouer la migration.', v_dupes_count
            USING ERRCODE = '23505';
    END IF;

    DROP INDEX IF EXISTS public.uq_active_parent_pack_intent;
    CREATE UNIQUE INDEX uq_active_parent_pack_intent
        ON public.payment_intents (target_id)
        WHERE payment_type = 'parent_pack'
          AND status IN ('initializing', 'pending', 'reconciliation_required');

    RAISE NOTICE 'Index unique partiel uq_active_parent_pack_intent etendu avec succes sur target_id.';
END $$;

COMMIT;
