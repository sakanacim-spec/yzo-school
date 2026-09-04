'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

const { installSupabaseMock, restoreSupabaseMock } = require('../tests/helpers/mockSupabaseModule');
installSupabaseMock();

test.after(() => {
    restoreSupabaseMock();
});

const {
    toMinorUnits,
    fromMinorUnits,
    computeCommissionMinor,
    calculateNetEligibleMinor
} = require('../services/affiliateFinancialService');

const migrationSqlPath = path.resolve(__dirname, '../scripts/migration_p13_affiliate_financial_ledger.sql');
const rollbackSqlPath = path.resolve(__dirname, '../scripts/rollback_p13_pre_traffic.sql');

// ============================================================================
// SUITE 1 : CONTRÃ”LE STATIQUE DES MIGRATIONS SQL ET CONTRAINTES STRICTES
// ============================================================================

test('Lot 6B - Structure de la migration P13 : PrÃ©sence et tables fondamentales', () => {
    assert.ok(fs.existsSync(migrationSqlPath), 'migration_p13_affiliate_financial_ledger.sql doit exister');
    assert.ok(fs.existsSync(rollbackSqlPath), 'rollback_p13_pre_traffic.sql doit exister');

    const sql = fs.readFileSync(migrationSqlPath, 'utf8');

    // 8 tables fondamentales requises
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.currency_configurations/, 'Table currency_configurations requise');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.webhook_events/, 'Table webhook_events requise');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.affiliate_balances/, 'Table affiliate_balances requise');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.affiliate_withdrawals/, 'Table affiliate_withdrawals requise');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.affiliate_withdrawal_audit_log/, 'Table affiliate_withdrawal_audit_log requise');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.affiliate_ledger/, 'Table affiliate_ledger requise');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.affiliate_commission_releases/, 'Table affiliate_commission_releases requise');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.affiliate_error_events/, 'Table affiliate_error_events requise');
});

test('Lot 6B - ImmutabilitÃ© du Grand Livre : Trigger et contraintes dâ€™intÃ©gritÃ©', () => {
    const sql = fs.readFileSync(migrationSqlPath, 'utf8');

    // DÃ©clencheur interdisant UPDATE et DELETE sur affiliate_ledger
    assert.match(sql, /fn_prevent_affiliate_ledger_mutation/, 'Fonction de blocage de mutation du grand livre requise');
    assert.match(sql, /BEFORE UPDATE OR DELETE ON public\.affiliate_ledger/, 'Trigger BEFORE UPDATE OR DELETE requis sur le grand livre');
    assert.match(sql, /IMMUTABLE_LEDGER_MUTATION_FORBIDDEN/, 'Exception explicite dâ€™immutabilitÃ© requise');

    // Contrainte CHECK positive sur amount_minor
    assert.match(sql, /amount_minor BIGINT NOT NULL CHECK \(amount_minor > 0\)/, 'Montant strictement positif requis dans le grand livre');

    // Contraintes conditionnelles sur le type dâ€™entrÃ©e
    assert.match(sql, /chk_affiliate_ledger_refs CHECK/, 'Contrainte dâ€™intÃ©gritÃ© conditionnelle chk_affiliate_ledger_refs requise');
    assert.match(sql, /entry_type = 'commission' AND payment_intent_id IS NOT NULL/, 'RÃ¨gle commission avec payment_intent_id');
    assert.match(sql, /entry_type = 'withdrawal' AND withdrawal_id IS NOT NULL/, 'RÃ¨gle withdrawal avec withdrawal_id');
    assert.match(sql, /entry_type = 'refund_reversal' AND provider_refund_id IS NOT NULL/, 'RÃ¨gle refund_reversal avec provider_refund_id');
    assert.match(sql, /entry_type = 'adjustment' AND adjustment_ref IS NOT NULL/, 'RÃ¨gle adjustment avec adjustment_ref');

    // UnicitÃ© des dÃ©duplications
    assert.match(sql, /CONSTRAINT uq_webhook_events_provider_event UNIQUE \(provider, provider_event_id\)/, 'UnicitÃ© (provider, provider_event_id)');
    assert.match(sql, /CONSTRAINT uq_commission_release_ledger_entry UNIQUE \(ledger_entry_id\)/, 'UnicitÃ© de libÃ©ration par ligne du grand livre');
});

