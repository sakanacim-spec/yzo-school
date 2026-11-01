-- ==============================================================================
-- MIGRATION P28c : REMBOURSEMENT ADMINISTRATIF CERTIFIÉ PARENT PACK,
--                  COMPENSATION COMMISSIONS (ÉCOLE & AMBASSADEUR) ET
--                  RÉVOCATION SÉCURISÉE DES DROITS D'ACCÈS
-- ==============================================================================
-- Périmètre P28c :
--   1. Création de la table d'audit immuable parent_pack_refund_audits.
--   2. Mise à jour du déclencheur validate_parent_pack_intent() :
--      - Bloque fail-closed toute transition ordinaire vers 'refunded'.
--      - Autorise exclusivement la transition lorsque le jeton transactionnel
--        certifié est actif ET qu'une piste d'audit valide existe.
--   3. RPC administrative certifiée public.admin_process_parent_pack_refund() :
--      - Validation stricte de l'acteur SuperAdmin (public.superadmins).
--      - Verrouillage pessimiste de la période, de la souscription et de l'intent.
--      - Idempotence absolue (y compris requêtes concurrentes via advisory lock).
--      - Rejet si la période n'est pas active ou expirée.
--      - Annulation de la commission école via school_commission_ledger (type = 'cancellation').
--      - Reprise de la commission ambassadeur via affiliate_ledger (entry_type = 'refund_reversal').
--      - Ajustement fail-closed de affiliate_balances (déduction pending si en période
--        de refroidissement, déduction available sinon, et affectation à debt_balance_minor
--        si les fonds ont déjà été retirés ou sont insuffisants).
--      - Transition certifiée de la période vers 'refunded'.
--      - Recalcul du statut de parent_subscriptions ('active' si autre période active couvrant
--        CURRENT_DATE, 'expired' si autres périodes échues, 'canceled' si aucune autre période).
--      - Enregistrement complet de la piste d'audit (référence FedaPay, admin, motif).
--      - Droits d'exécution restreints exclusivement au rôle dédié yziow_refund_executor.
-- ==============================================================================

BEGIN;

-- 0. Rôle dédié pour l'exécution du remboursement
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'yziow_refund_executor') THEN
        CREATE ROLE yziow_refund_executor LOGIN;
    END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO yziow_refund_executor;

-- ------------------------------------------------------------------------------
-- 1. Table d'audit des remboursements Parent Pack
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.parent_pack_refund_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_id UUID NOT NULL REFERENCES public.parent_subscription_periods(id) ON DELETE RESTRICT,
    subscription_id UUID NOT NULL REFERENCES public.parent_subscriptions(id) ON DELETE RESTRICT,
    payment_intent_id UUID NOT NULL REFERENCES public.payment_intents(id) ON DELETE RESTRICT,
    provider_refund_id TEXT NOT NULL,
    admin_actor_id UUID NOT NULL REFERENCES public.superadmins(id) ON DELETE RESTRICT,
    reason TEXT NOT NULL,
    gross_amount_minor BIGINT NOT NULL,
    school_share_minor BIGINT NOT NULL,
    ambassador_share_minor BIGINT NOT NULL,
    yziow_share_minor BIGINT NOT NULL,
    deducted_from_pending_minor BIGINT NOT NULL DEFAULT 0,
    deducted_from_available_minor BIGINT NOT NULL DEFAULT 0,
    added_to_debt_minor BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_parent_pack_refund_period UNIQUE (period_id),
    CONSTRAINT uq_parent_pack_refund_provider UNIQUE (provider_refund_id)
);

ALTER TABLE public.parent_pack_refund_audits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.parent_pack_refund_audits FROM PUBLIC, anon, authenticated, service_role, yziow_refund_executor;

-- Immuabilité stricte de la piste d'audit (append-only)
CREATE OR REPLACE FUNCTION public.fn_prevent_refund_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RAISE EXCEPTION 'FAIL CLOSED: Modification ou suppression interdite sur la table d''audit des remboursements (%).', OLD.id;
END;
$$;

