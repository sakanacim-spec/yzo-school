-- ============================================================
-- 🔒 MIGRATION P2 — SYSTÈME TRANSACTIONNEL & IDEMPOTENCE FEDAPAY
-- ============================================================
-- Architecture Fail-Closed à deux temps :
-- 1. Table centralisée payment_intents pour tracer toute intention de paiement
-- 2. Fonction RPC atomique process_fedapay_webhook_event (SECURITY DEFINER)

BEGIN;

-- ============================================================
-- 1. CRÉATION FAIL-CLOSED DE LA TABLE public.payment_intents
-- ============================================================

CREATE TABLE public.payment_intents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL DEFAULT 'fedapay',
    provider_transaction_id TEXT NULL,
    payment_type TEXT NOT NULL,
    school_slug TEXT NOT NULL,
    target_id TEXT NOT NULL,
    secondary_id TEXT NULL,
    expected_amount NUMERIC(12, 0) NOT NULL,
    expected_currency TEXT NOT NULL DEFAULT 'XOF',
    status TEXT NOT NULL DEFAULT 'initializing',
    plan_type TEXT NULL,
    collected_by_platform BOOLEAN NOT NULL DEFAULT true,
    created_by UUID NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    processed_at TIMESTAMPTZ NULL,
    reconciliation_reason TEXT NULL,

    -- Contraintes d'intégrité strictes
    CONSTRAINT chk_payment_intents_provider_not_empty
        CHECK (length(trim(provider)) > 0),
    CONSTRAINT chk_payment_intents_tx_id_not_empty
        CHECK (provider_transaction_id IS NULL OR length(trim(provider_transaction_id)) > 0),
    CONSTRAINT chk_payment_intents_payment_type
        CHECK (payment_type IN ('saas_subscription', 'donation', 'tuition')),
    CONSTRAINT chk_payment_intents_school_slug
        CHECK (school_slug ~ '^[a-z0-9_]{1,50}$'),
    CONSTRAINT chk_payment_intents_target_id_not_empty
        CHECK (length(trim(target_id)) > 0),
    CONSTRAINT chk_payment_intents_secondary_id_scope
        CHECK ((payment_type = 'donation' AND secondary_id IS NOT NULL AND length(trim(secondary_id)) > 0)
            OR (payment_type != 'donation' AND secondary_id IS NULL)),
    CONSTRAINT chk_payment_intents_expected_amount
        CHECK (expected_amount > 0 AND expected_amount = trunc(expected_amount)),
    CONSTRAINT chk_payment_intents_expected_currency
        CHECK (expected_currency = 'XOF'),
    CONSTRAINT chk_payment_intents_status
        CHECK (status IN ('initializing', 'pending', 'completed', 'cancelled', 'reconciliation_required')),
    CONSTRAINT chk_payment_intents_plan_type
        CHECK ((payment_type = 'saas_subscription' AND plan_type IN ('annual', 'tranche'))
            OR (payment_type != 'saas_subscription' AND plan_type IS NULL)),
    CONSTRAINT chk_payment_intents_processed_at
        CHECK ((status = 'completed' AND processed_at IS NOT NULL)
            OR (status != 'completed' AND processed_at IS NULL)),
    CONSTRAINT chk_payment_intents_reconciliation_reason
        CHECK (reconciliation_reason IS NULL OR length(trim(reconciliation_reason)) > 0),
    CONSTRAINT uq_payment_intents_provider_tx
        UNIQUE (provider, provider_transaction_id)
);

-- ============================================================
-- 2. INDEX D'IDEMPOTENCE ET DE PRÉVENTION DES INITIALISATIONS ACTIVES
-- ============================================================

-- A. Unicité par élève actif pour les frais de scolarité
CREATE UNIQUE INDEX uq_active_tuition_intent
    ON public.payment_intents (payment_type, school_slug, target_id)
    WHERE payment_type = 'tuition' AND status IN ('initializing', 'pending');

-- B. Unicité par école active pour l'abonnement SaaS
CREATE UNIQUE INDEX uq_active_saas_intent
    ON public.payment_intents (payment_type, school_slug)
    WHERE payment_type = 'saas_subscription' AND status IN ('initializing', 'pending');

