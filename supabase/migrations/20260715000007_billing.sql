-- Migration : 20260715000007_billing.sql
-- Module : Billing & Subscriptions

-- 1. Table des Plans d'abonnement (saas_billing_plans)
CREATE TABLE IF NOT EXISTS public.saas_billing_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    price_amount INTEGER NOT NULL DEFAULT 0, -- en centimes
    currency TEXT NOT NULL DEFAULT 'USD',
    interval TEXT NOT NULL DEFAULT 'month', -- 'month', 'year', 'one_time'
    modules TEXT[] DEFAULT '{}', -- Modules activés par ce plan
    quotas JSONB DEFAULT '{}', -- Limites de ce plan (ex: max_users, max_ai_tokens)
    stripe_price_id TEXT UNIQUE,
    paystack_plan_code TEXT UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Trigger updated_at
CREATE OR REPLACE TRIGGER set_updated_at_billing_plans
    BEFORE UPDATE ON public.saas_billing_plans
    FOR EACH ROW
    EXECUTE FUNCTION public.saas_handle_updated_at();

-- 2. Table des Abonnements Locataires (saas_subscriptions)
CREATE TABLE IF NOT EXISTS public.saas_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES public.saas_billing_plans(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'incomplete', -- active, past_due, canceled, trialing
    gateway TEXT NOT NULL DEFAULT 'stripe', -- stripe, paystack, manual
    gateway_subscription_id TEXT UNIQUE,
    current_period_start TIMESTAMP WITH TIME ZONE,
    current_period_end TIMESTAMP WITH TIME ZONE,
    cancel_at_period_end BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(tenant_id) -- Un locataire = un abonnement actif maximum
);

CREATE OR REPLACE TRIGGER set_updated_at_subscriptions
    BEFORE UPDATE ON public.saas_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION public.saas_handle_updated_at();

-- 3. Row-Level Security (RLS)

-- saas_billing_plans (Public en lecture, Admin backend en écriture)
ALTER TABLE public.saas_billing_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Billing Plans are viewable by everyone." ON public.saas_billing_plans
    FOR SELECT USING (true);

-- saas_subscriptions (Lecture pour SAAS_SUPER_ADMIN et TENANT_ADMIN)
ALTER TABLE public.saas_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "SAAS_SUPER_ADMIN can view all subscriptions" ON public.saas_subscriptions
    FOR SELECT USING (
        (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'SAAS_SUPER_ADMIN'
    );

CREATE POLICY "TENANT_ADMIN can view their tenant's subscription" ON public.saas_subscriptions
    FOR SELECT USING (
        saas_subscriptions.tenant_id = (SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id', '')::uuid)
        AND
        (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'TENANT_ADMIN'
    );

-- Les écritures sur saas_subscriptions et saas_billing_plans se font uniquement via le Service Role.
CREATE POLICY "Disable insert for users" ON public.saas_subscriptions FOR INSERT WITH CHECK (false);
CREATE POLICY "Disable update for users" ON public.saas_subscriptions FOR UPDATE USING (false);
CREATE POLICY "Disable delete for users" ON public.saas_subscriptions FOR DELETE USING (false);

-- (Même chose pour les écritures sur saas_billing_plans si on veut être strict)
CREATE POLICY "Disable insert for users on plans" ON public.saas_billing_plans FOR INSERT WITH CHECK (false);
CREATE POLICY "Disable update for users on plans" ON public.saas_billing_plans FOR UPDATE USING (false);
CREATE POLICY "Disable delete for users on plans" ON public.saas_billing_plans FOR DELETE USING (false);
