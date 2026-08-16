BEGIN;

-- Pre-checks
DO $$
DECLARE
    curr_user text;
    can_mod_postgres boolean;
BEGIN
    SELECT current_user INTO curr_user;

    SELECT pg_has_role(curr_user, 'postgres', 'USAGE') INTO can_mod_postgres;

    IF NOT can_mod_postgres THEN
        RAISE EXCEPTION 'Current user % does not have privileges to modify DEFAULT PRIVILEGES for postgres', curr_user;
    END IF;
END $$;

-- 1. Default ACL for postgres
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;

-- 3. Deploy update_school_template.sql content

CREATE OR REPLACE FUNCTION public.create_school_tables(
    school_slug text,
    admin_nom text DEFAULT NULL,
    admin_telephone text DEFAULT NULL,
    admin_phone_normalized text DEFAULT NULL,
    admin_auth_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    result json;
BEGIN
    -- Validation stricte du format du slug (sécurité anti-injection SQL)
    IF school_slug !~ '^[a-z0-9_]{1,50}$' THEN
        RAISE EXCEPTION 'Format de school_slug invalide: %', school_slug;
    END IF;

    -- 1. Table Profiles
    EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I (
        id uuid PRIMARY KEY,
        nom text NOT NULL,
        telephone text NOT NULL,
        phone_normalized text NOT NULL UNIQUE CHECK (phone_normalized ~ ''^\+[1-9][0-9]{7,14}$''),
        role text NOT NULL,
        created_at timestamp with time zone DEFAULT now()
    )', 'profiles_' || school_slug);

    -- 2. Table Students
    EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I (
        id text PRIMARY KEY,
        nom text NOT NULL,
        prenom text NOT NULL,
        classe text NOT NULL,
        matricule text,
        genre text,
        date_naissance text,
        statut text DEFAULT ''Actif'',
        ecolage numeric DEFAULT 0,
        deja_paye numeric DEFAULT 0,
        telephone_parent text,
        telephone_parent_normalized text NULL CHECK (telephone_parent_normalized IS NULL OR telephone_parent_normalized ~ ''^\+[1-9][0-9]{7,14}$''),
        updated_at timestamp with time zone DEFAULT now()
    )', 'students_' || school_slug);

    -- 3. Table Parent_Student
    EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I (
        parent_id uuid NOT NULL,
        student_id text NOT NULL,
        PRIMARY KEY (parent_id, student_id)
    )', 'parent_student_' || school_slug);

    -- 4. Table Payments
    EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I (
        id text PRIMARY KEY,
        student_id text NOT NULL,
        montant numeric NOT NULL,
        date timestamp with time zone,
        methode text,
        reference text,
        enregistre_par text
    )', 'payments_' || school_slug);

    -- 5. Table Presences
    EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I (
        id text PRIMARY KEY,
        student_id text NOT NULL,
        eleve_nom text,
        eleve_prenom text,
        eleve_classe text,
        date text NOT NULL,
        heure text,
        statut text NOT NULL,
        enregistre_par text
    )', 'presences_' || school_slug);

    -- 6. Table Devoirs
    EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I (
        id text PRIMARY KEY,
        date_donnee text NOT NULL,
        date_rendu text NOT NULL,
        matiere text NOT NULL,
        description text NOT NULL,
        classe text NOT NULL,
        professeur_nom text,
        fichier_url text
    )', 'devoirs_' || school_slug);

    -- 7. Table Notes
    EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I (
        id text PRIMARY KEY,
        student_id text NOT NULL,
        eleve_nom text NOT NULL,
        eleve_prenom text NOT NULL,
        classe text NOT NULL,
        matiere text NOT NULL,
        note numeric NOT NULL,
        coefficient numeric DEFAULT 1,
        type text,
        periode text NOT NULL,
        appreciation text,
        date text NOT NULL
    )', 'notes_' || school_slug);

    -- 8. Table Matieres
    EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I (
        id text PRIMARY KEY,
        nom text NOT NULL,
        code text,
        coefficient numeric DEFAULT 1,
        professeur_nom text
    )', 'matieres_' || school_slug);

    -- 9. Table Classe_Matieres
    EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I (
        id text PRIMARY KEY,
        classe text NOT NULL,
        matiere text NOT NULL,
        coefficient numeric DEFAULT 1,
        professeurId text
    )', 'classe_matieres_' || school_slug);

    -- 10. Table Activity_Logs
    EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I (
        id text PRIMARY KEY,
        timestamp timestamp with time zone DEFAULT now(),
        user_id text,
        user_name text NOT NULL,
        user_role text NOT NULL,
        action text NOT NULL,
        details text NOT NULL,
        category text NOT NULL
    )', 'activity_logs_' || school_slug);

    -- 11. Table App_Settings
    EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I (
        key text PRIMARY KEY,
        value text NOT NULL,
        updated_at timestamp with time zone DEFAULT now()
    )', 'app_settings_' || school_slug);

    -- 12. Table Resources
    EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I (
        id text PRIMARY KEY,
        titre text NOT NULL,
        description text,
        classe text NOT NULL,
        matiere text NOT NULL,
        fichier_url text NOT NULL,
        fichier_nom text NOT NULL,
        fichier_taille text,
        cree_par text NOT NULL,
        date_creation timestamp with time zone DEFAULT now()
    )', 'resources_' || school_slug);

    -- 13. Table Payrolls (Bulletins de paie)
    EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I (
        id text PRIMARY KEY,
        personnelId text NOT NULL,
        personnelNom text NOT NULL,
        role text NOT NULL,
        mois text NOT NULL,
        annee numeric NOT NULL,
        salaireBase numeric NOT NULL,
        primes numeric DEFAULT 0,
        deductions numeric DEFAULT 0,
        netAPayer numeric DEFAULT 0,
        statut text NOT NULL,
        datePaiement text,
        referencePaiement text
    )', 'payrolls_' || school_slug);

    -- 14. Table Personnels
    EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I (
        id text PRIMARY KEY,
        nom text NOT NULL,
        prenom text NOT NULL,
        role text NOT NULL,
        telephone text,
        email text
    )', 'personnels_' || school_slug);

    -- 15. Table Expenses (Dépenses)
    EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I (
        id text PRIMARY KEY,
        montant numeric NOT NULL,
        categorie text NOT NULL,
        date text NOT NULL,
        beneficiaire text,
        reference text,
        commentaire text,
        enregistrePar text
    )', 'expenses_' || school_slug);

    -- 16. Table Seances (Emploi du temps)
    EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I (
        id text PRIMARY KEY,
        classe text NOT NULL,
        matiere text NOT NULL,
        professeurId text NOT NULL,
        professeurNom text NOT NULL,
        date text NOT NULL,
        heureDebut text NOT NULL,
        heureFin text NOT NULL,
        statut text NOT NULL
    )', 'seances_' || school_slug);

    -- 17. Table Campaigns
    EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(255) NOT NULL,
        description TEXT,
        goal_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        current_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        currency VARCHAR(10) DEFAULT ''FCFA'',
        status VARCHAR(50) DEFAULT ''active'',
        image_url TEXT,
        created_by UUID,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )', 'campaigns_' || school_slug);

    -- 18. Table Donations
    EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id UUID REFERENCES public.%I(id) ON DELETE CASCADE,
        donor_name VARCHAR(255),
        donor_email VARCHAR(255),
        donor_phone VARCHAR(50),
        amount DECIMAL(10,2) NOT NULL,
        currency VARCHAR(10) DEFAULT ''FCFA'',
        payment_method VARCHAR(50),
        transaction_id VARCHAR(255),
        status VARCHAR(50) DEFAULT ''pending'',
        message TEXT,
        is_anonymous BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )', 'donations_' || school_slug, 'campaigns_' || school_slug);

    -- Sécurisation des 18 tables créées
    DECLARE
        tbl text;
        tables_list text[] := ARRAY[
            'profiles_' || school_slug,
            'students_' || school_slug,
            'parent_student_' || school_slug,
            'payments_' || school_slug,
            'presences_' || school_slug,
            'devoirs_' || school_slug,
            'notes_' || school_slug,
            'matieres_' || school_slug,
            'classe_matieres_' || school_slug,
            'activity_logs_' || school_slug,
            'app_settings_' || school_slug,
            'resources_' || school_slug,
            'payrolls_' || school_slug,
            'personnels_' || school_slug,
            'expenses_' || school_slug,
            'seances_' || school_slug,
            'campaigns_' || school_slug,
            'donations_' || school_slug
        ];
    BEGIN
        FOREACH tbl IN ARRAY tables_list
        LOOP
            -- 1. ENABLE ROW LEVEL SECURITY
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

            -- 2. REVOKE ALL FROM PUBLIC, anon, authenticated
            EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', tbl);

            -- 3. GRANT ALL TO service_role
            EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', tbl);

            -- 4. Supprimer l''éventuelle politique avec le nom court
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'service_role_full_access', tbl);

            -- 5. Créer cette politique
            EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', 'service_role_full_access', tbl);

        END LOOP;
    END;

    -- Insérer le compte administrateur avec phone_normalized et UUID Auth obligatoire
    IF admin_nom IS NOT NULL THEN
        IF admin_phone_normalized IS NULL OR admin_phone_normalized = '' THEN
            RAISE EXCEPTION 'admin_phone_normalized est requis lors de la création d un directeur.';
        END IF;

        IF admin_auth_id IS NULL THEN
            RAISE EXCEPTION 'admin_auth_id (UUID Supabase Auth) est OBLIGATOIRE lors de la création d un directeur.';
        END IF;

        EXECUTE format(
            'INSERT INTO public.%I (id, nom, telephone, phone_normalized, role) VALUES ($1, $2, $3, $4, $5)',
            'profiles_' || school_slug
        ) USING admin_auth_id, admin_nom, admin_telephone, admin_phone_normalized, 'directeur';

        result := json_build_object('id', admin_auth_id, 'nom', admin_nom, 'telephone', admin_telephone, 'phone_normalized', admin_phone_normalized, 'role', 'directeur', 'schoolSlug', school_slug);
    ELSE
        result := json_build_object('status', 'success');
    END IF;

    -- Recharger le cache du schéma pour PostgREST
    NOTIFY pgrst, 'reload schema';

    RETURN result;