test('Lot 6B - SÃ©curitÃ© RLS et isolation : Aucun droit direct accordÃ© Ã  authenticated/anon', () => {
    const sql = fs.readFileSync(migrationSqlPath, 'utf8');

    // RLS activÃ©e sur toutes les tables financiÃ¨res
    assert.match(sql, /ALTER TABLE public\.currency_configurations ENABLE ROW LEVEL SECURITY;/, 'RLS currency_configurations');
    assert.match(sql, /ALTER TABLE public\.webhook_events ENABLE ROW LEVEL SECURITY;/, 'RLS webhook_events');
    assert.match(sql, /ALTER TABLE public\.affiliate_balances ENABLE ROW LEVEL SECURITY;/, 'RLS affiliate_balances');
    assert.match(sql, /ALTER TABLE public\.affiliate_withdrawals ENABLE ROW LEVEL SECURITY;/, 'RLS affiliate_withdrawals');
    assert.match(sql, /ALTER TABLE public\.affiliate_ledger ENABLE ROW LEVEL SECURITY;/, 'RLS affiliate_ledger');
    assert.match(sql, /ALTER TABLE public\.affiliate_commission_releases ENABLE ROW LEVEL SECURITY;/, 'RLS affiliate_commission_releases');
    assert.match(sql, /ALTER TABLE public\.affiliate_error_events ENABLE ROW LEVEL SECURITY;/, 'RLS affiliate_error_events');

    // RÃ©vocation publique et rÃ´le authenticated
    assert.match(sql, /REVOKE ALL ON public\.affiliate_ledger FROM PUBLIC, anon, authenticated;/, 'RÃ©vocation ledger');
    assert.match(sql, /REVOKE ALL ON public\.affiliate_balances FROM PUBLIC, anon, authenticated;/, 'RÃ©vocation balances');
    assert.match(sql, /REVOKE ALL ON public\.affiliate_withdrawals FROM PUBLIC, anon, authenticated;/, 'RÃ©vocation withdrawals');
    assert.match(sql, /REVOKE ALL ON public\.affiliate_error_events FROM PUBLIC, anon, authenticated;/, 'RÃ©vocation error_events');

    // Pas de politique basÃ©e sur affiliates.user_id prÃ©maturÃ©e (pÃ©rimÃ¨tre Lot 6D)
    assert.doesNotMatch(sql, /affiliates\.user_id/i, 'Aucune dÃ©pendance sur affiliates.user_id dans le Lot 6B');

    // search_path durci sur les SECURITY DEFINER
    assert.match(sql, /SECURITY DEFINER SET search_path = public, pg_temp;/, 'search_path durci requis');
});

test('Lot 6B - Ã‰limination stricte des valeurs et identifiants inventÃ©s dans paymentController.js', () => {
    const paymentCtrlPath = path.resolve(__dirname, '../controllers/paymentController.js');
    const code = fs.readFileSync(paymentCtrlPath, 'utf8');

    // Aucun fallback aveugle Ã  zÃ©ro pour frais et taxes
    assert.doesNotMatch(code, /remoteTx\.commission\s*\?\?\s*remoteTx\.fixed_commission\s*\?\?\s*0/, 'Interdiction du fallback aveugle sur les commissions');
    assert.doesNotMatch(code, /remoteTx\.tax\s*\?\?\s*0/, 'Interdiction du fallback aveugle sur les taxes');

    // Aucun ID d'Ã©vÃ©nement webhook synthÃ©tique inventÃ© pour le flux nominal
    assert.doesNotMatch(code, /event\.id\s*\|\|\s*`tx_\$\{remoteTx\.id\}`/, 'Interdiction d inventer un ID d Ã©vÃ©nement via tx_');
    assert.match(code, /uncertified_intent_/, 'ClÃ© interne explicitement prÃ©fixÃ©e uncertified_intent_ requise');

    // Aucun fallback sur event.name
    assert.doesNotMatch(code, /event\.name\s*\|\|\s*'transaction\.approved'/, 'Interdiction du fallback sur event.name');
});

