-- Legacy SaaS manual review queue
-- Applied successfully to YZIOW Staging on 2026-10-01.
-- Requires explicit Production authorization before any Production execution.

BEGIN;

-- 1. Pre-flight checks
DO $$
BEGIN
    -- Check payment_intents exists
    IF NOT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'payment_intents'
    ) THEN
        RAISE EXCEPTION 'Pre-flight check failed: public.payment_intents table does not exist.';
    END IF;

    -- Check payment_intents.id exists and is strictly UUID
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'payment_intents' AND column_name = 'id'
          AND data_type = 'uuid'
    ) THEN
        RAISE EXCEPTION 'Pre-flight check failed: public.payment_intents.id column does not exist or is not strictly UUID.';
    END IF;

    -- Check payment_intents.payment_type exists
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'payment_intents' AND column_name = 'payment_type'
    ) THEN
        RAISE EXCEPTION 'Pre-flight check failed: public.payment_intents.payment_type column does not exist.';
    END IF;

    -- Check new tables don't exist
    IF EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'legacy_saas_manual_reviews'
    ) THEN
        RAISE EXCEPTION 'Pre-flight check failed: table public.legacy_saas_manual_reviews already exists.';
    END IF;

    IF EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'legacy_saas_manual_review_actions'
    ) THEN
        RAISE EXCEPTION 'Pre-flight check failed: table public.legacy_saas_manual_review_actions already exists.';
    END IF;

    -- Check immutability function doesn't exist
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'legacy_saas_v1_prevent_action_modification'
    ) THEN
        RAISE EXCEPTION 'Pre-flight check failed: function public.legacy_saas_v1_prevent_action_modification already exists.';
    END IF;

    -- Check payment type validation function doesn't exist
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'legacy_saas_v1_check_payment_type'
    ) THEN
        RAISE EXCEPTION 'Pre-flight check failed: function public.legacy_saas_v1_check_payment_type already exists.';
    END IF;

    -- Check triggers don't exist
    IF EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trg_legacy_saas_v1_prevent_action_mod'
    ) THEN
        RAISE EXCEPTION 'Pre-flight check failed: trigger trg_legacy_saas_v1_prevent_action_mod already exists.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trg_legacy_saas_v1_check_payment_type'
    ) THEN
        RAISE EXCEPTION 'Pre-flight check failed: trigger trg_legacy_saas_v1_check_payment_type already exists.';
    END IF;

    -- Check constraint doesn't exist
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'uq_legacy_saas_review_event'
    ) THEN
        RAISE EXCEPTION 'Pre-flight check failed: constraint uq_legacy_saas_review_event already exists.';
    END IF;

    -- Check gen_random_uuid availability
    IF NOT EXISTS (
        SELECT FROM pg_proc WHERE proname = 'gen_random_uuid'
    ) THEN
        RAISE EXCEPTION 'Pre-flight check failed: gen_random_uuid() function is not available.';
    END IF;
END $$;

-- 2. Business Guarantees
-- GARANTIES METIER OBLIGATOIRES :
-- - La migration ne crée aucun abonnement SaaS.
-- - Elle n'active, n'expire, ne suspend, ne limite, ne supprime et ne rembourse aucune école.
-- - Elle sert uniquement à permettre au futur webhook, après validation de signature, de créer ou réutiliser un dossier durable de revue avant de répondre 200 OK.
-- - Les flux tuition, donation et le futur parent_pack sont exclus.
-- - Une ancienne notification SaaS en doublon ne doit créer qu'un seul dossier.

-- 3. Create Main Table
CREATE TABLE public.legacy_saas_manual_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL,
    provider_event_ref TEXT NOT NULL, -- TODO BLOCKED: Le mapping exact devra être validé dans le webhook avant mise en production (ne pas inventer de colonne ou donnée FedaPay non observée).
    payment_intent_id UUID REFERENCES public.payment_intents(id) ON DELETE RESTRICT,
    school_slug TEXT,
    legacy_payment_type TEXT NOT NULL DEFAULT 'saas_subscription' CHECK (legacy_payment_type = 'saas_subscription'),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_review', 'resolved', 'dismissed')),
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    assigned_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    reviewer_internal_id TEXT,
    CONSTRAINT uq_legacy_saas_review_event UNIQUE (provider, provider_event_ref)
);

