-- P25-T.2a: Data Foundation & Transactional Transfer RPC
-- DO NOT MODIFY THIS FILE ONCE EXECUTED.

BEGIN;

-- 1. Table d'audit des transferts d'identité
CREATE TABLE IF NOT EXISTS public.parent_student_identity_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_ref TEXT NOT NULL,
    student_global_id UUID NOT NULL REFERENCES public.global_students(student_global_id),
    destination_school_slug TEXT NOT NULL,
    destination_student_local_id TEXT NOT NULL,
    status TEXT NOT NULL, -- e.g., 'completed'
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: Security Definer usage only. Revoke all.
ALTER TABLE public.parent_student_identity_transfers ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.parent_student_identity_transfers FROM PUBLIC;
REVOKE ALL ON public.parent_student_identity_transfers FROM anon;
REVOKE ALL ON public.parent_student_identity_transfers FROM authenticated;

GRANT ALL ON public.parent_student_identity_transfers TO service_role;
GRANT ALL ON public.parent_student_identity_transfers TO postgres;

-- 2. Transactional RPC for Identity Transfer
CREATE OR REPLACE FUNCTION public.apply_parent_student_identity_transfer(
    p_parent_ref TEXT,
    p_student_global_id UUID,
    p_destination_school_slug TEXT,
    p_destination_student_local_id TEXT
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_gs_exists BOOLEAN;
    v_link_exists BOOLEAN;
    v_existing_mapping RECORD;
BEGIN
    -- A. Validate parameters
    IF p_parent_ref IS NULL OR trim(p_parent_ref) = '' THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'INVALID_PARAMETER');
    END IF;
    IF p_student_global_id IS NULL THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'INVALID_PARAMETER');
    END IF;
    IF p_destination_school_slug IS NULL OR trim(p_destination_school_slug) = '' THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'INVALID_PARAMETER');
    END IF;
    IF p_destination_student_local_id IS NULL OR trim(p_destination_student_local_id) = '' THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'INVALID_PARAMETER');
    END IF;

    -- B. Verify global student exists
    SELECT EXISTS (
        SELECT 1 FROM public.global_students WHERE student_global_id = p_student_global_id
    ) INTO v_gs_exists;

    IF NOT v_gs_exists THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'TARGET_NOT_FOUND');
    END IF;

    -- C. Verify parent owns this global student
    SELECT EXISTS (
        SELECT 1 FROM public.parent_child_links 
        WHERE parent_ref = p_parent_ref AND student_global_id = p_student_global_id
    ) INTO v_link_exists;

    IF NOT v_link_exists THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'TARGET_NOT_OWNED');
    END IF;

    -- D. Check existing mapping for destination
    SELECT * INTO v_existing_mapping 
    FROM public.student_global_mappings 
    WHERE school_slug = p_destination_school_slug AND student_local_id = p_destination_student_local_id
    FOR UPDATE; -- lock the row if it exists

    IF FOUND THEN
        IF v_existing_mapping.student_global_id = p_student_global_id THEN
            -- Idempotent retry
            RETURN jsonb_build_object(
                'status', 'already_mapped',
                'student_global_id', p_student_global_id,
                'destination_school_slug', p_destination_school_slug,
                'destination_student_local_id', p_destination_student_local_id
            );
        ELSE
            -- Conflict
            RETURN jsonb_build_object('status', 'error', 'message', 'MAPPING_CONFLICT');
        END IF;
    END IF;

    -- E. Insert new mapping
    BEGIN
        INSERT INTO public.student_global_mappings (
            school_slug, 
            student_local_id, 
            student_global_id
        ) VALUES (
            p_destination_school_slug, 
            p_destination_student_local_id, 
            p_student_global_id
        );
    EXCEPTION WHEN unique_violation THEN
        -- Concurrency: another transaction just inserted the mapping.
        -- Re-read the winning mapping
        SELECT * INTO v_existing_mapping 
        FROM public.student_global_mappings 
        WHERE school_slug = p_destination_school_slug AND student_local_id = p_destination_student_local_id;
        
        IF NOT FOUND THEN
            -- Unexpected state: it was a unique violation but now it's gone? Fail closed.
            RETURN jsonb_build_object('status', 'error', 'message', 'MAPPING_CONFLICT');
        END IF;

        IF v_existing_mapping.student_global_id = p_student_global_id THEN
            RETURN jsonb_build_object(
                'status', 'already_mapped',
                'student_global_id', p_student_global_id,
                'destination_school_slug', p_destination_school_slug,
                'destination_student_local_id', p_destination_student_local_id
            );
        ELSE
            RETURN jsonb_build_object('status', 'error', 'message', 'MAPPING_CONFLICT');
        END IF;
    END;

    -- E. Insert success audit trail
    INSERT INTO public.parent_student_identity_transfers (
        parent_ref,
        student_global_id,
        destination_school_slug,
        destination_student_local_id,
        status
    ) VALUES (
        p_parent_ref,
        p_student_global_id,
        p_destination_school_slug,
        p_destination_student_local_id,
        'completed'
    );

    RETURN jsonb_build_object(
        'status', 'created',
        'student_global_id', p_student_global_id,
        'destination_school_slug', p_destination_school_slug,
        'destination_student_local_id', p_destination_student_local_id
    );
END;
$$;

-- Secure the RPC
REVOKE EXECUTE ON FUNCTION public.apply_parent_student_identity_transfer(text, uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_parent_student_identity_transfer(text, uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.apply_parent_student_identity_transfer(text, uuid, text, text) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.apply_parent_student_identity_transfer(text, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_parent_student_identity_transfer(text, uuid, text, text) TO postgres;

COMMIT;
