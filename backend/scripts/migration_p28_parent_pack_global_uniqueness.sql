/*
  Migration P28 – Enforce NOT NULL and global UNIQUE on parent_subscriptions.student_global_id
  and transactional serialization on prepare_parent_pack_checkout.
  This migration runs after P27 and does not modify any historic migrations.
*/
BEGIN;

-- 1. Ensure student_global_id is NOT NULL
ALTER TABLE public.parent_subscriptions
    ALTER COLUMN student_global_id SET NOT NULL;

-- 2. Ensure global UNIQUE constraint / index exists on student_global_id
CREATE UNIQUE INDEX IF NOT EXISTS uq_parent_subscriptions_global_unique
    ON public.parent_subscriptions (student_global_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.parent_subscriptions TO service_role;

-- 3. Replace prepare_parent_pack_checkout with concurrency-safe global student checkout
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
    v_student RECORD;
    v_existing_intent RECORD;
    v_max_end_date DATE;
BEGIN
    -- Strict Fail-Closed input validation
    IF p_student_global_id IS NULL THEN
        RAISE EXCEPTION 'FAIL CLOSED: student_global_id cannot be NULL';
    END IF;

    IF trim(p_parent_ref) IS NULL OR trim(p_parent_ref) = '' THEN
        RAISE EXCEPTION 'FAIL CLOSED: INVALID_PARENT_REF';
    END IF;

    -- Transactional serialization per student_global_id
    PERFORM pg_advisory_xact_lock(hashtext('parent_pack_checkout_' || p_student_global_id::text));

    -- Lock student record if exists
    SELECT * INTO v_student
      FROM public.global_students
     WHERE student_global_id = p_student_global_id
     FOR UPDATE;

    -- Verify active parent-child authorization link
    IF NOT EXISTS (
        SELECT 1 FROM public.parent_child_links
         WHERE parent_ref = p_parent_ref
           AND student_global_id = p_student_global_id
           AND current_link_active = true
    ) THEN
        RAISE EXCEPTION 'FAIL CLOSED: Parent % is not authorized for student %', p_parent_ref, p_student_global_id;
    END IF;

    -- Validate pricing
    SELECT * INTO v_pricing
      FROM public.parent_pack_pricing
     WHERE id = p_pricing_id
       AND active = true
       AND cycle_name = p_cycle_name;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'FAIL CLOSED: Pricing invalide, inactif ou cycle non correspondant.';
    END IF;

    -- Compute amount
    IF p_duration_months = 1 THEN
        v_amount_minor := v_pricing.monthly_price_minor;
    ELSIF p_duration_months = v_pricing.annual_duration_months THEN
        v_amount_minor := v_pricing.annual_price_minor;
    ELSE
        RAISE EXCEPTION 'FAIL CLOSED: Invalid duration_months %', p_duration_months;
    END IF;

    -- Atomic Upsert on global UNIQUE (student_global_id)
    INSERT INTO public.parent_subscriptions (
        parent_ref, student_global_id, school_slug, student_ref, pricing_id, status
    )
    VALUES (
        p_parent_ref, p_student_global_id, p_school_slug, p_student_local_id, p_pricing_id, 'inactive'
    )
    ON CONFLICT (student_global_id) DO UPDATE
    SET updated_at = clock_timestamp(),
        school_slug = CASE WHEN parent_subscriptions.status <> 'active' THEN EXCLUDED.school_slug ELSE parent_subscriptions.school_slug END,
        student_ref = EXCLUDED.student_ref,
        pricing_id = CASE WHEN parent_subscriptions.status <> 'active' THEN EXCLUDED.pricing_id ELSE parent_subscriptions.pricing_id END
    RETURNING id INTO v_subscription_id;

    -- Lock subscription row for defensive check
    PERFORM 1
       FROM public.parent_subscriptions
      WHERE id = v_subscription_id
        FOR UPDATE;

    -- Check for existing unresolved payment intents
    SELECT id, status INTO v_existing_intent
      FROM public.payment_intents
     WHERE payment_type = 'parent_pack'
       AND target_id = v_subscription_id::text
       AND status IN ('initializing', 'pending', 'reconciliation_required')
     ORDER BY created_at DESC
     LIMIT 1
       FOR UPDATE;

    IF v_existing_intent.status = 'reconciliation_required' THEN
        RAISE EXCEPTION 'FAIL CLOSED: RECONCILIATION_REQUIRED_PENDING';
    END IF;
    IF v_existing_intent.status IN ('initializing', 'pending') THEN
        RAISE EXCEPTION 'FAIL CLOSED: ACTIVE_INTENT_ALREADY_EXISTS';
    END IF;

    -- J-30 renewal validation strictly based on confirmed paid periods (status in ('active', 'expired'))
    SELECT max(end_date) INTO v_max_end_date
      FROM public.parent_subscription_periods
     WHERE subscription_id = v_subscription_id
       AND status IN ('active', 'expired');

    IF v_max_end_date IS NOT NULL AND now()::date < (v_max_end_date - INTERVAL '30 days')::date THEN
        RAISE EXCEPTION 'FAIL CLOSED: RENEWAL_TOO_EARLY (max_end_date: %)', v_max_end_date;
    END IF;

    -- Create payment intent with full payer traceability in metadata
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
            'student_ref', p_student_local_id,
            'parent_ref', p_parent_ref,
            'checkout_date', now(),
            'max_end_date', v_max_end_date,
            'j30_deadline', CASE WHEN v_max_end_date IS NOT NULL THEN (v_max_end_date - INTERVAL '30 days')::date ELSE NULL END
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

COMMIT;
