-- ============================================================================
-- Rollback P13 : Annulation pré-trafic de la fondation financière Ambassadeurs
-- ============================================================================
-- ATTENTION : Ce script d'annulation est EXCLUSIVEMENT réservé à un usage
-- pré-trafic (déploiement avorté avant mise en service ou tests locaux).
-- Il REFUSE formellement de s'exécuter si la moindre écriture financière
-- a été enregistrée dans les tables du Grand Livre ou des soldes.
-- ============================================================================

-- 1. Contrôle d'intégrité : arrêt immédiat si des données financières existent
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'affiliate_ledger') THEN
        IF EXISTS (SELECT 1 FROM public.affiliate_ledger) THEN
            RAISE EXCEPTION 'ROLLBACK_ABORTED_FINANCIAL_DATA_PRESENT: Des écritures existent dans affiliate_ledger. Rollback pré-trafic refusé.';
        END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'affiliate_commission_releases') THEN
        IF EXISTS (SELECT 1 FROM public.affiliate_commission_releases) THEN
            RAISE EXCEPTION 'ROLLBACK_ABORTED_FINANCIAL_DATA_PRESENT: Des libérations existent dans affiliate_commission_releases. Rollback pré-trafic refusé.';
        END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'affiliate_withdrawals') THEN
        IF EXISTS (SELECT 1 FROM public.affiliate_withdrawals) THEN
            RAISE EXCEPTION 'ROLLBACK_ABORTED_FINANCIAL_DATA_PRESENT: Des retraits existent dans affiliate_withdrawals. Rollback pré-trafic refusé.';
        END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'affiliate_balances') THEN
        IF EXISTS (SELECT 1 FROM public.affiliate_balances WHERE pending_balance_minor > 0 OR available_balance_minor > 0 OR reserved_balance_minor > 0 OR debt_balance_minor > 0) THEN
            RAISE EXCEPTION 'ROLLBACK_ABORTED_FINANCIAL_DATA_PRESENT: Des soldes financiers non nuls existent dans affiliate_balances. Rollback pré-trafic refusé.';
        END IF;
    END IF;
END $$;

-- 2. Révocation des privilèges d'exécution sur les fonctions RPC
REVOKE ALL ON FUNCTION public.process_fedapay_webhook_event_v2(VARCHAR, VARCHAR, VARCHAR, UUID, TEXT, NUMERIC, TEXT, TEXT, TIMESTAMPTZ, NUMERIC, NUMERIC, BOOLEAN) FROM service_role, postgres;
REVOKE ALL ON FUNCTION public.admin_reconcile_affiliate_commission_atomic(UUID, TIMESTAMPTZ, NUMERIC, NUMERIC, TEXT) FROM service_role, postgres;
REVOKE ALL ON FUNCTION public.release_matured_commissions_atomic(INTEGER) FROM service_role, postgres;
REVOKE ALL ON FUNCTION public.affiliate_request_withdrawal_atomic(UUID, VARCHAR, BIGINT, VARCHAR, JSONB, VARCHAR) FROM service_role, postgres;
REVOKE ALL ON FUNCTION public.admin_process_affiliate_withdrawal_atomic(UUID, VARCHAR, TEXT, TEXT, TEXT) FROM service_role, postgres;
REVOKE ALL ON FUNCTION public.admin_create_affiliate_adjustment_atomic(UUID, VARCHAR, BIGINT, TEXT, VARCHAR, TEXT, TEXT) FROM service_role, postgres;
REVOKE ALL ON FUNCTION public.log_affiliate_error_event(VARCHAR, VARCHAR, VARCHAR) FROM service_role, postgres;

-- 3. Suppression des fonctions RPC créées dans P13
DROP FUNCTION IF EXISTS public.process_fedapay_webhook_event_v2(VARCHAR, VARCHAR, VARCHAR, UUID, TEXT, NUMERIC, TEXT, TEXT, TIMESTAMPTZ, NUMERIC, NUMERIC, BOOLEAN);
DROP FUNCTION IF EXISTS public.admin_reconcile_affiliate_commission_atomic(UUID, TIMESTAMPTZ, NUMERIC, NUMERIC, TEXT);
DROP FUNCTION IF EXISTS public.release_matured_commissions_atomic(INTEGER);
DROP FUNCTION IF EXISTS public.affiliate_request_withdrawal_atomic(UUID, VARCHAR, BIGINT, VARCHAR, JSONB, VARCHAR);
DROP FUNCTION IF EXISTS public.admin_process_affiliate_withdrawal_atomic(UUID, VARCHAR, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admin_create_affiliate_adjustment_atomic(UUID, VARCHAR, BIGINT, TEXT, VARCHAR, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.log_affiliate_error_event(VARCHAR, VARCHAR, VARCHAR);

-- 4. Suppression du trigger et de la fonction d'immutabilité du grand livre
DROP TRIGGER IF EXISTS trg_prevent_affiliate_ledger_mutation ON public.affiliate_ledger;
DROP FUNCTION IF EXISTS public.fn_prevent_affiliate_ledger_mutation();

-- 5. Suppression explicite des tables dans l'ordre inverse des clés étrangères (SANS CASCADE)
DROP TABLE IF EXISTS public.affiliate_error_events;
DROP TABLE IF EXISTS public.affiliate_commission_releases;
DROP TABLE IF EXISTS public.affiliate_withdrawal_audit_log;
DROP TABLE IF EXISTS public.affiliate_ledger;
DROP TABLE IF EXISTS public.affiliate_withdrawals;
DROP TABLE IF EXISTS public.affiliate_balances;
DROP TABLE IF EXISTS public.webhook_events;
DROP TABLE IF EXISTS public.currency_configurations;

-- 6. Nettoyage des colonnes ajoutées sur les tables historiques existantes
ALTER TABLE public.schools DROP COLUMN IF EXISTS first_successful_payment_at;
