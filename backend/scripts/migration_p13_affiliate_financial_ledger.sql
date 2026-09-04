-- ============================================================================
-- Migration P13 : Fondation financière Ambassadeurs (Lot 6B)
-- Description : Grand livre financier immuable, soldes multi-devises en unités mineures,
--               machine à états de retrait, webhook v2 atomique avec déduplication fail-fast,
--               wrapper historique sécurisé et réconciliation administrative.
-- ============================================================================

-- 1. Extension UUID si nécessaire
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Colonne first_successful_payment_at sur schools (fenêtre fixe de 12 mois)
ALTER TABLE public.schools
ADD COLUMN IF NOT EXISTS first_successful_payment_at TIMESTAMPTZ;

-- 3. Colonne status sur affiliates si inexistante
ALTER TABLE public.affiliates
ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'active';

-- ============================================================================
-- 4. Table : Configurations de devises (currency_configurations)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.currency_configurations (
    code VARCHAR(3) PRIMARY KEY,
    exponent INTEGER NOT NULL CHECK (exponent >= 0 AND exponent <= 4),
    is_active BOOLEAN NOT NULL DEFAULT true,
    min_withdrawal_minor_units BIGINT NOT NULL CHECK (min_withdrawal_minor_units > 0),
    cooling_off_days INTEGER NOT NULL DEFAULT 30 CHECK (cooling_off_days >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Devises supportées initiales
INSERT INTO public.currency_configurations (code, exponent, is_active, min_withdrawal_minor_units, cooling_off_days)
VALUES
    ('XOF', 0, true, 5000, 30),
    ('EUR', 2, true, 1000, 30),
    ('USD', 2, true, 1000, 30),
    ('NGN', 2, true, 500000, 30)
ON CONFLICT (code) DO UPDATE SET
    exponent = EXCLUDED.exponent,
    is_active = EXCLUDED.is_active,
    min_withdrawal_minor_units = EXCLUDED.min_withdrawal_minor_units,
    cooling_off_days = EXCLUDED.cooling_off_days;

-- ============================================================================
-- 5. Table : Journal des événements Webhook entrants (webhook_events)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(32) NOT NULL,
    provider_event_id VARCHAR(128) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    intent_id UUID REFERENCES public.payment_intents(id) ON DELETE RESTRICT,
    status VARCHAR(32) NOT NULL CHECK (status IN ('received', 'processing', 'processed', 'duplicate', 'reconciliation_required', 'failed')),
    error_code VARCHAR(64),
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ,
    CONSTRAINT uq_webhook_events_provider_event UNIQUE (provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_intent_id ON public.webhook_events(intent_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON public.webhook_events(status);

-- ============================================================================
-- 6. Table : Soldes multi-devises en unités mineures (affiliate_balances)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.affiliate_balances (
    affiliate_id UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE RESTRICT,
    currency VARCHAR(3) NOT NULL REFERENCES public.currency_configurations(code) ON DELETE RESTRICT,
    pending_balance_minor BIGINT NOT NULL DEFAULT 0 CHECK (pending_balance_minor >= 0),
    available_balance_minor BIGINT NOT NULL DEFAULT 0 CHECK (available_balance_minor >= 0),
    reserved_balance_minor BIGINT NOT NULL DEFAULT 0 CHECK (reserved_balance_minor >= 0),
    debt_balance_minor BIGINT NOT NULL DEFAULT 0 CHECK (debt_balance_minor >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (affiliate_id, currency)
);

-- ============================================================================
-- 7. Table : Demandes de retraits (affiliate_withdrawals)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.affiliate_withdrawals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    affiliate_id UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE RESTRICT,
    currency VARCHAR(3) NOT NULL REFERENCES public.currency_configurations(code) ON DELETE RESTRICT,
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    fee_minor BIGINT NOT NULL DEFAULT 0 CHECK (fee_minor >= 0),
    net_amount_minor BIGINT NOT NULL CHECK (net_amount_minor > 0),
    payout_channel VARCHAR(32) NOT NULL,
    payout_details JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(32) NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'processing', 'completed', 'rejected', 'cancelled')),
    idempotency_key VARCHAR(128),
    rejection_reason TEXT,
    provider_payout_ref VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_affiliate_withdrawals_net CHECK (net_amount_minor = amount_minor - fee_minor),
    CONSTRAINT uq_affiliate_withdrawals_idempotency UNIQUE (affiliate_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_affiliate_withdrawals_affiliate ON public.affiliate_withdrawals(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_withdrawals_status ON public.affiliate_withdrawals(status);

-- ============================================================================
-- 8. Table : Audit des changements de statut de retrait (affiliate_withdrawal_audit_log)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.affiliate_withdrawal_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    withdrawal_id UUID NOT NULL REFERENCES public.affiliate_withdrawals(id) ON DELETE RESTRICT,
    previous_status VARCHAR(32) NOT NULL,
    new_status VARCHAR(32) NOT NULL,
    actor_type VARCHAR(32) NOT NULL CHECK (actor_type IN ('affiliate', 'admin', 'system')),
    actor_id TEXT NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_withdrawal_audit_withdrawal_id ON public.affiliate_withdrawal_audit_log(withdrawal_id);

-- ============================================================================
-- 9. Table : Grand Livre Immuable (affiliate_ledger)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.affiliate_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    affiliate_id UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE RESTRICT,
    currency VARCHAR(3) NOT NULL REFERENCES public.currency_configurations(code) ON DELETE RESTRICT,
    entry_type VARCHAR(32) NOT NULL CHECK (entry_type IN ('commission', 'withdrawal', 'refund_reversal', 'adjustment')),
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    payment_intent_id UUID REFERENCES public.payment_intents(id) ON DELETE RESTRICT,
    withdrawal_id UUID REFERENCES public.affiliate_withdrawals(id) ON DELETE RESTRICT,
    provider_refund_id VARCHAR(128),
    adjustment_ref TEXT,
    maturation_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_affiliate_ledger_refs CHECK (
        (entry_type = 'commission' AND payment_intent_id IS NOT NULL AND withdrawal_id IS NULL AND provider_refund_id IS NULL AND adjustment_ref IS NULL AND maturation_at IS NOT NULL) OR
        (entry_type = 'withdrawal' AND withdrawal_id IS NOT NULL AND payment_intent_id IS NULL AND provider_refund_id IS NULL AND adjustment_ref IS NULL AND maturation_at IS NULL) OR
        (entry_type = 'refund_reversal' AND provider_refund_id IS NOT NULL AND payment_intent_id IS NULL AND withdrawal_id IS NULL AND adjustment_ref IS NULL AND maturation_at IS NULL) OR
        (entry_type = 'adjustment' AND adjustment_ref IS NOT NULL AND payment_intent_id IS NULL AND withdrawal_id IS NULL AND provider_refund_id IS NULL AND maturation_at IS NULL)
    ),
    CONSTRAINT uq_affiliate_ledger_commission UNIQUE (affiliate_id, payment_intent_id, entry_type)
);

CREATE INDEX IF NOT EXISTS idx_affiliate_ledger_affiliate ON public.affiliate_ledger(affiliate_id, currency);
CREATE INDEX IF NOT EXISTS idx_affiliate_ledger_maturation ON public.affiliate_ledger(maturation_at) WHERE entry_type = 'commission';

-- Trigger d'immutabilité absolue sur affiliate_ledger
CREATE OR REPLACE FUNCTION public.fn_prevent_affiliate_ledger_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'IMMUTABLE_LEDGER_MUTATION_FORBIDDEN: UPDATE and DELETE operations are strictly forbidden on affiliate_ledger';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_affiliate_ledger_mutation ON public.affiliate_ledger;
CREATE TRIGGER trg_prevent_affiliate_ledger_mutation
BEFORE UPDATE OR DELETE ON public.affiliate_ledger
FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_affiliate_ledger_mutation();

-- ============================================================================
-- 10. Table : Libérations de commissions échues (affiliate_commission_releases)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.affiliate_commission_releases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ledger_entry_id UUID NOT NULL REFERENCES public.affiliate_ledger(id) ON DELETE RESTRICT,
    affiliate_id UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE RESTRICT,
    currency VARCHAR(3) NOT NULL REFERENCES public.currency_configurations(code) ON DELETE RESTRICT,
    released_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    amount_applied_to_debt_minor BIGINT NOT NULL DEFAULT 0 CHECK (amount_applied_to_debt_minor >= 0),
    amount_transferred_to_available_minor BIGINT NOT NULL DEFAULT 0 CHECK (amount_transferred_to_available_minor >= 0),
    total_released_minor BIGINT NOT NULL CHECK (total_released_minor > 0),
    batch_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_affiliate_commission_releases_sum CHECK (total_released_minor = amount_applied_to_debt_minor + amount_transferred_to_available_minor),
    CONSTRAINT uq_commission_release_ledger_entry UNIQUE (ledger_entry_id)
);

CREATE INDEX IF NOT EXISTS idx_commission_releases_affiliate ON public.affiliate_commission_releases(affiliate_id, currency);

-- ============================================================================
-- 11. Table : Journal des erreurs financières (affiliate_error_events)
-- ============================================================================
-- Table épurée sans champ libre, sans message technique, sans stack trace,
-- sans payload et sans données personnelles. Liste fermée de codes d'erreur.
CREATE TABLE IF NOT EXISTS public.affiliate_error_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(32) NOT NULL DEFAULT 'fedapay' CHECK (provider IN ('fedapay', 'fedapay_legacy', 'system')),
    provider_event_id VARCHAR(128) NOT NULL,
    error_code VARCHAR(64) NOT NULL CHECK (error_code IN (
        'AFFILIATE_INACTIVE_OR_SUSPENDED',
        'UNCERTIFIED_WEBHOOK_EVENT_ID',
        'MISSING_CERTIFIED_TIMESTAMP',
        'UNCERTIFIED_OR_MISSING_FEE',
        'UNCERTIFIED_OR_MISSING_TAX',
        'UNSUPPORTED_OR_INACTIVE_CURRENCY',
        'HISTORICAL_WRAPPER_MISSING_FEES_OR_TIMESTAMP',
        'DUPLICATE_EVENT',
        'INTENT_NOT_FOUND',
        'ALREADY_SETTLED',
        'RECONCILIATION_REQUIRED',
        'INTERNAL_RPC_ERROR'
    )),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_affiliate_error_events UNIQUE (provider, provider_event_id, error_code)
);

CREATE OR REPLACE FUNCTION public.log_affiliate_error_event(
    p_provider VARCHAR(32),
    p_provider_event_id VARCHAR(128),
    p_error_code VARCHAR(64)
) RETURNS VOID AS $$
BEGIN
    INSERT INTO public.affiliate_error_events (provider, provider_event_id, error_code, created_at)
    VALUES (p_provider, p_provider_event_id, p_error_code, clock_timestamp())
    ON CONFLICT (provider, provider_event_id, error_code) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;


-- ============================================================================
-- 12. RPC : process_fedapay_webhook_event_v2 (Atomicité Webhook & Finance)
-- ============================================================================
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

    -- C. Mise à jour de l'intention de paiement
    UPDATE public.payment_intents
    SET status = 'completed',
        provider_transaction_id = p_provider_transaction_id,
        completed_at = COALESCE(p_certified_payment_at, clock_timestamp()),
        updated_at = clock_timestamp()
    WHERE id = p_intent_id;

    -- Mise à jour école si paiement d'abonnement SaaS
    IF v_intent.payment_type = 'saas_subscription' AND v_intent.school_id IS NOT NULL THEN
        UPDATE public.schools
        SET subscription_status = 'active',
            updated_at = clock_timestamp()
        WHERE id = v_intent.school_id;
    END IF;

    -- D. Attribution et calcul de commission Ambassadeur
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

-- ============================================================================
-- 13. Wrapper historique : process_fedapay_webhook_event
-- Compatible avec l'ancienne signature à 5 arguments.
-- Met à jour le paiement école, mais ne crée AUCUNE commission non certifiée
-- et place l'affiliation en réconciliation requise.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.process_fedapay_webhook_event(
    p_intent_id UUID,
    p_provider_transaction_id TEXT,
    p_remote_amount NUMERIC,
    p_remote_currency TEXT,
    p_remote_status TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_synthetic_event_id TEXT;
    v_intent RECORD;
    v_school RECORD;
BEGIN
    v_synthetic_event_id := 'legacy_' || COALESCE(p_provider_transaction_id, p_intent_id::TEXT);

    -- Verrouiller et vérifier l'intention
    SELECT * INTO v_intent FROM public.payment_intents WHERE id = p_intent_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'error', 'error_code', 'INTENT_NOT_FOUND');
    END IF;

    IF v_intent.status = 'completed' THEN
        RETURN jsonb_build_object('status', 'duplicate', 'message', 'Payment intent already completed');
    END IF;

    -- Valider montant et devise
    IF v_intent.currency <> p_remote_currency OR v_intent.payable_amount <> p_remote_amount THEN
        RETURN jsonb_build_object('status', 'reconciliation_required', 'error_code', 'CURRENCY_OR_AMOUNT_MISMATCH');
    END IF;

    -- Traiter le paiement côté établissement
    UPDATE public.payment_intents
    SET status = 'completed',
        provider_transaction_id = p_provider_transaction_id,
        completed_at = clock_timestamp(),
        updated_at = clock_timestamp()
    WHERE id = p_intent_id;

    IF v_intent.payment_type = 'saas_subscription' AND v_intent.school_id IS NOT NULL THEN
        UPDATE public.schools
        SET subscription_status = 'active',
            updated_at = clock_timestamp()
        WHERE id = v_intent.school_id;
    END IF;

    -- Vérifier présence d'un ambassadeur
    IF v_intent.school_id IS NOT NULL THEN
        SELECT * INTO v_school FROM public.schools WHERE id = v_intent.school_id;
        IF v_school.affiliate_id IS NOT NULL THEN
            -- Inscription dans webhook_events en réconciliation obligatoire
            INSERT INTO public.webhook_events (
                provider, provider_event_id, event_type, intent_id, status, error_code, processed_at
            ) VALUES (
                'fedapay_legacy', v_synthetic_event_id, 'transaction.approved', p_intent_id,
                'reconciliation_required', 'HISTORICAL_WRAPPER_MISSING_FEES_OR_TIMESTAMP', clock_timestamp()
            )
            ON CONFLICT (provider, provider_event_id) DO NOTHING;

            PERFORM public.log_affiliate_error_event('fedapay_legacy', v_synthetic_event_id, 'HISTORICAL_WRAPPER_MISSING_FEES_OR_TIMESTAMP');

            RETURN jsonb_build_object(
                'status', 'reconciliation_required',
                'reason', 'AFFILIATE_RECONCILIATION_REQUIRED_MISSING_FEES_OR_TIMESTAMP'
            );
        END IF;
    END IF;

    RETURN jsonb_build_object('status', 'completed');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ============================================================================
-- 14. RPC : admin_reconcile_affiliate_commission_atomic (Réconciliation administrative)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_reconcile_affiliate_commission_atomic(
    p_intent_id UUID,
    p_certified_payment_at TIMESTAMPTZ,
    p_fedapay_fee NUMERIC,
    p_tax_amount NUMERIC,
    p_admin_actor_id TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_intent RECORD;
    v_school RECORD;
    v_affiliate RECORD;
    v_currency_cfg RECORD;
    v_existing_ledger RECORD;
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
    IF p_certified_payment_at IS NULL THEN
        RETURN jsonb_build_object('status', 'error', 'error_code', 'MISSING_CERTIFIED_TIMESTAMP');
    END IF;

    IF p_fedapay_fee IS NULL OR p_fedapay_fee < 0 THEN
        RETURN jsonb_build_object('status', 'error', 'error_code', 'UNCERTIFIED_OR_MISSING_FEE');
    END IF;

    IF p_tax_amount IS NULL OR p_tax_amount < 0 THEN
        RETURN jsonb_build_object('status', 'error', 'error_code', 'UNCERTIFIED_OR_MISSING_TAX');
    END IF;

    -- Verrouiller l'intention
    SELECT * INTO v_intent FROM public.payment_intents WHERE id = p_intent_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'error', 'error_code', 'INTENT_NOT_FOUND');
    END IF;

    IF v_intent.status <> 'completed' THEN
        RETURN jsonb_build_object('status', 'error', 'error_code', 'INTENT_NOT_COMPLETED');
    END IF;

    IF v_intent.school_id IS NULL THEN
        RETURN jsonb_build_object('status', 'error', 'error_code', 'NO_SCHOOL_ATTACHED');
    END IF;

    SELECT * INTO v_school FROM public.schools WHERE id = v_intent.school_id FOR UPDATE;
    IF v_school.affiliate_id IS NULL THEN
        RETURN jsonb_build_object('status', 'error', 'error_code', 'NO_AFFILIATE_FOR_SCHOOL');
    END IF;

    SELECT * INTO v_affiliate FROM public.affiliates WHERE id = v_school.affiliate_id FOR UPDATE;
    IF NOT FOUND OR v_affiliate.status <> 'active' THEN
        RETURN jsonb_build_object('status', 'error', 'error_code', 'AFFILIATE_NOT_ACTIVE');
    END IF;

    -- Contrôle d'idempotence strict : commission déjà existante ?
    SELECT * INTO v_existing_ledger FROM public.affiliate_ledger
    WHERE payment_intent_id = p_intent_id AND entry_type = 'commission';
    IF FOUND THEN
        RETURN jsonb_build_object('status', 'duplicate', 'message', 'Commission already recorded in ledger', 'ledger_id', v_existing_ledger.id);
    END IF;

    -- Contrôle de la fenêtre fixe de 12 mois
    IF v_school.first_successful_payment_at IS NULL THEN
        UPDATE public.schools SET first_successful_payment_at = p_certified_payment_at WHERE id = v_school.id;
        v_first_payment := p_certified_payment_at;
    ELSE
        v_first_payment := v_school.first_successful_payment_at;
    END IF;

    IF p_certified_payment_at > (v_first_payment + INTERVAL '12 months') THEN
        RETURN jsonb_build_object('status', 'rejected', 'reason', 'OUTSIDE_12_MONTHS_WINDOW');
    END IF;

    -- Contrôle de devise
    SELECT * INTO v_currency_cfg FROM public.currency_configurations WHERE code = v_intent.currency AND is_active = true;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'error', 'error_code', 'UNSUPPORTED_OR_INACTIVE_CURRENCY');
    END IF;

    -- Conversion et calcul exact
    v_payable_minor := ROUND(v_intent.payable_amount * (10 ^ v_currency_cfg.exponent))::BIGINT;
    v_fee_minor := ROUND(p_fedapay_fee * (10 ^ v_currency_cfg.exponent))::BIGINT;
    v_tax_minor := ROUND(p_tax_amount * (10 ^ v_currency_cfg.exponent))::BIGINT;
    v_net_eligible_minor := v_payable_minor - v_fee_minor - v_tax_minor;

    IF v_net_eligible_minor <= 0 THEN
        RETURN jsonb_build_object('status', 'completed', 'affiliate_status', 'zero_net_eligible', 'net_eligible_minor', v_net_eligible_minor);
    END IF;

    v_rate_basis_points := ROUND(COALESCE(v_affiliate.commission_rate, 20.00) * 100)::BIGINT;
    v_calc_numeric := (v_net_eligible_minor::NUMERIC * v_rate_basis_points::NUMERIC + 5000) / 10000;
    IF v_calc_numeric < 1 THEN
        v_commission_minor := 0;
    ELSE
        v_commission_minor := FLOOR(v_calc_numeric)::BIGINT;
    END IF;

    IF v_commission_minor <= 0 THEN
        RETURN jsonb_build_object('status', 'completed', 'affiliate_status', 'zero_commission_rounded', 'commission_minor', 0);
    END IF;

    v_maturation_at := p_certified_payment_at + (v_currency_cfg.cooling_off_days || ' days')::INTERVAL;

    -- Insertion dans le ledger immuable
    INSERT INTO public.affiliate_ledger (
        affiliate_id, currency, entry_type, amount_minor, payment_intent_id, maturation_at, metadata
    ) VALUES (
        v_affiliate.id, v_intent.currency, 'commission', v_commission_minor, p_intent_id, v_maturation_at,
        jsonb_build_object(
            'reconciled_by', p_admin_actor_id,
            'reconciled_at', clock_timestamp(),
            'net_eligible_minor', v_net_eligible_minor,
            'fee_minor', v_fee_minor,
            'tax_minor', v_tax_minor,
            'rate_basis_points', v_rate_basis_points,
            'certified_payment_at', p_certified_payment_at
        )
    ) RETURNING id INTO v_ledger_id;

    -- Crédit du solde pending
    INSERT INTO public.affiliate_balances (
        affiliate_id, currency, pending_balance_minor, available_balance_minor, reserved_balance_minor, debt_balance_minor, updated_at
    ) VALUES (
        v_affiliate.id, v_intent.currency, v_commission_minor, 0, 0, 0, clock_timestamp()
    )
    ON CONFLICT (affiliate_id, currency) DO UPDATE SET
        pending_balance_minor = affiliate_balances.pending_balance_minor + EXCLUDED.pending_balance_minor,
        updated_at = clock_timestamp();

    -- Mettre à jour l'événement webhook si présent
    UPDATE public.webhook_events
    SET status = 'processed', error_code = NULL, processed_at = clock_timestamp()
    WHERE intent_id = p_intent_id AND status = 'reconciliation_required';

    RETURN jsonb_build_object(
        'status', 'completed',
        'affiliate_status', 'commission_reconciled',
        'ledger_id', v_ledger_id,
        'commission_minor', v_commission_minor,
        'currency', v_intent.currency,
        'maturation_at', v_maturation_at
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ============================================================================
-- 15. RPC : release_matured_commissions_atomic (Libération après cooling-off)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.release_matured_commissions_atomic(
    p_batch_limit INTEGER DEFAULT 100
)
RETURNS JSONB AS $$
DECLARE
    v_rec RECORD;
    v_bal RECORD;
    v_batch_id UUID := gen_random_uuid();
    v_count INTEGER := 0;
    v_total_released_minor BIGINT := 0;
    v_debt_to_cover BIGINT;
    v_to_available BIGINT;
BEGIN
    FOR v_rec IN
        SELECT l.id, l.affiliate_id, l.currency, l.amount_minor
        FROM public.affiliate_ledger l
        WHERE l.entry_type = 'commission'
          AND l.maturation_at <= clock_timestamp()
          AND NOT EXISTS (
              SELECT 1 FROM public.affiliate_commission_releases r WHERE r.ledger_entry_id = l.id
          )
        ORDER BY l.maturation_at ASC
        LIMIT p_batch_limit
        FOR UPDATE SKIP LOCKED
    LOOP
        -- Verrouiller le solde
        SELECT * INTO v_bal FROM public.affiliate_balances
        WHERE affiliate_id = v_rec.affiliate_id AND currency = v_rec.currency
        FOR UPDATE;

        IF FOUND THEN
            -- Calcul de l'affectation à la dette vs au disponible
            v_debt_to_cover := LEAST(v_bal.debt_balance_minor, v_rec.amount_minor);
            v_to_available := v_rec.amount_minor - v_debt_to_cover;

            -- Insertion de la ligne de libération
            INSERT INTO public.affiliate_commission_releases (
                ledger_entry_id, affiliate_id, currency,
                amount_applied_to_debt_minor, amount_transferred_to_available_minor,
                total_released_minor, batch_id
            ) VALUES (
                v_rec.id, v_rec.affiliate_id, v_rec.currency,
                v_debt_to_cover, v_to_available,
                v_rec.amount_minor, v_batch_id
            );

            -- Mise à jour atomique des soldes
            UPDATE public.affiliate_balances
            SET pending_balance_minor = GREATEST(0, pending_balance_minor - v_rec.amount_minor),
                debt_balance_minor = debt_balance_minor - v_debt_to_cover,
                available_balance_minor = available_balance_minor + v_to_available,
                updated_at = clock_timestamp()
            WHERE affiliate_id = v_rec.affiliate_id AND currency = v_rec.currency;

            v_count := v_count + 1;
            v_total_released_minor := v_total_released_minor + v_rec.amount_minor;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'status', 'completed',
        'batch_id', v_batch_id,
        'released_count', v_count,
        'total_released_minor', v_total_released_minor
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ============================================================================
-- 16. RPC : affiliate_request_withdrawal_atomic (Demande de retrait)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.affiliate_request_withdrawal_atomic(
    p_affiliate_id UUID,
    p_currency VARCHAR(3),
    p_amount_minor BIGINT,
    p_channel VARCHAR(32),
    p_details JSONB,
    p_idempotency_key VARCHAR(128)
)
RETURNS JSONB AS $$
DECLARE
    v_currency_cfg RECORD;
    v_bal RECORD;
    v_withdrawal_id UUID;
    v_existing RECORD;
BEGIN
    IF p_amount_minor <= 0 THEN
        RETURN jsonb_build_object('status', 'error', 'error_code', 'INVALID_AMOUNT');
    END IF;

    -- Idempotence sur (affiliate_id, idempotency_key)
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id, status, amount_minor INTO v_existing FROM public.affiliate_withdrawals
        WHERE affiliate_id = p_affiliate_id AND idempotency_key = p_idempotency_key;
        IF FOUND THEN
            RETURN jsonb_build_object('status', 'duplicate', 'withdrawal_id', v_existing.id, 'current_status', v_existing.status);
        END IF;
    END IF;

    -- Vérifier devise et montant minimal
    SELECT * INTO v_currency_cfg FROM public.currency_configurations WHERE code = p_currency AND is_active = true;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'error', 'error_code', 'UNSUPPORTED_CURRENCY');
    END IF;

    IF p_amount_minor < v_currency_cfg.min_withdrawal_minor_units THEN
        RETURN jsonb_build_object('status', 'error', 'error_code', 'BELOW_MINIMUM_WITHDRAWAL', 'min_allowed', v_currency_cfg.min_withdrawal_minor_units);
    END IF;

    -- Verrouiller le solde
    SELECT * INTO v_bal FROM public.affiliate_balances
    WHERE affiliate_id = p_affiliate_id AND currency = p_currency
    FOR UPDATE;

    IF NOT FOUND OR v_bal.available_balance_minor < p_amount_minor THEN
        RETURN jsonb_build_object('status', 'error', 'error_code', 'INSUFFICIENT_AVAILABLE_FUNDS');
    END IF;

    -- Déplacer le montant de available vers reserved
    UPDATE public.affiliate_balances
    SET available_balance_minor = available_balance_minor - p_amount_minor,
        reserved_balance_minor = reserved_balance_minor + p_amount_minor,
        updated_at = clock_timestamp()
    WHERE affiliate_id = p_affiliate_id AND currency = p_currency;

    -- Créer la demande de retrait
    INSERT INTO public.affiliate_withdrawals (
        affiliate_id, currency, amount_minor, fee_minor, net_amount_minor,
        payout_channel, payout_details, status, idempotency_key
    ) VALUES (
        p_affiliate_id, p_currency, p_amount_minor, 0, p_amount_minor,
        p_channel, p_details, 'requested', p_idempotency_key
    ) RETURNING id INTO v_withdrawal_id;

    -- Journaliser dans l'audit
    INSERT INTO public.affiliate_withdrawal_audit_log (
        withdrawal_id, previous_status, new_status, actor_type, actor_id, reason
    ) VALUES (
        v_withdrawal_id, 'none', 'requested', 'affiliate', p_affiliate_id::TEXT, 'Initial withdrawal request'
    );

    RETURN jsonb_build_object(
        'status', 'completed',
        'withdrawal_id', v_withdrawal_id,
        'amount_minor', p_amount_minor,
        'currency', p_currency
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ============================================================================
-- 17. RPC : admin_process_affiliate_withdrawal_atomic (Machine à états retrait)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_process_affiliate_withdrawal_atomic(
    p_withdrawal_id UUID,
    p_action VARCHAR(32),
    p_actor_id TEXT,
    p_reason TEXT DEFAULT NULL,
    p_provider_ref TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_w RECORD;
    v_bal RECORD;
    v_new_status VARCHAR(32);
    v_ledger_id UUID;
BEGIN
    SELECT * INTO v_w FROM public.affiliate_withdrawals WHERE id = p_withdrawal_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'error', 'error_code', 'WITHDRAWAL_NOT_FOUND');
    END IF;

    SELECT * INTO v_bal FROM public.affiliate_balances
    WHERE affiliate_id = v_w.affiliate_id AND currency = v_w.currency
    FOR UPDATE;

    IF p_action = 'approve' THEN
        IF v_w.status <> 'requested' THEN
            RETURN jsonb_build_object('status', 'error', 'error_code', 'INVALID_STATE_TRANSITION', 'current_status', v_w.status);
        END IF;
        v_new_status := 'approved';
        UPDATE public.affiliate_withdrawals SET status = v_new_status, updated_at = clock_timestamp() WHERE id = v_w.id;

    ELSIF p_action = 'process' THEN
        IF v_w.status <> 'approved' THEN
            RETURN jsonb_build_object('status', 'error', 'error_code', 'INVALID_STATE_TRANSITION', 'current_status', v_w.status);
        END IF;
        v_new_status := 'processing';
        UPDATE public.affiliate_withdrawals
        SET status = v_new_status, provider_payout_ref = COALESCE(p_provider_ref, provider_payout_ref), updated_at = clock_timestamp()
        WHERE id = v_w.id;

    ELSIF p_action = 'complete' THEN
        IF v_w.status NOT IN ('approved', 'processing') THEN
            RETURN jsonb_build_object('status', 'error', 'error_code', 'INVALID_STATE_TRANSITION', 'current_status', v_w.status);
        END IF;
        v_new_status := 'completed';

        -- Déduire le montant du solde réservé
        UPDATE public.affiliate_balances
        SET reserved_balance_minor = GREATEST(0, reserved_balance_minor - v_w.amount_minor),
            updated_at = clock_timestamp()
        WHERE affiliate_id = v_w.affiliate_id AND currency = v_w.currency;

        -- Écriture finale dans le grand livre immuable
        INSERT INTO public.affiliate_ledger (
            affiliate_id, currency, entry_type, amount_minor, withdrawal_id, metadata
        ) VALUES (
            v_w.affiliate_id, v_w.currency, 'withdrawal', v_w.amount_minor, v_w.id,
            jsonb_build_object('payout_channel', v_w.payout_channel, 'provider_ref', COALESCE(p_provider_ref, v_w.provider_payout_ref))
        ) RETURNING id INTO v_ledger_id;

        UPDATE public.affiliate_withdrawals
        SET status = v_new_status, provider_payout_ref = COALESCE(p_provider_ref, provider_payout_ref), updated_at = clock_timestamp()
        WHERE id = v_w.id;

    ELSIF p_action IN ('reject', 'cancel') THEN
        IF v_w.status NOT IN ('requested', 'approved', 'processing') THEN
            RETURN jsonb_build_object('status', 'error', 'error_code', 'INVALID_STATE_TRANSITION', 'current_status', v_w.status);
        END IF;
        v_new_status := CASE WHEN p_action = 'reject' THEN 'rejected' ELSE 'cancelled' END;

        -- Restituer le solde réservé vers disponible
        UPDATE public.affiliate_balances
        SET reserved_balance_minor = GREATEST(0, reserved_balance_minor - v_w.amount_minor),
            available_balance_minor = available_balance_minor + v_w.amount_minor,
            updated_at = clock_timestamp()
        WHERE affiliate_id = v_w.affiliate_id AND currency = v_w.currency;

        UPDATE public.affiliate_withdrawals
        SET status = v_new_status, rejection_reason = p_reason, updated_at = clock_timestamp()
        WHERE id = v_w.id;
    ELSE
        RETURN jsonb_build_object('status', 'error', 'error_code', 'UNKNOWN_ACTION');
    END IF;

    -- Audit log
    INSERT INTO public.affiliate_withdrawal_audit_log (
        withdrawal_id, previous_status, new_status, actor_type, actor_id, reason
    ) VALUES (
        v_w.id, v_w.status, v_new_status, 'admin', p_actor_id, p_reason
    );

    RETURN jsonb_build_object(
        'status', 'completed',
        'withdrawal_id', v_w.id,
        'previous_status', v_w.status,
        'new_status', v_new_status,
        'ledger_id', v_ledger_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ============================================================================
-- 18. RPC : admin_create_affiliate_adjustment_atomic (Ajustement administratif)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_create_affiliate_adjustment_atomic(
    p_affiliate_id UUID,
    p_currency VARCHAR(3),
    p_amount_minor BIGINT,
    p_adjustment_ref TEXT,
    p_direction VARCHAR(16),
    p_actor_id TEXT,
    p_reason TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_currency_cfg RECORD;
    v_bal RECORD;
    v_ledger_id UUID;
    v_avail_to_deduct BIGINT;
    v_debt_to_add BIGINT;
BEGIN
    IF p_amount_minor <= 0 THEN
        RETURN jsonb_build_object('status', 'error', 'error_code', 'INVALID_AMOUNT');
    END IF;

    IF p_adjustment_ref IS NULL OR TRIM(p_adjustment_ref) = '' THEN
        RETURN jsonb_build_object('status', 'error', 'error_code', 'MISSING_ADJUSTMENT_REF');
    END IF;

    IF p_direction NOT IN ('credit', 'debit') THEN
        RETURN jsonb_build_object('status', 'error', 'error_code', 'INVALID_DIRECTION');
    END IF;

    SELECT * INTO v_currency_cfg FROM public.currency_configurations WHERE code = p_currency AND is_active = true;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'error', 'error_code', 'UNSUPPORTED_CURRENCY');
    END IF;

    -- Verrouiller le solde
    INSERT INTO public.affiliate_balances (
        affiliate_id, currency, pending_balance_minor, available_balance_minor, reserved_balance_minor, debt_balance_minor, updated_at
    ) VALUES (
        p_affiliate_id, p_currency, 0, 0, 0, 0, clock_timestamp()
    )
    ON CONFLICT (affiliate_id, currency) DO NOTHING;

    SELECT * INTO v_bal FROM public.affiliate_balances
    WHERE affiliate_id = p_affiliate_id AND currency = p_currency
    FOR UPDATE;

    IF p_direction = 'credit' THEN
        -- Si de la dette existe, réduire la dette en premier
        IF v_bal.debt_balance_minor > 0 THEN
            v_debt_to_add := LEAST(v_bal.debt_balance_minor, p_amount_minor);
            UPDATE public.affiliate_balances
            SET debt_balance_minor = debt_balance_minor - v_debt_to_add,
                available_balance_minor = available_balance_minor + (p_amount_minor - v_debt_to_add),
                updated_at = clock_timestamp()
            WHERE affiliate_id = p_affiliate_id AND currency = p_currency;
        ELSE
            UPDATE public.affiliate_balances
            SET available_balance_minor = available_balance_minor + p_amount_minor,
                updated_at = clock_timestamp()
            WHERE affiliate_id = p_affiliate_id AND currency = p_currency;
        END IF;
    ELSE
        -- Debit : déduire de available en premier, et le reliquat devient debt
        v_avail_to_deduct := LEAST(v_bal.available_balance_minor, p_amount_minor);
        v_debt_to_add := p_amount_minor - v_avail_to_deduct;

        UPDATE public.affiliate_balances
        SET available_balance_minor = available_balance_minor - v_avail_to_deduct,
            debt_balance_minor = debt_balance_minor + v_debt_to_add,
            updated_at = clock_timestamp()
        WHERE affiliate_id = p_affiliate_id AND currency = p_currency;
    END IF;

    -- Inscription dans le grand livre immuable
    INSERT INTO public.affiliate_ledger (
        affiliate_id, currency, entry_type, amount_minor, adjustment_ref, metadata
    ) VALUES (
        p_affiliate_id, p_currency, 'adjustment', p_amount_minor, p_adjustment_ref,
        jsonb_build_object('direction', p_direction, 'actor_id', p_actor_id, 'reason', p_reason)
    ) RETURNING id INTO v_ledger_id;

    RETURN jsonb_build_object(
        'status', 'completed',
        'ledger_id', v_ledger_id,
        'adjustment_ref', p_adjustment_ref,
        'direction', p_direction,
        'amount_minor', p_amount_minor
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ============================================================================
-- 19. Sécurité RLS et Permissions (Conformité Lot 6B / RLS fail-closed)
-- Note : Aucun SELECT ni EXECUTE n'est accordé à authenticated ou anon.
-- Seul service_role et postgres peuvent exécuter les RPCs et manipuler les tables.
-- Les autorisations basées sur l'authentification directe seront déployées au Lot 6D.
-- ============================================================================

ALTER TABLE public.currency_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_withdrawal_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_commission_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_error_events ENABLE ROW LEVEL SECURITY;

-- Révoquer tout accès direct aux rôles publics/anon/authenticated
REVOKE ALL ON public.currency_configurations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.webhook_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.affiliate_balances FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.affiliate_withdrawals FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.affiliate_withdrawal_audit_log FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.affiliate_ledger FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.affiliate_commission_releases FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.affiliate_error_events FROM PUBLIC, anon, authenticated;

-- Révoquer l'exécution des fonctions aux rôles publics/anon/authenticated
REVOKE ALL ON FUNCTION public.process_fedapay_webhook_event_v2(VARCHAR, VARCHAR, VARCHAR, UUID, TEXT, NUMERIC, TEXT, TEXT, TIMESTAMPTZ, NUMERIC, NUMERIC, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_fedapay_webhook_event(UUID, TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_reconcile_affiliate_commission_atomic(UUID, TIMESTAMPTZ, NUMERIC, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_matured_commissions_atomic(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.affiliate_request_withdrawal_atomic(UUID, VARCHAR, BIGINT, VARCHAR, JSONB, VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_process_affiliate_withdrawal_atomic(UUID, VARCHAR, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_create_affiliate_adjustment_atomic(UUID, VARCHAR, BIGINT, TEXT, VARCHAR, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_affiliate_error_event(VARCHAR, VARCHAR, VARCHAR) FROM PUBLIC, anon, authenticated;

-- Accorder l'exécution uniquement au service_role et postgres
GRANT EXECUTE ON FUNCTION public.process_fedapay_webhook_event_v2(VARCHAR, VARCHAR, VARCHAR, UUID, TEXT, NUMERIC, TEXT, TEXT, TIMESTAMPTZ, NUMERIC, NUMERIC, BOOLEAN) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.process_fedapay_webhook_event(UUID, TEXT, NUMERIC, TEXT, TEXT) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.admin_reconcile_affiliate_commission_atomic(UUID, TIMESTAMPTZ, NUMERIC, NUMERIC, TEXT) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.release_matured_commissions_atomic(INTEGER) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.affiliate_request_withdrawal_atomic(UUID, VARCHAR, BIGINT, VARCHAR, JSONB, VARCHAR) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.admin_process_affiliate_withdrawal_atomic(UUID, VARCHAR, TEXT, TEXT, TEXT) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.admin_create_affiliate_adjustment_atomic(UUID, VARCHAR, BIGINT, TEXT, VARCHAR, TEXT, TEXT) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.log_affiliate_error_event(VARCHAR, VARCHAR, VARCHAR) TO service_role, postgres;

-- Lecture de configuration de devise permise au service_role
GRANT SELECT ON public.currency_configurations TO service_role, postgres;
