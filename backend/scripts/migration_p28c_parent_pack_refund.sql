-- ==============================================================================
-- MIGRATION P28c : REMBOURSEMENT ADMINISTRATIF PARENT PACK À DOUBLE VALIDATION,
--                  VERROUILLAGE FAIL-CLOSED DES COMPENSATIONS NON ATTESTÉES,
--                  COMPENSATION COMMISSIONS (ÉCOLE & AMBASSADEUR) ET
--                  RÉVOCATION SÉCURISÉE DES DROITS D'ACCÈS
-- ==============================================================================
-- Périmètre P28c (Sécurité renforcée — Résolution SECURITY_BLOCKER) :
--   1. Blocage fail-closed par défaut de toute compensation financière automatique
--      non attestée : public.admin_process_parent_pack_refund(UUID, TEXT, UUID, TEXT)
--      rejette systématiquement tout appel unilatéral déclaratif.
--   2. Table d'état de rapprochement à double validation :
--      public.parent_pack_refund_reconciliations
--      - Étape 1 (Initiation) : Un premier SuperAdmin authentifié enregistre la
--        demande de rapprochement avec l'identifiant de transaction d'origine,
--        le montant/devise vérifiés auprès de FedaPay, la référence de stockage
--        privé du justificatif (private://...) et son empreinte SHA-256.
--      - Étape 2 (Approbation & Exécution) : Un second SuperAdmin authentifié et
--        distinct (approver_admin_id <> initiator_admin_id) valide le dossier.
--        Le moteur SQL vérifie la cohérence stricte des montants, devises, dates,
--        bénéficiaire et preuves avant d'exécuter atomiquement une seule fois la
--        compensation financière et la révocation des droits.
--   3. Distinction explicite entre l'identifiant interne de rapprochement
--      (internal_reconciliation_ref) et une éventuelle référence fournisseur
--      certifiée de remboursement (provider_refund_id, nullable si FedaPay n'en
--      fournit pas).
--   4. Protection des triggers SQL (validate_parent_pack_intent et
--      protect_parent_pack_intent) contre tout contournement par simple variable
--      de session : exige un dossier de rapprochement 'completed' à double
--      signature ET une entrée d'audit immuable concordante.
-- ==============================================================================

BEGIN;

-- 0. Rôles dédiés à moindre privilège (séparation stricte D.2.3 : exécuteur vs autorité WebAuthn)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'yziow_refund_executor') THEN
        CREATE ROLE yziow_refund_executor LOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'yziow_webauthn_authority') THEN
        CREATE ROLE yziow_webauthn_authority LOGIN;
    END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO yziow_refund_executor;
GRANT USAGE ON SCHEMA public TO yziow_webauthn_authority;

-- ------------------------------------------------------------------------------
-- 0a. Chantier D.2 : Extension cryptographique et schéma isolé d'authentification
--     indépendante des SuperAdmins (yziow_refund_auth)
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS yziow_refund_auth;

-- Table de configuration de l'autorité de preuve (clé secrète HMAC-SHA256)
CREATE TABLE IF NOT EXISTS yziow_refund_auth.authority_config (
    id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id = true),
    secret_key TEXT NOT NULL,
    require_webauthn_confirmation BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE yziow_refund_auth.authority_config
    ADD COLUMN IF NOT EXISTS require_webauthn_confirmation BOOLEAN NOT NULL DEFAULT false;

INSERT INTO yziow_refund_auth.authority_config (id, secret_key, require_webauthn_confirmation)
VALUES (true, 'yziow_refund_action_auth_secret_default_testing_key_2026', false)
ON CONFLICT (id) DO NOTHING;

-- Table des nonces d'autorisation consommés (consommation atomique à usage unique / anti-rejeu)
CREATE TABLE IF NOT EXISTS yziow_refund_auth.consumed_action_proofs (
    jti UUID PRIMARY KEY,
    admin_id UUID NOT NULL REFERENCES public.superadmins(id) ON DELETE RESTRICT,
    action_type TEXT NOT NULL CHECK (action_type IN ('initiate', 'approve')),
    period_id UUID NOT NULL,
    reconciliation_id UUID NULL,
    provider_transaction_id TEXT NOT NULL,
    verified_amount_minor BIGINT NOT NULL,
    currency TEXT NOT NULL,
    proof_document_hash TEXT NOT NULL,
    webauthn_challenge_id UUID UNIQUE NULL,
    credential_id TEXT NULL,
    issued_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE yziow_refund_auth.consumed_action_proofs
    ADD COLUMN IF NOT EXISTS webauthn_challenge_id UUID UNIQUE NULL,
    ADD COLUMN IF NOT EXISTS credential_id TEXT NULL;

-- ------------------------------------------------------------------------------
-- 0a.1. Chantier D.2.1 & D.2.2 : Authentificateurs personnels WebAuthn des SuperAdmins
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.superadmin_webauthn_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES public.superadmins(id) ON DELETE CASCADE,
    credential_id TEXT NOT NULL UNIQUE,
    public_key_spki TEXT NOT NULL,
    public_key_cose TEXT NULL,
    cose_alg INTEGER NOT NULL DEFAULT -7,
    counter BIGINT NOT NULL DEFAULT 0,
    aaguid TEXT NULL,
    attestation_format TEXT NULL DEFAULT 'none',
    credential_device_type TEXT NULL DEFAULT 'singleDevice',
    credential_backed_up BOOLEAN NOT NULL DEFAULT false,
    transports TEXT[] NULL,
    registered_by_approver_id UUID NULL REFERENCES public.superadmins(id) ON DELETE RESTRICT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    revoked_at TIMESTAMPTZ NULL,
    last_used_at TIMESTAMPTZ NULL
);

ALTER TABLE public.superadmin_webauthn_credentials
    ADD COLUMN IF NOT EXISTS public_key_cose TEXT NULL,
    ADD COLUMN IF NOT EXISTS cose_alg INTEGER NOT NULL DEFAULT -7,
    ADD COLUMN IF NOT EXISTS attestation_format TEXT NULL DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS credential_device_type TEXT NULL DEFAULT 'singleDevice',
    ADD COLUMN IF NOT EXISTS credential_backed_up BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS registered_by_approver_id UUID NULL REFERENCES public.superadmins(id) ON DELETE RESTRICT;

ALTER TABLE public.superadmin_webauthn_credentials ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_superadmin_webauthn_credentials_admin_id
    ON public.superadmin_webauthn_credentials (admin_id);

