-- ============================================================
-- 🔒 MIGRATION P0 — CONFINEMENT DE SÉCURITÉ ET ACTIVATION RLS
-- ============================================================

BEGIN;

DO $$
DECLARE
    policy_rec RECORD;
    table_rec RECORD;
    temp_count integer;
    temp_bool boolean;
    initial_policy_count integer := 70;
    existing_target_policy_count integer;
    expected_final_count integer;
    target_tables text[] := ARRAY[
        'activity_logs_tgvuyhkgjlkjl',
        'campaigns_complexe_scolaire_la_grace',
        'campaigns_new_academy',
        'campaigns_rom_le_fidel',
        'campaigns_test_academy',
        'classe_matieres_tgvuyhkgjlkjl',
        'matieres_tgvuyhkgjlkjl'
    ];
    target_tbl text;
BEGIN
    -- =========================================================
    -- 🧪 ÉTAPE 1 : PRÉ-CONTRÔLES STATIQUES DYNAMIQUES (READ-ONLY)
    -- =========================================================

    -- A. Vérifier l'existence et le type (r, p) des 7 tables cibles dans 'public'
    FOREACH target_tbl IN ARRAY target_tables
    LOOP
        SELECT EXISTS (
            SELECT 1
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public'
              AND c.relname = target_tbl
              AND c.relkind IN ('r', 'p')
        ) INTO temp_bool;

        IF temp_bool IS NOT TRUE THEN
            RAISE EXCEPTION 'PRÉ-CONTRÔLE ÉCHEC : La table cible % est introuvable ou n''est pas une table standard/partitionnée.', target_tbl;
        END IF;
    END LOOP;

    -- B. Vérifier le nombre exact de politiques service_role_full_access_ existantes avant modification
    SELECT count(*) INTO temp_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND left(policyname, 25) = 'service_role_full_access_';

    IF temp_count != initial_policy_count THEN
        RAISE EXCEPTION 'PRÉ-CONTRÔLE ÉCHEC : Nombre initial de politiques service_role incorrect (trouvé %, attendu %)', temp_count, initial_policy_count;
    END IF;

    -- C. Calculer le nombre de politiques service_role_full_access_ déjà présentes sur les 7 tables cibles
    SELECT count(*) INTO existing_target_policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND left(policyname, 25) = 'service_role_full_access_'
      AND tablename = ANY(target_tables);

    -- D. Calculer dynamiquement le nombre attendu final
    expected_final_count := initial_policy_count + array_length(target_tables, 1) - existing_target_policy_count;

    -- E. Vérifier qu'aucune autre politique ne cible PUBLIC, anon ou authenticated sur les 7 tables cibles
    SELECT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = ANY(target_tables)
          AND left(policyname, 25) != 'service_role_full_access_'
          AND (
            roles IS NULL
            OR roles::text[] && ARRAY['public', 'PUBLIC', 'anon', 'ANON', 'authenticated', 'AUTHENTICATED']
          )
    ) INTO temp_bool;

    IF temp_bool THEN
        RAISE EXCEPTION 'PRÉ-CONTRÔLE ÉCHEC : Une des 7 tables cibles possède déjà une autre politique ciblant des rôles exposés.';
    END IF;

    -- F. Valider la structure exacte des 70 politiques existantes pour empêcher les dérives
    FOR policy_rec IN
        SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
        FROM pg_policies
        WHERE schemaname = 'public'
          AND left(policyname, 25) = 'service_role_full_access_'
          AND tablename NOT IN (
            'activity_logs_tgvuyhkgjlkjl',
            'campaigns_complexe_scolaire_la_grace',
            'campaigns_new_academy',
            'campaigns_rom_le_fidel',
            'campaigns_test_academy',
            'classe_matieres_tgvuyhkgjlkjl',
            'matieres_tgvuyhkgjlkjl'
          )
    LOOP
        IF policy_rec.permissive != 'PERMISSIVE'
           OR policy_rec.roles::text[] != ARRAY['public']
           OR policy_rec.cmd != 'ALL'
           OR policy_rec.qual != 'true'
           OR policy_rec.with_check != 'true' THEN
            RAISE EXCEPTION 'PRÉ-CONTRÔLE ÉCHEC : La politique % sur % présente une divergence structurelle (permissive:%, roles:%, cmd:%, qual:%, check:%).',
                policy_rec.policyname, policy_rec.tablename, policy_rec.permissive, policy_rec.roles, policy_rec.cmd, policy_rec.qual, policy_rec.with_check;
        END IF;
    END LOOP;

    -- ==========================================
    -- 🛠️ ÉTAPE 2 : EXÉCUTION DU CONFINEMENT (ÉCRITURE)
    -- ==========================================

    -- A. Confinement d'exécution de la fonction drop_school_tables(text)
    REVOKE EXECUTE ON FUNCTION public.drop_school_tables(text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.drop_school_tables(text) TO service_role, postgres;

    -- B. Activer RLS et créer la politique restreinte sur les 7 tables cibles
    FOREACH target_tbl IN ARRAY target_tables
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_tbl);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'service_role_full_access_' || target_tbl, target_tbl);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', 'service_role_full_access_' || target_tbl, target_tbl);
    END LOOP;

    -- C. Restreindre les 70 politiques service_role_full_access_ existantes au seul rôle service_role
    FOR policy_rec IN
        SELECT tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND left(policyname, 25) = 'service_role_full_access_'
          AND tablename NOT IN (
            'activity_logs_tgvuyhkgjlkjl',
            'campaigns_complexe_scolaire_la_grace',
            'campaigns_new_academy',
            'campaigns_rom_le_fidel',
            'campaigns_test_academy',
            'classe_matieres_tgvuyhkgjlkjl',
            'matieres_tgvuyhkgjlkjl'
          )
    LOOP
        -- Supprimer la politique permissive exposée
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_rec.policyname, policy_rec.tablename);

        -- Recréer la politique restreinte TO service_role
        EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', policy_rec.policyname, policy_rec.tablename);
    END LOOP;

    -- ==========================================
    -- 🧪 ÉTAPE 3 : ASSERTIONS DE SÉCURITÉ POST-MIGRATION
    -- ==========================================

    -- A. Vérifier que les 7 tables existent toujours après migration et ont relrowsecurity = true
    FOREACH target_tbl IN ARRAY target_tables
    LOOP
        SELECT EXISTS (
            SELECT 1
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public'
              AND c.relname = target_tbl
              AND c.relkind IN ('r', 'p')
        ) INTO temp_bool;

        IF temp_bool IS NOT TRUE THEN
            RAISE EXCEPTION 'ASSERTION ÉCHEC : La table cible % a disparu après migration.', target_tbl;
        END IF;

        SELECT relrowsecurity INTO temp_bool
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = target_tbl;

        IF temp_bool IS NOT TRUE THEN
            RAISE EXCEPTION 'ASSERTION ÉCHEC : RLS non activé sur table %', target_tbl;
        END IF;
    END LOOP;

    -- B. Vérifier le nombre final exact de politiques de service_role (doit être 77)
    SELECT count(*) INTO temp_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND left(policyname, 25) = 'service_role_full_access_';

    IF temp_count != expected_final_count THEN
        RAISE EXCEPTION 'ASSERTION ÉCHEC : Nombre final de politiques service_role incorrect (trouvé %, attendu %)', temp_count, expected_final_count;
    END IF;

    -- C. Valider la structure de toutes les 77 politiques de service_role
    FOR policy_rec IN
        SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
        FROM pg_policies
        WHERE schemaname = 'public'
          AND left(policyname, 25) = 'service_role_full_access_'
    LOOP
        IF policy_rec.permissive != 'PERMISSIVE'
           OR policy_rec.roles::text[] != ARRAY['service_role']
           OR policy_rec.cmd != 'ALL'
           OR policy_rec.qual != 'true'
           OR policy_rec.with_check != 'true' THEN
            RAISE EXCEPTION 'ASSERTION ÉCHEC : La politique % sur % ne correspond pas aux attributs requis TO service_role.',
                policy_rec.policyname, policy_rec.tablename;
        END IF;
    END LOOP;

    -- D. Vérifier le confinement strict de drop_school_tables via regprocedure
    -- Aucun bénéficiaire autre que service_role et postgres ne doit avoir EXECUTE
    SELECT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
        LEFT JOIN pg_roles r ON r.oid = a.grantee
        WHERE n.nspname = 'public'
          AND p.oid = 'public.drop_school_tables(text)'::regprocedure
          AND a.grantee != 0
          AND COALESCE(r.rolname, '') NOT IN ('service_role', 'postgres')
          AND a.privilege_type = 'EXECUTE'
    ) INTO temp_bool;

    IF temp_bool THEN
        RAISE EXCEPTION 'ASSERTION ÉCHEC : drop_school_tables(text) possède des bénéficiaires EXECUTE non autorisés.';
    END IF;

    -- Vérifier que PUBLIC n'a pas EXECUTE (grantee = 0)
    SELECT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
        WHERE n.nspname = 'public'
          AND p.oid = 'public.drop_school_tables(text)'::regprocedure
          AND a.grantee = 0
          AND a.privilege_type = 'EXECUTE'
    ) INTO temp_bool;

    IF temp_bool THEN
        RAISE EXCEPTION 'ASSERTION ÉCHEC : drop_school_tables reste exécutable par PUBLIC';
    END IF;

    -- Vérifier que service_role et postgres conservent le privilège d'exécution
    IF NOT has_function_privilege('service_role', 'public.drop_school_tables(text)'::regprocedure, 'execute') THEN
        RAISE EXCEPTION 'ASSERTION ÉCHEC : service_role a perdu l''accès d''exécution sur drop_school_tables';
    END IF;

    IF NOT has_function_privilege('postgres', 'public.drop_school_tables(text)'::regprocedure, 'execute') THEN
        RAISE EXCEPTION 'ASSERTION ÉCHEC : postgres a perdu l''accès d''exécution sur drop_school_tables';
    END IF;

    RAISE NOTICE '✅ TOUTES LES ASSERTIONS POST-MIGRATION ONT RÉUSSI AVEC SUCCÈS ! (Total politiques RLS ciblées validées : %)', expected_final_count;
END $$;

COMMIT;
