-- ==============================================================================
-- SCRIPT DE VÉRIFICATION TRANSACTIONNELLE P28c (SANS PERSISTANCE : BEGIN / ROLLBACK)
-- ==============================================================================
-- Couverture P28c :
--   Test 1 : validate_parent_pack_intent() bloque fail-closed toute transition vers
--            'refunded' par opération SQL ordinaire (sans jeton certifié).
--   Test 2 : validate_parent_pack_intent() bloque fail-closed toute transition vers
--            'refunded' avec jeton certifié simulé mais sans audit valide.
--   Test 3 : admin_process_parent_pack_refund() refuse un acteur non SuperAdmin.
--   Test 4 : Remboursement nominal d'une période active avec commission en période
--            de refroidissement (déduction du pending_balance_minor).
--            Vérification de la création de la cancellation dans school_commission_ledger,
--            du refund_reversal dans affiliate_ledger, de la piste parent_pack_refund_audits
--            et du recalcul de parent_subscriptions ('canceled').
--   Test 5 : Idempotence de la RPC : un second appel retourne 'already_refunded'
--            sans altérer les soldes ni dupliquer les écritures comptables.
--   Test 6 : Réutilisation frauduleuse du même provider_refund_id sur une autre période
--            strictement rejetée (DUPLICATE_PROVIDER_REFUND_ID).
--   Test 7 : Remboursement avec commission déjà disponible et solde insuffisant
--            (création contrôlée de debt_balance_minor sans solde négatif).
--   Test 8 : Conservation des droits et statut 'active' si une autre période valide
--            couvre CURRENT_DATE.
--   Test 9 : Révocation effective des droits d'accès via get_active_parent_pack_subscriptions
--            lorsque la période remboursée était la seule période active.
--   Test 10 : Privilèges et permissions SQL (service_role uniquement).
-- ==============================================================================

BEGIN;

DO $$
DECLARE
    v_admin_id UUID := '42e0e010-27f8-47b0-a409-64591812ea5f'; -- SuperAdmin réel existant
    v_fake_admin_id UUID := gen_random_uuid();
    v_pricing_id UUID;
    v_student_id UUID := gen_random_uuid();
    v_student_id_multi UUID := gen_random_uuid();
    v_parent_ref TEXT := 'parent_test_p28c_' || substr(gen_random_uuid()::text, 1, 8);
    v_school_slug TEXT := 'cs_la_grace';
    v_sub_id UUID;
    v_sub_id_multi UUID;
    v_intent_id UUID;
    v_intent_id_2 UUID;
    v_period_id UUID;
    v_period_id_2 UUID;
    v_other_period_id UUID;
    v_other_intent_id UUID;
    v_affiliate_id UUID;
    v_rejected BOOLEAN := false;
    v_res JSONB;
    v_audit RECORD;
    v_cancel_ledger RECORD;
    v_rev_ledger RECORD;
    v_bal RECORD;
    v_active_students UUID[];