-- C. Index de recherche pour la réconciliation et le statut
CREATE INDEX idx_payment_intents_status_created
    ON public.payment_intents (status, created_at);

CREATE INDEX idx_payment_intents_provider_tx_lookup
    ON public.payment_intents (provider, provider_transaction_id)
    WHERE provider_transaction_id IS NOT NULL;

-- ============================================================
-- 3. ROW LEVEL SECURITY & PRIVILÈGES DE LA TABLE
-- ============================================================

ALTER TABLE public.payment_intents ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.payment_intents FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.payment_intents TO service_role, postgres;

CREATE POLICY service_role_full_access_payment_intents
    ON public.payment_intents
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================================
-- 4. FONCTION RPC ATOMIQUE DE TRAITEMENT DU WEBHOOK
-- ============================================================

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
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_intent public.payment_intents%ROWTYPE;
    v_rows_updated INTEGER;

    -- Variables pour scolarité (tuition)
    v_students_table TEXT;
    v_payments_table TEXT;
    v_student_pk TEXT;
    v_student_ecolage NUMERIC;
    v_student_deja_paye NUMERIC;
    v_remaining_balance NUMERIC;
    v_new_deja_paye NUMERIC;
    v_payment_ref TEXT;
    v_payment_exists BOOLEAN;

    -- Variables pour donation
    v_campaigns_table TEXT;
    v_donations_table TEXT;
    v_donation_pk UUID;
    v_donation_campaign_id UUID;
    v_donation_amount NUMERIC;
    v_donation_currency TEXT;
    v_donation_canonical_currency TEXT;
    v_donation_tx_id TEXT;
    v_donation_status TEXT;

    -- Variables pour SaaS
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
BEGIN
    -- 1. Validation stricte et préalable des paramètres entrants (aucun NULL ni valeur vide toléré)
    IF p_intent_id IS NULL
       OR p_provider_transaction_id IS NULL
       OR length(trim(p_provider_transaction_id)) = 0
       OR p_remote_amount IS NULL
       OR p_remote_amount <= 0
       OR p_remote_amount != trunc(p_remote_amount)
       OR p_remote_currency IS NULL
       OR length(trim(p_remote_currency)) = 0
       OR p_remote_status IS NULL
       OR length(trim(p_remote_status)) = 0
    THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'rejected',
            'reason', 'INVALID_RPC_PARAMETERS',
            'intent_id', p_intent_id,
            'provider_transaction_id', p_provider_transaction_id
        );
    END IF;

    -- 2. Verrouillage exclusif de l'intention locale
    SELECT * INTO v_intent
    FROM public.payment_intents
    WHERE id = p_intent_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'rejected',
            'reason', 'INTENT_NOT_FOUND',
            'intent_id', p_intent_id,
            'provider_transaction_id', p_provider_transaction_id
        );
    END IF;

    -- 3. Vérification du fournisseur
    IF v_intent.provider IS DISTINCT FROM 'fedapay' THEN
        UPDATE public.payment_intents
        SET status = 'reconciliation_required',
            reconciliation_reason = 'UNSUPPORTED_PROVIDER',
            updated_at = now()
        WHERE id = p_intent_id;

        RETURN jsonb_build_object(
            'success', false,
            'status', 'reconciliation_required',
            'reason', 'UNSUPPORTED_PROVIDER',
            'intent_id', p_intent_id,
            'provider_transaction_id', p_provider_transaction_id
        );
    END IF;

    -- 4. Traitement des états terminaux ou en anomalie
    IF v_intent.status = 'completed' THEN
        -- Vérification stricte des données distantes pour l'idempotence completed
        IF v_intent.provider_transaction_id IS DISTINCT FROM p_provider_transaction_id
           OR p_remote_amount IS DISTINCT FROM v_intent.expected_amount
           OR p_remote_currency IS DISTINCT FROM v_intent.expected_currency
           OR p_remote_status IS DISTINCT FROM 'approved'
        THEN
            RETURN jsonb_build_object(
                'success', false,
                'status', 'rejected',
                'reason', 'COMPLETED_INTENT_REMOTE_MISMATCH',
                'intent_id', p_intent_id,
                'provider_transaction_id', p_provider_transaction_id
            );
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'status', 'duplicate',
            'message', 'ALREADY_COMPLETED',
            'intent_id', p_intent_id,
            'provider_transaction_id', p_provider_transaction_id
        );
    ELSIF v_intent.status = 'cancelled' THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'rejected',
            'reason', 'INTENT_CANCELLED',
            'intent_id', p_intent_id,
            'provider_transaction_id', p_provider_transaction_id
        );
    ELSIF v_intent.status = 'reconciliation_required' THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'reconciliation_required',
            'reason', COALESCE(v_intent.reconciliation_reason, 'RECONCILIATION_REQUIRED'),
            'intent_id', p_intent_id,
            'provider_transaction_id', p_provider_transaction_id
        );
    END IF;

    -- 5. Gestion de la liaison tardive du provider_transaction_id
    IF v_intent.provider_transaction_id IS NULL THEN
        -- Vérification d'unicité préalable (arbitrée définitivement par la contrainte UNIQUE)
        IF EXISTS (
            SELECT 1 FROM public.payment_intents
            WHERE provider = 'fedapay'
              AND provider_transaction_id = p_provider_transaction_id
              AND id != p_intent_id
        ) THEN
            UPDATE public.payment_intents
            SET status = 'reconciliation_required',
                reconciliation_reason = 'DUPLICATE_PROVIDER_TRANSACTION_ID',
                updated_at = now()
            WHERE id = p_intent_id;

            RETURN jsonb_build_object(
                'success', false,
                'status', 'reconciliation_required',
                'reason', 'DUPLICATE_PROVIDER_TRANSACTION_ID',
                'intent_id', p_intent_id,
                'provider_transaction_id', p_provider_transaction_id
            );
        END IF;

        UPDATE public.payment_intents
        SET provider_transaction_id = p_provider_transaction_id,
            updated_at = now()
        WHERE id = p_intent_id;

        v_intent.provider_transaction_id := p_provider_transaction_id;
    ELSE
        -- Correspondance stricte exigée si déjà lié
        IF v_intent.provider_transaction_id IS DISTINCT FROM p_provider_transaction_id THEN
            UPDATE public.payment_intents
            SET status = 'reconciliation_required',
                reconciliation_reason = 'PROVIDER_TRANSACTION_ID_MISMATCH',
                updated_at = now()
            WHERE id = p_intent_id;

            RETURN jsonb_build_object(
                'success', false,
                'status', 'reconciliation_required',
                'reason', 'PROVIDER_TRANSACTION_ID_MISMATCH',
                'intent_id', p_intent_id,
                'provider_transaction_id', p_provider_transaction_id
            );
        END IF;
    END IF;

    -- 6. Contrôle du statut distant FedaPay
    IF p_remote_status IS DISTINCT FROM 'approved' THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'rejected',
            'reason', 'REMOTE_STATUS_NOT_APPROVED',
            'intent_id', p_intent_id,
            'provider_transaction_id', p_provider_transaction_id
        );
    END IF;

    -- 7. Contrôle de cohérence du montant et de la devise
    IF p_remote_amount IS DISTINCT FROM v_intent.expected_amount
       OR p_remote_currency IS DISTINCT FROM v_intent.expected_currency
    THEN
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

    -- 8. Validation stricte du school_slug
    IF v_intent.school_slug !~ '^[a-z0-9_]{1,50}$' THEN
        UPDATE public.payment_intents
        SET status = 'reconciliation_required',
            reconciliation_reason = 'INVALID_SCHOOL_SLUG_FORMAT',
            updated_at = now()
        WHERE id = p_intent_id;

        RETURN jsonb_build_object(
            'success', false,
            'status', 'reconciliation_required',
            'reason', 'INVALID_SCHOOL_SLUG_FORMAT',
            'intent_id', p_intent_id,
            'provider_transaction_id', p_provider_transaction_id
        );
    END IF;

    -- ========================================================
    -- 9. EXÉCUTION MÉTIER ATOMIQUE PAR FLUX
    -- ========================================================

    IF v_intent.payment_type = 'tuition' THEN
        -- ----------------------------------------------------
        -- FLUX SCOLARITÉ
        -- ----------------------------------------------------
        v_students_table := 'students_' || v_intent.school_slug;
        v_payments_table := 'payments_' || v_intent.school_slug;

        -- Vérification d'existence des tables dynamiques
        IF NOT EXISTS (
            SELECT 1 FROM pg_catalog.pg_class c
            JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relname = v_students_table AND c.relkind IN ('r', 'p')
        ) OR NOT EXISTS (
            SELECT 1 FROM pg_catalog.pg_class c
            JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relname = v_payments_table AND c.relkind IN ('r', 'p')
        ) THEN
            UPDATE public.payment_intents
            SET status = 'reconciliation_required',
                reconciliation_reason = 'DYNAMIC_TABLE_NOT_FOUND',
                updated_at = now()
            WHERE id = p_intent_id;

            RETURN jsonb_build_object(
                'success', false,
                'status', 'reconciliation_required',
                'reason', 'DYNAMIC_TABLE_NOT_FOUND',
                'intent_id', p_intent_id,
                'provider_transaction_id', p_provider_transaction_id
            );
        END IF;

        -- Verrouillage et sélection explicite de l'élève
        EXECUTE format('SELECT id, ecolage, deja_paye FROM public.%I WHERE id = $1 FOR UPDATE', v_students_table)
        INTO v_student_pk, v_student_ecolage, v_student_deja_paye
        USING v_intent.target_id;

        IF v_student_pk IS NULL THEN
            UPDATE public.payment_intents
            SET status = 'reconciliation_required',
                reconciliation_reason = 'STUDENT_NOT_FOUND',
                updated_at = now()
            WHERE id = p_intent_id;

            RETURN jsonb_build_object(
                'success', false,
                'status', 'reconciliation_required',
                'reason', 'STUDENT_NOT_FOUND',
                'intent_id', p_intent_id,
                'provider_transaction_id', p_provider_transaction_id
            );
        END IF;

        -- Contrôles de validité des montants de scolarité
        IF v_student_ecolage IS NULL OR v_student_ecolage < 0 OR v_student_deja_paye IS NULL OR v_student_deja_paye < 0 THEN
            UPDATE public.payment_intents
            SET status = 'reconciliation_required',
                reconciliation_reason = 'INVALID_STUDENT_FINANCIAL_RECORD',
                updated_at = now()
            WHERE id = p_intent_id;

            RETURN jsonb_build_object(
                'success', false,
                'status', 'reconciliation_required',
                'reason', 'INVALID_STUDENT_FINANCIAL_RECORD',
                'intent_id', p_intent_id,
                'provider_transaction_id', p_provider_transaction_id
            );
        END IF;

        v_remaining_balance := v_student_ecolage - v_student_deja_paye;

        -- Vérification que le solde restant est strictement positif et suffisant
        IF v_remaining_balance <= 0 OR v_intent.expected_amount > v_remaining_balance THEN
            UPDATE public.payment_intents
            SET status = 'reconciliation_required',
                reconciliation_reason = 'EXCEEDS_REMAINING_BALANCE',
                updated_at = now()
            WHERE id = p_intent_id;

            RETURN jsonb_build_object(
                'success', false,
                'status', 'reconciliation_required',
                'reason', 'EXCEEDS_REMAINING_BALANCE',
                'intent_id', p_intent_id,
                'provider_transaction_id', p_provider_transaction_id
            );
        END IF;

        v_new_deja_paye := v_student_deja_paye + v_intent.expected_amount;

        -- Mise à jour financière unique : deja_paye (statut scolaire non touché)
        EXECUTE format('UPDATE public.%I SET deja_paye = $1 WHERE id = $2', v_students_table)
        USING v_new_deja_paye, v_intent.target_id;

        GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
        IF v_rows_updated != 1 THEN
            RAISE EXCEPTION 'STUDENT_UPDATE_FAILED';
        END IF;

        -- Insertion de la quittance dans payments_<slug>
        v_payment_ref := 'FEDAPAY_' || p_provider_transaction_id;

        EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE reference = $1)', v_payments_table)
        INTO v_payment_exists
        USING v_payment_ref;

        IF NOT v_payment_exists THEN
            EXECUTE format('INSERT INTO public.%I (id, student_id, montant, date, methode, reference, enregistre_par) VALUES ($1, $2, $3, now(), $4, $5, $6)', v_payments_table)
            USING gen_random_uuid()::text, v_intent.target_id, v_intent.expected_amount, 'Mobile Money', v_payment_ref, 'Yziow Pay Webhook';

            GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
            IF v_rows_updated != 1 THEN
                RAISE EXCEPTION 'PAYMENT_INSERT_FAILED';
            END IF;
        END IF;

        -- Mise à jour des fonds collectés par la plateforme pour l'école
        IF v_intent.collected_by_platform THEN
            UPDATE public.schools
            SET platform_collected_amount = COALESCE(platform_collected_amount, 0) + v_intent.expected_amount
            WHERE slug = v_intent.school_slug;

            GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
            IF v_rows_updated != 1 THEN
                RAISE EXCEPTION 'SCHOOL_COLLECTED_UPDATE_FAILED';
            END IF;
        END IF;

    ELSIF v_intent.payment_type = 'donation' THEN
        -- ----------------------------------------------------
        -- FLUX DONATION
        -- ----------------------------------------------------
        -- Validation préalable de forme UUID pour target_id et secondary_id avant tout cast
        IF v_intent.target_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           OR v_intent.secondary_id IS NULL
           OR v_intent.secondary_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN
            UPDATE public.payment_intents
            SET status = 'reconciliation_required',
                reconciliation_reason = 'INVALID_DONATION_IDENTIFIERS',
                updated_at = now()
            WHERE id = p_intent_id;

            RETURN jsonb_build_object(
                'success', false,
                'status', 'reconciliation_required',
                'reason', 'INVALID_DONATION_IDENTIFIERS',
                'intent_id', p_intent_id,
                'provider_transaction_id', p_provider_transaction_id
            );
        END IF;

        v_campaigns_table := 'campaigns_' || v_intent.school_slug;
        v_donations_table := 'donations_' || v_intent.school_slug;

        IF NOT EXISTS (
            SELECT 1 FROM pg_catalog.pg_class c
            JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relname = v_campaigns_table AND c.relkind IN ('r', 'p')
        ) OR NOT EXISTS (
            SELECT 1 FROM pg_catalog.pg_class c
            JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relname = v_donations_table AND c.relkind IN ('r', 'p')
        ) THEN
            UPDATE public.payment_intents
            SET status = 'reconciliation_required',
                reconciliation_reason = 'DYNAMIC_TABLE_NOT_FOUND',
                updated_at = now()
            WHERE id = p_intent_id;

            RETURN jsonb_build_object(
                'success', false,
                'status', 'reconciliation_required',
                'reason', 'DYNAMIC_TABLE_NOT_FOUND',
                'intent_id', p_intent_id,
                'provider_transaction_id', p_provider_transaction_id
            );
        END IF;

        -- Verrouillage et extraction complète de l'enregistrement de don (casts UUID sécurisés)
        EXECUTE format('SELECT id, campaign_id, amount, currency, transaction_id, status FROM public.%I WHERE id = $1 FOR UPDATE', v_donations_table)
        INTO v_donation_pk, v_donation_campaign_id, v_donation_amount, v_donation_currency, v_donation_tx_id, v_donation_status
        USING v_intent.secondary_id::uuid;

        IF v_donation_pk IS NULL THEN
            UPDATE public.payment_intents
            SET status = 'reconciliation_required',
                reconciliation_reason = 'DONATION_RECORD_NOT_FOUND',
                updated_at = now()
            WHERE id = p_intent_id;

            RETURN jsonb_build_object(
                'success', false,
                'status', 'reconciliation_required',
                'reason', 'DONATION_RECORD_NOT_FOUND',
                'intent_id', p_intent_id,
                'provider_transaction_id', p_provider_transaction_id
            );
        END IF;

        -- Vérification que le don est bien en statut 'pending'
        IF v_donation_status IS DISTINCT FROM 'pending' THEN
            UPDATE public.payment_intents
            SET status = 'reconciliation_required',
                reconciliation_reason = 'DONATION_NOT_PENDING',
                updated_at = now()
            WHERE id = p_intent_id;

            RETURN jsonb_build_object(
                'success', false,
                'status', 'reconciliation_required',
                'reason', 'DONATION_NOT_PENDING',
                'intent_id', p_intent_id,
                'provider_transaction_id', p_provider_transaction_id
            );
        END IF;

        -- Normalisation canonique de la devise du don ('FCFA' équivaut à 'XOF')
        v_donation_canonical_currency := CASE
            WHEN v_donation_currency = 'FCFA' THEN 'XOF'
            ELSE v_donation_currency
        END;

        -- Contrôles de correspondance stricts avec l'intention
        IF v_donation_campaign_id::text IS DISTINCT FROM v_intent.target_id
           OR v_donation_pk::text IS DISTINCT FROM v_intent.secondary_id
           OR v_donation_amount IS DISTINCT FROM v_intent.expected_amount
           OR v_donation_canonical_currency IS DISTINCT FROM v_intent.expected_currency
           OR (v_donation_tx_id IS NOT NULL AND v_donation_tx_id IS DISTINCT FROM p_provider_transaction_id)
        THEN
            UPDATE public.payment_intents
            SET status = 'reconciliation_required',
                reconciliation_reason = 'DONATION_DATA_MISMATCH',
                updated_at = now()
            WHERE id = p_intent_id;

            RETURN jsonb_build_object(
                'success', false,
                'status', 'reconciliation_required',
                'reason', 'DONATION_DATA_MISMATCH',
                'intent_id', p_intent_id,
                'provider_transaction_id', p_provider_transaction_id
            );
        END IF;

        -- Mise à jour du don vers 'completed'
        EXECUTE format('UPDATE public.%I SET status = ''completed'', transaction_id = $1 WHERE id = $2', v_donations_table)
        USING p_provider_transaction_id, v_donation_pk;

        GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
        IF v_rows_updated != 1 THEN
            RAISE EXCEPTION 'DONATION_UPDATE_FAILED';
        END IF;

        -- Mise à jour du montant collecté de la campagne (sans updated_at)
        EXECUTE format('UPDATE public.%I SET current_amount = COALESCE(current_amount, 0) + $1 WHERE id = $2', v_campaigns_table)
        USING v_intent.expected_amount, v_intent.target_id::uuid;

        GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
        IF v_rows_updated != 1 THEN
            RAISE EXCEPTION 'CAMPAIGN_UPDATE_FAILED';
        END IF;

        -- Mise à jour du solde collecté par l'école
        UPDATE public.schools
        SET platform_collected_amount = COALESCE(platform_collected_amount, 0) + v_intent.expected_amount
        WHERE slug = v_intent.school_slug;

        GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
        IF v_rows_updated != 1 THEN
            RAISE EXCEPTION 'SCHOOL_DONATION_COLLECTED_UPDATE_FAILED';
        END IF;

    ELSIF v_intent.payment_type = 'saas_subscription' THEN
        -- ----------------------------------------------------
        -- FLUX ABONNEMENT SAAS
        -- ----------------------------------------------------
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
                'intent_id', p_intent_id,
                'provider_transaction_id', p_provider_transaction_id
            );
        END IF;

        -- Liaison stricte : l'école verrouillée doit correspondre à target_id
        IF v_school_id::text IS DISTINCT FROM v_intent.target_id THEN
            UPDATE public.payment_intents
            SET status = 'reconciliation_required',
                reconciliation_reason = 'SCHOOL_TARGET_MISMATCH',
                updated_at = now()
            WHERE id = p_intent_id;

            RETURN jsonb_build_object(
                'success', false,
                'status', 'reconciliation_required',
                'reason', 'SCHOOL_TARGET_MISMATCH',
                'intent_id', p_intent_id,
                'provider_transaction_id', p_provider_transaction_id
            );
        END IF;

        -- Validation fail-closed du plan d'abonnement
        IF v_intent.plan_type IS DISTINCT FROM 'annual' AND v_intent.plan_type IS DISTINCT FROM 'tranche' THEN
            UPDATE public.payment_intents
            SET status = 'reconciliation_required',
                reconciliation_reason = 'INVALID_INTENT_PLAN_TYPE',
                updated_at = now()
            WHERE id = p_intent_id;

            RETURN jsonb_build_object(
                'success', false,
                'status', 'reconciliation_required',
                'reason', 'INVALID_INTENT_PLAN_TYPE',
                'intent_id', p_intent_id,
                'provider_transaction_id', p_provider_transaction_id
            );
        END IF;

        -- Vérification de verrouillage si un plan existe déjà
        IF v_school_plan IS NOT NULL AND v_school_plan IS DISTINCT FROM v_intent.plan_type THEN
            UPDATE public.payment_intents
            SET status = 'reconciliation_required',
                reconciliation_reason = 'SUBSCRIPTION_PLAN_MISMATCH',
                updated_at = now()
            WHERE id = p_intent_id;

            RETURN jsonb_build_object(
                'success', false,
                'status', 'reconciliation_required',
                'reason', 'SUBSCRIPTION_PLAN_MISMATCH',
                'intent_id', p_intent_id,
                'provider_transaction_id', p_provider_transaction_id
            );
        END IF;

        v_school_tranches_count := COALESCE(v_school_tranches_count, 0);

        -- Calcul strict du nombre de tranches payées (maximum 3 tranches au total)
        IF v_intent.plan_type = 'tranche' THEN
            IF v_school_tranches_count < 0 OR v_school_tranches_count > 2 THEN
                UPDATE public.payment_intents
                SET status = 'reconciliation_required',
                    reconciliation_reason = 'TRANCHES_LIMIT_REACHED',
                    updated_at = now()
                WHERE id = p_intent_id;

                RETURN jsonb_build_object(
                    'success', false,
                    'status', 'reconciliation_required',
                    'reason', 'TRANCHES_LIMIT_REACHED',
                    'intent_id', p_intent_id,
                    'provider_transaction_id', p_provider_transaction_id
                );
            END IF;
            v_new_tranches_count := v_school_tranches_count + 1;
        ELSIF v_intent.plan_type = 'annual' THEN
            IF v_school_tranches_count != 0 THEN
                UPDATE public.payment_intents
                SET status = 'reconciliation_required',
                    reconciliation_reason = 'ANNUAL_PLAN_REQUIRES_ZERO_TRANCHES',
                    updated_at = now()
                WHERE id = p_intent_id;

                RETURN jsonb_build_object(
                    'success', false,
                    'status', 'reconciliation_required',
                    'reason', 'ANNUAL_PLAN_REQUIRES_ZERO_TRANCHES',
                    'intent_id', p_intent_id,
                    'provider_transaction_id', p_provider_transaction_id
                );
            END IF;
            v_new_tranches_count := 3;
        END IF;

        IF v_new_tranches_count > 3 THEN
            UPDATE public.payment_intents
            SET status = 'reconciliation_required',
                reconciliation_reason = 'INVALID_TRANCHES_COUNT_RESULT',
                updated_at = now()
            WHERE id = p_intent_id;

            RETURN jsonb_build_object(
                'success', false,
                'status', 'reconciliation_required',
                'reason', 'INVALID_TRANCHES_COUNT_RESULT',
                'intent_id', p_intent_id,
                'provider_transaction_id', p_provider_transaction_id
            );
        END IF;

        -- Si un affilié est associé, validation et verrouillage AVANT toute écriture sur schools
        IF v_school_affiliate_id IS NOT NULL THEN
            SELECT id, commission_rate, wallet_balance, total_earned
            INTO v_affiliate_id, v_affiliate_rate, v_affiliate_wallet, v_affiliate_earned
            FROM public.affiliates
            WHERE id = v_school_affiliate_id
            FOR UPDATE;

            IF v_affiliate_id IS NULL THEN
                UPDATE public.payment_intents
                SET status = 'reconciliation_required',
                    reconciliation_reason = 'AFFILIATE_NOT_FOUND',
                    updated_at = now()
                WHERE id = p_intent_id;

                RETURN jsonb_build_object(
                    'success', false,
                    'status', 'reconciliation_required',
                    'reason', 'AFFILIATE_NOT_FOUND',
                    'intent_id', p_intent_id,
                    'provider_transaction_id', p_provider_transaction_id
                );
            END IF;

            v_affiliate_rate := COALESCE(v_affiliate_rate, 20.0);
            IF v_affiliate_rate < 0 OR v_affiliate_rate > 100 THEN
                RAISE EXCEPTION 'INVALID_AFFILIATE_COMMISSION_RATE';
            END IF;
        END IF;

        v_new_total_revenue := COALESCE(v_school_total_revenue, 0) + v_intent.expected_amount;

        UPDATE public.schools
        SET total_revenue_paid = v_new_total_revenue,
            subscription_plan = v_intent.plan_type,
            paid_tranches_count = v_new_tranches_count
        WHERE id = v_school_id;

        GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
        IF v_rows_updated != 1 THEN
            RAISE EXCEPTION 'SCHOOL_SUBSCRIPTION_UPDATE_FAILED';
        END IF;

        -- Exécution de la rémunération de l'affilié validé
        IF v_school_affiliate_id IS NOT NULL THEN
            v_commission_amount := (v_intent.expected_amount * v_affiliate_rate) / 100.0;

            UPDATE public.affiliates
            SET wallet_balance = COALESCE(wallet_balance, 0) + v_commission_amount,
                total_earned = COALESCE(total_earned, 0) + v_commission_amount
            WHERE id = v_affiliate_id;

            GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
            IF v_rows_updated != 1 THEN
                RAISE EXCEPTION 'AFFILIATE_UPDATE_FAILED';
            END IF;

            INSERT INTO public.affiliate_transactions (affiliate_id, school_id, type, amount, description)
            VALUES (
                v_affiliate_id,
                v_school_id,
                'commission',
                v_commission_amount,
                'Commission (' || v_affiliate_rate || '%) sur abonnement ' || v_intent.school_slug || ' (Ref: ' || p_provider_transaction_id || ')'
            );

            GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
            IF v_rows_updated != 1 THEN
                RAISE EXCEPTION 'AFFILIATE_TRANSACTION_INSERT_FAILED';
            END IF;
        END IF;

    ELSE
        UPDATE public.payment_intents
        SET status = 'reconciliation_required',
            reconciliation_reason = 'UNKNOWN_PAYMENT_TYPE',
            updated_at = now()
        WHERE id = p_intent_id;

        RETURN jsonb_build_object(
            'success', false,
            'status', 'reconciliation_required',
            'reason', 'UNKNOWN_PAYMENT_TYPE',
            'intent_id', p_intent_id,
            'provider_transaction_id', p_provider_transaction_id
        );
    END IF;

    -- ========================================================
    -- 10. CLÔTURE DÉFINITIVE DE L'INTENTION (STATUT COMPLETED)
    -- ========================================================

    UPDATE public.payment_intents
    SET status = 'completed',
        processed_at = now(),
        updated_at = now(),
        reconciliation_reason = NULL
    WHERE id = p_intent_id;

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    IF v_rows_updated != 1 THEN
        RAISE EXCEPTION 'INTENT_COMPLETION_UPDATE_FAILED';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'completed',
        'intent_id', p_intent_id,
        'provider_transaction_id', p_provider_transaction_id
    );
END;
$$;

-- Attribution du propriétaire de la fonction à postgres
ALTER FUNCTION public.process_fedapay_webhook_event(UUID, TEXT, NUMERIC, TEXT, TEXT) OWNER TO postgres;

-- Révocation et attribution stricte des privilèges d'exécution RPC
REVOKE ALL ON FUNCTION public.process_fedapay_webhook_event(UUID, TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_fedapay_webhook_event(UUID, TEXT, NUMERIC, TEXT, TEXT) TO service_role, postgres;

COMMIT;
