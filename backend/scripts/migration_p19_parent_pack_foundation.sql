-- Migration P19: Foundation du Pack Parent (Lot 1)
-- Description: Modèle de données idempotent pour le Pack Parent sans logique d'abonnement actif ni webhook.

BEGIN;

-- 1. Compatibilité payment_intents
ALTER TABLE public.payment_intents DROP CONSTRAINT chk_payment_intents_payment_type;
ALTER TABLE public.payment_intents ADD CONSTRAINT chk_payment_intents_payment_type
    CHECK (payment_type IN ('saas_subscription', 'donation', 'tuition', 'parent_pack'));

-- 2. Catalogue tarifaire Pack Parent
CREATE TABLE IF NOT EXISTS public.parent_pack_pricing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pricing_version INTEGER NOT NULL DEFAULT 1 CHECK (pricing_version > 0),
    effective_from TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    effective_until TIMESTAMP WITH TIME ZONE,
    cycle_name TEXT NOT NULL CHECK (cycle_name IN ('maternelle_primaire', 'college_secondaire', 'superieur_formation')),
    monthly_price_minor BIGINT NOT NULL CHECK (monthly_price_minor > 0),
    annual_price_minor BIGINT NOT NULL CHECK (annual_price_minor > 0),
    annual_duration_months INTEGER NOT NULL DEFAULT 10 CHECK (annual_duration_months = 10),
    currency TEXT NOT NULL DEFAULT 'XOF' CHECK (currency = 'XOF'),
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CHECK (effective_until IS NULL OR effective_until > effective_from),
    UNIQUE (cycle_name, currency, pricing_version)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_parent_pack_pricing ON public.parent_pack_pricing (cycle_name, currency) WHERE active = true;

INSERT INTO public.parent_pack_pricing (pricing_version, cycle_name, monthly_price_minor, annual_price_minor, currency, active)
VALUES
    (1, 'maternelle_primaire', 100, 1000, 'XOF', true),
    (1, 'college_secondaire', 150, 1500, 'XOF', true),
    (1, 'superieur_formation', 200, 2000, 'XOF', true)
ON CONFLICT (cycle_name, currency, pricing_version) DO NOTHING;

-- 3. Invitations Parent
CREATE TABLE IF NOT EXISTS public.parent_pack_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_slug TEXT NOT NULL,
    student_ref TEXT NOT NULL,
    parent_ref TEXT NOT NULL,
    invited_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    registration_deadline_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '7 days'),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_parent_pack_invitations ON public.parent_pack_invitations (school_slug, student_ref, parent_ref) WHERE status = 'pending';

