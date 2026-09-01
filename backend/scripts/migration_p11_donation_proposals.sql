-- migration_p11_donation_proposals.sql
-- Transactional migration: public.donation_proposals table + create_donation_proposal RPC
-- Does NOT modify any existing school-specific donation table.
-- Does NOT create any extension (pgcrypto already exists in schema extensions).

BEGIN;

-- =========================================================================
-- 1. Table
-- =========================================================================

CREATE TABLE public.donation_proposals (
    id                     uuid        PRIMARY KEY,
    reference              text        NOT NULL UNIQUE,
    full_name              text        NOT NULL,
    role                   text        NOT NULL,
    company_name           text        NOT NULL,
    sector                 text        NOT NULL,
    sub_sector             text,
    regulation_declaration text,
    other_sector_details   text,
    organization_type      text,
    support_type           text        NOT NULL,
    license                text,
    country                text        NOT NULL,
    target_markets         text        NOT NULL,
    email                  text        NOT NULL,
    phone                  text        NOT NULL,
    website                text,
    project_description    text        NOT NULL,
    language               text        NOT NULL,
    consent                boolean     NOT NULL,
    status                 text        NOT NULL DEFAULT 'pending',
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now()
);

-- =========================================================================
-- 2. Length + non-empty constraints (BETWEEN 1 AND limit for mandatory text)
-- =========================================================================

ALTER TABLE public.donation_proposals
    ADD CONSTRAINT chk_full_name_len CHECK (char_length(btrim(full_name)) BETWEEN 1 AND 100),
    ADD CONSTRAINT chk_role_len CHECK (char_length(btrim(role)) BETWEEN 1 AND 100),
    ADD CONSTRAINT chk_company_name_len CHECK (char_length(btrim(company_name)) BETWEEN 1 AND 200),
    ADD CONSTRAINT chk_country_len CHECK (char_length(btrim(country)) BETWEEN 1 AND 100),
    ADD CONSTRAINT chk_target_markets_len CHECK (char_length(btrim(target_markets)) BETWEEN 1 AND 300),
    ADD CONSTRAINT chk_email_len CHECK (char_length(btrim(email)) BETWEEN 1 AND 254),
    ADD CONSTRAINT chk_phone_len CHECK (char_length(btrim(phone)) BETWEEN 1 AND 30),
    ADD CONSTRAINT chk_project_description_len CHECK (char_length(btrim(project_description)) BETWEEN 1 AND 5000);

-- Optional text fields: NULL allowed, but if present must respect max length
ALTER TABLE public.donation_proposals
    ADD CONSTRAINT chk_license_len CHECK (license IS NULL OR char_length(btrim(license)) BETWEEN 1 AND 200),
    ADD CONSTRAINT chk_website_len CHECK (website IS NULL OR char_length(btrim(website)) BETWEEN 1 AND 2048),
    ADD CONSTRAINT chk_other_sector_details_len CHECK (other_sector_details IS NULL OR char_length(btrim(other_sector_details)) BETWEEN 1 AND 500);

-- =========================================================================
-- 3. Enumeration constraints
-- =========================================================================

ALTER TABLE public.donation_proposals
    ADD CONSTRAINT chk_sector CHECK (sector IN ('finance','telecom','equipment','mobility_services','after_school_services','insurance','transport','ngo_institutions','otherRegulated','other')),
    ADD CONSTRAINT chk_sub_sector CHECK (sub_sector IS NULL OR sub_sector IN ('transport','insurance','afterSchool','otherRegulated')),
    ADD CONSTRAINT chk_regulation_declaration CHECK (regulation_declaration IS NULL OR regulation_declaration IN ('yes','no')),
    ADD CONSTRAINT chk_organization_type CHECK (organization_type IS NULL OR organization_type IN ('ngo','foundation','association','international_institution','cooperation_agency','public_body','sponsor_company','other')),
    ADD CONSTRAINT chk_support_type CHECK (support_type IN ('future_financial_donation','equipment_donation','school_sponsorship','educational_project_funding','skills_sponsorship','other_proposal')),
    ADD CONSTRAINT chk_language CHECK (language IN ('fr','en','es','ar','it','de','pt','zh','ru')),
    ADD CONSTRAINT chk_status CHECK (status IN ('pending','under_review','approved','rejected','archived'));

-- =========================================================================
-- 4. Format constraints
-- =========================================================================