DROP TRIGGER IF EXISTS trg_immutable_parent_pack_refund_audits ON public.parent_pack_refund_audits;
CREATE TRIGGER trg_immutable_parent_pack_refund_audits
BEFORE UPDATE OR DELETE ON public.parent_pack_refund_audits
FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_refund_audit_mutation();

-- Mise à niveau des contraintes sur payment_intents pour supporter l'état 'refunded'
ALTER TABLE public.payment_intents
    DROP CONSTRAINT IF EXISTS chk_payment_intents_status;

ALTER TABLE public.payment_intents
    ADD CONSTRAINT chk_payment_intents_status
    CHECK (status = ANY (ARRAY['initializing'::text, 'pending'::text, 'completed'::text, 'cancelled'::text, 'reconciliation_required'::text, 'refunded'::text]));

ALTER TABLE public.payment_intents
    DROP CONSTRAINT IF EXISTS chk_payment_intents_processed_at;

ALTER TABLE public.payment_intents
    ADD CONSTRAINT chk_payment_intents_processed_at
    CHECK (
        ((status IN ('completed'::text, 'refunded'::text)) AND (processed_at IS NOT NULL))
        OR ((status NOT IN ('completed'::text, 'refunded'::text)) AND (processed_at IS NULL))
    );

-- ------------------------------------------------------------------------------
-- 2. Mise à jour de validate_parent_pack_intent() pour autoriser le parcours certifié
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_parent_pack_intent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_intent RECORD;
BEGIN
    IF NEW.payment_intent_id IS NULL THEN
        RAISE EXCEPTION 'FAIL CLOSED: payment_intent_id est obligatoire pour toute periode Parent Pack.';
    END IF;

    IF NEW.subscription_id IS NULL THEN
        RAISE EXCEPTION 'FAIL CLOSED: subscription_id est obligatoire pour toute periode Parent Pack.';
    END IF;

    -- Verrouillage de l'intention de paiement pour éviter toute course concurrente
    SELECT id, payment_type, target_id, status, processed_at, school_slug, metadata
    INTO v_intent
    FROM public.payment_intents
    WHERE id = NEW.payment_intent_id
    FOR KEY SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'FAIL CLOSED: payment_intent (%) introuvable pour la periode.', NEW.payment_intent_id;
    END IF;

    IF v_intent.payment_type IS DISTINCT FROM 'parent_pack' THEN
        RAISE EXCEPTION 'FAIL CLOSED: payment_intent (%) a un payment_type invalide (%). Attendu: parent_pack.',
            NEW.payment_intent_id, v_intent.payment_type;
    END IF;

    IF v_intent.target_id IS DISTINCT FROM NEW.subscription_id::text THEN
        RAISE EXCEPTION 'FAIL CLOSED: payment_intent (%) cible (%) mais la periode appartient a la souscription (%).',
            NEW.payment_intent_id, v_intent.target_id, NEW.subscription_id;
    END IF;

    -- --------------------------------------------------------------------------
    -- Règles à l'INSERTION d'une période
    -- --------------------------------------------------------------------------
    IF TG_OP = 'INSERT' THEN
        IF NEW.status = 'pending_payment' THEN
            IF v_intent.status NOT IN ('initializing', 'pending', 'completed') THEN
                RAISE EXCEPTION 'FAIL CLOSED: Impossible de creer une periode pending_payment avec un payment_intent au statut (%).',
                    v_intent.status;
            END IF;
        ELSIF NEW.status = 'active' THEN
            IF v_intent.status IS DISTINCT FROM 'completed' OR v_intent.processed_at IS NULL THEN
                RAISE EXCEPTION 'FAIL CLOSED: Impossible d''inserer une periode active tant que payment_intent (%) n''est pas completed avec processed_at non nul (statut actuel: %).',
                    NEW.payment_intent_id, v_intent.status;
            END IF;
        ELSE
            RAISE EXCEPTION 'FAIL CLOSED: Statut initial de periode (%) interdit a l''insertion. Seuls pending_payment et active sont autorises.',
                NEW.status;
        END IF;

        RETURN NEW;
    END IF;

    -- --------------------------------------------------------------------------
    -- Règles à la MISE À JOUR (UPDATE) d'une période
    -- --------------------------------------------------------------------------
    IF TG_OP = 'UPDATE' THEN
        -- Interdiction absolue de modifier le rattachement d'une période existante
        IF NEW.subscription_id IS DISTINCT FROM OLD.subscription_id THEN
            RAISE EXCEPTION 'FAIL CLOSED: Modification de subscription_id interdite sur parent_subscription_periods (% -> %).',
                OLD.subscription_id, NEW.subscription_id;
        END IF;

        IF NEW.payment_intent_id IS DISTINCT FROM OLD.payment_intent_id THEN
            RAISE EXCEPTION 'FAIL CLOSED: Modification de payment_intent_id interdite sur parent_subscription_periods (% -> %).',
                OLD.payment_intent_id, NEW.payment_intent_id;
        END IF;

        -- Interdiction de modifier les dates d'une période déjà payée / activée
        IF OLD.status IN ('active', 'expired', 'refunded') THEN
            IF NEW.start_date IS DISTINCT FROM OLD.start_date
               OR NEW.end_date IS DISTINCT FROM OLD.end_date THEN
                RAISE EXCEPTION 'FAIL CLOSED: Modification des dates (start_date/end_date) interdite sur une periode au statut (%).',
                    OLD.status;
            END IF;
        END IF;

        -- Cas où le statut ne change pas
        IF NEW.status = OLD.status THEN
            IF NEW.status IN ('active', 'expired', 'refunded') THEN
                IF v_intent.status NOT IN ('completed', 'refunded') OR v_intent.processed_at IS NULL THEN
                    RAISE EXCEPTION 'FAIL CLOSED: Une periode au statut (%) exige un payment_intent completed avec processed_at non nul.',
                        NEW.status;
                END IF;
            END IF;
            RETURN NEW;
        END IF;

        -- Transitions de statut autorisées
        IF OLD.status = 'pending_payment' AND NEW.status = 'active' THEN
            IF v_intent.status IS DISTINCT FROM 'completed' OR v_intent.processed_at IS NULL THEN
                RAISE EXCEPTION 'FAIL CLOSED: Transition pending_payment -> active refusee car payment_intent (%) n''est pas completed (statut: %).',
                    NEW.payment_intent_id, v_intent.status;
            END IF;
            RETURN NEW;

        ELSIF OLD.status = 'pending_payment' AND NEW.status = 'canceled' THEN
            IF v_intent.status = 'completed' THEN
                RAISE EXCEPTION 'FAIL CLOSED: Transition pending_payment -> canceled refusee car payment_intent (%) est deja completed.',
                    NEW.payment_intent_id;
            END IF;
            RETURN NEW;

        ELSIF OLD.status = 'active' AND NEW.status = 'expired' THEN
            IF v_intent.status IS DISTINCT FROM 'completed' OR v_intent.processed_at IS NULL THEN
                RAISE EXCEPTION 'FAIL CLOSED: Transition active -> expired refusee car payment_intent (%) n''est pas completed.',
                    NEW.payment_intent_id;
            END IF;
            RETURN NEW;

        ELSIF OLD.status IN ('active', 'expired') AND NEW.status = 'refunded' THEN
            -- Lot P28c : La transition vers 'refunded' est strictement réservée au parcours
            -- administratif certifié exécuté via public.admin_process_parent_pack_refund().
            -- Contrôles cumulatifs fail-closed :
            -- 1. Le jeton transactionnel administratif certifié doit être actif
            IF current_setting('yziow.certified_refund_active', true) IS DISTINCT FROM 'true' THEN
                RAISE EXCEPTION 'FAIL CLOSED: Transition vers refunded interdite par operation SQL ordinaire. Seule la RPC administrative certifiee admin_process_parent_pack_refund est autorisee.';
            END IF;

            -- 2. Une entrée d audit certifiée doit avoir été insérée pour cette période dans cette transaction
            IF NOT EXISTS (
                SELECT 1
                FROM public.parent_pack_refund_audits r
                WHERE r.period_id = NEW.id
                  AND r.payment_intent_id = NEW.payment_intent_id
            ) THEN
                RAISE EXCEPTION 'FAIL CLOSED: Transition vers refunded refusee : aucune piste d''audit administrative certifiee valide pour la periode (%).', NEW.id;
            END IF;

            -- 3. Le payment_intent doit avoir été initialement completed
            IF v_intent.status NOT IN ('completed', 'refunded') OR v_intent.processed_at IS NULL THEN
                RAISE EXCEPTION 'FAIL CLOSED: Transition vers refunded refusee car payment_intent (%) n''est pas completed.',
                    NEW.payment_intent_id;
            END IF;

            RETURN NEW;

        ELSE
            RAISE EXCEPTION 'FAIL CLOSED: Transition de statut de periode non autorisee (% -> %).',
                OLD.status, NEW.status;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------------
