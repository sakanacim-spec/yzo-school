-- Pack Parent V1
-- Applied successfully to YZIOW Staging on 2026-09-30.
-- Requires explicit Production authorization before any Production execution.

BEGIN;

-- Preflight checks block
DO $$
BEGIN
    -- Verify public.schools table exists
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE relname = 'schools' AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')) THEN
        RAISE EXCEPTION 'public.schools table missing';
    END IF;

    -- Verify schools.slug column exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='schools' AND column_name='slug') THEN
        RAISE EXCEPTION 'schools.slug column missing';
    END IF;

    -- Verify schools.slug is UNIQUE
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.schools'::regclass AND contype = 'u' AND pg_get_constraintdef(oid) LIKE '%(slug)%') THEN
        RAISE EXCEPTION 'schools.slug is not uniquely constrained';
    END IF;

    -- Verify public.payment_intents table exists
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE relname = 'payment_intents' AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')) THEN
        RAISE EXCEPTION 'public.payment_intents table missing';
    END IF;

    -- Verify required columns in payment_intents
    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='payment_intents' AND column_name='id';
    IF NOT FOUND THEN RAISE EXCEPTION 'payment_intents.id column missing'; END IF;
    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='payment_intents' AND column_name='school_slug';
    IF NOT FOUND THEN RAISE EXCEPTION 'payment_intents.school_slug column missing'; END IF;
    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='payment_intents' AND column_name='payment_type';
    IF NOT FOUND THEN RAISE EXCEPTION 'payment_intents.payment_type column missing'; END IF;
    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='payment_intents' AND column_name='expected_amount';
    IF NOT FOUND THEN RAISE EXCEPTION 'payment_intents.expected_amount column missing'; END IF;
    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='payment_intents' AND column_name='expected_currency';
    IF NOT FOUND THEN RAISE EXCEPTION 'payment_intents.expected_currency column missing'; END IF;
    PERFORM 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='payment_intents' AND column_name='status';
    IF NOT FOUND THEN RAISE EXCEPTION 'payment_intents.status column missing'; END IF;

    -- Verify payment_type CHECK constraint contains required values
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
        WHERE c.conrelid = 'public.payment_intents'::regclass
          AND c.contype = 'c'
          AND a.attname = 'payment_type'
          AND pg_get_constraintdef(c.oid) LIKE '%donation%'
          AND pg_get_constraintdef(c.oid) LIKE '%tuition%'
          AND pg_get_constraintdef(c.oid) LIKE '%saas_subscription%'
    ) THEN
        RAISE EXCEPTION 'payment_intents.payment_type constraint does not contain required values';
    END IF;

    -- Ensure none of the new Pack Parent tables already exist
    PERFORM 1 FROM pg_catalog.pg_class WHERE relname IN (
        'parent_subscriptions','parent_subscription_periods','parent_exemptions',
        'school_commission_ledger','school_payout_channels','payout_channel_audits',
        'school_payouts','school_payout_items','school_payout_attempts'
    ) AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname='public');
    IF FOUND THEN
        RAISE EXCEPTION 'One or more Pack Parent tables already exist';
    END IF;

    -- Verify gen_random_uuid() is available
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='gen_random_uuid') THEN
        RAISE EXCEPTION 'gen_random_uuid() is not available';
    END IF;

    -- Verify Pack Parent functions do not exist
    PERFORM 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'pack_parent_v1_immutable_payout_channel_audits',
        'pack_parent_v1_validate_payout',
        'pack_parent_v1_update_payout_items_status',
        'pack_parent_v1_prevent_sent_status_change',
        'pack_parent_v1_verify_commission_school_slug',
        'pack_parent_v1_protect_school_payout_items',
        'pack_parent_v1_immutable_payout_attempts'
    );
    IF FOUND THEN
        RAISE EXCEPTION 'One or more Pack Parent functions already exist';
    END IF;
END $$;

-- Replace payment_type CHECK constraint (preserve existing name if possible)
DO $$
DECLARE
    cons_name text;
