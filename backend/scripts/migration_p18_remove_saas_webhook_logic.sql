-- Migration p18: Réécriture RPC SaaS webhook vers file de revue
-- Règle métier : Aucun ancien événement saas_subscription ne doit modifier une école.
-- Il doit créer une entrée dans la file de revue manuelle et s'arrêter.

BEGIN;

-- 1. Réutilisation exacte du contrat P16 (Tables de revue manuelle)
CREATE TABLE IF NOT EXISTS public.legacy_saas_manual_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL,
    provider_event_ref TEXT NOT NULL,
    payment_intent_id UUID REFERENCES public.payment_intents(id) ON DELETE RESTRICT,
    school_slug TEXT,
    legacy_payment_type TEXT NOT NULL DEFAULT 'saas_subscription' CHECK (legacy_payment_type = 'saas_subscription'),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_review', 'resolved', 'dismissed')),
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    assigned_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    reviewer_internal_id TEXT,
    CONSTRAINT uq_legacy_saas_review_event UNIQUE (provider, provider_event_ref)
);

CREATE TABLE IF NOT EXISTS public.legacy_saas_manual_review_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id UUID NOT NULL REFERENCES public.legacy_saas_manual_reviews(id) ON DELETE RESTRICT,
    action_type TEXT NOT NULL CHECK (action_type IN ('assigned', 'resolved', 'dismissed', 'note_added')),
    action_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decider_internal_id TEXT NOT NULL,
    safe_note VARCHAR(1000) NOT NULL
);

-- 5. Triggers (Immutability and Payment Type Cross-Check)
CREATE OR REPLACE FUNCTION public.legacy_saas_v1_prevent_action_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Modification or deletion of legacy_saas_manual_review_actions is strictly forbidden.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_legacy_saas_v1_prevent_action_mod ON public.legacy_saas_manual_review_actions;
CREATE TRIGGER trg_legacy_saas_v1_prevent_action_mod
BEFORE UPDATE OR DELETE ON public.legacy_saas_manual_review_actions
FOR EACH ROW
EXECUTE FUNCTION public.legacy_saas_v1_prevent_action_modification();

CREATE OR REPLACE FUNCTION public.legacy_saas_v1_check_payment_type()
RETURNS TRIGGER AS $$
DECLARE
    intent_payment_type TEXT;
BEGIN
    IF NEW.payment_intent_id IS NOT NULL THEN
        SELECT payment_type INTO intent_payment_type
        FROM public.payment_intents
        WHERE id = NEW.payment_intent_id;

        IF intent_payment_type IS DISTINCT FROM 'saas_subscription' THEN
            RAISE EXCEPTION 'payment_intent_id % does not correspond to a saas_subscription payment.', NEW.payment_intent_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_legacy_saas_v1_check_payment_type ON public.legacy_saas_manual_reviews;
CREATE TRIGGER trg_legacy_saas_v1_check_payment_type
BEFORE INSERT OR UPDATE OF payment_intent_id ON public.legacy_saas_manual_reviews
FOR EACH ROW
EXECUTE FUNCTION public.legacy_saas_v1_check_payment_type();

-- 6. Security and RLS
ALTER TABLE public.legacy_saas_manual_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legacy_saas_manual_review_actions ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON public.legacy_saas_manual_reviews FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON public.legacy_saas_manual_review_actions FROM PUBLIC, anon, authenticated, service_role;

-- Grant for service_role
GRANT SELECT, INSERT, UPDATE ON public.legacy_saas_manual_reviews TO service_role;
GRANT SELECT, INSERT ON public.legacy_saas_manual_review_actions TO service_role;

DROP POLICY IF EXISTS service_role_select_reviews ON public.legacy_saas_manual_reviews;
CREATE POLICY service_role_select_reviews
ON public.legacy_saas_manual_reviews
FOR SELECT TO service_role USING (true);

