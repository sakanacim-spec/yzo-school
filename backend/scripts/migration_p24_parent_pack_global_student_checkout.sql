-- backend/scripts/migration_p24_parent_pack_global_student_checkout.sql
BEGIN;

-- 1. Create global_students
CREATE TABLE IF NOT EXISTS public.global_students (
    student_global_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Create student_global_mappings
CREATE TABLE IF NOT EXISTS public.student_global_mappings (
    mapping_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_slug TEXT NOT NULL,
    student_local_id TEXT NOT NULL,
    student_global_id UUID NOT NULL REFERENCES public.global_students(student_global_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (school_slug, student_local_id)
);

-- 3. Create parent_child_links
CREATE TABLE IF NOT EXISTS public.parent_child_links (
    parent_ref TEXT NOT NULL,
    student_global_id UUID NOT NULL REFERENCES public.global_students(student_global_id),
    first_linked_at TIMESTAMPTZ NULL,
    current_link_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (parent_ref, student_global_id)
);

-- 4. Alter parent_subscriptions
ALTER TABLE public.parent_subscriptions ADD COLUMN IF NOT EXISTS student_global_id UUID NULL;

-- 5. Backfill logic (Dynamic)
DO $$
DECLARE
    v_global_id UUID;
    v_table_name TEXT;
    v_school_slug TEXT;
    rec RECORD;
BEGIN
    FOR v_table_name IN
        SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'students_%'
    LOOP
        v_school_slug := substring(v_table_name from 10);
        EXECUTE format('
            DO $block$
            DECLARE
                s_rec RECORD;
                g_id UUID;
            BEGIN
                FOR s_rec IN SELECT id FROM public.%I LOOP
                    SELECT student_global_id INTO g_id FROM public.student_global_mappings WHERE school_slug = %L AND student_local_id = s_rec.id::text;
                    IF NOT FOUND THEN
                        g_id := gen_random_uuid();
                        INSERT INTO public.global_students (student_global_id) VALUES (g_id);
                        INSERT INTO public.student_global_mappings (school_slug, student_local_id, student_global_id) VALUES (%L, s_rec.id::text, g_id);
                    END IF;
                END LOOP;
            END $block$;
        ', v_table_name, v_school_slug, v_school_slug);
    END LOOP;

    FOR v_table_name IN
        SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'parent_student_%'
    LOOP
        v_school_slug := substring(v_table_name from 16);
        EXECUTE format('
            DO $block$
            DECLARE
                ps_rec RECORD;
                g_id UUID;
            BEGIN
                FOR ps_rec IN SELECT parent_id, student_id FROM public.%I LOOP
                    SELECT student_global_id INTO g_id FROM public.student_global_mappings WHERE school_slug = %L AND student_local_id = ps_rec.student_id::text;
                    IF g_id IS NOT NULL THEN
                        INSERT INTO public.parent_child_links (parent_ref, student_global_id, first_linked_at)
                        VALUES (ps_rec.parent_id::text, g_id, NULL)
                        ON CONFLICT (parent_ref, student_global_id) DO NOTHING;
                    END IF;
                END LOOP;
            END $block$;
        ', v_table_name, v_school_slug);
    END LOOP;

    FOR rec IN SELECT id, school_slug, student_ref FROM public.parent_subscriptions WHERE student_global_id IS NULL LOOP
        SELECT student_global_id INTO v_global_id FROM public.student_global_mappings WHERE school_slug = rec.school_slug AND student_local_id = rec.student_ref;
        IF v_global_id IS NOT NULL THEN
            UPDATE public.parent_subscriptions SET student_global_id = v_global_id WHERE id = rec.id;
        ELSE
            -- Si on ne trouve pas l'etudiant, c'est un etat corrompu, FAIL CLOSED
            RAISE EXCEPTION 'Missing mapping for subscription %', rec.id;
        END IF;
    END LOOP;

    IF EXISTS (SELECT 1 FROM public.parent_subscriptions WHERE student_global_id IS NULL) THEN
        RAISE EXCEPTION 'FAIL CLOSED: Some parent_subscriptions have student_global_id IS NULL';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_parent_subs_global_student') THEN
        ALTER TABLE public.parent_subscriptions ADD CONSTRAINT fk_parent_subs_global_student FOREIGN KEY (student_global_id) REFERENCES public.global_students(student_global_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_parent_subs_parent_global') THEN
        ALTER TABLE public.parent_subscriptions ADD CONSTRAINT uq_parent_subs_parent_global UNIQUE (parent_ref, student_global_id);
    END IF;
END $$;

-- 6. RPC for Checkout API
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
BEGIN
    SELECT * INTO v_pricing FROM public.parent_pack_pricing WHERE id = p_pricing_id AND active = true AND cycle_name = p_cycle_name;
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

    -- Concurrence Upsert (Mise à jour du contexte courant uniquement)
    INSERT INTO public.parent_subscriptions (parent_ref, student_global_id, school_slug, student_ref, pricing_id, status)
    VALUES (p_parent_ref, p_student_global_id, p_school_slug, p_student_local_id, p_pricing_id, 'inactive')
    ON CONFLICT (parent_ref, student_global_id) DO UPDATE
    SET updated_at = clock_timestamp(),
        school_slug = EXCLUDED.school_slug,
        student_ref = EXCLUDED.student_ref,
        pricing_id = EXCLUDED.pricing_id
    RETURNING id INTO v_subscription_id;

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

REVOKE EXECUTE ON FUNCTION public.prepare_parent_pack_checkout(text, uuid, text, text, uuid, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prepare_parent_pack_checkout(text, uuid, text, text, uuid, text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.prepare_parent_pack_checkout(text, uuid, text, text, uuid, text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_parent_pack_checkout(text, uuid, text, text, uuid, text, integer) TO service_role;

-- 7. Replace Webhook Event Processing
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

    -- Calculate Dates (paid-through : exclure pending_payment)
    SELECT max(end_date) INTO v_max_end_date FROM public.parent_subscription_periods WHERE subscription_id = v_subscription.id AND status IN ('active', 'expired');

    IF v_max_end_date IS NOT NULL AND v_max_end_date >= p_certified_payment_at::date THEN
        v_start_date := v_max_end_date + INTERVAL '1 day';
    ELSE
        v_start_date := p_certified_payment_at::date;
    END IF;

    v_end_date := (v_start_date + make_interval(months => v_duration_months) - INTERVAL '1 day')::date;

    -- Insert Period
    INSERT INTO public.parent_subscription_periods (
        subscription_id, payment_intent_id, start_date, end_date, status
    ) VALUES (
        v_subscription.id, p_intent_id, v_start_date, v_end_date, 'active'
    ) RETURNING id INTO v_period_id;

    -- Commission logic uses intent school_slug!
    SELECT * INTO v_school FROM public.schools WHERE slug = v_intent.school_slug FOR UPDATE;

    IF NOT FOUND THEN
        UPDATE public.payment_intents SET status = 'reconciliation_required', reconciliation_reason = 'PARENT_PACK_SCHOOL_NOT_FOUND', updated_at = clock_timestamp() WHERE id = p_intent_id;
        UPDATE public.webhook_events SET status = 'reconciliation_required', error_code = 'PARENT_PACK_SCHOOL_NOT_FOUND', processed_at = clock_timestamp() WHERE id = v_event_id;
        RETURN jsonb_build_object('status', 'reconciliation_required', 'error_code', 'PARENT_PACK_SCHOOL_NOT_FOUND');
    END IF;

    SELECT * INTO v_currency_cfg FROM public.currency_config WHERE currency_code = 'XOF';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Currency XOF not supported';
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

    UPDATE public.parent_subscriptions SET status = 'active', updated_at = clock_timestamp() WHERE id = v_subscription.id;
    UPDATE public.payment_intents SET status = 'completed', provider_transaction_id = p_provider_transaction_id, completed_at = p_certified_payment_at, updated_at = clock_timestamp() WHERE id = p_intent_id;
    UPDATE public.webhook_events SET status = 'processed', processed_at = clock_timestamp() WHERE id = v_event_id;

    RETURN jsonb_build_object('status', 'completed', 'payment_type', 'parent_pack', 'subscription_id', v_subscription.id, 'period_id', v_period_id);
END;
$$;

COMMIT;
