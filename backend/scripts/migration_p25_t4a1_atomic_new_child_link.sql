-- P25-T.4a1 Atomic New Child Link Foundation

CREATE OR REPLACE FUNCTION public.create_and_link_new_global_student(
    p_school_slug TEXT,
    p_student_local_id TEXT,
    p_parent_ref TEXT,
    p_expected_global_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actual_global_ids UUID[];
    v_existing_mapping UUID;
    v_new_global_id UUID;
    v_expected_sorted UUID[];
    v_actual_sorted UUID[];
BEGIN
    -- 1. Input Validation
    IF p_school_slug IS NULL OR p_school_slug = '' THEN
        RAISE EXCEPTION 'INVALID_PARAMETER: p_school_slug cannot be empty';
    END IF;
    IF p_school_slug !~ '^[a-z0-9_]{1,50}$' THEN
        RAISE EXCEPTION 'INVALID_PARAMETER: p_school_slug format invalid';
    END IF;
    IF p_student_local_id IS NULL OR trim(p_student_local_id) = '' THEN
        RAISE EXCEPTION 'INVALID_PARAMETER: p_student_local_id cannot be empty';
    END IF;
    IF p_parent_ref IS NULL OR trim(p_parent_ref) = '' THEN
        RAISE EXCEPTION 'INVALID_PARAMETER: p_parent_ref cannot be empty';
    END IF;
    IF p_expected_global_ids IS NULL THEN
        RAISE EXCEPTION 'INVALID_PARAMETER: p_expected_global_ids cannot be null';
    END IF;
    IF array_position(p_expected_global_ids, NULL) IS NOT NULL THEN
        RAISE EXCEPTION 'INVALID_PARAMETER: expected global ids cannot contain null';
    END IF;

    -- 2. Advisory Locks (Order: Parent then Destination)
    -- Using the 2-argument pg_advisory_xact_lock(int, int) to avoid collisions between domains
    PERFORM pg_advisory_xact_lock(1, hashtext(trim(p_parent_ref)));
    PERFORM pg_advisory_xact_lock(2, hashtext(p_school_slug || ':' || trim(p_student_local_id)));

    -- 3. Recompute Portfolio OCC Fingerprint
    SELECT COALESCE(array_agg(student_global_id ORDER BY student_global_id), ARRAY[]::UUID[])
    INTO v_actual_global_ids
    FROM (
        SELECT DISTINCT student_global_id
        FROM public.parent_child_links
        WHERE parent_ref = trim(p_parent_ref)
    ) AS distinct_ids;

    -- Normalize expected array (sort and distinct)
    SELECT COALESCE(array_agg(id ORDER BY id), ARRAY[]::UUID[])
    INTO v_expected_sorted
    FROM (
        SELECT DISTINCT unnest(p_expected_global_ids) AS id
    ) AS t;

    -- Compare
    IF v_actual_global_ids <> v_expected_sorted THEN
        RETURN jsonb_build_object('status', 'PORTFOLIO_CHANGED');
    END IF;

    -- 4. Check Destination Mapping
    SELECT student_global_id INTO v_existing_mapping
    FROM public.student_global_mappings
    WHERE school_slug = p_school_slug
      AND student_local_id = trim(p_student_local_id);

    IF v_existing_mapping IS NOT NULL THEN
        RETURN jsonb_build_object('status', 'DESTINATION_ALREADY_MAPPED');
    END IF;

    -- 5. Atomic Creation
    INSERT INTO public.global_students DEFAULT VALUES
    RETURNING student_global_id INTO v_new_global_id;

    INSERT INTO public.student_global_mappings (school_slug, student_local_id, student_global_id)
    VALUES (p_school_slug, trim(p_student_local_id), v_new_global_id);

    INSERT INTO public.parent_child_links (parent_ref, student_global_id, first_linked_at, current_link_active)
    VALUES (trim(p_parent_ref), v_new_global_id, now(), true);

    -- 6. Return Created Status
    RETURN jsonb_build_object(
        'status', 'created',
        'student_global_id', v_new_global_id
    );
END;
$$;

-- Security Grants
REVOKE ALL ON FUNCTION public.create_and_link_new_global_student(TEXT, TEXT, TEXT, UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_and_link_new_global_student(TEXT, TEXT, TEXT, UUID[]) FROM anon;
REVOKE ALL ON FUNCTION public.create_and_link_new_global_student(TEXT, TEXT, TEXT, UUID[]) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.create_and_link_new_global_student(TEXT, TEXT, TEXT, UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_and_link_new_global_student(TEXT, TEXT, TEXT, UUID[]) TO postgres;
