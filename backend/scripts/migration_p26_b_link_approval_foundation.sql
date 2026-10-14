-- ============================================================================
-- P26-B Lot 1 : Fondations SQL pour l'Approbation du Rattachement Parent-Élève
-- Fichier : backend/scripts/migration_p26_b_link_approval_foundation.sql
-- Architecture : Option B (Révocation globale sécurisée avec protection historique)
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Table Centrale des Demandes de Rattachement et d'Audit
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.parent_student_link_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_slug TEXT NOT NULL,
    parent_id UUID NOT NULL,
    student_id TEXT NOT NULL,
    parent_phone_normalized TEXT NOT NULL,
    parent_name TEXT NOT NULL,
    student_name TEXT,
    student_class TEXT,
    phone_matched BOOLEAN NOT NULL DEFAULT false,
    status TEXT NOT NULL DEFAULT 'pending',
    source TEXT NOT NULL DEFAULT 'manual_request',
    rejection_reason_code TEXT,
    rejection_reason TEXT,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_at TIMESTAMPTZ,
    decided_by UUID,
    decided_by_name TEXT,
    revoked_at TIMESTAMPTZ,
    revoked_by UUID,
    revocation_reason TEXT,
    local_link_created_by_p26b BOOLEAN NOT NULL DEFAULT false,
    needs_global_reconciliation BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_link_request_status 
        CHECK (status IN ('pending', 'pending_verification', 'approved', 'rejected', 'revoked')),
    CONSTRAINT chk_link_request_source 
        CHECK (source IN ('manual_request', 'registration_autolink', 'historical_import')),
    CONSTRAINT chk_school_slug_format 
        CHECK (school_slug ~ '^[a-z0-9_]{1,50}$')
);

-- Index 1 : Protection anti-concurrence — au plus une demande active (pending ou pending_verification)
CREATE UNIQUE INDEX IF NOT EXISTS uq_link_requests_single_pending_review
    ON public.parent_student_link_requests(school_slug, parent_id, student_id)
    WHERE status IN ('pending', 'pending_verification');

-- Index 2 : Au plus un statut approved actif pour ce couple dans cet établissement
CREATE UNIQUE INDEX IF NOT EXISTS uq_link_requests_single_approved
    ON public.parent_student_link_requests(school_slug, parent_id, student_id)
    WHERE status = 'approved';

-- Index 3 : Queue de décision directeur par école et date
CREATE INDEX IF NOT EXISTS idx_link_requests_director_queue
    ON public.parent_student_link_requests(school_slug, status, requested_at DESC);

-- Index 4 : Historique des demandes pour un parent
CREATE INDEX IF NOT EXISTS idx_link_requests_parent_history
    ON public.parent_student_link_requests(parent_id, requested_at DESC);

-- Sécurité RLS stricte : accès réservé à service_role et postgres
ALTER TABLE public.parent_student_link_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.parent_student_link_requests FROM PUBLIC;
REVOKE ALL ON public.parent_student_link_requests FROM anon;
REVOKE ALL ON public.parent_student_link_requests FROM authenticated;
GRANT ALL ON public.parent_student_link_requests TO service_role;
GRANT ALL ON public.parent_student_link_requests TO postgres;

