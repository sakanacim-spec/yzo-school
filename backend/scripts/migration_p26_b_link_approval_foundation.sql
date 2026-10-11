-- ============================================================================
-- P26-B Lot 1 : Fondations SQL pour l'Approbation du Rattachement Parent-Élève
-- Fichier : backend/scripts/migration_p26_b_link_approval_foundation.sql
-- ============================================================================
-- NOTE IMPORTANTE :
-- Ce script prépare les structures et fonctions transactionnelles.
-- Il ne modifie pas les tables locales existantes ni les données applicatives.
-- ============================================================================

BEGIN;

-- 1. Table Centrale des Demandes de Rattachement et d'Audit
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


-- ============================================================================
-- 2. RPC Transactionnelle : approve_parent_student_link
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
BEGIN
    -- A. Validation des paramètres
    IF p_request_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_REQUEST_ID');
    END IF;
    IF p_school_slug IS NULL OR p_school_slug !~ '^[a-z0-9_]{1,50}$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_SCHOOL_SLUG');
    END IF;
    IF p_decided_by IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_DECIDED_BY');
    END IF;

    -- B. Advisory Lock transactionnel sur la demande
    PERFORM pg_advisory_xact_lock(1, hashtext(p_school_slug || ':' || p_request_id::text));

    -- C. Vérification de l'habilitation du directeur dans profiles_<school_slug>
    BEGIN
        EXECUTE format('
            SELECT role FROM public.%I 
            WHERE id = %L
        ', 'profiles_' || p_school_slug, p_decided_by)
        INTO v_admin_role;
    EXCEPTION WHEN undefined_table THEN
        RETURN jsonb_build_object('success', false, 'error', 'SCHOOL_PROFILE_NOT_FOUND');
    END;

    IF v_admin_role IS NULL OR v_admin_role NOT IN ('admin', 'directeur', 'directeur_general', 'superadmin') THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED_APPROVER');
    END IF;

    -- D. Verrouillage et lecture de la demande
    SELECT * INTO v_req
    FROM public.parent_student_link_requests
    WHERE id = p_request_id AND school_slug = p_school_slug
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'REQUEST_NOT_FOUND');
    END IF;

    -- Si déjà approuvée, retour idempotent
    IF v_req.status = 'approved' THEN
        RETURN jsonb_build_object('success', true, 'status', 'already_approved', 'request_id', p_request_id);
    END IF;

    -- Seules les demandes en attente peuvent être approuvées
    IF v_req.status NOT IN ('pending', 'pending_verification') THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_STATUS_TRANSITION', 'current_status', v_req.status);
    END IF;

    -- E. Insertion dans la table locale parent_student_<school_slug>
    BEGIN
        EXECUTE format('
            INSERT INTO public.%I (parent_id, student_id)
            VALUES (%L, %L)
            ON CONFLICT (parent_id, student_id) DO NOTHING
        ', 'parent_student_' || p_school_slug, v_req.parent_id, v_req.student_id);
    EXCEPTION WHEN undefined_table THEN
        RETURN jsonb_build_object('success', false, 'error', 'LOCAL_TABLE_NOT_FOUND');
    END;

    -- F. Réconciliation avec l'écosystème global (student_global_mappings & parent_child_links)
    SELECT student_global_id INTO v_global_id
    FROM public.student_global_mappings
    WHERE school_slug = p_school_slug AND student_local_id = v_req.student_id;

    IF v_global_id IS NULL THEN
        -- Création d'une nouvelle identité globale pour cet élève si absente
        INSERT INTO public.global_students DEFAULT VALUES
        RETURNING student_global_id INTO v_global_id;

        INSERT INTO public.student_global_mappings (school_slug, student_local_id, student_global_id)
        VALUES (p_school_slug, v_req.student_id, v_global_id)
        ON CONFLICT (school_slug, student_local_id) DO NOTHING;

        -- Relire l'identifiant effectif (au cas où une transaction concurrente l'a créé)
        SELECT student_global_id INTO v_global_id
        FROM public.student_global_mappings
        WHERE school_slug = p_school_slug AND student_local_id = v_req.student_id;
    END IF;

    -- Insertion ou réactivation dans parent_child_links
    INSERT INTO public.parent_child_links (parent_ref, student_global_id, first_linked_at, current_link_active)
    VALUES (v_req.parent_id::text, v_global_id, now(), true)
    ON CONFLICT (parent_ref, student_global_id)
    DO UPDATE SET current_link_active = true, updated_at = now();

    -- G. Mise à jour du statut de la demande dans la table centrale
    UPDATE public.parent_student_link_requests
    SET status = 'approved',
        decided_at = now(),
        decided_by = p_decided_by,
        decided_by_name = COALESCE(p_decided_by_name, v_req.decided_by_name),
        updated_at = now()
    WHERE id = p_request_id;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'approved',
        'request_id', p_request_id,
        'student_id', v_req.student_id,
        'student_global_id', v_global_id
    );