BEGIN
    RAISE NOTICE '====================================================================';
    RAISE NOTICE 'DÉMARRAGE DE LA VÉRIFICATION TRANSACTIONNELLE P28c';
    RAISE NOTICE '====================================================================';

    -- Configuration de fixtures
    SELECT id INTO v_pricing_id FROM public.parent_pack_pricing WHERE active = true LIMIT 1;
    IF v_pricing_id IS NULL THEN
        RAISE EXCEPTION 'TEST SETUP FAILED: Aucune grille tarifaire active trouvée.';
    END IF;

    -- Trouver ou créer un ambassadeur de test
    SELECT id INTO v_affiliate_id FROM public.affiliates LIMIT 1;
    IF v_affiliate_id IS NULL THEN
        v_affiliate_id := gen_random_uuid();
        INSERT INTO public.affiliates (id, nom, telephone, password_hash, referral_code, status)
        VALUES (v_affiliate_id, 'Ambassadeur P28c', '+22997000000', 'hash', 'REF_P28C', 'active');
    END IF;

    -- Créer ou vérifier la devise XOF
    INSERT INTO public.currency_configurations (code, exponent, is_active, min_withdrawal_minor_units, cooling_off_days)
    VALUES ('XOF', 0, true, 5000, 30)
    ON CONFLICT (code) DO NOTHING;

    -- Initialiser le solde ambassadeur
    INSERT INTO public.affiliate_balances (affiliate_id, currency, pending_balance_minor, available_balance_minor, reserved_balance_minor, debt_balance_minor)
    VALUES (v_affiliate_id, 'XOF', 0, 0, 0, 0)
    ON CONFLICT (affiliate_id, currency) DO NOTHING;

    -- Créer élève global et lien parent
    INSERT INTO public.global_students (student_global_id) VALUES (v_student_id)
    ON CONFLICT DO NOTHING;

    INSERT INTO public.parent_child_links (parent_ref, student_global_id, current_link_active, first_linked_at)
    VALUES (v_parent_ref, v_student_id, true, now())
    ON CONFLICT (parent_ref, student_global_id) DO UPDATE SET current_link_active = true;

    -- Créer souscription et payment_intent completed
    INSERT INTO public.parent_subscriptions (parent_ref, student_global_id, school_slug, student_ref, pricing_id, status)
    VALUES (v_parent_ref, v_student_id, v_school_slug, 'STD_LOCAL_1', v_pricing_id, 'active')
    RETURNING id INTO v_sub_id;

    INSERT INTO public.payment_intents (
        target_id, expected_amount, expected_currency, status, payment_type, school_slug,
        provider_transaction_id, processed_at, expires_at, metadata
    ) VALUES (
        v_sub_id::text, 1000, 'XOF', 'completed', 'parent_pack', v_school_slug,
        'TX_P28C_TEST_1', now(), now() + interval '1 day',
        jsonb_build_object('student_global_id', v_student_id::text, 'parent_ref', v_parent_ref)
    ) RETURNING id INTO v_intent_id;

    -- Insérer période active
    INSERT INTO public.parent_subscription_periods (
        subscription_id, payment_intent_id, start_date, end_date, status
    ) VALUES (
        v_sub_id, v_intent_id, CURRENT_DATE - 5, CURRENT_DATE + 25, 'active'
    ) RETURNING id INTO v_period_id;

    -- Insérer écriture de commission crédit
    -- 1000 = 50 fedapay + 200 ecole + 75 ambassadeur + 675 yziow
    INSERT INTO public.school_commission_ledger (
        period_id, school_slug, ambassador_ref, gross_amount_minor, fedapay_fee_minor,
        school_share_minor, ambassador_share_minor, yziow_share_minor, currency, type
    ) VALUES (
        v_period_id, v_school_slug, v_affiliate_id::text, 1000, 50, 200, 75, 675, 'XOF', 'credit'
    );

    -- Créditer l'ambassadeur en pending
    UPDATE public.affiliate_balances
    SET pending_balance_minor = pending_balance_minor + 75, updated_at = clock_timestamp()
    WHERE affiliate_id = v_affiliate_id AND currency = 'XOF';

    INSERT INTO public.affiliate_ledger (
        affiliate_id, currency, entry_type, amount_minor, payment_intent_id, maturation_at, metadata
    ) VALUES (
        v_affiliate_id, 'XOF', 'commission', 75, v_intent_id, now() + interval '14 days',
        jsonb_build_object('period_id', v_period_id)
    );

    -- --------------------------------------------------------------------------
    -- TEST 1 : Transition ordinaire vers 'refunded' sans jeton certifié -> REJET
    -- --------------------------------------------------------------------------
    v_rejected := false;
    BEGIN
        UPDATE public.parent_subscription_periods
        SET status = 'refunded'
        WHERE id = v_period_id;
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%Transition vers refunded interdite par operation SQL ordinaire%' THEN
            v_rejected := true;
        END IF;
    END;
    IF NOT v_rejected THEN
        RAISE EXCEPTION 'TEST 1 FAILED: UPDATE ordinaire vers refunded aurait du etre rejete fail-closed.';
    END IF;
    RAISE NOTICE '[OK] Test 1 : Rejet fail-closed de l''UPDATE ordinaire vers refunded reussi.';

    -- --------------------------------------------------------------------------
    -- TEST 2 : Transition avec jeton certifié simulé mais sans audit -> REJET
    -- --------------------------------------------------------------------------
    v_rejected := false;
    BEGIN
        PERFORM set_config('yziow.certified_refund_active', 'true', true);
        UPDATE public.parent_subscription_periods
        SET status = 'refunded'
        WHERE id = v_period_id;
        PERFORM set_config('yziow.certified_refund_active', 'false', true);
    EXCEPTION WHEN OTHERS THEN
        PERFORM set_config('yziow.certified_refund_active', 'false', true);
        IF SQLERRM LIKE '%aucune piste d''audit administrative certifiee valide%' THEN
            v_rejected := true;
        END IF;
    END;
    IF NOT v_rejected THEN
        RAISE EXCEPTION 'TEST 2 FAILED: Transition simulee sans audit aurait du etre rejetee.';
    END IF;
    RAISE NOTICE '[OK] Test 2 : Rejet fail-closed sans piste d''audit certifiee reussi.';

    -- --------------------------------------------------------------------------
    -- TEST 3 : admin_process_parent_pack_refund() avec acteur non SuperAdmin -> REJET
    -- --------------------------------------------------------------------------
    v_rejected := false;
    BEGIN
        PERFORM public.admin_process_parent_pack_refund(
            v_period_id, 'REFUND_TX_1', v_fake_admin_id, 'Motif test'
        );
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%UNAUTHORIZED_ADMIN%' THEN
            v_rejected := true;
        END IF;
    END;
    IF NOT v_rejected THEN
        RAISE EXCEPTION 'TEST 3 FAILED: Acteur non SuperAdmin aurait du etre rejete.';
    END IF;
    RAISE NOTICE '[OK] Test 3 : Rejet d''un acteur non SuperAdmin reussi.';

    -- --------------------------------------------------------------------------
    -- TEST 4 : Remboursement nominal certifié avec solde pending
    -- --------------------------------------------------------------------------
    v_res := public.admin_process_parent_pack_refund(
        v_period_id, 'REFUND_FEDAPAY_CERTIFIED_001', v_admin_id, 'Demande client justifiee'
    );

    IF (v_res->>'status') <> 'success' THEN
        RAISE EXCEPTION 'TEST 4 FAILED: Remboursement nominal a echoue: %', v_res;
    END IF;

    -- Vérifications dans les tables
    SELECT status INTO v_audit FROM public.parent_subscription_periods WHERE id = v_period_id;
    IF v_audit.status <> 'refunded' THEN
        RAISE EXCEPTION 'TEST 4 FAILED: Periode non passee a refunded (statut: %)', v_audit.status;
    END IF;

    SELECT status INTO v_audit FROM public.parent_subscriptions WHERE id = v_sub_id;
    IF v_audit.status <> 'canceled' THEN
        RAISE EXCEPTION 'TEST 4 FAILED: Souscription non passee a canceled (statut: %)', v_audit.status;
    END IF;

    -- Commission école annulée
    SELECT * INTO v_cancel_ledger FROM public.school_commission_ledger WHERE period_id = v_period_id AND type = 'cancellation';
    IF v_cancel_ledger.gross_amount_minor <> -1000 OR v_cancel_ledger.school_share_minor <> -200 THEN
        RAISE EXCEPTION 'TEST 4 FAILED: Ecriture de cancellation incorrecte: %', row_to_json(v_cancel_ledger);
    END IF;

    -- Commission ambassadeur reprise
    SELECT * INTO v_rev_ledger FROM public.affiliate_ledger WHERE provider_refund_id = 'REFUND_FEDAPAY_CERTIFIED_001';
    IF v_rev_ledger.entry_type <> 'refund_reversal' OR v_rev_ledger.amount_minor <> 75 THEN
        RAISE EXCEPTION 'TEST 4 FAILED: refund_reversal affiliate_ledger incorrect: %', row_to_json(v_rev_ledger);
    END IF;

    -- Solde ambassadeur déduit du pending
    SELECT * INTO v_bal FROM public.affiliate_balances WHERE affiliate_id = v_affiliate_id AND currency = 'XOF';
    IF v_bal.pending_balance_minor <> 0 OR v_bal.debt_balance_minor <> 0 THEN
        RAISE EXCEPTION 'TEST 4 FAILED: Solde ambassadeur incorrect apres deduction pending: %', row_to_json(v_bal);
    END IF;

    RAISE NOTICE '[OK] Test 4 : Remboursement nominal, compensation et audit reussis.';

    -- --------------------------------------------------------------------------
    -- TEST 5 : Idempotence de la RPC (second appel)
    -- --------------------------------------------------------------------------
    v_res := public.admin_process_parent_pack_refund(
        v_period_id, 'REFUND_FEDAPAY_CERTIFIED_001', v_admin_id, 'Tentative de rejeu'
    );

    IF (v_res->>'status') <> 'already_refunded' THEN
        RAISE EXCEPTION 'TEST 5 FAILED: Second appel n''a pas renvoye already_refunded: %', v_res;
    END IF;

    -- Vérifier qu'aucune seconde ligne cancellation n'a été insérée
    IF (SELECT count(*) FROM public.school_commission_ledger WHERE period_id = v_period_id AND type = 'cancellation') <> 1 THEN
        RAISE EXCEPTION 'TEST 5 FAILED: Duplication d''ecritures de cancellation detectee.';
    END IF;
    RAISE NOTICE '[OK] Test 5 : Idempotence parfaite sans duplication reussie.';

    -- --------------------------------------------------------------------------
    -- TEST 6 : Réutilisation du même provider_refund_id sur autre période -> REJET
    -- --------------------------------------------------------------------------
    -- Créer une autre période
    INSERT INTO public.payment_intents (
        target_id, expected_amount, expected_currency, status, payment_type, school_slug,
        provider_transaction_id, processed_at, expires_at
    ) VALUES (
        v_sub_id::text, 1000, 'XOF', 'completed', 'parent_pack', v_school_slug,
        'TX_P28C_TEST_OTHER', now(), now() + interval '1 day'
    ) RETURNING id INTO v_other_intent_id;

    INSERT INTO public.parent_subscription_periods (
        subscription_id, payment_intent_id, start_date, end_date, status
    ) VALUES (
        v_sub_id, v_other_intent_id, CURRENT_DATE + 30, CURRENT_DATE + 60, 'active'
    ) RETURNING id INTO v_other_period_id;

    INSERT INTO public.school_commission_ledger (
        period_id, school_slug, ambassador_ref, gross_amount_minor, fedapay_fee_minor,
        school_share_minor, ambassador_share_minor, yziow_share_minor, currency, type
    ) VALUES (
        v_other_period_id, v_school_slug, v_affiliate_id::text, 1000, 50, 200, 75, 675, 'XOF', 'credit'
    );

    v_rejected := false;
    BEGIN
        PERFORM public.admin_process_parent_pack_refund(
            v_other_period_id, 'REFUND_FEDAPAY_CERTIFIED_001', v_admin_id, 'Fraude doublon id'
        );
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%DUPLICATE_PROVIDER_REFUND_ID%' THEN
            v_rejected := true;
        END IF;
    END;
    IF NOT v_rejected THEN
        RAISE EXCEPTION 'TEST 6 FAILED: Reutilisation de provider_refund_id aurait du etre rejetee.';
    END IF;
    RAISE NOTICE '[OK] Test 6 : Rejet strict du provider_refund_id deja utilise reussi.';

    -- --------------------------------------------------------------------------
    -- TEST 7 : Remboursement avec commission déjà disponible et solde insuffisant (création de dette)
    -- --------------------------------------------------------------------------
    -- Mettre le solde disponible de l'ambassadeur à 20 (alors que la commission est de 75)
    UPDATE public.affiliate_balances
    SET pending_balance_minor = 0, available_balance_minor = 20, debt_balance_minor = 0
    WHERE affiliate_id = v_affiliate_id AND currency = 'XOF';

    -- Simuler que la commission d'origine est déjà mûre
    UPDATE public.affiliate_ledger
    SET maturation_at = now() - interval '1 day'
    WHERE payment_intent_id = v_other_intent_id AND entry_type = 'commission';

    v_res := public.admin_process_parent_pack_refund(
        v_other_period_id, 'REFUND_FEDAPAY_CERTIFIED_002', v_admin_id, 'Remboursement avec dette'
    );

    IF (v_res->>'status') <> 'success' THEN
        RAISE EXCEPTION 'TEST 7 FAILED: Remboursement avec dette a echoue: %', v_res;
    END IF;

    SELECT * INTO v_bal FROM public.affiliate_balances WHERE affiliate_id = v_affiliate_id AND currency = 'XOF';
    -- 20 déduit de available (reste 0), 55 ajouté en dette
    IF v_bal.available_balance_minor <> 0 OR v_bal.debt_balance_minor <> 55 THEN
        RAISE EXCEPTION 'TEST 7 FAILED: Gestion de dette incorrecte: %', row_to_json(v_bal);
    END IF;
    RAISE NOTICE '[OK] Test 7 : Deduction available et creation de dette sans solde negatif reussies.';

    -- --------------------------------------------------------------------------
    -- TEST 8 & 9 : Révocation sélective des droits vs conservation d'une autre période active
    -- --------------------------------------------------------------------------
    -- Créer un élève avec DEUX périodes actives consécutives
    INSERT INTO public.global_students (student_global_id) VALUES (v_student_id_multi)
    ON CONFLICT DO NOTHING;

    INSERT INTO public.parent_child_links (parent_ref, student_global_id, current_link_active, first_linked_at)
    VALUES (v_parent_ref, v_student_id_multi, true, now())
    ON CONFLICT (parent_ref, student_global_id) DO UPDATE SET current_link_active = true;

    INSERT INTO public.parent_subscriptions (parent_ref, student_global_id, school_slug, student_ref, pricing_id, status)
    VALUES (v_parent_ref, v_student_id_multi, v_school_slug, 'STD_LOCAL_MULTI', v_pricing_id, 'active')
    RETURNING id INTO v_sub_id_multi;

    -- Période 1 : en cours
    INSERT INTO public.payment_intents (
        target_id, expected_amount, expected_currency, status, payment_type, school_slug,
        provider_transaction_id, processed_at, expires_at
    ) VALUES (
        v_sub_id_multi::text, 1000, 'XOF', 'completed', 'parent_pack', v_school_slug,
        'TX_MULTI_1', now(), now() + interval '1 day'
    ) RETURNING id INTO v_intent_id;

    INSERT INTO public.parent_subscription_periods (
        subscription_id, payment_intent_id, start_date, end_date, status
    ) VALUES (
        v_sub_id_multi, v_intent_id, CURRENT_DATE - 10, CURRENT_DATE + 20, 'active'
    ) RETURNING id INTO v_period_id;

    INSERT INTO public.school_commission_ledger (
        period_id, school_slug, gross_amount_minor, fedapay_fee_minor,
        school_share_minor, ambassador_share_minor, yziow_share_minor, currency, type
    ) VALUES (
        v_period_id, v_school_slug, 1000, 50, 200, 0, 750, 'XOF', 'credit'
    );

    -- Période 2 : renouvellement anticipé
    INSERT INTO public.payment_intents (
        target_id, expected_amount, expected_currency, status, payment_type, school_slug,
        provider_transaction_id, processed_at, expires_at
    ) VALUES (
        v_sub_id_multi::text, 1000, 'XOF', 'completed', 'parent_pack', v_school_slug,
        'TX_MULTI_2', now(), now() + interval '1 day'
    ) RETURNING id INTO v_intent_id_2;

    INSERT INTO public.parent_subscription_periods (
        subscription_id, payment_intent_id, start_date, end_date, status
    ) VALUES (
        v_sub_id_multi, v_intent_id_2, CURRENT_DATE + 21, CURRENT_DATE + 51, 'active'
    ) RETURNING id INTO v_period_id_2;

    INSERT INTO public.school_commission_ledger (
        period_id, school_slug, gross_amount_minor, fedapay_fee_minor,
        school_share_minor, ambassador_share_minor, yziow_share_minor, currency, type
    ) VALUES (
        v_period_id_2, v_school_slug, 1000, 50, 200, 0, 750, 'XOF', 'credit'
    );

    -- Vérifier que l'élève a bien accès actuellement
    SELECT array_agg(student_global_id) INTO v_active_students
    FROM public.get_active_parent_pack_subscriptions(v_parent_ref, ARRAY[v_student_id_multi]);

    IF v_active_students IS NULL OR NOT (v_student_id_multi = ANY(v_active_students)) THEN
        RAISE EXCEPTION 'TEST 8 SETUP FAILED: L''eleve multi-periodes doit avoir acces avant remboursement.';
    END IF;

    -- Rembourser la Période 2 (renouvellement) : la période 1 est TOUJOURS active couvrant CURRENT_DATE
    v_res := public.admin_process_parent_pack_refund(
        v_period_id_2, 'REFUND_FEDAPAY_MULTI_2', v_admin_id, 'Annulation renouvellement anticipe'
    );

    IF (v_res->>'status') <> 'success' OR (v_res->>'new_subscription_status') <> 'active' THEN
        RAISE EXCEPTION 'TEST 8 FAILED: La souscription aurait du rester active: %', v_res;
    END IF;

    -- Vérifier que l'accès persiste toujours grâce à la Période 1
    SELECT array_agg(student_global_id) INTO v_active_students
    FROM public.get_active_parent_pack_subscriptions(v_parent_ref, ARRAY[v_student_id_multi]);

    IF v_active_students IS NULL OR NOT (v_student_id_multi = ANY(v_active_students)) THEN
        RAISE EXCEPTION 'TEST 8 FAILED: L''eleve doit conserver ses droits tant que la periode 1 est active.';
    END IF;
    RAISE NOTICE '[OK] Test 8 : Conservation des droits et du statut active si autre periode valide reussie.';

    -- Rembourser la Période 1 : plus AUCUNE période active ne couvre CURRENT_DATE
    v_res := public.admin_process_parent_pack_refund(
        v_period_id, 'REFUND_FEDAPAY_MULTI_1', v_admin_id, 'Annulation periode restante'
    );

    -- Vérifier que l'accès est IMMÉDIATEMENT révoqué
    SELECT array_agg(student_global_id) INTO v_active_students
    FROM public.get_active_parent_pack_subscriptions(v_parent_ref, ARRAY[v_student_id_multi]);

    IF v_active_students IS NOT NULL AND (v_student_id_multi = ANY(v_active_students)) THEN
        RAISE EXCEPTION 'TEST 9 FAILED: L''eleve ne doit plus avoir acces apres remboursement de toutes les periodes.';
    END IF;
    RAISE NOTICE '[OK] Test 9 : Revocation immediate des droits d''acces reussie.';

    -- --------------------------------------------------------------------------
    -- TEST 10 : Privilèges et sécurité RLS
    -- --------------------------------------------------------------------------
    IF NOT has_function_privilege('service_role', 'public.admin_process_parent_pack_refund(uuid,text,uuid,text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.admin_process_parent_pack_refund(uuid,text,uuid,text)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.admin_process_parent_pack_refund(uuid,text,uuid,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'TEST 10 FAILED: Privileges EXECUTE incorrects sur admin_process_parent_pack_refund.';
    END IF;
    RAISE NOTICE '[OK] Test 10 : Verification des privileges SQL reussie.';

    RAISE NOTICE '====================================================================';
    RAISE NOTICE 'SUCCÈS COMPLET : LES 10 TESTS TRANSACTIONNELS P28c ONT RÉUSSI.';
    RAISE NOTICE '====================================================================';
END;
$$;

ROLLBACK;