-- Table des challenges d'authentification forte WebAuthn (usage unique, courte durée)
CREATE TABLE IF NOT EXISTS yziow_refund_auth.webauthn_challenges (
    challenge_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES public.superadmins(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL CHECK (action_type IN ('register', 'enroll_approve', 'initiate', 'approve')),
    challenge_bytes TEXT NOT NULL UNIQUE,
    canonical_payload TEXT NULL,
    period_id UUID NULL,
    reconciliation_id UUID NULL,
    provider_transaction_id TEXT NULL,
    verified_amount_minor BIGINT NULL,
    currency TEXT NULL,
    proof_document_hash TEXT NULL,
    rp_id TEXT NOT NULL,
    origin TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ NULL,
    consumed_by_credential_id TEXT NULL
);

ALTER TABLE yziow_refund_auth.webauthn_challenges
    DROP CONSTRAINT IF EXISTS webauthn_challenges_action_type_check;
ALTER TABLE yziow_refund_auth.webauthn_challenges
    ADD CONSTRAINT webauthn_challenges_action_type_check
    CHECK (action_type IN ('register', 'enroll_approve', 'initiate', 'approve'));

CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_admin_action
    ON yziow_refund_auth.webauthn_challenges (admin_id, action_type);

-- Révocation stricte (D.2.3) :
-- 1. yziow_refund_executor, service_role, authenticated, anon n'ont AUCUN accès au schéma d'autorité,
--    à la clé secrète, aux preuves, aux challenges ni aux credentials WebAuthn.
-- 2. yziow_webauthn_authority dispose uniquement des permissions minimales pour gérer les challenges
--    et les credentials WebAuthn, sans aucun accès à authority_config, consumed_action_proofs ni aux tables financières.
REVOKE ALL ON SCHEMA yziow_refund_auth FROM PUBLIC, anon, authenticated, service_role, yziow_refund_executor, yziow_webauthn_authority;
REVOKE ALL ON ALL TABLES IN SCHEMA yziow_refund_auth FROM PUBLIC, anon, authenticated, service_role, yziow_refund_executor, yziow_webauthn_authority;

REVOKE ALL ON TABLE public.superadmin_webauthn_credentials FROM PUBLIC, anon, authenticated, service_role, yziow_refund_executor, yziow_webauthn_authority;

GRANT USAGE ON SCHEMA yziow_refund_auth TO yziow_webauthn_authority;
GRANT SELECT, INSERT, UPDATE ON TABLE public.superadmin_webauthn_credentials TO yziow_webauthn_authority;
GRANT SELECT ON TABLE yziow_refund_auth.webauthn_challenges TO yziow_webauthn_authority;

DROP POLICY IF EXISTS policy_webauthn_authority_credentials_access ON public.superadmin_webauthn_credentials;
CREATE POLICY policy_webauthn_authority_credentials_access
    ON public.superadmin_webauthn_credentials
    FOR ALL
    TO yziow_webauthn_authority
    USING (true)
    WITH CHECK (true);

-- Fonction sécurisée pour enregistrer un challenge WebAuthn
CREATE OR REPLACE FUNCTION yziow_refund_auth.store_webauthn_challenge(
    p_admin_id UUID,
    p_action_type TEXT,
    p_challenge_bytes TEXT,
    p_canonical_payload TEXT,
    p_period_id UUID,
    p_reconciliation_id UUID,
    p_provider_tx_id TEXT,
    p_amount BIGINT,
    p_currency TEXT,
    p_doc_hash TEXT,
    p_rp_id TEXT,
    p_origin TEXT,
    p_validity_seconds INTEGER DEFAULT 300
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = yziow_refund_auth, public, pg_catalog
AS $$
DECLARE
    v_challenge_id UUID;
    v_is_active BOOLEAN := false;
    v_bounded_validity INTEGER;
BEGIN
    SELECT COALESCE(is_active, false) INTO v_is_active
    FROM public.superadmins
    WHERE id = p_admin_id;

    IF NOT FOUND OR v_is_active IS NOT TRUE THEN
        RAISE EXCEPTION 'UNAUTHORIZED_ADMIN: SuperAdmin % introuvable ou inactif.', p_admin_id;
    END IF;

    v_bounded_validity := LEAST(GREATEST(COALESCE(p_validity_seconds, 300), 1), 300);

    INSERT INTO yziow_refund_auth.webauthn_challenges (
        admin_id,
        action_type,
        challenge_bytes,
        canonical_payload,
        period_id,
        reconciliation_id,
        provider_transaction_id,
        verified_amount_minor,
        currency,
        proof_document_hash,
        rp_id,
        origin,
        created_at,
        expires_at
    ) VALUES (
        p_admin_id,
        p_action_type,
        p_challenge_bytes,
        p_canonical_payload,
        p_period_id,
        p_reconciliation_id,
        p_provider_tx_id,
        p_amount,
        p_currency,
        p_doc_hash,
        p_rp_id,
        p_origin,
        clock_timestamp(),
        clock_timestamp() + (v_bounded_validity || ' seconds')::interval
    )
    RETURNING challenge_id INTO v_challenge_id;

    RETURN v_challenge_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION yziow_refund_auth.store_webauthn_challenge(UUID, TEXT, TEXT, TEXT, UUID, UUID, TEXT, BIGINT, TEXT, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated, service_role, yziow_refund_executor;
GRANT EXECUTE ON FUNCTION yziow_refund_auth.store_webauthn_challenge(UUID, TEXT, TEXT, TEXT, UUID, UUID, TEXT, BIGINT, TEXT, TEXT, TEXT, TEXT, INTEGER) TO yziow_webauthn_authority;

-- Fonction sécurisée pour verrouiller (FOR UPDATE) et lire un challenge WebAuthn en cours de transaction
CREATE OR REPLACE FUNCTION yziow_refund_auth.get_webauthn_challenge_for_update(
    p_challenge_bytes TEXT
)
RETURNS TABLE (
    challenge_id UUID,
    admin_id UUID,
    action_type TEXT,
    challenge_bytes TEXT,
    canonical_payload TEXT,
    period_id UUID,
    reconciliation_id UUID,
    provider_transaction_id TEXT,
    verified_amount_minor BIGINT,
    currency TEXT,
    proof_document_hash TEXT,
    rp_id TEXT,
    origin TEXT,
    created_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    consumed_at TIMESTAMPTZ,
    consumed_by_credential_id TEXT,
    is_expired BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = yziow_refund_auth, public, pg_catalog
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.challenge_id,
        c.admin_id,
        c.action_type,
        c.challenge_bytes,
        c.canonical_payload,
        c.period_id,
        c.reconciliation_id,
        c.provider_transaction_id,
        c.verified_amount_minor,
        c.currency,
        c.proof_document_hash,
        c.rp_id,
        c.origin,
        c.created_at,
        c.expires_at,
        c.consumed_at,
        c.consumed_by_credential_id,
        (c.expires_at < clock_timestamp()) AS is_expired
    FROM yziow_refund_auth.webauthn_challenges c
    WHERE c.challenge_bytes = p_challenge_bytes
    FOR UPDATE;
END;
$$;

REVOKE EXECUTE ON FUNCTION yziow_refund_auth.get_webauthn_challenge_for_update(TEXT) FROM PUBLIC, anon, authenticated, service_role, yziow_refund_executor;
GRANT EXECUTE ON FUNCTION yziow_refund_auth.get_webauthn_challenge_for_update(TEXT) TO yziow_webauthn_authority;

-- Fonction sécurisée pour consommer atomiquement un challenge WebAuthn (FOR UPDATE)
CREATE OR REPLACE FUNCTION yziow_refund_auth.consume_webauthn_challenge(
    p_challenge_bytes TEXT,
    p_admin_id UUID,
    p_action_type TEXT,
    p_credential_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = yziow_refund_auth, public, pg_catalog
AS $$
DECLARE
    v_challenge RECORD;
BEGIN
    SELECT * INTO v_challenge
    FROM yziow_refund_auth.webauthn_challenges
    WHERE challenge_bytes = p_challenge_bytes
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'CHALLENGE_NOT_FOUND: Challenge WebAuthn introuvable.';
    END IF;

    IF v_challenge.consumed_at IS NOT NULL THEN
        RAISE EXCEPTION 'CHALLENGE_ALREADY_CONSUMED: Ce challenge WebAuthn a deja ete consomme (anti-rejeu).';
    END IF;

    IF v_challenge.expires_at < clock_timestamp() THEN
        RAISE EXCEPTION 'CHALLENGE_EXPIRED: Ce challenge WebAuthn est expire.';
    END IF;

    IF v_challenge.admin_id IS DISTINCT FROM p_admin_id THEN
        RAISE EXCEPTION 'CHALLENGE_ADMIN_MISMATCH: Le challenge n''appartient pas a l''administrateur declare.';
    END IF;

    IF v_challenge.action_type IS DISTINCT FROM p_action_type THEN
        RAISE EXCEPTION 'CHALLENGE_ACTION_MISMATCH: Le type d''action ne correspond pas au challenge.';
    END IF;

    UPDATE yziow_refund_auth.webauthn_challenges
    SET consumed_at = clock_timestamp(),
        consumed_by_credential_id = p_credential_id
    WHERE challenge_id = v_challenge.challenge_id;

    RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION yziow_refund_auth.consume_webauthn_challenge(TEXT, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated, service_role, yziow_refund_executor;
GRANT EXECUTE ON FUNCTION yziow_refund_auth.consume_webauthn_challenge(TEXT, UUID, TEXT, TEXT) TO yziow_webauthn_authority;

-- Fonction sécurisée permettant à l'autorité WebAuthn de vérifier l'état actif d'un SuperAdmin
CREATE OR REPLACE FUNCTION yziow_refund_auth.check_superadmin_active(
    p_admin_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = yziow_refund_auth, public, pg_catalog
AS $$
DECLARE
    v_is_active BOOLEAN := false;
BEGIN
    IF p_admin_id IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT COALESCE(is_active, false) INTO v_is_active
    FROM public.superadmins
    WHERE id = p_admin_id;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    RETURN v_is_active;
END;
$$;

REVOKE EXECUTE ON FUNCTION yziow_refund_auth.check_superadmin_active(UUID) FROM PUBLIC, anon, authenticated, service_role, yziow_refund_executor;
GRANT EXECUTE ON FUNCTION yziow_refund_auth.check_superadmin_active(UUID) TO yziow_webauthn_authority;

-- Fonction sécurisée permettant à l'autorité WebAuthn de lire les données faisant autorité
-- sur le dossier directement depuis PostgreSQL sans se fier aux déclarations du backend (D.2.3)
CREATE OR REPLACE FUNCTION yziow_refund_auth.inspect_authoritative_refund_dossier(
    p_admin_id UUID,
    p_action_type TEXT,
    p_period_id UUID,
    p_reconciliation_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = yziow_refund_auth, public, pg_catalog
AS $$
DECLARE
    v_is_active BOOLEAN := false;
    v_period RECORD;
    v_intent RECORD;
    v_rec RECORD;
BEGIN
    IF p_admin_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_ADMIN_ID: admin_id obligatoire.';
    END IF;

    SELECT is_active INTO v_is_active
    FROM public.superadmins
    WHERE id = p_admin_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'UNAUTHORIZED_ADMIN: SuperAdmin % introuvable.', p_admin_id;
    END IF;

    IF v_is_active IS NOT TRUE THEN
        RAISE EXCEPTION 'REVOKED_ADMIN: SuperAdmin % inactif ou revoque.', p_admin_id;
    END IF;

    IF p_action_type NOT IN ('initiate', 'approve') THEN
        RAISE EXCEPTION 'INVALID_ACTION_TYPE: action_type doit etre initiate ou approve.';
    END IF;

    SELECT id, subscription_id, payment_intent_id, status
    INTO v_period
    FROM public.parent_subscription_periods
    WHERE id = p_period_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PERIOD_NOT_FOUND: Periode % introuvable dans la source faisant autorite.', p_period_id;
    END IF;

    SELECT id, status, provider_transaction_id, expected_amount, expected_currency
    INTO v_intent
    FROM public.payment_intents
    WHERE id = v_period.payment_intent_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PAYMENT_INTENT_NOT_FOUND: Intention de paiement introuvable pour la periode %.', p_period_id;
    END IF;

    IF p_action_type = 'approve' THEN
        IF p_reconciliation_id IS NULL THEN
            RAISE EXCEPTION 'INVALID_RECONCILIATION_ID: reconciliation_id obligatoire pour approve.';
        END IF;

        SELECT id, period_id, initiator_admin_id, provider_transaction_id, verified_amount_minor, verified_currency, proof_document_hash, status
        INTO v_rec
        FROM public.parent_pack_refund_reconciliations
        WHERE id = p_reconciliation_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'RECONCILIATION_NOT_FOUND: Dossier de rapprochement % introuvable.', p_reconciliation_id;
        END IF;

        IF v_rec.period_id IS DISTINCT FROM p_period_id THEN
            RAISE EXCEPTION 'RECONCILIATION_PERIOD_MISMATCH: Le dossier % ne correspond pas a la periode %.', p_reconciliation_id, p_period_id;
        END IF;

        IF v_rec.initiator_admin_id = p_admin_id THEN
            RAISE EXCEPTION 'DUAL_CUSTODY_VIOLATION: Le second SuperAdmin approbateur (%) doit etre strictement distinct du SuperAdmin initiateur (%).',
                p_admin_id, v_rec.initiator_admin_id;
        END IF;

        RETURN jsonb_build_object(
            'period_id', v_period.id,
            'reconciliation_id', v_rec.id,
            'provider_transaction_id', trim(v_intent.provider_transaction_id),
            'verified_amount_minor', v_intent.expected_amount::BIGINT,
            'currency', upper(trim(v_intent.expected_currency)),
            'proof_document_hash', lower(trim(v_rec.proof_document_hash)),
            'initiator_admin_id', v_rec.initiator_admin_id,
            'reconciliation_status', v_rec.status
        );
    END IF;

    RETURN jsonb_build_object(
        'period_id', v_period.id,
        'reconciliation_id', NULL,
        'provider_transaction_id', trim(v_intent.provider_transaction_id),
        'verified_amount_minor', v_intent.expected_amount::BIGINT,
        'currency', upper(trim(v_intent.expected_currency)),
        'intent_status', v_intent.status,
        'period_status', v_period.status
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION yziow_refund_auth.inspect_authoritative_refund_dossier(UUID, TEXT, UUID, UUID) FROM PUBLIC, anon, authenticated, service_role, yziow_refund_executor;
GRANT EXECUTE ON FUNCTION yziow_refund_auth.inspect_authoritative_refund_dossier(UUID, TEXT, UUID, UUID) TO yziow_webauthn_authority;

-- Activation de l'état actif/révoqué sur superadmins
ALTER TABLE public.superadmins ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Fonction de vérification cryptographique et de consommation atomique de la preuve d'action
CREATE OR REPLACE FUNCTION yziow_refund_auth.verify_and_consume_action_proof(
    p_proof JSONB,
    p_expected_action_type TEXT,
    p_expected_admin_id UUID,
    p_expected_period_id UUID,
    p_expected_reconciliation_id UUID,
    p_expected_tx_id TEXT,
    p_expected_amount BIGINT,
    p_expected_currency TEXT,
    p_expected_doc_hash TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = yziow_refund_auth, public, pg_catalog, pgcrypto
AS $$
DECLARE
    v_version TEXT;
    v_issuer TEXT;
    v_action_type TEXT;
    v_admin_id_text TEXT;
    v_admin_id UUID;
    v_is_active BOOLEAN;
    v_period_id_text TEXT;
    v_period_id UUID;
    v_rec_id_text TEXT;
    v_rec_id UUID;
    v_tx_id TEXT;
    v_amount_text TEXT;
    v_amount BIGINT;
    v_currency TEXT;
    v_doc_hash TEXT;
    v_issued_at_text TEXT;
    v_expires_at_text TEXT;
    v_issued_at TIMESTAMPTZ;
    v_expires_at TIMESTAMPTZ;
    v_jti_text TEXT;
    v_jti UUID;
    v_signature TEXT;
    v_secret TEXT;
    v_require_webauthn BOOLEAN := false;
    v_admin_has_active_webauthn BOOLEAN := false;
    v_webauthn_challenge_id_text TEXT;
    v_webauthn_challenge_id UUID := NULL;
    v_credential_id TEXT := NULL;
    v_webauthn_sig TEXT := NULL;
    v_expected_webauthn_sig TEXT := NULL;
    v_challenge_rec RECORD;
    v_cred_rec RECORD;
    v_canonical TEXT;
    v_expected_sig TEXT;
BEGIN
    -- 1. Présence de la preuve
    IF p_proof IS NULL OR jsonb_typeof(p_proof) <> 'object' THEN
        RAISE EXCEPTION 'ACTION_PROOF_REQUIRED: Preuve d''action cryptographique obligatoire pour toute operation de remboursement.';
    END IF;

    -- 2. Version et autorité émettrice
    v_version := p_proof->>'version';
    IF v_version IS DISTINCT FROM '1.0' THEN
        RAISE EXCEPTION 'INVALID_ACTION_PROOF_VERSION: Version de preuve d''action non supportee (%)', COALESCE(v_version, 'NULL');
    END IF;

    v_issuer := p_proof->>'issuer';
    IF v_issuer IS DISTINCT FROM 'yziow-refund-auth-authority' THEN
        RAISE EXCEPTION 'UNRECOGNIZED_ACTION_PROOF_AUTHORITY: Autorite emettrice de la preuve d''action non reconnue (%)', COALESCE(v_issuer, 'NULL');
    END IF;

    -- 3. Type d'action ('initiate' ou 'approve')
    v_action_type := p_proof->>'action_type';
    IF v_action_type IS DISTINCT FROM p_expected_action_type THEN
        RAISE EXCEPTION 'ACTION_PROOF_TYPE_MISMATCH: Type d''action discordant dans la preuve (% vs attendu %)',
            COALESCE(v_action_type, 'NULL'), p_expected_action_type;
    END IF;

    -- 4. Administrateur signataire
    v_admin_id_text := p_proof->>'admin_id';
    IF v_admin_id_text IS NULL OR v_admin_id_text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
        RAISE EXCEPTION 'INVALID_ACTION_PROOF_ADMIN_ID: Identifiant admin_id de preuve invalide (%)', COALESCE(v_admin_id_text, 'NULL');
    END IF;
    v_admin_id := v_admin_id_text::UUID;

    IF p_expected_admin_id IS NOT NULL AND v_admin_id IS DISTINCT FROM p_expected_admin_id THEN
        RAISE EXCEPTION 'ACTION_PROOF_ADMIN_MISMATCH: Le signataire de la preuve (%) ne correspond pas a l''administrateur declare (%)',
            v_admin_id, p_expected_admin_id;
    END IF;

    -- Vérification du statut actif/révoqué de l'administrateur
    SELECT is_active INTO v_is_active
    FROM public.superadmins
    WHERE id = v_admin_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'UNAUTHORIZED_ADMIN: SuperAdmin signataire % introuvable', v_admin_id;
    END IF;

    IF v_is_active IS NOT TRUE THEN
        RAISE EXCEPTION 'REVOKED_ADMIN: Le SuperAdmin signataire % est inactif ou a ete revoque', v_admin_id;
    END IF;

    -- 5. Période
    v_period_id_text := p_proof->>'period_id';
    IF v_period_id_text IS NULL OR v_period_id_text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
        RAISE EXCEPTION 'INVALID_ACTION_PROOF_PERIOD_ID: Identifiant period_id de preuve invalide (%)', COALESCE(v_period_id_text, 'NULL');
    END IF;
    v_period_id := v_period_id_text::UUID;

    IF v_period_id IS DISTINCT FROM p_expected_period_id THEN
        RAISE EXCEPTION 'ACTION_PROOF_PERIOD_MISMATCH: Periode discordante dans la preuve (% vs %)',
            v_period_id, p_expected_period_id;
    END IF;

    -- 6. Dossier de rapprochement (obligatoire pour approbation, facultatif ou null pour initiation)
    v_rec_id_text := p_proof->>'reconciliation_id';
    IF p_expected_action_type = 'approve' THEN
        IF v_rec_id_text IS NULL OR v_rec_id_text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
            RAISE EXCEPTION 'INVALID_ACTION_PROOF_RECONCILIATION_ID: Identifiant reconciliation_id obligatoire pour l''approbation';
        END IF;
        v_rec_id := v_rec_id_text::UUID;
        IF v_rec_id IS DISTINCT FROM p_expected_reconciliation_id THEN
            RAISE EXCEPTION 'ACTION_PROOF_DOSSIER_MISMATCH: Dossier discordant dans la preuve (% vs %)',
                v_rec_id, p_expected_reconciliation_id;
        END IF;
    ELSE
        IF v_rec_id_text IS NOT NULL AND trim(v_rec_id_text) <> '' THEN
            v_rec_id := v_rec_id_text::UUID;
        ELSE
            v_rec_id := NULL;
        END IF;
    END IF;

    -- 7. Transaction fournisseur FedaPay
    v_tx_id := trim(COALESCE(p_proof->>'provider_transaction_id', ''));
    IF v_tx_id IS DISTINCT FROM trim(p_expected_tx_id) THEN
        RAISE EXCEPTION 'ACTION_PROOF_TRANSACTION_MISMATCH: Transaction FedaPay discordante dans la preuve (% vs %)',
            v_tx_id, trim(p_expected_tx_id);
    END IF;

    -- 8. Montant vérifié
    v_amount_text := p_proof->>'verified_amount_minor';
    IF v_amount_text IS NULL OR v_amount_text !~ '^[0-9]+$' THEN
        RAISE EXCEPTION 'INVALID_ACTION_PROOF_AMOUNT: Montant verified_amount_minor invalide';
    END IF;
    v_amount := v_amount_text::BIGINT;
    IF v_amount IS DISTINCT FROM p_expected_amount THEN
        RAISE EXCEPTION 'ACTION_PROOF_AMOUNT_MISMATCH: Montant discordant dans la preuve (% vs %)',
            v_amount, p_expected_amount;
    END IF;

    -- 9. Devise
    v_currency := upper(trim(COALESCE(p_proof->>'currency', '')));
    IF v_currency IS DISTINCT FROM upper(trim(p_expected_currency)) THEN
        RAISE EXCEPTION 'ACTION_PROOF_CURRENCY_MISMATCH: Devise discordante dans la preuve (% vs %)',
            v_currency, upper(trim(p_expected_currency));
    END IF;

    -- 10. Empreinte SHA-256 du justificatif
    v_doc_hash := lower(trim(COALESCE(p_proof->>'proof_document_hash', '')));
    IF v_doc_hash !~ '^[a-f0-9]{64}$' THEN
        RAISE EXCEPTION 'INVALID_ACTION_PROOF_DOC_HASH: Empreinte SHA-256 documentaire invalide';
    END IF;
    IF v_doc_hash IS DISTINCT FROM lower(trim(p_expected_doc_hash)) THEN
        RAISE EXCEPTION 'ACTION_PROOF_DOCUMENT_HASH_MISMATCH: Empreinte de justificatif discordante dans la preuve (% vs %)',
            v_doc_hash, lower(trim(p_expected_doc_hash));
    END IF;

    -- 11. Horodatages et validité temporelle (5 minutes max)
    v_issued_at_text := trim(COALESCE(p_proof->>'issued_at', ''));
    v_expires_at_text := trim(COALESCE(p_proof->>'expires_at', ''));
    BEGIN
        v_issued_at := v_issued_at_text::TIMESTAMPTZ;
        v_expires_at := v_expires_at_text::TIMESTAMPTZ;
    EXCEPTION
        WHEN OTHERS THEN
            RAISE EXCEPTION 'INVALID_ACTION_PROOF_TIMESTAMPS: Horodatages de la preuve invalides';
    END;

    IF v_expires_at < clock_timestamp() THEN
        RAISE EXCEPTION 'ACTION_PROOF_EXPIRED: Preuve d''action expiree a % (heure courante: %)',
            v_expires_at, clock_timestamp();
    END IF;

    IF v_issued_at > (clock_timestamp() + interval '30 seconds') THEN
        RAISE EXCEPTION 'ACTION_PROOF_FUTURE: Preuve d''action emise dans le futur (%)', v_issued_at;
    END IF;

    -- 12. Nonce unique (jti)
    v_jti_text := p_proof->>'jti';
    IF v_jti_text IS NULL OR v_jti_text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
        RAISE EXCEPTION 'INVALID_ACTION_PROOF_JTI: Nonce jti UUID valide requis';
    END IF;
    v_jti := v_jti_text::UUID;

    -- 13. Vérification de la signature cryptographique (HMAC-SHA256)
    v_signature := lower(trim(COALESCE(p_proof->>'signature', '')));
    IF v_signature !~ '^[a-f0-9]{64}$' THEN
        RAISE EXCEPTION 'INVALID_ACTION_PROOF_SIGNATURE: Format de signature invalide';
    END IF;

    SELECT secret_key, COALESCE(require_webauthn_confirmation, false)
    INTO v_secret, v_require_webauthn
    FROM yziow_refund_auth.authority_config
    WHERE id = true;

    IF v_secret IS NULL OR v_secret = '' THEN
        RAISE EXCEPTION 'AUTHORITY_KEY_NOT_CONFIGURED: Cle secrete de l''autorite de preuve non configuree';
    END IF;

    -- Reconstitution de la chaîne canonique exacte :
    -- v1|action_type|admin_id|period_id|reconciliation_id|provider_transaction_id|verified_amount_minor|currency|proof_document_hash|issued_at|expires_at|jti
    v_canonical := 'v1|' || v_action_type || '|' ||
                   lower(v_admin_id::text) || '|' ||
                   lower(v_period_id::text) || '|' ||
                   COALESCE(lower(v_rec_id::text), '') || '|' ||
                   v_tx_id || '|' ||
                   v_amount::text || '|' ||
                   v_currency || '|' ||
                   v_doc_hash || '|' ||
                   v_issued_at_text || '|' ||
                   v_expires_at_text || '|' ||
                   lower(v_jti::text);

    v_expected_sig := lower(encode(hmac(convert_to(v_canonical, 'utf8'), convert_to(v_secret, 'utf8'), 'sha256'), 'hex'));

    IF v_signature IS DISTINCT FROM v_expected_sig THEN
        RAISE EXCEPTION 'INVALID_ACTION_PROOF_SIGNATURE: Signature cryptographique de la preuve invalide (rejet fail-closed).';
    END IF;

    -- 13b. Chantier D.2.2 (P1 & P5) : Contre-vérification PostgreSQL indépendante du challenge WebAuthn
    --      Si l'administrateur possède un authentificateur WebAuthn actif, si require_webauthn_confirmation est actif,
    --      ou si la preuve contient un webauthn_challenge_id, PostgreSQL vérifie directement que le challenge WebAuthn
    --      a été réellement émis, consommé avec un authentificateur actif appartenant à ce SuperAdmin, et lié à ce dossier exact.
    --      Ainsi, même un backend compromis ne peut fabriquer une preuve acceptée par PostgreSQL sans assertion WebAuthn réelle.
    SELECT EXISTS (
        SELECT 1
        FROM public.superadmin_webauthn_credentials
        WHERE admin_id = v_admin_id
          AND is_active = true
          AND revoked_at IS NULL
    ) INTO v_admin_has_active_webauthn;

    v_webauthn_challenge_id_text := NULLIF(trim(COALESCE(p_proof->>'webauthn_challenge_id', '')), '');
    v_credential_id := NULLIF(trim(COALESCE(p_proof->>'credential_id', '')), '');
    v_webauthn_sig := lower(NULLIF(trim(COALESCE(p_proof->>'webauthn_signature', '')), ''));

    IF v_require_webauthn OR v_admin_has_active_webauthn OR v_webauthn_challenge_id_text IS NOT NULL THEN
        IF v_webauthn_challenge_id_text IS NULL
           OR v_webauthn_challenge_id_text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
           OR v_credential_id IS NULL THEN
            RAISE EXCEPTION 'WEBAUTHN_CONFIRMATION_REQUIRED: Une confirmation materielle WebAuthn valide et consommee est obligatoire pour cet administrateur (contournement HMAC seul interdit).';
        END IF;

        v_webauthn_challenge_id := v_webauthn_challenge_id_text::UUID;

        -- Chantier D.2.3 : liaison cryptographique obligatoire de webauthn_challenge_id et credential_id dans la signature d'autorité
        v_expected_webauthn_sig := lower(encode(hmac(
            convert_to(v_canonical || '|' || lower(v_webauthn_challenge_id::text) || '|' || v_credential_id, 'utf8'),
            convert_to(v_secret, 'utf8'),
            'sha256'
        ), 'hex'));
        IF v_webauthn_sig IS DISTINCT FROM v_expected_webauthn_sig THEN
            RAISE EXCEPTION 'INVALID_ACTION_PROOF_SIGNATURE: Signature cryptographique WebAuthn de la preuve invalide ou absente.';
        END IF;

        SELECT * INTO v_challenge_rec
        FROM yziow_refund_auth.webauthn_challenges
        WHERE challenge_id = v_webauthn_challenge_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'CHALLENGE_NOT_FOUND: Challenge WebAuthn (%) reference dans la preuve introuvable dans yziow_refund_auth.webauthn_challenges.', v_webauthn_challenge_id;
        END IF;

        IF v_challenge_rec.consumed_at IS NULL
           OR v_challenge_rec.consumed_by_credential_id IS DISTINCT FROM v_credential_id THEN
            RAISE EXCEPTION 'WEBAUTHN_CONFIRMATION_REQUIRED: Le challenge WebAuthn (%) n''a pas ete consomme par une assertion materielle valide.', v_webauthn_challenge_id;
        END IF;

        IF v_challenge_rec.admin_id IS DISTINCT FROM v_admin_id
           OR v_challenge_rec.action_type IS DISTINCT FROM v_action_type
           OR v_challenge_rec.period_id IS DISTINCT FROM v_period_id
           OR (v_action_type = 'approve' AND v_challenge_rec.reconciliation_id IS DISTINCT FROM v_rec_id)
           OR v_challenge_rec.provider_transaction_id IS DISTINCT FROM v_tx_id
           OR v_challenge_rec.verified_amount_minor IS DISTINCT FROM v_amount
           OR upper(trim(COALESCE(v_challenge_rec.currency, ''))) IS DISTINCT FROM v_currency
           OR lower(trim(COALESCE(v_challenge_rec.proof_document_hash, ''))) IS DISTINCT FROM v_doc_hash THEN
            RAISE EXCEPTION 'CHALLENGE_DOSSIER_MISMATCH: Le challenge WebAuthn consomme (%) ne correspond pas aux donnees exactes du dossier.', v_webauthn_challenge_id;
        END IF;

        SELECT * INTO v_cred_rec
        FROM public.superadmin_webauthn_credentials
        WHERE credential_id = v_credential_id
          AND admin_id = v_admin_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'CREDENTIAL_NOT_FOUND: Authentificateur WebAuthn (%) introuvable pour l''administrateur %.', v_credential_id, v_admin_id;
        END IF;

        IF v_cred_rec.is_active IS NOT TRUE OR v_cred_rec.revoked_at IS NOT NULL THEN
            RAISE EXCEPTION 'CREDENTIAL_REVOKED: L''authentificateur WebAuthn (%) a ete revoque.', v_credential_id;
        END IF;
    END IF;

    -- 14. Consommation atomique à usage unique (anti-rejeu)
    BEGIN
        INSERT INTO yziow_refund_auth.consumed_action_proofs (
            jti,
            admin_id,
            action_type,
            period_id,
            reconciliation_id,
            provider_transaction_id,
            verified_amount_minor,
            currency,
            proof_document_hash,
            webauthn_challenge_id,
            credential_id,
            issued_at,
            expires_at,
            consumed_at
        ) VALUES (
            v_jti,
            v_admin_id,
            v_action_type,
            v_period_id,
            v_rec_id,
            v_tx_id,
            v_amount,
            v_currency,
            v_doc_hash,
            v_webauthn_challenge_id,
            v_credential_id,
            v_issued_at,
            v_expires_at,
            clock_timestamp()
        );
    EXCEPTION
        WHEN unique_violation THEN
            RAISE EXCEPTION 'ACTION_PROOF_ALREADY_CONSUMED: La preuve d''action (%) ou son challenge WebAuthn a deja ete consomme. Rejeu interdit.', v_jti;
    END;

    RETURN v_admin_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION yziow_refund_auth.verify_and_consume_action_proof(JSONB, TEXT, UUID, UUID, UUID, TEXT, BIGINT, TEXT, TEXT) FROM PUBLIC, anon, authenticated, service_role, yziow_refund_executor, yziow_webauthn_authority;

-- ------------------------------------------------------------------------------
-- 0b. Verrou de sécurité fail-closed des trois garanties préalables à toute
--     compensation financière (Mission 1) :
--       1. Authentification indépendante des deux SuperAdmins
--       2. Preuve fournisseur FedaPay certifiée du remboursement
--       3. Stockage privé vérifiable du justificatif
--     Tant que ces trois garanties ne sont pas toutes actives (false par défaut),
--     admin_approve_parent_pack_refund_reconciliation et les triggers financiers
--     bloquent toute compensation en mode fail-closed (SECURITY_BLOCKER).
--     Aucun paramètre HTTP, UUID déclaré, rôle SQL applicatif (service_role,
--     yziow_refund_executor, authenticated, anon) ou variable de session (SET LOCAL)
--     ne peut modifier ou contourner cette table.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.parent_pack_refund_security_gate (
    id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id = true),
    independent_admin_auth_ready BOOLEAN NOT NULL DEFAULT false,
    independent_fedapay_proof_ready BOOLEAN NOT NULL DEFAULT false,
    private_worm_storage_ready BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE OR REPLACE FUNCTION public.fn_guard_parent_pack_refund_security_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_is_superuser BOOLEAN := false;
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'FAIL CLOSED: Suppression interdite sur parent_pack_refund_security_gate.';
    END IF;

    SELECT COALESCE(rolsuper, false)
    INTO v_is_superuser
    FROM pg_roles
    WHERE rolname = session_user;

    IF NOT v_is_superuser
       OR session_user IN ('yziow_refund_executor', 'yziow_webauthn_authority', 'service_role', 'authenticated', 'anon') THEN
        RAISE EXCEPTION 'SECURITY_BLOCKER: Modification du verrou de securite parent_pack_refund_security_gate strictement interdite pour le role applicatif (%).',
            session_user;
    END IF;

    NEW.updated_at := clock_timestamp();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_parent_pack_refund_security_gate ON public.parent_pack_refund_security_gate;
CREATE TRIGGER trg_guard_parent_pack_refund_security_gate
BEFORE INSERT OR UPDATE OR DELETE ON public.parent_pack_refund_security_gate
FOR EACH ROW EXECUTE FUNCTION public.fn_guard_parent_pack_refund_security_gate();

INSERT INTO public.parent_pack_refund_security_gate (
    id,
    independent_admin_auth_ready,
    independent_fedapay_proof_ready,
    private_worm_storage_ready
) VALUES (true, false, false, false)
ON CONFLICT (id) DO UPDATE
SET independent_admin_auth_ready = false,
    independent_fedapay_proof_ready = false,
    private_worm_storage_ready = false,
    updated_at = clock_timestamp();

ALTER TABLE public.parent_pack_refund_security_gate ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.parent_pack_refund_security_gate
    FROM PUBLIC, anon, authenticated, service_role, yziow_refund_executor, yziow_webauthn_authority;

-- ------------------------------------------------------------------------------
-- 1. Table de rapprochement administratif à double validation
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.parent_pack_refund_reconciliations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_id UUID NOT NULL REFERENCES public.parent_subscription_periods(id) ON DELETE RESTRICT,
    subscription_id UUID NOT NULL REFERENCES public.parent_subscriptions(id) ON DELETE RESTRICT,
    payment_intent_id UUID NOT NULL REFERENCES public.payment_intents(id) ON DELETE RESTRICT,
    internal_reconciliation_ref TEXT NOT NULL,
    provider_refund_id TEXT NULL,
    provider_transaction_id TEXT NOT NULL,
    verified_provider_status TEXT NOT NULL,
    verified_amount_minor BIGINT NOT NULL,
    verified_currency TEXT NOT NULL,
    initiator_admin_id UUID NOT NULL REFERENCES public.superadmins(id) ON DELETE RESTRICT,
    reason TEXT NOT NULL,
    proof_storage_path TEXT NOT NULL,
    proof_document_hash TEXT NOT NULL,
    proof_refunded_amount_minor BIGINT NOT NULL,
    proof_currency TEXT NOT NULL,
    proof_beneficiary_ref TEXT NOT NULL,
    proof_refunded_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending_approval',
    approver_admin_id UUID NULL REFERENCES public.superadmins(id) ON DELETE RESTRICT,
    approval_notes TEXT NULL,
    approved_at TIMESTAMPTZ NULL,
    initiator_action_proof JSONB NULL,
    approver_action_proof JSONB NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_refund_reconciliation_internal_ref UNIQUE (internal_reconciliation_ref),
    CONSTRAINT chk_refund_reconciliation_status CHECK (
        status IN ('pending_approval', 'completed', 'rejected')
    ),
    CONSTRAINT chk_refund_reconciliation_internal_ref CHECK (
        internal_reconciliation_ref ~ '^rec_[a-zA-Z0-9_-]{6,120}$'
    ),
    CONSTRAINT chk_refund_reconciliation_provider_refund_id CHECK (
        provider_refund_id IS NULL
        OR (
            length(trim(provider_refund_id)) >= 4
            AND provider_refund_id <> internal_reconciliation_ref
            AND provider_refund_id <> provider_transaction_id
        )
    ),
    CONSTRAINT chk_refund_reconciliation_verified_status CHECK (
        verified_provider_status = 'refunded'
    ),
    CONSTRAINT chk_refund_reconciliation_amounts_positive CHECK (
        verified_amount_minor > 0
        AND proof_refunded_amount_minor > 0
        AND verified_amount_minor = proof_refunded_amount_minor
    ),
    CONSTRAINT chk_refund_reconciliation_currencies CHECK (
        verified_currency = 'XOF'
        AND proof_currency = 'XOF'
    ),
    CONSTRAINT chk_refund_reconciliation_storage_path CHECK (
        proof_storage_path ~ '^private://[a-zA-Z0-9._/-]{8,}$'
    ),
    CONSTRAINT chk_refund_reconciliation_doc_hash CHECK (
        proof_document_hash ~ '^[a-fA-F0-9]{64}$'
    ),
    CONSTRAINT chk_refund_reconciliation_dual_custody CHECK (
        (status = 'pending_approval' AND approver_admin_id IS NULL AND approved_at IS NULL)
        OR (
            status IN ('completed', 'rejected')
            AND approver_admin_id IS NOT NULL
            AND approved_at IS NOT NULL
            AND approver_admin_id <> initiator_admin_id
        )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_refund_reconciliation_active_period
    ON public.parent_pack_refund_reconciliations (period_id)
    WHERE status IN ('pending_approval', 'completed');

CREATE UNIQUE INDEX IF NOT EXISTS uq_refund_reconciliation_provider_refund_id
    ON public.parent_pack_refund_reconciliations (provider_refund_id)
    WHERE provider_refund_id IS NOT NULL;

ALTER TABLE public.parent_pack_refund_reconciliations
    ADD COLUMN IF NOT EXISTS initiator_action_proof JSONB NULL,
    ADD COLUMN IF NOT EXISTS approver_action_proof JSONB NULL;

ALTER TABLE public.parent_pack_refund_reconciliations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.parent_pack_refund_reconciliations FROM PUBLIC, anon, authenticated, service_role, yziow_refund_executor, yziow_webauthn_authority;

-- Garde d'intégrité et d'immuabilité sur parent_pack_refund_reconciliations
CREATE OR REPLACE FUNCTION public.fn_guard_refund_reconciliation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'FAIL CLOSED: Suppression interdite sur la table de rapprochement des remboursements (%).', OLD.id;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF current_setting('yziow.reconciliation_step_active', true) IS DISTINCT FROM 'init' THEN
            RAISE EXCEPTION 'FAIL CLOSED: Insertion directe interdite sur parent_pack_refund_reconciliations. Utiliser admin_create_parent_pack_refund_reconciliation.';
        END IF;
        IF NEW.status IS DISTINCT FROM 'pending_approval'
           OR NEW.approver_admin_id IS NOT NULL
           OR NEW.approved_at IS NOT NULL THEN
            RAISE EXCEPTION 'FAIL CLOSED: Un dossier de rapprochement doit obligatoirement etre cree au statut pending_approval sans approbateur pre-rempli.';
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF current_setting('yziow.reconciliation_step_active', true) IS DISTINCT FROM 'approve' THEN
            RAISE EXCEPTION 'FAIL CLOSED: Modification directe interdite sur parent_pack_refund_reconciliations (%). Utiliser admin_approve_parent_pack_refund_reconciliation.', OLD.id;
        END IF;

        IF OLD.status IS DISTINCT FROM 'pending_approval' THEN
            RAISE EXCEPTION 'FAIL CLOSED: Le dossier de rapprochement (%) est deja finalise (%) et ne peut plus etre modifie.', OLD.id, OLD.status;
        END IF;

        IF NEW.id IS DISTINCT FROM OLD.id
           OR NEW.period_id IS DISTINCT FROM OLD.period_id
           OR NEW.subscription_id IS DISTINCT FROM OLD.subscription_id
           OR NEW.payment_intent_id IS DISTINCT FROM OLD.payment_intent_id
           OR NEW.internal_reconciliation_ref IS DISTINCT FROM OLD.internal_reconciliation_ref
           OR NEW.provider_refund_id IS DISTINCT FROM OLD.provider_refund_id
           OR NEW.provider_transaction_id IS DISTINCT FROM OLD.provider_transaction_id
           OR NEW.verified_provider_status IS DISTINCT FROM OLD.verified_provider_status
           OR NEW.verified_amount_minor IS DISTINCT FROM OLD.verified_amount_minor
           OR NEW.verified_currency IS DISTINCT FROM OLD.verified_currency
           OR NEW.initiator_admin_id IS DISTINCT FROM OLD.initiator_admin_id
           OR NEW.reason IS DISTINCT FROM OLD.reason
           OR NEW.proof_storage_path IS DISTINCT FROM OLD.proof_storage_path
           OR NEW.proof_document_hash IS DISTINCT FROM OLD.proof_document_hash
           OR NEW.proof_refunded_amount_minor IS DISTINCT FROM OLD.proof_refunded_amount_minor
           OR NEW.proof_currency IS DISTINCT FROM OLD.proof_currency
           OR NEW.proof_beneficiary_ref IS DISTINCT FROM OLD.proof_beneficiary_ref
           OR NEW.proof_refunded_at IS DISTINCT FROM OLD.proof_refunded_at
           OR NEW.created_at IS DISTINCT FROM OLD.created_at
           OR NEW.initiator_action_proof IS DISTINCT FROM OLD.initiator_action_proof THEN
            RAISE EXCEPTION 'FAIL CLOSED: Modification des donnees d''initiation ou des preuves interdite sur le dossier de rapprochement (%).', OLD.id;
        END IF;

        IF NEW.approver_admin_id IS NULL OR NEW.approver_admin_id = OLD.initiator_admin_id THEN
            RAISE EXCEPTION 'DUAL_CUSTODY_VIOLATION: L''approbateur doit etre renseigne et distinct de l''initiateur sur le dossier (%).', OLD.id;
        END IF;

        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_parent_pack_refund_reconciliations ON public.parent_pack_refund_reconciliations;
CREATE TRIGGER trg_guard_parent_pack_refund_reconciliations
BEFORE INSERT OR UPDATE OR DELETE ON public.parent_pack_refund_reconciliations
FOR EACH ROW EXECUTE FUNCTION public.fn_guard_refund_reconciliation();

-- ------------------------------------------------------------------------------
-- 2. Table d'audit immuable des remboursements Parent Pack
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.parent_pack_refund_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reconciliation_id UUID NOT NULL REFERENCES public.parent_pack_refund_reconciliations(id) ON DELETE RESTRICT,
    period_id UUID NOT NULL REFERENCES public.parent_subscription_periods(id) ON DELETE RESTRICT,
    subscription_id UUID NOT NULL REFERENCES public.parent_subscriptions(id) ON DELETE RESTRICT,
    payment_intent_id UUID NOT NULL REFERENCES public.payment_intents(id) ON DELETE RESTRICT,
    internal_reconciliation_ref TEXT NOT NULL,
    provider_refund_id TEXT NULL,
    provider_transaction_id TEXT NOT NULL,
    admin_actor_id UUID NOT NULL REFERENCES public.superadmins(id) ON DELETE RESTRICT,
    initiator_admin_id UUID NOT NULL REFERENCES public.superadmins(id) ON DELETE RESTRICT,
    approver_admin_id UUID NOT NULL REFERENCES public.superadmins(id) ON DELETE RESTRICT,
    reason TEXT NOT NULL,
    approval_notes TEXT NULL,
    proof_storage_path TEXT NOT NULL,
    proof_document_hash TEXT NOT NULL,
    proof_refunded_amount_minor BIGINT NOT NULL,
    proof_currency TEXT NOT NULL,
    proof_beneficiary_ref TEXT NOT NULL,
    proof_refunded_at TIMESTAMPTZ NOT NULL,
    gross_amount_minor BIGINT NOT NULL,
    school_share_minor BIGINT NOT NULL,
    ambassador_share_minor BIGINT NOT NULL,
    yziow_share_minor BIGINT NOT NULL,
    deducted_from_pending_minor BIGINT NOT NULL DEFAULT 0,
    deducted_from_available_minor BIGINT NOT NULL DEFAULT 0,
    added_to_debt_minor BIGINT NOT NULL DEFAULT 0,
    initiator_action_proof JSONB NULL,
    approver_action_proof JSONB NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_parent_pack_refund_period UNIQUE (period_id),
    CONSTRAINT uq_parent_pack_refund_reconciliation UNIQUE (reconciliation_id),
    CONSTRAINT uq_parent_pack_refund_internal_ref UNIQUE (internal_reconciliation_ref),
    CONSTRAINT chk_parent_pack_refund_dual_custody CHECK (initiator_admin_id <> approver_admin_id),
    CONSTRAINT chk_parent_pack_refund_doc_hash CHECK (proof_document_hash ~ '^[a-fA-F0-9]{64}$'),
    CONSTRAINT chk_parent_pack_refund_storage CHECK (proof_storage_path ~ '^private://[a-zA-Z0-9._/-]{8,}$'),
    CONSTRAINT chk_parent_pack_refund_amounts CHECK (
        gross_amount_minor > 0 AND proof_refunded_amount_minor = gross_amount_minor
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_parent_pack_refund_provider
    ON public.parent_pack_refund_audits (provider_refund_id)
    WHERE provider_refund_id IS NOT NULL;

ALTER TABLE public.parent_pack_refund_audits
    ADD COLUMN IF NOT EXISTS initiator_action_proof JSONB NULL,
    ADD COLUMN IF NOT EXISTS approver_action_proof JSONB NULL;

ALTER TABLE public.parent_pack_refund_audits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.parent_pack_refund_audits FROM PUBLIC, anon, authenticated, service_role, yziow_refund_executor, yziow_webauthn_authority;

-- Immuabilité stricte de la piste d'audit (append-only + insertion contrôlée)
CREATE OR REPLACE FUNCTION public.fn_prevent_refund_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF current_setting('yziow.certified_refund_active', true) IS DISTINCT FROM 'true'
           OR current_setting('yziow.reconciliation_step_active', true) IS DISTINCT FROM 'approve' THEN
            RAISE EXCEPTION 'FAIL CLOSED: Insertion directe interdite sur la table d''audit des remboursements.';
        END IF;
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'FAIL CLOSED: Modification ou suppression interdite sur la table d''audit des remboursements (%).', OLD.id;
END;
$$;

DROP TRIGGER IF EXISTS trg_immutable_parent_pack_refund_audits ON public.parent_pack_refund_audits;
CREATE TRIGGER trg_immutable_parent_pack_refund_audits
BEFORE INSERT OR UPDATE OR DELETE ON public.parent_pack_refund_audits
FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_refund_audit_mutation();

-- Mise à niveau des contraintes sur payment_intents pour supporter l'état 'refunded'
ALTER TABLE public.payment_intents
    DROP CONSTRAINT IF EXISTS chk_payment_intents_status;

ALTER TABLE public.payment_intents
    ADD CONSTRAINT chk_payment_intents_status
    CHECK (status = ANY (ARRAY['initializing'::text, 'pending'::text, 'completed'::text, 'cancelled'::text, 'reconciliation_required'::text, 'refunded'::text]));

ALTER TABLE public.payment_intents
    DROP CONSTRAINT IF EXISTS chk_payment_intents_processed_at;

ALTER TABLE public.payment_intents
    ADD CONSTRAINT chk_payment_intents_processed_at
    CHECK (
        ((status IN ('completed'::text, 'refunded'::text)) AND (processed_at IS NOT NULL))
        OR ((status NOT IN ('completed'::text, 'refunded'::text)) AND (processed_at IS NULL))
    );

-- ------------------------------------------------------------------------------
-- 3. Mise à jour de validate_parent_pack_intent() :
--    Exige le parcours à double validation complet (impossible à contourner par
--    simple variable de session).
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_parent_pack_intent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_intent RECORD;
BEGIN
    IF NEW.payment_intent_id IS NULL THEN
        RAISE EXCEPTION 'FAIL CLOSED: payment_intent_id est obligatoire pour toute periode Parent Pack.';
    END IF;

    IF NEW.subscription_id IS NULL THEN
        RAISE EXCEPTION 'FAIL CLOSED: subscription_id est obligatoire pour toute periode Parent Pack.';
    END IF;

    -- Verrouillage de l'intention de paiement pour éviter toute course concurrente
    SELECT id, payment_type, target_id, status, processed_at, school_slug, expected_amount, expected_currency, provider_transaction_id, metadata
    INTO v_intent
    FROM public.payment_intents
    WHERE id = NEW.payment_intent_id
    FOR KEY SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'FAIL CLOSED: payment_intent (%) introuvable pour la periode.', NEW.payment_intent_id;
    END IF;

    IF v_intent.payment_type IS DISTINCT FROM 'parent_pack' THEN
        RAISE EXCEPTION 'FAIL CLOSED: payment_intent (%) a un payment_type invalide (%). Attendu: parent_pack.',
            NEW.payment_intent_id, v_intent.payment_type;
    END IF;

    IF v_intent.target_id IS DISTINCT FROM NEW.subscription_id::text THEN
        RAISE EXCEPTION 'FAIL CLOSED: payment_intent (%) cible (%) mais la periode appartient a la souscription (%).',
            NEW.payment_intent_id, v_intent.target_id, NEW.subscription_id;
    END IF;

    -- --------------------------------------------------------------------------
    -- Règles à l'INSERTION d'une période
    -- --------------------------------------------------------------------------
    IF TG_OP = 'INSERT' THEN
        IF NEW.status = 'pending_payment' THEN
            IF v_intent.status NOT IN ('initializing', 'pending', 'completed') THEN
                RAISE EXCEPTION 'FAIL CLOSED: Impossible de creer une periode pending_payment avec un payment_intent au statut (%).',
                    v_intent.status;
            END IF;
        ELSIF NEW.status = 'active' THEN
            IF v_intent.status IS DISTINCT FROM 'completed' OR v_intent.processed_at IS NULL THEN
                RAISE EXCEPTION 'FAIL CLOSED: Impossible d''inserer une periode active tant que payment_intent (%) n''est pas completed avec processed_at non nul (statut actuel: %).',
                    NEW.payment_intent_id, v_intent.status;
            END IF;
        ELSE
            RAISE EXCEPTION 'FAIL CLOSED: Statut initial de periode (%) interdit a l''insertion. Seuls pending_payment et active sont autorises.',
                NEW.status;
        END IF;

        RETURN NEW;
    END IF;

    -- --------------------------------------------------------------------------
    -- Règles à la MISE À JOUR (UPDATE) d'une période
    -- --------------------------------------------------------------------------
    IF TG_OP = 'UPDATE' THEN
        -- Interdiction absolue de modifier le rattachement d'une période existante
        IF NEW.subscription_id IS DISTINCT FROM OLD.subscription_id THEN
            RAISE EXCEPTION 'FAIL CLOSED: Modification de subscription_id interdite sur parent_subscription_periods (% -> %).',
                OLD.subscription_id, NEW.subscription_id;
        END IF;

        IF NEW.payment_intent_id IS DISTINCT FROM OLD.payment_intent_id THEN
            RAISE EXCEPTION 'FAIL CLOSED: Modification de payment_intent_id interdite sur parent_subscription_periods (% -> %).',
                OLD.payment_intent_id, NEW.payment_intent_id;
        END IF;

        -- Interdiction de modifier les dates d'une période déjà payée / activée
        IF OLD.status IN ('active', 'expired', 'refunded') THEN
            IF NEW.start_date IS DISTINCT FROM OLD.start_date
               OR NEW.end_date IS DISTINCT FROM OLD.end_date THEN
                RAISE EXCEPTION 'FAIL CLOSED: Modification des dates (start_date/end_date) interdite sur une periode au statut (%).',
                    OLD.status;
            END IF;
        END IF;

        -- Cas où le statut ne change pas
        IF NEW.status = OLD.status THEN
            IF NEW.status IN ('active', 'expired', 'refunded') THEN
                IF v_intent.status NOT IN ('completed', 'refunded') OR v_intent.processed_at IS NULL THEN
                    RAISE EXCEPTION 'FAIL CLOSED: Une periode au statut (%) exige un payment_intent completed avec processed_at non nul.',
                        NEW.status;
                END IF;
            END IF;
            RETURN NEW;
        END IF;

        -- Transitions de statut autorisées
        IF OLD.status = 'pending_payment' AND NEW.status = 'active' THEN
            IF v_intent.status IS DISTINCT FROM 'completed' OR v_intent.processed_at IS NULL THEN
                RAISE EXCEPTION 'FAIL CLOSED: Transition pending_payment -> active refusee car payment_intent (%) n''est pas completed (statut: %).',
                    NEW.payment_intent_id, v_intent.status;
            END IF;
            RETURN NEW;

        ELSIF OLD.status = 'pending_payment' AND NEW.status = 'canceled' THEN
            IF v_intent.status = 'completed' THEN
                RAISE EXCEPTION 'FAIL CLOSED: Transition pending_payment -> canceled refusee car payment_intent (%) est deja completed.',
                    NEW.payment_intent_id;
            END IF;
            RETURN NEW;

        ELSIF OLD.status = 'active' AND NEW.status = 'expired' THEN
            IF v_intent.status IS DISTINCT FROM 'completed' OR v_intent.processed_at IS NULL THEN
                RAISE EXCEPTION 'FAIL CLOSED: Transition active -> expired refusee car payment_intent (%) n''est pas completed.',
                    NEW.payment_intent_id;
            END IF;
            RETURN NEW;

        ELSIF OLD.status IN ('active', 'expired') AND NEW.status = 'refunded' THEN
            -- Lot P28c : La transition vers 'refunded' exige cumulativement :
            -- 1. Le contexte d'approbation certifié actif
            IF current_setting('yziow.certified_refund_active', true) IS DISTINCT FROM 'true'
               OR current_setting('yziow.reconciliation_step_active', true) IS DISTINCT FROM 'approve' THEN
                RAISE EXCEPTION 'FAIL CLOSED: Transition vers refunded interdite par operation SQL ordinaire ou variable de session isolee. Seule la RPC d''approbation a double validation est autorisee.';
            END IF;

            -- 2. Les trois garanties de sécurité préalables actives dans parent_pack_refund_security_gate
            IF NOT EXISTS (
                SELECT 1
                FROM public.parent_pack_refund_security_gate
                WHERE id = true
                  AND independent_admin_auth_ready = true
                  AND independent_fedapay_proof_ready = true
                  AND private_worm_storage_ready = true
            ) THEN
                RAISE EXCEPTION 'SECURITY_BLOCKER (FAIL CLOSED): Transition vers refunded verrouillee tant que les trois garanties de securite (authentification independante des deux SuperAdmins, preuve fournisseur FedaPay certifiee, stockage prive verifiable) ne sont pas operationnelles.';
            END IF;

            -- 2. Un dossier de rapprochement 'completed' à double signature ET une piste d'audit concordante
            IF NOT EXISTS (
                SELECT 1
                FROM public.parent_pack_refund_audits a
                JOIN public.parent_pack_refund_reconciliations r
                  ON r.id = a.reconciliation_id
                WHERE a.period_id = NEW.id
                  AND a.payment_intent_id = NEW.payment_intent_id
                  AND r.period_id = NEW.id
                  AND r.payment_intent_id = NEW.payment_intent_id
                  AND r.status = 'completed'
                  AND r.initiator_admin_id <> r.approver_admin_id
                  AND a.initiator_admin_id = r.initiator_admin_id
                  AND a.approver_admin_id = r.approver_admin_id
                  AND a.proof_document_hash = r.proof_document_hash
                  AND a.proof_refunded_amount_minor = v_intent.expected_amount
            ) THEN
                RAISE EXCEPTION 'FAIL CLOSED: Transition vers refunded refusee : aucune piste d''audit et de rapprochement a double validation valide pour la periode (%).', NEW.id;
            END IF;

            -- 3. Le payment_intent doit avoir été initialement completed
            IF v_intent.status NOT IN ('completed', 'refunded') OR v_intent.processed_at IS NULL THEN
                RAISE EXCEPTION 'FAIL CLOSED: Transition vers refunded refusee car payment_intent (%) n''est pas completed.',
                    NEW.payment_intent_id;
            END IF;

            RETURN NEW;

        ELSE
            RAISE EXCEPTION 'FAIL CLOSED: Transition de statut de periode non autorisee (% -> %).',
                OLD.status, NEW.status;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. Mise à jour du trigger d'intégrité sur payment_intents (P28c)
--    Exige également le dossier de rapprochement 'completed' à double signature
--    et l'entrée d'audit immuable concordante.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_parent_pack_intent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_has_any_period BOOLEAN := false;
    v_has_paid_period BOOLEAN := false;
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.payment_type = 'parent_pack' THEN
            SELECT EXISTS (
                SELECT 1
                FROM public.parent_subscription_periods
                WHERE payment_intent_id = OLD.id
            ) INTO v_has_any_period;

            IF OLD.status = 'completed' OR v_has_any_period THEN
                RAISE EXCEPTION 'FAIL CLOSED: Suppression interdite d''un payment_intent Parent Pack (%) completed ou rattache a une periode.',
                    OLD.id;
            END IF;
        END IF;
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- Interdire le changement de payment_type depuis ou vers parent_pack
        IF OLD.payment_type = 'parent_pack' OR NEW.payment_type = 'parent_pack' THEN
            IF NEW.payment_type IS DISTINCT FROM OLD.payment_type THEN
                RAISE EXCEPTION 'FAIL CLOSED: Modification de payment_type interdite (% -> %) sur payment_intent (%).',
                    OLD.payment_type, NEW.payment_type, OLD.id;
            END IF;
        END IF;

        IF OLD.payment_type = 'parent_pack' THEN
            SELECT
                EXISTS (
                    SELECT 1
                    FROM public.parent_subscription_periods
                    WHERE payment_intent_id = OLD.id
                ),
                EXISTS (
                    SELECT 1
                    FROM public.parent_subscription_periods
                    WHERE payment_intent_id = OLD.id
                      AND status IN ('active', 'expired', 'refunded')
                )
            INTO v_has_any_period, v_has_paid_period;

            -- Dès que le paiement est complété OU qu'une période (même pending_payment) y est rattachée,
            -- les champs financiers et de rattachement sont figés.
            IF OLD.status = 'completed' OR v_has_any_period THEN
                IF NEW.target_id IS DISTINCT FROM OLD.target_id
                   OR NEW.expected_amount IS DISTINCT FROM OLD.expected_amount
                   OR NEW.expected_currency IS DISTINCT FROM OLD.expected_currency
                   OR NEW.school_slug IS DISTINCT FROM OLD.school_slug THEN
                    RAISE EXCEPTION 'FAIL CLOSED: Modification des champs financiers ou de rattachement (target_id, expected_amount, expected_currency, school_slug) interdite sur payment_intent (%).',
                        OLD.id;
                END IF;
            END IF;

            -- Une fois le paiement complété OU rattaché à une période payée (active, expired, refunded)
            IF OLD.status = 'completed' OR v_has_paid_period THEN
                IF NEW.status IS DISTINCT FROM 'completed' THEN
                    IF NEW.status = 'refunded' THEN
                        -- Autorisé UNIQUEMENT lorsque les 3 garanties de sécurité sont actives ET dans le cadre de l'approbation à double validation
                        IF current_setting('yziow.certified_refund_active', true) IS DISTINCT FROM 'true'
                           OR current_setting('yziow.reconciliation_step_active', true) IS DISTINCT FROM 'approve' THEN
                            RAISE EXCEPTION 'FAIL CLOSED: Transition vers refunded sur payment_intent interdite par operation SQL ordinaire ou variable de session isolee. Seule la RPC d''approbation a double validation est autorisee.';
                        END IF;

                        IF NOT EXISTS (
                            SELECT 1
                            FROM public.parent_pack_refund_security_gate
                            WHERE id = true
                              AND independent_admin_auth_ready = true
                              AND independent_fedapay_proof_ready = true
                              AND private_worm_storage_ready = true
                        ) THEN
                            RAISE EXCEPTION 'SECURITY_BLOCKER (FAIL CLOSED): Transition vers refunded sur payment_intent verrouillee tant que les trois garanties de securite (authentification independante des deux SuperAdmins, preuve fournisseur FedaPay certifiee, stockage prive verifiable) ne sont pas operationnelles.';
                        END IF;
                        IF NOT EXISTS (
                            SELECT 1
                            FROM public.parent_pack_refund_audits a
                            JOIN public.parent_pack_refund_reconciliations r
                              ON r.id = a.reconciliation_id
                            WHERE a.payment_intent_id = NEW.id
                              AND r.payment_intent_id = NEW.id
                              AND r.status = 'completed'
                              AND r.initiator_admin_id <> r.approver_admin_id
                              AND a.initiator_admin_id = r.initiator_admin_id
                              AND a.approver_admin_id = r.approver_admin_id
                              AND a.proof_refunded_amount_minor = OLD.expected_amount
                        ) THEN
                            RAISE EXCEPTION 'FAIL CLOSED: Transition vers refunded refusee : aucune piste d''audit et de rapprochement a double validation valide pour payment_intent (%).', NEW.id;
                        END IF;
                    ELSE
                        RAISE EXCEPTION 'FAIL CLOSED: Retrogradation ou changement de statut interdit sur un payment_intent Parent Pack completed (% -> %).',
                            OLD.status, NEW.status;
                    END IF;
                END IF;

                IF OLD.processed_at IS NOT NULL AND NEW.processed_at IS DISTINCT FROM OLD.processed_at THEN
                    RAISE EXCEPTION 'FAIL CLOSED: Modification de processed_at interdite sur un payment_intent Parent Pack completed (%).',
                        OLD.id;
                END IF;

                IF OLD.provider_transaction_id IS NOT NULL
                   AND NEW.provider_transaction_id IS DISTINCT FROM OLD.provider_transaction_id THEN
                    RAISE EXCEPTION 'FAIL CLOSED: Modification de provider_transaction_id interdite sur un payment_intent Parent Pack completed (%).',
                        OLD.id;
                END IF;

                IF NEW.metadata IS DISTINCT FROM OLD.metadata THEN
                    RAISE EXCEPTION 'FAIL CLOSED: Modification de metadata interdite sur un payment_intent Parent Pack completed (%).',
                        OLD.id;
                END IF;
            END IF;
        END IF;

        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. Verrouillage FAIL-CLOSED de l'ancienne RPC unilatérale à 4 arguments :
--    Empêche toute compensation financière automatique déclenchée à partir
--    d'une simple référence déclarative.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_process_parent_pack_refund(
    p_period_id UUID,
    p_provider_refund_id TEXT,
    p_admin_actor_id UUID,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RAISE EXCEPTION 'SECURITY_BLOCKER: La compensation financiere automatique sur simple reference declarative (%) est desactivee (fail-closed). Utiliser le rapprochement a double validation SuperAdmin (admin_create_parent_pack_refund_reconciliation puis admin_approve_parent_pack_refund_reconciliation) avec justificatif verifie.',
        COALESCE(p_provider_refund_id, 'NULL');
END;
$$;

-- ------------------------------------------------------------------------------
-- 6. Étape 1 du rapprochement : Initiation par un premier SuperAdmin authentifié
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_create_parent_pack_refund_reconciliation(UUID, UUID, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.admin_create_parent_pack_refund_reconciliation(
    p_period_id UUID,
    p_initiator_admin_id UUID,
    p_reason TEXT,
    p_verified_transaction_id TEXT,
    p_verified_provider_status TEXT,
    p_verified_amount_minor BIGINT,
    p_verified_currency TEXT,
    p_proof_storage_path TEXT,
    p_proof_document_hash TEXT,
    p_proof_refunded_amount_minor BIGINT,
    p_proof_currency TEXT,
    p_proof_beneficiary_ref TEXT,
    p_proof_refunded_at TIMESTAMPTZ,
    p_internal_reconciliation_ref TEXT DEFAULT NULL,
    p_provider_refund_id TEXT DEFAULT NULL,
    p_initiator_action_proof JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_initiator_name TEXT;
    v_period RECORD;
    v_sub RECORD;
    v_intent RECORD;
    v_existing_rec RECORD;
    v_existing_audit RECORD;
    v_internal_ref TEXT;
    v_provider_refund_id TEXT;
    v_reconciliation_id UUID;
BEGIN
    -- 1. Validation des arguments obligatoires
    IF p_period_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: period_id est obligatoire';
    END IF;

    IF p_initiator_admin_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: initiator_admin_id est obligatoire';
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: reason est obligatoire';
    END IF;

    -- 2. Authentification du SuperAdmin initiateur
    SELECT username INTO v_initiator_name
    FROM public.superadmins
    WHERE id = p_initiator_admin_id AND is_active = true;

    IF v_initiator_name IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED_ADMIN: SuperAdmin initiateur % introuvable ou non autorise', p_initiator_admin_id;
    END IF;

    -- 3. Verrou consultatif transactionnel sur la période
    PERFORM pg_advisory_xact_lock(hashtext('parent_pack_refund_' || p_period_id::text));

    -- 4. Verrouillage de la période, de la souscription et de l'intention de paiement
    SELECT * INTO v_period
    FROM public.parent_subscription_periods
    WHERE id = p_period_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PERIOD_NOT_FOUND: Periode % introuvable', p_period_id;
    END IF;

    SELECT * INTO v_sub
    FROM public.parent_subscriptions
    WHERE id = v_period.subscription_id
    FOR UPDATE;

    SELECT * INTO v_intent
    FROM public.payment_intents
    WHERE id = v_period.payment_intent_id
    FOR UPDATE;

    -- 5. Si la période est déjà remboursée, retourner l'état idempotent
    IF v_period.status = 'refunded' THEN
        SELECT * INTO v_existing_audit
        FROM public.parent_pack_refund_audits
        WHERE period_id = p_period_id;

        RETURN jsonb_build_object(
            'status', 'already_refunded',
            'period_id', p_period_id,
            'reconciliation_id', v_existing_audit.reconciliation_id,
            'internal_reconciliation_ref', v_existing_audit.internal_reconciliation_ref,
            'refund_audit_id', v_existing_audit.id,
            'provider_refund_id', v_existing_audit.provider_refund_id,
            'message', 'Cette periode a deja ete remboursee et compensee.'
        );
    END IF;

    IF v_period.status NOT IN ('active', 'expired') THEN
        RAISE EXCEPTION 'INVALID_PERIOD_STATUS: Seules les periodes active ou expired peuvent faire l''objet d''un rapprochement (statut actuel: %)', v_period.status;
    END IF;

    IF v_intent.status IS DISTINCT FROM 'completed' OR v_intent.processed_at IS NULL THEN
        RAISE EXCEPTION 'INTENT_NOT_COMPLETED: Impossible d''initier un remboursement pour une periode dont le payment_intent (%) n''est pas completed', v_intent.id;
    END IF;

    -- 6. Vérification fail-closed des données FedaPay observées
    IF p_verified_transaction_id IS NULL OR trim(p_verified_transaction_id) = ''
       OR trim(p_verified_transaction_id) IS DISTINCT FROM v_intent.provider_transaction_id THEN
        RAISE EXCEPTION 'PROOF_TRANSACTION_MISMATCH: L''identifiant de transaction verifie (%) ne correspond pas au provider_transaction_id d''origine (%)',
            COALESCE(p_verified_transaction_id, 'NULL'), COALESCE(v_intent.provider_transaction_id, 'NULL');
    END IF;

    IF p_verified_provider_status IS DISTINCT FROM 'refunded' THEN
        RAISE EXCEPTION 'PROVIDER_STATUS_NOT_REFUNDED: Le statut FedaPay verifie doit etre refunded (recu: %)',
            COALESCE(p_verified_provider_status, 'NULL');
    END IF;

    IF p_verified_amount_minor IS NULL OR p_verified_amount_minor <= 0
       OR p_verified_amount_minor IS DISTINCT FROM v_intent.expected_amount THEN
        RAISE EXCEPTION 'PROOF_AMOUNT_MISMATCH: Le montant verifie aupres du fournisseur (%) ne correspond pas au montant attendu de l''intention (%)',
            COALESCE(p_verified_amount_minor, -1), v_intent.expected_amount;
    END IF;

    IF p_verified_currency IS NULL OR trim(p_verified_currency) IS DISTINCT FROM v_intent.expected_currency
       OR trim(p_verified_currency) IS DISTINCT FROM 'XOF' THEN
        RAISE EXCEPTION 'PROOF_CURRENCY_MISMATCH: La devise verifiee (%) ne correspond pas a la devise attendue (%)',
            COALESCE(p_verified_currency, 'NULL'), v_intent.expected_currency;
    END IF;

    -- 7. Vérification fail-closed du justificatif indépendant (stockage privé, SHA-256, montant, devise, bénéficiaire, date)
    IF p_proof_storage_path IS NULL OR trim(p_proof_storage_path) !~ '^private://[a-zA-Z0-9._/-]{8,}$' THEN
        RAISE EXCEPTION 'INVALID_PROOF_STORAGE_PATH: Le chemin de conservation du justificatif (%) doit pointer vers un stockage prive immuable (private://...)',
            COALESCE(p_proof_storage_path, 'NULL');
    END IF;

    IF p_proof_document_hash IS NULL OR trim(p_proof_document_hash) !~ '^[a-fA-F0-9]{64}$' THEN
        RAISE EXCEPTION 'INVALID_PROOF_HASH: L''empreinte cryptographique SHA-256 du justificatif est absente ou invalide';
    END IF;

    IF p_proof_refunded_amount_minor IS NULL OR p_proof_refunded_amount_minor <= 0
       OR p_proof_refunded_amount_minor IS DISTINCT FROM v_intent.expected_amount
       OR p_proof_refunded_amount_minor IS DISTINCT FROM p_verified_amount_minor THEN
        RAISE EXCEPTION 'PROOF_AMOUNT_MISMATCH: Le montant rembourse atteste sur le justificatif (%) ne correspond pas au montant de la transaction (%)',
            COALESCE(p_proof_refunded_amount_minor, -1), v_intent.expected_amount;
    END IF;

    IF p_proof_currency IS NULL OR trim(p_proof_currency) IS DISTINCT FROM v_intent.expected_currency
       OR trim(p_proof_currency) IS DISTINCT FROM 'XOF' THEN
        RAISE EXCEPTION 'PROOF_CURRENCY_MISMATCH: La devise du justificatif (%) ne correspond pas a la devise de la transaction (%)',
            COALESCE(p_proof_currency, 'NULL'), v_intent.expected_currency;
    END IF;

    IF p_proof_beneficiary_ref IS NULL OR trim(p_proof_beneficiary_ref) = ''
       OR trim(p_proof_beneficiary_ref) IS DISTINCT FROM v_sub.parent_ref THEN
        RAISE EXCEPTION 'PROOF_BENEFICIARY_MISMATCH: Le beneficiaire du justificatif (%) ne correspond pas au parent titulaire de la souscription (%)',
            COALESCE(p_proof_beneficiary_ref, 'NULL'), v_sub.parent_ref;
    END IF;

    IF p_proof_refunded_at IS NULL
       OR p_proof_refunded_at < v_intent.processed_at
       OR p_proof_refunded_at > (clock_timestamp() + interval '5 minutes') THEN
        RAISE EXCEPTION 'PROOF_DATE_INVALID: La date du remboursement sur le justificatif (%) est incoherente avec la date de paiement initial (%)',
            COALESCE(p_proof_refunded_at::text, 'NULL'), COALESCE(v_intent.processed_at::text, 'NULL');
    END IF;

    -- 8. Vérification et consommation atomique de la preuve d'action de l'initiateur (Chantier D.2)
    --    Tout appel doit impérativement fournir une preuve d'action valide, non expirée et non rejouée.
    PERFORM yziow_refund_auth.verify_and_consume_action_proof(
        p_initiator_action_proof,
        'initiate'::TEXT,
        p_initiator_admin_id,
        p_period_id,
        NULL::UUID,
        v_intent.provider_transaction_id,
        v_intent.expected_amount::BIGINT,
        v_intent.expected_currency,
        p_proof_document_hash
    );

    -- 8b. Vérification d'un dossier pending_approval existant pour cette période
    SELECT * INTO v_existing_rec
    FROM public.parent_pack_refund_reconciliations
    WHERE period_id = p_period_id
      AND status = 'pending_approval';

    IF FOUND THEN
        IF v_existing_rec.initiator_admin_id = p_initiator_admin_id
           AND v_existing_rec.proof_document_hash = lower(trim(p_proof_document_hash))
           AND v_existing_rec.proof_refunded_amount_minor = p_proof_refunded_amount_minor
           AND v_existing_rec.proof_beneficiary_ref = trim(p_proof_beneficiary_ref) THEN
            RETURN jsonb_build_object(
                'status', 'pending_approval',
                'reconciliation_id', v_existing_rec.id,
                'internal_reconciliation_ref', v_existing_rec.internal_reconciliation_ref,
                'provider_refund_id', v_existing_rec.provider_refund_id,
                'period_id', p_period_id,
                'subscription_id', v_sub.id,
                'payment_intent_id', v_intent.id,
                'initiator_admin_id', v_existing_rec.initiator_admin_id
            );
        ELSE
            RAISE EXCEPTION 'RECONCILIATION_ALREADY_PENDING: Un dossier de rapprochement (%) est deja en attente d''approbation pour la periode %',
                v_existing_rec.id, p_period_id;
        END IF;
    END IF;

    -- 9. Normalisation et distinction explicite des références
    IF p_internal_reconciliation_ref IS NULL OR trim(p_internal_reconciliation_ref) = '' THEN
        v_internal_ref := 'rec_p28c_' || replace(gen_random_uuid()::text, '-', '');
    ELSE
        v_internal_ref := trim(p_internal_reconciliation_ref);
    END IF;

    IF v_internal_ref !~ '^rec_[a-zA-Z0-9_-]{6,120}$' THEN
        RAISE EXCEPTION 'INVALID_INTERNAL_RECONCILIATION_REF: L''identifiant interne de rapprochement (%) doit commencer par rec_ et respecter le format attendu',
            v_internal_ref;
    END IF;

    IF p_provider_refund_id IS NULL OR trim(p_provider_refund_id) = '' THEN
        v_provider_refund_id := NULL;
    ELSE
        v_provider_refund_id := trim(p_provider_refund_id);
        IF length(v_provider_refund_id) < 4
           OR v_provider_refund_id = v_internal_ref
           OR v_provider_refund_id = v_intent.provider_transaction_id THEN
            RAISE EXCEPTION 'INVALID_PROVIDER_REFUND_ID: La reference fournisseur de remboursement (%) est invalide ou confondue avec la transaction / reference interne',
                v_provider_refund_id;
        END IF;

        IF EXISTS (
            SELECT 1 FROM public.parent_pack_refund_audits WHERE provider_refund_id = v_provider_refund_id
        ) OR EXISTS (
            SELECT 1 FROM public.parent_pack_refund_reconciliations WHERE provider_refund_id = v_provider_refund_id
        ) THEN
            RAISE EXCEPTION 'DUPLICATE_PROVIDER_REFUND_ID: Le provider_refund_id (%) a deja ete utilise pour un autre remboursement',
                v_provider_refund_id;
        END IF;
    END IF;

    -- 10. Insertion contrôlée du dossier de rapprochement au statut 'pending_approval'
    PERFORM set_config('yziow.reconciliation_step_active', 'init', true);

    INSERT INTO public.parent_pack_refund_reconciliations (
        period_id,
        subscription_id,
        payment_intent_id,
        internal_reconciliation_ref,
        provider_refund_id,
        provider_transaction_id,
        verified_provider_status,
        verified_amount_minor,
        verified_currency,
        initiator_admin_id,
        reason,
        proof_storage_path,
        proof_document_hash,
        proof_refunded_amount_minor,
        proof_currency,
        proof_beneficiary_ref,
        proof_refunded_at,
        status,
        initiator_action_proof
    ) VALUES (
        p_period_id,
        v_sub.id,
        v_intent.id,
        v_internal_ref,
        v_provider_refund_id,
        v_intent.provider_transaction_id,
        p_verified_provider_status,
        p_verified_amount_minor,
        trim(p_verified_currency),
        p_initiator_admin_id,
        trim(p_reason),
        trim(p_proof_storage_path),
        lower(trim(p_proof_document_hash)),
        p_proof_refunded_amount_minor,
        trim(p_proof_currency),
        trim(p_proof_beneficiary_ref),
        p_proof_refunded_at,
        'pending_approval',
        p_initiator_action_proof
    ) RETURNING id INTO v_reconciliation_id;

    PERFORM set_config('yziow.reconciliation_step_active', 'off', true);

    RETURN jsonb_build_object(
        'status', 'pending_approval',
        'reconciliation_id', v_reconciliation_id,
        'internal_reconciliation_ref', v_internal_ref,
        'provider_refund_id', v_provider_refund_id,
        'period_id', p_period_id,
        'subscription_id', v_sub.id,
        'payment_intent_id', v_intent.id,
        'initiator_admin_id', p_initiator_admin_id
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 7. Étape 2 du rapprochement : Approbation par un second SuperAdmin distinct
--    et exécution atomique de la compensation financière
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_approve_parent_pack_refund_reconciliation(UUID, UUID, TEXT, TEXT, BIGINT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.admin_approve_parent_pack_refund_reconciliation(
    p_reconciliation_id UUID,
    p_approver_admin_id UUID,
    p_verified_transaction_id TEXT,
    p_verified_provider_status TEXT,
    p_verified_amount_minor BIGINT,
    p_verified_currency TEXT,
    p_approval_notes TEXT DEFAULT NULL,
    p_approver_action_proof JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_approver_name TEXT;
    v_initiator_name TEXT;
    v_rec RECORD;
    v_period RECORD;
    v_sub RECORD;
    v_intent RECORD;
    v_orig_ledger RECORD;
    v_existing_audit RECORD;
    v_affiliate_id UUID;
    v_bal RECORD;
    v_comm_maturation TIMESTAMPTZ;
    v_comm_released BOOLEAN := false;
    v_pending_to_deduct BIGINT := 0;
    v_avail_to_deduct BIGINT := 0;
    v_debt_to_add BIGINT := 0;
    v_rem BIGINT := 0;
    v_cancellation_ledger_id UUID;
    v_affiliate_ledger_id UUID;
    v_refund_audit_id UUID;
    v_has_other_active BOOLEAN := false;
    v_has_other_periods BOOLEAN := false;
    v_new_sub_status TEXT;
    v_ledger_refund_ref TEXT;
BEGIN
    -- 1. Validation des arguments
    IF p_reconciliation_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: reconciliation_id est obligatoire';
    END IF;

    IF p_approver_admin_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: approver_admin_id est obligatoire';
    END IF;

    -- 2. Authentification du second SuperAdmin approbateur
    SELECT username INTO v_approver_name
    FROM public.superadmins
    WHERE id = p_approver_admin_id AND is_active = true;

    IF v_approver_name IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED_ADMIN: SuperAdmin approbateur % introuvable ou non autorise', p_approver_admin_id;
    END IF;

    -- 3. Lecture initiale du dossier de rapprochement pour obtenir period_id
    SELECT * INTO v_rec
    FROM public.parent_pack_refund_reconciliations
    WHERE id = p_reconciliation_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'RECONCILIATION_NOT_FOUND: Dossier de rapprochement % introuvable', p_reconciliation_id;
    END IF;

    -- 4. Séparation stricte des tâches (Dual Custody) : vérifiée avant même le retour idempotent
    IF v_rec.initiator_admin_id = p_approver_admin_id THEN
        RAISE EXCEPTION 'DUAL_CUSTODY_VIOLATION: Le second SuperAdmin approbateur (%) doit etre strictement distinct du SuperAdmin initiateur (%)',
            p_approver_admin_id, v_rec.initiator_admin_id;
    END IF;

    SELECT username INTO v_initiator_name
    FROM public.superadmins
    WHERE id = v_rec.initiator_admin_id;

    IF v_initiator_name IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED_ADMIN: SuperAdmin initiateur % introuvable', v_rec.initiator_admin_id;
    END IF;

    -- 5. Verrou consultatif transactionnel pour sérialiser les appels concurrents sur la période
    PERFORM pg_advisory_xact_lock(hashtext('parent_pack_refund_' || v_rec.period_id::text));

    -- 6. Verrouillage pessimiste du dossier, de la période, de la souscription et de l'intention
    SELECT * INTO v_rec
    FROM public.parent_pack_refund_reconciliations
    WHERE id = p_reconciliation_id
    FOR UPDATE;

    SELECT * INTO v_period
    FROM public.parent_subscription_periods
    WHERE id = v_rec.period_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PERIOD_NOT_FOUND: Periode % introuvable', v_rec.period_id;
    END IF;

    SELECT * INTO v_sub
    FROM public.parent_subscriptions
    WHERE id = v_period.subscription_id
    FOR UPDATE;

    SELECT * INTO v_intent
    FROM public.payment_intents
    WHERE id = v_period.payment_intent_id
    FOR UPDATE;

    -- 7. Idempotence : si le dossier est déjà 'completed' ou la période déjà 'refunded'
    IF v_rec.status = 'completed' OR v_period.status = 'refunded' THEN
        SELECT * INTO v_existing_audit
        FROM public.parent_pack_refund_audits
        WHERE period_id = v_rec.period_id;

        RETURN jsonb_build_object(
            'status', 'already_refunded',
            'reconciliation_id', v_rec.id,
            'internal_reconciliation_ref', v_rec.internal_reconciliation_ref,
            'period_id', v_rec.period_id,
            'refund_audit_id', v_existing_audit.id,
            'provider_refund_id', v_existing_audit.provider_refund_id,
            'initiator_admin_id', v_existing_audit.initiator_admin_id,
            'approver_admin_id', v_existing_audit.approver_admin_id,
            'message', 'Cette periode a deja ete remboursee et compensee.'
        );
    END IF;

    IF v_rec.status IS DISTINCT FROM 'pending_approval' THEN
        RAISE EXCEPTION 'INVALID_RECONCILIATION_STATUS: Le dossier de rapprochement (%) ne peut pas etre approuve (statut actuel: %)',
            v_rec.id, v_rec.status;
    END IF;

    IF v_period.status NOT IN ('active', 'expired') THEN
        RAISE EXCEPTION 'INVALID_PERIOD_STATUS: Seules les periodes active ou expired peuvent etre remboursees (statut actuel: %)',
            v_period.status;
    END IF;

    IF v_intent.status IS DISTINCT FROM 'completed' OR v_intent.processed_at IS NULL THEN
        RAISE EXCEPTION 'INTENT_NOT_COMPLETED: Impossible de rembourser une periode dont le payment_intent (%) n''est pas completed',
            v_intent.id;
    END IF;

    -- 8. Contre-vérification fail-closed lors de la seconde validation :
    --    Une double signature administrative ne remplace JAMAIS la vérification réelle du justificatif et de la transaction.
    IF p_verified_transaction_id IS NULL
       OR trim(p_verified_transaction_id) IS DISTINCT FROM v_intent.provider_transaction_id
       OR v_rec.provider_transaction_id IS DISTINCT FROM v_intent.provider_transaction_id THEN
        RAISE EXCEPTION 'PROOF_TRANSACTION_MISMATCH: Contradiction sur l''identifiant de transaction FedaPay lors de l''approbation (% vs %)',
            COALESCE(p_verified_transaction_id, 'NULL'), COALESCE(v_intent.provider_transaction_id, 'NULL');
    END IF;

    IF p_verified_provider_status IS DISTINCT FROM 'refunded'
       OR v_rec.verified_provider_status IS DISTINCT FROM 'refunded' THEN
        RAISE EXCEPTION 'PROVIDER_STATUS_NOT_REFUNDED: Le statut FedaPay verifie lors de l''approbation doit etre refunded (recu: %)',
            COALESCE(p_verified_provider_status, 'NULL');
    END IF;

    IF p_verified_amount_minor IS NULL
       OR p_verified_amount_minor IS DISTINCT FROM v_intent.expected_amount
       OR v_rec.verified_amount_minor IS DISTINCT FROM v_intent.expected_amount
       OR v_rec.proof_refunded_amount_minor IS DISTINCT FROM v_intent.expected_amount THEN
        RAISE EXCEPTION 'PROOF_AMOUNT_MISMATCH: Contradiction entre le montant verifie (%), le justificatif (%) et le payment_intent (%)',
            COALESCE(p_verified_amount_minor, -1), v_rec.proof_refunded_amount_minor, v_intent.expected_amount;
    END IF;

    IF p_verified_currency IS NULL
       OR trim(p_verified_currency) IS DISTINCT FROM v_intent.expected_currency
       OR v_rec.verified_currency IS DISTINCT FROM v_intent.expected_currency
       OR v_rec.proof_currency IS DISTINCT FROM v_intent.expected_currency THEN
        RAISE EXCEPTION 'PROOF_CURRENCY_MISMATCH: Contradiction de devise lors de l''approbation (% vs %)',
            COALESCE(p_verified_currency, 'NULL'), v_intent.expected_currency;
    END IF;

    IF v_rec.proof_beneficiary_ref IS DISTINCT FROM v_sub.parent_ref THEN
        RAISE EXCEPTION 'PROOF_BENEFICIARY_MISMATCH: Le beneficiaire du justificatif (%) ne correspond pas au parent titulaire (%)',
            v_rec.proof_beneficiary_ref, v_sub.parent_ref;
    END IF;

    IF v_rec.proof_refunded_at < v_intent.processed_at
       OR v_rec.proof_refunded_at > (clock_timestamp() + interval '5 minutes') THEN
        RAISE EXCEPTION 'PROOF_DATE_INVALID: La date du justificatif de remboursement (%) est incoherente avec processed_at (%)',
            v_rec.proof_refunded_at, v_intent.processed_at;
    END IF;

    IF v_rec.proof_storage_path !~ '^private://[a-zA-Z0-9._/-]{8,}$'
       OR v_rec.proof_document_hash !~ '^[a-fA-F0-9]{64}$' THEN
        RAISE EXCEPTION 'INVALID_PROOF_ARTIFACT: Le chemin de stockage prive ou l''empreinte SHA-256 du justificatif est invalide';
    END IF;

    -- 8b. Vérification et consommation atomique de la preuve d'action de l'approbateur (Chantier D.2)
    PERFORM yziow_refund_auth.verify_and_consume_action_proof(
        p_approver_action_proof,
        'approve'::TEXT,
        p_approver_admin_id,
        v_rec.period_id,
        p_reconciliation_id,
        p_verified_transaction_id,
        p_verified_amount_minor::BIGINT,
        p_verified_currency,
        v_rec.proof_document_hash
    );

    -- 8c. Verrouillage FAIL-CLOSED de la compensation financière (Mission 1) :
    --     Tant que les trois garanties de sécurité (authentification indépendante des deux SuperAdmins,
    --     preuve fournisseur FedaPay certifiée du remboursement, stockage privé vérifiable)
    --     ne sont pas toutes opérationnelles, toute approbation et compensation financière est bloquée
    --     en mode fail-closed, y compris lors d'un appel direct via yziow_refund_executor.
    IF NOT EXISTS (
        SELECT 1
        FROM public.parent_pack_refund_security_gate
        WHERE id = true
          AND independent_admin_auth_ready = true
          AND independent_fedapay_proof_ready = true
          AND private_worm_storage_ready = true
    ) THEN
        RAISE EXCEPTION 'SECURITY_BLOCKER: Approbation et compensation financiere verrouillees (fail-closed) tant que les trois garanties de securite (authentification independante des deux SuperAdmins, preuve fournisseur FedaPay certifiee, stockage prive verifiable) ne sont pas operationnelles.';
    END IF;

    -- 9. Verrouillage de l'écriture de commission d'origine (type = 'credit')
    SELECT * INTO v_orig_ledger
    FROM public.school_commission_ledger
    WHERE period_id = v_rec.period_id
      AND type = 'credit'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'COMMISSION_LEDGER_NOT_FOUND: Aucune ecriture de commission credit trouvee pour la periode %', v_rec.period_id;
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.school_commission_ledger
        WHERE original_ledger_id = v_orig_ledger.id
          AND type = 'cancellation'
    ) THEN
        RAISE EXCEPTION 'COMMISSION_ALREADY_CANCELLED: La commission pour la periode % a deja fait l''objet d''une cancellation', v_rec.period_id;
    END IF;

    -- Référence utilisée pour la contrainte P13 sur affiliate_ledger :
    -- Si aucune référence fournisseur certifiée n'est disponible, on utilise l'identifiant
    -- interne de rapprochement tout en consignant explicitement la distinction dans metadata.
    v_ledger_refund_ref := COALESCE(v_rec.provider_refund_id, v_rec.internal_reconciliation_ref);

    -- 10. Gestion de la commission ambassadeur et ajustement fail-closed du solde
    IF v_orig_ledger.ambassador_share_minor > 0 AND v_orig_ledger.ambassador_ref IS NOT NULL THEN
        SELECT id INTO v_affiliate_id
        FROM public.affiliates
        WHERE id::text = v_orig_ledger.ambassador_ref;

        IF v_affiliate_id IS NOT NULL THEN
            SELECT * INTO v_bal
            FROM public.affiliate_balances
            WHERE affiliate_id = v_affiliate_id
              AND currency = 'XOF'
            FOR UPDATE;

            IF FOUND THEN
                SELECT maturation_at INTO v_comm_maturation
                FROM public.affiliate_ledger
                WHERE payment_intent_id = v_period.payment_intent_id
                  AND entry_type = 'commission';

                SELECT EXISTS (
                    SELECT 1
                    FROM public.affiliate_commission_releases r
                    JOIN public.affiliate_ledger l ON l.id = r.ledger_entry_id
                    WHERE l.payment_intent_id = v_period.payment_intent_id
                      AND l.entry_type = 'commission'
                ) INTO v_comm_released;

                IF NOT v_comm_released AND (v_comm_maturation IS NULL OR v_comm_maturation > clock_timestamp()) THEN
                    v_pending_to_deduct := LEAST(v_bal.pending_balance_minor, v_orig_ledger.ambassador_share_minor);
                    v_rem := v_orig_ledger.ambassador_share_minor - v_pending_to_deduct;
                    v_avail_to_deduct := LEAST(v_bal.available_balance_minor, v_rem);
                    v_debt_to_add := v_rem - v_avail_to_deduct;
                ELSE
                    v_pending_to_deduct := 0;
                    v_avail_to_deduct := LEAST(v_bal.available_balance_minor, v_orig_ledger.ambassador_share_minor);
                    v_debt_to_add := v_orig_ledger.ambassador_share_minor - v_avail_to_deduct;
                END IF;

                UPDATE public.affiliate_balances
                SET pending_balance_minor = pending_balance_minor - v_pending_to_deduct,
                    available_balance_minor = available_balance_minor - v_avail_to_deduct,
                    debt_balance_minor = debt_balance_minor + v_debt_to_add,
                    updated_at = clock_timestamp()
                WHERE affiliate_id = v_affiliate_id
                  AND currency = 'XOF';
            END IF;

            INSERT INTO public.affiliate_ledger (
                affiliate_id,
                currency,
                entry_type,
                amount_minor,
                provider_refund_id,
                metadata
            ) VALUES (
                v_affiliate_id,
                'XOF',
                'refund_reversal',
                v_orig_ledger.ambassador_share_minor,
                v_ledger_refund_ref,
                jsonb_build_object(
                    'source', 'parent_pack_refund_reconciliation',
                    'reconciliation_id', v_rec.id,
                    'internal_reconciliation_ref', v_rec.internal_reconciliation_ref,
                    'provider_refund_id', v_rec.provider_refund_id,
                    'provider_refund_id_certified', (v_rec.provider_refund_id IS NOT NULL),
                    'provider_transaction_id', v_rec.provider_transaction_id,
                    'period_id', v_rec.period_id,
                    'payment_intent_id', v_period.payment_intent_id,
                    'initiator_admin_id', v_rec.initiator_admin_id,
                    'approver_admin_id', p_approver_admin_id,
                    'proof_document_hash', v_rec.proof_document_hash,
                    'reason', v_rec.reason,
                    'deducted_from_pending', v_pending_to_deduct,
                    'deducted_from_available', v_avail_to_deduct,
                    'added_to_debt', v_debt_to_add
                )
            ) RETURNING id INTO v_affiliate_ledger_id;
        END IF;
    END IF;

    -- 11. Annulation de la commission école dans school_commission_ledger
    INSERT INTO public.school_commission_ledger (
        period_id,
        school_slug,
        ambassador_ref,
        gross_amount_minor,
        fedapay_fee_minor,
        school_share_minor,
        ambassador_share_minor,
        yziow_share_minor,
        currency,
        type,
        original_ledger_id
    ) VALUES (
        v_rec.period_id,
        v_orig_ledger.school_slug,
        v_orig_ledger.ambassador_ref,
        -v_orig_ledger.gross_amount_minor,
        -v_orig_ledger.fedapay_fee_minor,
        -v_orig_ledger.school_share_minor,
        -v_orig_ledger.ambassador_share_minor,
        -v_orig_ledger.yziow_share_minor,
        v_orig_ledger.currency,
        'cancellation',
        v_orig_ledger.id
    ) RETURNING id INTO v_cancellation_ledger_id;

    -- 12. Activation des verrous transactionnels d'approbation et d'audit
    PERFORM set_config('yziow.reconciliation_step_active', 'approve', true);
    PERFORM set_config('yziow.certified_refund_active', 'true', true);

    -- Finalisation du dossier de rapprochement à double validation
    UPDATE public.parent_pack_refund_reconciliations
    SET status = 'completed',
        approver_admin_id = p_approver_admin_id,
        approval_notes = NULLIF(trim(COALESCE(p_approval_notes, '')), ''),
        approved_at = clock_timestamp(),
        approver_action_proof = p_approver_action_proof,
        updated_at = clock_timestamp()
    WHERE id = v_rec.id;

    -- 13. Enregistrement de la piste d'audit immuable
    INSERT INTO public.parent_pack_refund_audits (
        reconciliation_id,
        period_id,
        subscription_id,
        payment_intent_id,
        internal_reconciliation_ref,
        provider_refund_id,
        provider_transaction_id,
        admin_actor_id,
        initiator_admin_id,
        approver_admin_id,
        reason,
        approval_notes,
        proof_storage_path,
        proof_document_hash,
        proof_refunded_amount_minor,
        proof_currency,
        proof_beneficiary_ref,
        proof_refunded_at,
        gross_amount_minor,
        school_share_minor,
        ambassador_share_minor,
        yziow_share_minor,
        deducted_from_pending_minor,
        deducted_from_available_minor,
        added_to_debt_minor,
        initiator_action_proof,
        approver_action_proof
    ) VALUES (
        v_rec.id,
        v_rec.period_id,
        v_sub.id,
        v_period.payment_intent_id,
        v_rec.internal_reconciliation_ref,
        v_rec.provider_refund_id,
        v_rec.provider_transaction_id,
        v_rec.initiator_admin_id,
        v_rec.initiator_admin_id,
        p_approver_admin_id,
        v_rec.reason,
        NULLIF(trim(COALESCE(p_approval_notes, '')), ''),
        v_rec.proof_storage_path,
        v_rec.proof_document_hash,
        v_rec.proof_refunded_amount_minor,
        v_rec.proof_currency,
        v_rec.proof_beneficiary_ref,
        v_rec.proof_refunded_at,
        v_orig_ledger.gross_amount_minor,
        v_orig_ledger.school_share_minor,
        v_orig_ledger.ambassador_share_minor,
        v_orig_ledger.yziow_share_minor,
        v_pending_to_deduct,
        v_avail_to_deduct,
        v_debt_to_add,
        v_rec.initiator_action_proof,
        p_approver_action_proof
    ) RETURNING id INTO v_refund_audit_id;

    -- 14. Transition certifiée de l'intention et de la période vers 'refunded'
    IF v_period.payment_intent_id IS NOT NULL THEN
        UPDATE public.payment_intents
        SET status = 'refunded',
             updated_at = clock_timestamp()
        WHERE id = v_period.payment_intent_id;
    END IF;

    UPDATE public.parent_subscription_periods
    SET status = 'refunded',
        updated_at = clock_timestamp()
    WHERE id = v_rec.period_id;

    PERFORM set_config('yziow.certified_refund_active', 'false', true);
    PERFORM set_config('yziow.reconciliation_step_active', 'off', true);

    -- 15. Recalcul du statut de parent_subscriptions ('active', 'expired', 'canceled')
    SELECT EXISTS (
        SELECT 1
        FROM public.parent_subscription_periods
        WHERE subscription_id = v_sub.id
          AND id <> v_rec.period_id
          AND status = 'active'
          AND CURRENT_DATE BETWEEN start_date AND end_date
    ) INTO v_has_other_active;

    SELECT EXISTS (
        SELECT 1
        FROM public.parent_subscription_periods
        WHERE subscription_id = v_sub.id
          AND id <> v_rec.period_id
          AND status IN ('active', 'expired')
    ) INTO v_has_other_periods;

    IF v_has_other_active THEN
        v_new_sub_status := 'active';
    ELSIF v_has_other_periods THEN
        v_new_sub_status := 'expired';
    ELSE
        v_new_sub_status := 'canceled';
    END IF;

    UPDATE public.parent_subscriptions
    SET status = v_new_sub_status,
        updated_at = clock_timestamp()
    WHERE id = v_sub.id;

    -- 16. Retour structuré de succès
    RETURN jsonb_build_object(
        'status', 'success',
        'reconciliation_id', v_rec.id,
        'internal_reconciliation_ref', v_rec.internal_reconciliation_ref,
        'provider_refund_id', v_rec.provider_refund_id,
        'provider_refund_id_certified', (v_rec.provider_refund_id IS NOT NULL),
        'provider_transaction_id', v_rec.provider_transaction_id,
        'period_id', v_rec.period_id,
        'subscription_id', v_sub.id,
        'new_subscription_status', v_new_sub_status,
        'refund_audit_id', v_refund_audit_id,
        'initiator_admin_id', v_rec.initiator_admin_id,
        'approver_admin_id', p_approver_admin_id,
        'gross_refunded_minor', v_orig_ledger.gross_amount_minor,
        'school_cancelled_minor', v_orig_ledger.school_share_minor,
        'ambassador_cancelled_minor', v_orig_ledger.ambassador_share_minor,
        'affiliate_deducted_pending_minor', v_pending_to_deduct,
        'affiliate_deducted_available_minor', v_avail_to_deduct,
        'affiliate_added_to_debt_minor', v_debt_to_add
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 7b. Lecture sécurisée d'un dossier de rapprochement (pour l'étape d'approbation)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_parent_pack_refund_reconciliation(
    p_reconciliation_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_rec RECORD;
BEGIN
    IF p_reconciliation_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: reconciliation_id est obligatoire';
    END IF;

    SELECT * INTO v_rec
    FROM public.parent_pack_refund_reconciliations
    WHERE id = p_reconciliation_id;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    RETURN jsonb_build_object(
        'id', v_rec.id,
        'period_id', v_rec.period_id,
        'subscription_id', v_rec.subscription_id,
        'payment_intent_id', v_rec.payment_intent_id,
        'internal_reconciliation_ref', v_rec.internal_reconciliation_ref,
        'provider_refund_id', v_rec.provider_refund_id,
        'provider_transaction_id', v_rec.provider_transaction_id,
        'verified_provider_status', v_rec.verified_provider_status,
        'verified_amount_minor', v_rec.verified_amount_minor,
        'verified_currency', v_rec.verified_currency,
        'initiator_admin_id', v_rec.initiator_admin_id,
        'reason', v_rec.reason,
        'proof_storage_path', v_rec.proof_storage_path,
        'proof_document_hash', v_rec.proof_document_hash,
        'proof_refunded_amount_minor', v_rec.proof_refunded_amount_minor,
        'proof_currency', v_rec.proof_currency,
        'proof_beneficiary_ref', v_rec.proof_beneficiary_ref,
        'proof_refunded_at', v_rec.proof_refunded_at,
        'status', v_rec.status,
        'approver_admin_id', v_rec.approver_admin_id,
        'approval_notes', v_rec.approval_notes,
        'approved_at', v_rec.approved_at,
        'initiator_action_proof', v_rec.initiator_action_proof,
        'approver_action_proof', v_rec.approver_action_proof,
        'created_at', v_rec.created_at
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 8. Permissions et sécurité
-- ------------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.admin_process_parent_pack_refund(UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated, service_role, yziow_webauthn_authority;
GRANT EXECUTE ON FUNCTION public.admin_process_parent_pack_refund(UUID, TEXT, UUID, TEXT) TO yziow_refund_executor;

REVOKE EXECUTE ON FUNCTION public.admin_create_parent_pack_refund_reconciliation(UUID, UUID, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated, service_role, yziow_webauthn_authority;
GRANT EXECUTE ON FUNCTION public.admin_create_parent_pack_refund_reconciliation(UUID, UUID, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, JSONB) TO yziow_refund_executor;

REVOKE EXECUTE ON FUNCTION public.admin_approve_parent_pack_refund_reconciliation(UUID, UUID, TEXT, TEXT, BIGINT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated, service_role, yziow_webauthn_authority;
GRANT EXECUTE ON FUNCTION public.admin_approve_parent_pack_refund_reconciliation(UUID, UUID, TEXT, TEXT, BIGINT, TEXT, TEXT, JSONB) TO yziow_refund_executor;

REVOKE EXECUTE ON FUNCTION public.admin_get_parent_pack_refund_reconciliation(UUID) FROM PUBLIC, anon, authenticated, service_role, yziow_webauthn_authority;
GRANT EXECUTE ON FUNCTION public.admin_get_parent_pack_refund_reconciliation(UUID) TO yziow_refund_executor;

REVOKE ALL ON public.parent_pack_refund_security_gate FROM PUBLIC, anon, authenticated, service_role, yziow_refund_executor, yziow_webauthn_authority;
REVOKE ALL ON public.superadmins FROM yziow_refund_executor, yziow_webauthn_authority;

COMMIT;
