-- ============================================================================
-- MIGRATION P7 : GESTION DES PÉRIODES D'ABONNEMENT ET DES TRANCHES SAAS
-- Architecture financière immuable par période (ex: "2026-2027")
-- Idempotente, transactionnelle, non destructive (aucun DELETE, aucun DROP TABLE)
-- ============================================================================

BEGIN;

-- 1. Ajout des colonnes financières et de période dans payment_intents (nullable pour préserver l'historique)
ALTER TABLE public.payment_intents 
    ADD COLUMN IF NOT EXISTS billing_period TEXT,
    ADD COLUMN IF NOT EXISTS plan_type TEXT,
    ADD COLUMN IF NOT EXISTS installment_number INTEGER,
    ADD COLUMN IF NOT EXISTS gross_amount INTEGER,
    ADD COLUMN IF NOT EXISTS discount_amount INTEGER,
    ADD COLUMN IF NOT EXISTS payable_amount INTEGER;

-- 2. Contraintes de validation des données financières
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_payment_intents_plan_type'
    ) THEN
        ALTER TABLE public.payment_intents
            ADD CONSTRAINT chk_payment_intents_plan_type 
            CHECK (plan_type IS NULL OR plan_type IN ('annual', 'tranche'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_payment_intents_installment'
    ) THEN
        ALTER TABLE public.payment_intents
            ADD CONSTRAINT chk_payment_intents_installment 
            CHECK (
                (plan_type = 'annual' AND installment_number IS NULL) OR
                (plan_type = 'tranche' AND installment_number BETWEEN 1 AND 3) OR
                (plan_type IS NULL AND installment_number IS NULL)
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_payment_intents_amounts'
    ) THEN
        ALTER TABLE public.payment_intents
            ADD CONSTRAINT chk_payment_intents_amounts 
            CHECK (
                (gross_amount IS NULL OR gross_amount >= 0) AND
                (discount_amount IS NULL OR discount_amount >= 0) AND
                (payable_amount IS NULL OR payable_amount >= 0)
            );
    END IF;

    -- Contrainte NOT VALID : Période obligatoire pour nouvelles intentions SaaS sans casser les lignes historiques
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_saas_billing_period_required'
    ) THEN
        ALTER TABLE public.payment_intents
            ADD CONSTRAINT chk_saas_billing_period_required 
            CHECK (
                payment_type <> 'saas_subscription' OR 
                (billing_period IS NOT NULL AND length(trim(billing_period)) > 0)
            ) NOT VALID;
    END IF;

    -- Contrainte NOT VALID : Montant payable strictement positif pour nouvelles intentions SaaS
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_saas_payable_amount_required'
    ) THEN
        ALTER TABLE public.payment_intents
            ADD CONSTRAINT chk_saas_payable_amount_required 
            CHECK (
                payment_type <> 'saas_subscription' OR 
                (payable_amount IS NOT NULL AND payable_amount > 0)
            ) NOT VALID;
    END IF;
END $$;

-- 3. Remplacement propre des anciens index actifs
DROP INDEX IF EXISTS public.uq_active_saas_intent;
DROP INDEX IF EXISTS public.uq_active_saas_intent_period_v2;
DROP INDEX IF EXISTS public.uq_active_saas_annual_period;
DROP INDEX IF EXISTS public.uq_active_saas_tranche_period;

-- 4. Index unique pour toute intention active d'une période (une seule session active par école et période)
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_saas_period
    ON public.payment_intents (school_slug, billing_period)
    WHERE payment_type = 'saas_subscription'
      AND status IN ('initializing', 'pending')
      AND billing_period IS NOT NULL;

-- 5. Index partiels distincts pour les paiements complétés (completed)

-- 5.1 Plan Annuel - Paiement complété unique par école et période
CREATE UNIQUE INDEX IF NOT EXISTS uq_completed_annual_period
    ON public.payment_intents (school_slug, billing_period)
    WHERE payment_type = 'saas_subscription' 
      AND plan_type = 'annual' 
      AND status = 'completed';