-- 4. Abonnements et périodes Pack Parent
CREATE TABLE IF NOT EXISTS public.parent_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_slug TEXT NOT NULL,
    student_ref TEXT NOT NULL,
    parent_ref TEXT NOT NULL,
    pricing_id UUID NOT NULL REFERENCES public.parent_pack_pricing(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('inactive', 'active', 'expired', 'canceled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.parent_subscription_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES public.parent_subscriptions(id) ON DELETE RESTRICT,
    payment_intent_id UUID NOT NULL REFERENCES public.payment_intents(id) ON DELETE RESTRICT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending_payment' CHECK (status IN ('pending_payment', 'active', 'expired', 'refunded', 'canceled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CHECK (end_date >= start_date),
    UNIQUE (payment_intent_id)
);

CREATE OR REPLACE FUNCTION public.parent_pack_validate_period_payment_intent()
RETURNS TRIGGER AS $$
DECLARE
    pi_type TEXT;
BEGIN
    SELECT payment_type INTO pi_type FROM public.payment_intents WHERE id = NEW.payment_intent_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'L intention de paiement n existe pas.';
    END IF;
    IF pi_type IS DISTINCT FROM 'parent_pack' THEN
        RAISE EXCEPTION 'Une periode de souscription Pack Parent doit utiliser une intention de type parent_pack (trouve: %)', pi_type;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_period_payment_intent ON public.parent_subscription_periods;
CREATE TRIGGER trg_validate_period_payment_intent
BEFORE INSERT OR UPDATE OF payment_intent_id ON public.parent_subscription_periods
FOR EACH ROW EXECUTE FUNCTION public.parent_pack_validate_period_payment_intent();

-- 5. CREATION DES TABLES DANS LE BON ORDRE
CREATE TABLE IF NOT EXISTS public.school_commission_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_id UUID NOT NULL REFERENCES public.parent_subscription_periods(id) ON DELETE RESTRICT,
    school_slug TEXT NOT NULL,
    ambassador_ref TEXT,
    gross_amount_minor BIGINT NOT NULL,
    fedapay_fee_minor BIGINT NOT NULL,
    school_share_minor BIGINT NOT NULL,
    ambassador_share_minor BIGINT NOT NULL,
    yziow_share_minor BIGINT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'XOF' CHECK (currency = 'XOF'),
    type TEXT NOT NULL DEFAULT 'credit' CHECK (type IN ('credit', 'cancellation')),
    original_ledger_id UUID REFERENCES public.school_commission_ledger(id) ON DELETE RESTRICT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CHECK (gross_amount_minor = fedapay_fee_minor + school_share_minor + ambassador_share_minor + yziow_share_minor),
    CHECK ((ambassador_ref IS NULL AND ambassador_share_minor = 0) OR (ambassador_ref IS NOT NULL)),
    CHECK ((type = 'cancellation' AND original_ledger_id IS NOT NULL) OR (type = 'credit' AND original_ledger_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_commission_ledger_credit ON public.school_commission_ledger (period_id) WHERE type = 'credit';
CREATE UNIQUE INDEX IF NOT EXISTS uq_commission_ledger_cancellation ON public.school_commission_ledger (original_ledger_id) WHERE type = 'cancellation';

CREATE TABLE IF NOT EXISTS public.school_payout_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_slug TEXT NOT NULL,
    channel_type TEXT NOT NULL CHECK (channel_type IN ('momo', 'bank_transfer')),
    channel_details JSONB NOT NULL,
    verified BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.school_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_slug TEXT NOT NULL,
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    currency TEXT NOT NULL DEFAULT 'XOF' CHECK (currency = 'XOF'),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'sending', 'sent', 'canceled')),
    channel_id UUID REFERENCES public.school_payout_channels(id) ON DELETE RESTRICT,
    reference TEXT UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.school_payout_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payout_id UUID NOT NULL REFERENCES public.school_payouts(id) ON DELETE RESTRICT,
    ledger_id UUID NOT NULL REFERENCES public.school_commission_ledger(id) ON DELETE RESTRICT,
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE (ledger_id)
);

CREATE TABLE IF NOT EXISTS public.school_payout_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payout_id UUID NOT NULL REFERENCES public.school_payouts(id) ON DELETE RESTRICT,
    old_status TEXT,
    new_status TEXT NOT NULL,
    actor_ref TEXT NOT NULL DEFAULT current_user,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 6. FONCTIONS ET TRIGGERS APRES CREATION DES TABLES

CREATE OR REPLACE FUNCTION parent_pack_validate_cancellation()
RETURNS TRIGGER AS $$
DECLARE
    orig RECORD;