DROP POLICY IF EXISTS service_role_insert_reviews ON public.legacy_saas_manual_reviews;
CREATE POLICY service_role_insert_reviews
ON public.legacy_saas_manual_reviews
FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS service_role_update_reviews ON public.legacy_saas_manual_reviews;
CREATE POLICY service_role_update_reviews
ON public.legacy_saas_manual_reviews
FOR UPDATE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_insert_actions ON public.legacy_saas_manual_review_actions;
CREATE POLICY service_role_insert_actions
ON public.legacy_saas_manual_review_actions
FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS service_role_select_actions ON public.legacy_saas_manual_review_actions;
CREATE POLICY service_role_select_actions
ON public.legacy_saas_manual_review_actions
FOR SELECT TO service_role USING (true);

-- 2. Remplacement de `process_fedapay_webhook_event_v2`
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
RETURNS JSONB AS $$
DECLARE
    v_event_id UUID;
    v_existing_event RECORD;
    v_intent RECORD;
    v_school RECORD;
    v_affiliate RECORD;
    v_currency_cfg RECORD;
    v_payable_minor BIGINT;
    v_fee_minor BIGINT;
    v_tax_minor BIGINT;
    v_net_eligible_minor BIGINT;
    v_rate_basis_points BIGINT;
    v_calc_numeric NUMERIC;
    v_commission_minor BIGINT;
    v_maturation_at TIMESTAMPTZ;
    v_first_payment TIMESTAMPTZ;
    v_ledger_id UUID;