END;
$$;

-- Permissions RPC approve
REVOKE ALL ON FUNCTION public.approve_parent_student_link(UUID, TEXT, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_parent_student_link(UUID, TEXT, UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.approve_parent_student_link(UUID, TEXT, UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.approve_parent_student_link(UUID, TEXT, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.approve_parent_student_link(UUID, TEXT, UUID, TEXT) TO postgres;


-- ============================================================================
-- 3. RPC Transactionnelle : reject_parent_student_link
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
    -- A. Validation des paramètres
    IF p_request_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_REQUEST_ID');
    END IF;
    IF p_school_slug IS NULL OR p_school_slug !~ '^[a-z0-9_]{1,50}$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_SCHOOL_SLUG');
    END IF;
    IF p_decided_by IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_DECIDED_BY');
    END IF;
    IF p_rejection_reason IS NULL OR trim(p_rejection_reason) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'REJECTION_REASON_REQUIRED');
    END IF;

    -- B. Advisory Lock transactionnel sur la demande
    PERFORM pg_advisory_xact_lock(1, hashtext(p_school_slug || ':' || p_request_id::text));

    -- C. Vérification de l'habilitation du directeur
    BEGIN
        EXECUTE format('
            SELECT role FROM public.%I 
            WHERE id = %L
        ', 'profiles_' || p_school_slug, p_decided_by)
        INTO v_admin_role;
    EXCEPTION WHEN undefined_table THEN
        RETURN jsonb_build_object('success', false, 'error', 'SCHOOL_PROFILE_NOT_FOUND');
    END;

    IF v_admin_role IS NULL OR v_admin_role NOT IN ('admin', 'directeur', 'directeur_general', 'superadmin') THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED_APPROVER');
    END IF;

    -- D. Lecture de la demande
    SELECT * INTO v_req
    FROM public.parent_student_link_requests
    WHERE id = p_request_id AND school_slug = p_school_slug
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'REQUEST_NOT_FOUND');
    END IF;

    IF v_req.status = 'rejected' THEN
        RETURN jsonb_build_object('success', true, 'status', 'already_rejected', 'request_id', p_request_id);
    END IF;

    IF v_req.status NOT IN ('pending', 'pending_verification') THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_STATUS_TRANSITION', 'current_status', v_req.status);
    END IF;

    -- E. Mise à jour vers rejected
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
END;
$$;

-- Permissions RPC reject
REVOKE ALL ON FUNCTION public.reject_parent_student_link(UUID, TEXT, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_parent_student_link(UUID, TEXT, UUID, TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.reject_parent_student_link(UUID, TEXT, UUID, TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reject_parent_student_link(UUID, TEXT, UUID, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.reject_parent_student_link(UUID, TEXT, UUID, TEXT, TEXT, TEXT) TO postgres;


-- ============================================================================
-- 4. RPC Transactionnelle : revoke_parent_student_link
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
    v_other_active_links_count INT;
BEGIN
    -- A. Validation des paramètres
    IF p_request_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_REQUEST_ID');
    END IF;
    IF p_school_slug IS NULL OR p_school_slug !~ '^[a-z0-9_]{1,50}$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_SCHOOL_SLUG');
    END IF;
    IF p_revoked_by IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_REVOKED_BY');
    END IF;
    IF p_revocation_reason IS NULL OR trim(p_revocation_reason) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'REVOCATION_REASON_REQUIRED');
    END IF;

    -- B. Advisory Lock
    PERFORM pg_advisory_xact_lock(1, hashtext(p_school_slug || ':' || p_request_id::text));

    -- C. Vérification de l'habilitation du directeur
    BEGIN
        EXECUTE format('
            SELECT role FROM public.%I 
            WHERE id = %L
        ', 'profiles_' || p_school_slug, p_revoked_by)
        INTO v_admin_role;
    EXCEPTION WHEN undefined_table THEN
        RETURN jsonb_build_object('success', false, 'error', 'SCHOOL_PROFILE_NOT_FOUND');
    END;

    IF v_admin_role IS NULL OR v_admin_role NOT IN ('admin', 'directeur', 'directeur_general', 'superadmin') THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED_APPROVER');
    END IF;

    -- D. Lecture de la demande
    SELECT * INTO v_req
    FROM public.parent_student_link_requests
    WHERE id = p_request_id AND school_slug = p_school_slug
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'REQUEST_NOT_FOUND');
    END IF;

    IF v_req.status = 'revoked' THEN
        RETURN jsonb_build_object('success', true, 'status', 'already_revoked', 'request_id', p_request_id);
    END IF;

    -- E. Suppression physique dans la table locale parent_student_<school_slug>
    BEGIN
        EXECUTE format('
            DELETE FROM public.%I 
            WHERE parent_id = %L AND student_id = %L
        ', 'parent_student_' || p_school_slug, v_req.parent_id, v_req.student_id);
    EXCEPTION WHEN undefined_table THEN
        NULL; -- Si la table locale n'existe pas, continuer pour cohérence
    END;

    -- F. Mise à jour de parent_child_links si aucun autre établissement n'a de lien actif
    SELECT student_global_id INTO v_global_id
    FROM public.student_global_mappings
    WHERE school_slug = p_school_slug AND student_local_id = v_req.student_id;

    IF v_global_id IS NOT NULL THEN
        -- Vérifier si le parent possède un autre lien approuvé vers ce MÊME élève global
        SELECT count(*) INTO v_other_active_links_count
        FROM public.parent_student_link_requests req
        JOIN public.student_global_mappings sgm 
          ON sgm.school_slug = req.school_slug AND sgm.student_local_id = req.student_id
        WHERE req.parent_id = v_req.parent_id 
          AND req.status = 'approved' 
          AND req.id <> p_request_id
          AND sgm.student_global_id = v_global_id;

        IF v_other_active_links_count = 0 THEN
            UPDATE public.parent_child_links
            SET current_link_active = false,
                updated_at = now()
            WHERE parent_ref = v_req.parent_id::text AND student_global_id = v_global_id;
        END IF;
    END IF;

    -- G. Mise à jour du statut vers revoked
    UPDATE public.parent_student_link_requests
    SET status = 'revoked',
        revoked_at = now(),
        revoked_by = p_revoked_by,
        revocation_reason = trim(p_revocation_reason),
        updated_at = now()
    WHERE id = p_request_id;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'revoked',
        'request_id', p_request_id
    );
END;
$$;

-- Permissions RPC revoke
REVOKE ALL ON FUNCTION public.revoke_parent_student_link(UUID, TEXT, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_parent_student_link(UUID, TEXT, UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.revoke_parent_student_link(UUID, TEXT, UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_parent_student_link(UUID, TEXT, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_parent_student_link(UUID, TEXT, UUID, TEXT) TO postgres;

COMMIT;