BEGIN
    IF NEW.type = 'cancellation' THEN
        SELECT * INTO orig FROM public.school_commission_ledger WHERE id = NEW.original_ledger_id AND type = 'credit' FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Une annulation doit cibler un ledger de type credit existant.';
        END IF;

        IF EXISTS (SELECT 1 FROM public.school_payout_items WHERE ledger_id = NEW.original_ledger_id) THEN
            RAISE EXCEPTION 'Impossible d annuler un credit deja reserve dans un reversement.';
        END IF;

        IF NEW.period_id != orig.period_id OR NEW.school_slug != orig.school_slug OR NEW.currency != orig.currency THEN
            RAISE EXCEPTION 'Les references (period_id, school_slug, currency) doivent correspondre exactement.';
        END IF;
        IF (NEW.ambassador_ref IS NULL AND orig.ambassador_ref IS NOT NULL) OR (NEW.ambassador_ref IS NOT NULL AND orig.ambassador_ref IS NULL) OR (NEW.ambassador_ref != orig.ambassador_ref) THEN
            RAISE EXCEPTION 'Les references ambassador_ref doivent correspondre.';
        END IF;

        IF NEW.gross_amount_minor != -orig.gross_amount_minor OR
           NEW.fedapay_fee_minor != -orig.fedapay_fee_minor OR
           NEW.school_share_minor != -orig.school_share_minor OR
           NEW.ambassador_share_minor != -orig.ambassador_share_minor OR
           NEW.yziow_share_minor != -orig.yziow_share_minor THEN
            RAISE EXCEPTION 'Les montants d une annulation doivent etre l exact oppose des montants du credit d origine.';
        END IF;
    ELSIF NEW.type = 'credit' THEN
        IF NEW.gross_amount_minor <= 0 OR NEW.fedapay_fee_minor < 0 OR NEW.school_share_minor < 0 OR NEW.ambassador_share_minor < 0 OR NEW.yziow_share_minor < 0 THEN
            RAISE EXCEPTION 'Les montants d un credit doivent etre positifs ou nuls. (gross > 0)';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_cancellation ON public.school_commission_ledger;
CREATE TRIGGER trg_validate_cancellation
BEFORE INSERT ON public.school_commission_ledger
FOR EACH ROW EXECUTE FUNCTION parent_pack_validate_cancellation();


CREATE OR REPLACE FUNCTION public.parent_pack_validate_payout_status_transition()
RETURNS TRIGGER AS $$
DECLARE
    sum_items BIGINT;
BEGIN
    SELECT COALESCE(SUM(amount_minor), 0) INTO sum_items FROM public.school_payout_items WHERE payout_id = NEW.id;

    IF NEW.status IN ('sending', 'sent') THEN
        IF sum_items = 0 THEN
            RAISE EXCEPTION 'Un reversement ne peut pas etre envoye s il ne contient aucun item.';
        END IF;
        IF sum_items != NEW.amount_minor THEN
            RAISE EXCEPTION 'Le montant total du reversement ne correspond pas a la somme de ses items.';
        END IF;
    END IF;

    IF NEW.status = 'canceled' THEN
        IF sum_items > 0 THEN
            RAISE EXCEPTION 'Impossible d annuler un reversement qui contient deja des items (ledger).';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_payout_status_transition ON public.school_payouts;
CREATE TRIGGER trg_validate_payout_status_transition
BEFORE UPDATE OF status ON public.school_payouts
FOR EACH ROW EXECUTE FUNCTION public.parent_pack_validate_payout_status_transition();


CREATE OR REPLACE FUNCTION parent_pack_validate_payout_item()
RETURNS TRIGGER AS $$
DECLARE
    ledg RECORD;
    pay RECORD;
    sum_items BIGINT;