BEGIN
    -- A. Déduplication fail-fast au niveau de webhook_events
    INSERT INTO public.webhook_events (
        provider, provider_event_id, event_type, intent_id, status
    ) VALUES (
        p_provider, p_provider_event_id, p_event_type, p_intent_id, 'processing'
    )
    ON CONFLICT (provider, provider_event_id) DO NOTHING
    RETURNING id INTO v_event_id;

    IF v_event_id IS NULL THEN
        SELECT status INTO v_existing_event FROM public.webhook_events
        WHERE provider = p_provider AND provider_event_id = p_provider_event_id;
        RETURN jsonb_build_object(
            'status', 'duplicate',
            'message', 'Webhook event already recorded',
            'existing_status', v_existing_event.status
        );
    END IF;

    -- B. Verrouillage et validation de l'intention de paiement
    SELECT * INTO v_intent FROM public.payment_intents WHERE id = p_intent_id FOR UPDATE;
    IF NOT FOUND THEN
        UPDATE public.webhook_events SET status = 'failed', error_code = 'INTENT_NOT_FOUND', processed_at = clock_timestamp() WHERE id = v_event_id;
        RETURN jsonb_build_object('status', 'error', 'error_code', 'INTENT_NOT_FOUND');
    END IF;

    -- Validation de conformité devise et montant
    IF v_intent.currency <> p_remote_currency OR v_intent.payable_amount <> p_remote_amount THEN
        UPDATE public.webhook_events SET status = 'reconciliation_required', error_code = 'CURRENCY_OR_AMOUNT_MISMATCH', processed_at = clock_timestamp() WHERE id = v_event_id;
        RETURN jsonb_build_object('status', 'reconciliation_required', 'error_code', 'CURRENCY_OR_AMOUNT_MISMATCH');
    END IF;

    -- Si déjà complété : idempotence
    IF v_intent.status = 'completed' THEN
        UPDATE public.webhook_events SET status = 'duplicate', processed_at = clock_timestamp() WHERE id = v_event_id;
        RETURN jsonb_build_object('status', 'duplicate', 'message', 'Payment intent already completed');
    END IF;

    -- =========================================================================
    -- REDIRECTION OBLIGATOIRE DES FLUX SAAS VERS LA REVUE MANUELLE (P18)
    -- =========================================================================
    IF v_intent.payment_type = 'saas_subscription' THEN
        -- 1. Enregistrement idempotent dans la file de revue manuelle
        INSERT INTO public.legacy_saas_manual_reviews (
            provider, provider_event_ref, payment_intent_id, legacy_payment_type, status
        ) VALUES (
            p_provider, p_provider_event_id, p_intent_id, 'saas_subscription', 'pending'
        ) ON CONFLICT (provider, provider_event_ref) DO NOTHING;

        -- 2. Placer l'intention en attente de réconciliation
        UPDATE public.payment_intents
        SET status = 'reconciliation_required',
            updated_at = clock_timestamp()
        WHERE id = p_intent_id;

        -- 3. Placer l'événement webhook en attente de réconciliation
        UPDATE public.webhook_events
        SET status = 'reconciliation_required',
            error_code = 'LEGACY_SAAS_MANUAL_REVIEW_REQUIRED',
            processed_at = clock_timestamp()
        WHERE id = v_event_id;

        -- 4. Retourner le résultat immédiatement SANS MODIFIER schools, first_successful_payment_at NI ledger
        RETURN jsonb_build_object(
            'status', 'reconciliation_required',
            'reason', 'LEGACY_SAAS_MANUAL_REVIEW_REQUIRED',
            'message', 'Legacy SaaS subscription payments are redirected to manual review'
        );
    END IF;
    -- =========================================================================

    -- C. Mise à jour de l'intention de paiement (POUR LES AUTRES FLUX)
    UPDATE public.payment_intents
    SET status = 'completed',
        provider_transaction_id = p_provider_transaction_id,
        completed_at = COALESCE(p_certified_payment_at, clock_timestamp()),
        updated_at = clock_timestamp()
    WHERE id = p_intent_id;

    -- (Suppression de la mise à jour conditionnelle sur 'schools' puisqu'elle était exclusive à saas_subscription)

    -- D. Attribution et calcul de commission Ambassadeur (POUR LES AUTRES FLUX)
    IF v_intent.school_id IS NULL THEN
        UPDATE public.webhook_events SET status = 'processed', processed_at = clock_timestamp() WHERE id = v_event_id;
        RETURN jsonb_build_object('status', 'completed', 'affiliate_status', 'no_school');
    END IF;

    SELECT * INTO v_school FROM public.schools WHERE id = v_intent.school_id FOR UPDATE;
    IF v_school.affiliate_id IS NULL THEN
        UPDATE public.webhook_events SET status = 'processed', processed_at = clock_timestamp() WHERE id = v_event_id;
        RETURN jsonb_build_object('status', 'completed', 'affiliate_status', 'no_affiliate');
    END IF;

    SELECT * INTO v_affiliate FROM public.affiliates WHERE id = v_school.affiliate_id FOR UPDATE;
    IF NOT FOUND OR v_affiliate.status <> 'active' THEN
        UPDATE public.webhook_events SET status = 'reconciliation_required', error_code = 'AFFILIATE_INACTIVE_OR_SUSPENDED', processed_at = clock_timestamp() WHERE id = v_event_id;
        PERFORM public.log_affiliate_error_event(p_provider, p_provider_event_id, 'AFFILIATE_INACTIVE_OR_SUSPENDED');
        RETURN jsonb_build_object('status', 'reconciliation_required', 'error_code', 'AFFILIATE_INACTIVE_OR_SUSPENDED');
    END IF;

    -- E. Contrôle d'authenticité de l'identifiant d'événement (aucun faux ID accepté pour commission)
    IF p_is_nominal_event IS NOT TRUE OR p_provider_event_id LIKE 'uncertified_%' THEN
        UPDATE public.webhook_events SET status = 'reconciliation_required', error_code = 'UNCERTIFIED_WEBHOOK_EVENT_ID', processed_at = clock_timestamp() WHERE id = v_event_id;
        PERFORM public.log_affiliate_error_event(p_provider, p_provider_event_id, 'UNCERTIFIED_WEBHOOK_EVENT_ID');
        RETURN jsonb_build_object('status', 'reconciliation_required', 'error_code', 'UNCERTIFIED_WEBHOOK_EVENT_ID');
    END IF;

    -- F. Contrôle strict de l'horodatage certifié (pas de fallback now())
    IF p_certified_payment_at IS NULL THEN
        UPDATE public.webhook_events SET status = 'reconciliation_required', error_code = 'MISSING_CERTIFIED_TIMESTAMP', processed_at = clock_timestamp() WHERE id = v_event_id;
        PERFORM public.log_affiliate_error_event(p_provider, p_provider_event_id, 'MISSING_CERTIFIED_TIMESTAMP');
        RETURN jsonb_build_object('status', 'reconciliation_required', 'error_code', 'MISSING_CERTIFIED_TIMESTAMP');
    END IF;

    -- G. Contrôle strict des frais FedaPay (aucun fallback à zéro)
    IF p_fedapay_fee IS NULL OR p_fedapay_fee < 0 THEN
        UPDATE public.webhook_events SET status = 'reconciliation_required', error_code = 'UNCERTIFIED_OR_MISSING_FEE', processed_at = clock_timestamp() WHERE id = v_event_id;
        PERFORM public.log_affiliate_error_event(p_provider, p_provider_event_id, 'UNCERTIFIED_OR_MISSING_FEE');
        RETURN jsonb_build_object('status', 'reconciliation_required', 'error_code', 'UNCERTIFIED_OR_MISSING_FEE');
    END IF;

    -- H. Contrôle strict des taxes certifiées (aucun fallback à zéro)
    IF p_tax_amount IS NULL OR p_tax_amount < 0 THEN
        UPDATE public.webhook_events SET status = 'reconciliation_required', error_code = 'UNCERTIFIED_OR_MISSING_TAX', processed_at = clock_timestamp() WHERE id = v_event_id;
        PERFORM public.log_affiliate_error_event(p_provider, p_provider_event_id, 'UNCERTIFIED_OR_MISSING_TAX');
        RETURN jsonb_build_object('status', 'reconciliation_required', 'error_code', 'UNCERTIFIED_OR_MISSING_TAX');
    END IF;

    -- I. Contrôle de la fenêtre fixe de 12 mois
    IF v_school.first_successful_payment_at IS NULL THEN
        UPDATE public.schools SET first_successful_payment_at = p_certified_payment_at WHERE id = v_school.id;
        v_first_payment := p_certified_payment_at;
    ELSE
        v_first_payment := v_school.first_successful_payment_at;
    END IF;

    IF p_certified_payment_at > (v_first_payment + INTERVAL '12 months') THEN
        UPDATE public.webhook_events SET status = 'processed', processed_at = clock_timestamp() WHERE id = v_event_id;
        RETURN jsonb_build_object('status', 'completed', 'affiliate_status', 'outside_12m_window');
    END IF;

    -- J. Contrôle de la devise supportée et configuration
    SELECT * INTO v_currency_cfg FROM public.currency_configurations WHERE code = p_remote_currency AND is_active = true;
    IF NOT FOUND THEN
        UPDATE public.webhook_events SET status = 'reconciliation_required', error_code = 'UNSUPPORTED_OR_INACTIVE_CURRENCY', processed_at = clock_timestamp() WHERE id = v_event_id;
        PERFORM public.log_affiliate_error_event(p_provider, p_provider_event_id, 'UNSUPPORTED_OR_INACTIVE_CURRENCY');
        RETURN jsonb_build_object('status', 'reconciliation_required', 'error_code', 'UNSUPPORTED_OR_INACTIVE_CURRENCY');
    END IF;

    -- K. Conversion exacte en unités mineures selon l'exposant réel de la devise
    v_payable_minor := ROUND(v_intent.payable_amount * (10 ^ v_currency_cfg.exponent))::BIGINT;
    v_fee_minor := ROUND(p_fedapay_fee * (10 ^ v_currency_cfg.exponent))::BIGINT;
    v_tax_minor := ROUND(p_tax_amount * (10 ^ v_currency_cfg.exponent))::BIGINT;

    -- Déduction fail-closed des frais et taxes (les remises sont déjà déduites dans payable_amount)
    v_net_eligible_minor := v_payable_minor - v_fee_minor - v_tax_minor;
    IF v_net_eligible_minor <= 0 THEN
        UPDATE public.webhook_events SET status = 'processed', processed_at = clock_timestamp() WHERE id = v_event_id;
        RETURN jsonb_build_object('status', 'completed', 'affiliate_status', 'zero_net_eligible', 'net_eligible_minor', v_net_eligible_minor);
    END IF;

    -- Taux en points de base (ex: 20% = 2000 bps)
    v_rate_basis_points := ROUND(COALESCE(v_affiliate.commission_rate, 20.00) * 100)::BIGINT;

    -- Arithmétique exacte avec intermédiaire NUMERIC pour éliminer tout risque de débordement BIGINT
    v_calc_numeric := (v_net_eligible_minor::NUMERIC * v_rate_basis_points::NUMERIC + 5000) / 10000;
    IF v_calc_numeric < 1 THEN
        v_commission_minor := 0;
    ELSE
        v_commission_minor := FLOOR(v_calc_numeric)::BIGINT;
    END IF;

    -- Si commission arrondie = 0, ne pas insérer de ligne contraire à CHECK (amount_minor > 0)
    IF v_commission_minor <= 0 THEN
        UPDATE public.webhook_events SET status = 'processed', processed_at = clock_timestamp() WHERE id = v_event_id;
        RETURN jsonb_build_object('status', 'completed', 'affiliate_status', 'zero_commission_rounded', 'commission_minor', 0);
    END IF;

    -- Date d'échéance selon le cooling-off configuré
    v_maturation_at := p_certified_payment_at + (v_currency_cfg.cooling_off_days || ' days')::INTERVAL;

    -- L. Écriture dans le grand livre immuable
    INSERT INTO public.affiliate_ledger (
        affiliate_id, currency, entry_type, amount_minor, payment_intent_id, maturation_at, metadata
    ) VALUES (
        v_affiliate.id, p_remote_currency, 'commission', v_commission_minor, p_intent_id, v_maturation_at,
        jsonb_build_object(
            'payable_minor', v_payable_minor,
            'fee_minor', v_fee_minor,
            'tax_minor', v_tax_minor,
            'net_eligible_minor', v_net_eligible_minor,
            'rate_basis_points', v_rate_basis_points,
            'certified_payment_at', p_certified_payment_at,
            'provider_event_id', p_provider_event_id
        )
    ) RETURNING id INTO v_ledger_id;

    -- M. Mise à jour atomique du solde en attente
    INSERT INTO public.affiliate_balances (
        affiliate_id, currency, pending_balance_minor, available_balance_minor, reserved_balance_minor, debt_balance_minor, updated_at
    ) VALUES (
        v_affiliate.id, p_remote_currency, v_commission_minor, 0, 0, 0, clock_timestamp()
    )
    ON CONFLICT (affiliate_id, currency) DO UPDATE SET
        pending_balance_minor = affiliate_balances.pending_balance_minor + EXCLUDED.pending_balance_minor,
        updated_at = clock_timestamp();

    -- N. Finalisation de l'événement webhook
    UPDATE public.webhook_events SET status = 'processed', processed_at = clock_timestamp() WHERE id = v_event_id;

    RETURN jsonb_build_object(
        'status', 'completed',
        'affiliate_status', 'commission_credited_pending',
        'ledger_id', v_ledger_id,
        'commission_minor', v_commission_minor,
        'currency', p_remote_currency,
        'maturation_at', v_maturation_at
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
COMMIT;
