-- ============================================================================
-- YZIOW SAAS - MIGRATION P9 : ZONES TARIFAIRES INTERNATIONALES (CEMAC, GHANA, ESPAGNE)
-- ============================================================================
-- Auteur : Équipe Ingénierie Yziow
-- Description : Ajout des grilles tarifaires CEMAC (XAF), Ghana (GHS) et Espagne (EUR).
-- Isolation : Aucune modification structurelle rétrograde, conservation stricte d'UEMOA (XOF).
-- Idempotence : Transactionnelle (BEGIN / COMMIT) et réexécutable sans effet de bord.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. ÉVOLUTION DU SCHÉMA : STATUTS TARIFAIRE ET PAIEMENT INDÉPENDANTS
-- ----------------------------------------------------------------------------

-- A. Colonnes de gouvernance sur saas_pricing_grids
ALTER TABLE public.saas_pricing_grids
    ADD COLUMN IF NOT EXISTS pricing_status VARCHAR(20) NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30) NOT NULL DEFAULT 'production';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_saas_grid_pricing_status') THEN
        ALTER TABLE public.saas_pricing_grids
            ADD CONSTRAINT chk_saas_grid_pricing_status
            CHECK (pricing_status IN ('draft', 'active', 'suspended'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_saas_grid_payment_status') THEN
        ALTER TABLE public.saas_pricing_grids
            ADD CONSTRAINT chk_saas_grid_payment_status
            CHECK (payment_status IN ('configuration_pending', 'sandbox', 'production', 'suspended'));
    END IF;
END $$;

-- B. Colonne payment_status sur saas_subscription_quotes pour traçabilité du devis
ALTER TABLE public.saas_subscription_quotes
    ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30) NOT NULL DEFAULT 'production';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_saas_quote_payment_status') THEN
        ALTER TABLE public.saas_subscription_quotes
            ADD CONSTRAINT chk_saas_quote_payment_status
            CHECK (payment_status IN ('configuration_pending', 'sandbox', 'production', 'suspended'));
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. MISE À JOUR IDEMPOTENTE DE LA GRILLE UEMOA (XOF)
-- ----------------------------------------------------------------------------
UPDATE public.saas_pricing_grids
SET pricing_status = 'active',
    payment_status = 'production'
WHERE pricing_version = '2026.1_xof_uemoa'
  AND scope_code = 'UEMOA';

-- ----------------------------------------------------------------------------
-- 3. GRILLE RÉGIONALE CEMAC (XAF) - 6 PAYS
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_existing public.saas_pricing_grids%ROWTYPE;
    v_grid_id UUID;
BEGIN
    SELECT * INTO v_existing
    FROM public.saas_pricing_grids
    WHERE pricing_version = '2026.1_xaf_cemac' AND scope_code = 'CEMAC';

    IF FOUND THEN
        IF (v_existing.rates_monthly <> '{"maternelle_primaire": 100, "college_secondaire": 150, "superieur_formation": 200}'::jsonb OR
            v_existing.currency_code <> 'XAF' OR
            v_existing.currency_minor_unit <> 0 OR
            v_existing.billing_months <> 10 OR
            v_existing.annual_discount_percent <> 10.00 OR
            v_existing.installments_count <> 3) THEN
            RAISE EXCEPTION 'PRICING_VERSION_CONFLICT: La version 2026.1_xaf_cemac existe déjà avec des paramètres divergents';
        END IF;
        v_grid_id := v_existing.id;
    ELSE
        INSERT INTO public.saas_pricing_grids (
            pricing_version, scope_type, scope_code,
            currency_code, currency_symbol, currency_minor_unit, locale,
            rates_monthly, billing_months, annual_discount_percent,
            installments_count, provider, pricing_status, payment_status,
            enabled, effective_from
        )
        VALUES (
            '2026.1_xaf_cemac',
            'region',
            'CEMAC',
            'XAF',
            'FCFA',
            0,
            'fr-CM',
            '{"maternelle_primaire": 100, "college_secondaire": 150, "superieur_formation": 200}'::jsonb,
            10,
            10.00,
            3,
            'pending',
            'active',
            'configuration_pending',
            true,
            '2026-01-01 00:00:00+00'
        )
        RETURNING id INTO v_grid_id;
    END IF;

    -- Rattachement des 6 pays membres de la CEMAC : CM, GA, CG, TD, CF, GQ
    INSERT INTO public.saas_pricing_grid_countries (pricing_grid_id, country_code)
    VALUES
        (v_grid_id, 'CM'),
        (v_grid_id, 'GA'),
        (v_grid_id, 'CG'),
        (v_grid_id, 'TD'),
        (v_grid_id, 'CF'),
        (v_grid_id, 'GQ')
    ON CONFLICT (pricing_grid_id, country_code) DO NOTHING;
END $$;

-- ----------------------------------------------------------------------------
-- 4. GRILLE NATIONALE GHANA (GHS) - PESEWAS (MINOR UNIT = 2)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_existing public.saas_pricing_grids%ROWTYPE;
    v_grid_id UUID;
BEGIN
    SELECT * INTO v_existing
    FROM public.saas_pricing_grids
    WHERE pricing_version = '2026.1_ghs_ghana' AND scope_code = 'GH';

    IF FOUND THEN
        IF (v_existing.rates_monthly <> '{"maternelle_primaire": 200, "college_secondaire": 300, "superieur_formation": 400}'::jsonb OR
            v_existing.currency_code <> 'GHS' OR
            v_existing.currency_minor_unit <> 2 OR
            v_existing.billing_months <> 10 OR
            v_existing.annual_discount_percent <> 10.00 OR
            v_existing.installments_count <> 3) THEN
            RAISE EXCEPTION 'PRICING_VERSION_CONFLICT: La version 2026.1_ghs_ghana existe déjà avec des paramètres divergents';
        END IF;
        v_grid_id := v_existing.id;
    ELSE
        INSERT INTO public.saas_pricing_grids (
            pricing_version, scope_type, scope_code,
            currency_code, currency_symbol, currency_minor_unit, locale,
            rates_monthly, billing_months, annual_discount_percent,
            installments_count, provider, pricing_status, payment_status,
            enabled, effective_from
        )
        VALUES (
            '2026.1_ghs_ghana',
            'country',
            'GH',
            'GHS',
            'GH₵',
            2,
            'en-GH',
            '{"maternelle_primaire": 200, "college_secondaire": 300, "superieur_formation": 400}'::jsonb,
            10,
            10.00,
            3,
            'pending',
            'active',
            'configuration_pending',
            true,
            '2026-01-01 00:00:00+00'
        )
        RETURNING id INTO v_grid_id;
    END IF;

    -- Rattachement du Ghana
    INSERT INTO public.saas_pricing_grid_countries (pricing_grid_id, country_code)
    VALUES
        (v_grid_id, 'GH')
    ON CONFLICT (pricing_grid_id, country_code) DO NOTHING;
END $$;

-- ----------------------------------------------------------------------------
-- 5. GRILLE NATIONALE ESPAGNE (EUR) - CENTIMES (MINOR UNIT = 2)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_existing public.saas_pricing_grids%ROWTYPE;
    v_grid_id UUID;
BEGIN
    SELECT * INTO v_existing
    FROM public.saas_pricing_grids
    WHERE pricing_version = '2026.1_eur_spain' AND scope_code = 'ES';

    IF FOUND THEN
        IF (v_existing.rates_monthly <> '{"maternelle_primaire": 50, "college_secondaire": 75, "superieur_formation": 100}'::jsonb OR
            v_existing.currency_code <> 'EUR' OR
            v_existing.currency_minor_unit <> 2 OR
            v_existing.billing_months <> 10 OR
            v_existing.annual_discount_percent <> 10.00 OR
            v_existing.installments_count <> 3) THEN
            RAISE EXCEPTION 'PRICING_VERSION_CONFLICT: La version 2026.1_eur_spain existe déjà avec des paramètres divergents';
        END IF;
        v_grid_id := v_existing.id;
    ELSE
        INSERT INTO public.saas_pricing_grids (
            pricing_version, scope_type, scope_code,
            currency_code, currency_symbol, currency_minor_unit, locale,
            rates_monthly, billing_months, annual_discount_percent,
            installments_count, provider, pricing_status, payment_status,
            enabled, effective_from
        )
        VALUES (
            '2026.1_eur_spain',
            'country',
            'ES',
            'EUR',
            '€',
            2,
            'es-ES',
            '{"maternelle_primaire": 50, "college_secondaire": 75, "superieur_formation": 100}'::jsonb,
            10,
            10.00,
            3,
            'pending',
            'active',
            'configuration_pending',
            true,
            '2026-01-01 00:00:00+00'
        )
        RETURNING id INTO v_grid_id;
    END IF;

    -- Rattachement de l'Espagne
    INSERT INTO public.saas_pricing_grid_countries (pricing_grid_id, country_code)
    VALUES
        (v_grid_id, 'ES')
    ON CONFLICT (pricing_grid_id, country_code) DO NOTHING;
END $$;

COMMIT;