-- 4. Create Append-Only Actions Table
-- TODO BLOCKED: Le futur code de revue devra écrire l'action humaine (INSERT dans review_actions) et modifier le statut du dossier (UPDATE review) dans la même transaction.
CREATE TABLE public.legacy_saas_manual_review_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id UUID NOT NULL REFERENCES public.legacy_saas_manual_reviews(id) ON DELETE RESTRICT,
    action_type TEXT NOT NULL CHECK (action_type IN ('assigned', 'resolved', 'dismissed', 'note_added')),
    action_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decider_internal_id TEXT NOT NULL,
    safe_note VARCHAR(1000) NOT NULL -- IMPORTANT: Aucune donnée personnelle, payload brut, secret, clé API, numéro bancaire, email ou téléphone ne peut être inscrit dans cette note.
);

-- 5. Triggers (Immutability and Payment Type Cross-Check)
CREATE FUNCTION public.legacy_saas_v1_prevent_action_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Modification or deletion of legacy_saas_manual_review_actions is strictly forbidden.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_legacy_saas_v1_prevent_action_mod
BEFORE UPDATE OR DELETE ON public.legacy_saas_manual_review_actions
FOR EACH ROW
EXECUTE FUNCTION public.legacy_saas_v1_prevent_action_modification();

CREATE FUNCTION public.legacy_saas_v1_check_payment_type()
RETURNS TRIGGER AS $$
DECLARE
    intent_payment_type TEXT;
BEGIN
    IF NEW.payment_intent_id IS NOT NULL THEN
        SELECT payment_type INTO intent_payment_type 
        FROM public.payment_intents 
        WHERE id = NEW.payment_intent_id;
        
        IF intent_payment_type IS DISTINCT FROM 'saas_subscription' THEN
            RAISE EXCEPTION 'payment_intent_id % does not correspond to a saas_subscription payment.', NEW.payment_intent_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_legacy_saas_v1_check_payment_type
BEFORE INSERT OR UPDATE OF payment_intent_id ON public.legacy_saas_manual_reviews
FOR EACH ROW
EXECUTE FUNCTION public.legacy_saas_v1_check_payment_type();

-- 6. Security and RLS
ALTER TABLE public.legacy_saas_manual_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legacy_saas_manual_review_actions ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON public.legacy_saas_manual_reviews FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON public.legacy_saas_manual_review_actions FROM PUBLIC, anon, authenticated, service_role;

-- TODO BLOCKED: Ajouter des politiques pour le futur rôle interne YZIOW si ce rôle n'est pas confirmé dans le dépôt.

-- Grant for service_role
GRANT SELECT, INSERT, UPDATE ON public.legacy_saas_manual_reviews TO service_role;
GRANT SELECT, INSERT ON public.legacy_saas_manual_review_actions TO service_role;

CREATE POLICY service_role_select_reviews 
ON public.legacy_saas_manual_reviews 
FOR SELECT TO service_role USING (true);

CREATE POLICY service_role_insert_reviews 
ON public.legacy_saas_manual_reviews 
FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY service_role_update_reviews 
ON public.legacy_saas_manual_reviews 
FOR UPDATE TO service_role USING (true) WITH CHECK (true);

CREATE POLICY service_role_insert_actions 
ON public.legacy_saas_manual_review_actions 
FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY service_role_select_actions 
ON public.legacy_saas_manual_review_actions 
FOR SELECT TO service_role USING (true);


