-- ============================================================================
-- MIGRATION P8 : GRILLES TARIFAIRES VERSIONNÉES, DEVIS SERVEUR ET RPC ATOMIQUE
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. FONCTION IMMUABLE DE VALIDATION DU JSONB TARIFAIRE
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_valid_saas_rates(p_rates jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
    v_keys text[];
    v_val_prim numeric;
    v_val_sec numeric;
    v_val_sup numeric;
BEGIN
    IF p_rates IS NULL OR jsonb_typeof(p_rates) <> 'object' THEN
        RETURN false;
    END IF;

    SELECT array_agg(k ORDER BY k) INTO v_keys
    FROM jsonb_object_keys(p_rates) AS k;

    IF v_keys <> ARRAY['college_secondaire', 'maternelle_primaire', 'superieur_formation'] THEN
        RETURN false;
    END IF;

    IF jsonb_typeof(p_rates->'maternelle_primaire') <> 'number' OR
       jsonb_typeof(p_rates->'college_secondaire') <> 'number' OR
       jsonb_typeof(p_rates->'superieur_formation') <> 'number' THEN
        RETURN false;
    END IF;

    BEGIN
        v_val_prim := (p_rates->>'maternelle_primaire')::numeric;
        v_val_sec  := (p_rates->>'college_secondaire')::numeric;
        v_val_sup  := (p_rates->>'superieur_formation')::numeric;
    EXCEPTION WHEN OTHERS THEN
        RETURN false;
    END;

    IF v_val_prim <= 0 OR v_val_prim <> trunc(v_val_prim) OR
       v_val_sec  <= 0 OR v_val_sec  <> trunc(v_val_sec) OR
       v_val_sup  <= 0 OR v_val_sup  <> trunc(v_val_sup) THEN
        RETURN false;
    END IF;

    RETURN true;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. FONCTION DE TIMESTAMP updated_at
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. TABLE DES GRILLES TARIFAIRES VERSIONNÉES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.saas_pricing_grids (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pricing_version VARCHAR(30) NOT NULL,
    scope_type VARCHAR(20) NOT NULL CHECK (scope_type IN ('country', 'region')),
    scope_code VARCHAR(30) NOT NULL CHECK (scope_code = UPPER(scope_code)),
    currency_code VARCHAR(3) NOT NULL CHECK (currency_code = UPPER(currency_code)),
    currency_symbol VARCHAR(10) NOT NULL,
    currency_minor_unit INTEGER NOT NULL DEFAULT 0 CHECK (currency_minor_unit BETWEEN 0 AND 4),
    locale VARCHAR(10) NOT NULL DEFAULT 'fr-FR',
    rates_monthly JSONB NOT NULL,
    billing_months INTEGER NOT NULL DEFAULT 10 CHECK (billing_months > 0),
    annual_discount_percent NUMERIC(5,2) NOT NULL DEFAULT 10.00 CHECK (annual_discount_percent BETWEEN 0 AND 100),
    installments_count INTEGER NOT NULL DEFAULT 3 CHECK (installments_count BETWEEN 1 AND 12),
    provider VARCHAR(50) NOT NULL DEFAULT 'fedapay',
    enabled BOOLEAN NOT NULL DEFAULT true,
    effective_from TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    effective_to TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT chk_effective_dates CHECK (effective_to IS NULL OR effective_to > effective_from),
    CONSTRAINT chk_rates_monthly_structure CHECK (public.is_valid_saas_rates(rates_monthly)),
    CONSTRAINT uq_pricing_version_scope UNIQUE (pricing_version, scope_code)
);

DROP TRIGGER IF EXISTS trg_saas_pricing_grids_updated_at ON public.saas_pricing_grids;
CREATE TRIGGER trg_saas_pricing_grids_updated_at
    BEFORE UPDATE ON public.saas_pricing_grids
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at_timestamp();

-- ----------------------------------------------------------------------------
-- 4. TABLE NORMALISÉE DES PAYS COUVERTS PAR LES GRILLES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.saas_pricing_grid_countries (
    pricing_grid_id UUID NOT NULL REFERENCES public.saas_pricing_grids(id) ON DELETE CASCADE,
    country_code VARCHAR(2) NOT NULL CHECK (country_code = UPPER(country_code) AND length(country_code) = 2),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    PRIMARY KEY (pricing_grid_id, country_code)
);

CREATE INDEX IF NOT EXISTS idx_grid_countries_lookup
    ON public.saas_pricing_grid_countries (country_code);

-- ----------------------------------------------------------------------------
-- 5. TRIGGERS ANTI-CHEVAUCHEMENT (VERROUILLAGE TRANSACTIONNEL AVANT LECTURE)
-- ----------------------------------------------------------------------------

-- A. Trigger lors d'INSERT / UPDATE sur saas_pricing_grids
CREATE OR REPLACE FUNCTION public.check_saas_pricing_grid_update_overlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_conflict_count integer;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('saas_pricing_overlap_lock'));

    IF NOT NEW.enabled THEN
        RETURN NEW;
    END IF;

    SELECT count(*) INTO v_conflict_count
    FROM public.saas_pricing_grids g2
    JOIN public.saas_pricing_grid_countries c2 ON c2.pricing_grid_id = g2.id
    JOIN public.saas_pricing_grid_countries c1 ON c1.pricing_grid_id = NEW.id
    WHERE g2.id <> NEW.id
      AND g2.enabled = true
      AND g2.scope_type = NEW.scope_type
      AND c2.country_code = c1.country_code
      AND NEW.effective_from < COALESCE(g2.effective_to, 'infinity'::timestamptz)
      AND g2.effective_from < COALESCE(NEW.effective_to, 'infinity'::timestamptz);

    IF v_conflict_count > 0 THEN
        RAISE EXCEPTION 'PRICING_GRID_PERIOD_OVERLAP: Chevauchement temporel interdit pour la même catégorie de portée et pays';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_pricing_grid_overlap ON public.saas_pricing_grids;