BEGIN
    SELECT * INTO ledg FROM public.school_commission_ledger WHERE id = NEW.ledger_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ledger introuvable.';
    END IF;
    IF ledg.type = 'cancellation' THEN
        RAISE EXCEPTION 'Un reversement ne peut pas referencer une annulation.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.school_commission_ledger WHERE original_ledger_id = ledg.id AND type = 'cancellation') THEN
        RAISE EXCEPTION 'Un credit annule ne peut pas etre ajoute a un reversement.';
    END IF;

    SELECT * INTO pay FROM public.school_payouts WHERE id = NEW.payout_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Reversement cible introuvable.';
    END IF;

    IF pay.status NOT IN ('draft', 'approved') THEN
        RAISE EXCEPTION 'Impossible d ajouter des items a un reversement dont le statut n est pas draft ou approved.';
    END IF;

    IF pay.school_slug != ledg.school_slug THEN
        RAISE EXCEPTION 'Le reversement doit correspondre au meme etablissement que le ledger.';
    END IF;

    IF NEW.amount_minor > ledg.school_share_minor THEN
        RAISE EXCEPTION 'Le montant reverse ne peut pas exceder la part etablissement du ledger.';
    END IF;

    SELECT COALESCE(SUM(amount_minor), 0) INTO sum_items FROM public.school_payout_items WHERE payout_id = NEW.payout_id;
    IF sum_items + NEW.amount_minor > pay.amount_minor THEN
        RAISE EXCEPTION 'Le total des items depasse le montant total prevu pour ce reversement.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_payout_item ON public.school_payout_items;
CREATE TRIGGER trg_validate_payout_item
BEFORE INSERT ON public.school_payout_items
FOR EACH ROW EXECUTE FUNCTION parent_pack_validate_payout_item();


CREATE OR REPLACE FUNCTION parent_pack_log_payout_creation()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.school_payout_events (payout_id, new_status)
    VALUES (NEW.id, NEW.status);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_log_payout_creation ON public.school_payouts;
CREATE TRIGGER trg_log_payout_creation
AFTER INSERT ON public.school_payouts
FOR EACH ROW EXECUTE FUNCTION parent_pack_log_payout_creation();


CREATE OR REPLACE FUNCTION parent_pack_log_payout_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO public.school_payout_events (payout_id, old_status, new_status)
        VALUES (NEW.id, OLD.status, NEW.status);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_log_payout_status_change ON public.school_payouts;
CREATE TRIGGER trg_log_payout_status_change
AFTER UPDATE OF status ON public.school_payouts
FOR EACH ROW EXECUTE FUNCTION parent_pack_log_payout_status_change();


CREATE OR REPLACE FUNCTION parent_pack_prevent_financial_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Modification ou suppression interdite sur les tables financieres append-only.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_immutable_ledger ON public.school_commission_ledger;
CREATE TRIGGER trg_immutable_ledger
BEFORE UPDATE OR DELETE ON public.school_commission_ledger
FOR EACH ROW EXECUTE FUNCTION parent_pack_prevent_financial_mutation();

DROP TRIGGER IF EXISTS trg_immutable_payout_items ON public.school_payout_items;
CREATE TRIGGER trg_immutable_payout_items
BEFORE UPDATE OR DELETE ON public.school_payout_items
FOR EACH ROW EXECUTE FUNCTION parent_pack_prevent_financial_mutation();

DROP TRIGGER IF EXISTS trg_immutable_payout_events ON public.school_payout_events;
CREATE TRIGGER trg_immutable_payout_events
BEFORE UPDATE OR DELETE ON public.school_payout_events
FOR EACH ROW EXECUTE FUNCTION parent_pack_prevent_financial_mutation();


-- 7. Sécurité (RLS et Service Role)
DO $$
DECLARE
    tbl text;
    policy_name text;
BEGIN
    FOR tbl IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN (
        'parent_pack_pricing', 'parent_pack_invitations', 'parent_subscriptions',
        'parent_subscription_periods', 'school_commission_ledger', 'school_payout_channels',
        'school_payouts', 'school_payout_items', 'school_payout_events'
    )
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

        EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', tbl);
        EXECUTE format('REVOKE ALL ON public.%I FROM anon', tbl);
        EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', tbl);

        IF tbl IN ('school_commission_ledger', 'school_payout_items', 'school_payout_events') THEN
            EXECUTE format('GRANT SELECT, INSERT ON public.%I TO service_role', tbl);
        ELSE
            EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO service_role', tbl);
        END IF;

        policy_name := tbl || '_service_role_policy';
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, tbl);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', policy_name, tbl);
    END LOOP;
END $$;

COMMIT;
