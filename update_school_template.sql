CREATE OR REPLACE FUNCTION create_school_tables(school_slug text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 1. Table Profiles (Utilisateurs / Parents / Profs / Direction)
    EXECUTE 'CREATE TABLE IF NOT EXISTS "profiles_' || school_slug || '" (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        nom text NOT NULL,
        telephone text NOT NULL,
        password text NOT NULL,
        role text NOT NULL,
        created_at timestamp with time zone DEFAULT now()
    )';

    -- 2. Table Students
    EXECUTE 'CREATE TABLE IF NOT EXISTS "students_' || school_slug || '" (
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
        updated_at timestamp with time zone DEFAULT now()
    )';

    -- 3. Table Parent_Student (Liaisons)
    EXECUTE 'CREATE TABLE IF NOT EXISTS "parent_student_' || school_slug || '" (
        parent_id uuid NOT NULL,
        student_id text NOT NULL,
        PRIMARY KEY (parent_id, student_id)
    )';

    -- 4. Table Payments
    EXECUTE 'CREATE TABLE IF NOT EXISTS "payments_' || school_slug || '" (
        id text PRIMARY KEY,
        student_id text NOT NULL,
        montant numeric NOT NULL,
        date timestamp with time zone,
        methode text,
        reference text,
        enregistre_par text
    )';

    -- 5. Table Presences
    EXECUTE 'CREATE TABLE IF NOT EXISTS "presences_' || school_slug || '" (
        id text PRIMARY KEY,
        student_id text NOT NULL,
        eleve_nom text,
        eleve_prenom text,
        eleve_classe text,
        date text NOT NULL,
        heure text,
        statut text NOT NULL,
        enregistre_par text
    )';

    -- 6. Table Devoirs
    EXECUTE 'CREATE TABLE IF NOT EXISTS "devoirs_' || school_slug || '" (
        id text PRIMARY KEY,
        date_donnee text NOT NULL,
        date_rendu text NOT NULL,
        matiere text NOT NULL,
        description text NOT NULL,
        classe text NOT NULL,
        professeur_nom text,
        fichier_url text
    )';

    -- 7. Table Notes
    EXECUTE 'CREATE TABLE IF NOT EXISTS "notes_' || school_slug || '" (
        id text PRIMARY KEY,
        eleve_id text NOT NULL,
        matiere_id text NOT NULL,
        periode text NOT NULL,
        note_classe numeric,
        note_devoir numeric,
        note_compo numeric
    )';

    -- 8. Table Matieres
    EXECUTE 'CREATE TABLE IF NOT EXISTS "matieres_' || school_slug || '" (
        id text PRIMARY KEY,
        nom text NOT NULL,
        categorie text
    )';

    -- 9. Table Classe Matieres
    EXECUTE 'CREATE TABLE IF NOT EXISTS "classe_matieres_' || school_slug || '" (
        id text PRIMARY KEY,
        classe text NOT NULL,
        matiere_id text NOT NULL,
        professeur text,
        coefficient numeric DEFAULT 1
    )';

    -- 10. Table Activity Logs
    EXECUTE 'CREATE TABLE IF NOT EXISTS "activity_logs_' || school_slug || '" (
        id text PRIMARY KEY,
        utilisateur text NOT NULL,
        utilisateur_role text NOT NULL,
        action text NOT NULL,
        description text,
        date_heure text NOT NULL
    )';

    -- 11. Table App Settings
    EXECUTE 'CREATE TABLE IF NOT EXISTS "app_settings_' || school_slug || '" (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        app_name text,
        school_name text,
        school_year text,
        message_remerciement text,
        message_rappel text,
        school_logo text,
        school_stamp text,
        cycle_schedules jsonb,
        tranches jsonb,
        school_address text,
        school_phone text,
        school_slogan text,
        school_ministry text,
        school_country text,
        settings jsonb,
        payment_gateway text DEFAULT ''none'',
        payment_public_key text,
        payment_secret_key text,
        updated_at timestamp with time zone DEFAULT now()
    )';

    -- 12. NEW: Table Resources (E-Learning)
    EXECUTE 'CREATE TABLE IF NOT EXISTS "resources_' || school_slug || '" (
        id text PRIMARY KEY,
        titre text NOT NULL,
        description text,
        type text NOT NULL,
        url text NOT NULL,
        classe text NOT NULL,
        matiere text NOT NULL,
        professeurId text,
        professeurNom text,
        createdAt text
    )';

    -- 13. NEW: Table Payrolls (Salaires)
    EXECUTE 'CREATE TABLE IF NOT EXISTS "payrolls_' || school_slug || '" (
        id text PRIMARY KEY,
        personnelId text NOT NULL,
        mois text NOT NULL,
        salaireBase numeric DEFAULT 0,
        primes numeric DEFAULT 0,
        deductions numeric DEFAULT 0,
        netAPayer numeric DEFAULT 0,
        statut text NOT NULL,
        datePaiement text,
        referencePaiement text
    )';
    
    -- 14. NEW: Table Personnels
    EXECUTE 'CREATE TABLE IF NOT EXISTS "personnels_' || school_slug || '" (
        id text PRIMARY KEY,
        nom text NOT NULL,
        prenom text NOT NULL,
        role text NOT NULL,
        telephone text,
        email text
    )';
    
    -- 15. NEW: Table Expenses (Dépenses)
    EXECUTE 'CREATE TABLE IF NOT EXISTS "expenses_' || school_slug || '" (
        id text PRIMARY KEY,
        titre text NOT NULL,
        montant numeric NOT NULL,
        categorie text NOT NULL,
        date text NOT NULL,
        beneficiaire text,
        reference text,
        commentaire text,
        enregistrePar text
    )';
    
    -- 16. NEW: Table Seances (Emploi du temps)
    EXECUTE 'CREATE TABLE IF NOT EXISTS "seances_' || school_slug || '" (
        id text PRIMARY KEY,
        classe text NOT NULL,
        matiere text NOT NULL,
        professeurId text NOT NULL,
        professeurNom text NOT NULL,
        date text NOT NULL,
        heureDebut text NOT NULL,
        heureFin text NOT NULL,
        statut text NOT NULL
    )';

    -- Recharger le cache du schéma pour PostgREST
    NOTIFY pgrst, 'reload schema';
END;
$$;