CREATE TRIGGER trg_check_pricing_grid_overlap
    AFTER INSERT OR UPDATE OF scope_type, enabled, effective_from, effective_to
    ON public.saas_pricing_grids
    FOR EACH ROW
    EXECUTE FUNCTION public.check_saas_pricing_grid_update_overlap();

-- B. Trigger lors d'INSERT / UPDATE sur saas_pricing_grid_countries
CREATE OR REPLACE FUNCTION public.check_saas_pricing_country_insert_overlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_parent_grid public.saas_pricing_grids%ROWTYPE;
    v_conflict_count integer;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('saas_pricing_overlap_lock'));

    SELECT * INTO v_parent_grid
    FROM public.saas_pricing_grids
    WHERE id = NEW.pricing_grid_id;

    IF NOT FOUND OR NOT v_parent_grid.enabled THEN
        RETURN NEW;
    END IF;

    SELECT count(*) INTO v_conflict_count
    FROM public.saas_pricing_grids g2
    JOIN public.saas_pricing_grid_countries c2 ON c2.pricing_grid_id = g2.id
    WHERE g2.id <> v_parent_grid.id
      AND g2.enabled = true
      AND g2.scope_type = v_parent_grid.scope_type
      AND c2.country_code = NEW.country_code
      AND v_parent_grid.effective_from < COALESCE(g2.effective_to, 'infinity'::timestamptz)
      AND g2.effective_from < COALESCE(v_parent_grid.effective_to, 'infinity'::timestamptz);

    IF v_conflict_count > 0 THEN
        RAISE EXCEPTION 'PRICING_GRID_PERIOD_OVERLAP: Chevauchement temporel interdit pour ce pays et ce niveau de portée';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_pricing_country_overlap ON public.saas_pricing_grid_countries;
CREATE TRIGGER trg_check_pricing_country_overlap
    AFTER INSERT OR UPDATE OF country_code
    ON public.saas_pricing_grid_countries
    FOR EACH ROW
    EXECUTE FUNCTION public.check_saas_pricing_country_insert_overlap();

