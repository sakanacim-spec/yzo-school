-- Migration P21: Webhook transactionnel du Pack Parent (Lot 2)
--
-- Prérequis : P18, P19 et P20 déjà appliquées.
--
-- Ce lot ne modifie pas P18. Il conserve son implémentation sous un nom privé
-- et installe un répartiteur v2 qui traite exclusivement parent_pack ici.
-- Les autres types (donation, tuition, saas_subscription) continuent d'utiliser
-- exactement le comportement P18, y compris la revue manuelle du SaaS historique.

BEGIN;

-- La migration ne peut s'exécuter que sur le socle P19 complet.
DO $p21_preflight$
BEGIN
    IF to_regclass('public.parent_pack_pricing') IS NULL
       OR to_regclass('public.parent_subscriptions') IS NULL
       OR to_regclass('public.parent_subscription_periods') IS NULL
       OR to_regclass('public.school_commission_ledger') IS NULL THEN
        RAISE EXCEPTION 'P21 stopped: P19 Pack Parent foundation is required first.';
    END IF;

    IF to_regprocedure('public.process_fedapay_webhook_event_v2(character varying,character varying,character varying,uuid,text,numeric,text,text,timestamp with time zone,numeric,numeric,boolean)') IS NULL THEN
        RAISE EXCEPTION 'P21 stopped: P18 process_fedapay_webhook_event_v2 is required first.';
    END IF;
END
$p21_preflight$;

-- Une seule fois, préserver la logique P18 sous un nom privé. Le changement de
-- nom et le nouveau répartiteur sont dans la même transaction : aucun appel
-- externe ne peut observer une période sans fonction v2 publique.
DO $p21_preserve_p18$
DECLARE
    v_v2_oid oid;
    v_legacy_oid oid;
    v_v2_definition text;
BEGIN
    SELECT to_regprocedure('public.process_fedapay_webhook_event_v2(character varying,character varying,character varying,uuid,text,numeric,text,text,timestamp with time zone,numeric,numeric,boolean)')::oid
      INTO v_v2_oid;
    SELECT to_regprocedure('public.process_fedapay_webhook_event_v2_legacy(character varying,character varying,character varying,uuid,text,numeric,text,text,timestamp with time zone,numeric,numeric,boolean)')::oid
      INTO v_legacy_oid;

    IF v_legacy_oid IS NULL THEN
        EXECUTE 'ALTER FUNCTION public.process_fedapay_webhook_event_v2(character varying, character varying, character varying, uuid, text, numeric, text, text, timestamp with time zone, numeric, numeric, boolean) RENAME TO process_fedapay_webhook_event_v2_legacy';
        RETURN;
    END IF;

    SELECT pg_get_functiondef(v_v2_oid) INTO v_v2_definition;
    IF v_v2_definition NOT ILIKE '%process_fedapay_webhook_event_v2_legacy%' THEN
        RAISE EXCEPTION 'P21 stopped: v2 webhook is neither the P18 implementation nor the P21 dispatcher.';
    END IF;
END
$p21_preserve_p18$;

