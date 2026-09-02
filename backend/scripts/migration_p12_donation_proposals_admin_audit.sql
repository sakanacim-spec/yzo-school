-- =========================================================================
-- Migration P12 : Administration et audit des propositions de dons/mécénat
-- Fichier DDL/DML exécutable au sein d'une transaction contrôlée (sans COMMIT autonome)
-- =========================================================================

-- 1. Colonnes administratives sur public.donation_proposals
ALTER TABLE public.donation_proposals
    ADD COLUMN IF NOT EXISTS internal_notes text,
    ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.superadmins(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conname = 'chk_internal_notes_length'
          AND conrelid = 'public.donation_proposals'::pg_catalog.regclass
    ) THEN
        ALTER TABLE public.donation_proposals
            ADD CONSTRAINT chk_internal_notes_length
            CHECK (internal_notes IS NULL OR pg_catalog.length(internal_notes) <= 1000);
    END IF;
END $$;

-- 2. Table d'audit append-only avec ON DELETE RESTRICT
CREATE TABLE IF NOT EXISTS public.donation_proposal_audit_logs (
    id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
    proposal_id uuid NOT NULL REFERENCES public.donation_proposals(id) ON DELETE RESTRICT,
    actor_id uuid NOT NULL REFERENCES public.superadmins(id) ON DELETE RESTRICT,
    actor_name text NOT NULL,
    old_status text NOT NULL,
    new_status text NOT NULL,
    note text,
    created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
    CONSTRAINT chk_audit_actor_name_length CHECK (pg_catalog.length(actor_name) > 0 AND pg_catalog.length(actor_name) <= 100),
    CONSTRAINT chk_audit_old_status CHECK (old_status IN ('pending','under_review','approved','rejected','archived')),
    CONSTRAINT chk_audit_new_status CHECK (new_status IN ('pending','under_review','approved','rejected','archived')),
    CONSTRAINT chk_audit_note_length CHECK (note IS NULL OR pg_catalog.length(note) <= 1000)
);

-- Confinement RLS de la table d'audit
ALTER TABLE public.donation_proposal_audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.donation_proposal_audit_logs FROM PUBLIC, anon, authenticated, service_role;

-- 3. Index composites de performance
CREATE INDEX IF NOT EXISTS idx_donation_proposals_status_created
    ON public.donation_proposals (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_donation_proposals_sector_created
    ON public.donation_proposals (sector, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_donation_proposal_audit_proposal_id
    ON public.donation_proposal_audit_logs (proposal_id, created_at ASC);

-- 4. RPC 1 : Liste paginée avec filtres et recherche
CREATE OR REPLACE FUNCTION public.get_donation_proposals(
    p_status text DEFAULT NULL,
    p_sector text DEFAULT NULL,
    p_search text DEFAULT NULL,
    p_limit int DEFAULT 20,
    p_offset int DEFAULT 0
) RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog
AS $$
DECLARE
    v_limit int;
    v_offset int;
    v_search text;
    v_items jsonb;
    v_total int;
BEGIN
    v_limit := least(greatest(coalesce(p_limit, 20), 1), 100);
    v_offset := greatest(coalesce(p_offset, 0), 0);
    v_search := pg_catalog.btrim(coalesce(p_search, ''));

    -- Calcul du total filtré
    SELECT pg_catalog.count(*)::int
      INTO v_total
      FROM public.donation_proposals dp
     WHERE (p_status IS NULL OR dp.status = p_status)
       AND (p_sector IS NULL OR dp.sector = p_sector)
       AND (v_search = '' OR (
            dp.reference ILIKE ('%' || v_search || '%') OR
            dp.full_name ILIKE ('%' || v_search || '%') OR
            dp.company_name ILIKE ('%' || v_search || '%') OR
            dp.email ILIKE ('%' || v_search || '%')
       ));

    -- Récupération paginée des enregistrements avec tri stable
    SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(sub.*)), '[]'::jsonb)
      INTO v_items
      FROM (
        SELECT dp.id,
               dp.reference,
               dp.full_name,
               dp.role,
               dp.company_name,
               dp.sector,
               dp.sub_sector,
               dp.regulation_declaration,
               dp.other_sector_details,
               dp.organization_type,
               dp.support_type,
               dp.license,
               dp.country,
               dp.target_markets,
               dp.email,
               dp.phone,
               dp.website,
               dp.language,
               dp.consent,
               dp.status,
               dp.internal_notes,
               dp.reviewed_by,
               dp.reviewed_at,
               dp.created_at,
               dp.updated_at
          FROM public.donation_proposals dp
         WHERE (p_status IS NULL OR dp.status = p_status)
           AND (p_sector IS NULL OR dp.sector = p_sector)
           AND (v_search = '' OR (
                dp.reference ILIKE ('%' || v_search || '%') OR
                dp.full_name ILIKE ('%' || v_search || '%') OR
                dp.company_name ILIKE ('%' || v_search || '%') OR
                dp.email ILIKE ('%' || v_search || '%')
           ))
         ORDER BY dp.created_at DESC, dp.id DESC
         LIMIT v_limit
        OFFSET v_offset
      ) sub;

    RETURN pg_catalog.jsonb_build_object(
        'items', v_items,
        'total', v_total,
        'limit', v_limit,
        'offset', v_offset
    );
END;
$$;

-- 5. RPC 2 : Consultation détaillée par UUID avec historique d'audit
CREATE OR REPLACE FUNCTION public.get_donation_proposal_by_id(
    p_id uuid
) RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog
AS $$
DECLARE
    v_proposal jsonb;
    v_audit jsonb;