-- ----------------------------------------------------------------------------
-- 6. TRIGGERS D'IMMUTABILITÉ COMPLÈTE (GRILLES ET PAYS RÉFÉRENCÉS)
-- ----------------------------------------------------------------------------

-- A. Bloque toute modification structurelle/financière ou suppression d'une grille référencée
CREATE OR REPLACE FUNCTION public.prevent_modification_of_referenced_pricing_grid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_target_id UUID;
    v_ref_count integer;
BEGIN
    v_target_id := COALESCE(OLD.id, NEW.id);

    SELECT (
        (SELECT count(*) FROM public.saas_subscription_quotes WHERE pricing_grid_id = v_target_id) +
        (SELECT count(*) FROM public.payment_intents WHERE pricing_grid_id = v_target_id)
    ) INTO v_ref_count;

    IF v_ref_count > 0 THEN
        IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'PRICING_GRID_REFERENCED: Impossible de supprimer une grille tarifaire déjà référencée par des devis ou intentions';
        END IF;

        IF TG_OP = 'UPDATE' THEN
            IF (OLD.rates_monthly <> NEW.rates_monthly OR
                OLD.currency_code <> NEW.currency_code OR
                OLD.currency_minor_unit <> NEW.currency_minor_unit OR
                OLD.currency_symbol <> NEW.currency_symbol OR
                OLD.billing_months <> NEW.billing_months OR
                OLD.annual_discount_percent <> NEW.annual_discount_percent OR
                OLD.installments_count <> NEW.installments_count OR
                OLD.scope_type <> NEW.scope_type OR
                OLD.scope_code <> NEW.scope_code OR
                OLD.provider <> NEW.provider OR
                OLD.locale <> NEW.locale OR
                OLD.enabled <> NEW.enabled OR
                OLD.effective_from <> NEW.effective_from OR
                COALESCE(OLD.effective_to, 'infinity'::timestamptz) <> COALESCE(NEW.effective_to, 'infinity'::timestamptz)) THEN
                RAISE EXCEPTION 'PRICING_GRID_IMMUTABLE: Toute modification structurelle ou financière d''une grille tarifaire référencée est strictement interdite';
            END IF;
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_pricing_grid_modification ON public.saas_pricing_grids;
CREATE TRIGGER trg_prevent_pricing_grid_modification
    BEFORE UPDATE OR DELETE ON public.saas_pricing_grids
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_modification_of_referenced_pricing_grid();

-- B. Bloque l'ajout, la modification ou la suppression de pays pour une grille référencée
CREATE OR REPLACE FUNCTION public.prevent_modification_of_referenced_grid_countries()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_grid_id UUID;
    v_ref_count integer;
BEGIN
    v_grid_id := COALESCE(OLD.pricing_grid_id, NEW.pricing_grid_id);

    SELECT (
        (SELECT count(*) FROM public.saas_subscription_quotes WHERE pricing_grid_id = v_grid_id) +
        (SELECT count(*) FROM public.payment_intents WHERE pricing_grid_id = v_grid_id)
    ) INTO v_ref_count;

    IF v_ref_count > 0 THEN
        RAISE EXCEPTION 'PRICING_GRID_COUNTRIES_IMMUTABLE: Impossible d''ajouter, modifier ou retirer des pays pour une grille déjà référencée';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_pricing_country_modification ON public.saas_pricing_grid_countries;
CREATE TRIGGER trg_prevent_pricing_country_modification
    BEFORE INSERT OR UPDATE OR DELETE ON public.saas_pricing_grid_countries
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_modification_of_referenced_grid_countries();