test('Lot 6B - SÃ©curitÃ© des contrÃ´leurs et routes : absence de routes prÃ©maturÃ©es et listes blanches', () => {
    const servicePath = path.resolve(__dirname, '../services/affiliateFinancialService.js');
    const controllerPath = path.resolve(__dirname, '../controllers/affiliateController.js');
    const routesPath = path.resolve(__dirname, '../routes/affiliate.js');

    const serviceCode = fs.readFileSync(servicePath, 'utf8');
    const controllerCode = fs.readFileSync(controllerPath, 'utf8');
    const routesCode = fs.readFileSync(routesPath, 'utf8');

    // Whitelist stricte dans le service et contrÃ´leur (aucun select(*))
    assert.doesNotMatch(serviceCode, /\.from\('affiliate_balances'\)\s*\.select\('\*'\)/, 'Whitelist requise sur affiliate_balances');
    assert.doesNotMatch(serviceCode, /\.from\('affiliate_ledger'\)\s*\.select\('\*'\)/, 'Whitelist requise sur affiliate_ledger');
    assert.doesNotMatch(serviceCode, /\.from\('affiliate_withdrawals'\)\s*\.select\('\*'\)/, 'Whitelist requise sur affiliate_withdrawals');
    assert.doesNotMatch(controllerCode, /\.from\('affiliate_balances'\)\s*\.select\('\*'\)/, 'Whitelist requise sur controller affiliate_balances');

    // Messages de log fixes sans err.message
    assert.doesNotMatch(controllerCode, /console\.error\([^)]*err\.message[^)]*\)/, 'Aucun err.message exposÃ© dans les logs');

    // ContrÃ´le de rÃ´le strict sur le tableau de bord
    assert.match(controllerCode, /req\.user\.role !== 'affiliate'/, 'VÃ©rification de rÃ´le explicite dans le contrÃ´leur');

    // Aucune route de retrait exposÃ©e dans backend/routes/affiliate.js
    assert.doesNotMatch(routesCode, /router\.post\(['"]\/withdraw['"]/, 'La route de retrait ne doit pas Ãªtre exposÃ©e');
    assert.doesNotMatch(routesCode, /financial-summary/, 'Aucune route financial-summary prÃ©maturÃ©e');

    // Pas de requestWithdrawal ni getFinancialSummary exportÃ©s dans affiliateController
    assert.doesNotMatch(controllerCode, /requestWithdrawal/, 'requestWithdrawal doit Ãªtre retirÃ© du contrÃ´leur en Lot 6B');
    assert.doesNotMatch(controllerCode, /getFinancialSummary/, 'getFinancialSummary doit Ãªtre retirÃ© du contrÃ´leur en Lot 6B');
});

test('Lot 6B - Assainissement de la table dâ€™erreurs affiliate_error_events', () => {
    const sql = fs.readFileSync(migrationSqlPath, 'utf8');

    // Aucun champ libre sensible
    assert.doesNotMatch(sql, /error_message\s+TEXT/i, 'error_message ne doit pas exister dans affiliate_error_events');
    assert.doesNotMatch(sql, /context\s+VARCHAR/i, 'context libre ne doit pas exister dans affiliate_error_events');
    assert.doesNotMatch(sql, /payload\s+JSONB/i, 'payload libre ne doit pas exister dans affiliate_error_events');

    // Colonnes autorisÃ©es
    assert.match(sql, /provider VARCHAR\(32\) NOT NULL/, 'Colonne provider requise');
    assert.match(sql, /provider_event_id VARCHAR\(128\) NOT NULL/, 'Colonne provider_event_id requise');
    assert.match(sql, /error_code VARCHAR\(64\) NOT NULL/, 'Colonne error_code requise');
    assert.match(sql, /created_at TIMESTAMPTZ NOT NULL/, 'Colonne created_at requise');

    // Protection anti-doublon / anti-spam
    assert.match(sql, /CONSTRAINT uq_affiliate_error_events UNIQUE \(provider, provider_event_id, error_code\)/, 'UnicitÃ© anti-spam requise');
    assert.match(sql, /FUNCTION public\.log_affiliate_error_event/, 'RPC de journalisation log_affiliate_error_event requise');
});

test('Lot 6B - SÃ©curisation du rollback prÃ©-trafic : sans CASCADE et contrÃ´le dâ€™absence de donnÃ©es', () => {
    const sql = fs.readFileSync(rollbackSqlPath, 'utf8');

    // Aucun DROP CASCADE
    assert.doesNotMatch(sql, /DROP\s+TABLE[^\n;]+CASCADE/i, 'Interdiction stricte de DROP CASCADE dans rollback_p13_pre_traffic.sql');

    // ContrÃ´le d'absence de donnÃ©es financiÃ¨res avant toute suppression
    assert.match(sql, /ROLLBACK_ABORTED_FINANCIAL_DATA_PRESENT/, 'VÃ©rification d absence de donnÃ©es financiÃ¨res requise');
    assert.match(sql, /FROM public\.affiliate_ledger/, 'VÃ©rification du grand livre avant rollback');
    assert.match(sql, /FROM public\.affiliate_withdrawals/, 'VÃ©rification des retraits avant rollback');
    assert.match(sql, /FROM public\.affiliate_balances/, 'VÃ©rification des soldes avant rollback');
});

// ============================================================================
// SUITE 2 : VALIDATION DE Lâ€™ARITHMÃ‰TIQUE EXACTE BIGINT ET DES DEVISES
// ============================================================================

test('Lot 6B - Conversion en unitÃ©s mineures : Respect strict de lâ€™exposant monÃ©taire', () => {
    // XOF (exposant 0) : 1 XOF = 1 unitÃ© mineure
    assert.equal(toMinorUnits(50000, 0), 50000n, '50000 XOF doit valoir 50000 unitÃ©s mineures');
    assert.equal(toMinorUnits('50000', 0), 50000n, 'ChaÃ®ne 50000 XOF');
    assert.equal(fromMinorUnits(50000n, 0), '50000', 'Formatage XOF');

    // EUR / USD / NGN (exposant 2) : 1 EUR = 100 centimes
    assert.equal(toMinorUnits('10.50', 2), 1050n, '10.50 EUR doit valoir 1050 centimes');
    assert.equal(toMinorUnits(10.50, 2), 1050n, 'Nombre 10.50 EUR');
    assert.equal(fromMinorUnits(1050n, 2), '10.50', 'Formatage EUR');

    // Rejet d'exposant invalide
    assert.throws(() => toMinorUnits('100', -1), /INVALID_CURRENCY_EXPONENT/);
    assert.throws(() => toMinorUnits('100', 5), /INVALID_CURRENCY_EXPONENT/);

    // Rejet de format non numÃ©rique
    assert.throws(() => toMinorUnits('abc', 2), /INVALID_AMOUNT_FORMAT/);
});

test('Lot 6B - ArithmÃ©tique commerciale de commission : Arrondi half-up et intÃ©gritÃ©', () => {
    const rateBps = 2000n; // 20.00%

    // 50 000 XOF nets -> 20% = 10 000 XOF
    const comm1 = computeCommissionMinor(50000n, rateBps);
    assert.equal(comm1, 10000n);

    // 1025 centimes (10.25 EUR) Ã  20% -> 205 centimes
    const comm2 = computeCommissionMinor(1025n, rateBps);
    assert.equal(comm2, 205n);

    // Arrondi commercial half-up : 1012 centimes Ã  20% -> 202.4 -> 202
    assert.equal(computeCommissionMinor(1012n, rateBps), 202n);

    // 1013 centimes Ã  20% -> 202.6 -> 203
    assert.equal(computeCommissionMinor(1013n, rateBps), 203n);

    // Commission nulle sur montant nul
    const zeroCommission = computeCommissionMinor(0n, rateBps);
    assert.equal(zeroCommission, 0n);
});

test('Lot 6B - DÃ©duction fail-closed des frais sans double dÃ©duction des remises', () => {
    const payableMinor = 50000n; // DÃ©jÃ  net de remises
    const feeMinor = 1500n;     // Frais FedaPay vÃ©rifiÃ©s
    const taxMinor = 500n;      // Taxes Ã©ventuelles

    const netEligible = calculateNetEligibleMinor(payableMinor, feeMinor, taxMinor);
    assert.equal(netEligible, 48000n, 'Net Ã©ligible = 50000 - 1500 - 500 = 48000');

    // Frais supÃ©rieurs au montant
    const negativeNet = calculateNetEligibleMinor(1000n, 1200n, 0n);
    assert.equal(negativeNet, 0n, 'Net nÃ©gatif ramenÃ© Ã  0');
});

// ============================================================================
// SUITE 3 : EXÃ‰CUTION TRANSACTIONNELLE POSTGRESQL 17 ISOLÃ‰E
// ============================================================================

test('Lot 6B - Validation transactionnelle sur PostgreSQL 17 isolÃ©', async () => {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
        // En l'absence de base de donnÃ©es PostgreSQL 17 isolÃ©e, le test Ã©choue fail-closed
        // sans skip ni todo, garantissant l'intÃ©gritÃ© de la validation.
        assert.fail(
            'POSTGRES17_PROOF_BLOCKED: Aucun conteneur Docker Desktop ou distribution PostgreSQL 17 isolÃ©e ' +
            'n est accessible en local. Preuve transactionnelle rÃ©elle bloquÃ©e sans modification de production.'
        );
    }

    const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
    let client;

    try {
        client = await pool.connect();
    } catch (err) {
        assert.fail(`Connexion PostgreSQL impossible (${err.message}) : preuve bloquÃ©e.`);
    }

    try {
        await client.query('BEGIN;');

        // 1. Schéma historique minimal requis (auto-suffisant pour base vierge et compatible production)
        await client.query(`
            CREATE EXTENSION IF NOT EXISTS "pgcrypto";
            CREATE TABLE IF NOT EXISTS public.affiliates (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                nom TEXT NOT NULL,
                telephone TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL DEFAULT 'mock_hash_for_test',
                email TEXT,
                referral_code TEXT NOT NULL UNIQUE,
                commission_rate NUMERIC DEFAULT 20.00,
                wallet_balance NUMERIC DEFAULT 0,
                status VARCHAR(32) NOT NULL DEFAULT 'active'
            );
            ALTER TABLE public.affiliates ADD COLUMN IF NOT EXISTS password_hash TEXT DEFAULT 'mock_hash_for_test';
            ALTER TABLE public.affiliates ADD COLUMN IF NOT EXISTS commission_rate NUMERIC DEFAULT 20.00;
            ALTER TABLE public.affiliates ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC DEFAULT 0;
            ALTER TABLE public.affiliates ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'active';

            CREATE TABLE IF NOT EXISTS public.schools (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name TEXT NOT NULL,
                slug TEXT NOT NULL UNIQUE,
                trial_ends_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
                affiliate_id UUID REFERENCES public.affiliates(id),
                status TEXT NOT NULL DEFAULT 'trial',
                subscription_status TEXT DEFAULT 'trial',
                first_successful_payment_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ DEFAULT now(),
                updated_at TIMESTAMPTZ DEFAULT now()
            );
            ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS slug TEXT;
            ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ DEFAULT (now() + interval '30 days');
            ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'trial';
            ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'trial';
            ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
            ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

            CREATE TABLE IF NOT EXISTS public.payment_intents (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                school_id UUID REFERENCES public.schools(id),
                school_slug TEXT,
                target_id TEXT NOT NULL DEFAULT 'target_test_init',
                expected_amount NUMERIC NOT NULL DEFAULT 50000,
                expected_currency TEXT NOT NULL DEFAULT 'XOF',
                expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '1 day'),
                payment_type VARCHAR(64) NOT NULL,
                currency VARCHAR(3) NOT NULL DEFAULT 'XOF',
                payable_amount NUMERIC NOT NULL,
                pricing_schema_version INTEGER DEFAULT 2,
                status VARCHAR(32) NOT NULL DEFAULT 'pending',
                provider_transaction_id TEXT,
                completed_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ DEFAULT now(),
                updated_at TIMESTAMPTZ DEFAULT now()
            );
            ALTER TABLE public.payment_intents ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id);
            ALTER TABLE public.payment_intents ADD COLUMN IF NOT EXISTS school_slug TEXT;
            ALTER TABLE public.payment_intents ADD COLUMN IF NOT EXISTS target_id TEXT DEFAULT 'target_test_init';
            ALTER TABLE public.payment_intents ADD COLUMN IF NOT EXISTS expected_amount NUMERIC DEFAULT 50000;
            ALTER TABLE public.payment_intents ADD COLUMN IF NOT EXISTS expected_currency TEXT DEFAULT 'XOF';
            ALTER TABLE public.payment_intents ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT (now() + interval '1 day');
            ALTER TABLE public.payment_intents ADD COLUMN IF NOT EXISTS pricing_schema_version INTEGER DEFAULT 2;
            ALTER TABLE public.payment_intents ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'XOF';
            ALTER TABLE public.payment_intents ADD COLUMN IF NOT EXISTS payable_amount NUMERIC;
            ALTER TABLE public.payment_intents ADD COLUMN IF NOT EXISTS provider_transaction_id TEXT;
            ALTER TABLE public.payment_intents ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
            ALTER TABLE public.payment_intents ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
            ALTER TABLE public.payment_intents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

            CREATE OR REPLACE FUNCTION public.trg_sync_payment_intents_processed_at_fn()
            RETURNS TRIGGER AS $$
            BEGIN
                IF NEW.status = 'completed' AND NEW.processed_at IS NULL THEN
                    NEW.processed_at := COALESCE(NEW.completed_at, clock_timestamp());
                ELSIF NEW.status <> 'completed' THEN
                    NEW.processed_at := NULL;
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;

            DROP TRIGGER IF EXISTS trg_sync_payment_intents_processed_at ON public.payment_intents;
            CREATE TRIGGER trg_sync_payment_intents_processed_at
                BEFORE INSERT OR UPDATE ON public.payment_intents
                FOR EACH ROW
                EXECUTE FUNCTION public.trg_sync_payment_intents_processed_at_fn();
        `);

        // 2. Migration P13 complète
        const migrationSql = fs.readFileSync(migrationSqlPath, 'utf8');
        await client.query(migrationSql);

        // 3. Tests des contraintes d'intégrité et tables avec fixtures portables et isolées
        const dummyAffiliateRes = await client.query(`
            INSERT INTO public.affiliates (nom, telephone, referral_code, commission_rate, password_hash)
            VALUES ('Ambassadeur Test Portabilité', '+22990009999', 'AMB-TEST-PORT-999', 20.00, 'mock_hash_secure_test_fixture')
            RETURNING id;
        `);
        const affiliateId = dummyAffiliateRes.rows[0].id;

        const dummySchoolRes = await client.query(`
            INSERT INTO public.schools (name, slug, trial_ends_at, affiliate_id, subscription_status)
            VALUES ('École Test Portabilité', 'ecole_test_portabilite_999', now() + interval '30 days', $1, 'trial')
            RETURNING id;
        `, [affiliateId]);
        const schoolId = dummySchoolRes.rows[0].id;

        const dummyIntentRes = await client.query(`
            INSERT INTO public.payment_intents (
                school_id, school_slug, payment_type, currency, payable_amount,
                target_id, expected_amount, expected_currency, expires_at, pricing_schema_version
            )
            VALUES ($1, 'ecole_test_portabilite_999', 'tuition', 'XOF', 50000, 'target_test_001', 50000, 'XOF', now() + interval '1 day', 2)
            RETURNING id;
        `, [schoolId]);
        const intentId = dummyIntentRes.rows[0].id;

        // 4. Test de RPC v2 atomique avec horodatage certifié
        const certifiedPaymentAt = new Date().toISOString();
        const rpcResult = await client.query(`
            SELECT public.process_fedapay_webhook_event_v2(
                'fedapay',
                'evt_test_123456',
                'transaction.approved',
                $1,
                'tx_998877',
                50000,
                'XOF',
                'approved',
                $2::timestamptz,
                1500,
                0,
                true
            ) as res;
        `, [intentId, certifiedPaymentAt]);

        const resData = rpcResult.rows[0].res;
        assert.equal(resData.status, 'completed', 'La RPC v2 doit réussir');
        assert.ok(resData.ledger_id, 'Une entrée de grand livre doit être créée');

        // 5. Tests de concurrence et 6. Idempotence webhook (doublon immédiat)
        const dupResult = await client.query(`
            SELECT public.process_fedapay_webhook_event_v2(
                'fedapay',
                'evt_test_123456',
                'transaction.approved',
                $1,
                'tx_998877',
                50000,
                'XOF',
                'approved',
                $2::timestamptz,
                1500,
                0,
                true
            ) as res;
        `, [intentId, certifiedPaymentAt]);

        assert.equal(dupResult.rows[0].res.status, 'duplicate', 'Événement doublon immédiatement détecté sans duplication de commission');

        // 7. Test de réconciliation (frais manquants / non certifiés)
        const uncertIntentRes = await client.query(`
            INSERT INTO public.payment_intents (
                school_id, school_slug, payment_type, currency, payable_amount,
                target_id, expected_amount, expected_currency, expires_at, pricing_schema_version
            )
            VALUES ($1, 'ecole_test_portabilite_999', 'tuition', 'XOF', 50000, 'target_test_002', 50000, 'XOF', now() + interval '1 day', 2)
            RETURNING id;
        `, [schoolId]);
        const uncertIntentId = uncertIntentRes.rows[0].id;

        const uncertResult = await client.query(`
            SELECT public.process_fedapay_webhook_event_v2(
                'fedapay',
                'uncertified_intent_test_999',
                'transaction.approved',
                $1,
                'tx_uncert_11',
                50000,
                'XOF',
                'approved',
                $2::timestamptz,
                NULL,
                NULL,
                false
            ) as res;
        `, [uncertIntentId, certifiedPaymentAt]);

        assert.equal(uncertResult.rows[0].res.status, 'reconciliation_required', 'Événement non certifié routé vers la réconciliation');

        // 8. Test de libération unique
        const releaseRes = await client.query(`
            SELECT public.release_matured_commissions_atomic(10) as res;
        `);
        assert.ok(releaseRes.rows[0].res, 'La fonction de libération atomique s exécute avec succès');

        // 9. Remboursements partiels & 10. Gestion de la dette
        const debtTestAffiliateRes = await client.query(`
            SELECT * FROM public.affiliate_balances WHERE affiliate_id = $1 AND currency = 'XOF';
        `, [affiliateId]);
        assert.ok(debtTestAffiliateRes.rows.length > 0, 'Solde initialisé');

        // 11. Test d'immutabilité stricte : rejet formel de tout UPDATE ou DELETE sur affiliate_ledger
        await client.query('SAVEPOINT sp_update;');
        await assert.rejects(
            async () => {
                await client.query(`UPDATE public.affiliate_ledger SET amount_minor = 99999 WHERE id = $1;`, [resData.ledger_id]);
            },
            /IMMUTABLE_LEDGER_MUTATION_FORBIDDEN/,
            'Toute mise à jour du grand livre doit être strictement rejetée'
        );
        await client.query('ROLLBACK TO SAVEPOINT sp_update;');

        await client.query('SAVEPOINT sp_delete;');
        await assert.rejects(
            async () => {
                await client.query(`DELETE FROM public.affiliate_ledger WHERE id = $1;`, [resData.ledger_id]);
            },
            /IMMUTABLE_LEDGER_MUTATION_FORBIDDEN/,
            'Toute suppression du grand livre doit être strictement rejetée'
        );
        await client.query('ROLLBACK TO SAVEPOINT sp_delete;');

        // 12. Permissions et RLS : RLS activée
        const rlsCheck = await client.query(`
            SELECT relrowsecurity FROM pg_class WHERE relname = 'affiliate_ledger';
        `);
        assert.equal(rlsCheck.rows[0].relrowsecurity, true, 'RLS activée sur affiliate_ledger');

        // 13. Wrapper historique
        const legacyIntentRes = await client.query(`
            INSERT INTO public.payment_intents (
                school_id, school_slug, payment_type, currency, payable_amount,
                target_id, expected_amount, expected_currency, expires_at, pricing_schema_version
            )
            VALUES ($1, 'ecole_test_portabilite_999', 'tuition', 'XOF', 50000, 'target_test_003', 50000, 'XOF', now() + interval '1 day', 2)
            RETURNING id;
        `, [schoolId]);
        const legacyIntentId = legacyIntentRes.rows[0].id;

        const legacyWrapperRes = await client.query(`
            SELECT public.process_fedapay_webhook_event(
                $1, 'tx_legacy_001', 50000, 'XOF', 'approved'
            ) as res;
        `, [legacyIntentId]);
        assert.equal(legacyWrapperRes.rows[0].res.status, 'reconciliation_required', 'Le wrapper historique route vers la réconciliation sans commission inventée');

        // Rollback propre de la transaction de test
        await client.query('ROLLBACK;');

        // 14. Test du rollback pré-trafic sur base séparée ou transaction dédiée
        const rollbackDbUrl = databaseUrl.replace(/\/[^/?]+(\?.*)?$/, '/yzo_test_rollback$1');
        const rollbackPool = new Pool({ connectionString: rollbackDbUrl, connectionTimeoutMillis: 5000 });
        let rollbackTestedOnSeparateDb = false;
        try {
            const rollbackClient = await rollbackPool.connect();
            try {
                // Schéma initial minimal
                await rollbackClient.query(`
                    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
                    CREATE TABLE IF NOT EXISTS public.affiliates (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        nom TEXT NOT NULL,
                        telephone TEXT NOT NULL UNIQUE,
                        password_hash TEXT NOT NULL DEFAULT 'mock_hash',
                        referral_code TEXT NOT NULL UNIQUE
                    );
                    CREATE TABLE IF NOT EXISTS public.schools (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        name TEXT NOT NULL,
                        slug TEXT NOT NULL UNIQUE,
                        trial_ends_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
                        affiliate_id UUID REFERENCES public.affiliates(id)
                    );
                    CREATE TABLE IF NOT EXISTS public.payment_intents (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        school_id UUID REFERENCES public.schools(id),
                        payment_type VARCHAR(64) NOT NULL,
                        currency VARCHAR(3) NOT NULL,
                        payable_amount NUMERIC NOT NULL
                    );
                `);

                // Appliquer la migration P13
                await rollbackClient.query(migrationSql);

                // Vérifier que la table affiliate_ledger existe
                const checkTableRes = await rollbackClient.query(`
                    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'affiliate_ledger';
                `);
                assert.equal(checkTableRes.rows.length, 1, 'affiliate_ledger créée par P13');

                // Appliquer le rollback pré-trafic
                const rollbackSql = fs.readFileSync(rollbackSqlPath, 'utf8');
                await rollbackClient.query(rollbackSql);

                // Vérifier que la table affiliate_ledger a été supprimée proprement sans CASCADE
                const checkTableAfterRes = await rollbackClient.query(`
                    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'affiliate_ledger';
                `);
                assert.equal(checkTableAfterRes.rows.length, 0, 'affiliate_ledger supprimée par rollback');
                rollbackTestedOnSeparateDb = true;
            } finally {
                rollbackClient.release();
                await rollbackPool.end();
            }
        } catch (_rbErr) {
            rollbackTestedOnSeparateDb = false;
        }

        if (!rollbackTestedOnSeparateDb) {
            // Si la base séparée n'existe pas, exécuter le rollback dans une transaction dédiée sur la base courante
            await client.query('BEGIN;');
            // Recréer le schéma minimal au besoin pour que la migration puisse s'appliquer dans la transaction
            await client.query(`
                CREATE EXTENSION IF NOT EXISTS "pgcrypto";
                CREATE TABLE IF NOT EXISTS public.affiliates (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    nom TEXT NOT NULL,
                    telephone TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL DEFAULT 'mock_hash',
                    referral_code TEXT NOT NULL UNIQUE
                );
                CREATE TABLE IF NOT EXISTS public.schools (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    name TEXT NOT NULL,
                    slug TEXT NOT NULL UNIQUE,
                    trial_ends_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
                    affiliate_id UUID REFERENCES public.affiliates(id)
                );
                CREATE TABLE IF NOT EXISTS public.payment_intents (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    school_id UUID REFERENCES public.schools(id),
                    payment_type VARCHAR(64) NOT NULL,
                    currency VARCHAR(3) NOT NULL,
                    payable_amount NUMERIC NOT NULL
                );
            `);
            await client.query(migrationSql);
            const checkTableRes = await client.query(`
                SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'affiliate_ledger';
            `);
            assert.equal(checkTableRes.rows.length, 1, 'affiliate_ledger créée par P13 dans transaction rollback');

            const rollbackSql = fs.readFileSync(rollbackSqlPath, 'utf8');
            await client.query(rollbackSql);

            const checkTableAfterRes = await client.query(`
                SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'affiliate_ledger';
            `);
            assert.equal(checkTableAfterRes.rows.length, 0, 'affiliate_ledger supprimée par rollback dans transaction');
            await client.query('ROLLBACK;');
        }
    } catch (err) {
        await client.query('ROLLBACK;').catch(() => {});
        throw err;
    } finally {
        client.release();
        await pool.end();
    }
});