ALTER TABLE public.donation_proposals
    ADD CONSTRAINT chk_reference_format CHECK (reference ~ '^DON-[0-9]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$'),
    ADD CONSTRAINT chk_consent_true CHECK (consent = true),
    ADD CONSTRAINT chk_email_format CHECK (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
    ADD CONSTRAINT chk_phone_e164 CHECK (phone ~ '^\+[1-9][0-9]{7,14}$');

-- =========================================================================
-- 5. Conditional constraints (matching donationProposalValidation.js)
-- =========================================================================

ALTER TABLE public.donation_proposals
    ADD CONSTRAINT chk_sub_sector_mobility_services CHECK (
        NOT (sector = 'mobility_services')
        OR (sub_sector IS NOT NULL AND sub_sector IN ('transport','insurance','afterSchool','otherRegulated'))
    ),
    ADD CONSTRAINT chk_regulation_and_other_for_other_sector CHECK (
        NOT (sector = 'other')
        OR (
            regulation_declaration IS NOT NULL
            AND regulation_declaration IN ('yes','no')
            AND other_sector_details IS NOT NULL
            AND char_length(btrim(other_sector_details)) >= 1
        )
    ),
    ADD CONSTRAINT chk_organization_type_for_ngo_institutions CHECK (
        NOT (sector = 'ngo_institutions')
        OR (organization_type IS NOT NULL AND organization_type IN ('ngo','foundation','association','international_institution','cooperation_agency','public_body','sponsor_company','other'))
    ),
    ADD CONSTRAINT chk_license_required CHECK (
        NOT (
            sector IN ('finance','insurance','otherRegulated')
            OR (sector = 'mobility_services' AND sub_sector IN ('insurance','otherRegulated'))
            OR (sector = 'other' AND regulation_declaration = 'yes')
        )
        OR (license IS NOT NULL AND char_length(btrim(license)) >= 1)
    );

-- =========================================================================
-- 6. Row Level Security
-- =========================================================================

ALTER TABLE public.donation_proposals ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- 7. Revoke ALL direct access to the table (including service_role)
-- =========================================================================

REVOKE ALL ON TABLE public.donation_proposals FROM PUBLIC, anon, authenticated, service_role;

-- =========================================================================
-- 8. RPC function
-- =========================================================================

CREATE FUNCTION public.create_donation_proposal(
    p_full_name              text,
    p_role                   text,
    p_company_name           text,
    p_sector                 text,
    p_sub_sector             text,
    p_regulation_declaration text,
    p_other_sector_details   text,
    p_organization_type      text,
    p_support_type           text,
    p_license                text,
    p_country                text,
    p_target_markets         text,
    p_email                  text,
    p_phone                  text,
    p_website                text,
    p_project_description    text,
    p_language               text,
    p_consent                boolean
) RETURNS TABLE (id uuid, reference text, status text)
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog, extensions
AS $$
DECLARE
    v_inserted_id        uuid;
    v_inserted_reference text;
    v_inserted_status    text;
    v_attempt            int := 0;
    v_max_attempts constant int := 5;
    v_year               text;
    v_bytes              bytea;
    v_char_idx           int;
    v_ref_suffix         text;
    v_alphabet  constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
BEGIN
    v_year := pg_catalog.to_char(pg_catalog.now() AT TIME ZONE 'UTC', 'YYYY');

    LOOP
        v_inserted_id := pg_catalog.gen_random_uuid();
        v_bytes := extensions.gen_random_bytes(8);
        v_ref_suffix := '';
        FOR i IN 0..7 LOOP
            v_char_idx := pg_catalog.get_byte(v_bytes, i) % 32;
            v_ref_suffix := v_ref_suffix || pg_catalog.substr(v_alphabet, v_char_idx + 1, 1);
        END LOOP;
        v_inserted_reference := 'DON-' || v_year || '-' || v_ref_suffix;

        BEGIN
            INSERT INTO public.donation_proposals AS dp (
                id, reference, full_name, role, company_name, sector, sub_sector,
                regulation_declaration, other_sector_details, organization_type,
                support_type, license, country, target_markets, email, phone,
                website, project_description, language, consent, status
            ) VALUES (
                v_inserted_id, v_inserted_reference,
                p_full_name, p_role, p_company_name, p_sector, p_sub_sector,
                p_regulation_declaration, p_other_sector_details, p_organization_type,
                p_support_type, p_license, p_country, p_target_markets, p_email, p_phone,
                p_website, p_project_description, p_language, p_consent, 'pending'
            )
            RETURNING dp.id, dp.reference, dp.status
                INTO v_inserted_id, v_inserted_reference, v_inserted_status;

            RETURN QUERY SELECT v_inserted_id, v_inserted_reference, v_inserted_status;
            RETURN;

        EXCEPTION WHEN unique_violation THEN
            v_attempt := v_attempt + 1;
            IF v_attempt >= v_max_attempts THEN
                RAISE EXCEPTION 'Unable to generate unique donation reference after maximum attempts';
            END IF;
        END;
    END LOOP;
END;
$$;

-- =========================================================================
-- 9. Function privileges
-- =========================================================================

REVOKE ALL ON FUNCTION public.create_donation_proposal(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_donation_proposal(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.create_donation_proposal(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_donation_proposal(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, boolean) TO service_role;

COMMIT;