-- ----------------------------------------------------------------------------
-- 7. TABLE DES DEVIS SERVEUR AVEC ÉTAT DE RÉCONCILIATION ET CONTRAINTE 15 MIN
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.saas_subscription_quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id VARCHAR(50) NOT NULL UNIQUE,
    school_slug VARCHAR(100) NOT NULL REFERENCES public.schools(slug) ON DELETE RESTRICT,
    billing_period VARCHAR(20) NOT NULL,
    pricing_grid_id UUID NOT NULL REFERENCES public.saas_pricing_grids(id) ON DELETE RESTRICT,
    pricing_version VARCHAR(30) NOT NULL,
    pricing_scope_type VARCHAR(20) NOT NULL,
    pricing_scope_code VARCHAR(30) NOT NULL,
    country_code VARCHAR(2) NOT NULL CHECK (country_code = UPPER(country_code)),
    currency_code VARCHAR(3) NOT NULL CHECK (currency_code = UPPER(currency_code)),
    currency_minor_unit INTEGER NOT NULL DEFAULT 0 CHECK (currency_minor_unit BETWEEN 0 AND 4),
    total_students INTEGER NOT NULL CHECK (total_students > 0),
    categories_breakdown JSONB NOT NULL,
    payment_options JSONB NOT NULL,
    classification_hash VARCHAR(64) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'issued' CHECK (
        status IN ('issued', 'processing', 'consumed', 'expired', 'failed', 'reconciliation_required')
    ),
    calculated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    processing_started_at TIMESTAMP WITH TIME ZONE,
    consumed_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    failure_code VARCHAR(50),
    provider_transaction_id VARCHAR(100),
    payment_intent_id UUID UNIQUE,
    created_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT chk_quote_expiration_window CHECK (
        expires_at > calculated_at AND
        expires_at <= calculated_at + INTERVAL '15 minutes'
    ),
    CONSTRAINT chk_quote_consumed_consistency CHECK (
        (status = 'consumed' AND payment_intent_id IS NOT NULL AND consumed_at IS NOT NULL) OR
        (status <> 'consumed' AND consumed_at IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_saas_quotes_lifecycle
    ON public.saas_subscription_quotes (school_slug, quote_id, status, expires_at);

-- ----------------------------------------------------------------------------
-- 8. GOUVERNANCE STRICTE DES payment_intents (VERSIONNEMENT ET NOT VALID)
-- ----------------------------------------------------------------------------
ALTER TABLE public.payment_intents
    ADD COLUMN IF NOT EXISTS pricing_schema_version INTEGER;

-- Remplacement transactionnel des contraintes P7 pour autoriser pricing_schema_version = 1 à avoir des valeurs historiques NULL
ALTER TABLE public.payment_intents
    DROP CONSTRAINT IF EXISTS chk_saas_billing_period_required;

ALTER TABLE public.payment_intents
    ADD CONSTRAINT chk_saas_billing_period_required
    CHECK (
        payment_type <> 'saas_subscription'
        OR COALESCE(pricing_schema_version, 1) = 1
        OR (
            billing_period IS NOT NULL
            AND length(trim(billing_period)) > 0
        )
    ) NOT VALID;

ALTER TABLE public.payment_intents
    DROP CONSTRAINT IF EXISTS chk_saas_payable_amount_required;

ALTER TABLE public.payment_intents
    ADD CONSTRAINT chk_saas_payable_amount_required
    CHECK (
        payment_type <> 'saas_subscription'
        OR COALESCE(pricing_schema_version, 1) = 1
        OR (
            payable_amount IS NOT NULL
            AND payable_amount > 0
        )
    ) NOT VALID;

-- Backfill des intentions historiques en version 1
UPDATE public.payment_intents
SET pricing_schema_version = 1
WHERE pricing_schema_version IS NULL;

-- Imposer NOT NULL et DEFAULT 2 pour toutes les nouvelles insertions
ALTER TABLE public.payment_intents
    ALTER COLUMN pricing_schema_version SET DEFAULT 2,
    ALTER COLUMN pricing_schema_version SET NOT NULL;

-- Contrainte de domaine sur la version
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pricing_schema_version_valid') THEN
        ALTER TABLE public.payment_intents
            ADD CONSTRAINT chk_pricing_schema_version_valid
            CHECK (pricing_schema_version IN (1, 2));
    END IF;
END $$;

-- Trigger d'immutabilité et de verrouillage des versions sur payment_intents
CREATE OR REPLACE FUNCTION public.prevent_pricing_schema_version_modification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Toute nouvelle insertion doit obligatoirement utiliser la version 2
        IF NEW.pricing_schema_version IS DISTINCT FROM 2 THEN
            RAISE EXCEPTION 'PRICING_SCHEMA_VERSION_LEGACY_ONLY: Les nouvelles intentions doivent obligatoirement utiliser pricing_schema_version = 2';
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Immutabilité stricte : aucune mutation de pricing_schema_version autorisée (ni 1->2, ni 2->1)
        IF OLD.pricing_schema_version IS NOT NULL AND NEW.pricing_schema_version IS DISTINCT FROM OLD.pricing_schema_version THEN
            RAISE EXCEPTION 'PRICING_SCHEMA_VERSION_IMMUTABLE: La version du schéma tarifaire (pricing_schema_version) est strictement immuable';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_pricing_schema_version_modification ON public.payment_intents;
CREATE TRIGGER trg_prevent_pricing_schema_version_modification
    BEFORE INSERT OR UPDATE ON public.payment_intents
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_pricing_schema_version_modification();

-- Nouvelles colonnes de traçabilité
ALTER TABLE public.payment_intents
    ADD COLUMN IF NOT EXISTS pricing_grid_id UUID REFERENCES public.saas_pricing_grids(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS pricing_version VARCHAR(30),
    ADD COLUMN IF NOT EXISTS pricing_scope_type VARCHAR(20),
    ADD COLUMN IF NOT EXISTS pricing_scope_code VARCHAR(30),
    ADD COLUMN IF NOT EXISTS currency_minor_unit INTEGER,
    ADD COLUMN IF NOT EXISTS quote_id VARCHAR(50);

-- Unicité absolue globale : 1 devis = 1 intention
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_intents_quote_id
    ON public.payment_intents (quote_id)
    WHERE quote_id IS NOT NULL;

-- Clé étrangère réflexive reliant le devis à l'intention
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_quotes_payment_intent') THEN
        ALTER TABLE public.saas_subscription_quotes
            ADD CONSTRAINT fk_quotes_payment_intent
            FOREIGN KEY (payment_intent_id) REFERENCES public.payment_intents(id) ON DELETE RESTRICT;
    END IF;
END $$;

-- Contraintes NOT VALID s'appliquant EXCLUSIVEMENT aux intentions version 2
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_saas_p8_pricing_fields_required') THEN
        ALTER TABLE public.payment_intents
            ADD CONSTRAINT chk_saas_p8_pricing_fields_required
            CHECK (
                payment_type <> 'saas_subscription' OR
                pricing_schema_version <> 2 OR
                (
                    pricing_grid_id IS NOT NULL AND
                    length(trim(pricing_version)) > 0 AND
                    pricing_scope_type IN ('country', 'region') AND
                    length(trim(pricing_scope_code)) > 0 AND
                    currency_minor_unit IS NOT NULL AND
                    quote_id IS NOT NULL AND
                    gross_amount > 0 AND
                    payable_amount > 0
                )
            ) NOT VALID;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 9. RPC ATOMIQUE DE CLÔTURE D'INITIALISATION DE PAIEMENT
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_saas_payment_initialization(
    p_intent_id UUID,
    p_quote_id VARCHAR(50),
    p_provider_transaction_id TEXT,
    p_school_slug VARCHAR(100)
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_intent_record public.payment_intents%ROWTYPE;
    v_quote_record public.saas_subscription_quotes%ROWTYPE;
    v_rows_intent integer;
    v_rows_quote integer;
BEGIN
    -- 0. Validation stricte des arguments d'entrée
    IF p_provider_transaction_id IS NULL
       OR length(trim(p_provider_transaction_id)) = 0 THEN
        RAISE EXCEPTION 'PROVIDER_TRANSACTION_ID_REQUIRED';
    END IF;

    -- 1. Verrouiller et vérifier l'intention
    SELECT * INTO v_intent_record
    FROM public.payment_intents
    WHERE id = p_intent_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PAYMENT_INTENT_NOT_FOUND: Intention % introuvable', p_intent_id;
    END IF;

    IF v_intent_record.school_slug <> p_school_slug THEN
        RAISE EXCEPTION 'PAYMENT_INTENT_SCHOOL_MISMATCH: École divergente sur intention %', p_intent_id;
    END IF;

    IF v_intent_record.quote_id IS DISTINCT FROM p_quote_id THEN
        RAISE EXCEPTION 'PAYMENT_INTENT_QUOTE_MISMATCH';
    END IF;

    IF v_intent_record.payment_type IS DISTINCT FROM 'saas_subscription' THEN
        RAISE EXCEPTION 'PAYMENT_INTENT_TYPE_MISMATCH';
    END IF;

    IF v_intent_record.status <> 'initializing' THEN
        RAISE EXCEPTION 'PAYMENT_INTENT_INVALID_STATUS: Intention % en statut % (attendu initializing)', p_intent_id, v_intent_record.status;
    END IF;

    IF v_intent_record.provider_transaction_id IS NOT NULL THEN
        RAISE EXCEPTION 'PAYMENT_INTENT_ALREADY_LINKED: Intention % possède déjà une transaction fournisseur', p_intent_id;
    END IF;

    -- 2. Verrouiller et vérifier le devis
    SELECT * INTO v_quote_record
    FROM public.saas_subscription_quotes
    WHERE quote_id = p_quote_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'SAAS_QUOTE_NOT_FOUND: Devis % introuvable', p_quote_id;
    END IF;

    IF v_quote_record.school_slug <> p_school_slug THEN
        RAISE EXCEPTION 'SAAS_QUOTE_SCHOOL_MISMATCH: École divergente sur devis %', p_quote_id;
    END IF;

    IF v_quote_record.quote_id IS DISTINCT FROM v_intent_record.quote_id THEN
        RAISE EXCEPTION 'QUOTE_INTENT_MISMATCH: Incohérence de quote_id entre devis et intention';
    END IF;

    IF v_quote_record.status <> 'processing' THEN
        RAISE EXCEPTION 'SAAS_QUOTE_INVALID_STATUS: Devis % en statut % (attendu processing)', p_quote_id, v_quote_record.status;
    END IF;

    IF v_quote_record.expires_at <= now() THEN
        RAISE EXCEPTION 'SAAS_QUOTE_EXPIRED: Devis % expiré', p_quote_id;
    END IF;

    IF v_quote_record.payment_intent_id IS NOT NULL THEN
        RAISE EXCEPTION 'SAAS_QUOTE_ALREADY_LINKED: Devis % déjà lié à une intention %', p_quote_id, v_quote_record.payment_intent_id;
    END IF;

    -- 3. Mise à jour atomique de l'intention vers 'pending' (exactement 1 ligne)
    UPDATE public.payment_intents
    SET status = 'pending',
        provider_transaction_id = p_provider_transaction_id,
        updated_at = now()
    WHERE id = p_intent_id
      AND status = 'initializing';

    GET DIAGNOSTICS v_rows_intent = ROW_COUNT;
    IF v_rows_intent <> 1 THEN
        RAISE EXCEPTION 'PAYMENT_INTENT_UPDATE_FAILED: Échec mise à jour statut intention % (lignes affectées: %)', p_intent_id, v_rows_intent;
    END IF;

    -- 4. Mise à jour atomique du devis vers 'consumed' (exactement 1 ligne)
    UPDATE public.saas_subscription_quotes
    SET status = 'consumed',
        consumed_at = now(),
        payment_intent_id = p_intent_id,
        provider_transaction_id = p_provider_transaction_id
    WHERE quote_id = p_quote_id
      AND status = 'processing';

    GET DIAGNOSTICS v_rows_quote = ROW_COUNT;
    IF v_rows_quote <> 1 THEN
        RAISE EXCEPTION 'SAAS_QUOTE_UPDATE_FAILED: Échec mise à jour statut devis % (lignes affectées: %)', p_quote_id, v_rows_quote;
    END IF;

    RETURN jsonb_build_object(
        'status', 'completed',
        'intent_id', p_intent_id,
        'quote_id', p_quote_id,
        'provider_transaction_id', p_provider_transaction_id
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 10. SÉCURITÉ, RLS ET RÉVOCATION PUBLIQUE TOTALE
-- ----------------------------------------------------------------------------
ALTER TABLE public.saas_pricing_grids OWNER TO postgres;
ALTER TABLE public.saas_pricing_grid_countries OWNER TO postgres;
ALTER TABLE public.saas_subscription_quotes OWNER TO postgres;
ALTER FUNCTION public.complete_saas_payment_initialization(UUID, VARCHAR, TEXT, VARCHAR) OWNER TO postgres;

ALTER TABLE public.saas_pricing_grids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_pricing_grid_countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_subscription_quotes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.saas_pricing_grids FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.saas_pricing_grid_countries FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.saas_subscription_quotes FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.saas_pricing_grids TO service_role, postgres;
GRANT ALL ON TABLE public.saas_pricing_grid_countries TO service_role, postgres;
GRANT ALL ON TABLE public.saas_subscription_quotes TO service_role, postgres;

REVOKE ALL ON FUNCTION public.is_valid_saas_rates(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at_timestamp() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_saas_pricing_grid_update_overlap() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_saas_pricing_country_insert_overlap() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_modification_of_referenced_pricing_grid() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_modification_of_referenced_grid_countries() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_saas_payment_initialization(UUID, VARCHAR, TEXT, VARCHAR) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.is_valid_saas_rates(jsonb) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.set_updated_at_timestamp() TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.check_saas_pricing_grid_update_overlap() TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.check_saas_pricing_country_insert_overlap() TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.prevent_modification_of_referenced_pricing_grid() TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.prevent_modification_of_referenced_grid_countries() TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.complete_saas_payment_initialization(UUID, VARCHAR, TEXT, VARCHAR) TO service_role, postgres;

-- ----------------------------------------------------------------------------
-- 11. SEED UEMOA IMMUABLE (REJET EN CAS DE CONFLIT DE VERSION)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_existing public.saas_pricing_grids%ROWTYPE;
    v_grid_id UUID;
BEGIN
    SELECT * INTO v_existing
    FROM public.saas_pricing_grids
    WHERE pricing_version = '2026.1_xof_uemoa' AND scope_code = 'UEMOA';

    IF FOUND THEN
        IF (v_existing.rates_monthly <> '{"maternelle_primaire": 100, "college_secondaire": 150, "superieur_formation": 200}'::jsonb OR
            v_existing.currency_code <> 'XOF' OR
            v_existing.billing_months <> 10 OR
            v_existing.annual_discount_percent <> 10.00 OR
            v_existing.installments_count <> 3 OR
            v_existing.currency_minor_unit <> 0) THEN
            RAISE EXCEPTION 'PRICING_VERSION_CONFLICT: La version 2026.1_xof_uemoa existe déjà avec des paramètres financiers divergents';
        END IF;
        v_grid_id := v_existing.id;
    ELSE
        INSERT INTO public.saas_pricing_grids (
            pricing_version, scope_type, scope_code,
            currency_code, currency_symbol, currency_minor_unit, locale,
            rates_monthly, billing_months, annual_discount_percent,
            installments_count, provider, enabled, effective_from
        )
        VALUES (
            '2026.1_xof_uemoa',
            'region',
            'UEMOA',
            'XOF',
            'FCFA',
            0,
            'fr-BJ',
            '{"maternelle_primaire": 100, "college_secondaire": 150, "superieur_formation": 200}'::jsonb,
            10,
            10.00,
            3,
            'fedapay',
            true,
            '2026-01-01 00:00:00+00'
        )
        RETURNING id INTO v_grid_id;
    END IF;

    INSERT INTO public.saas_pricing_grid_countries (pricing_grid_id, country_code)
    VALUES
        (v_grid_id, 'BJ'),
        (v_grid_id, 'TG'),
        (v_grid_id, 'CI'),
        (v_grid_id, 'SN'),
        (v_grid_id, 'ML'),
        (v_grid_id, 'BF'),
        (v_grid_id, 'NE'),
        (v_grid_id, 'GW')
    ON CONFLICT (pricing_grid_id, country_code) DO NOTHING;
END $$;

COMMIT;