-- Trigger de protection transactionnelle anti-course critique pendant la synchronisation « Remplacer »
CREATE OR REPLACE FUNCTION public.trg_parent_student_link_requests_sync_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_student_exists BOOLEAN := false;
BEGIN
    -- S'applique STRICTEMENT à l'INSERTION d'une nouvelle demande
    -- (les UPDATE sont déjà régis par la hiérarchie des RPC P26-B, évitant tout risque d'inversion ou de deadlock)
    IF TG_OP = 'INSERT' THEN
        -- 1. Validation stricte préalable du format du school_slug avant tout verrou ou SQL dynamique
        IF NEW.school_slug IS NULL OR NEW.school_slug !~ '^[a-z0-9_]{1,50}$' THEN
            RAISE EXCEPTION 'Format de school_slug invalide : %', NEW.school_slug
                USING ERRCODE = '23514', CONSTRAINT = 'chk_school_slug_format';
        END IF;

        -- 2. Acquisition systématique du verrou partagé de Niveau 0
        -- Si un remplacement détient le verrou exclusif (0, school_slug:sync_reset), l'insertion attend la fin du remplacement.
        -- En temps normal (hors remplacement), ce verrou partagé est acquis immédiatement sans délai.
        PERFORM pg_advisory_xact_lock_shared(0, hashtext(NEW.school_slug || ':sync_reset'));

        -- 3. Validation explicite de l'identifiant élève
        IF NEW.student_id IS NULL OR trim(NEW.student_id) = '' THEN
            RAISE EXCEPTION 'INVALID_STUDENT_ID: L''identifiant de l''élève ne peut pas être null ou vide'
                USING ERRCODE = '23502';
        END IF;

        -- 4. Vérification systématique de l'existence de l'élève dans students_<school_slug>
        -- S'exécute toujours : que le verrou ait été obtenu immédiatement ou après attente d'un remplacement
        BEGIN
            EXECUTE format('
                SELECT EXISTS (
                    SELECT 1 FROM public.%I
                    WHERE id = %L
                )
            ', 'students_' || NEW.school_slug, NEW.student_id)
            INTO v_student_exists;

            IF NOT v_student_exists THEN
                RAISE EXCEPTION 'STUDENT_NOT_FOUND: L''élève % n''existe pas dans l''établissement %',
                    NEW.student_id, NEW.school_slug
                    USING ERRCODE = 'P0002';
            END IF;
        EXCEPTION
            WHEN undefined_table THEN
                RAISE EXCEPTION 'STUDENTS_TABLE_NOT_FOUND: La table des élèves pour l''établissement % n''existe pas',
                    NEW.school_slug
                    USING ERRCODE = '42P01';
        END;
    END IF;

    RETURN NEW;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_link_requests_sync_guard'
    ) THEN
        CREATE TRIGGER trg_link_requests_sync_guard
            BEFORE INSERT ON public.parent_student_link_requests
            FOR EACH ROW
            EXECUTE FUNCTION public.trg_parent_student_link_requests_sync_guard();
    END IF;
END $$;



-- ============================================================================
-- 2. Fonction Canonique create_school_tables (Alignée P6 + source_request_id)
-- ============================================================================
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

    -- 2. Table Students (avec photo_url, redoublant, ecole_provenance, matricule de P6)
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

    -- 3. Table Parent_Student (P26-B Lot 1 : ajout de source_request_id)
    EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I (
        parent_id uuid NOT NULL,
        student_id text NOT NULL,
        source_request_id uuid NULL,
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

    -- Sécurisation stricte des 18 tables créées
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
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
            EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', tbl);
            EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', tbl);
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'service_role_full_access', tbl);
            EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', 'service_role_full_access', tbl);
        END LOOP;
    END;

    -- Insertion du compte administrateur si demandé
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

    NOTIFY pgrst, 'reload schema';

    RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_school_tables(school_slug text, admin_nom text, admin_telephone text, admin_phone_normalized text, admin_auth_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_school_tables(school_slug text, admin_nom text, admin_telephone text, admin_phone_normalized text, admin_auth_id uuid) TO service_role, postgres;


-- ============================================================================
-- 3. Mise à Niveau Idempotente des Tables Existantes depuis public.schools
-- ============================================================================
DO $$
DECLARE
    r RECORD;
    v_table_name TEXT;
    v_col_exists BOOLEAN;
BEGIN
    FOR r IN (
        SELECT slug
        FROM public.schools
        WHERE slug IS NOT NULL
          AND slug ~ '^[a-z0-9_]{1,50}$'
        ORDER BY slug
    ) LOOP
        v_table_name := 'parent_student_' || r.slug;

        IF to_regclass(format('public.%I', v_table_name)) IS NOT NULL THEN
            SELECT EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = v_table_name
                  AND column_name = 'source_request_id'
            ) INTO v_col_exists;

            IF NOT v_col_exists THEN
                EXECUTE format(
                    'ALTER TABLE public.%I ADD COLUMN source_request_id UUID NULL',
                    v_table_name
                );
            END IF;
        END IF;
    END LOOP;
END $$;


-- ============================================================================
-- 4. RPC Transactionnelle : approve_parent_student_link
-- ============================================================================
CREATE OR REPLACE FUNCTION public.approve_parent_student_link(
    p_request_id UUID,
    p_school_slug TEXT,
    p_decided_by UUID,
    p_decided_by_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_req RECORD;
    v_admin_role TEXT;
    v_global_id UUID;
    v_inserted_parent_id UUID;
    v_local_created BOOLEAN := false;
    v_locked_student_id TEXT;
BEGIN
    SET LOCAL lock_timeout = '2s';

    IF p_request_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'INVALID_REQUEST_ID'); END IF;
    IF p_school_slug IS NULL OR p_school_slug !~ '^[a-z0-9_]{1,50}$' THEN RETURN jsonb_build_object('success', false, 'error', 'INVALID_SCHOOL_SLUG'); END IF;
    IF p_decided_by IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'INVALID_DECIDED_BY'); END IF;

    -- VERROU 0 : Orchestration partagée d'établissement (anti-inversion et anti-deadlock avec sync_replace)
    PERFORM pg_advisory_xact_lock_shared(0, hashtext(p_school_slug || ':sync_reset'));

    -- VERROU 1 : Sur la demande
    PERFORM pg_advisory_xact_lock(1, hashtext(p_school_slug || ':' || p_request_id::text));

    -- Habilitation
    BEGIN
        EXECUTE format('SELECT role FROM public.%I WHERE id = %L', 'profiles_' || p_school_slug, p_decided_by) INTO v_admin_role;
    EXCEPTION WHEN undefined_table THEN
        RETURN jsonb_build_object('success', false, 'error', 'SCHOOL_PROFILE_NOT_FOUND');
    END;
    IF v_admin_role IS NULL OR v_admin_role NOT IN ('admin', 'directeur', 'directeur_general', 'superadmin') THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED_APPROVER');
    END IF;

    -- Lecture demande sous FOR UPDATE
    SELECT * INTO v_req FROM public.parent_student_link_requests
    WHERE id = p_request_id AND school_slug = p_school_slug FOR UPDATE;

    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'REQUEST_NOT_FOUND'); END IF;
    IF v_req.status = 'approved' THEN
        RETURN jsonb_build_object('success', true, 'status', 'already_approved', 'request_id', p_request_id);
    END IF;
    IF v_req.status NOT IN ('pending', 'pending_verification') THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_STATUS_TRANSITION', 'current_status', v_req.status);
    END IF;

    -- VERROU 2 : Sur l'élève local pour synchroniser la résolution globale
    PERFORM pg_advisory_xact_lock(2, hashtext(p_school_slug || ':' || v_req.student_id));

    -- Véritable verrouillage de ligne exclusif sur la fiche élève locale (SELECT ... FOR UPDATE réel)
    BEGIN
        EXECUTE format('
            SELECT id FROM public.%I
            WHERE id = %L
            FOR UPDATE
        ', 'students_' || p_school_slug, v_req.student_id)
        INTO v_locked_student_id;
    EXCEPTION WHEN undefined_table THEN
        RETURN jsonb_build_object('success', false, 'error', 'LOCAL_TABLE_NOT_FOUND');
    END;

    IF v_locked_student_id IS NULL THEN
        UPDATE public.parent_student_link_requests
        SET status = 'rejected',
            decided_at = now(),
            decided_by = p_decided_by,
            rejection_reason_code = 'STUDENT_DELETED_LOCAL',
            rejection_reason = 'Élève introuvable ou supprimé de l''établissement avant approbation.',
            updated_at = now()
        WHERE id = p_request_id;

        RETURN jsonb_build_object('success', false, 'error', 'STUDENT_NOT_FOUND', 'message', 'L''élève n''existe plus dans l''établissement.');
    END IF;

    -- Insertion locale avec détection de création effective
    BEGIN
        EXECUTE format('
            INSERT INTO public.%I (parent_id, student_id, source_request_id)
            VALUES (%L, %L, %L)
            ON CONFLICT (parent_id, student_id) DO NOTHING
            RETURNING parent_id
        ', 'parent_student_' || p_school_slug, v_req.parent_id, v_req.student_id, p_request_id)
        INTO v_inserted_parent_id;

        v_local_created := (v_inserted_parent_id IS NOT NULL);
    EXCEPTION WHEN undefined_table THEN
        RETURN jsonb_build_object('success', false, 'error', 'LOCAL_TABLE_NOT_FOUND');
    END;

    -- Résolution de l'identité globale
    SELECT student_global_id INTO v_global_id
    FROM public.student_global_mappings
    WHERE school_slug = p_school_slug AND student_local_id = v_req.student_id;

    IF v_global_id IS NULL THEN
        INSERT INTO public.global_students DEFAULT VALUES RETURNING student_global_id INTO v_global_id;
        INSERT INTO public.student_global_mappings (school_slug, student_local_id, student_global_id)
        VALUES (p_school_slug, v_req.student_id, v_global_id)
        ON CONFLICT (school_slug, student_local_id) DO NOTHING;

        SELECT student_global_id INTO v_global_id
        FROM public.student_global_mappings
        WHERE school_slug = p_school_slug AND student_local_id = v_req.student_id;
    END IF;

    -- VERROU 3 : Verrou inter-établissements sur le couple global parent-élève
    PERFORM pg_advisory_xact_lock(3, hashtext(v_req.parent_id::text || ':' || v_global_id::text));

    -- Insertion ou réactivation dans parent_child_links
    INSERT INTO public.parent_child_links (parent_ref, student_global_id, first_linked_at, current_link_active)
    VALUES (v_req.parent_id::text, v_global_id, now(), true)
    ON CONFLICT (parent_ref, student_global_id)
    DO UPDATE SET current_link_active = true, updated_at = now();

    -- Mise à jour statut de la demande
    UPDATE public.parent_student_link_requests
    SET status = 'approved',
        decided_at = now(),
        decided_by = p_decided_by,
        decided_by_name = COALESCE(p_decided_by_name, v_req.decided_by_name),
        local_link_created_by_p26b = v_local_created,
        needs_global_reconciliation = false,
        updated_at = now()
    WHERE id = p_request_id;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'approved',
        'request_id', p_request_id,
        'local_link_created', v_local_created,
        'student_id', v_req.student_id,
        'student_global_id', v_global_id
    );

EXCEPTION
    WHEN lock_not_available OR deadlock_detected THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'CONCURRENCY_LOCK_TIMEOUT',
            'message', 'Conflit de verrouillage temporaire lors de l approbation. Veuillez réitérer.'
        );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_parent_student_link(UUID, TEXT, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_parent_student_link(UUID, TEXT, UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.approve_parent_student_link(UUID, TEXT, UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.approve_parent_student_link(UUID, TEXT, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.approve_parent_student_link(UUID, TEXT, UUID, TEXT) TO postgres;


-- ============================================================================
-- 5. RPC Transactionnelle : reject_parent_student_link
-- ============================================================================
CREATE OR REPLACE FUNCTION public.reject_parent_student_link(
    p_request_id UUID,
    p_school_slug TEXT,
    p_decided_by UUID,
    p_rejection_reason TEXT,
    p_rejection_reason_code TEXT DEFAULT 'OTHER',
    p_decided_by_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_req RECORD;
    v_admin_role TEXT;
BEGIN
    SET LOCAL lock_timeout = '2s';

    IF p_request_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'INVALID_REQUEST_ID'); END IF;
    IF p_school_slug IS NULL OR p_school_slug !~ '^[a-z0-9_]{1,50}$' THEN RETURN jsonb_build_object('success', false, 'error', 'INVALID_SCHOOL_SLUG'); END IF;
    IF p_decided_by IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'INVALID_DECIDED_BY'); END IF;
    IF p_rejection_reason IS NULL OR trim(p_rejection_reason) = '' THEN RETURN jsonb_build_object('success', false, 'error', 'REJECTION_REASON_REQUIRED'); END IF;

    -- VERROU 0 : Orchestration partagée d'établissement (anti-inversion et anti-deadlock avec sync_replace)
    PERFORM pg_advisory_xact_lock_shared(0, hashtext(p_school_slug || ':sync_reset'));

    -- VERROU 1 : Sur la demande
    PERFORM pg_advisory_xact_lock(1, hashtext(p_school_slug || ':' || p_request_id::text));

    -- Habilitation
    BEGIN
        EXECUTE format('SELECT role FROM public.%I WHERE id = %L', 'profiles_' || p_school_slug, p_decided_by) INTO v_admin_role;
    EXCEPTION WHEN undefined_table THEN
        RETURN jsonb_build_object('success', false, 'error', 'SCHOOL_PROFILE_NOT_FOUND');
    END;
    IF v_admin_role IS NULL OR v_admin_role NOT IN ('admin', 'directeur', 'directeur_general', 'superadmin') THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED_APPROVER');
    END IF;

    SELECT * INTO v_req FROM public.parent_student_link_requests
    WHERE id = p_request_id AND school_slug = p_school_slug FOR UPDATE;

    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'REQUEST_NOT_FOUND'); END IF;
    IF v_req.status = 'rejected' THEN
        RETURN jsonb_build_object('success', true, 'status', 'already_rejected', 'request_id', p_request_id);
    END IF;
    IF v_req.status NOT IN ('pending', 'pending_verification') THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_STATUS_TRANSITION', 'current_status', v_req.status);
    END IF;

    UPDATE public.parent_student_link_requests
    SET status = 'rejected',
        rejection_reason = trim(p_rejection_reason),
        rejection_reason_code = COALESCE(p_rejection_reason_code, 'OTHER'),
        decided_at = now(),
        decided_by = p_decided_by,
        decided_by_name = COALESCE(p_decided_by_name, v_req.decided_by_name),
        updated_at = now()
    WHERE id = p_request_id;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'rejected',
        'request_id', p_request_id
    );

EXCEPTION
    WHEN lock_not_available OR deadlock_detected THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'CONCURRENCY_LOCK_TIMEOUT',
            'message', 'Conflit de verrouillage temporaire lors du rejet. Veuillez réitérer.'
        );
END;
$$;