-- 5.2 Plan Tranche - Paiement complété unique par numéro de tranche, école et période
CREATE UNIQUE INDEX IF NOT EXISTS uq_completed_tranche_period
    ON public.payment_intents (school_slug, billing_period, installment_number)
    WHERE payment_type = 'saas_subscription' 
      AND plan_type = 'tranche' 
      AND status = 'completed';

-- 6. Mise à jour de la fonction RPC process_fedapay_webhook_event (Période-aware & Exclusion Mutuelle)
-- Signature et noms de paramètres strictement identiques à la définition existante (p_remote_amount, p_remote_currency, p_remote_status)
CREATE OR REPLACE FUNCTION public.process_fedapay_webhook_event(
    p_intent_id UUID,
    p_provider_transaction_id TEXT,
    p_remote_amount NUMERIC,
    p_remote_currency TEXT,
    p_remote_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_intent RECORD;
    v_school_id UUID;
    v_school_total_revenue NUMERIC;
    v_school_affiliate_id UUID;
    v_school_plan TEXT;
    v_school_tranches_count INTEGER;
    v_new_total_revenue NUMERIC;
    v_new_tranches_count INTEGER;
    v_affiliate_id UUID;
    v_affiliate_rate NUMERIC;
    v_affiliate_wallet NUMERIC;
    v_affiliate_earned NUMERIC;
    v_commission_amount NUMERIC;
    v_existing_annual_completed BOOLEAN;
    v_existing_tranches_completed INTEGER;
BEGIN
    -- 1. Validation de l'événement FedaPay
    IF p_remote_status IS DISTINCT FROM 'approved' AND p_remote_status IS DISTINCT FROM 'transaction.approved' THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'ignored',
            'reason', 'UNHANDLED_EVENT_TYPE',
            'intent_id', p_intent_id,
            'provider_transaction_id', p_provider_transaction_id
        );
    END IF;

    -- 2. Verrouillage pessimiste de l'intention de paiement
    SELECT * INTO v_intent
    FROM public.payment_intents
    WHERE id = p_intent_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'reconciliation_required',
            'reason', 'INTENT_NOT_FOUND',
            'intent_id', p_intent_id,
            'provider_transaction_id', p_provider_transaction_id
        );
    END IF;

    -- 3. Court-circuit d'idempotence si déjà complété
    IF v_intent.status = 'completed' THEN
        RETURN jsonb_build_object(
            'success', true,
            'status', 'duplicate',
            'message', 'Transaction already processed successfully',
            'intent_id', p_intent_id,
            'provider_transaction_id', p_provider_transaction_id
        );
    END IF;

    -- 4. L'intention doit être en état 'pending' ou 'initializing'
    IF v_intent.status NOT IN ('pending', 'initializing') THEN
        UPDATE public.payment_intents
        SET status = 'reconciliation_required',
            reconciliation_reason = 'INVALID_INITIAL_STATUS',
            updated_at = now()
        WHERE id = p_intent_id;

        RETURN jsonb_build_object(
            'success', false,
            'status', 'reconciliation_required',
            'reason', 'INVALID_INITIAL_STATUS',
            'intent_id', p_intent_id,
            'provider_transaction_id', p_provider_transaction_id
        );
    END IF;

    -- 5. Contrôle de réconciliation du montant et de la devise
    IF v_intent.expected_amount IS DISTINCT FROM p_remote_amount OR v_intent.expected_currency IS DISTINCT FROM p_remote_currency THEN
        UPDATE public.payment_intents
        SET status = 'reconciliation_required',
            reconciliation_reason = 'AMOUNT_OR_CURRENCY_MISMATCH',
            updated_at = now()
        WHERE id = p_intent_id;

        RETURN jsonb_build_object(
            'success', false,
            'status', 'reconciliation_required',
            'reason', 'AMOUNT_OR_CURRENCY_MISMATCH',
            'intent_id', p_intent_id,
            'provider_transaction_id', p_provider_transaction_id
        );
    END IF;

    -- 6. Traitement spécifique SaaS Subscription
    IF v_intent.payment_type = 'saas_subscription' THEN
        -- Validation de la période
        IF v_intent.billing_period IS NULL OR length(trim(v_intent.billing_period)) = 0 THEN
            UPDATE public.payment_intents
            SET status = 'reconciliation_required',
                reconciliation_reason = 'MISSING_BILLING_PERIOD',
                updated_at = now()
            WHERE id = p_intent_id;

            RETURN jsonb_build_object(
                'success', false,
                'status', 'reconciliation_required',
                'reason', 'MISSING_BILLING_PERIOD',
                'intent_id', p_intent_id
            );
        END IF;

        -- Verrouillage obligatoire de l'école AVANT toute vérification d'exclusion mutuelle
        SELECT id, total_revenue_paid, affiliate_id, subscription_plan, paid_tranches_count
        INTO v_school_id, v_school_total_revenue, v_school_affiliate_id, v_school_plan, v_school_tranches_count
        FROM public.schools
        WHERE slug = v_intent.school_slug
        FOR UPDATE;

        IF v_school_id IS NULL THEN
            UPDATE public.payment_intents
            SET status = 'reconciliation_required',
                reconciliation_reason = 'SCHOOL_NOT_FOUND',
                updated_at = now()
            WHERE id = p_intent_id;

            RETURN jsonb_build_object(
                'success', false,
                'status', 'reconciliation_required',
                'reason', 'SCHOOL_NOT_FOUND',
                'intent_id', p_intent_id
            );
        END IF;

        -- Vérification d'exclusion mutuelle pour la période
        SELECT EXISTS (
            SELECT 1 FROM public.payment_intents
            WHERE school_slug = v_intent.school_slug
              AND billing_period = v_intent.billing_period
              AND payment_type = 'saas_subscription'
              AND plan_type = 'annual'
              AND status = 'completed'
        ) INTO v_existing_annual_completed;

        SELECT COUNT(*) INTO v_existing_tranches_completed
        FROM public.payment_intents
        WHERE school_slug = v_intent.school_slug
          AND billing_period = v_intent.billing_period
          AND payment_type = 'saas_subscription'
          AND plan_type = 'tranche'
          AND status = 'completed';

        IF v_intent.plan_type = 'annual' THEN
            IF v_existing_annual_completed OR v_existing_tranches_completed > 0 THEN
                UPDATE public.payment_intents
                SET status = 'reconciliation_required',
                    reconciliation_reason = 'PERIOD_CONFLICT_ANNUAL_DISALLOWED',
                    updated_at = now()
                WHERE id = p_intent_id;

                RETURN jsonb_build_object(
                    'success', false,
                    'status', 'reconciliation_required',
                    'reason', 'PERIOD_CONFLICT_ANNUAL_DISALLOWED',
                    'intent_id', p_intent_id
                );
            END IF;
            v_new_tranches_count := 3;

        ELSIF v_intent.plan_type = 'tranche' THEN
            IF v_existing_annual_completed THEN
                UPDATE public.payment_intents
                SET status = 'reconciliation_required',
                    reconciliation_reason = 'PERIOD_ALREADY_ANNUAL_SETTLED',
                    updated_at = now()
                WHERE id = p_intent_id;

                RETURN jsonb_build_object(
                    'success', false,
                    'status', 'reconciliation_required',
                    'reason', 'PERIOD_ALREADY_ANNUAL_SETTLED',
                    'intent_id', p_intent_id
                );
            END IF;

            -- Vérification que cette tranche précise n'a pas déjà été complétée
            IF EXISTS (
                SELECT 1 FROM public.payment_intents
                WHERE school_slug = v_intent.school_slug
                  AND billing_period = v_intent.billing_period
                  AND payment_type = 'saas_subscription'
                  AND plan_type = 'tranche'
                  AND installment_number = v_intent.installment_number
                  AND status = 'completed'
            ) THEN
                UPDATE public.payment_intents
                SET status = 'reconciliation_required',
                    reconciliation_reason = 'TRANCHE_ALREADY_COMPLETED',
                    updated_at = now()
                WHERE id = p_intent_id;

                RETURN jsonb_build_object(
                    'success', false,
                    'status', 'reconciliation_required',
                    'reason', 'TRANCHE_ALREADY_COMPLETED',
                    'intent_id', p_intent_id
                );
            END IF;

            v_new_tranches_count := v_existing_tranches_completed + 1;
        ELSE
            UPDATE public.payment_intents
            SET status = 'reconciliation_required',
                reconciliation_reason = 'INVALID_PLAN_TYPE',
                updated_at = now()
            WHERE id = p_intent_id;

            RETURN jsonb_build_object(
                'success', false,
                'status', 'reconciliation_required',
                'reason', 'INVALID_PLAN_TYPE',
                'intent_id', p_intent_id
            );
        END IF;

        -- Affilié optionnel
        IF v_school_affiliate_id IS NOT NULL THEN
            SELECT id, commission_rate, wallet_balance, total_earned
            INTO v_affiliate_id, v_affiliate_rate, v_affiliate_wallet, v_affiliate_earned
            FROM public.affiliates
            WHERE id = v_school_affiliate_id
            FOR UPDATE;

            IF v_affiliate_id IS NOT NULL THEN
                v_affiliate_rate := COALESCE(v_affiliate_rate, 20.0);
                v_commission_amount := (v_intent.expected_amount * v_affiliate_rate) / 100.0;

                UPDATE public.affiliates
                SET wallet_balance = COALESCE(wallet_balance, 0) + v_commission_amount,
                    total_earned = COALESCE(total_earned, 0) + v_commission_amount
                WHERE id = v_affiliate_id;

                INSERT INTO public.affiliate_transactions (affiliate_id, school_id, type, amount, description)
                VALUES (v_affiliate_id, v_school_id, 'commission', v_commission_amount, 'Commission abonnement Yziow ' || v_intent.billing_period);
            END IF;
        END IF;

        -- Mise à jour école (total payé et cache tranches)
        v_new_total_revenue := COALESCE(v_school_total_revenue, 0) + v_intent.expected_amount;
        UPDATE public.schools
        SET total_revenue_paid = v_new_total_revenue,
            subscription_plan = v_intent.plan_type,
            paid_tranches_count = v_new_tranches_count
        WHERE id = v_school_id;

        -- Finalisation de l'intention
        UPDATE public.payment_intents
        SET status = 'completed',
            provider_transaction_id = p_provider_transaction_id,
            completed_at = now(),
            updated_at = now()
        WHERE id = p_intent_id;

        RETURN jsonb_build_object(
            'success', true,
            'status', 'completed',
            'intent_id', p_intent_id,
            'provider_transaction_id', p_provider_transaction_id,
            'billing_period', v_intent.billing_period,
            'plan_type', v_intent.plan_type,
            'installment_number', v_intent.installment_number
        );
    END IF;

    -- Par défaut (autres types de paiement)
    UPDATE public.payment_intents
    SET status = 'completed',
        provider_transaction_id = p_provider_transaction_id,
        completed_at = now(),
        updated_at = now()
    WHERE id = p_intent_id;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'completed',
        'intent_id', p_intent_id,
        'provider_transaction_id', p_provider_transaction_id
    );
END;
$$;

ALTER FUNCTION public.process_fedapay_webhook_event(UUID, TEXT, NUMERIC, TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.process_fedapay_webhook_event(UUID, TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_fedapay_webhook_event(UUID, TEXT, NUMERIC, TEXT, TEXT) TO service_role, postgres;

COMMIT;