-- Empêche plusieurs initialisations actives pour la même souscription. Les
-- périodes déjà réglées restent possibles pour les renouvellements futurs.
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_parent_pack_intent
    ON public.payment_intents (school_slug, target_id)
    WHERE payment_type = 'parent_pack'
      AND status IN ('initializing', 'pending');

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
    v_period RECORD;
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
BEGIN
    -- Défense en profondeur : le contrôleur vérifie déjà ces éléments avant RPC.
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

        RETURN jsonb_build_object(
            'status', 'duplicate',
            'message', 'Webhook event already recorded',
            'existing_status', v_existing_event.status
        );
    END IF;

    SELECT * INTO v_intent
      FROM public.payment_intents
     WHERE id = p_intent_id
     FOR UPDATE;

    IF NOT FOUND THEN
        UPDATE public.webhook_events
           SET status = 'failed', error_code = 'INTENT_NOT_FOUND', processed_at = clock_timestamp()
         WHERE id = v_event_id;
        RETURN jsonb_build_object('status', 'error', 'error_code', 'INTENT_NOT_FOUND');
    END IF;

    IF v_intent.payment_type IS DISTINCT FROM 'parent_pack' THEN
        UPDATE public.webhook_events
           SET status = 'reconciliation_required', error_code = 'PARENT_PACK_INTENT_TYPE_MISMATCH', processed_at = clock_timestamp()
         WHERE id = v_event_id;
        RETURN jsonb_build_object('status', 'reconciliation_required', 'error_code', 'PARENT_PACK_INTENT_TYPE_MISMATCH');
    END IF;

    IF v_intent.currency IS DISTINCT FROM p_remote_currency
       OR v_intent.payable_amount IS DISTINCT FROM p_remote_amount THEN
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
        RETURN jsonb_build_object('status', 'duplicate', 'message', 'Payment intent already completed');
    END IF;

    IF v_intent.status NOT IN ('initializing', 'pending') THEN
        UPDATE public.webhook_events
           SET status = 'reconciliation_required', error_code = 'PARENT_PACK_INTENT_NOT_PAYABLE', processed_at = clock_timestamp()
         WHERE id = v_event_id;
        RETURN jsonb_build_object('status', 'reconciliation_required', 'error_code', 'PARENT_PACK_INTENT_NOT_PAYABLE');
    END IF;

    -- Une répartition financière ne peut être créée sans preuve FedaPay complète.
    IF p_is_nominal_event IS NOT TRUE
       OR p_provider_event_id LIKE 'uncertified_%'
       OR p_certified_payment_at IS NULL
       OR p_fedapay_fee IS NULL OR p_fedapay_fee < 0
       OR p_tax_amount IS NULL OR p_tax_amount < 0
    THEN
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

    SELECT p.*, s.id AS subscription_id, s.school_slug AS subscription_school_slug,
           s.pricing_id, s.status AS parent_subscription_state,
           pr.monthly_price_minor, pr.annual_price_minor, pr.annual_duration_months,
           pr.currency AS pricing_currency, pr.active AS pricing_active
      INTO v_period
      FROM public.parent_subscription_periods AS p
      JOIN public.parent_subscriptions AS s ON s.id = p.subscription_id
      JOIN public.parent_pack_pricing AS pr ON pr.id = s.pricing_id
     WHERE p.payment_intent_id = p_intent_id
     FOR UPDATE OF p, s;

    IF NOT FOUND THEN
        UPDATE public.payment_intents
           SET status = 'reconciliation_required',
               reconciliation_reason = 'PARENT_PACK_PERIOD_NOT_FOUND',
               updated_at = clock_timestamp()
         WHERE id = p_intent_id;
        UPDATE public.webhook_events
           SET status = 'reconciliation_required', error_code = 'PARENT_PACK_PERIOD_NOT_FOUND', processed_at = clock_timestamp()
         WHERE id = v_event_id;
        RETURN jsonb_build_object('status', 'reconciliation_required', 'error_code', 'PARENT_PACK_PERIOD_NOT_FOUND');
    END IF;

    -- target_id est la liaison immuable intention -> souscription créée au checkout.
    IF v_intent.target_id IS DISTINCT FROM v_period.subscription_id::text
       OR v_intent.school_slug IS DISTINCT FROM v_period.subscription_school_slug
       OR v_period.pricing_active IS NOT TRUE
       OR v_period.pricing_currency IS DISTINCT FROM 'XOF'
       OR v_period.status IS DISTINCT FROM 'pending_payment' THEN
        UPDATE public.payment_intents
           SET status = 'reconciliation_required',
               reconciliation_reason = 'PARENT_PACK_LINK_OR_STATUS_MISMATCH',
               updated_at = clock_timestamp()
         WHERE id = p_intent_id;
        UPDATE public.webhook_events
           SET status = 'reconciliation_required', error_code = 'PARENT_PACK_LINK_OR_STATUS_MISMATCH', processed_at = clock_timestamp()
         WHERE id = v_event_id;
        RETURN jsonb_build_object('status', 'reconciliation_required', 'error_code', 'PARENT_PACK_LINK_OR_STATUS_MISMATCH');
    END IF;

    -- Le montant est dérivé de la durée exacte de la période, jamais du client.
    IF v_period.end_date = (v_period.start_date + INTERVAL '1 month - 1 day')::date THEN
        v_expected_amount := v_period.monthly_price_minor;
    ELSIF v_period.end_date = (v_period.start_date + make_interval(months => v_period.annual_duration_months) - INTERVAL '1 day')::date THEN
        v_expected_amount := v_period.annual_price_minor;
    ELSE
        v_expected_amount := NULL;
    END IF;

    IF v_expected_amount IS NULL OR v_intent.payable_amount <> v_expected_amount THEN
        UPDATE public.payment_intents
           SET status = 'reconciliation_required',
               reconciliation_reason = 'PARENT_PACK_PRICING_OR_PERIOD_MISMATCH',
               updated_at = clock_timestamp()
         WHERE id = p_intent_id;
        UPDATE public.webhook_events
           SET status = 'reconciliation_required', error_code = 'PARENT_PACK_PRICING_OR_PERIOD_MISMATCH', processed_at = clock_timestamp()
         WHERE id = v_event_id;
        RETURN jsonb_build_object('status', 'reconciliation_required', 'error_code', 'PARENT_PACK_PRICING_OR_PERIOD_MISMATCH');
    END IF;

    -- Une nouvelle période ne doit pas chevaucher une couverture déjà active.
    IF EXISTS (
        SELECT 1
          FROM public.parent_subscription_periods AS other_period
         WHERE other_period.subscription_id = v_period.subscription_id
           AND other_period.id <> v_period.id
           AND other_period.status = 'active'
           AND daterange(other_period.start_date, other_period.end_date, '[]')
               && daterange(v_period.start_date, v_period.end_date, '[]')
    ) THEN
        UPDATE public.payment_intents
           SET status = 'reconciliation_required',
               reconciliation_reason = 'PARENT_PACK_ACTIVE_PERIOD_OVERLAP',
               updated_at = clock_timestamp()
         WHERE id = p_intent_id;
        UPDATE public.webhook_events
           SET status = 'reconciliation_required', error_code = 'PARENT_PACK_ACTIVE_PERIOD_OVERLAP', processed_at = clock_timestamp()
         WHERE id = v_event_id;
        RETURN jsonb_build_object('status', 'reconciliation_required', 'error_code', 'PARENT_PACK_ACTIVE_PERIOD_OVERLAP');
    END IF;

    SELECT * INTO v_school
      FROM public.schools
     WHERE slug = v_period.subscription_school_slug
     FOR UPDATE;

    IF NOT FOUND THEN
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

    SELECT * INTO v_currency_cfg
      FROM public.currency_configurations
     WHERE code = 'XOF'
       AND is_active = true;

    IF NOT FOUND THEN
        UPDATE public.payment_intents
           SET status = 'reconciliation_required',
               reconciliation_reason = 'PARENT_PACK_XOF_CONFIGURATION_MISSING',
               updated_at = clock_timestamp()
         WHERE id = p_intent_id;
        UPDATE public.webhook_events
           SET status = 'reconciliation_required', error_code = 'PARENT_PACK_XOF_CONFIGURATION_MISSING', processed_at = clock_timestamp()
         WHERE id = v_event_id;
        RETURN jsonb_build_object('status', 'reconciliation_required', 'error_code', 'PARENT_PACK_XOF_CONFIGURATION_MISSING');
    END IF;

    v_gross_amount_minor := ROUND(p_remote_amount)::BIGINT;
    -- Les frais FedaPay et taxes sont intégralement à la charge de YZIOW.
    v_fedapay_fee_minor := ROUND(p_fedapay_fee)::BIGINT + ROUND(p_tax_amount)::BIGINT;
    v_school_share_minor := FLOOR(v_gross_amount_minor::NUMERIC * 20 / 100)::BIGINT;
    v_amount_after_fee_and_school_minor := v_gross_amount_minor - v_fedapay_fee_minor - v_school_share_minor;

    IF v_amount_after_fee_and_school_minor < 0 THEN
        UPDATE public.payment_intents
           SET status = 'reconciliation_required',
               reconciliation_reason = 'PARENT_PACK_FEE_EXCEEDS_REMAINING_AMOUNT',
               updated_at = clock_timestamp()
         WHERE id = p_intent_id;
        UPDATE public.webhook_events
           SET status = 'reconciliation_required', error_code = 'PARENT_PACK_FEE_EXCEEDS_REMAINING_AMOUNT', processed_at = clock_timestamp()
         WHERE id = v_event_id;
        RETURN jsonb_build_object('status', 'reconciliation_required', 'error_code', 'PARENT_PACK_FEE_EXCEEDS_REMAINING_AMOUNT');
    END IF;

    -- Les 10 % ambassadeur s'appliquent seulement au solde après frais + école,
    -- et seulement pour un ambassadeur existant et actif.
    IF v_school.affiliate_id IS NOT NULL THEN
        SELECT * INTO v_affiliate
          FROM public.affiliates
         WHERE id = v_school.affiliate_id
           AND status = 'active'
         FOR UPDATE;

        IF FOUND THEN
            v_has_active_affiliate := true;
            v_ambassador_share_minor := FLOOR(v_amount_after_fee_and_school_minor::NUMERIC * 10 / 100)::BIGINT;
        END IF;
    END IF;

    v_yziow_share_minor := v_gross_amount_minor
        - v_fedapay_fee_minor
        - v_school_share_minor
        - v_ambassador_share_minor;

    IF v_yziow_share_minor < 0
       OR v_gross_amount_minor <> v_fedapay_fee_minor + v_school_share_minor + v_ambassador_share_minor + v_yziow_share_minor THEN
        RAISE EXCEPTION 'PARENT_PACK_ALLOCATION_INVARIANT_BROKEN';
    END IF;

    INSERT INTO public.school_commission_ledger (
        period_id, school_slug, ambassador_ref, gross_amount_minor,
        fedapay_fee_minor, school_share_minor, ambassador_share_minor,
        yziow_share_minor, currency, type
    ) VALUES (
        v_period.id, v_period.subscription_school_slug,
        CASE WHEN v_has_active_affiliate THEN v_affiliate.id::text ELSE NULL END,
        v_gross_amount_minor, v_fedapay_fee_minor, v_school_share_minor,
        v_ambassador_share_minor, v_yziow_share_minor, 'XOF', 'credit'
    )
    RETURNING id INTO v_school_ledger_id;

    IF v_has_active_affiliate AND v_ambassador_share_minor > 0 THEN
        v_maturation_at := p_certified_payment_at
            + (v_currency_cfg.cooling_off_days || ' days')::interval;

        INSERT INTO public.affiliate_ledger (
            affiliate_id, currency, entry_type, amount_minor, payment_intent_id,
            maturation_at, metadata
        ) VALUES (
            v_affiliate.id, 'XOF', 'commission', v_ambassador_share_minor,
            p_intent_id, v_maturation_at,
            jsonb_build_object(
                'source', 'parent_pack',
                'school_commission_ledger_id', v_school_ledger_id,
                'gross_amount_minor', v_gross_amount_minor,
                'fedapay_fee_minor', v_fedapay_fee_minor,
                'school_share_minor', v_school_share_minor,
                'ambassador_share_minor', v_ambassador_share_minor,
                'yziow_share_minor', v_yziow_share_minor,
                'provider_event_id', p_provider_event_id,
                'certified_payment_at', p_certified_payment_at
            )
        ) RETURNING id INTO v_affiliate_ledger_id;

        INSERT INTO public.affiliate_balances (
            affiliate_id, currency, pending_balance_minor, available_balance_minor,
            reserved_balance_minor, debt_balance_minor, updated_at
        ) VALUES (
            v_affiliate.id, 'XOF', v_ambassador_share_minor, 0, 0, 0,
            clock_timestamp()
        )
        ON CONFLICT (affiliate_id, currency) DO UPDATE
           SET pending_balance_minor = public.affiliate_balances.pending_balance_minor
               + EXCLUDED.pending_balance_minor,
               updated_at = clock_timestamp();
    END IF;

    UPDATE public.parent_subscription_periods
       SET status = 'active', updated_at = clock_timestamp()
     WHERE id = v_period.id;

    UPDATE public.parent_subscriptions
       SET status = 'active', updated_at = clock_timestamp()
     WHERE id = v_period.subscription_id;

    UPDATE public.payment_intents
       SET status = 'completed',
           provider_transaction_id = p_provider_transaction_id,
           completed_at = p_certified_payment_at,
           updated_at = clock_timestamp()
     WHERE id = p_intent_id;

    UPDATE public.webhook_events
       SET status = 'processed', processed_at = clock_timestamp()
     WHERE id = v_event_id;

    RETURN jsonb_build_object(
        'status', 'completed',
        'payment_type', 'parent_pack',
        'subscription_id', v_period.subscription_id,
        'period_id', v_period.id,
        'school_commission_ledger_id', v_school_ledger_id,
        'affiliate_ledger_id', v_affiliate_ledger_id,
        'gross_amount_minor', v_gross_amount_minor,
        'fedapay_fee_minor', v_fedapay_fee_minor,
        'school_share_minor', v_school_share_minor,
        'ambassador_share_minor', v_ambassador_share_minor,
        'yziow_share_minor', v_yziow_share_minor,
        'currency', 'XOF'
    );