BEGIN
    SELECT pg_catalog.to_jsonb(dp.*)
      INTO v_proposal
      FROM public.donation_proposals dp
     WHERE dp.id = p_id;

    IF v_proposal IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a.*)), '[]'::jsonb)
      INTO v_audit
      FROM (
        SELECT al.id,
               al.proposal_id,
               al.actor_id,
               al.actor_name,
               al.old_status,
               al.new_status,
               al.note,
               al.created_at
          FROM public.donation_proposal_audit_logs al
         WHERE al.proposal_id = p_id
         ORDER BY al.created_at ASC, al.id ASC
      ) a;

    RETURN v_proposal || pg_catalog.jsonb_build_object('audit_trail', v_audit);
END;
$$;

-- 6. RPC 3 : Changement transactionnel de statut avec verrouillage et audit
CREATE OR REPLACE FUNCTION public.update_donation_proposal_status(
    p_id uuid,
    p_expected_status text,
    p_new_status text,
    p_note text,
    p_actor_id uuid
) RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog
AS $$
DECLARE
    v_actor_name text;
    v_current_status text;
    v_trimmed_note text;
    v_updated_row record;
BEGIN
    -- Validation statut attendu
    IF p_expected_status IS NULL OR pg_catalog.length(pg_catalog.btrim(p_expected_status)) = 0 THEN
        RAISE EXCEPTION 'VALIDATION_FAILED: expected_status is required';
    END IF;
    IF p_expected_status NOT IN ('pending','under_review','approved','rejected','archived') THEN
        RAISE EXCEPTION 'VALIDATION_FAILED: unknown expected_status "%"', p_expected_status;
    END IF;

    -- Validation nouveau statut
    IF p_new_status IS NULL OR pg_catalog.length(pg_catalog.btrim(p_new_status)) = 0 THEN
        RAISE EXCEPTION 'VALIDATION_FAILED: new_status is required';
    END IF;
    IF p_new_status NOT IN ('pending','under_review','approved','rejected','archived') THEN
        RAISE EXCEPTION 'VALIDATION_FAILED: unknown new_status "%"', p_new_status;
    END IF;

    -- Validation note (max 1000 caractères)
    v_trimmed_note := pg_catalog.btrim(coalesce(p_note, ''));
    IF pg_catalog.length(v_trimmed_note) > 1000 THEN
        RAISE EXCEPTION 'VALIDATION_FAILED: note exceeds 1000 characters (length: %)', pg_catalog.length(v_trimmed_note);
    END IF;
    IF v_trimmed_note = '' THEN
        v_trimmed_note := NULL;
    END IF;

    -- Validation de l'existence du SuperAdmin
    SELECT sa.username
      INTO v_actor_name
      FROM public.superadmins sa
     WHERE sa.id = p_actor_id;

    IF v_actor_name IS NULL THEN
        RAISE EXCEPTION 'ACTOR_NOT_FOUND: SuperAdmin % does not exist', p_actor_id;
    END IF;

    -- Verrouillage pessimiste de la ligne sous FOR UPDATE
    SELECT dp.status
      INTO v_current_status
      FROM public.donation_proposals dp
     WHERE dp.id = p_id
       FOR UPDATE;

    IF v_current_status IS NULL THEN
        RAISE EXCEPTION 'PROPOSAL_NOT_FOUND: Proposal % does not exist', p_id;
    END IF;

    -- Contrôle de concurrence optimiste
    IF v_current_status <> p_expected_status THEN
        RAISE EXCEPTION 'STATUS_CONFLICT: Current status is "%", expected "%"', v_current_status, p_expected_status;
    END IF;

    -- Matrice stricte des transitions autorisées
    IF NOT (
        (v_current_status = 'pending' AND p_new_status IN ('under_review', 'rejected')) OR
        (v_current_status = 'under_review' AND p_new_status IN ('approved', 'rejected')) OR
        (v_current_status = 'approved' AND p_new_status = 'archived') OR
        (v_current_status = 'rejected' AND p_new_status = 'archived')
    ) THEN
        RAISE EXCEPTION 'INVALID_STATUS_TRANSITION: Cannot transition from "%" to "%"', v_current_status, p_new_status;
    END IF;

    -- Mise à jour transactionnelle de la proposition
    UPDATE public.donation_proposals
       SET status = p_new_status,
           reviewed_by = p_actor_id,
           reviewed_at = pg_catalog.now(),
           internal_notes = v_trimmed_note,
           updated_at = pg_catalog.now()
     WHERE id = p_id
    RETURNING * INTO v_updated_row;

    -- Insertion atomique dans la table d'audit append-only
    INSERT INTO public.donation_proposal_audit_logs (
        proposal_id,
        actor_id,
        actor_name,
        old_status,
        new_status,
        note,
        created_at
    ) VALUES (
        p_id,
        p_actor_id,
        v_actor_name,
        v_current_status,
        p_new_status,
        v_trimmed_note,
        pg_catalog.now()
    );

    RETURN pg_catalog.to_jsonb(v_updated_row);
END;
$$;

-- 7. Privilèges stricts sur les RPCs
REVOKE ALL ON FUNCTION public.get_donation_proposals(text, text, text, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_donation_proposals(text, text, text, int, int) FROM anon;
REVOKE ALL ON FUNCTION public.get_donation_proposals(text, text, text, int, int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_donation_proposals(text, text, text, int, int) TO service_role;

REVOKE ALL ON FUNCTION public.get_donation_proposal_by_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_donation_proposal_by_id(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_donation_proposal_by_id(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_donation_proposal_by_id(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.update_donation_proposal_status(uuid, text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_donation_proposal_status(uuid, text, text, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.update_donation_proposal_status(uuid, text, text, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.update_donation_proposal_status(uuid, text, text, text, uuid) TO service_role;
