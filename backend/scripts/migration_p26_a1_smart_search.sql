-- Migration: P26-A.1 Recherche Intelligente (Smart Search)
-- Activation de pg_trgm et unaccent avec fonction immuable pour l'indexation.

BEGIN;

-- 1. Préparation du schéma et activation des extensions
-- Le schéma "extensions" est standard sur Supabase pour isoler les outils.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS unaccent SCHEMA extensions;

-- 2. Création d'une fonction wrapper IMMUTABLE pour unaccent et lower
-- On spécifie explicitement le dictionnaire 'extensions.unaccent' pour être robuste.
CREATE OR REPLACE FUNCTION public.immutable_unaccent_lower(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
SET search_path = ''
AS $$
    SELECT extensions.unaccent('extensions.unaccent'::pg_catalog.regdictionary, pg_catalog.lower($1));
$$;

-- 3. Création de l'index trigramme pour optimiser la recherche floue
CREATE INDEX IF NOT EXISTS idx_schools_name_trgm 
ON public.schools USING gin (public.immutable_unaccent_lower(name) extensions.gin_trgm_ops);

-- 4. Définition de la fonction de recherche
CREATE OR REPLACE FUNCTION public.search_active_schools(search_term TEXT)
RETURNS TABLE (
    slug TEXT,
    name TEXT,
    city TEXT,
    country TEXT,
    address TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER          -- Permet à l'API backend d'exécuter avec les droits du créateur
SET search_path = ''      -- Fixe le search_path à vide par sécurité contre l'injection
SET pg_trgm.word_similarity_threshold = 0.25 -- Permet à l'opérateur <% d'utiliser ce seuil
AS $$
DECLARE
    normalized_term TEXT;
    escaped_term TEXT;
BEGIN
    IF length(search_term) < 3 THEN
        RETURN;
    END IF;

    -- Normalisation stricte de l'entrée utilisateur
    normalized_term := public.immutable_unaccent_lower(search_term);
    
    -- Échappement des caractères spéciaux \, % et _ pour la clause ILIKE
    escaped_term := replace(replace(replace(normalized_term, '\', '\\'), '%', '\%'), '_', '\_');

    RETURN QUERY
    SELECT s.slug, s.name, s.city, s.country, s.address
    FROM public.schools s
    WHERE s.status = 'active'
      AND (
          public.immutable_unaccent_lower(s.name) OPERATOR(pg_catalog.~~) ('%' || escaped_term || '%')
          OR normalized_term OPERATOR(extensions.<%) public.immutable_unaccent_lower(s.name)
      )
    ORDER BY extensions.word_similarity(normalized_term, public.immutable_unaccent_lower(s.name)) DESC, s.name ASC
    LIMIT 10;
END;
$$;

-- 5. Sécurité : restreindre l'exécution
REVOKE ALL ON FUNCTION public.search_active_schools(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_active_schools(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.search_active_schools(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.search_active_schools(TEXT) TO service_role;

COMMIT;