END;
$$;

-- Le point d'entrée v2 reste inchangé pour le contrôleur Node. Seul parent_pack
-- est traité ici ; tout autre type est délégué au code P18 préservé.
CREATE OR REPLACE FUNCTION public.process_fedapay_webhook_event_v2(
    p_provider VARCHAR(32),
    p_provider_event_id VARCHAR(128),
    p_event_type VARCHAR(64),
    p_intent_id UUID,
    p_provider_transaction_id TEXT,
    p_remote_amount NUMERIC,
    p_remote_currency TEXT,
    p_remote_status TEXT,
    p_certified_payment_at TIMESTAMPTZ DEFAULT NULL,
    p_fedapay_fee NUMERIC DEFAULT NULL,
    p_tax_amount NUMERIC DEFAULT NULL,
    p_is_nominal_event BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_payment_type TEXT;
BEGIN
    SELECT payment_type INTO v_payment_type
      FROM public.payment_intents
     WHERE id = p_intent_id
     FOR UPDATE;

    IF v_payment_type = 'parent_pack' THEN
        RETURN public.process_parent_pack_webhook_event(
            p_provider, p_provider_event_id, p_event_type, p_intent_id,
            p_provider_transaction_id, p_remote_amount, p_remote_currency,
            p_remote_status, p_certified_payment_at, p_fedapay_fee,
            p_tax_amount, p_is_nominal_event
        );
    END IF;

    RETURN public.process_fedapay_webhook_event_v2_legacy(
        p_provider, p_provider_event_id, p_event_type, p_intent_id,
        p_provider_transaction_id, p_remote_amount, p_remote_currency,
        p_remote_status, p_certified_payment_at, p_fedapay_fee,
        p_tax_amount, p_is_nominal_event
    );
END;
$$;

-- Les nouvelles fonctions sont accessibles uniquement au rôle de service.
REVOKE ALL ON FUNCTION public.process_parent_pack_webhook_event(VARCHAR, VARCHAR, VARCHAR, UUID, TEXT, NUMERIC, TEXT, TEXT, TIMESTAMPTZ, NUMERIC, NUMERIC, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_fedapay_webhook_event_v2(VARCHAR, VARCHAR, VARCHAR, UUID, TEXT, NUMERIC, TEXT, TEXT, TIMESTAMPTZ, NUMERIC, NUMERIC, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_fedapay_webhook_event_v2_legacy(VARCHAR, VARCHAR, VARCHAR, UUID, TEXT, NUMERIC, TEXT, TEXT, TIMESTAMPTZ, NUMERIC, NUMERIC, BOOLEAN) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.process_parent_pack_webhook_event(VARCHAR, VARCHAR, VARCHAR, UUID, TEXT, NUMERIC, TEXT, TEXT, TIMESTAMPTZ, NUMERIC, NUMERIC, BOOLEAN) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.process_fedapay_webhook_event_v2(VARCHAR, VARCHAR, VARCHAR, UUID, TEXT, NUMERIC, TEXT, TEXT, TIMESTAMPTZ, NUMERIC, NUMERIC, BOOLEAN) TO service_role, postgres;

COMMIT;
