-- ============================================================================
-- MIGRATION P6 — ALIGNEMENT NON DESTRUCTIF DU SCHÉMA DES TABLES STUDENTS
-- ============================================================================
-- Objectifs :
-- 1. Ajouter photo_url, redoublant, ecole_provenance et matricule (si absent)
--    à toutes les tables existantes students_<slug>.
-- 2. Mettre à jour la fonction canonique create_school_tables pour les futures écoles.
-- 3. Idempotent, transactionnel, sans aucune suppression ni altération de données existantes.
-- ============================================================================

BEGIN;

DO $$
DECLARE
    r RECORD;
    v_table_name TEXT;
    v_type TEXT;
BEGIN
    RAISE NOTICE '=== Début Migration P6 : Alignement du schéma students_<slug> ===';

    -- 1. Itération sécurisée sur toutes les tables d'élèves conformes au motif multi-tenant
    FOR r IN (
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name ~ '^students_[a-z0-9_]+$'
          AND table_name NOT LIKE '%_backup%'
        ORDER BY table_name
    ) LOOP
        v_table_name := r.table_name;
        RAISE NOTICE 'Inspection de la table public.% ...', v_table_name;

        -- Vérification / Ajout de photo_url
        SELECT data_type INTO v_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = v_table_name
          AND column_name = 'photo_url';

        IF v_type IS NULL THEN
            EXECUTE format('ALTER TABLE public.%I ADD COLUMN photo_url text NULL', v_table_name);
            RAISE NOTICE '  + Colonne photo_url ajoutée sur %', v_table_name;
        ELSIF v_type NOT IN ('text', 'character varying') THEN
            RAISE EXCEPTION 'Type incompatible pour photo_url sur table % (type: %)', v_table_name, v_type;
        END IF;

        -- Vérification / Ajout de redoublant
        SELECT data_type INTO v_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = v_table_name
          AND column_name = 'redoublant';

        IF v_type IS NULL THEN
            EXECUTE format('ALTER TABLE public.%I ADD COLUMN redoublant boolean NOT NULL DEFAULT false', v_table_name);
            RAISE NOTICE '  + Colonne redoublant ajoutée sur %', v_table_name;
        ELSIF v_type != 'boolean' THEN
            RAISE EXCEPTION 'Type incompatible pour redoublant sur table % (type: %)', v_table_name, v_type;
        END IF;

        -- Vérification / Ajout de ecole_provenance
        SELECT data_type INTO v_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = v_table_name
          AND column_name = 'ecole_provenance';

        IF v_type IS NULL THEN
            EXECUTE format('ALTER TABLE public.%I ADD COLUMN ecole_provenance text NULL', v_table_name);
            RAISE NOTICE '  + Colonne ecole_provenance ajoutée sur %', v_table_name;
        ELSIF v_type NOT IN ('text', 'character varying') THEN
            RAISE EXCEPTION 'Type incompatible pour ecole_provenance sur table % (type: %)', v_table_name, v_type;
        END IF;

        -- Vérification / Ajout de matricule
        SELECT data_type INTO v_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = v_table_name
          AND column_name = 'matricule';

        IF v_type IS NULL THEN
            EXECUTE format('ALTER TABLE public.%I ADD COLUMN matricule text NULL', v_table_name);
            RAISE NOTICE '  + Colonne matricule ajoutée sur %', v_table_name;
        ELSIF v_type NOT IN ('text', 'character varying') THEN
            RAISE EXCEPTION 'Type incompatible pour matricule sur table % (type: %)', v_table_name, v_type;
        END IF;

    END LOOP;

    RAISE NOTICE '=== Toutes les tables students_<slug> existantes ont été vérifiées/mises à niveau ===';
END $$;

-- 2. Mise à jour de la fonction canonique de création des futures partitions
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

    -- 2. Table Students (avec photo_url, redoublant, ecole_provenance, matricule)
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
        photo_url text,
        redoublant boolean NOT NULL DEFAULT false,
        ecole_provenance text,
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

COMMIT;
