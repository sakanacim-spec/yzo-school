-- Migration pour le module AI Concierge (Historique et Sessions)

-- 1. Table des sessions IA
CREATE TABLE public.saas_ai_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, session_token)
);

-- Index pour la recherche rapide par token et par tenant
CREATE INDEX idx_ai_sessions_tenant ON public.saas_ai_sessions(tenant_id);
CREATE INDEX idx_ai_sessions_token ON public.saas_ai_sessions(session_token);

-- Trigger pour updated_at
CREATE TRIGGER update_ai_sessions_updated_at
BEFORE UPDATE ON public.saas_ai_sessions
FOR EACH ROW EXECUTE FUNCTION public.saas_handle_updated_at();

-- RLS (Row Level Security)
ALTER TABLE public.saas_ai_sessions ENABLE ROW LEVEL SECURITY;

-- Seuls les tenants peuvent voir et gérer leurs propres sessions
CREATE POLICY "Tenants can manage their own AI sessions"
  ON public.saas_ai_sessions
  FOR ALL
  USING (
    tenant_id = (SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id', '')::uuid)
  );

-- Remarque: Les API M2M utilisant le client Service Role ou Admin contourneront cette politique 
-- pour créer ou mettre à jour des sessions en se basant sur le tenant_id de la requête.
