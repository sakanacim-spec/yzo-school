-- Migration pour le module Knowledge Base et l'intégration IA (pgvector)

-- 1. Activer l'extension pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Création de la table des Catégories
CREATE TABLE public.saas_kb_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, slug)
);

-- Index et Trigger pour saas_kb_categories
CREATE INDEX idx_kb_categories_tenant ON public.saas_kb_categories(tenant_id);

CREATE TRIGGER update_kb_categories_updated_at
BEFORE UPDATE ON public.saas_kb_categories
FOR EACH ROW EXECUTE FUNCTION public.saas_handle_updated_at();

ALTER TABLE public.saas_kb_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenants can manage their own KB categories"
  ON public.saas_kb_categories
  FOR ALL
  USING (
    tenant_id = (SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id', '')::uuid)
  );

-- 3. Création de la table des Articles
CREATE TABLE public.saas_kb_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.saas_kb_categories(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'fr',
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  is_public BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  embedding vector(1536),
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour accélérer la recherche par tenant et statut
CREATE INDEX idx_kb_articles_tenant ON public.saas_kb_articles(tenant_id);
CREATE INDEX idx_kb_articles_status_public ON public.saas_kb_articles(tenant_id, status, is_public);

-- Index hnsw pour accélérer la recherche vectorielle (similarité cosinus)
CREATE INDEX idx_kb_articles_embedding ON public.saas_kb_articles USING hnsw (embedding vector_cosine_ops);

-- Trigger pour saas_kb_articles
CREATE TRIGGER update_kb_articles_updated_at
BEFORE UPDATE ON public.saas_kb_articles
FOR EACH ROW EXECUTE FUNCTION public.saas_handle_updated_at();

ALTER TABLE public.saas_kb_articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenants can manage their own KB articles"
  ON public.saas_kb_articles
  FOR ALL
  USING (
    tenant_id = (SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id', '')::uuid)
  );

-- 4. Fonction RPC pour la recherche sémantique (RAG)
-- Cette fonction effectue une recherche de similarité cosinus (opérateur <=>)
-- et filtre par tenant_id. Elle ne renvoie que les articles PUBLISHED et is_public=true pour l'IA publique,
-- mais peut être ajustée via des paramètres si besoin pour l'IA interne.
CREATE OR REPLACE FUNCTION match_articles (
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  p_tenant_id uuid,
  p_only_public boolean DEFAULT false
) RETURNS TABLE (
  id uuid,
  title text,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.title,
    a.content,
    a.metadata,
    1 - (a.embedding <=> query_embedding) AS similarity
  FROM saas_kb_articles a
  WHERE 
    a.tenant_id = p_tenant_id
    AND a.status = 'PUBLISHED'
    AND (p_only_public = false OR a.is_public = true)
    AND 1 - (a.embedding <=> query_embedding) > match_threshold
  ORDER BY a.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