BEGIN
    SELECT conname INTO cons_name
    FROM pg_constraint
    WHERE conrelid = 'public.payment_intents'::regclass
      AND contype = 'c'
      AND conname = 'chk_payment_intents_payment_type';
    IF cons_name IS NULL THEN
        RAISE EXCEPTION 'Cannot find existing payment_type CHECK constraint';
    END IF;
    EXECUTE format('ALTER TABLE public.payment_intents DROP CONSTRAINT %I', cons_name);
    EXECUTE format('ALTER TABLE public.payment_intents ADD CONSTRAINT %I CHECK (payment_type IN (''donation'',''tuition'',''saas_subscription'',''parent_pack''))', cons_name);
END $$;

-- 1. La migration ajoute seulement `parent_pack` à la contrainte `payment_type`.
-- 2. Elle ne modifie ni `chk_payment_intents_plan_type` ni `chk_payment_intents_installment`.
-- 3. Pour toute intention de paiement ayant `payment_type = 'parent_pack'` :
--    - `plan_type` doit rester `NULL` ;
--    - `installment_number` doit rester `NULL`.
-- 4. La formule Pack Parent (`MONTHLY` ou `ANNUAL`) est stockée exclusivement dans
--    `parent_subscription_periods.plan_type`, jamais dans
--    `payment_intents.plan_type`.

-- Table: parent_subscriptions (container)
CREATE TABLE public.parent_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_slug TEXT NOT NULL REFERENCES public.schools(slug),
    student_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE (school_slug, student_id)
);
CREATE INDEX idx_parent_subscriptions_school_student ON public.parent_subscriptions (school_slug, student_id);

-- Table: parent_subscription_periods
CREATE TABLE public.parent_subscription_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_subscription_id UUID NOT NULL REFERENCES public.parent_subscriptions(id),
    payer_parent_id UUID NOT NULL,
    payment_intent_id UUID NOT NULL REFERENCES public.payment_intents(id),
    plan_type TEXT CHECK (plan_type IN ('MONTHLY','ANNUAL')) NOT NULL,
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    currency TEXT NOT NULL DEFAULT 'XOF' CHECK (currency = 'XOF'),
    status TEXT CHECK (status IN ('pending_payment','scheduled','active','grace','expired','canceled','refunded')) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    grace_end_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CHECK (end_date >= start_date),
    CHECK (grace_end_date IS NULL OR grace_end_date = end_date + 7)
);
CREATE INDEX idx_parent_subscription_periods_sub_id ON public.parent_subscription_periods (parent_subscription_id);
CREATE UNIQUE INDEX uq_parent_subscription_active_grace ON public.parent_subscription_periods (parent_subscription_id) WHERE status IN ('active','grace');

-- Table: parent_exemptions
CREATE TABLE public.parent_exemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_slug TEXT NOT NULL REFERENCES public.schools(slug),
    student_id UUID NOT NULL,
    valid_from DATE NOT NULL,
    valid_to DATE NOT NULL,
    reason TEXT,
    granted_by_user_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    revoked_by_user_id UUID,
    revoked_at TIMESTAMP WITH TIME ZONE,
    revocation_reason TEXT
);
CREATE INDEX idx_parent_exemptions_student ON public.parent_exemptions (student_id);

-- Table: school_commission_ledger
CREATE TABLE public.school_commission_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_slug TEXT NOT NULL REFERENCES public.schools(slug),
    period_id UUID NOT NULL REFERENCES public.parent_subscription_periods(id),
    month CHAR(7) NOT NULL, -- YYYY-MM
    currency TEXT NOT NULL DEFAULT 'XOF' CHECK (currency = 'XOF'),
    gross_amount BIGINT NOT NULL CHECK (gross_amount >= 0),
    provider_fees BIGINT NOT NULL CHECK (provider_fees >= 0),
    net_amount BIGINT NOT NULL CHECK (net_amount >= 0),
    commission_etablissement BIGINT NOT NULL CHECK (commission_etablissement >= 0),
    commission_ambassadeur BIGINT NOT NULL CHECK (commission_ambassadeur >= 0),
    status TEXT CHECK (status IN ('PENDING','POSTED','REVERSED')) NOT NULL,
    entry_kind TEXT CHECK (entry_kind IN ('accrual','reversal')) NOT NULL DEFAULT 'accrual',
    reverses_ledger_id UUID REFERENCES public.school_commission_ledger(id),
    source_reference TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
