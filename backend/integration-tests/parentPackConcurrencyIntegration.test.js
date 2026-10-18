'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { bootstrapTestRoles } = require('./testRoleBootstrap');

const migrationSqlPath = path.resolve(__dirname, '../scripts/migration_p27_parent_pack_reconciliation_defense.sql');
const auditSqlPath = path.resolve(__dirname, '../scripts/preflight_p27_reconciliation_audit.sql');

// ============================================================================
// SUITE 1 : VÉRIFICATION STATIQUE DES LIVRABLES SQL P27
// ============================================================================

test('P27 Intégration - Présence des livrables et intégrité de la migration', () => {
    assert.ok(fs.existsSync(migrationSqlPath), 'Le fichier migration_p27_parent_pack_reconciliation_defense.sql doit exister');
    assert.ok(fs.existsSync(auditSqlPath), 'Le fichier preflight_p27_reconciliation_audit.sql doit exister');

    const sql = fs.readFileSync(migrationSqlPath, 'utf8');

    // Vérification des éléments critiques P27
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.prepare_parent_pack_checkout/, 'RPC prepare_parent_pack_checkout requise');
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.process_parent_pack_webhook_event/, 'RPC process_parent_pack_webhook_event requise');
    assert.match(sql, /FOR UPDATE/, 'Verrouillage transactionnel FOR UPDATE requis');
    assert.match(sql, /FAIL CLOSED MIGRATION P27/, 'Garde-fou Fail-Closed strict en cas de doublons requis');
    assert.match(sql, /CREATE UNIQUE INDEX uq_active_parent_pack_intent\s+ON public\.payment_intents\s*\(target_id\)/, 'Index partiel sur target_id seul requis');

    // Vérification de la compatibilité stricte avec le schéma réel de devises (public.currency_configurations)
    assert.match(sql, /FROM public\.currency_configurations\s+WHERE code = 'XOF'\s+AND is_active = true/, 'Requête sur public.currency_configurations requise');
    assert.doesNotMatch(sql, /\bcurrency_config\b/, 'Aucune référence à la table inexistante currency_config');
    assert.doesNotMatch(sql, /\bcurrency_code\b/, 'Aucune référence à la colonne inexistante currency_code');
});

// ============================================================================
// SUITE 2 : EXÉCUTION RÉELLE SUR POSTGRESQL MULTI-CONNEXIONS CONCURRENTES
// ============================================================================