REVOKE ALL ON FUNCTION public.reject_parent_student_link(UUID, TEXT, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_parent_student_link(UUID, TEXT, UUID, TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.reject_parent_student_link(UUID, TEXT, UUID, TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reject_parent_student_link(UUID, TEXT, UUID, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.reject_parent_student_link(UUID, TEXT, UUID, TEXT, TEXT, TEXT) TO postgres;


-- ============================================================================
-- 6. RPC Transactionnelle : revoke_parent_student_link (Option B rigoureuse)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.revoke_parent_student_link(
    p_request_id UUID,
    p_school_slug TEXT,
    p_revoked_by UUID,
    p_revocation_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_req RECORD;
    v_admin_role TEXT;
    v_global_id UUID;
    v_source_in_table UUID;
    v_row_exists BOOLEAN := false;
    v_table_absent BOOLEAN := false;
    v_deleted_parent_id UUID;
    v_local_link_removed BOOLEAN := false;
    v_preserved_reason TEXT := NULL;
    v_has_other_legitimate_link BOOLEAN := false;
    v_scan_uncertainty BOOLEAN := false;
    v_mapping RECORD;
    v_other_local_exists BOOLEAN;
    v_needs_reconciliation BOOLEAN := false;
    v_global_deactivated BOOLEAN := false;
    v_local_still_present BOOLEAN := false;
BEGIN
    SET LOCAL lock_timeout = '2s';

    IF p_request_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'INVALID_REQUEST_ID'); END IF;
    IF p_school_slug IS NULL OR p_school_slug !~ '^[a-z0-9_]{1,50}$' THEN RETURN jsonb_build_object('success', false, 'error', 'INVALID_SCHOOL_SLUG'); END IF;
    IF p_revoked_by IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'INVALID_REVOKED_BY'); END IF;
    IF p_revocation_reason IS NULL OR trim(p_revocation_reason) = '' THEN RETURN jsonb_build_object('success', false, 'error', 'REVOCATION_REASON_REQUIRED'); END IF;

    -- VERROU 0 : Orchestration partagée d'établissement (anti-inversion et anti-deadlock avec sync_replace)
    PERFORM pg_advisory_xact_lock_shared(0, hashtext(p_school_slug || ':sync_reset'));

    -- VERROU 1 : Sur la demande
    PERFORM pg_advisory_xact_lock(1, hashtext(p_school_slug || ':' || p_request_id::text));

    -- Habilitation
    BEGIN
        EXECUTE format('SELECT role FROM public.%I WHERE id = %L', 'profiles_' || p_school_slug, p_revoked_by) INTO v_admin_role;
    EXCEPTION WHEN undefined_table THEN
        RETURN jsonb_build_object('success', false, 'error', 'SCHOOL_PROFILE_NOT_FOUND');
    END;
    IF v_admin_role IS NULL OR v_admin_role NOT IN ('admin', 'directeur', 'directeur_general', 'superadmin') THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED_APPROVER');
    END IF;

    -- Lecture demande sous FOR UPDATE
    SELECT * INTO v_req FROM public.parent_student_link_requests
    WHERE id = p_request_id AND school_slug = p_school_slug FOR UPDATE;

    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'REQUEST_NOT_FOUND'); END IF;
    IF v_req.status = 'revoked' THEN
        RETURN jsonb_build_object('success', true, 'status', 'already_revoked', 'request_id', p_request_id);
    END IF;
    IF v_req.status <> 'approved' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_STATUS_TRANSITION', 'current_status', v_req.status);
    END IF;

    -- VERROU 2 : Verrou local d'établissement sur le couple parent-élève (compatible hiérarchie P26-B)
    PERFORM pg_advisory_xact_lock(2, hashtext(p_school_slug || ':' || v_req.parent_id::text || ':' || trim(v_req.student_id)));

    -- 2. Diagnostic et traitement local dans l'établissement courant
    IF NOT v_req.local_link_created_by_p26b THEN
        v_local_link_removed := false;

        BEGIN
            EXECUTE format('
                SELECT EXISTS (
                    SELECT 1 FROM public.%I
                    WHERE parent_id = %L AND student_id = %L
                )
            ', 'parent_student_' || p_school_slug, v_req.parent_id, v_req.student_id)
            INTO v_local_still_present;

            IF v_local_still_present THEN
                v_preserved_reason          := 'historical_link_present';
                v_has_other_legitimate_link := true;
                v_needs_reconciliation      := false;
            ELSE
                v_preserved_reason          := 'historical_link_already_absent';
                v_has_other_legitimate_link := false;
                v_scan_uncertainty          := true;
                v_needs_reconciliation      := true;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            v_preserved_reason          := 'historical_table_inaccessible';
            v_scan_uncertainty          := true;
            v_needs_reconciliation      := true;
        END;

    ELSE
        BEGIN
            EXECUTE format('
                SELECT source_request_id
                FROM public.%I
                WHERE parent_id = %L AND student_id = %L
                FOR UPDATE
            ', 'parent_student_' || p_school_slug, v_req.parent_id, v_req.student_id)
            INTO v_source_in_table;

            v_row_exists := FOUND;
        EXCEPTION WHEN undefined_table THEN
            v_table_absent := true;
        END;

        IF v_table_absent THEN
            v_local_link_removed   := false;
            v_preserved_reason     := 'table_not_found';
            v_scan_uncertainty     := true;
            v_needs_reconciliation := true;

        ELSIF NOT v_row_exists THEN
            v_local_link_removed   := false;
            v_preserved_reason     := 'already_absent';
            v_scan_uncertainty     := true;
            v_needs_reconciliation := true;

        ELSIF v_source_in_table IS DISTINCT FROM p_request_id THEN
            v_local_link_removed        := false;
            v_preserved_reason          := 'source_mismatch';
            v_has_other_legitimate_link := true;
            v_needs_reconciliation      := false;

        ELSE
            EXECUTE format('
                DELETE FROM public.%I
                WHERE parent_id = %L AND student_id = %L AND source_request_id = %L
                RETURNING parent_id
            ', 'parent_student_' || p_school_slug, v_req.parent_id, v_req.student_id, p_request_id)
            INTO v_deleted_parent_id;

            v_local_link_removed := (v_deleted_parent_id IS NOT NULL);
        END IF;
    END IF;

    -- 3. Résolution de l'élève global
    SELECT student_global_id INTO v_global_id
    FROM public.student_global_mappings
    WHERE school_slug = p_school_slug AND student_local_id = v_req.student_id;

    -- 4. Évaluation globale et mise à jour sous VERROU 3
    IF v_global_id IS NOT NULL THEN
        -- VERROU 3 : Verrou inter-établissements sur le couple global
        PERFORM pg_advisory_xact_lock(3, hashtext(v_req.parent_id::text || ':' || v_global_id::text));

        -- Si un lien physique légitime n'a pas encore été prouvé, scanner les AUTRES établissements mappés
        IF NOT v_has_other_legitimate_link THEN
            FOR v_mapping IN (
                SELECT school_slug, student_local_id
                FROM public.student_global_mappings
                WHERE student_global_id = v_global_id
                  AND (school_slug <> p_school_slug OR student_local_id <> v_req.student_id)
            ) LOOP
                BEGIN
                    EXECUTE format('
                        SELECT EXISTS (
                            SELECT 1 FROM public.%I
                            WHERE parent_id = %L AND student_id = %L
                        )
                    ', 'parent_student_' || v_mapping.school_slug,
                       v_req.parent_id, v_mapping.student_local_id)
                    INTO v_other_local_exists;

                    IF v_other_local_exists THEN
                        v_has_other_legitimate_link := true;
                        EXIT;
                    END IF;
                EXCEPTION WHEN OTHERS THEN
                    v_scan_uncertainty := true;
                END;
            END LOOP;
        END IF;

        -- Décision déterministe
        IF v_has_other_legitimate_link THEN
            v_global_deactivated   := false;
            v_needs_reconciliation := false;

        ELSIF v_scan_uncertainty OR v_preserved_reason IN ('already_absent', 'table_not_found', 'historical_link_already_absent', 'historical_table_inaccessible') THEN
            v_global_deactivated   := false;
            v_needs_reconciliation := true;

        ELSE
            UPDATE public.parent_child_links
            SET current_link_active = false,
                updated_at = now()
            WHERE parent_ref = v_req.parent_id::text AND student_global_id = v_global_id;

            v_global_deactivated   := true;
            v_needs_reconciliation := false;
        END IF;
    END IF;

    -- 5. Mise à jour de la demande
    UPDATE public.parent_student_link_requests
    SET status = 'revoked',
        revoked_at = now(),
        revoked_by = p_revoked_by,
        revocation_reason = trim(p_revocation_reason),
        needs_global_reconciliation = v_needs_reconciliation,
        updated_at = now()
    WHERE id = p_request_id;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'revoked',
        'request_id', p_request_id,
        'local_link_removed', v_local_link_removed,
        'local_link_preserved_reason', v_preserved_reason,
        'global_link_deactivated', v_global_deactivated,
        'needs_global_reconciliation', v_needs_reconciliation
    );

EXCEPTION
    WHEN lock_not_available OR deadlock_detected THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'CONCURRENCY_LOCK_TIMEOUT',
            'message', 'Conflit de verrouillage avec une opération concurrente. Veuillez réitérer.'
        );
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_parent_student_link(UUID, TEXT, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_parent_student_link(UUID, TEXT, UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.revoke_parent_student_link(UUID, TEXT, UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_parent_student_link(UUID, TEXT, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_parent_student_link(UUID, TEXT, UUID, TEXT) TO postgres;


-- ============================================================================
-- 7. RPC Transactionnelle : reconcile_parent_child_link
-- ============================================================================
CREATE OR REPLACE FUNCTION public.reconcile_parent_child_link(
    p_parent_id UUID,
    p_student_global_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_has_active_link BOOLEAN := false;
    v_mapping_count INT := 0;
    v_mapping RECORD;
    v_local_exists BOOLEAN;
    v_scan_error BOOLEAN := false;
    v_link_row RECORD;
BEGIN
    SET LOCAL lock_timeout = '3s';

    IF p_parent_id IS NULL OR p_student_global_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_PARAMETERS');
    END IF;

    -- VERROU 3 : Verrou advisory sur le couple global
    PERFORM pg_advisory_xact_lock(3, hashtext(p_parent_id::text || ':' || p_student_global_id::text));

    -- Verrouillage de la ligne dans parent_child_links si présente
    SELECT * INTO v_link_row
    FROM public.parent_child_links
    WHERE parent_ref = p_parent_id::text AND student_global_id = p_student_global_id
    FOR UPDATE;

    -- Vérification de l'existence de mappings pour cet élève global
    SELECT count(*) INTO v_mapping_count
    FROM public.student_global_mappings
    WHERE student_global_id = p_student_global_id;

    -- Anomalie : Absence de mapping (suspension sans désactivation aveugle)
    IF v_mapping_count = 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'anomaly_no_mappings',
            'current_link_active', COALESCE(v_link_row.current_link_active, false),
            'reconciled', false,
            'message', 'ANOMALIE : Aucun mapping établissement trouvé pour cet élève global. Réconciliation suspendue.'
        );
    END IF;

    -- Inspection physique de chaque établissement mappé
    FOR v_mapping IN (
        SELECT school_slug, student_local_id
        FROM public.student_global_mappings
        WHERE student_global_id = p_student_global_id
    ) LOOP
        BEGIN
            EXECUTE format('
                SELECT EXISTS (
                    SELECT 1 FROM public.%I
                    WHERE parent_id = %L AND student_id = %L
                )
            ', 'parent_student_' || v_mapping.school_slug,
               p_parent_id, v_mapping.student_local_id)
            INTO v_local_exists;

            IF v_local_exists THEN
                v_has_active_link := true;
                EXIT;
            END IF;

        EXCEPTION WHEN OTHERS THEN
            v_scan_error := true;
        END;
    END LOOP;

    -- Décision conservatoire en cas d'erreur lors du scan
    IF v_scan_error THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'PARTIAL_SCAN_ERROR',
            'message', 'Une ou plusieurs tables scolaires étaient inaccessibles. État conservé.'
        );
    END IF;

    -- Mise à jour globale
    IF v_link_row IS NOT NULL THEN
        UPDATE public.parent_child_links
        SET current_link_active = v_has_active_link,
            updated_at = now()
        WHERE parent_ref = p_parent_id::text AND student_global_id = p_student_global_id;
    END IF;

    -- Décharge des indicateurs de réconciliation
    UPDATE public.parent_student_link_requests req
    SET needs_global_reconciliation = false,
        updated_at = now()
    FROM public.student_global_mappings sgm
    WHERE req.school_slug = sgm.school_slug
      AND req.student_id = sgm.student_local_id
      AND req.parent_id = p_parent_id
      AND sgm.student_global_id = p_student_global_id
      AND req.needs_global_reconciliation = true;

    RETURN jsonb_build_object(
        'success', true,
        'current_link_active', v_has_active_link,
        'reconciled', true
    );

EXCEPTION
    WHEN lock_not_available OR deadlock_detected THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'CONCURRENCY_LOCK_TIMEOUT',
            'message', 'Conflit de verrouillage temporaire lors de la réconciliation. Réessayer ultérieurement.'
        );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_parent_child_link(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_parent_child_link(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.reconcile_parent_child_link(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_parent_child_link(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_parent_child_link(UUID, UUID) TO postgres;


-- ============================================================================
-- 8. RPC Transactionnelle : unlink_parent_student_local (Atomique & Multi-écoles)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.unlink_parent_student_local(
    p_school_slug TEXT,
    p_parent_id UUID,
    p_student_id TEXT,
    p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_role TEXT;
    v_global_id UUID;
    v_local_deleted BOOLEAN := false;
    v_deleted_parent_id UUID;
    v_has_other_legitimate_link BOOLEAN := false;
    v_scan_uncertainty BOOLEAN := false;
    v_mapping RECORD;
    v_other_local_exists BOOLEAN;
    v_global_link_deactivated BOOLEAN := false;
    v_needs_reconciliation BOOLEAN := false;
    v_actor_profile_exists BOOLEAN := false;
BEGIN
    SET LOCAL lock_timeout = '2s';

    IF p_school_slug IS NULL OR p_school_slug !~ '^[a-z0-9_]{1,50}$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_SCHOOL_SLUG');
    END IF;
    IF p_parent_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_PARENT_ID');
    END IF;
    IF p_student_id IS NULL OR trim(p_student_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_STUDENT_ID');
    END IF;
    IF p_actor_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_ACTOR_ID');
    END IF;

    -- 1. Contrôle d'habilitation et confinement à l'établissement
    BEGIN
        EXECUTE format('
            SELECT EXISTS (
                SELECT 1 FROM public.%I WHERE id = %L
            ), (
                SELECT role FROM public.%I WHERE id = %L
            )
        ', 'profiles_' || p_school_slug, p_actor_id,
           'profiles_' || p_school_slug, p_actor_id)
        INTO v_actor_profile_exists, v_actor_role;
    EXCEPTION WHEN undefined_table THEN
        RETURN jsonb_build_object('success', false, 'error', 'SCHOOL_PROFILE_NOT_FOUND');
    END;

    IF NOT v_actor_profile_exists THEN
        RETURN jsonb_build_object('success', false, 'error', 'ACTOR_NOT_IN_SCHOOL', 'message', 'Demandeur non confiné à cet établissement.');
    END IF;

    IF p_actor_id <> p_parent_id THEN
        IF v_actor_role IS NULL OR v_actor_role NOT IN ('admin', 'directeur', 'directeur_general', 'superadmin') THEN
            RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED_ACTOR', 'message', 'Rôle insuffisant pour détacher un tiers.');
        END IF;
    END IF;

    -- VERROU 0 : Orchestration partagée d'établissement (anti-inversion et anti-deadlock avec sync_replace)
    PERFORM pg_advisory_xact_lock_shared(0, hashtext(p_school_slug || ':sync_reset'));

    -- 2. Résolution de l'élève global
    SELECT student_global_id INTO v_global_id
    FROM public.student_global_mappings
    WHERE school_slug = p_school_slug AND student_local_id = trim(p_student_id);

    -- 3. VERROU 2 : Verrou local d'établissement sur le couple parent-élève (compatible hiérarchie P26-B)
    PERFORM pg_advisory_xact_lock(2, hashtext(p_school_slug || ':' || p_parent_id::text || ':' || trim(p_student_id)));

    -- 4. VERROU 3 : Verrou inter-établissements sur le couple global
    IF v_global_id IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(3, hashtext(p_parent_id::text || ':' || v_global_id::text));
    END IF;

    -- 5. Suppression locale atomique dans la table de l'établissement
    BEGIN
        EXECUTE format('
            DELETE FROM public.%I
            WHERE parent_id = %L AND student_id = %L
            RETURNING parent_id
        ', 'parent_student_' || p_school_slug, p_parent_id, trim(p_student_id))
        INTO v_deleted_parent_id;

        v_local_deleted := (v_deleted_parent_id IS NOT NULL);
    EXCEPTION WHEN undefined_table THEN
        RETURN jsonb_build_object('success', false, 'error', 'TABLE_NOT_FOUND');
    END;

    IF NOT v_local_deleted THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'LINK_NOT_FOUND',
            'message', 'Aucun rattachement local actif trouvé pour cet élève et ce parent dans cet établissement.'
        );
    END IF;

    -- 5. Scan des autres établissements si l'élève est rattaché globalement
    IF v_global_id IS NOT NULL THEN
        FOR v_mapping IN (
            SELECT school_slug, student_local_id
            FROM public.student_global_mappings
            WHERE student_global_id = v_global_id
              AND (school_slug <> p_school_slug OR student_local_id <> trim(p_student_id))
        ) LOOP
            BEGIN
                EXECUTE format('
                    SELECT EXISTS (
                        SELECT 1 FROM public.%I
                        WHERE parent_id = %L AND student_id = %L
                    )
                ', 'parent_student_' || v_mapping.school_slug,
                   p_parent_id, v_mapping.student_local_id)
                INTO v_other_local_exists;

                IF v_other_local_exists THEN
                    v_has_other_legitimate_link := true;
                    EXIT;
                END IF;
            EXCEPTION WHEN OTHERS THEN
                v_scan_uncertainty := true;
            END;
        END LOOP;

        -- 6. Mise à jour de parent_child_links sous VERROU 3
        IF v_has_other_legitimate_link THEN
            -- Un lien légitime existe dans un autre établissement : MAINTIEN DU LIEN GLOBAL
            v_global_link_deactivated := false;
            v_needs_reconciliation    := false;
        ELSIF v_scan_uncertainty THEN
            -- Incertitude lors du scan d'au moins une autre école : NE PAS DÉSACTIVER AVEUGLÉMENT
            v_global_link_deactivated := false;
            v_needs_reconciliation    := true;
        ELSE
            -- Aucun autre rattachement dans aucune école : DÉSACTIVATION SÛRE
            UPDATE public.parent_child_links
            SET current_link_active = false,
                updated_at = now()
            WHERE parent_ref = p_parent_id::text AND student_global_id = v_global_id;

            v_global_link_deactivated := true;
            v_needs_reconciliation    := false;
        END IF;

        -- 7. Mise à jour éventuelle des demandes d'approbation P26-B
        UPDATE public.parent_student_link_requests
        SET needs_global_reconciliation = v_needs_reconciliation,
            updated_at = now()
        WHERE school_slug = p_school_slug
          AND student_id = trim(p_student_id)
          AND parent_id = p_parent_id
          AND status = 'approved';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'local_deleted', true,
        'has_other_legitimate_link', v_has_other_legitimate_link,
        'global_link_deactivated', v_global_link_deactivated,
        'needs_global_reconciliation', v_needs_reconciliation,
        'student_global_id', v_global_id
    );

EXCEPTION
    WHEN lock_not_available OR deadlock_detected THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'CONCURRENCY_LOCK_TIMEOUT',
            'message', 'Conflit de verrouillage temporaire lors de la suppression du lien. Veuillez réitérer.'
        );
END;
$$;

REVOKE ALL ON FUNCTION public.unlink_parent_student_local(TEXT, UUID, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unlink_parent_student_local(TEXT, UUID, TEXT, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.unlink_parent_student_local(TEXT, UUID, TEXT, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.unlink_parent_student_local(TEXT, UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.unlink_parent_student_local(TEXT, UUID, TEXT, UUID) TO postgres;


-- ============================================================================
-- 9. RPC Transactionnelle : delete_student_local_atomically (Atomic Multi-parents)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.delete_student_local_atomically(
    p_school_slug TEXT,
    p_student_id TEXT,
    p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_profile_exists BOOLEAN := false;
    v_actor_role TEXT;
    v_student_exists BOOLEAN := false;
    v_locked_student_id TEXT;
    v_student_global_id UUID;
    v_req RECORD;
    v_parent RECORD;
    v_deleted_parents_count INT := 0;
    v_global_links_deactivated_count INT := 0;
    v_global_links_preserved_count INT := 0;
    v_has_other_school_link BOOLEAN;
    v_other_mapping RECORD;
    v_other_local_link_exists BOOLEAN;
BEGIN
    SET LOCAL lock_timeout = '2s';

    IF p_school_slug IS NULL OR p_school_slug !~ '^[a-z0-9_]{1,50}$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_SCHOOL_SLUG');
    END IF;

    IF p_student_id IS NULL OR trim(p_student_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_STUDENT_ID');
    END IF;

    IF p_actor_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_ACTOR_ID');
    END IF;

    -- 1. Contrôle d'habilitation et confinement strict à l'établissement (Exclusion stricte du comptable)
    BEGIN
        EXECUTE format('
            SELECT EXISTS (
                SELECT 1 FROM public.%I WHERE id = %L
            ), (
                SELECT role FROM public.%I WHERE id = %L
            )
        ', 'profiles_' || p_school_slug, p_actor_id,
           'profiles_' || p_school_slug, p_actor_id)
        INTO v_actor_profile_exists, v_actor_role;
    EXCEPTION WHEN undefined_table THEN
        RETURN jsonb_build_object('success', false, 'error', 'SCHOOL_PROFILE_NOT_FOUND', 'message', 'Table de profils de l''établissement introuvable.');
    END;

    IF NOT v_actor_profile_exists THEN
        RETURN jsonb_build_object('success', false, 'error', 'ACTOR_NOT_IN_SCHOOL', 'message', 'Demandeur non confiné à cet établissement.');
    END IF;

    IF v_actor_role IS NULL OR v_actor_role NOT IN ('admin', 'directeur', 'directeur_general', 'superadmin') THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED_ACTOR', 'message', 'Rôle insuffisant pour supprimer un élève.');
    END IF;

    -- 2. ORDRE STRICT DES VERROUS : PHASE 0 — Orchestration partagée d'établissement (anti-inversion et anti-deadlock avec sync_replace)
    PERFORM pg_advisory_xact_lock_shared(0, hashtext(p_school_slug || ':sync_reset'));

    -- PHASE 1 — Tous les verrous de Niveau 1 (Demandes P26-B actives)
    FOR v_req IN
        SELECT id
        FROM public.parent_student_link_requests
        WHERE school_slug = p_school_slug
          AND student_id = trim(p_student_id)
          AND status IN ('pending', 'pending_verification', 'approved')
        ORDER BY id ASC
    LOOP
        PERFORM pg_advisory_xact_lock(1, hashtext(p_school_slug || ':' || v_req.id::text));
    END LOOP;

    -- 3. ORDRE STRICT DES VERROUS : PHASE 2 — Verrous de Niveau 2 (Local Établissement)
    PERFORM pg_advisory_xact_lock(2, hashtext(p_school_slug || ':' || trim(p_student_id)));

    -- 4. Véritable verrouillage de ligne sur la fiche élève locale (FOR UPDATE réel)
    BEGIN
        EXECUTE format('
            SELECT id FROM public.%I
            WHERE id = %L
            FOR UPDATE
        ', 'students_' || p_school_slug, trim(p_student_id))
        INTO v_locked_student_id;

        v_student_exists := (v_locked_student_id IS NOT NULL);
    EXCEPTION WHEN undefined_table THEN
        RETURN jsonb_build_object('success', false, 'error', 'STUDENTS_TABLE_NOT_FOUND');
    END;

    IF NOT v_student_exists THEN
        RETURN jsonb_build_object('success', false, 'error', 'STUDENT_NOT_FOUND', 'message', 'Élève introuvable dans cet établissement.');
    END IF;

    -- Verrous de Niveau 2 sur chaque couple local parent-élève (tri déterministe ASC)
    BEGIN
        FOR v_parent IN
            EXECUTE format('
                SELECT parent_id, source_request_id
                FROM public.%I
                WHERE student_id = %L
                ORDER BY parent_id ASC
            ', 'parent_student_' || p_school_slug, trim(p_student_id))
        LOOP
            PERFORM pg_advisory_xact_lock(2, hashtext(p_school_slug || ':' || v_parent.parent_id::text || ':' || trim(p_student_id)));
        END LOOP;
    EXCEPTION WHEN undefined_table THEN
        RETURN jsonb_build_object('success', false, 'error', 'PARENT_STUDENT_TABLE_NOT_FOUND');
    END;

    -- 5. Résolution de l'identité globale
    SELECT student_global_id INTO v_student_global_id
    FROM public.student_global_mappings
    WHERE school_slug = p_school_slug AND student_local_id = trim(p_student_id);

    -- 6. ORDRE STRICT DES VERROUS : PHASE 3 — Verrous de Niveau 3 (Global Inter-établissements)
    IF v_student_global_id IS NOT NULL THEN
        FOR v_parent IN
            EXECUTE format('
                SELECT parent_id
                FROM public.%I
                WHERE student_id = %L
                ORDER BY parent_id ASC
            ', 'parent_student_' || p_school_slug, trim(p_student_id))
        LOOP
            PERFORM pg_advisory_xact_lock(3, hashtext(v_parent.parent_id::text || ':' || v_student_global_id::text));
        END LOOP;
    END IF;

    -- 7. Clôture immédiate de toute demande pendante pour cet élève (prévention de création concurrente)
    UPDATE public.parent_student_link_requests
    SET status = 'rejected',
        decided_by = p_actor_id,
        decided_at = now(),
        rejection_reason_code = 'STUDENT_DELETED_LOCAL',
        rejection_reason = 'Élève supprimé de l''établissement avant validation de la demande.',
        updated_at = now()
    WHERE school_slug = p_school_slug
      AND student_id = trim(p_student_id)
      AND status IN ('pending', 'pending_verification');

    -- 8. Traitement ordonné des parents et respect strict de la provenance P26-B
    FOR v_parent IN
        EXECUTE format('
            SELECT parent_id, source_request_id
            FROM public.%I
            WHERE student_id = %L
            ORDER BY parent_id ASC
        ', 'parent_student_' || p_school_slug, trim(p_student_id))
    LOOP
        -- 8.1. Révocation uniquement si la demande P26-B source correspond exactement
        IF v_parent.source_request_id IS NOT NULL THEN
            SELECT * INTO v_req
            FROM public.parent_student_link_requests
            WHERE id = v_parent.source_request_id
              AND school_slug = p_school_slug
              AND student_id = trim(p_student_id)
              AND parent_id = v_parent.parent_id
              AND local_link_created_by_p26b = true;

            IF v_req.id IS NOT NULL THEN
                UPDATE public.parent_student_link_requests
                SET status = 'revoked',
                    revoked_at = now(),
                    revoked_by = p_actor_id,
                    revocation_reason = 'Suppression atomique de l''élève de l''établissement',
                    needs_global_reconciliation = false,
                    updated_at = now()
                WHERE id = v_req.id;
            END IF;
        END IF;

        -- 8.2. Suppression du lien local pour ce couple
        EXECUTE format('
            DELETE FROM public.%I
            WHERE parent_id = %L AND student_id = %L
        ', 'parent_student_' || p_school_slug, v_parent.parent_id, trim(p_student_id));

        v_deleted_parents_count := v_deleted_parents_count + 1;

        -- 8.3. Scan des autres établissements si l'élève est rattaché globalement
        IF v_student_global_id IS NOT NULL THEN
            v_has_other_school_link := false;

            FOR v_other_mapping IN (
                SELECT school_slug, student_local_id
                FROM public.student_global_mappings
                WHERE student_global_id = v_student_global_id
                  AND (school_slug <> p_school_slug OR student_local_id <> trim(p_student_id))
            ) LOOP
                BEGIN
                    EXECUTE format('
                        SELECT EXISTS (
                            SELECT 1 FROM public.%I
                            WHERE parent_id = %L AND student_id = %L
                        )
                    ', 'parent_student_' || v_other_mapping.school_slug,
                       v_parent.parent_id, v_other_mapping.student_local_id)
                    INTO v_other_local_link_exists;

                    IF v_other_local_link_exists THEN
                        v_has_other_school_link := true;
                        EXIT;
                    END IF;
                EXCEPTION WHEN OTHERS THEN
                    RAISE EXCEPTION 'GLOBAL_SCAN_FAILURE: Echec de verification inter-etablissements sur l''ecole %', v_other_mapping.school_slug;
                END;
            END LOOP;

            -- 8.4. Réconciliation globale déterministe
            IF v_has_other_school_link THEN
                v_global_links_preserved_count := v_global_links_preserved_count + 1;
            ELSE
                UPDATE public.parent_child_links
                SET current_link_active = false,
                    updated_at = now()
                WHERE parent_ref = v_parent.parent_id::text
                  AND student_global_id = v_student_global_id;

                v_global_links_deactivated_count := v_global_links_deactivated_count + 1;
            END IF;
        END IF;
    END LOOP;

    -- 9. Suppression ordonnée des données scolaires locales (Schéma canonique respecté)
    EXECUTE format('DELETE FROM public.%I WHERE student_id = %L', 'payments_' || p_school_slug, trim(p_student_id));
    EXECUTE format('DELETE FROM public.%I WHERE student_id = %L', 'presences_' || p_school_slug, trim(p_student_id));
    EXECUTE format('DELETE FROM public.%I WHERE student_id = %L', 'notes_' || p_school_slug, trim(p_student_id));
    EXECUTE format('DELETE FROM public.%I WHERE id = %L', 'students_' || p_school_slug, trim(p_student_id));

    -- 10. Suppression du mapping local uniquement (mappings autres écoles et global_students préservés)
    DELETE FROM public.student_global_mappings
    WHERE school_slug = p_school_slug AND student_local_id = trim(p_student_id);

    RETURN jsonb_build_object(
        'success', true,
        'student_id', trim(p_student_id),
        'deleted_parents_count', v_deleted_parents_count,
        'global_links_deactivated_count', v_global_links_deactivated_count,
        'global_links_preserved_count', v_global_links_preserved_count,
        'student_global_id', v_student_global_id
    );

EXCEPTION
    WHEN lock_not_available OR deadlock_detected THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'CONCURRENCY_LOCK_TIMEOUT',
            'message', 'Conflit de verrouillage temporaire lors de la suppression atomique. Réessayer ultérieurement.'
        );
    WHEN OTHERS THEN
        RAISE WARNING 'delete_student_local_atomically transaction failed (SQLSTATE: %)', SQLSTATE;
        RETURN jsonb_build_object(
            'success', false,
            'error', 'TRANSACTION_FAILED',
            'message', 'Une erreur transactionnelle interne est survenue lors de la suppression de l''élève.'
        );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_student_local_atomically(TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_student_local_atomically(TEXT, TEXT, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.delete_student_local_atomically(TEXT, TEXT, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.delete_student_local_atomically(TEXT, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_student_local_atomically(TEXT, TEXT, UUID) TO postgres;


-- ============================================================================
-- 10. RPC Transactionnelle : link_parent_student_direct_atomic (Direct & Historique)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.link_parent_student_direct_atomic(
    p_school_slug TEXT,
    p_parent_id UUID,
    p_student_id TEXT,
    p_actor_id UUID,
    p_mode TEXT DEFAULT 'admin',
    p_student_global_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_profile_exists BOOLEAN := false;
    v_actor_role TEXT;
    v_actor_phone_norm TEXT;
    v_student_rec RECORD;
    v_global_id UUID;
    v_existing_mapping RECORD;
    v_global_student_exists BOOLEAN := false;
    v_parent_owns_global BOOLEAN := false;
    v_inserted_parent_id UUID;
    v_local_link_inserted BOOLEAN := false;
BEGIN
    SET LOCAL lock_timeout = '2s';

    -- 1. Validation stricte des paramètres d'entrée (AVANT TOUTE MUTATION)
    IF p_school_slug IS NULL OR p_school_slug !~ '^[a-z0-9_]{1,50}$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_SCHOOL_SLUG');
    END IF;
    IF p_parent_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_PARENT_ID');
    END IF;
    IF p_student_id IS NULL OR trim(p_student_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_STUDENT_ID');
    END IF;
    IF p_actor_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_ACTOR_ID');
    END IF;
    IF p_mode IS NULL OR p_mode NOT IN ('admin', 'parent_manual', 'parent_registration', 'login_autolink') THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_MODE');
    END IF;

    -- 2. Contrôle d'habilitation et confinement strict de l'acteur (AVANT TOUTE MUTATION)
    BEGIN
        EXECUTE format('
            SELECT EXISTS (SELECT 1 FROM public.%I WHERE id = %L),
                   (SELECT role FROM public.%I WHERE id = %L),
                   (SELECT phone_normalized FROM public.%I WHERE id = %L)
        ', 'profiles_' || p_school_slug, p_actor_id,
           'profiles_' || p_school_slug, p_actor_id,
           'profiles_' || p_school_slug, p_actor_id)
        INTO v_actor_profile_exists, v_actor_role, v_actor_phone_norm;
    EXCEPTION WHEN undefined_table THEN
        RETURN jsonb_build_object('success', false, 'error', 'SCHOOL_PROFILE_NOT_FOUND');
    END;

    IF NOT v_actor_profile_exists THEN
        RETURN jsonb_build_object('success', false, 'error', 'ACTOR_NOT_IN_SCHOOL', 'message', 'Demandeur non confiné à cet établissement.');
    END IF;

    -- 3. Sécurisation des autorisations métier : Exclusion stricte du rôle comptable
    IF p_mode = 'admin' THEN
        IF v_actor_role IS NULL OR v_actor_role NOT IN ('admin', 'directeur', 'directeur_general', 'superadmin') THEN
            RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED_ACTOR', 'message', 'Rôle administratif ou de direction requis.');
        END IF;
    ELSIF p_mode IN ('parent_manual', 'parent_registration', 'login_autolink') THEN
        IF p_actor_id <> p_parent_id THEN
            RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED_ACTOR', 'message', 'Un parent ne peut rattacher qu''à son propre compte.');
        END IF;
    END IF;

    -- 4. VERROU 0 : Orchestration partagée d'établissement (anti-inversion et anti-deadlock avec sync_replace)
    PERFORM pg_advisory_xact_lock_shared(0, hashtext(p_school_slug || ':sync_reset'));

    -- VERROU 2 : Verrou applicatif sur l'élève local (hashtext(slug || ':' || trim(student_id)))
    PERFORM pg_advisory_xact_lock(2, hashtext(p_school_slug || ':' || trim(p_student_id)));

    -- Verrou applicatif de Niveau 2 sur le couple local
    PERFORM pg_advisory_xact_lock(2, hashtext(p_school_slug || ':' || p_parent_id::text || ':' || trim(p_student_id)));

    -- 5. Véritable verrouillage de ligne exclusif (SELECT ... FOR UPDATE réel)
    BEGIN
        EXECUTE format('
            SELECT id, telephone_parent_normalized
            FROM public.%I
            WHERE id = %L
            FOR UPDATE
        ', 'students_' || p_school_slug, trim(p_student_id))
        INTO v_student_rec;
    EXCEPTION WHEN undefined_table THEN
        RETURN jsonb_build_object('success', false, 'error', 'STUDENTS_TABLE_NOT_FOUND');
    END;

    IF v_student_rec.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'STUDENT_NOT_FOUND', 'message', 'Élève introuvable ou déjà supprimé de l''établissement.');
    END IF;

    -- 6. Sécurité téléphonique internationale : Égalité stricte E.164 obligatoire pour les parents
    IF p_mode IN ('parent_manual', 'parent_registration', 'login_autolink') THEN
        IF v_actor_phone_norm IS NULL OR trim(v_actor_phone_norm) = '' OR
           v_student_rec.telephone_parent_normalized IS NULL OR trim(v_student_rec.telephone_parent_normalized) = '' OR
           trim(v_actor_phone_norm) <> trim(v_student_rec.telephone_parent_normalized) THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'UNAUTHORIZED_PHONE_MISMATCH',
                'message', 'Égalité stricte E.164 requise entre le compte parent et le dossier scolaire de l''élève.'
            );
        END IF;
    END IF;

    -- 7. Déduplication et Résolution sécurisée de l'identité globale (AVANT TOUTE MUTATION)
    SELECT * INTO v_existing_mapping
    FROM public.student_global_mappings
    WHERE school_slug = p_school_slug AND student_local_id = trim(p_student_id);

    IF v_existing_mapping.student_global_id IS NOT NULL THEN
        -- Déduplication : l'élève local est déjà associé à une identité globale
        IF p_student_global_id IS NOT NULL AND p_student_global_id <> v_existing_mapping.student_global_id THEN
            RETURN jsonb_build_object('success', false, 'error', 'MAPPING_CONFLICT', 'message', 'Conflit d''identité globale existante.');
        END IF;
        v_global_id := v_existing_mapping.student_global_id;
    ELSIF p_student_global_id IS NOT NULL THEN
        -- Une identité globale connue est fournie : vérification d'existence
        SELECT EXISTS (
            SELECT 1 FROM public.global_students WHERE student_global_id = p_student_global_id
        ) INTO v_global_student_exists;

        IF NOT v_global_student_exists THEN
            RETURN jsonb_build_object('success', false, 'error', 'GLOBAL_STUDENT_NOT_FOUND');
        END IF;

        -- Sécurisation stricte : pour un mode parent, le parent DOIT posséder cette identité globale
        IF p_mode <> 'admin' THEN
            SELECT EXISTS (
                SELECT 1 FROM public.parent_child_links
                WHERE parent_ref = p_parent_id::text AND student_global_id = p_student_global_id
            ) INTO v_parent_owns_global;

            IF NOT v_parent_owns_global THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'TARGET_NOT_OWNED',
                    'message', 'Le compte parent ne possède pas cette identité globale dans son portefeuille.'
                );
            END IF;
        END IF;

        v_global_id := p_student_global_id;
    END IF;

    -- 8. BLOC DE MUTATION ATOMIQUE : Aucune sortie prématurée par RETURN false après le début des écritures
    -- Tout échec lève une EXCEPTION qui annule intégralement le bloc (SAVEPOINT interne PL/pgSQL)
    BEGIN
        -- 8.1. Création atomique de l'identité globale si elle n'existait pas encore
        IF v_global_id IS NULL THEN
            INSERT INTO public.global_students DEFAULT VALUES RETURNING student_global_id INTO v_global_id;

            INSERT INTO public.student_global_mappings (school_slug, student_local_id, student_global_id)
            VALUES (p_school_slug, trim(p_student_id), v_global_id)
            ON CONFLICT (school_slug, student_local_id) DO NOTHING;

            SELECT student_global_id INTO v_global_id
            FROM public.student_global_mappings
            WHERE school_slug = p_school_slug AND student_local_id = trim(p_student_id);

            IF v_global_id IS NULL THEN
                RAISE EXCEPTION 'GLOBAL_MAPPING_FAILED';
            END IF;
        ELSIF v_existing_mapping.student_global_id IS NULL THEN
            -- Liaison du mapping local vers l'identité globale existante validée
            INSERT INTO public.student_global_mappings (school_slug, student_local_id, student_global_id)
            VALUES (p_school_slug, trim(p_student_id), v_global_id)
            ON CONFLICT (school_slug, student_local_id) DO NOTHING;
        END IF;

        -- 8.2. Insertion locale dans parent_student_<schoolSlug> avec typage UUID adapté
        EXECUTE format('
            INSERT INTO public.%I (parent_id, student_id, source_request_id)
            VALUES (%L, %L, NULL)
            ON CONFLICT (parent_id, student_id) DO NOTHING
            RETURNING parent_id
        ', 'parent_student_' || p_school_slug, p_parent_id, trim(p_student_id))
        INTO v_inserted_parent_id;

        v_local_link_inserted := (v_inserted_parent_id IS NOT NULL);

        -- 8.3. VERROU 3 : Verrou inter-établissements sur le couple global parent-élève
        PERFORM pg_advisory_xact_lock(3, hashtext(p_parent_id::text || ':' || v_global_id::text));

        -- 8.4. Insertion ou réactivation dans parent_child_links
        INSERT INTO public.parent_child_links (parent_ref, student_global_id, first_linked_at, current_link_active)
        VALUES (p_parent_id::text, v_global_id, now(), true)
        ON CONFLICT (parent_ref, student_global_id)
        DO UPDATE SET current_link_active = true, updated_at = now();

        RETURN jsonb_build_object(
            'success', true,
            'status', 'LINKED',
            'school_slug', p_school_slug,
            'parent_id', p_parent_id,
            'student_id', trim(p_student_id),
            'student_global_id', v_global_id,
            'local_link_inserted', v_local_link_inserted
        );

    EXCEPTION
        WHEN lock_not_available OR deadlock_detected THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'CONCURRENCY_LOCK_TIMEOUT',
                'message', 'Conflit de verrouillage temporaire lors du rattachement direct. Réessayer ultérieurement.'
            );
        WHEN OTHERS THEN
            RAISE WARNING 'link_parent_student_direct_atomic transaction failed (SQLSTATE: %)', SQLSTATE;
            RETURN jsonb_build_object(
                'success', false,
                'error', 'TRANSACTION_FAILED',
                'message', 'Une erreur transactionnelle interne est survenue lors du rattachement direct.'
            );
    END;
END;
$$;

REVOKE ALL ON FUNCTION public.link_parent_student_direct_atomic(TEXT, UUID, TEXT, UUID, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.link_parent_student_direct_atomic(TEXT, UUID, TEXT, UUID, TEXT, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.link_parent_student_direct_atomic(TEXT, UUID, TEXT, UUID, TEXT, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.link_parent_student_direct_atomic(TEXT, UUID, TEXT, UUID, TEXT, UUID) TO service_role;
-- ============================================================================
-- 11. RPC Transactionnelle : sync_replace_school_data_atomically
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sync_replace_school_data_atomically(
    p_school_slug TEXT,
    p_actor_id UUID,
    p_students_payload JSONB,
    p_payments_payload JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_role TEXT;
    v_req RECORD;
    v_std RECORD;
    v_pst RECORD;
    v_pair RECORD;
    v_link RECORD;
    v_other_mapping RECORD;
    v_other_local_link_exists BOOLEAN;
    v_has_other_school_link BOOLEAN;
    v_inserted_students_count INT := 0;
    v_inserted_payments_count INT := 0;
    v_global_links_preserved_count INT := 0;
    v_global_links_deactivated_count INT := 0;
BEGIN
    SET LOCAL lock_timeout = '2s';

    -- 1. Validation préalable des paramètres
    IF p_school_slug IS NULL OR p_school_slug !~ '^[a-z0-9_]{1,50}$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_SCHOOL_SLUG');
    END IF;

    IF p_actor_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_ACTOR_ID');
    END IF;

    IF p_students_payload IS NULL OR jsonb_typeof(p_students_payload) <> 'array' OR jsonb_array_length(p_students_payload) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'EMPTY_STUDENTS_PAYLOAD', 'message', 'La liste des élèves à importer ne peut pas être vide en mode Remplacer.');
    END IF;

    -- 2. Habilitation de l'acteur dans profiles_<slug>
    BEGIN
        EXECUTE format('SELECT role FROM public.%I WHERE id = %L', 'profiles_' || p_school_slug, p_actor_id)
        INTO v_actor_role;
    EXCEPTION WHEN undefined_table THEN
        RETURN jsonb_build_object('success', false, 'error', 'PROFILES_TABLE_NOT_FOUND');
    END;

    IF v_actor_role IS NULL OR v_actor_role NOT IN ('admin', 'directeur', 'directeur_general', 'superadmin') THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED_ACTOR', 'message', 'Seuls les administrateurs et directeurs peuvent remplacer les données.');
    END IF;

    -- 3. ORDRE STRICT DES VERROUS EXPLICITES : 0 -> 1 -> 2 -> 3
    -- 3.0. Niveau 0 : Orchestration exclusive de remplacement pour l'établissement
    PERFORM pg_advisory_xact_lock(0, hashtext(p_school_slug || ':sync_reset'));

    -- Verrouillage de table EXCLUSIF sur les tables partitionnées locales de l'école
    -- Bloque toute insertion/mutation concurrente directe dans students_<slug> et parent_student_<slug>
    -- sans impacter les autres établissements.
    BEGIN
        EXECUTE format('LOCK TABLE public.%I, public.%I IN EXCLUSIVE MODE',
            'students_' || p_school_slug,
            'parent_student_' || p_school_slug
        );
    EXCEPTION WHEN undefined_table THEN
        RETURN jsonb_build_object('success', false, 'error', 'SCHOOL_TABLES_NOT_FOUND');
    END;

    -- 3.1. Niveau 1 : Verrous sur toutes les demandes actives pour l'école (tri ASC)
    FOR v_req IN
        SELECT id
        FROM public.parent_student_link_requests
        WHERE school_slug = p_school_slug
          AND status IN ('pending', 'pending_verification', 'approved')
        ORDER BY id ASC
    LOOP
        PERFORM pg_advisory_xact_lock(1, hashtext(p_school_slug || ':' || v_req.id::text));
    END LOOP;

    -- 3.2. Niveau 2 : Verrous sur les élèves locaux (tri ASC)
    BEGIN
        FOR v_std IN EXECUTE format('SELECT id FROM public.%I ORDER BY id ASC', 'students_' || p_school_slug) LOOP
            PERFORM pg_advisory_xact_lock(2, hashtext(p_school_slug || ':' || v_std.id));
        END LOOP;
    EXCEPTION WHEN undefined_table THEN
        RETURN jsonb_build_object('success', false, 'error', 'STUDENTS_TABLE_NOT_FOUND');
    END;

    -- 3.2b. Niveau 2 : Verrous sur les couples locaux parent-élève existants (tri ASC)
    BEGIN
        FOR v_pst IN EXECUTE format('SELECT DISTINCT parent_id, student_id FROM public.%I ORDER BY parent_id ASC, student_id ASC', 'parent_student_' || p_school_slug) LOOP
            PERFORM pg_advisory_xact_lock(2, hashtext(p_school_slug || ':' || v_pst.parent_id::text || ':' || v_pst.student_id));
        END LOOP;
    EXCEPTION WHEN undefined_table THEN
        RETURN jsonb_build_object('success', false, 'error', 'PARENT_STUDENT_TABLE_NOT_FOUND');
    END;

    -- 4. CAPTURE SOUS VERROUS des rattachements locaux et de leurs mappings globaux
    CREATE TEMP TABLE temp_links_to_reset (
        parent_id UUID NOT NULL,
        student_id TEXT NOT NULL,
        student_global_id UUID NULL
    ) ON COMMIT DROP;

    BEGIN
        EXECUTE format('
            INSERT INTO temp_links_to_reset (parent_id, student_id, student_global_id)
            SELECT ps.parent_id, ps.student_id, sgm.student_global_id
            FROM public.%I ps
            LEFT JOIN public.student_global_mappings sgm
              ON sgm.school_slug = %L AND sgm.student_local_id = ps.student_id
            ORDER BY ps.parent_id ASC, ps.student_id ASC
        ', 'parent_student_' || p_school_slug, p_school_slug);
    EXCEPTION WHEN undefined_table THEN
        RETURN jsonb_build_object('success', false, 'error', 'PARENT_STUDENT_TABLE_NOT_FOUND');
    END;

    -- 4.3. Niveau 3 : Verrous inter-établissements sur les couples globaux (tri ASC)
    FOR v_pair IN
        SELECT DISTINCT parent_id, student_global_id
        FROM temp_links_to_reset
        WHERE student_global_id IS NOT NULL
        ORDER BY parent_id ASC, student_global_id ASC
    LOOP
        PERFORM pg_advisory_xact_lock(3, hashtext(v_pair.parent_id::text || ':' || v_pair.student_global_id::text));
    END LOOP;

    -- 5. Clôture des demandes d'approbation P26-B locales
    -- Rejet des demandes en attente
    UPDATE public.parent_student_link_requests
    SET status = 'rejected',
        decided_by = p_actor_id,
        decided_at = now(),
        rejection_reason_code = 'SCHOOL_RESET_REPLACE',
        rejection_reason = 'Établissement réinitialisé en mode Remplacer.',
        updated_at = now()
    WHERE school_slug = p_school_slug
      AND status IN ('pending', 'pending_verification');

    -- Révocation des demandes approuvées
    UPDATE public.parent_student_link_requests
    SET status = 'revoked',
        revoked_at = now(),
        revoked_by = p_actor_id,
        revocation_reason = 'Réinitialisation complète de l''établissement en mode Remplacer.',
        needs_global_reconciliation = false,
        updated_at = now()
    WHERE school_slug = p_school_slug
      AND status = 'approved';

    -- 6. Réconciliation globale des rattachements (multi-établissements safe)
    FOR v_link IN
        SELECT DISTINCT parent_id, student_global_id
        FROM temp_links_to_reset
        WHERE student_global_id IS NOT NULL
        ORDER BY parent_id ASC, student_global_id ASC
    LOOP
        v_has_other_school_link := false;

        FOR v_other_mapping IN (
            SELECT school_slug, student_local_id
            FROM public.student_global_mappings
            WHERE student_global_id = v_link.student_global_id
              AND school_slug <> p_school_slug
        ) LOOP
            BEGIN
                EXECUTE format('
                    SELECT EXISTS (
                        SELECT 1 FROM public.%I
                        WHERE parent_id = %L AND student_id = %L
                    )
                ', 'parent_student_' || v_other_mapping.school_slug,
                   v_link.parent_id, v_other_mapping.student_local_id)
                INTO v_other_local_link_exists;

                IF v_other_local_link_exists THEN
                    v_has_other_school_link := true;
                    EXIT;
                END IF;
            EXCEPTION WHEN undefined_table THEN
                NULL;
            END;
        END LOOP;

        IF v_has_other_school_link THEN
            v_global_links_preserved_count := v_global_links_preserved_count + 1;
        ELSE
            UPDATE public.parent_child_links
            SET current_link_active = false,
                updated_at = now()
            WHERE parent_ref = v_link.parent_id::text
              AND student_global_id = v_link.student_global_id;

            v_global_links_deactivated_count := v_global_links_deactivated_count + 1;
        END IF;
    END LOOP;

    -- 7. Purge ordonnée des tables locales de l'école (5 tables exactes)
    EXECUTE format('DELETE FROM public.%I', 'presences_' || p_school_slug);
    EXECUTE format('DELETE FROM public.%I', 'devoirs_' || p_school_slug);
    EXECUTE format('DELETE FROM public.%I', 'parent_student_' || p_school_slug);
    EXECUTE format('DELETE FROM public.%I', 'payments_' || p_school_slug);
    EXECUTE format('DELETE FROM public.%I', 'students_' || p_school_slug);

    -- 8. Nettoyage des mappings locaux dans student_global_mappings
    DELETE FROM public.student_global_mappings
    WHERE school_slug = p_school_slug;

    -- 9. Insertion directe in-transaction des nouveaux élèves
    EXECUTE format('
        INSERT INTO public.%I (
            id, nom, prenom, classe, matricule, genre, date_naissance,
            statut, ecolage, deja_paye, telephone_parent, telephone_parent_normalized, updated_at
        )
        SELECT
            (val->>''id'')::text,
            (val->>''nom'')::text,
            COALESCE(val->>''prenom'', ''''),
            COALESCE(val->>''classe'', ''Inconnue''),
            val->>''matricule'',
            COALESCE(val->>''genre'', ''M''),
            val->>''date_naissance'',
            COALESCE(val->>''statut'', ''Actif''),
            COALESCE((val->>''ecolage'')::numeric, 0),
            COALESCE((val->>''deja_paye'')::numeric, 0),
            val->>''telephone_parent'',
            val->>''telephone_parent_normalized'',
            now()
        FROM jsonb_array_elements(%L::jsonb) AS val
    ', 'students_' || p_school_slug, p_students_payload::text);

    GET DIAGNOSTICS v_inserted_students_count = ROW_COUNT;

    -- 10. Insertion directe in-transaction des nouveaux paiements si fournis
    IF p_payments_payload IS NOT NULL AND jsonb_typeof(p_payments_payload) = 'array' AND jsonb_array_length(p_payments_payload) > 0 THEN
        EXECUTE format('
            INSERT INTO public.%I (id, student_id, montant, date, recu, note)
            SELECT
                (val->>''id'')::text,
                (val->>''student_id'')::text,
                COALESCE((val->>''montant'')::numeric, 0),
                CASE WHEN val->>''date'' IS NOT NULL AND val->>''date'' <> '''' THEN (val->>''date'')::timestamptz ELSE now() END,
                val->>''recu'',
                val->>''note''
            FROM jsonb_array_elements(%L::jsonb) AS val
            ON CONFLICT (id) DO NOTHING
        ', 'payments_' || p_school_slug, p_payments_payload::text);

        GET DIAGNOSTICS v_inserted_payments_count = ROW_COUNT;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'school_slug', p_school_slug,
        'inserted_students_count', v_inserted_students_count,
        'inserted_payments_count', v_inserted_payments_count,
        'global_links_preserved_count', v_global_links_preserved_count,
        'global_links_deactivated_count', v_global_links_deactivated_count
    );

EXCEPTION
    WHEN lock_not_available OR deadlock_detected THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'CONCURRENCY_LOCK_TIMEOUT',
            'message', 'Conflit de verrouillage temporaire lors du remplacement atomique. Réessayer ultérieurement.'
        );
END;
$$;

REVOKE ALL ON FUNCTION public.sync_replace_school_data_atomically(TEXT, UUID, JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_replace_school_data_atomically(TEXT, UUID, JSONB, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.sync_replace_school_data_atomically(TEXT, UUID, JSONB, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sync_replace_school_data_atomically(TEXT, UUID, JSONB, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_replace_school_data_atomically(TEXT, UUID, JSONB, JSONB) TO postgres;

COMMIT;