CREATE UNIQUE INDEX uq_school_commission_ledger_accrual ON public.school_commission_ledger (period_id, month) WHERE entry_kind = 'accrual';
CREATE INDEX idx_school_commission_ledger_school_month ON public.school_commission_ledger (school_slug, month);

-- Table: school_payout_channels
CREATE TABLE public.school_payout_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_slug TEXT NOT NULL REFERENCES public.schools(slug),
    channel_type TEXT NOT NULL,
    destination_encrypted TEXT NOT NULL,
    destination_masked TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    verified_by_user_id UUID,
    verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
CREATE UNIQUE INDEX uq_school_payout_channels_active ON public.school_payout_channels (school_slug) WHERE is_active = TRUE;
-- TODO BLOCKED: confirmer le mécanisme applicatif de chiffrement avant toute exécution ; aucune destination brute ne doit être stockée.

-- Table: payout_channel_audits
CREATE TABLE public.payout_channel_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES public.school_payout_channels(id),
    action TEXT NOT NULL, -- e.g., 'activate', 'verify', 'deactivate'
    old_value TEXT,
    new_value TEXT,
    changed_by_user_id UUID NOT NULL,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
-- Prevent UPDATE and DELETE on audit table
CREATE FUNCTION public.pack_parent_v1_immutable_payout_channel_audits()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'Cannot modify audit table';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pack_parent_v1_immutable_payout_channel_audits
BEFORE UPDATE OR DELETE ON public.payout_channel_audits
FOR EACH ROW EXECUTE FUNCTION public.pack_parent_v1_immutable_payout_channel_audits();

-- Table: school_payouts
CREATE TABLE public.school_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_slug TEXT NOT NULL REFERENCES public.schools(slug),
    payout_channel_id UUID NOT NULL REFERENCES public.school_payout_channels(id),
    month CHAR(7) NOT NULL,
    payout_amount BIGINT NOT NULL CHECK (payout_amount >= 2000),
    currency TEXT NOT NULL DEFAULT 'XOF' CHECK (currency = 'XOF'),
    status TEXT CHECK (status IN ('draft','approved','sending','sent','failed','canceled')) NOT NULL,
    provider_reference TEXT UNIQUE,
    approved_by_user_id UUID,
    approved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CHECK (
        (status NOT IN ('approved','sending','sent') OR (approved_by_user_id IS NOT NULL AND approved_at IS NOT NULL))
    )
);
CREATE INDEX idx_school_payouts_school_month ON public.school_payouts (school_slug, month);

-- Function to validate payout before status change
CREATE FUNCTION public.pack_parent_v1_validate_payout()
RETURNS trigger AS $$
DECLARE
    total_items BIGINT;
    channel_active BOOLEAN;
    channel_verified BOOLEAN;
BEGIN


    -- Sum of payout items that are reserved or already paid
    SELECT SUM(amount) INTO total_items
    FROM public.school_payout_items
    WHERE payout_id = NEW.id AND status IN ('reserved','paid');

    -- Verify channel status
    SELECT is_active, is_verified INTO channel_active, channel_verified
    FROM public.school_payout_channels
    WHERE id = NEW.payout_channel_id AND school_slug = NEW.school_slug;


    IF total_items IS NULL OR total_items < 2000 THEN
        RAISE EXCEPTION 'Total payout items amount (%) below minimum payout amount', total_items;
    END IF;
    IF NEW.payout_amount <> total_items THEN
        RAISE EXCEPTION 'Payout amount (%) does not match sum of payout items (%)', NEW.payout_amount, total_items;
    END IF;
    IF channel_active IS DISTINCT FROM TRUE
       OR channel_verified IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'Payout channel not active or not verified';
    END IF;
    -- Ensure approval information present before sending or sent
    IF NEW.status IN ('sending','sent') THEN
        IF NEW.approved_by_user_id IS NULL OR NEW.approved_at IS NULL THEN
            RAISE EXCEPTION 'Approved user and timestamp must be set before sending or sent';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pack_parent_v1_validate_payout
