-- Suppression propre des anciennes signatures de la fonction RPC pour éviter toute ambiguïté
DROP FUNCTION IF EXISTS create_school_tables(text);
DROP FUNCTION IF EXISTS create_school_tables(text, text, text, text);
DROP FUNCTION IF EXISTS create_school_tables(text, text, text, text, text);
DROP FUNCTION IF EXISTS create_school_tables(text, text, text, text, text, uuid);
DROP FUNCTION IF EXISTS create_school_tables(text, text, text, text, text, uuid, text);

CREATE OR REPLACE FUNCTION create_school_tables(
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
REVOKE ALL ON FUNCTION create_school_tables(school_slug text, admin_nom text, admin_telephone text, admin_phone_normalized text, admin_auth_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_school_tables(school_slug text, admin_nom text, admin_telephone text, admin_phone_normalized text, admin_auth_id uuid) TO service_role, postgres;