-- 2b. Mise à jour du trigger d'intégrité sur payment_intents (P28c)
-- Autorise la transition vers 'refunded' UNIQUEMENT dans le cadre d'un appel RPC certifié
-- avec session tag yziow.certified_refund_active = 'true' et audit présent.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_parent_pack_intent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_has_any_period BOOLEAN := false;
    v_has_paid_period BOOLEAN := false;
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.payment_type = 'parent_pack' THEN
            SELECT EXISTS (
                SELECT 1
                FROM public.parent_subscription_periods
                WHERE payment_intent_id = OLD.id
            ) INTO v_has_any_period;

            IF OLD.status = 'completed' OR v_has_any_period THEN
                RAISE EXCEPTION 'FAIL CLOSED: Suppression interdite d''un payment_intent Parent Pack (%) completed ou rattache a une periode.',
                    OLD.id;
            END IF;
        END IF;
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- Interdire le changement de payment_type depuis ou vers parent_pack
        IF OLD.payment_type = 'parent_pack' OR NEW.payment_type = 'parent_pack' THEN
            IF NEW.payment_type IS DISTINCT FROM OLD.payment_type THEN
                RAISE EXCEPTION 'FAIL CLOSED: Modification de payment_type interdite (% -> %) sur payment_intent (%).',
                    OLD.payment_type, NEW.payment_type, OLD.id;
            END IF;
        END IF;

        IF OLD.payment_type = 'parent_pack' THEN
            SELECT
                EXISTS (
                    SELECT 1
                    FROM public.parent_subscription_periods
                    WHERE payment_intent_id = OLD.id
                ),
                EXISTS (
                    SELECT 1
                    FROM public.parent_subscription_periods
                    WHERE payment_intent_id = OLD.id
                      AND status IN ('active', 'expired', 'refunded')
                )
            INTO v_has_any_period, v_has_paid_period;

            -- Dès que le paiement est complété OU qu'une période (même pending_payment) y est rattachée,
            -- les champs financiers et de rattachement sont figés.
            IF OLD.status = 'completed' OR v_has_any_period THEN
                IF NEW.target_id IS DISTINCT FROM OLD.target_id
                   OR NEW.expected_amount IS DISTINCT FROM OLD.expected_amount
                   OR NEW.expected_currency IS DISTINCT FROM OLD.expected_currency
                   OR NEW.school_slug IS DISTINCT FROM OLD.school_slug THEN
                    RAISE EXCEPTION 'FAIL CLOSED: Modification des champs financiers ou de rattachement (target_id, expected_amount, expected_currency, school_slug) interdite sur payment_intent (%).',
                        OLD.id;
                END IF;
            END IF;

            -- Une fois le paiement complété OU rattaché à une période payée (active, expired, refunded)
            IF OLD.status = 'completed' OR v_has_paid_period THEN
                IF NEW.status IS DISTINCT FROM 'completed' THEN
                    IF NEW.status = 'refunded' THEN
                        -- Autorisé UNIQUEMENT si le jeton administratif est actif ET audit présent
                        IF current_setting('yziow.certified_refund_active', true) IS DISTINCT FROM 'true' THEN
                            RAISE EXCEPTION 'FAIL CLOSED: Transition vers refunded sur payment_intent interdite par operation SQL ordinaire. Seule la RPC administrative certifiee est autorisee.';
                        END IF;
                        IF NOT EXISTS (
                            SELECT 1
                            FROM public.parent_pack_refund_audits a
                            WHERE a.payment_intent_id = NEW.id
                        ) THEN
                            RAISE EXCEPTION 'FAIL CLOSED: Transition vers refunded refusee : aucune piste d''audit administrative certifiee valide pour payment_intent (%).', NEW.id;
                        END IF;
                    ELSE
                        RAISE EXCEPTION 'FAIL CLOSED: Retrogradation ou changement de statut interdit sur un payment_intent Parent Pack completed (% -> %).',
                            OLD.status, NEW.status;
                    END IF;
                END IF;

                IF OLD.processed_at IS NOT NULL AND NEW.processed_at IS DISTINCT FROM OLD.processed_at THEN
                    RAISE EXCEPTION 'FAIL CLOSED: Modification de processed_at interdite sur un payment_intent Parent Pack completed (%).',
                        OLD.id;
                END IF;

                IF OLD.provider_transaction_id IS NOT NULL
                   AND NEW.provider_transaction_id IS DISTINCT FROM OLD.provider_transaction_id THEN
                    RAISE EXCEPTION 'FAIL CLOSED: Modification de provider_transaction_id interdite sur un payment_intent Parent Pack completed (%).',
                        OLD.id;
                END IF;

                IF NEW.metadata IS DISTINCT FROM OLD.metadata THEN
                    RAISE EXCEPTION 'FAIL CLOSED: Modification de metadata interdite sur un payment_intent Parent Pack completed (%).',
                        OLD.id;
                END IF;
            END IF;
        END IF;

        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. RPC administrative certifiée : public.admin_process_parent_pack_refund
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_process_parent_pack_refund(
    p_period_id UUID,
    p_provider_refund_id TEXT,
    p_admin_actor_id UUID,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin_name TEXT;
    v_period RECORD;
    v_sub RECORD;
    v_intent RECORD;
    v_orig_ledger RECORD;
    v_existing_audit RECORD;
    v_affiliate_id UUID;
    v_bal RECORD;
    v_comm_maturation TIMESTAMPTZ;
    v_comm_released BOOLEAN := false;
    v_pending_to_deduct BIGINT := 0;
    v_avail_to_deduct BIGINT := 0;
    v_debt_to_add BIGINT := 0;
    v_rem BIGINT := 0;
    v_cancellation_ledger_id UUID;
    v_affiliate_ledger_id UUID;
    v_refund_audit_id UUID;
    v_has_other_active BOOLEAN := false;
    v_has_other_periods BOOLEAN := false;
    v_new_sub_status TEXT;
BEGIN
    -- 1. Validation des arguments
    IF p_period_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: period_id est obligatoire';
    END IF;

    IF p_provider_refund_id IS NULL OR trim(p_provider_refund_id) = '' THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: provider_refund_id est obligatoire';
    END IF;

    IF p_admin_actor_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: admin_actor_id est obligatoire';
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: reason est obligatoire';
    END IF;

    -- 2. Validation effective de l'identité et du rôle SuperAdmin
    SELECT username INTO v_admin_name
    FROM public.superadmins
    WHERE id = p_admin_actor_id;

    IF v_admin_name IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED_ADMIN: SuperAdmin % introuvable ou non autorise', p_admin_actor_id;
    END IF;

    -- 3. Verrou consultatif transactionnel pour sérialiser les remboursements concurrents sur la période
    PERFORM pg_advisory_xact_lock(hashtext('parent_pack_refund_' || p_period_id::text));

    -- 4. Verrouillage pessimiste de la période
    SELECT * INTO v_period
    FROM public.parent_subscription_periods
    WHERE id = p_period_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PERIOD_NOT_FOUND: Periode % introuvable', p_period_id;
    END IF;

    -- 5. Idempotence : si la période est déjà au statut 'refunded'
    IF v_period.status = 'refunded' THEN
        SELECT * INTO v_existing_audit
        FROM public.parent_pack_refund_audits
        WHERE period_id = p_period_id;

        RETURN jsonb_build_object(
            'status', 'already_refunded',
            'period_id', p_period_id,
            'refund_audit_id', v_existing_audit.id,
            'provider_refund_id', v_existing_audit.provider_refund_id,
            'message', 'Cette periode a deja ete remboursee et compensee.'
        );
    END IF;

    -- Vérification de l'éligibilité du statut
    IF v_period.status NOT IN ('active', 'expired') THEN
        RAISE EXCEPTION 'INVALID_PERIOD_STATUS: Seules les periodes active ou expired peuvent etre remboursees (statut actuel: %)', v_period.status;
    END IF;

    -- Unicité du provider_refund_id
    IF EXISTS (
        SELECT 1 FROM public.parent_pack_refund_audits
        WHERE provider_refund_id = p_provider_refund_id
    ) THEN
        RAISE EXCEPTION 'DUPLICATE_PROVIDER_REFUND_ID: Le provider_refund_id (%) a deja ete utilise pour un autre remboursement', p_provider_refund_id;
    END IF;

    -- 6. Verrouillage de la souscription et de l'intention de paiement
    SELECT * INTO v_sub
    FROM public.parent_subscriptions
    WHERE id = v_period.subscription_id
    FOR UPDATE;

    SELECT * INTO v_intent
    FROM public.payment_intents
    WHERE id = v_period.payment_intent_id
    FOR UPDATE;

    IF v_intent.status IS DISTINCT FROM 'completed' OR v_intent.processed_at IS NULL THEN
        RAISE EXCEPTION 'INTENT_NOT_COMPLETED: Impossible de rembourser une periode dont le payment_intent (%) n''est pas completed', v_intent.id;
    END IF;

    -- 7. Verrouillage de l'écriture de commission d'origine (type = 'credit')
    SELECT * INTO v_orig_ledger
    FROM public.school_commission_ledger
    WHERE period_id = p_period_id
      AND type = 'credit'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'COMMISSION_LEDGER_NOT_FOUND: Aucune ecriture de commission credit trouvee pour la periode %', p_period_id;
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.school_commission_ledger
        WHERE original_ledger_id = v_orig_ledger.id
          AND type = 'cancellation'
    ) THEN
        RAISE EXCEPTION 'COMMISSION_ALREADY_CANCELLED: La commission pour la periode % a deja fait l''objet d''une cancellation', p_period_id;
    END IF;

    -- 8. Gestion de la commission ambassadeur et ajustement fail-closed du solde
    IF v_orig_ledger.ambassador_share_minor > 0 AND v_orig_ledger.ambassador_ref IS NOT NULL THEN
        SELECT id INTO v_affiliate_id
        FROM public.affiliates
        WHERE id::text = v_orig_ledger.ambassador_ref;

        IF v_affiliate_id IS NOT NULL THEN
            -- Verrouiller le solde de l'ambassadeur
            SELECT * INTO v_bal
            FROM public.affiliate_balances
            WHERE affiliate_id = v_affiliate_id
              AND currency = 'XOF'
            FOR UPDATE;

            IF FOUND THEN
                -- Vérifier la maturation et libération de la commission d'origine
                SELECT maturation_at INTO v_comm_maturation
                FROM public.affiliate_ledger
                WHERE payment_intent_id = v_period.payment_intent_id
                  AND entry_type = 'commission';

                SELECT EXISTS (
                    SELECT 1
                    FROM public.affiliate_commission_releases r
                    JOIN public.affiliate_ledger l ON l.id = r.ledger_entry_id
                    WHERE l.payment_intent_id = v_period.payment_intent_id
                      AND l.entry_type = 'commission'
                ) INTO v_comm_released;

                IF NOT v_comm_released AND (v_comm_maturation IS NULL OR v_comm_maturation > clock_timestamp()) THEN
                    -- Cas A : Commission encore en période de refroidissement (dans pending_balance_minor)
                    v_pending_to_deduct := LEAST(v_bal.pending_balance_minor, v_orig_ledger.ambassador_share_minor);
                    v_rem := v_orig_ledger.ambassador_share_minor - v_pending_to_deduct;
                    v_avail_to_deduct := LEAST(v_bal.available_balance_minor, v_rem);
                    v_debt_to_add := v_rem - v_avail_to_deduct;
                ELSE
                    -- Cas B : Commission déjà libérée / mature (dans available_balance_minor)
                    v_pending_to_deduct := 0;
                    v_avail_to_deduct := LEAST(v_bal.available_balance_minor, v_orig_ledger.ambassador_share_minor);
                    v_debt_to_add := v_orig_ledger.ambassador_share_minor - v_avail_to_deduct;
                END IF;

                -- Mise à jour fail-closed des soldes ambassadeur
                UPDATE public.affiliate_balances
                SET pending_balance_minor = pending_balance_minor - v_pending_to_deduct,
                    available_balance_minor = available_balance_minor - v_avail_to_deduct,
                    debt_balance_minor = debt_balance_minor + v_debt_to_add,
                    updated_at = clock_timestamp()
                WHERE affiliate_id = v_affiliate_id
                  AND currency = 'XOF';
            END IF;

            -- Inscription immuable dans affiliate_ledger
            -- (Contrat P13 : entry_type = 'refund_reversal', provider_refund_id non nul, payment_intent_id nul)
            INSERT INTO public.affiliate_ledger (
                affiliate_id,
                currency,
                entry_type,
                amount_minor,
                provider_refund_id,
                metadata
            ) VALUES (
                v_affiliate_id,
                'XOF',
                'refund_reversal',
                v_orig_ledger.ambassador_share_minor,
                p_provider_refund_id,
                jsonb_build_object(
                    'source', 'parent_pack_refund',
                    'period_id', p_period_id,
                    'payment_intent_id', v_period.payment_intent_id,
                    'admin_actor_id', p_admin_actor_id,
                    'reason', p_reason,
                    'deducted_from_pending', v_pending_to_deduct,
                    'deducted_from_available', v_avail_to_deduct,
                    'added_to_debt', v_debt_to_add
                )
            ) RETURNING id INTO v_affiliate_ledger_id;
        END IF;
    END IF;

    -- 9. Annulation de la commission école dans school_commission_ledger
    -- (Règle P19 : les montants d'une cancellation doivent être l'exact opposé négatif du crédit d'origine)
    INSERT INTO public.school_commission_ledger (
        period_id,
        school_slug,
        ambassador_ref,
        gross_amount_minor,
        fedapay_fee_minor,
        school_share_minor,
        ambassador_share_minor,
        yziow_share_minor,
        currency,
        type,
        original_ledger_id
    ) VALUES (
        p_period_id,
        v_orig_ledger.school_slug,
        v_orig_ledger.ambassador_ref,
        -v_orig_ledger.gross_amount_minor,
        -v_orig_ledger.fedapay_fee_minor,
        -v_orig_ledger.school_share_minor,
        -v_orig_ledger.ambassador_share_minor,
        -v_orig_ledger.yziow_share_minor,
        v_orig_ledger.currency,
        'cancellation',
        v_orig_ledger.id
    ) RETURNING id INTO v_cancellation_ledger_id;

    -- 10. Enregistrement de la piste d'audit certifiée
    INSERT INTO public.parent_pack_refund_audits (
        period_id,
        subscription_id,
        payment_intent_id,
        provider_refund_id,
        admin_actor_id,
        reason,
        gross_amount_minor,
        school_share_minor,
        ambassador_share_minor,
        yziow_share_minor,
        deducted_from_pending_minor,
        deducted_from_available_minor,
        added_to_debt_minor
    ) VALUES (
        p_period_id,
        v_sub.id,
        v_period.payment_intent_id,
        p_provider_refund_id,
        p_admin_actor_id,
        p_reason,
        v_orig_ledger.gross_amount_minor,
        v_orig_ledger.school_share_minor,
        v_orig_ledger.ambassador_share_minor,
        v_orig_ledger.yziow_share_minor,
        v_pending_to_deduct,
        v_avail_to_deduct,
        v_debt_to_add
    ) RETURNING id INTO v_refund_audit_id;

    -- 11. Transition certifiée de l'intention et de la période vers 'refunded'
    PERFORM set_config('yziow.certified_refund_active', 'true', true);

    IF v_period.payment_intent_id IS NOT NULL THEN
        UPDATE public.payment_intents
        SET status = 'refunded',
            updated_at = clock_timestamp()
        WHERE id = v_period.payment_intent_id;
    END IF;

    UPDATE public.parent_subscription_periods
    SET status = 'refunded',
        updated_at = clock_timestamp()
    WHERE id = p_period_id;

    PERFORM set_config('yziow.certified_refund_active', 'false', true);

    -- 12. Recalcul du statut de parent_subscriptions selon les valeurs autorisées ('active', 'expired', 'canceled')
    SELECT EXISTS (
        SELECT 1
        FROM public.parent_subscription_periods
        WHERE subscription_id = v_sub.id
          AND id <> p_period_id
          AND status = 'active'
          AND CURRENT_DATE BETWEEN start_date AND end_date
    ) INTO v_has_other_active;

    SELECT EXISTS (
        SELECT 1
        FROM public.parent_subscription_periods
        WHERE subscription_id = v_sub.id
          AND id <> p_period_id
          AND status IN ('active', 'expired')
    ) INTO v_has_other_periods;

    IF v_has_other_active THEN
        v_new_sub_status := 'active';
    ELSIF v_has_other_periods THEN
        v_new_sub_status := 'expired';
    ELSE
        v_new_sub_status := 'canceled';
    END IF;

    UPDATE public.parent_subscriptions
    SET status = v_new_sub_status,
        updated_at = clock_timestamp()
    WHERE id = v_sub.id;

    -- 13. Retour structuré de succès
    RETURN jsonb_build_object(
        'status', 'success',
        'period_id', p_period_id,
        'subscription_id', v_sub.id,
        'new_subscription_status', v_new_sub_status,
        'refund_audit_id', v_refund_audit_id,
        'provider_refund_id', p_provider_refund_id,
        'gross_refunded_minor', v_orig_ledger.gross_amount_minor,
        'school_cancelled_minor', v_orig_ledger.school_share_minor,
        'ambassador_cancelled_minor', v_orig_ledger.ambassador_share_minor,
        'affiliate_deducted_pending_minor', v_pending_to_deduct,
        'affiliate_deducted_available_minor', v_avail_to_deduct,
        'affiliate_added_to_debt_minor', v_debt_to_add
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. Permissions et sécurité
-- ------------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.admin_process_parent_pack_refund(UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_process_parent_pack_refund(UUID, TEXT, UUID, TEXT) TO yziow_refund_executor;

COMMIT;