BEFORE UPDATE OF status ON public.school_payouts
FOR EACH ROW
WHEN (NEW.status IN ('approved','sending','sent'))
EXECUTE FUNCTION public.pack_parent_v1_validate_payout();

-- Function to update payout items status based on payout status changes
CREATE FUNCTION public.pack_parent_v1_update_payout_items_status()
RETURNS trigger AS $$
BEGIN
    IF NEW.status = 'sent' THEN
        UPDATE public.school_payout_items SET status = 'paid' WHERE payout_id = NEW.id AND status = 'reserved';
    ELSIF NEW.status = 'canceled' THEN
        UPDATE public.school_payout_items SET status = 'released' WHERE payout_id = NEW.id AND status = 'reserved';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pack_parent_v1_update_payout_items_status
AFTER UPDATE OF status ON public.school_payouts
FOR EACH ROW
WHEN (NEW.status IN ('sent','canceled'))
EXECUTE FUNCTION public.pack_parent_v1_update_payout_items_status();

-- Prevent any status change once payout has been sent
CREATE FUNCTION public.pack_parent_v1_prevent_sent_status_change()
RETURNS trigger AS $$
BEGIN
    IF OLD.status = 'sent' THEN
        RAISE EXCEPTION 'Cannot modify payout after it has been sent';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pack_parent_v1_prevent_sent_change
BEFORE UPDATE ON public.school_payouts
FOR EACH ROW EXECUTE FUNCTION public.pack_parent_v1_prevent_sent_status_change();

-- Table: school_payout_items
CREATE TABLE public.school_payout_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payout_id UUID NOT NULL REFERENCES public.school_payouts(id),
    commission_id UUID NOT NULL REFERENCES public.school_commission_ledger(id),
    amount BIGINT NOT NULL CHECK (amount > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    -- Removed UNIQUE to allow partial index on reserved/paid statuses,
    status TEXT CHECK (status IN ('reserved','released','paid')) NOT NULL DEFAULT 'reserved'
);

-- Ensure a commission cannot be paid twice
CREATE UNIQUE INDEX uq_school_payout_items_reserved_or_paid ON public.school_payout_items (commission_id) WHERE status IN ('reserved','paid');
CREATE FUNCTION public.pack_parent_v1_verify_commission_school_slug()
RETURNS trigger AS $$
DECLARE
    comm_school_slug TEXT;
    payout_school_slug TEXT;
    comm_entry_kind TEXT;
    comm_status TEXT;
    comm_amount BIGINT;
BEGIN
    SELECT school_slug, entry_kind, status, commission_etablissement
    INTO comm_school_slug, comm_entry_kind, comm_status, comm_amount
    FROM public.school_commission_ledger WHERE id = NEW.commission_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Commission does not exist';
    END IF;

    IF comm_entry_kind <> 'accrual' THEN
        RAISE EXCEPTION 'Commission entry_kind must be accrual';
    END IF;

    IF comm_status NOT IN ('POSTED') THEN
        RAISE EXCEPTION 'Commission status not payable';
    END IF;

    IF NEW.amount IS DISTINCT FROM comm_amount THEN
        RAISE EXCEPTION 'Commission amount mismatch: % vs %', NEW.amount, comm_amount;
    END IF;

    SELECT school_slug INTO payout_school_slug FROM public.school_payouts WHERE id = NEW.payout_id;
    IF comm_school_slug IS DISTINCT FROM payout_school_slug THEN
        RAISE EXCEPTION 'Commission school_slug does not match payout school_slug';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pack_parent_v1_verify_commission_school_slug
