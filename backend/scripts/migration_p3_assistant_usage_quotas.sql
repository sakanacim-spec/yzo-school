-- ============================================================
-- MIGRATION P3 : CONTRÔLE SÉCURISÉ DES QUOTAS DE L'ASSISTANT IA
-- ============================================================
-- 1. Table centrale de comptabilisation des quotas d'usage IA
-- 2. Index d'unicité et de performance par fenêtre temporelle
-- 3. Sécurité RLS et isolation stricte des privilèges
-- 4. Fonction RPC atomique SECURITY DEFINER de consommation de quota
-- 5. Fonction utilitaire de nettoyage des compteurs expirés
-- ============================================================

BEGIN;

-- 1. Table centrale des quotas
CREATE TABLE IF NOT EXISTS public.assistant_usage_quotas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope TEXT NOT NULL,
    subject_hash TEXT NOT NULL,
    window_type TEXT NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Contraintes d'intégrité strictes
    CONSTRAINT chk_assistant_usage_scope
        CHECK (scope IN ('public_ip', 'authenticated_user', 'pedagogical_user', 'global')),
    CONSTRAINT chk_assistant_usage_window_type
        CHECK (window_type IN ('hour', 'day')),
    CONSTRAINT chk_assistant_usage_request_count
        CHECK (request_count >= 0),
    CONSTRAINT chk_assistant_usage_subject_hash
        CHECK (length(trim(subject_hash)) = 64 AND subject_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT uq_assistant_usage_slot
        UNIQUE (scope, subject_hash, window_type, window_start)
);

-- Activation de RLS (Row Level Security)
ALTER TABLE public.assistant_usage_quotas ENABLE ROW LEVEL SECURITY;

-- Index pour optimiser le nettoyage et les sélections
CREATE INDEX IF NOT EXISTS idx_assistant_usage_window_start
    ON public.assistant_usage_quotas (window_start);

-- Révocation totale des accès publics/anonymes/authentifiés directs à la table
REVOKE ALL ON TABLE public.assistant_usage_quotas FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.assistant_usage_quotas TO service_role, postgres;