-- 7. Post-flight checks
DO $$
BEGIN
    -- Check tables are present
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'legacy_saas_manual_reviews') THEN
        RAISE EXCEPTION 'Post-flight check failed: legacy_saas_manual_reviews not found.';
    END IF;
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'legacy_saas_manual_review_actions') THEN
        RAISE EXCEPTION 'Post-flight check failed: legacy_saas_manual_review_actions not found.';
    END IF;

    -- Check RLS is active
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'legacy_saas_manual_reviews' AND rowsecurity = true) THEN
        RAISE EXCEPTION 'Post-flight check failed: RLS not active on legacy_saas_manual_reviews.';
    END IF;
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'legacy_saas_manual_review_actions' AND rowsecurity = true) THEN
        RAISE EXCEPTION 'Post-flight check failed: RLS not active on legacy_saas_manual_review_actions.';
    END IF;

    -- Check no privileges for anon/authenticated/PUBLIC
    IF EXISTS (
        SELECT 1 FROM information_schema.table_privileges 
        WHERE table_schema = 'public' 
        AND table_name IN ('legacy_saas_manual_reviews', 'legacy_saas_manual_review_actions') 
        AND grantee IN ('anon', 'authenticated', 'PUBLIC')
    ) THEN
        RAISE EXCEPTION 'Post-flight check failed: anon, authenticated, or PUBLIC have privileges.';
    END IF;

    -- Check service_role policies are strictly defined for legacy_saas_manual_reviews
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'legacy_saas_manual_reviews' AND cmd = 'SELECT' AND roles::text LIKE '%service_role%') THEN
        RAISE EXCEPTION 'Post-flight check failed: Missing service_role SELECT policy on legacy_saas_manual_reviews.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'legacy_saas_manual_reviews' AND cmd = 'INSERT' AND roles::text LIKE '%service_role%') THEN
        RAISE EXCEPTION 'Post-flight check failed: Missing service_role INSERT policy on legacy_saas_manual_reviews.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'legacy_saas_manual_reviews' AND cmd = 'UPDATE' AND roles::text LIKE '%service_role%') THEN
        RAISE EXCEPTION 'Post-flight check failed: Missing service_role UPDATE policy on legacy_saas_manual_reviews.';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'legacy_saas_manual_reviews' AND cmd IN ('ALL', 'DELETE') AND roles::text LIKE '%service_role%') THEN
        RAISE EXCEPTION 'Post-flight check failed: Forbidden ALL or DELETE policy exists for service_role on legacy_saas_manual_reviews.';
    END IF;

    -- Check service_role policies are strictly defined for legacy_saas_manual_review_actions
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'legacy_saas_manual_review_actions' AND cmd = 'SELECT' AND roles::text LIKE '%service_role%') THEN
        RAISE EXCEPTION 'Post-flight check failed: Missing service_role SELECT policy on legacy_saas_manual_review_actions.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'legacy_saas_manual_review_actions' AND cmd = 'INSERT' AND roles::text LIKE '%service_role%') THEN
        RAISE EXCEPTION 'Post-flight check failed: Missing service_role INSERT policy on legacy_saas_manual_review_actions.';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'legacy_saas_manual_review_actions' AND cmd IN ('ALL', 'DELETE', 'UPDATE') AND roles::text LIKE '%service_role%') THEN
        RAISE EXCEPTION 'Post-flight check failed: Forbidden ALL, DELETE, or UPDATE policy exists for service_role on legacy_saas_manual_review_actions.';
    END IF;

    -- Check idempotency unique constraint
    IF NOT EXISTS (
        SELECT FROM pg_constraint 
        WHERE conname = 'uq_legacy_saas_review_event' AND contype = 'u'
    ) THEN
        RAISE EXCEPTION 'Post-flight check failed: Idempotency unique constraint uq_legacy_saas_review_event not found.';
    END IF;

    -- Check immutability function exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'legacy_saas_v1_prevent_action_modification'
    ) THEN
        RAISE EXCEPTION 'Post-flight check failed: function public.legacy_saas_v1_prevent_action_modification not found.';
    END IF;

    -- Check payment type validation function exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'legacy_saas_v1_check_payment_type'
    ) THEN
        RAISE EXCEPTION 'Post-flight check failed: function public.legacy_saas_v1_check_payment_type not found.';
    END IF;

    -- Check immutability trigger attached to actions table
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger t
        JOIN pg_class c ON t.tgrelid = c.oid
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE t.tgname = 'trg_legacy_saas_v1_prevent_action_mod'
        AND c.relname = 'legacy_saas_manual_review_actions'
        AND n.nspname = 'public'
    ) THEN
        RAISE EXCEPTION 'Post-flight check failed: trigger trg_legacy_saas_v1_prevent_action_mod not found on legacy_saas_manual_review_actions.';
    END IF;

    -- Check payment type trigger attached to reviews table
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger t
        JOIN pg_class c ON t.tgrelid = c.oid
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE t.tgname = 'trg_legacy_saas_v1_check_payment_type'
        AND c.relname = 'legacy_saas_manual_reviews'
        AND n.nspname = 'public'
    ) THEN
        RAISE EXCEPTION 'Post-flight check failed: trigger trg_legacy_saas_v1_check_payment_type not found on legacy_saas_manual_reviews.';
    END IF;

    -- Check strict service_role privileges for legacy_saas_manual_reviews
    IF NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants WHERE grantee = 'service_role' AND table_schema = 'public' AND table_name = 'legacy_saas_manual_reviews' AND privilege_type = 'SELECT') THEN
        RAISE EXCEPTION 'Post-flight check failed: Missing service_role SELECT privilege on legacy_saas_manual_reviews.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants WHERE grantee = 'service_role' AND table_schema = 'public' AND table_name = 'legacy_saas_manual_reviews' AND privilege_type = 'INSERT') THEN
        RAISE EXCEPTION 'Post-flight check failed: Missing service_role INSERT privilege on legacy_saas_manual_reviews.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants WHERE grantee = 'service_role' AND table_schema = 'public' AND table_name = 'legacy_saas_manual_reviews' AND privilege_type = 'UPDATE') THEN
        RAISE EXCEPTION 'Post-flight check failed: Missing service_role UPDATE privilege on legacy_saas_manual_reviews.';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.role_table_grants WHERE grantee = 'service_role' AND table_schema = 'public' AND table_name = 'legacy_saas_manual_reviews' AND privilege_type = 'DELETE') THEN
        RAISE EXCEPTION 'Post-flight check failed: service_role has forbidden DELETE privilege on legacy_saas_manual_reviews.';
    END IF;

    -- Check strict service_role privileges for legacy_saas_manual_review_actions
    IF NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants WHERE grantee = 'service_role' AND table_schema = 'public' AND table_name = 'legacy_saas_manual_review_actions' AND privilege_type = 'SELECT') THEN
        RAISE EXCEPTION 'Post-flight check failed: Missing service_role SELECT privilege on legacy_saas_manual_review_actions.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants WHERE grantee = 'service_role' AND table_schema = 'public' AND table_name = 'legacy_saas_manual_review_actions' AND privilege_type = 'INSERT') THEN
        RAISE EXCEPTION 'Post-flight check failed: Missing service_role INSERT privilege on legacy_saas_manual_review_actions.';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.role_table_grants WHERE grantee = 'service_role' AND table_schema = 'public' AND table_name = 'legacy_saas_manual_review_actions' AND privilege_type IN ('UPDATE', 'DELETE')) THEN
        RAISE EXCEPTION 'Post-flight check failed: service_role has forbidden UPDATE or DELETE privileges on legacy_saas_manual_review_actions.';
    END IF;

    -- Post-flight validation of untouched tables (no structural changes in this transaction to these)
    -- Guaranteed by the script content: no policy or modification applied to schools, payment_intents, or saas_subscription_quotes.
END $$;

COMMIT;
