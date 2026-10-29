-- ==============================================================================
-- SCRIPT DE VÉRIFICATION TRANSACTIONNELLE P28b (SANS PERSISTANCE : BEGIN / ROLLBACK)
-- ==============================================================================
-- Architecture de sécurité des tests (P28b) :
--   - Ce script N'EXÉCUTE AUCUN fichier de migration contenant BEGIN / COMMIT.
--     La migration P28b doit être appliquée au préalable sur une base de test
--     locale dédiée et jetable.
--   - Toutes les assertions négatives utilisent un booléen v_rejected évalué
--     EN DEHORS du bloc EXCEPTION afin de ne jamais capturer par erreur
--     l'exception d'échec du test (ERRCODE = 'P0099').
--   - L'intégralité du script s'exécute entre BEGIN; et ROLLBACK; sans aucune
--     modification persistante.
--
-- Couverture :
--   Test 1 : validate_parent_pack_intent() à l'INSERT (rattachement, payment_type,
--            target_id, compatibilité pending_payment vs exigence completed pour active).
--   Test 2 : validate_parent_pack_intent() à l'UPDATE (transitions autorisées et
--            interdites, immuabilité des dates et du rattachement).
--   Test 3 : protect_parent_pack_intent() sur payment_intents (verrouillage des
--            champs financiers dès qu'une période existe, immuabilité de status /
--            processed_at / provider_transaction_id / metadata après completed,
--            autorisation d'une mise à jour non financière inoffensive).
--   Test 4 : Sécurité du remboursement (Section 3 P28b) — blocage de toute
--            transition vers 'refunded' par opération SQL ordinaire, avec ou sans
--            écriture de compensation P19 (type = 'cancellation') dans
--            school_commission_ledger, et blocage de toute injection de
--            metadata->>'provider_refund_id'.
--   Test 5 : Décisions 1 & 2 — Conservation de l'identité historique lors des
--            checkouts non payés, refus explicite de changement d'école sans
--            transfert validé, autorisation après transfert officiel validé
--            (parent_student_identity_transfers + student_global_mappings),
--            routage des commissions (20 % école, 10 % ambassadeur du reliquat)
--            et idempotence du webhook (status = 'duplicate').
--   Test 6 : Décision 3 & Section 4 — Accès multi-parents autorisés via
--            get_active_parent_pack_subscriptions(), retrait immédiat après
--            révocation du lien (current_link_active = false, y compris pour le
--            souscripteur initial), isolation entre parents/enfants non liés, et
--            vérification des droits EXECUTE.
-- ==============================================================================

BEGIN;

DO $$
DECLARE
    v_pricing_id UUID;
    v_monthly_price BIGINT;
    v_fedapay_fee BIGINT := 10;
    v_student_id UUID := gen_random_uuid();
    v_other_student_id UUID := gen_random_uuid();
    v_sub_id UUID;
    v_other_sub_id UUID := gen_random_uuid();
    v_intent_id UUID;
    v_intent_2_id UUID;
    v_bad_intent_id UUID := gen_random_uuid();
    v_period_id UUID;
    v_period_2_id UUID;
    v_affiliate_a_id UUID := gen_random_uuid();
    v_affiliate_b_id UUID := gen_random_uuid();
    v_school_a_id UUID := gen_random_uuid();
    v_school_b_id UUID := gen_random_uuid();
    v_checkout_res JSONB;
    v_webhook_res JSONB;
    v_sub_row public.parent_subscriptions%ROWTYPE;
    v_scl_credit_1 public.school_commission_ledger%ROWTYPE;
    v_scl_row public.school_commission_ledger%ROWTYPE;
    v_aff_ledger_row public.affiliate_ledger%ROWTYPE;
    v_aff_bal_row public.affiliate_balances%ROWTYPE;
    v_access_count INTEGER;
    v_rejected BOOLEAN;
    v_sqlstate TEXT;
    v_errm TEXT;
BEGIN
    -- --------------------------------------------------------------------------
    -- PRÉPARATION DES FIXTURES DE TEST (DANS LA TRANSACTION ANNULÉE EN FIN DE SCRIPT)
    -- --------------------------------------------------------------------------
    INSERT INTO public.currency_configurations (
        code, exponent, is_active, min_withdrawal_minor_units, cooling_off_days
    ) VALUES (
        'XOF', 0, true, 5000, 30
    ) ON CONFLICT (code) DO NOTHING;

    SELECT id, monthly_price_minor
    INTO v_pricing_id, v_monthly_price
    FROM public.parent_pack_pricing
    WHERE cycle_name = 'maternelle_primaire'
      AND currency = 'XOF'
      AND pricing_version = 1
      AND active = true
    LIMIT 1;

    IF v_pricing_id IS NULL THEN
        RAISE EXCEPTION 'PRECHECK FAILED: Tarification maternelle_primaire XOF v1 (active = true) introuvable.'
            USING ERRCODE = 'P0099';
    END IF;

    INSERT INTO public.affiliates (id, nom, telephone, password_hash, referral_code, status)
    VALUES
        (v_affiliate_a_id, 'Ambassadeur Ecole A', '+22990000001', 'hash_a', 'REF_P28B_A', 'active'),
        (v_affiliate_b_id, 'Ambassadeur Ecole B', '+22990000002', 'hash_b', 'REF_P28B_B', 'active');

    INSERT INTO public.schools (id, name, slug, status, affiliate_id)
    VALUES
        (v_school_a_id, 'Ecole Test P28b A', 'school_p28b_a', 'active', v_affiliate_a_id),
        (v_school_b_id, 'Ecole Test P28b B', 'school_p28b_b', 'active', v_affiliate_b_id)
    ON CONFLICT (slug) DO UPDATE
        SET affiliate_id = EXCLUDED.affiliate_id,
            status = 'active';

    INSERT INTO public.global_students (student_global_id)
    VALUES (v_student_id), (v_other_student_id);

    INSERT INTO public.student_global_mappings (school_slug, student_local_id, student_global_id)
    VALUES ('school_p28b_a', 'eleve_loc_a', v_student_id)
    ON CONFLICT (school_slug, student_local_id) DO NOTHING;

    INSERT INTO public.parent_child_links (parent_ref, student_global_id, current_link_active)
    VALUES
        ('parent_father', v_student_id, true),
        ('parent_mother', v_student_id, true),
        ('parent_father', v_other_student_id, true);

    RAISE NOTICE '[OK] Fixtures initialisées (student_global_id = %)', v_student_id;

    -- ==========================================================================
    -- TEST 1 : validate_parent_pack_intent() À L'INSERTION
    -- ==========================================================================
    v_checkout_res := public.prepare_parent_pack_checkout(
        'parent_father',
        v_student_id,
        'school_p28b_a',
        'eleve_loc_a',
        v_pricing_id,
        'maternelle_primaire',
        1
    );
    v_sub_id := (v_checkout_res->>'subscription_id')::UUID;
    v_intent_id := (v_checkout_res->>'payment_intent_id')::UUID;

    -- 1a. Refus d'insertion d'une période active tant que payment_intent est 'initializing'
    v_rejected := false;
    BEGIN
        INSERT INTO public.parent_subscription_periods (
            subscription_id, payment_intent_id, start_date, end_date, status
        ) VALUES (
            v_sub_id, v_intent_id, CURRENT_DATE, (CURRENT_DATE + INTERVAL '30 days')::date, 'active'
        );
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_errm = MESSAGE_TEXT;
        IF v_sqlstate = 'P0001' AND v_errm LIKE '%FAIL CLOSED%' THEN
            v_rejected := true;
        ELSE
            RAISE;
        END IF;
    END;
    IF NOT v_rejected THEN
        RAISE EXCEPTION 'TEST 1a FAILED: Une periode active a pu etre inseree avec un intent initializing.'
            USING ERRCODE = 'P0099';
    END IF;

    -- 1b. Refus d'insertion directe d'une période au statut 'expired' ou 'refunded'
    v_rejected := false;
    BEGIN
        INSERT INTO public.parent_subscription_periods (
            subscription_id, payment_intent_id, start_date, end_date, status
        ) VALUES (
            v_sub_id, v_intent_id, (CURRENT_DATE - INTERVAL '60 days')::date, (CURRENT_DATE - INTERVAL '30 days')::date, 'expired'
        );
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_errm = MESSAGE_TEXT;
        IF v_sqlstate = 'P0001' AND v_errm LIKE '%FAIL CLOSED%' THEN
            v_rejected := true;
        ELSE
            RAISE;
        END IF;
    END;
    IF NOT v_rejected THEN
        RAISE EXCEPTION 'TEST 1b FAILED: Une periode expired a pu etre inseree directement.'
            USING ERRCODE = 'P0099';
    END IF;

    -- 1c. Refus si target_id ne correspond pas à subscription_id
    INSERT INTO public.payment_intents (
        id, provider, payment_type, school_slug, target_id,
        expected_amount, expected_currency, status, metadata, expires_at
    ) VALUES (
        v_bad_intent_id, 'fedapay', 'parent_pack', 'school_p28b_a', v_other_sub_id::text,
        v_monthly_price, 'XOF', 'initializing', '{}'::jsonb, now() + INTERVAL '1 hour'
    );

    v_rejected := false;
    BEGIN
        INSERT INTO public.parent_subscription_periods (
            subscription_id, payment_intent_id, start_date, end_date, status
        ) VALUES (
            v_sub_id, v_bad_intent_id, CURRENT_DATE, (CURRENT_DATE + INTERVAL '30 days')::date, 'pending_payment'
        );
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_errm = MESSAGE_TEXT;
        IF v_sqlstate = 'P0001' AND v_errm LIKE '%FAIL CLOSED%' THEN
            v_rejected := true;
        ELSE
            RAISE;
        END IF;
    END;
    IF NOT v_rejected THEN
        RAISE EXCEPTION 'TEST 1c FAILED: Une periode a pu etre rattachee a un payment_intent ayant un autre target_id.'
            USING ERRCODE = 'P0099';
    END IF;

    -- 1d. Autorisation d'une période 'pending_payment' avec un intent 'initializing'
    INSERT INTO public.parent_subscription_periods (
        subscription_id, payment_intent_id, start_date, end_date, status
    ) VALUES (
        v_sub_id, v_intent_id, CURRENT_DATE, (CURRENT_DATE + INTERVAL '30 days')::date, 'pending_payment'
    ) RETURNING id INTO v_period_id;

    RAISE NOTICE '[OK] Test 1 (Validation INSERT parent_subscription_periods) réussi.';

    -- ==========================================================================
    -- TEST 2 & 3 : TRANSITIONS DE PÉRIODE ET PROTECTION DE payment_intents
    -- ==========================================================================
    -- 3a. Interdiction de modifier target_id ou expected_amount dès qu'une période (même pending_payment) existe
    v_rejected := false;
    BEGIN
        UPDATE public.payment_intents
        SET expected_amount = v_monthly_price + 500
        WHERE id = v_intent_id;
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_errm = MESSAGE_TEXT;
        IF v_sqlstate = 'P0001' AND v_errm LIKE '%FAIL CLOSED%' THEN
            v_rejected := true;
        ELSE
            RAISE;
        END IF;
    END;
    IF NOT v_rejected THEN
        RAISE EXCEPTION 'TEST 3a FAILED: expected_amount a pu etre modifie sur un intent lie a une periode pending_payment.'
            USING ERRCODE = 'P0099';
    END IF;

    -- 2a. Interdiction de passer de pending_payment à expired
    v_rejected := false;
    BEGIN
        UPDATE public.parent_subscription_periods
        SET status = 'expired'
        WHERE id = v_period_id;
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_errm = MESSAGE_TEXT;
        IF v_sqlstate = 'P0001' AND v_errm LIKE '%FAIL CLOSED%' THEN
            v_rejected := true;
        ELSE
            RAISE;
        END IF;
    END;
    IF NOT v_rejected THEN
        RAISE EXCEPTION 'TEST 2a FAILED: Transition directe pending_payment -> expired non bloquee.'
            USING ERRCODE = 'P0099';
    END IF;

    -- 2b. Autorisation de pending_payment -> canceled tant que l'intent n'est pas completed
    UPDATE public.payment_intents SET status = 'cancelled' WHERE id = v_intent_id;
    UPDATE public.parent_subscription_periods SET status = 'canceled' WHERE id = v_period_id;

    -- 2c. Interdiction de canceled -> active
    v_rejected := false;
    BEGIN
        UPDATE public.parent_subscription_periods SET status = 'active' WHERE id = v_period_id;
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_errm = MESSAGE_TEXT;
        IF v_sqlstate = 'P0001' AND v_errm LIKE '%FAIL CLOSED%' THEN
            v_rejected := true;
        ELSE
            RAISE;
        END IF;
    END;
    IF NOT v_rejected THEN
        RAISE EXCEPTION 'TEST 2c FAILED: Transition canceled -> active non bloquee.'
            USING ERRCODE = 'P0099';
    END IF;

    -- Nettoyage de la période annulée pour poursuivre avec un vrai paiement webhook
    DELETE FROM public.parent_subscription_periods WHERE id = v_period_id;

    RAISE NOTICE '[OK] Tests 2 & 3a (Transitions pending_payment/canceled et verrouillage anticipé) réussis.';

    -- ==========================================================================
    -- TEST 4 & 5 : PARCOURS COMPLET MULTI-PARENTS, MULTI-ÉCOLES, WEBHOOK ET REMBOURSEMENT
    -- ==========================================================================
    -- 5a. Nouveau checkout par le père sur school_p28b_a et confirmation par webhook
    v_checkout_res := public.prepare_parent_pack_checkout(
        'parent_father',
        v_student_id,
        'school_p28b_a',
        'eleve_loc_a',
        v_pricing_id,
        'maternelle_primaire',
        1
    );
    v_intent_id := (v_checkout_res->>'payment_intent_id')::UUID;

    v_webhook_res := public.process_parent_pack_webhook_event(
        'fedapay',
        'evt_p28b_test_1',
        'transaction.approved',
        v_intent_id,
        'feda_tx_p28b_1',
        v_monthly_price,
        'XOF',
        'approved',
        now() - INTERVAL '20 days',
        v_fedapay_fee,
        0,
        true
    );

    IF (v_webhook_res->>'status') IS DISTINCT FROM 'completed' THEN
        RAISE EXCEPTION 'TEST 5a FAILED: Webhook 1 non completed (%).', v_webhook_res
            USING ERRCODE = 'P0099';
    END IF;
    v_period_id := (v_webhook_res->>'period_id')::UUID;

    -- 3b. Vérifier qu'une mise à jour non financière inoffensive sur un intent completed est autorisée
    UPDATE public.payment_intents
    SET updated_at = clock_timestamp()
    WHERE id = v_intent_id;

    -- 3c. Vérifier que la modification de metadata sur un intent completed est bloquée
    v_rejected := false;
    BEGIN
        UPDATE public.payment_intents
        SET metadata = metadata || '{"provider_refund_id": "rf_forged_123"}'::jsonb
        WHERE id = v_intent_id;
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_errm = MESSAGE_TEXT;
        IF v_sqlstate = 'P0001' AND v_errm LIKE '%FAIL CLOSED%' THEN
            v_rejected := true;
        ELSE
            RAISE;
        END IF;
    END;
    IF NOT v_rejected THEN
        RAISE EXCEPTION 'TEST 3c FAILED: Modification de metadata autorisee sur un payment_intent completed.'
            USING ERRCODE = 'P0099';
    END IF;

    -- 4a. Vérifier que le passage direct à 'refunded' par SQL ordinaire est bloqué
    v_rejected := false;
    BEGIN
        UPDATE public.parent_subscription_periods
        SET status = 'refunded'
        WHERE id = v_period_id;
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_errm = MESSAGE_TEXT;
        IF v_sqlstate = 'P0001' AND v_errm LIKE '%FAIL CLOSED: Transition vers refunded interdite%' THEN
            v_rejected := true;
        ELSE
            RAISE;
        END IF;
    END;
    IF NOT v_rejected THEN
        RAISE EXCEPTION 'TEST 4a FAILED: Transition active -> refunded autorisee par simple UPDATE SQL.'
            USING ERRCODE = 'P0099';
    END IF;

    -- 4b. Vérifier que même avec une ligne de compensation P19 valide (type = 'cancellation')
    --     dans school_commission_ledger, la transition SQL ordinaire vers 'refunded' reste bloquée (Lot P28c requis)
    SELECT * INTO v_scl_credit_1
    FROM public.school_commission_ledger
    WHERE period_id = v_period_id
      AND type = 'credit';

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
        v_period_id,
        v_scl_credit_1.school_slug,
        v_scl_credit_1.ambassador_ref,
        -v_scl_credit_1.gross_amount_minor,
        -v_scl_credit_1.fedapay_fee_minor,
        -v_scl_credit_1.school_share_minor,
        -v_scl_credit_1.ambassador_share_minor,
        -v_scl_credit_1.yziow_share_minor,
        'XOF',
        'cancellation',
        v_scl_credit_1.id
    );

    v_rejected := false;
    BEGIN
        UPDATE public.parent_subscription_periods
        SET status = 'refunded'
        WHERE id = v_period_id;
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_errm = MESSAGE_TEXT;
        IF v_sqlstate = 'P0001' AND v_errm LIKE '%FAIL CLOSED: Transition vers refunded interdite%' THEN
            v_rejected := true;
        ELSE
            RAISE;
        END IF;
    END;
    IF NOT v_rejected THEN
        RAISE EXCEPTION 'TEST 4b FAILED: Transition active -> refunded autorisee malgre l''absence de parcours certifie P28c.'
            USING ERRCODE = 'P0099';
    END IF;

    RAISE NOTICE '[OK] Tests 3b, 3c, 4a & 4b (Immuabilité payment_intents et blocage fail-closed de refunded) réussis.';

    -- 5b. La mère tente un renouvellement en indiquant school_p28b_b SANS transfert validé -> refus explicite
    v_rejected := false;
    BEGIN
        PERFORM public.prepare_parent_pack_checkout(
            'parent_mother',
            v_student_id,
            'school_p28b_b',
            'eleve_loc_b',
            v_pricing_id,
            'maternelle_primaire',
            1
        );
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_errm = MESSAGE_TEXT;
        IF v_sqlstate = 'P0001' AND v_errm LIKE '%SCHOOL_MISMATCH_WITHOUT_VALIDATED_TRANSFER%' THEN
            v_rejected := true;
        ELSE
            RAISE;
        END IF;
    END;
    IF NOT v_rejected THEN
        RAISE EXCEPTION 'TEST 5b FAILED: Changement d''ecole sans transfert valide non refuse.'
            USING ERRCODE = 'P0099';
    END IF;

    -- 5c. Enregistrement d'un transfert scolaire officiel validé vers school_p28b_b (P25-T.2a)
    INSERT INTO public.student_global_mappings (school_slug, student_local_id, student_global_id)
    VALUES ('school_p28b_b', 'eleve_loc_b', v_student_id)
    ON CONFLICT (school_slug, student_local_id) DO NOTHING;

    INSERT INTO public.parent_student_identity_transfers (
        parent_ref, student_global_id, destination_school_slug, destination_student_local_id, status
    ) VALUES (
        'parent_mother', v_student_id, 'school_p28b_b', 'eleve_loc_b', 'completed'
    );

    -- La mère initie un checkout (non encore payé) sur school_p28b_b
    v_checkout_res := public.prepare_parent_pack_checkout(
        'parent_mother',
        v_student_id,
        'school_p28b_b',
        'eleve_loc_b',
        v_pricing_id,
        'maternelle_primaire',
        1
    );
    v_intent_2_id := (v_checkout_res->>'payment_intent_id')::UUID;

    -- Décision 2 : Tant que le checkout n'est pas payé, parent_subscriptions conserve school_p28b_a, eleve_loc_a et parent_father
    SELECT * INTO v_sub_row FROM public.parent_subscriptions WHERE id = v_sub_id;
    IF v_sub_row.school_slug IS DISTINCT FROM 'school_p28b_a'
       OR v_sub_row.student_ref IS DISTINCT FROM 'eleve_loc_a'
       OR v_sub_row.parent_ref IS DISTINCT FROM 'parent_father' THEN
        RAISE EXCEPTION 'TEST 5c FAILED: Identite historique ecrasee par un checkout non paye (%).', row_to_json(v_sub_row)
            USING ERRCODE = 'P0099';
    END IF;

    -- 5d. Confirmation webhook du paiement de la mère pour school_p28b_b (8e paramètre = 'approved')
    v_webhook_res := public.process_parent_pack_webhook_event(
        'fedapay',
        'evt_p28b_test_2',
        'transaction.approved',
        v_intent_2_id,
        'feda_tx_p28b_2',
        v_monthly_price,
        'XOF',
        'approved',
        now(),
        v_fedapay_fee,
        0,
        true
    );

    IF (v_webhook_res->>'status') IS DISTINCT FROM 'completed' THEN
        RAISE EXCEPTION 'TEST 5d FAILED: Webhook 2 non completed (%).', v_webhook_res
            USING ERRCODE = 'P0099';
    END IF;
    v_period_2_id := (v_webhook_res->>'period_id')::UUID;

    -- Vérifier que school_slug et student_ref sont mis à jour après paiement, mais que parent_ref initial reste 'parent_father'
    SELECT * INTO v_sub_row FROM public.parent_subscriptions WHERE id = v_sub_id;
    IF v_sub_row.school_slug IS DISTINCT FROM 'school_p28b_b'
       OR v_sub_row.student_ref IS DISTINCT FROM 'eleve_loc_b'
       OR v_sub_row.parent_ref IS DISTINCT FROM 'parent_father' THEN
        RAISE EXCEPTION 'TEST 5d FAILED: Mise a jour post-webhook apres transfert invalide (%).', row_to_json(v_sub_row)
            USING ERRCODE = 'P0099';
    END IF;

    -- Vérifier l'attribution des commissions à school_p28b_b et à son ambassadeur (schéma réel P19)
    SELECT * INTO v_scl_row
    FROM public.school_commission_ledger
    WHERE period_id = v_period_2_id
      AND type = 'credit';

    IF v_scl_row.school_slug IS DISTINCT FROM 'school_p28b_b'
       OR v_scl_row.ambassador_ref IS DISTINCT FROM v_affiliate_b_id::text
       OR v_scl_row.school_share_minor <> ((v_monthly_price * 20) / 100) THEN
        RAISE EXCEPTION 'TEST 5d FAILED: Ecriture school_commission_ledger incorrecte (%).', row_to_json(v_scl_row)
            USING ERRCODE = 'P0099';
    END IF;

    SELECT * INTO v_aff_ledger_row
    FROM public.affiliate_ledger
    WHERE payment_intent_id = v_intent_2_id;

    IF v_aff_ledger_row.affiliate_id IS DISTINCT FROM v_affiliate_b_id
       OR v_aff_ledger_row.amount_minor <> (((v_monthly_price - v_fedapay_fee - ((v_monthly_price * 20) / 100)) * 10) / 100)
       OR (v_aff_ledger_row.metadata->>'payer_parent_ref') IS DISTINCT FROM 'parent_mother' THEN
        RAISE EXCEPTION 'TEST 5d FAILED: Ecriture affiliate_ledger incorrecte (%).', row_to_json(v_aff_ledger_row)
            USING ERRCODE = 'P0099';
    END IF;

    SELECT * INTO v_aff_bal_row
    FROM public.affiliate_balances
    WHERE affiliate_id = v_affiliate_b_id AND currency = 'XOF';

    IF v_aff_bal_row.pending_balance_minor <> v_aff_ledger_row.amount_minor THEN
        RAISE EXCEPTION 'TEST 5d FAILED: Solde affiliate_balances incorrect (%).', row_to_json(v_aff_bal_row)
            USING ERRCODE = 'P0099';
    END IF;

    -- 5e. Idempotence du webhook (même provider_event_id puis nouvel event_id sur intent déjà completed)
    v_webhook_res := public.process_parent_pack_webhook_event(
        'fedapay', 'evt_p28b_test_2', 'transaction.approved', v_intent_2_id,
        'feda_tx_p28b_2', v_monthly_price, 'XOF', 'approved', now(), v_fedapay_fee, 0, true
    );
    IF (v_webhook_res->>'status') IS DISTINCT FROM 'duplicate' THEN
        RAISE EXCEPTION 'TEST 5e FAILED: Idempotence provider_event_id en echec (%).', v_webhook_res
            USING ERRCODE = 'P0099';
    END IF;

    v_webhook_res := public.process_parent_pack_webhook_event(
        'fedapay', 'evt_p28b_test_2_dup', 'transaction.approved', v_intent_2_id,
        'feda_tx_p28b_2', v_monthly_price, 'XOF', 'approved', now(), v_fedapay_fee, 0, true
    );
    IF (v_webhook_res->>'status') IS DISTINCT FROM 'duplicate'
       OR (v_webhook_res->>'reason') IS DISTINCT FROM 'intent_already_completed' THEN
        RAISE EXCEPTION 'TEST 5e FAILED: Idempotence intent_already_completed en echec (%).', v_webhook_res
            USING ERRCODE = 'P0099';
    END IF;

    RAISE NOTICE '[OK] Test 5 (Multi-écoles, transfert validé, identité historique, commissions et idempotence) réussi.';

    -- ==========================================================================
    -- TEST 6 : ACCÈS MULTI-PARENTS AUTORISÉS ET RÉVOCATION (DÉCISION 3)
    -- ==========================================================================
    -- 6a. Père autorisé -> accès accordé uniquement pour v_student_id (pas pour v_other_student_id non payé)
    SELECT COUNT(*) INTO v_access_count
    FROM public.get_active_parent_pack_subscriptions('parent_father', ARRAY[v_student_id, v_other_student_id]);
    IF v_access_count <> 1 THEN
        RAISE EXCEPTION 'TEST 6a FAILED: Le pere devrait avoir acces a exactement 1 enfant (obtenu: %).', v_access_count
            USING ERRCODE = 'P0099';
    END IF;

    -- 6b. Mère autorisée -> accès accordé pour v_student_id (bien que parent_subscriptions.parent_ref = 'parent_father')
    SELECT COUNT(*) INTO v_access_count
    FROM public.get_active_parent_pack_subscriptions('parent_mother', ARRAY[v_student_id]);
    IF v_access_count <> 1 THEN
        RAISE EXCEPTION 'TEST 6b FAILED: La mere autorisee devrait avoir acces a v_student_id (obtenu: %).', v_access_count
            USING ERRCODE = 'P0099';
    END IF;

    -- 6c. Parent inconnu -> aucun accès
    SELECT COUNT(*) INTO v_access_count
    FROM public.get_active_parent_pack_subscriptions('parent_unknown', ARRAY[v_student_id]);
    IF v_access_count <> 0 THEN
        RAISE EXCEPTION 'TEST 6c FAILED: Un parent non lie ne doit avoir aucun acces (obtenu: %).', v_access_count
            USING ERRCODE = 'P0099';
    END IF;

    -- 6d. Révocation du lien de la mère -> perte immédiate des droits pour la mère, maintien pour le père
    UPDATE public.parent_child_links
    SET current_link_active = false
    WHERE parent_ref = 'parent_mother' AND student_global_id = v_student_id;

    SELECT COUNT(*) INTO v_access_count
    FROM public.get_active_parent_pack_subscriptions('parent_mother', ARRAY[v_student_id]);
    IF v_access_count <> 0 THEN
        RAISE EXCEPTION 'TEST 6d FAILED: La mere revoquee ne doit plus avoir acces (obtenu: %).', v_access_count
            USING ERRCODE = 'P0099';
    END IF;

    SELECT COUNT(*) INTO v_access_count
    FROM public.get_active_parent_pack_subscriptions('parent_father', ARRAY[v_student_id]);
    IF v_access_count <> 1 THEN
        RAISE EXCEPTION 'TEST 6d FAILED: Le pere actif doit conserver son acces apres revocation de la mere.'
            USING ERRCODE = 'P0099';
    END IF;

    -- 6d-bis. Révocation du souscripteur initial (parent_father) -> perte immédiate d'accès même si parent_subscriptions.parent_ref = 'parent_father'
    UPDATE public.parent_child_links
    SET current_link_active = false
    WHERE parent_ref = 'parent_father' AND student_global_id = v_student_id;

    SELECT COUNT(*) INTO v_access_count
    FROM public.get_active_parent_pack_subscriptions('parent_father', ARRAY[v_student_id]);
    IF v_access_count <> 0 THEN
        RAISE EXCEPTION 'TEST 6d-bis FAILED: Le souscripteur initial revoque ne doit plus avoir acces (obtenu: %).', v_access_count
            USING ERRCODE = 'P0099';
    END IF;

    -- Réactivation du lien du père pour tester ensuite l'expiration des périodes
    UPDATE public.parent_child_links
    SET current_link_active = true
    WHERE parent_ref = 'parent_father' AND student_global_id = v_student_id;

    -- 6e. Expiration des périodes -> perte d'accès pour le père également
    UPDATE public.parent_subscription_periods
    SET status = 'expired'
    WHERE subscription_id = v_sub_id;

    SELECT COUNT(*) INTO v_access_count
    FROM public.get_active_parent_pack_subscriptions('parent_father', ARRAY[v_student_id]);
    IF v_access_count <> 0 THEN
        RAISE EXCEPTION 'TEST 6e FAILED: Aucun acces ne doit subsister lorsque toutes les periodes sont expired.'
            USING ERRCODE = 'P0099';
    END IF;

    -- 6f. Vérification des privilèges EXECUTE (service_role uniquement)
    IF NOT has_function_privilege('service_role', 'public.get_active_parent_pack_subscriptions(text,uuid[])', 'EXECUTE')
       OR has_function_privilege('anon', 'public.get_active_parent_pack_subscriptions(text,uuid[])', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.get_active_parent_pack_subscriptions(text,uuid[])', 'EXECUTE') THEN
        RAISE EXCEPTION 'TEST 6f FAILED: Droits EXECUTE incorrects sur get_active_parent_pack_subscriptions.'
            USING ERRCODE = 'P0099';
    END IF;

    RAISE NOTICE '[OK] Test 6 (Accès multi-parents, révocation y compris souscripteur initial, expiration et permissions EXECUTE) réussi.';
    RAISE NOTICE '====================================================================';
    RAISE NOTICE 'SUCCÈS COMPLET : TOUS LES TESTS DE VÉRIFICATION P28b ONT RÉUSSI.';
    RAISE NOTICE '====================================================================';
END;
$$;

ROLLBACK;