END;
$$;

-- Révocation stricte d'accès public/anon/authenticated et attribution restreinte au service_role et postgres
REVOKE ALL ON FUNCTION public.create_school_tables(school_slug text, admin_nom text, admin_telephone text, admin_phone_normalized text, admin_auth_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_school_tables(school_slug text, admin_nom text, admin_telephone text, admin_phone_normalized text, admin_auth_id uuid) TO service_role, postgres;

-- 4. Final assertions
DO $$
DECLARE
    r RECORD;
    v_target_roles text[] := ARRAY['postgres'];
    v_obj_types "char"[] := ARRAY['r', 'S', 'f']; -- tables, sequences, functions
    v_role text;
    v_obj_type "char";
    v_acl_count integer;

    v_pub_has boolean;
    v_anon_has boolean;
    v_auth_has boolean;

    v_sr_privs text[];
    v_expected_sr_privs text[];

    v_func_count integer;
    v_func_oid oid;
    v_func_ret text;
    v_func_lang text;
    v_func_secdef boolean;
    v_func_proconfig text[];
    v_func_args text;
    v_func_nargdef int;
    v_func_nargs int;
    v_pub_has_exec boolean;
BEGIN
    -- 1. Assert DEFAULT ACLs
    FOREACH v_role IN ARRAY v_target_roles LOOP
        FOREACH v_obj_type IN ARRAY v_obj_types LOOP
            v_acl_count := 0;

            SELECT array_agg(privilege_type) INTO v_sr_privs
            FROM pg_default_acl a
            JOIN pg_roles r_def ON a.defaclrole = r_def.oid
            JOIN pg_namespace n ON a.defaclnamespace = n.oid
            CROSS JOIN LATERAL aclexplode(a.defaclacl) privs
            JOIN pg_roles grantee ON privs.grantee = grantee.oid
            WHERE r_def.rolname = v_role AND n.nspname = 'public' AND a.defaclobjtype = v_obj_type AND grantee.rolname = 'service_role';

            SELECT EXISTS (
                SELECT 1
                FROM pg_default_acl a
                JOIN pg_roles r_def ON a.defaclrole = r_def.oid
                JOIN pg_namespace n ON a.defaclnamespace = n.oid
                CROSS JOIN LATERAL aclexplode(a.defaclacl) privs
                LEFT JOIN pg_roles grantee ON privs.grantee = grantee.oid
                WHERE r_def.rolname = v_role AND n.nspname = 'public' AND a.defaclobjtype = v_obj_type AND (grantee.rolname = 'anon' OR privs.grantee = 0)
            ) INTO v_anon_has;

            SELECT EXISTS (
                SELECT 1
                FROM pg_default_acl a
                JOIN pg_roles r_def ON a.defaclrole = r_def.oid
                JOIN pg_namespace n ON a.defaclnamespace = n.oid
                CROSS JOIN LATERAL aclexplode(a.defaclacl) privs
                LEFT JOIN pg_roles grantee ON privs.grantee = grantee.oid
                WHERE r_def.rolname = v_role AND n.nspname = 'public' AND a.defaclobjtype = v_obj_type AND (grantee.rolname = 'authenticated' OR privs.grantee = 0)
            ) INTO v_auth_has;

            SELECT EXISTS (
                SELECT 1
                FROM pg_default_acl a
                JOIN pg_roles r_def ON a.defaclrole = r_def.oid
                JOIN pg_namespace n ON a.defaclnamespace = n.oid
                CROSS JOIN LATERAL aclexplode(a.defaclacl) privs
                LEFT JOIN pg_roles grantee ON privs.grantee = grantee.oid
                WHERE r_def.rolname = v_role AND n.nspname = 'public' AND a.defaclobjtype = v_obj_type AND privs.grantee = 0
            ) INTO v_pub_has;

            IF v_pub_has THEN RAISE EXCEPTION 'PUBLIC a un privilège interdit sur % par %', v_obj_type, v_role; END IF;
            IF v_anon_has THEN RAISE EXCEPTION 'anon a un privilège interdit sur % par %', v_obj_type, v_role; END IF;
            IF v_auth_has THEN RAISE EXCEPTION 'authenticated a un privilège interdit sur % par %', v_obj_type, v_role; END IF;

            IF v_obj_type = 'r' THEN
                v_expected_sr_privs := ARRAY[
                  'SELECT',
                  'INSERT',
                  'UPDATE',
                  'DELETE',
                  'TRUNCATE',
                  'REFERENCES',
                  'TRIGGER',
                  'MAINTAIN'
                ];
            ELSIF v_obj_type = 'S' THEN
                v_expected_sr_privs := ARRAY['USAGE', 'SELECT', 'UPDATE'];
            ELSIF v_obj_type = 'f' THEN
                v_expected_sr_privs := ARRAY['EXECUTE'];
            END IF;

            IF v_sr_privs IS NULL OR NOT (v_sr_privs @> v_expected_sr_privs AND v_expected_sr_privs @> v_sr_privs) THEN
                RAISE EXCEPTION 'service_role manque de privilèges ou n''a pas exactement les privilèges attendus sur % par %', v_obj_type, v_role;
            END IF;
        END LOOP;
    END LOOP;

    -- 2. Assert Function
    SELECT count(*), max(p.oid) INTO v_func_count, v_func_oid
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'create_school_tables'
    AND pg_get_function_identity_arguments(p.oid) = 'school_slug text, admin_nom text, admin_telephone text, admin_phone_normalized text, admin_auth_id uuid';

    IF v_func_count != 1 THEN
        RAISE EXCEPTION 'Erreur: % fonction(s) correspondant à la signature exacte trouvée(s)', v_func_count;
    END IF;

    SELECT format_type(prorettype, NULL), l.lanname, p.prosecdef, p.proconfig, pg_get_function_arguments(p.oid), p.pronargdefaults, p.pronargs
    INTO v_func_ret, v_func_lang, v_func_secdef, v_func_proconfig, v_func_args, v_func_nargdef, v_func_nargs
    FROM pg_proc p
    JOIN pg_language l ON p.prolang = l.oid
    WHERE p.oid = v_func_oid;

    IF v_func_ret != 'json' THEN RAISE EXCEPTION 'Type de retour incorrect: %', v_func_ret; END IF;
    IF v_func_lang != 'plpgsql' THEN RAISE EXCEPTION 'Langage incorrect: %', v_func_lang; END IF;
    IF v_func_secdef != true THEN RAISE EXCEPTION 'prosecdef n''est pas true'; END IF;
    IF v_func_proconfig IS NULL OR cardinality(v_func_proconfig) != 1 OR v_func_proconfig[1] != 'search_path=public, pg_temp' THEN
        RAISE EXCEPTION 'search_path incorrect ou absent';
    END IF;
    IF v_func_nargs != 5 THEN RAISE EXCEPTION 'nombre exact d arguments = 5 attendu'; END IF;
    IF v_func_nargdef != 4 THEN RAISE EXCEPTION 'pronargdefaults = 4 attendu'; END IF;
    IF v_func_args != 'school_slug text, admin_nom text DEFAULT NULL::text, admin_telephone text DEFAULT NULL::text, admin_phone_normalized text DEFAULT NULL::text, admin_auth_id uuid DEFAULT NULL::uuid' THEN RAISE EXCEPTION 'pg_get_function_arguments exact attendu'; END IF;

    SELECT EXISTS (
        SELECT 1 FROM pg_proc p
        CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
        WHERE p.oid = v_func_oid AND acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
    ) INTO v_pub_has_exec;
    IF v_pub_has_exec THEN RAISE EXCEPTION 'PUBLIC a EXECUTE'; END IF;
    IF has_function_privilege('anon', v_func_oid, 'EXECUTE') THEN RAISE EXCEPTION 'anon a EXECUTE'; END IF;
    IF has_function_privilege('authenticated', v_func_oid, 'EXECUTE') THEN RAISE EXCEPTION 'authenticated a EXECUTE'; END IF;
    IF NOT has_function_privilege('service_role', v_func_oid, 'EXECUTE') THEN RAISE EXCEPTION 'service_role n''a pas EXECUTE'; END IF;
    IF NOT has_function_privilege('postgres', v_func_oid, 'EXECUTE') THEN RAISE EXCEPTION 'postgres n''a pas EXECUTE'; END IF;

END $$;

COMMIT;