BEFORE INSERT OR UPDATE ON public.school_payout_items
FOR EACH ROW EXECUTE FUNCTION public.pack_parent_v1_verify_commission_school_slug();

-- Trigger to protect school_payout_items according to payout status
CREATE FUNCTION public.pack_parent_v1_protect_school_payout_items()
RETURNS trigger AS $$
DECLARE
    parent_status TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        SELECT status INTO parent_status FROM public.school_payouts WHERE id = NEW.payout_id;
        IF parent_status <> 'draft' THEN
            RAISE EXCEPTION 'Cannot insert payout item unless parent payout is draft';
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        SELECT status INTO parent_status FROM public.school_payouts WHERE id = OLD.payout_id;
        IF parent_status <> 'draft' THEN
            RAISE EXCEPTION 'Cannot delete payout item unless parent payout is draft';
        END IF;
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        SELECT status INTO parent_status FROM public.school_payouts WHERE id = NEW.payout_id;
        -- Prevent modifications of immutable fields when not draft
        IF parent_status <> 'draft' THEN
            IF NEW.amount IS DISTINCT FROM OLD.amount
               OR NEW.commission_id IS DISTINCT FROM OLD.commission_id
               OR NEW.payout_id IS DISTINCT FROM OLD.payout_id THEN
                RAISE EXCEPTION 'Cannot modify amount/commission_id/payout_id after payout is not draft';
            END IF;
        END IF;
        -- Enforce allowed status transitions
        IF NEW.status IS DISTINCT FROM OLD.status THEN
            IF OLD.status = 'reserved' AND NEW.status = 'paid' AND parent_status = 'sent' THEN
                -- allowed
                NULL;
            ELSIF OLD.status = 'reserved' AND NEW.status = 'released' AND parent_status = 'canceled' THEN
                -- allowed
                NULL;
            ELSE
                RAISE EXCEPTION 'Invalid status transition for payout item';
            END IF;
        END IF;
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pack_parent_v1_protect_school_payout_items
BEFORE INSERT OR UPDATE OR DELETE ON public.school_payout_items
FOR EACH ROW EXECUTE FUNCTION public.pack_parent_v1_protect_school_payout_items();

-- Table: school_payout_attempts
CREATE TABLE public.school_payout_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payout_id UUID NOT NULL REFERENCES public.school_payouts(id),
    attempt_timestamp TIMESTAMP WITH TIME ZONE DEFAULT now(),
    status TEXT CHECK (status IN ('STARTED','SUCCESS','ERROR')) NOT NULL,
    result_code TEXT,
    safe_response_summary TEXT
    -- No raw logs or sensitive data stored; only safe summary retained
);

-- Make school_payout_attempts immutable after insert (append‑only)
CREATE FUNCTION public.pack_parent_v1_immutable_payout_attempts()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'school_payout_attempts is immutable; only INSERT allowed';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pack_parent_v1_immutable_payout_attempts
BEFORE UPDATE OR DELETE ON public.school_payout_attempts
FOR EACH ROW EXECUTE FUNCTION public.pack_parent_v1_immutable_payout_attempts();


-- Enable RLS and grant minimal privileges for each new table
DO $$
DECLARE
    tbl text;
BEGIN
    FOR tbl IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN (
        'parent_subscriptions','parent_subscription_periods','parent_exemptions',
        'school_commission_ledger','school_payout_channels','payout_channel_audits',
        'school_payouts','school_payout_items','school_payout_attempts'
    )
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
        EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', tbl);
        EXECUTE format('REVOKE ALL ON public.%I FROM anon', tbl);
        EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', tbl);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role', tbl);
        EXECUTE format('CREATE POLICY %I_policy ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', tbl, tbl);
    END LOOP;
END $$;

COMMIT;

-- NOTE: This script is a draft and must be reviewed against the actual Staging schema before execution.
