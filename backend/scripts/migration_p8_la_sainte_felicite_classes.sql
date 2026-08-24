-- ============================================================================
-- MIGRATION P8 CIBLÉE : ENRICHISSEMENT STRICT DES CLASSES DE la_sainte_felicite
-- ============================================================================

BEGIN;

DO $$
DECLARE
    v_classes jsonb;
    v_elem jsonb;
    v_new_classes jsonb := '[]'::jsonb;
    v_modified_count integer := 0;
    v_ce2_found boolean := false;
    v_cm1_found boolean := false;
    v_cm2_found boolean := false;
    v_name text;
    v_cycle text;
    v_cat text;
BEGIN
    -- 1. Récupération de la ligne unique
    SELECT value::jsonb INTO v_classes
    FROM public.app_settings_la_sainte_felicite
    WHERE key = 'classes';

    IF v_classes IS NULL OR jsonb_typeof(v_classes) <> 'array' THEN
        RAISE EXCEPTION 'CONFIG_CLASSES_INVALID: Clé classes manquante ou non-tableau';
    END IF;

    -- 2. Parcours et validation stricte
    FOR v_elem IN SELECT * FROM jsonb_array_elements(v_classes)
    LOOP
        v_name := upper(trim(COALESCE(v_elem->>'name', '')));
        v_cycle := trim(COALESCE(v_elem->>'cycle', ''));
        v_cat := v_elem->>'billingCategory';

        IF v_name IN ('CE2', 'CM1', 'CM2') THEN
            IF v_cycle <> 'Primaire' THEN
                RAISE EXCEPTION 'CYCLE_MISMATCH: La classe % a le cycle % au lieu de Primaire', v_name, v_cycle;
            END IF;

            IF v_name = 'CE2' THEN
                IF v_ce2_found THEN RAISE EXCEPTION 'DUPLICATE_CLASS: Doublon détecté pour CE2'; END IF;
                v_ce2_found := true;
            ELSIF v_name = 'CM1' THEN
                IF v_cm1_found THEN RAISE EXCEPTION 'DUPLICATE_CLASS: Doublon détecté pour CM1'; END IF;
                v_cm1_found := true;
            ELSIF v_name = 'CM2' THEN
                IF v_cm2_found THEN RAISE EXCEPTION 'DUPLICATE_CLASS: Doublon détecté pour CM2'; END IF;
                v_cm2_found := true;
            END IF;

            IF v_cat IS NOT NULL AND v_cat <> 'maternelle_primaire' THEN
                RAISE EXCEPTION 'BILLING_CATEGORY_CONFLICT: La classe % a déjà une catégorie inattendue %', v_name, v_cat;
            END IF;

            -- Ajout de la billingCategory
            v_new_classes := v_new_classes || (v_elem || '{"billingCategory": "maternelle_primaire"}'::jsonb);
            v_modified_count := v_modified_count + 1;
        ELSE
            -- Conserver fidèlement les autres classes
            v_new_classes := v_new_classes || v_elem;
        END IF;
    END LOOP;

    -- 3. Assertions strictes : exactement les 3 classes ciblées
    IF NOT (v_ce2_found AND v_cm1_found AND v_cm2_found) THEN
        RAISE EXCEPTION 'TARGET_CLASSES_MISSING: Une ou plusieurs classes parmi CE2, CM1, CM2 sont introuvables';
    END IF;

    IF v_modified_count <> 3 THEN
        RAISE EXCEPTION 'UNEXPECTED_MODIFIED_COUNT: Attendu 3 classes modifiées, obtenu %', v_modified_count;
    END IF;

    -- 4. Application
    UPDATE public.app_settings_la_sainte_felicite
    SET value = v_new_classes::text
    WHERE key = 'classes';

    -- 5. Contrôle post-transformation strict en lecture seule sur students_la_sainte_felicite
    DECLARE
        v_total_students integer;
        v_unclassified_count integer := 0;
        v_student record;
        v_matched_cat text;
    BEGIN
        SELECT count(*) INTO v_total_students
        FROM public.students_la_sainte_felicite;

        IF v_total_students <> 4 THEN
            RAISE EXCEPTION 'STUDENTS_COUNT_MISMATCH: Attendu exactement 4 élèves dans students_la_sainte_felicite, trouvé %', v_total_students;
        END IF;

        FOR v_student IN
            SELECT id, classe
            FROM public.students_la_sainte_felicite
        LOOP
            IF UPPER(TRIM(COALESCE(v_student.classe, ''))) NOT IN ('CE2', 'CM1', 'CM2') THEN
                RAISE EXCEPTION 'UNEXPECTED_STUDENT_CLASS: L''élève % a la classe inattendue %', v_student.id, v_student.classe;
            END IF;

            -- Recherche de la classe correspondante dans les classes enrichies
            v_matched_cat := NULL;
            FOR v_elem IN SELECT * FROM jsonb_array_elements(v_new_classes)
            LOOP
                IF UPPER(TRIM(COALESCE(v_elem->>'name', ''))) = UPPER(TRIM(COALESCE(v_student.classe, ''))) THEN
                    v_matched_cat := v_elem->>'billingCategory';
                    EXIT;
                END IF;
            END LOOP;

            IF v_matched_cat IS DISTINCT FROM 'maternelle_primaire' THEN
                v_unclassified_count := v_unclassified_count + 1;
            END IF;
        END LOOP;

        IF v_unclassified_count <> 0 THEN
            RAISE EXCEPTION 'UNCLASSIFIED_STUDENTS_DETECTED: % élève(s) non classifiables après migration', v_unclassified_count;
        END IF;
    END;
END $$;

COMMIT;