-- 2. Fonction RPC atomique de consommation de quota
CREATE OR REPLACE FUNCTION public.consume_assistant_quota(
    p_subject_scope TEXT,
    p_subject_hash TEXT,
    p_now TIMESTAMPTZ,
    p_subject_hour_limit INTEGER,
    p_subject_day_limit INTEGER,
    p_global_day_limit INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_now TIMESTAMPTZ;
    v_hour_start TIMESTAMPTZ;
    v_day_start TIMESTAMPTZ;
    v_next_hour TIMESTAMPTZ;
    v_next_day TIMESTAMPTZ;
    v_global_hash TEXT := '0000000000000000000000000000000000000000000000000000000000000000';

    v_global_count INTEGER := 0;
    v_subject_day_count INTEGER := 0;
    v_subject_hour_count INTEGER := 0;

    v_retry_after INTEGER := 0;
    v_remaining INTEGER := 0;
BEGIN
    -- 1. Validation fail-closed des paramètres entrants
    IF p_subject_scope IS NULL
       OR p_subject_scope NOT IN ('public_ip', 'authenticated_user', 'pedagogical_user')
       OR p_subject_hash IS NULL
       OR length(trim(p_subject_hash)) != 64
       OR p_subject_hash !~ '^[0-9a-f]{64}$'
       OR p_subject_day_limit IS NULL
       OR p_subject_day_limit <= 0
       OR p_global_day_limit IS NULL
       OR p_global_day_limit <= 0
       OR (p_subject_hour_limit IS NOT NULL AND p_subject_hour_limit <= 0)
    THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'reason', 'INVALID_PARAMETERS',
            'limit', 0,
            'remaining', 0,
            'retry_after_seconds', 60
        );
    END IF;

    -- 2. Calcul déterministe des fenêtres temporelles
    v_now := COALESCE(p_now, now());
    v_hour_start := date_trunc('hour', v_now);
    v_day_start := date_trunc('day', v_now);
    v_next_hour := v_hour_start + INTERVAL '1 hour';
    v_next_day := v_day_start + INTERVAL '1 day';

    -- 3. Initialisation / insertion idempotente des slots requis
    -- Slot global journalier
    INSERT INTO public.assistant_usage_quotas (scope, subject_hash, window_type, window_start, request_count, created_at, updated_at)
    VALUES ('global', v_global_hash, 'day', v_day_start, 0, v_now, v_now)
    ON CONFLICT (scope, subject_hash, window_type, window_start) DO NOTHING;

    -- Slot sujet journalier
    INSERT INTO public.assistant_usage_quotas (scope, subject_hash, window_type, window_start, request_count, created_at, updated_at)
    VALUES (p_subject_scope, p_subject_hash, 'day', v_day_start, 0, v_now, v_now)
    ON CONFLICT (scope, subject_hash, window_type, window_start) DO NOTHING;

    -- Slot sujet horaire si configuré
    IF p_subject_hour_limit IS NOT NULL THEN
        INSERT INTO public.assistant_usage_quotas (scope, subject_hash, window_type, window_start, request_count, created_at, updated_at)
        VALUES (p_subject_scope, p_subject_hash, 'hour', v_hour_start, 0, v_now, v_now)
        ON CONFLICT (scope, subject_hash, window_type, window_start) DO NOTHING;
    END IF;

    -- 4. Verrouillage exclusif ordonné et lecture des compteurs actuels
    -- Verrouillage global
    SELECT request_count INTO v_global_count
    FROM public.assistant_usage_quotas
    WHERE scope = 'global'
      AND subject_hash = v_global_hash
      AND window_type = 'day'
      AND window_start = v_day_start
    FOR UPDATE;

    -- Verrouillage sujet journalier
    SELECT request_count INTO v_subject_day_count
    FROM public.assistant_usage_quotas
    WHERE scope = p_subject_scope
      AND subject_hash = p_subject_hash
      AND window_type = 'day'
      AND window_start = v_day_start
    FOR UPDATE;

    -- Verrouillage sujet horaire si applicable
    IF p_subject_hour_limit IS NOT NULL THEN
        SELECT request_count INTO v_subject_hour_count
        FROM public.assistant_usage_quotas
        WHERE scope = p_subject_scope
          AND subject_hash = p_subject_hash
          AND window_type = 'hour'
          AND window_start = v_hour_start
        FOR UPDATE;
    END IF;

    -- 5. Contrôle des plafonds (ordre : global -> horaire -> journalier)
    -- Plafond global
    IF v_global_count >= p_global_day_limit THEN
        v_retry_after := GREATEST(1, EXTRACT(EPOCH FROM (v_next_day - v_now))::INTEGER);
        RETURN jsonb_build_object(
            'allowed', false,
            'reason', 'GLOBAL_DAILY_LIMIT_EXCEEDED',
            'limit', p_global_day_limit,
            'remaining', 0,
            'retry_after_seconds', v_retry_after
        );
    END IF;

    -- Plafond horaire du sujet
    IF p_subject_hour_limit IS NOT NULL AND v_subject_hour_count >= p_subject_hour_limit THEN
        v_retry_after := GREATEST(1, EXTRACT(EPOCH FROM (v_next_hour - v_now))::INTEGER);
        RETURN jsonb_build_object(
            'allowed', false,
            'reason', 'SUBJECT_HOURLY_LIMIT_EXCEEDED',
            'limit', p_subject_hour_limit,
            'remaining', 0,
            'retry_after_seconds', v_retry_after
        );
    END IF;

    -- Plafond journalier du sujet
    IF v_subject_day_count >= p_subject_day_limit THEN
        v_retry_after := GREATEST(1, EXTRACT(EPOCH FROM (v_next_day - v_now))::INTEGER);
        RETURN jsonb_build_object(
            'allowed', false,
            'reason', 'SUBJECT_DAILY_LIMIT_EXCEEDED',
            'limit', p_subject_day_limit,
            'remaining', 0,
            'retry_after_seconds', v_retry_after
        );
    END IF;

    -- 6. Incrémentation atomique des compteurs
    UPDATE public.assistant_usage_quotas
    SET request_count = request_count + 1,
        updated_at = v_now
    WHERE scope = 'global'
      AND subject_hash = v_global_hash
      AND window_type = 'day'
      AND window_start = v_day_start;

    UPDATE public.assistant_usage_quotas
    SET request_count = request_count + 1,
        updated_at = v_now
    WHERE scope = p_subject_scope
      AND subject_hash = p_subject_hash
      AND window_type = 'day'
      AND window_start = v_day_start;

    IF p_subject_hour_limit IS NOT NULL THEN
        UPDATE public.assistant_usage_quotas
        SET request_count = request_count + 1,
            updated_at = v_now
        WHERE scope = p_subject_scope
          AND subject_hash = p_subject_hash
          AND window_type = 'hour'
          AND window_start = v_hour_start;
    END IF;

    v_remaining := GREATEST(0, p_subject_day_limit - (v_subject_day_count + 1));

    RETURN jsonb_build_object(
        'allowed', true,
        'reason', 'QUOTA_ACCEPTED',
        'limit', p_subject_day_limit,
        'remaining', v_remaining,
        'retry_after_seconds', 0
    );
END;
$$;

-- Attribution du propriétaire à postgres
ALTER FUNCTION public.consume_assistant_quota(TEXT, TEXT, TIMESTAMPTZ, INTEGER, INTEGER, INTEGER) OWNER TO postgres;

-- Sécurisation des privilèges RPC
REVOKE ALL ON FUNCTION public.consume_assistant_quota(TEXT, TEXT, TIMESTAMPTZ, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_assistant_quota(TEXT, TEXT, TIMESTAMPTZ, INTEGER, INTEGER, INTEGER) TO service_role, postgres;

-- 3. Fonction de nettoyage optionnelle (compteurs expirés de plus de 7 jours)
CREATE OR REPLACE FUNCTION public.cleanup_expired_assistant_quotas(p_retention_days INTEGER DEFAULT 7)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_deleted_count INTEGER := 0;
    v_cutoff TIMESTAMPTZ;
BEGIN
    IF p_retention_days IS NULL OR p_retention_days < 1 THEN
        p_retention_days := 7;
    END IF;

    v_cutoff := now() - (p_retention_days || ' days')::INTERVAL;

    DELETE FROM public.assistant_usage_quotas
    WHERE window_start < v_cutoff;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN v_deleted_count;
END;
$$;

ALTER FUNCTION public.cleanup_expired_assistant_quotas(INTEGER) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.cleanup_expired_assistant_quotas(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_assistant_quotas(INTEGER) TO service_role, postgres;

COMMIT;