test('P27 Intégration - Concurrence réelle et atomicité multi-connexions sur PostgreSQL', async (t) => {
    const databaseUrl = (process.env.DATABASE_URL || '').trim();

    if (!databaseUrl) {
        // Signalement explicite de l'absence de base PostgreSQL locale
        assert.fail(
            'POSTGRES_TEST_BLOCKED: Aucune instance PostgreSQL isolée accessible (DATABASE_URL non défini). ' +
            'Cette suite est conçue pour s\'exécuter automatiquement dans la CI GitHub Actions (service postgres:17-alpine).'
        );
    }

    const pool = new Pool({
        connectionString: databaseUrl,
        connectionTimeoutMillis: 5000,
        max: 5
    });

    let client1;
    let client2;

    try {
        client1 = await pool.connect();
        client2 = await pool.connect();
    } catch (err) {
        assert.fail(`Connexion PostgreSQL impossible (${err.message}). Vérifier DATABASE_URL.`);
    }

    try {
        // Pré-requis d'environnement PostgreSQL standard : existence des rôles Supabase sous verrou consultatif
        await bootstrapTestRoles(client1);

        // Isolation complète dans un schéma de test dédié
        const testSchema = 'p27_concurrency_test_' + Date.now();
        await client1.query(`CREATE SCHEMA ${testSchema};`);
        await client1.query(`SET search_path = ${testSchema}, public;`);
        await client2.query(`SET search_path = ${testSchema}, public;`);

        // Bootstrap minimal des tables nécessaires
        const bootstrapSql = `
            CREATE TABLE IF NOT EXISTS schools (
                slug TEXT PRIMARY KEY,
                commission_rate_percentage NUMERIC DEFAULT 20,
                affiliate_id UUID
            );
            CREATE TABLE IF NOT EXISTS affiliates (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                status TEXT DEFAULT 'active'
            );
            CREATE TABLE IF NOT EXISTS currency_configurations (
                code VARCHAR(3) PRIMARY KEY,
                exponent INTEGER NOT NULL DEFAULT 0,
                is_active BOOLEAN NOT NULL DEFAULT true,
                min_withdrawal_minor_units BIGINT NOT NULL DEFAULT 1000,
                cooling_off_days INTEGER NOT NULL DEFAULT 14,
                created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
            );
            INSERT INTO currency_configurations (code, exponent, is_active, min_withdrawal_minor_units, cooling_off_days)
            VALUES ('XOF', 0, true, 1000, 14)
            ON CONFLICT (code) DO NOTHING;
            INSERT INTO schools (slug, commission_rate_percentage) VALUES ('ecole_test', 20) ON CONFLICT DO NOTHING;

            CREATE TABLE IF NOT EXISTS parent_pack_pricing (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                cycle_name TEXT NOT NULL,
                active BOOLEAN DEFAULT true,
                monthly_price_minor BIGINT NOT NULL,
                annual_price_minor BIGINT NOT NULL,
                annual_duration_months INTEGER NOT NULL,
                currency TEXT DEFAULT 'XOF'
            );

            CREATE TABLE IF NOT EXISTS global_students (
                student_global_id UUID PRIMARY KEY DEFAULT gen_random_uuid()
            );

            CREATE TABLE IF NOT EXISTS parent_subscriptions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                parent_ref TEXT NOT NULL,
                student_global_id UUID NOT NULL,
                school_slug TEXT NOT NULL,
                student_ref TEXT NOT NULL,
                pricing_id UUID NOT NULL,
                status TEXT NOT NULL DEFAULT 'inactive',
                created_at TIMESTAMPTZ DEFAULT clock_timestamp(),
                updated_at TIMESTAMPTZ DEFAULT clock_timestamp(),
                CONSTRAINT uq_parent_subs_parent_global UNIQUE (parent_ref, student_global_id)
            );

            CREATE TABLE IF NOT EXISTS payment_intents (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                target_id TEXT NOT NULL,
                expected_amount BIGINT NOT NULL,
                expected_currency TEXT NOT NULL,
                status TEXT NOT NULL,
                payment_type TEXT NOT NULL,
                school_slug TEXT NOT NULL,
                plan_type TEXT,
                metadata JSONB,
                provider_transaction_id TEXT,
                reconciliation_reason TEXT,
                completed_at TIMESTAMPTZ,
                expires_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ DEFAULT clock_timestamp(),
                updated_at TIMESTAMPTZ DEFAULT clock_timestamp()
            );

            CREATE TABLE IF NOT EXISTS webhook_events (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                provider VARCHAR(32) NOT NULL,
                provider_event_id VARCHAR(128) NOT NULL,
                event_type VARCHAR(64) NOT NULL,
                intent_id UUID,
                status VARCHAR(32) NOT NULL,
                error_code VARCHAR(64),
                payload JSONB,
                processed_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ DEFAULT clock_timestamp(),
                CONSTRAINT uq_webhook_provider_event UNIQUE (provider, provider_event_id)
            );

            CREATE TABLE IF NOT EXISTS parent_subscription_periods (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                subscription_id UUID NOT NULL REFERENCES parent_subscriptions(id) ON DELETE RESTRICT,
                payment_intent_id UUID NOT NULL REFERENCES payment_intents(id) ON DELETE RESTRICT,
                start_date DATE NOT NULL,
                end_date DATE NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending_payment' CHECK (status IN ('pending_payment', 'active', 'expired', 'refunded', 'canceled')),
                created_at TIMESTAMPTZ DEFAULT clock_timestamp(),
                updated_at TIMESTAMPTZ DEFAULT clock_timestamp(),
                CHECK (end_date >= start_date),
                UNIQUE (payment_intent_id)
            );

            CREATE TABLE IF NOT EXISTS school_commission_ledger (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                period_id UUID NOT NULL REFERENCES parent_subscription_periods(id) ON DELETE RESTRICT,
                school_slug TEXT NOT NULL,
                ambassador_ref TEXT,
                gross_amount_minor BIGINT NOT NULL,
                fedapay_fee_minor BIGINT NOT NULL,
                school_share_minor BIGINT NOT NULL,
                ambassador_share_minor BIGINT NOT NULL,
                yziow_share_minor BIGINT NOT NULL,
                currency TEXT NOT NULL DEFAULT 'XOF',
                type TEXT NOT NULL DEFAULT 'credit',
                created_at TIMESTAMPTZ DEFAULT clock_timestamp()
            );

            CREATE TABLE IF NOT EXISTS affiliate_ledger (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                affiliate_id UUID NOT NULL,
                currency VARCHAR(3) NOT NULL,
                entry_type VARCHAR(32) NOT NULL,
                amount_minor BIGINT NOT NULL,
                payment_intent_id UUID,
                maturation_at TIMESTAMPTZ,
                metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
            );

            CREATE TABLE IF NOT EXISTS affiliate_balances (
                affiliate_id UUID NOT NULL,
                currency TEXT NOT NULL,
                pending_balance_minor BIGINT DEFAULT 0,
                available_balance_minor BIGINT DEFAULT 0,
                reserved_balance_minor BIGINT DEFAULT 0,
                debt_balance_minor BIGINT DEFAULT 0,
                updated_at TIMESTAMPTZ DEFAULT clock_timestamp(),
                CONSTRAINT uq_affiliate_balances_curr UNIQUE (affiliate_id, currency)
            );
        `;
        await client1.query(bootstrapSql);

        // Insertion d'un tarif de test
        const pricingRes = await client1.query(`
            INSERT INTO parent_pack_pricing (cycle_name, active, monthly_price_minor, annual_price_minor, annual_duration_months, currency)
            VALUES ('maternelle', true, 20000, 150000, 9, 'XOF')
            RETURNING id;
        `);
        const pricingId = pricingRes.rows[0].id;

        // Insertion d'un élève global
        const studentRes = await client1.query(`INSERT INTO global_students DEFAULT VALUES RETURNING student_global_id;`);
        const studentGlobalId = studentRes.rows[0].student_global_id;

        // Injection des fonctions P27 dans le schéma de test
        const rawMigration = fs.readFileSync(migrationSqlPath, 'utf8');
        // Remplacer 'public.' par le schéma de test
        const adaptedMigration = rawMigration
            .replace(/public\./g, `${testSchema}.`)
            .replace(/BEGIN;/g, '')
            .replace(/COMMIT;/g, '');
        await client1.query(adaptedMigration);

        // --------------------------------------------------------------------
        // TEST CONCURRENT 1 : Deux créations simultanées pour le même élève
        // --------------------------------------------------------------------
        await t.test('1. Concurrence simultanée : une seule souscription et intention créée', async () => {
            const checkoutCall = (client) => client.query(
                `SELECT ${testSchema}.prepare_parent_pack_checkout($1, $2, $3, $4, $5, $6, $7) AS res;`,
                ['parent_conc_1', studentGlobalId, 'ecole_test', 'eleve_local_1', pricingId, 'maternelle', 1]
            );

            // Exécution simultanée sur 2 connexions indépendantes
            const results = await Promise.allSettled([
                checkoutCall(client1),
                checkoutCall(client2)
            ]);

            const fulfilled = results.filter(r => r.status === 'fulfilled');
            const rejected = results.filter(r => r.status === 'rejected');

            assert.strictEqual(fulfilled.length, 1, 'Exactement une requête doit réussir');
            assert.strictEqual(rejected.length, 1, 'Exactement une requête doit être rejetée');
            assert.match(rejected[0].reason.message, /FAIL CLOSED: ACTIVE_INTENT_ALREADY_EXISTS/, 'L erreur doit être ACTIVE_INTENT_ALREADY_EXISTS');

            // Vérification de l'intégrité en base
            const subCount = await client1.query(`SELECT COUNT(*) FROM ${testSchema}.parent_subscriptions WHERE parent_ref = $1;`, ['parent_conc_1']);
            assert.strictEqual(parseInt(subCount.rows[0].count), 1, 'Une seule souscription en base');

            const intentCount = await client1.query(`SELECT COUNT(*) FROM ${testSchema}.payment_intents WHERE payment_type = 'parent_pack';`);
            assert.strictEqual(parseInt(intentCount.rows[0].count), 1, 'Une seule intention en base');
        });

        // --------------------------------------------------------------------
        // TEST CONCURRENT 2 : Rejet simultané si réconciliation pendante
        // --------------------------------------------------------------------
        await t.test('2. Rejet concurrent si intention précédente en reconciliation_required', async () => {
            // Basculer l'intention existante en reconciliation_required
            await client1.query(`UPDATE ${testSchema}.payment_intents SET status = 'reconciliation_required';`);

            const checkoutCall = (client) => client.query(
                `SELECT ${testSchema}.prepare_parent_pack_checkout($1, $2, $3, $4, $5, $6, $7) AS res;`,
                ['parent_conc_1', studentGlobalId, 'ecole_test', 'eleve_local_1', pricingId, 'maternelle', 1]
            );

            // Deux requêtes simultanées tentant de forcer un nouveau checkout
            const results = await Promise.allSettled([
                checkoutCall(client1),
                checkoutCall(client2)
            ]);

            assert.strictEqual(results[0].status, 'rejected');
            assert.strictEqual(results[1].status, 'rejected');
            assert.match(results[0].reason.message, /FAIL CLOSED: RECONCILIATION_REQUIRED_PENDING/);
            assert.match(results[1].reason.message, /FAIL CLOSED: RECONCILIATION_REQUIRED_PENDING/);

            // Aucune nouvelle intention n'a été insérée
            const intentCount = await client1.query(`SELECT COUNT(*) FROM ${testSchema}.payment_intents WHERE payment_type = 'parent_pack';`);
            assert.strictEqual(parseInt(intentCount.rows[0].count), 1, 'Toujours 1 seule intention');
        });

        // --------------------------------------------------------------------
        // TEST 3 : Reprise autorisée après annulation administrative
        // --------------------------------------------------------------------
        await t.test('3. Reprise autorisée après résolution administrative vers cancelled', async () => {
            // Résolution administrative : passage à cancelled
            await client1.query(`UPDATE ${testSchema}.payment_intents SET status = 'cancelled';`);

            const res = await client1.query(
                `SELECT ${testSchema}.prepare_parent_pack_checkout($1, $2, $3, $4, $5, $6, $7) AS res;`,
                ['parent_conc_1', studentGlobalId, 'ecole_test', 'eleve_local_1', pricingId, 'maternelle', 1]
            );

            assert.ok(res.rows[0].res.payment_intent_id, 'Nouvelle intention générée avec succès');
            const intentCount = await client1.query(`SELECT COUNT(*) FROM ${testSchema}.payment_intents WHERE payment_type = 'parent_pack';`);
            assert.strictEqual(parseInt(intentCount.rows[0].count), 2, '2 intentions au total (1 cancelled, 1 initializing)');
        });

        // --------------------------------------------------------------------
        // TEST 4 : Webhook échec métier : établissement introuvable -> aucun abonnement actif
        // --------------------------------------------------------------------
        await t.test('4. Webhook : établissement introuvable place en réconciliation sans créer de période active', async () => {
            const studentRes4 = await client1.query(`INSERT INTO global_students DEFAULT VALUES RETURNING student_global_id;`);
            const studentGlobalId4 = studentRes4.rows[0].student_global_id;

            const checkoutRes4 = await client1.query(
                `SELECT ${testSchema}.prepare_parent_pack_checkout($1, $2, $3, $4, $5, $6, $7) AS res;`,
                ['parent_wh_school_not_found', studentGlobalId4, 'ecole_inexistante', 'eleve_wh_4', pricingId, 'maternelle', 1]
            );
            const intentId4 = checkoutRes4.rows[0].res.payment_intent_id;

            const webhookRes4 = await client1.query(
                `SELECT ${testSchema}.process_parent_pack_webhook_event($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) AS res;`,
                ['fedapay', 'evt_wh_school_not_found', 'transaction.approved', intentId4, 'txn_wh_4', 20000, 'XOF', 'approved', new Date().toISOString(), 600, 0, true]
            );

            assert.strictEqual(webhookRes4.rows[0].res.status, 'reconciliation_required');
            assert.strictEqual(webhookRes4.rows[0].res.error_code, 'PARENT_PACK_SCHOOL_NOT_FOUND');

            // Vérification critique : AUCUNE période active ou pending ne doit être créée
            const periodsCount = await client1.query(
                `SELECT COUNT(*) FROM ${testSchema}.parent_subscription_periods WHERE payment_intent_id = $1;`,
                [intentId4]
            );
            assert.strictEqual(parseInt(periodsCount.rows[0].count, 10), 0, 'Aucune période ne doit être créée lors d un échec école');

            // Intention en réconciliation
            const intentCheck = await client1.query(
                `SELECT status, reconciliation_reason FROM ${testSchema}.payment_intents WHERE id = $1;`,
                [intentId4]
            );
            assert.strictEqual(intentCheck.rows[0].status, 'reconciliation_required');
            assert.strictEqual(intentCheck.rows[0].reconciliation_reason, 'PARENT_PACK_SCHOOL_NOT_FOUND');
        });

        // --------------------------------------------------------------------
        // TEST 5 : Webhook échec financier : frais excessifs -> aucun abonnement actif
        // --------------------------------------------------------------------
        await t.test('5. Webhook : frais supérieurs au restant place en réconciliation sans créer de période active', async () => {
            const studentRes5 = await client1.query(`INSERT INTO global_students DEFAULT VALUES RETURNING student_global_id;`);
            const studentGlobalId5 = studentRes5.rows[0].student_global_id;

            const checkoutRes5 = await client1.query(
                `SELECT ${testSchema}.prepare_parent_pack_checkout($1, $2, $3, $4, $5, $6, $7) AS res;`,
                ['parent_wh_fee_exceeds', studentGlobalId5, 'ecole_test', 'eleve_wh_5', pricingId, 'maternelle', 1]
            );
            const intentId5 = checkoutRes5.rows[0].res.payment_intent_id;

            // 20000 brut, commission école 20% = 4000. Frais Fedapay 18000 -> 20000 - 18000 - 4000 = -2000 < 0
            const webhookRes5 = await client1.query(
                `SELECT ${testSchema}.process_parent_pack_webhook_event($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) AS res;`,
                ['fedapay', 'evt_wh_fee_exceeds', 'transaction.approved', intentId5, 'txn_wh_5', 20000, 'XOF', 'approved', new Date().toISOString(), 18000, 0, true]
            );

            assert.strictEqual(webhookRes5.rows[0].res.status, 'reconciliation_required');
            assert.strictEqual(webhookRes5.rows[0].res.error_code, 'PARENT_PACK_FEE_EXCEEDS_REMAINING_AMOUNT');

            // Vérification critique : AUCUNE période ne doit être créée
            const periodsCount = await client1.query(
                `SELECT COUNT(*) FROM ${testSchema}.parent_subscription_periods WHERE payment_intent_id = $1;`,
                [intentId5]
            );
            assert.strictEqual(parseInt(periodsCount.rows[0].count, 10), 0, 'Aucune période ne doit être créée lors de frais excessifs');

            const intentCheck = await client1.query(
                `SELECT status, reconciliation_reason FROM ${testSchema}.payment_intents WHERE id = $1;`,
                [intentId5]
            );
            assert.strictEqual(intentCheck.rows[0].status, 'reconciliation_required');
            assert.strictEqual(intentCheck.rows[0].reconciliation_reason, 'PARENT_PACK_FEE_EXCEEDS_REMAINING_AMOUNT');
        });

        // --------------------------------------------------------------------
        // TEST 6 : Webhook paiement approuvé nominal et activation
        // --------------------------------------------------------------------
        let nominalIntentId;
        let nominalPeriodId;
        let nominalAffiliateId;

        await t.test('6. Webhook nominal : activation de la souscription, période active et écritures financières complètes', async () => {
            // Création d'une école avec ambassadeur actif
            const affRes = await client1.query(
                `INSERT INTO ${testSchema}.affiliates (status) VALUES ('active') RETURNING id;`
            );
            nominalAffiliateId = affRes.rows[0].id;
            await client1.query(
                `INSERT INTO ${testSchema}.schools (slug, commission_rate_percentage, affiliate_id)
                 VALUES ('ecole_affiliee', 20, $1) ON CONFLICT (slug) DO UPDATE SET affiliate_id = $1;`,
                [nominalAffiliateId]
            );

            const studentRes6 = await client1.query(`INSERT INTO global_students DEFAULT VALUES RETURNING student_global_id;`);
            const studentGlobalId6 = studentRes6.rows[0].student_global_id;

            const checkoutRes6 = await client1.query(
                `SELECT ${testSchema}.prepare_parent_pack_checkout($1, $2, $3, $4, $5, $6, $7) AS res;`,
                ['parent_wh_nominal', studentGlobalId6, 'ecole_affiliee', 'eleve_nominal_1', pricingId, 'maternelle', 1]
            );
            nominalIntentId = checkoutRes6.rows[0].res.payment_intent_id;
            const subId6 = checkoutRes6.rows[0].res.subscription_id;

            // La souscription est inactive avant certification
            const subBefore = await client1.query(`SELECT status FROM ${testSchema}.parent_subscriptions WHERE id = $1;`, [subId6]);
            assert.strictEqual(subBefore.rows[0].status, 'inactive', 'Souscription doit être inactive avant paiement');

            // Appel webhook nominal certifié
            const certifiedPaymentAt6 = '2026-10-18T10:00:00.000Z';
            const webhookRes6 = await client1.query(
                `SELECT ${testSchema}.process_parent_pack_webhook_event($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) AS res;`,
                ['fedapay', 'evt_nominal_1', 'transaction.approved', nominalIntentId, 'txn_nominal_1', 20000, 'XOF', 'approved', certifiedPaymentAt6, 600, 0, true]
            );

            assert.strictEqual(webhookRes6.rows[0].res.status, 'completed');
            assert.strictEqual(webhookRes6.rows[0].res.payment_type, 'parent_pack');
            nominalPeriodId = webhookRes6.rows[0].res.period_id;
            assert.ok(nominalPeriodId, 'period_id doit être retourné');

            // A. Période active créée
            const periodsRes = await client1.query(
                `SELECT * FROM ${testSchema}.parent_subscription_periods WHERE payment_intent_id = $1;`,
                [nominalIntentId]
            );
            assert.strictEqual(periodsRes.rows.length, 1, 'Exactement une période active');
            assert.strictEqual(periodsRes.rows[0].id, nominalPeriodId);
            assert.strictEqual(periodsRes.rows[0].status, 'active');

            // B. Souscription activée avec contexte certifié
            const subAfter = await client1.query(`SELECT status, school_slug, student_ref FROM ${testSchema}.parent_subscriptions WHERE id = $1;`, [subId6]);
            assert.strictEqual(subAfter.rows[0].status, 'active');
            assert.strictEqual(subAfter.rows[0].school_slug, 'ecole_affiliee');
            assert.strictEqual(subAfter.rows[0].student_ref, 'eleve_nominal_1');

            // C. Écriture du grand livre école (school_commission_ledger)
            const schoolLedger = await client1.query(
                `SELECT * FROM ${testSchema}.school_commission_ledger WHERE period_id = $1;`,
                [nominalPeriodId]
            );
            assert.strictEqual(schoolLedger.rows.length, 1);
            assert.strictEqual(schoolLedger.rows[0].gross_amount_minor, '20000');
            assert.strictEqual(schoolLedger.rows[0].fedapay_fee_minor, '600');
            assert.strictEqual(schoolLedger.rows[0].school_share_minor, '4000');
            assert.strictEqual(schoolLedger.rows[0].ambassador_share_minor, '1540');
            assert.strictEqual(schoolLedger.rows[0].yziow_share_minor, '13860');

            // D. Écriture du grand livre affilié (affiliate_ledger)
            const affLedger = await client1.query(
                `SELECT * FROM ${testSchema}.affiliate_ledger WHERE payment_intent_id = $1;`,
                [nominalIntentId]
            );
            assert.strictEqual(affLedger.rows.length, 1);
            assert.strictEqual(affLedger.rows[0].amount_minor, '1540');
            assert.strictEqual(affLedger.rows[0].entry_type, 'commission');
            assert.strictEqual(
                new Date(affLedger.rows[0].maturation_at).toISOString(),
                '2026-11-01T10:00:00.000Z',
                'maturation_at doit intégrer exactement les 14 jours de cooling_off_days de currency_configurations'
            );

            // E. Solde affilié mis à jour
            const affBal = await client1.query(
                `SELECT pending_balance_minor FROM ${testSchema}.affiliate_balances WHERE affiliate_id = $1 AND currency = 'XOF';`,
                [nominalAffiliateId]
            );
            assert.strictEqual(affBal.rows[0].pending_balance_minor, '1540');

            // F. Intention complétée
            const intentAfter = await client1.query(`SELECT status FROM ${testSchema}.payment_intents WHERE id = $1;`, [nominalIntentId]);
            assert.strictEqual(intentAfter.rows[0].status, 'completed');
        });

        // --------------------------------------------------------------------
        // TEST 7 : Idempotence du webhook rejoué
        // --------------------------------------------------------------------
        await t.test('7. Webhook : rejeu idempotent détecté sans duplication de période ni d écriture', async () => {
            const replayRes = await client1.query(
                `SELECT ${testSchema}.process_parent_pack_webhook_event($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) AS res;`,
                ['fedapay', 'evt_nominal_1', 'transaction.approved', nominalIntentId, 'txn_nominal_1', 20000, 'XOF', 'approved', new Date().toISOString(), 600, 0, true]
            );

            assert.strictEqual(replayRes.rows[0].res.status, 'duplicate');

            // Non-duplication de période
            const periodsCount = await client1.query(
                `SELECT COUNT(*) FROM ${testSchema}.parent_subscription_periods WHERE payment_intent_id = $1;`,
                [nominalIntentId]
            );
            assert.strictEqual(parseInt(periodsCount.rows[0].count, 10), 1, 'Aucune période dupliquée');

            // Non-duplication de grand livre école
            const schoolLedgerCount = await client1.query(
                `SELECT COUNT(*) FROM ${testSchema}.school_commission_ledger WHERE period_id = $1;`,
                [nominalPeriodId]
            );
            assert.strictEqual(parseInt(schoolLedgerCount.rows[0].count, 10), 1, 'Aucune écriture d école dupliquée');

            // Non-duplication de solde affilié
            const affBal = await client1.query(
                `SELECT pending_balance_minor FROM ${testSchema}.affiliate_balances WHERE affiliate_id = $1 AND currency = 'XOF';`,
                [nominalAffiliateId]
            );
            assert.strictEqual(affBal.rows[0].pending_balance_minor, '1540', 'Le solde affilié ne doit pas être incrémenté deux fois');
        });

        // --------------------------------------------------------------------
        // TEST 8 : Échec Fail-Closed du webhook si XOF est inactif
        // --------------------------------------------------------------------
        await t.test('8. Webhook : échec transactionnel Fail-Closed si la devise XOF est inactive', async () => {
            const studentRes8 = await client1.query(`INSERT INTO global_students DEFAULT VALUES RETURNING student_global_id;`);
            const studentGlobalId8 = studentRes8.rows[0].student_global_id;

            const checkoutRes8 = await client1.query(
                `SELECT ${testSchema}.prepare_parent_pack_checkout($1, $2, $3, $4, $5, $6, $7) AS res;`,
                ['parent_wh_curr_inactive', studentGlobalId8, 'ecole_affiliee', 'eleve_curr_1', pricingId, 'maternelle', 1]
            );
            const intentId8 = checkoutRes8.rows[0].res.payment_intent_id;

            // Désactiver temporairement XOF dans currency_configurations
            await client1.query(`UPDATE ${testSchema}.currency_configurations SET is_active = false WHERE code = 'XOF';`);

            let webhookFailed = false;
            let webhookError = '';
            try {
                await client1.query(
                    `SELECT ${testSchema}.process_parent_pack_webhook_event($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) AS res;`,
                    ['fedapay', 'evt_curr_inactive_1', 'transaction.approved', intentId8, 'txn_curr_inactive_1', 20000, 'XOF', 'approved', new Date().toISOString(), 600, 0, true]
                );
            } catch (err) {
                webhookFailed = true;
                webhookError = err.message;
            } finally {
                // Restaurer l'activité de XOF
                await client1.query(`UPDATE ${testSchema}.currency_configurations SET is_active = true WHERE code = 'XOF';`);
            }

            assert.strictEqual(webhookFailed, true, 'L appel webhook doit lever une exception si XOF est inactif');
            assert.match(webhookError, /Currency XOF not supported or inactive/, 'Message d exception explicite');

            // Vérifier qu'aucune période n'a été créée (atomicité / rollback)
            const periodsCount = await client1.query(
                `SELECT COUNT(*) FROM ${testSchema}.parent_subscription_periods WHERE payment_intent_id = $1;`,
                [intentId8]
            );
            assert.strictEqual(parseInt(periodsCount.rows[0].count, 10), 0, 'Aucune période ne doit être créée');

            // Vérifier qu'aucune écriture comptable n'a été enregistrée
            const ledgerCount = await client1.query(
                `SELECT COUNT(*) FROM ${testSchema}.affiliate_ledger WHERE payment_intent_id = $1;`,
                [intentId8]
            );
            assert.strictEqual(parseInt(ledgerCount.rows[0].count, 10), 0, 'Aucune commission affiliée ne doit être enregistrée');
        });

        // --------------------------------------------------------------------
        // TEST 9 : Échec Fail-Closed du webhook si XOF est manquant
        // --------------------------------------------------------------------
        await t.test('9. Webhook : échec transactionnel Fail-Closed si la devise XOF est inexistante', async () => {
            const studentRes9 = await client1.query(`INSERT INTO global_students DEFAULT VALUES RETURNING student_global_id;`);
            const studentGlobalId9 = studentRes9.rows[0].student_global_id;

            const checkoutRes9 = await client1.query(
                `SELECT ${testSchema}.prepare_parent_pack_checkout($1, $2, $3, $4, $5, $6, $7) AS res;`,
                ['parent_wh_curr_missing', studentGlobalId9, 'ecole_affiliee', 'eleve_curr_2', pricingId, 'maternelle', 1]
            );
            const intentId9 = checkoutRes9.rows[0].res.payment_intent_id;

            // Supprimer temporairement XOF de currency_configurations
            await client1.query(`DELETE FROM ${testSchema}.currency_configurations WHERE code = 'XOF';`);

            let webhookFailed = false;
            let webhookError = '';
            try {
                await client1.query(
                    `SELECT ${testSchema}.process_parent_pack_webhook_event($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) AS res;`,
                    ['fedapay', 'evt_curr_missing_1', 'transaction.approved', intentId9, 'txn_curr_missing_1', 20000, 'XOF', 'approved', new Date().toISOString(), 600, 0, true]
                );
            } catch (err) {
                webhookFailed = true;
                webhookError = err.message;
            } finally {
                // Réinsérer la configuration XOF
                await client1.query(`
                    INSERT INTO ${testSchema}.currency_configurations (code, exponent, is_active, min_withdrawal_minor_units, cooling_off_days)
                    VALUES ('XOF', 0, true, 1000, 14)
                    ON CONFLICT (code) DO NOTHING;
                `);
            }

            assert.strictEqual(webhookFailed, true, 'L appel webhook doit lever une exception si XOF est manquant');
            assert.match(webhookError, /Currency XOF not supported or inactive/, 'Message d exception explicite');

            // Vérifier qu'aucune période n'a été créée
            const periodsCount = await client1.query(
                `SELECT COUNT(*) FROM ${testSchema}.parent_subscription_periods WHERE payment_intent_id = $1;`,
                [intentId9]
            );
            assert.strictEqual(parseInt(periodsCount.rows[0].count, 10), 0, 'Aucune période ne doit être créée');
        });

        // --------------------------------------------------------------------
        // TEST 10 : Échec Fail-Closed strict de la migration si doublons
        // --------------------------------------------------------------------
        await t.test('10. Échec transactionnel (ROLLBACK) de la migration P27 en cas de doublons', async () => {
            // A. Reproduire fidèlement l'état historique avant déploiement P27 dans le schéma de test
            await client1.query(`DROP INDEX IF EXISTS ${testSchema}.uq_active_parent_pack_intent;`);

            // Récupérer le target_id d'une intention non résolue
            const intentRow = await client1.query(
                `SELECT target_id FROM ${testSchema}.payment_intents WHERE payment_type = 'parent_pack' AND status IN ('initializing', 'pending', 'reconciliation_required') LIMIT 1;`
            );
            const targetId = intentRow.rows[0].target_id;

            // Insérer artificiellement un doublon historique non résolu pour le même target_id
            await client1.query(`
                INSERT INTO ${testSchema}.payment_intents (
                    target_id, expected_amount, expected_currency, status, payment_type, school_slug
                ) VALUES ($1, 20000, 'XOF', 'reconciliation_required', 'parent_pack', 'ecole_test');
            `, [targetId]);

            // Vérifier que les doublons sont effectivement présents avant de rejouer la migration
            const preCheckRes = await client1.query(`
                SELECT COUNT(*) AS cnt
                  FROM ${testSchema}.payment_intents
                 WHERE target_id = $1
                   AND payment_type = 'parent_pack'
                   AND status IN ('initializing', 'pending', 'reconciliation_required');
            `, [targetId]);
            assert.strictEqual(parseInt(preCheckRes.rows[0].cnt, 10), 2, 'Deux intentions concurrentes doivent coexister avant migration');

            // B. Rejouer le véritable script de migration P27 (incluant BEGIN, RPCs, REVOKE/GRANT et DO Fail-Closed)
            // adapté au schéma de test isolé
            const rawMigration = fs.readFileSync(migrationSqlPath, 'utf8');
            const realMigrationSql = rawMigration.replace(/public\./g, `${testSchema}.`);

            let migrationFailed = false;
            let errorMessage = '';
            let errorCode = '';

            try {
                // Exécution complète du script réel : BEGIN transactionnel, DDL RPCs et garde-fou Fail-Closed
                await client1.query(realMigrationSql);
            } catch (err) {
                migrationFailed = true;
                errorMessage = err.message;
                errorCode = err.code;
                await client1.query('ROLLBACK;').catch(() => {});
            }

            // C. Vérifications d'intégrité Fail-Closed strictes
            assert.strictEqual(migrationFailed, true, 'La migration doit échouer en présence de doublons');
            assert.strictEqual(errorCode, '23505', 'Le code d erreur PostgreSQL doit être 23505');
            assert.match(errorMessage, /FAIL CLOSED MIGRATION P27: Impossible d installer l index unique uq_active_parent_pack_intent/, 'Message d erreur Fail-Closed attendu');

            // Vérifier que les doublons historiques restent intacts après le rollback
            const postCheckRes = await client1.query(`
                SELECT COUNT(*) AS cnt
                  FROM ${testSchema}.payment_intents
                 WHERE target_id = $1
                   AND payment_type = 'parent_pack'
                   AND status IN ('initializing', 'pending', 'reconciliation_required');
            `, [targetId]);
            assert.strictEqual(parseInt(postCheckRes.rows[0].cnt, 10), 2, 'Les doublons historiques doivent être intacts (non altérés)');

            // Vérifier qu'aucun index partiel n'a été installé
            const indexCheckRes = await client1.query(`
                SELECT indexname
                  FROM pg_indexes
                 WHERE schemaname = $1
                   AND indexname = 'uq_active_parent_pack_intent';
            `, [testSchema]);
            assert.strictEqual(indexCheckRes.rows.length, 0, 'L index uq_active_parent_pack_intent ne doit PAS être installé');
        });

        // Nettoyage final du schéma de test
        await client1.query(`DROP SCHEMA ${testSchema} CASCADE;`);
    } finally {
        client1.release();
        client2.release();
        await pool.end();
    }
});
