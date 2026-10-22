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

    // Vérification des colonnes d'ancrage d'anniversaire et de cumul des mois
    assert.match(sql, /ALTER TABLE public\.parent_subscriptions[\s\S]+?ADD COLUMN IF NOT EXISTS billing_anchor_date DATE/, 'Évolution DDL billing_anchor_date requise');
    assert.match(sql, /ADD COLUMN IF NOT EXISTS cumulative_months INTEGER/, 'Évolution DDL cumulative_months requise');
    assert.match(sql, /billing_anchor_date = v_anchor_date/, 'Mise à jour atomique de billing_anchor_date requise');
    assert.match(sql, /cumulative_months = v_cumulative_months/, 'Mise à jour atomique de cumulative_months requise');
    assert.match(sql, /WITH RECURSIVE chain/, 'Résilience historique via CTE récursive requise');
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
        await client1.query(`SET timezone = 'UTC';`);
        await client2.query(`SET timezone = 'UTC';`);

        // Bootstrap minimal des tables nécessaires
        const bootstrapSql = `
            CREATE TABLE IF NOT EXISTS schools (
                slug TEXT PRIMARY KEY,
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
            INSERT INTO schools (slug) VALUES ('ecole_test') ON CONFLICT DO NOTHING;

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

            CREATE TABLE IF NOT EXISTS parent_child_links (
                parent_ref TEXT NOT NULL,
                student_global_id UUID NOT NULL REFERENCES global_students(student_global_id),
                first_linked_at TIMESTAMPTZ DEFAULT now(),
                current_link_active BOOLEAN NOT NULL DEFAULT true,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                PRIMARY KEY (parent_ref, student_global_id)
            );

            CREATE TABLE IF NOT EXISTS parent_subscriptions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                parent_ref TEXT NOT NULL,
                student_global_id UUID NOT NULL,
                school_slug TEXT NOT NULL,
                student_ref TEXT NOT NULL,
                pricing_id UUID NOT NULL,
                status TEXT NOT NULL DEFAULT 'inactive',
                billing_anchor_date DATE,
                cumulative_months INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMPTZ DEFAULT clock_timestamp(),
                updated_at TIMESTAMPTZ DEFAULT clock_timestamp(),
                CONSTRAINT uq_parent_subs_parent_global UNIQUE (parent_ref, student_global_id),
                CONSTRAINT uq_parent_subs_global_unique UNIQUE (student_global_id)
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
                processed_at TIMESTAMPTZ,
                expires_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ DEFAULT clock_timestamp(),
                updated_at TIMESTAMPTZ DEFAULT clock_timestamp(),
                CONSTRAINT chk_payment_intents_processed_at
                    CHECK (
                        (status = 'completed' AND processed_at IS NOT NULL)
                        OR
                        (status <> 'completed' AND processed_at IS NULL)
                    )
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
        // Remplacer 'public.' par le schéma de test et permettre le voyage temporel dans les tests anniversaires
        const adaptedMigration = rawMigration
            .replace(/public\./g, `${testSchema}.`)
            .replace(/BEGIN;/g, '')
            .replace(/COMMIT;/g, '')
            .replace(/\bnow\(\)::date\b/g, `COALESCE(NULLIF(current_setting('${testSchema}.simulated_now', true), '')::timestamptz, now())::date`);
        await client1.query(adaptedMigration);

        const ensureParentLink = async (client, parentRef, studentId, active = true) => {
            await client.query(`
                INSERT INTO ${testSchema}.parent_child_links (parent_ref, student_global_id, current_link_active)
                VALUES ($1, $2, $3)
                ON CONFLICT (parent_ref, student_global_id) DO UPDATE SET current_link_active = EXCLUDED.current_link_active;
            `, [parentRef, studentId, active]);
        };

        // --------------------------------------------------------------------
        // TEST CONTRÔLE FAIL-CLOSED : Vérification du lien parent-enfant actif
        // --------------------------------------------------------------------
        await t.test('0. Contrôle fail-closed du lien parent-enfant : refus sans lien actif et autorisation avec lien', async () => {
            // A. Parent sans aucun lien enregistré -> Rejet Fail-Closed
            await assert.rejects(
                () => client1.query(
                    `SELECT ${testSchema}.prepare_parent_pack_checkout($1, $2, $3, $4, $5, $6, $7) AS res;`,
                    ['parent_unknown_link', studentGlobalId, 'ecole_test', 'eleve_local_1', pricingId, 'maternelle', 1]
                ),
                { message: /FAIL CLOSED: No active parent link/ }
            );

            // B. Parent avec lien inactif (current_link_active = false) -> Rejet Fail-Closed
            await ensureParentLink(client1, 'parent_inactive_link', studentGlobalId, false);
            await assert.rejects(
                () => client1.query(
                    `SELECT ${testSchema}.prepare_parent_pack_checkout($1, $2, $3, $4, $5, $6, $7) AS res;`,
                    ['parent_inactive_link', studentGlobalId, 'ecole_test', 'eleve_local_1', pricingId, 'maternelle', 1]
                ),
                { message: /FAIL CLOSED: No active parent link/ }
            );

            // C. Parent avec lien actif -> Checkout autorisé
            await ensureParentLink(client1, 'parent_active_test', studentGlobalId, true);
            const authRes = await client1.query(
                `SELECT ${testSchema}.prepare_parent_pack_checkout($1, $2, $3, $4, $5, $6, $7) AS res;`,
                ['parent_active_test', studentGlobalId, 'ecole_test', 'eleve_local_1', pricingId, 'maternelle', 1]
            );
            assert.ok(authRes.rows[0].res.payment_intent_id, 'Le checkout avec lien actif génère une intention');

            // Nettoyage de l'intention et de la souscription créées pour préserver l'état vierge du test 1
            await client1.query(`DELETE FROM ${testSchema}.payment_intents WHERE target_id = $1::text;`, [authRes.rows[0].res.subscription_id]);
            await client1.query(`DELETE FROM ${testSchema}.parent_subscriptions WHERE id = $1;`, [authRes.rows[0].res.subscription_id]);
        });

        // Liaison active pour parent_conc_1 utilisée par les tests concurrents 1, 2 et 3
        await ensureParentLink(client1, 'parent_conc_1', studentGlobalId, true);

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
            await ensureParentLink(client1, 'parent_wh_school_not_found', studentGlobalId4, true);

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
            await ensureParentLink(client1, 'parent_wh_fee_exceeds', studentGlobalId5, true);

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
        let nominalCertifiedPaymentAt;

        await t.test('6. Webhook nominal : activation de la souscription, période active et écritures financières complètes', async () => {
            // Création d'une école avec ambassadeur actif
            const affRes = await client1.query(
                `INSERT INTO ${testSchema}.affiliates (status) VALUES ('active') RETURNING id;`
            );
            nominalAffiliateId = affRes.rows[0].id;
            await client1.query(
                `INSERT INTO ${testSchema}.schools (slug, affiliate_id)
                 VALUES ('ecole_affiliee', $1) ON CONFLICT (slug) DO UPDATE SET affiliate_id = $1;`,
                [nominalAffiliateId]
            );

            const studentRes6 = await client1.query(`INSERT INTO global_students DEFAULT VALUES RETURNING student_global_id;`);
            const studentGlobalId6 = studentRes6.rows[0].student_global_id;
            await ensureParentLink(client1, 'parent_wh_nominal', studentGlobalId6, true);

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
            nominalCertifiedPaymentAt = '2026-10-18T10:00:00.000Z';
            const webhookRes6 = await client1.query(
                `SELECT ${testSchema}.process_parent_pack_webhook_event($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) AS res;`,
                ['fedapay', 'evt_nominal_1', 'transaction.approved', nominalIntentId, 'txn_nominal_1', 20000, 'XOF', 'approved', nominalCertifiedPaymentAt, 600, 0, true]
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

            // F. Intention complétée avec processed_at certifié
            const intentAfter = await client1.query(`SELECT status, processed_at, provider_transaction_id FROM ${testSchema}.payment_intents WHERE id = $1;`, [nominalIntentId]);
            assert.strictEqual(intentAfter.rows[0].status, 'completed');
            assert.ok(intentAfter.rows[0].processed_at, 'processed_at doit être renseigné lors du passage à completed');
            assert.strictEqual(
                new Date(intentAfter.rows[0].processed_at).toISOString(),
                new Date(nominalCertifiedPaymentAt).toISOString(),
                'processed_at doit correspondre à la date certifiée de paiement'
            );
            assert.strictEqual(intentAfter.rows[0].provider_transaction_id, 'txn_nominal_1');
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

            // Vérification de l'intégrité de l'intention : statut completed et processed_at inchangés
            const intentReplay = await client1.query(`SELECT status, processed_at FROM ${testSchema}.payment_intents WHERE id = $1;`, [nominalIntentId]);
            assert.strictEqual(intentReplay.rows[0].status, 'completed');
            assert.strictEqual(
                new Date(intentReplay.rows[0].processed_at).toISOString(),
                new Date(nominalCertifiedPaymentAt).toISOString(),
                'processed_at reste inchangé lors d un rejeu idempotent'
            );
        });

        // --------------------------------------------------------------------
        // TEST 8 : Échec Fail-Closed du webhook si XOF est inactif
        // --------------------------------------------------------------------
        await t.test('8. Webhook : échec transactionnel Fail-Closed si la devise XOF est inactive', async () => {
            const studentRes8 = await client1.query(`INSERT INTO global_students DEFAULT VALUES RETURNING student_global_id;`);
            const studentGlobalId8 = studentRes8.rows[0].student_global_id;
            await ensureParentLink(client1, 'parent_wh_curr_inactive', studentGlobalId8, true);

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

            // Vérifier qu'aucune commission affiliée n'a été enregistrée
            const ledgerCount = await client1.query(
                `SELECT COUNT(*) FROM ${testSchema}.affiliate_ledger WHERE payment_intent_id = $1;`,
                [intentId8]
            );
            assert.strictEqual(parseInt(ledgerCount.rows[0].count, 10), 0, 'Aucune commission affiliée ne doit être enregistrée');

            // Vérifier qu'aucune commission d'école n'a été enregistrée
            const schoolCount = await client1.query(
                `SELECT COUNT(*) FROM ${testSchema}.school_commission_ledger WHERE period_id IN (
                    SELECT id FROM ${testSchema}.parent_subscription_periods WHERE payment_intent_id = $1
                );`,
                [intentId8]
            );
            assert.strictEqual(parseInt(schoolCount.rows[0].count, 10), 0, 'Aucune commission école ne doit être enregistrée');

            // Vérifier que l'intention n'a pas été complétée et que processed_at est resté NULL
            const intentAfter8 = await client1.query(
                `SELECT status, processed_at FROM ${testSchema}.payment_intents WHERE id = $1;`,
                [intentId8]
            );
            assert.notStrictEqual(intentAfter8.rows[0].status, 'completed', 'L intention ne doit pas passer à completed en cas d erreur');
            assert.strictEqual(intentAfter8.rows[0].processed_at, null, 'processed_at doit rester NULL');
        });

        // --------------------------------------------------------------------
        // TEST 9 : Échec Fail-Closed du webhook si XOF est manquant
        // --------------------------------------------------------------------
        await t.test('9. Webhook : échec transactionnel Fail-Closed si la devise XOF est inexistante', async () => {
            const studentRes9 = await client1.query(`INSERT INTO global_students DEFAULT VALUES RETURNING student_global_id;`);
            const studentGlobalId9 = studentRes9.rows[0].student_global_id;
            await ensureParentLink(client1, 'parent_wh_curr_missing', studentGlobalId9, true);

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
        // HELPER POUR LES TESTS D'ANNIVERSAIRE ET DE RENOUVELLEMENT CONTINU
        // --------------------------------------------------------------------
        const executePaymentFlow = async ({ parentRef, studentGlobalId, pricingIdToUse, durationMonths, certifiedAt, providerEventId, cycleName = 'maternelle', amount = 20000 }) => {
            await ensureParentLink(client1, parentRef, studentGlobalId, true);
            if (certifiedAt) {
                await client1.query(`SET ${testSchema}.simulated_now = '${certifiedAt}';`);
                await client2.query(`SET ${testSchema}.simulated_now = '${certifiedAt}';`);
            }
            const checkoutRes = await client1.query(
                `SELECT ${testSchema}.prepare_parent_pack_checkout($1, $2, $3, $4, $5, $6, $7) AS res;`,
                [parentRef, studentGlobalId, 'ecole_test', 'eleve_' + Math.random().toString(36).slice(2, 7), pricingIdToUse, cycleName, durationMonths]
            );
            const intentId = checkoutRes.rows[0].res.payment_intent_id;

            const webhookRes = await client1.query(
                `SELECT ${testSchema}.process_parent_pack_webhook_event($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) AS res;`,
                ['fedapay', providerEventId, 'transaction.approved', intentId, 'txn_' + providerEventId, amount, 'XOF', 'approved', certifiedAt, 600, 0, true]
            );

            const periodRes = await client1.query(
                `SELECT start_date::text, end_date::text, status FROM ${testSchema}.parent_subscription_periods WHERE payment_intent_id = $1;`,
                [intentId]
            );

            const subRes = await client1.query(
                `SELECT id, billing_anchor_date::text, cumulative_months, status FROM ${testSchema}.parent_subscriptions WHERE id = (SELECT target_id::uuid FROM ${testSchema}.payment_intents WHERE id = $1);`,
                [intentId]
            );

            // Vérification systématique du respect de la contrainte chk_payment_intents_processed_at
            const intentCheck = await client1.query(
                `SELECT status, processed_at FROM ${testSchema}.payment_intents WHERE id = $1;`,
                [intentId]
            );
            assert.strictEqual(intentCheck.rows[0].status, 'completed');
            assert.ok(intentCheck.rows[0].processed_at, 'processed_at doit être non nul lors du statut completed');
            assert.strictEqual(
                new Date(intentCheck.rows[0].processed_at).toISOString(),
                new Date(certifiedAt).toISOString(),
                'processed_at doit correspondre exactement à la date certifiée'
            );

            return {
                intentId,
                webhookStatus: webhookRes.rows[0].res.status,
                period: periodRes.rows[0],
                subscription: subRes.rows[0]
            };
        };

        // --------------------------------------------------------------------
        // TEST 11 : Date anniversaire - Achat 15 février → renouvellement 15 mars
        // --------------------------------------------------------------------
        await t.test('11. Date anniversaire : Achat le 15 février → renouvellement le 15 mars', async () => {
            const studentRes11 = await client1.query(`INSERT INTO global_students DEFAULT VALUES RETURNING student_global_id;`);
            const studentId11 = studentRes11.rows[0].student_global_id;

            // Étape 1 : Achat le 15 février 2027
            const step1 = await executePaymentFlow({
                parentRef: 'parent_anniv_feb15',
                studentGlobalId: studentId11,
                pricingIdToUse: pricingId,
                durationMonths: 1,
                certifiedAt: '2027-02-15T10:00:00Z',
                providerEventId: 'evt_anniv_feb15_1'
            });

            assert.strictEqual(step1.webhookStatus, 'completed');
            assert.strictEqual(step1.period.start_date, '2027-02-15');
            assert.strictEqual(step1.period.end_date, '2027-03-14');
            assert.strictEqual(step1.subscription.billing_anchor_date, '2027-02-15');
            assert.strictEqual(step1.subscription.cumulative_months, 1);

            // Étape 2 : Renouvellement à l'échéance le 15 mars 2027
            const step2 = await executePaymentFlow({
                parentRef: 'parent_anniv_feb15',
                studentGlobalId: studentId11,
                pricingIdToUse: pricingId,
                durationMonths: 1,
                certifiedAt: '2027-03-15T10:00:00Z',
                providerEventId: 'evt_anniv_feb15_2'
            });

            assert.strictEqual(step2.webhookStatus, 'completed');
            assert.strictEqual(step2.period.start_date, '2027-03-15', 'Le renouvellement commence exactement le 15 mars');
            assert.strictEqual(step2.period.end_date, '2027-04-14');
            assert.strictEqual(step2.subscription.billing_anchor_date, '2027-02-15', 'L ancrage d origine au 15 février est préservé');
            assert.strictEqual(step2.subscription.cumulative_months, 2);
        });

        // --------------------------------------------------------------------
        // TEST 12 : Date anniversaire - 31 janvier 2027 (non-bissextile) → 28 fév, 31 mar, 30 avr, 31 mai
        // --------------------------------------------------------------------
        await t.test('12. Date anniversaire : 31 janvier 2027 → 28 février, 31 mars, 30 avril, 31 mai', async () => {
            const studentRes12 = await client1.query(`INSERT INTO global_students DEFAULT VALUES RETURNING student_global_id;`);
            const studentId12 = studentRes12.rows[0].student_global_id;

            // Mois 1 : Achat le 31 janvier 2027
            const m1 = await executePaymentFlow({
                parentRef: 'parent_anniv_jan31_2027',
                studentGlobalId: studentId12,
                pricingIdToUse: pricingId,
                durationMonths: 1,
                certifiedAt: '2027-01-31T09:00:00Z',
                providerEventId: 'evt_anniv_jan31_m1'
            });
            assert.strictEqual(m1.period.start_date, '2027-01-31');
            assert.strictEqual(m1.period.end_date, '2027-02-27');
            assert.strictEqual(m1.subscription.billing_anchor_date, '2027-01-31');
            assert.strictEqual(m1.subscription.cumulative_months, 1);

            // Mois 2 : Renouvellement au 28 février 2027 (dernier jour de février)
            const m2 = await executePaymentFlow({
                parentRef: 'parent_anniv_jan31_2027',
                studentGlobalId: studentId12,
                pricingIdToUse: pricingId,
                durationMonths: 1,
                certifiedAt: '2027-02-28T09:00:00Z',
                providerEventId: 'evt_anniv_jan31_m2'
            });
            assert.strictEqual(m2.period.start_date, '2027-02-28', 'Renouvellement au dernier jour de février (28)');
            assert.strictEqual(m2.period.end_date, '2027-03-30');
            assert.strictEqual(m2.subscription.billing_anchor_date, '2027-01-31');
            assert.strictEqual(m2.subscription.cumulative_months, 2);

            // Mois 3 : Renouvellement au 31 mars 2027 (31 retrouvé !)
            const m3 = await executePaymentFlow({
                parentRef: 'parent_anniv_jan31_2027',
                studentGlobalId: studentId12,
                pricingIdToUse: pricingId,
                durationMonths: 1,
                certifiedAt: '2027-03-31T09:00:00Z',
                providerEventId: 'evt_anniv_jan31_m3'
            });
            assert.strictEqual(m3.period.start_date, '2027-03-31', 'Jour anniversaire d origine 31 retrouvé en mars');
            assert.strictEqual(m3.period.end_date, '2027-04-29');
            assert.strictEqual(m3.subscription.billing_anchor_date, '2027-01-31');
            assert.strictEqual(m3.subscription.cumulative_months, 3);

            // Mois 4 : Renouvellement au 30 avril 2027 (dernier jour d avril)
            const m4 = await executePaymentFlow({
                parentRef: 'parent_anniv_jan31_2027',
                studentGlobalId: studentId12,
                pricingIdToUse: pricingId,
                durationMonths: 1,
                certifiedAt: '2027-04-30T09:00:00Z',
                providerEventId: 'evt_anniv_jan31_m4'
            });
            assert.strictEqual(m4.period.start_date, '2027-04-30', 'Dernier jour d avril (30)');
            assert.strictEqual(m4.period.end_date, '2027-05-30');
            assert.strictEqual(m4.subscription.billing_anchor_date, '2027-01-31');
            assert.strictEqual(m4.subscription.cumulative_months, 4);

            // Mois 5 : Renouvellement au 31 mai 2027 (31 retrouvé !)
            const m5 = await executePaymentFlow({
                parentRef: 'parent_anniv_jan31_2027',
                studentGlobalId: studentId12,
                pricingIdToUse: pricingId,
                durationMonths: 1,
                certifiedAt: '2027-05-31T09:00:00Z',
                providerEventId: 'evt_anniv_jan31_m5'
            });
            assert.strictEqual(m5.period.start_date, '2027-05-31', 'Jour anniversaire 31 retrouvé en mai');
            assert.strictEqual(m5.period.end_date, '2027-06-29');
            assert.strictEqual(m5.subscription.billing_anchor_date, '2027-01-31');
            assert.strictEqual(m5.subscription.cumulative_months, 5);
        });

        // --------------------------------------------------------------------
        // TEST 13 : Date anniversaire - 31 janvier 2028 (bissextile) → 29 fév, 31 mar
        // --------------------------------------------------------------------
        await t.test('13. Date anniversaire : 31 janvier 2028 (bissextile) → 29 février, 31 mars', async () => {
            const studentRes13 = await client1.query(`INSERT INTO global_students DEFAULT VALUES RETURNING student_global_id;`);
            const studentId13 = studentRes13.rows[0].student_global_id;

            // Mois 1 : Achat 31 janvier 2028
            const m1 = await executePaymentFlow({
                parentRef: 'parent_anniv_jan31_2028',
                studentGlobalId: studentId13,
                pricingIdToUse: pricingId,
                durationMonths: 1,
                certifiedAt: '2028-01-31T10:00:00Z',
                providerEventId: 'evt_anniv_leap_m1'
            });
            assert.strictEqual(m1.period.start_date, '2028-01-31');
            assert.strictEqual(m1.period.end_date, '2028-02-28');
            assert.strictEqual(m1.subscription.billing_anchor_date, '2028-01-31');
            assert.strictEqual(m1.subscription.cumulative_months, 1);

            // Mois 2 : Renouvellement au 29 février 2028 (année bissextile)
            const m2 = await executePaymentFlow({
                parentRef: 'parent_anniv_jan31_2028',
                studentGlobalId: studentId13,
                pricingIdToUse: pricingId,
                durationMonths: 1,
                certifiedAt: '2028-02-29T10:00:00Z',
                providerEventId: 'evt_anniv_leap_m2'
            });
            assert.strictEqual(m2.period.start_date, '2028-02-29', 'Renouvellement exact au 29 février bissextile');
            assert.strictEqual(m2.period.end_date, '2028-03-30');
            assert.strictEqual(m2.subscription.billing_anchor_date, '2028-01-31');
            assert.strictEqual(m2.subscription.cumulative_months, 2);

            // Mois 3 : Renouvellement au 31 mars 2028
            const m3 = await executePaymentFlow({
                parentRef: 'parent_anniv_jan31_2028',
                studentGlobalId: studentId13,
                pricingIdToUse: pricingId,
                durationMonths: 1,
                certifiedAt: '2028-03-31T10:00:00Z',
                providerEventId: 'evt_anniv_leap_m3'
            });
            assert.strictEqual(m3.period.start_date, '2028-03-31', 'Jour anniversaire 31 restauré');
            assert.strictEqual(m3.period.end_date, '2028-04-29');
            assert.strictEqual(m3.subscription.billing_anchor_date, '2028-01-31');
            assert.strictEqual(m3.subscription.cumulative_months, 3);
        });

        // --------------------------------------------------------------------
        // TEST 14 : Date anniversaire - Achat 29 février 2028 (jour bissextile)
        // --------------------------------------------------------------------
        await t.test('14. Date anniversaire : Achat le 29 février 2028 → renouvellement le 29 mars', async () => {
            const studentRes14 = await client1.query(`INSERT INTO global_students DEFAULT VALUES RETURNING student_global_id;`);
            const studentId14 = studentRes14.rows[0].student_global_id;

            const m1 = await executePaymentFlow({
                parentRef: 'parent_anniv_feb29',
                studentGlobalId: studentId14,
                pricingIdToUse: pricingId,
                durationMonths: 1,
                certifiedAt: '2028-02-29T11:00:00Z',
                providerEventId: 'evt_anniv_feb29_1'
            });
            assert.strictEqual(m1.period.start_date, '2028-02-29');
            assert.strictEqual(m1.period.end_date, '2028-03-28');
            assert.strictEqual(m1.subscription.billing_anchor_date, '2028-02-29');
            assert.strictEqual(m1.subscription.cumulative_months, 1);

            const m2 = await executePaymentFlow({
                parentRef: 'parent_anniv_feb29',
                studentGlobalId: studentId14,
                pricingIdToUse: pricingId,
                durationMonths: 1,
                certifiedAt: '2028-03-29T11:00:00Z',
                providerEventId: 'evt_anniv_feb29_2'
            });
            assert.strictEqual(m2.period.start_date, '2028-03-29', 'Renouvellement exact au 29 mars');
            assert.strictEqual(m2.period.end_date, '2028-04-28');
            assert.strictEqual(m2.subscription.billing_anchor_date, '2028-02-29');
            assert.strictEqual(m2.subscription.cumulative_months, 2);
        });

        // --------------------------------------------------------------------
        // TEST 15 : Date anniversaire - 31 août 2027 → 30 septembre, 31 octobre
        // --------------------------------------------------------------------
        await t.test('15. Date anniversaire : 31 août 2027 → 30 septembre, 31 octobre', async () => {
            const studentRes15 = await client1.query(`INSERT INTO global_students DEFAULT VALUES RETURNING student_global_id;`);
            const studentId15 = studentRes15.rows[0].student_global_id;

            // Mois 1 : Achat 31 août 2027
            const m1 = await executePaymentFlow({
                parentRef: 'parent_anniv_aug31',
                studentGlobalId: studentId15,
                pricingIdToUse: pricingId,
                durationMonths: 1,
                certifiedAt: '2027-08-31T08:00:00Z',
                providerEventId: 'evt_anniv_aug31_1'
            });
            assert.strictEqual(m1.period.start_date, '2027-08-31');
            assert.strictEqual(m1.period.end_date, '2027-09-29');
            assert.strictEqual(m1.subscription.billing_anchor_date, '2027-08-31');
            assert.strictEqual(m1.subscription.cumulative_months, 1);

            // Mois 2 : Renouvellement 30 septembre 2027
            const m2 = await executePaymentFlow({
                parentRef: 'parent_anniv_aug31',
                studentGlobalId: studentId15,
                pricingIdToUse: pricingId,
                durationMonths: 1,
                certifiedAt: '2027-09-30T08:00:00Z',
                providerEventId: 'evt_anniv_aug31_2'
            });
            assert.strictEqual(m2.period.start_date, '2027-09-30', 'Renouvellement le 30 septembre');
            assert.strictEqual(m2.period.end_date, '2027-10-30');
            assert.strictEqual(m2.subscription.billing_anchor_date, '2027-08-31');
            assert.strictEqual(m2.subscription.cumulative_months, 2);

            // Mois 3 : Renouvellement 31 octobre 2027
            const m3 = await executePaymentFlow({
                parentRef: 'parent_anniv_aug31',
                studentGlobalId: studentId15,
                pricingIdToUse: pricingId,
                durationMonths: 1,
                certifiedAt: '2027-10-31T08:00:00Z',
                providerEventId: 'evt_anniv_aug31_3'
            });
            assert.strictEqual(m3.period.start_date, '2027-10-31', 'Jour anniversaire 31 retrouvé en octobre');
            assert.strictEqual(m3.period.end_date, '2027-11-29');
            assert.strictEqual(m3.subscription.billing_anchor_date, '2027-08-31');
            assert.strictEqual(m3.subscription.cumulative_months, 3);
        });

        // --------------------------------------------------------------------
        // TEST 16 : Alternance formules 1 mois et 10 mois avec cumul exact
        // --------------------------------------------------------------------
        await t.test('16. Formules cumulées : alternance 1 mois et 10 mois sans perte d ancrage', async () => {
            // Insertion d'un pricing de formule annuelle de 10 mois
            const pricingRes10m = await client1.query(`
                INSERT INTO parent_pack_pricing (cycle_name, active, monthly_price_minor, annual_price_minor, annual_duration_months, currency)
                VALUES ('annuel_10m', true, 20000, 180000, 10, 'XOF')
                RETURNING id;
            `);
            const pricingId10m = pricingRes10m.rows[0].id;

            const studentRes16 = await client1.query(`INSERT INTO global_students DEFAULT VALUES RETURNING student_global_id;`);
            const studentId16 = studentRes16.rows[0].student_global_id;

            // Étape 1 : Souscription initiale 1 mois le 31 janvier 2027
            const p1 = await executePaymentFlow({
                parentRef: 'parent_alternate_1_10',
                studentGlobalId: studentId16,
                pricingIdToUse: pricingId10m,
                durationMonths: 1,
                cycleName: 'annuel_10m',
                amount: 20000,
                certifiedAt: '2027-01-31T10:00:00Z',
                providerEventId: 'evt_alt_1m'
            });
            assert.strictEqual(p1.period.start_date, '2027-01-31');
            assert.strictEqual(p1.period.end_date, '2027-02-27');
            assert.strictEqual(p1.subscription.billing_anchor_date, '2027-01-31');
            assert.strictEqual(p1.subscription.cumulative_months, 1);

            // Étape 2 : Renouvellement avec la formule 10 mois le 28 février 2027
            const p2 = await executePaymentFlow({
                parentRef: 'parent_alternate_1_10',
                studentGlobalId: studentId16,
                pricingIdToUse: pricingId10m,
                durationMonths: 10,
                cycleName: 'annuel_10m',
                amount: 180000,
                certifiedAt: '2027-02-28T10:00:00Z',
                providerEventId: 'evt_alt_10m'
            });
            assert.strictEqual(p2.period.start_date, '2027-02-28');
            // 2027-01-31 + 11 mois = 2027-12-31. Moins 1 jour = 2027-12-30.
            assert.strictEqual(p2.period.end_date, '2027-12-30', 'Couverture exacte de 11 mois calendaires au total');
            assert.strictEqual(p2.subscription.billing_anchor_date, '2027-01-31', 'Ancrage originel préservé');
            assert.strictEqual(p2.subscription.cumulative_months, 11, 'Cumul exact 1 + 10 = 11 mois');

            // Étape 3 : Renouvellement suivant d 1 mois le 31 décembre 2027
            const p3 = await executePaymentFlow({
                parentRef: 'parent_alternate_1_10',
                studentGlobalId: studentId16,
                pricingIdToUse: pricingId10m,
                durationMonths: 1,
                cycleName: 'annuel_10m',
                amount: 20000,
                certifiedAt: '2027-12-31T10:00:00Z',
                providerEventId: 'evt_alt_1m_next'
            });
            assert.strictEqual(p3.period.start_date, '2027-12-31', 'Renouvellement exact au 31 décembre');
            // 2027-01-31 + 12 mois = 2028-01-31. Moins 1 jour = 2028-01-30.
            assert.strictEqual(p3.period.end_date, '2028-01-30', 'Couverture exacte de 12 mois');
            assert.strictEqual(p3.subscription.billing_anchor_date, '2027-01-31');
            assert.strictEqual(p3.subscription.cumulative_months, 12, 'Cumul exact 11 + 1 = 12 mois');
        });

        // --------------------------------------------------------------------
        // TEST 17 : Interruption réelle de couverture (gap impayé) puis nouvel ancrage
        // --------------------------------------------------------------------
        await t.test('17. Interruption réelle de couverture : réancrage au paiement certifié sans perte de jours', async () => {
            const studentRes17 = await client1.query(`INSERT INTO global_students DEFAULT VALUES RETURNING student_global_id;`);
            const studentId17 = studentRes17.rows[0].student_global_id;

            // Étape 1 : Souscription 1 mois le 15 janvier 2027
            const cycle1 = await executePaymentFlow({
                parentRef: 'parent_interrupted',
                studentGlobalId: studentId17,
                pricingIdToUse: pricingId,
                durationMonths: 1,
                certifiedAt: '2027-01-15T09:00:00Z',
                providerEventId: 'evt_gap_cycle1'
            });
            assert.strictEqual(cycle1.period.start_date, '2027-01-15');
            assert.strictEqual(cycle1.period.end_date, '2027-02-14');
            assert.strictEqual(cycle1.subscription.billing_anchor_date, '2027-01-15');
            assert.strictEqual(cycle1.subscription.cumulative_months, 1);

            // Étape 2 : Le parent n a pas renouvelé en février ni mars.
            // Reprise avec nouveau paiement certifié le 10 avril 2027 (interruption de couverture)
            const cycle2 = await executePaymentFlow({
                parentRef: 'parent_interrupted',
                studentGlobalId: studentId17,
                pricingIdToUse: pricingId,
                durationMonths: 1,
                certifiedAt: '2027-04-10T14:30:00Z',
                providerEventId: 'evt_gap_cycle2_new_anchor'
            });

            // Le nouveau cycle démarre au jour du paiement certifié après interruption
            assert.ok(new Date(cycle2.period.start_date) > new Date(cycle1.period.end_date), 'Interruption confirmée : date de reprise postérieure à fin de couverture');
            assert.strictEqual(cycle2.period.start_date, '2027-04-10', 'Nouvelle couverture démarre exactement au paiement certifié');
            assert.strictEqual(cycle2.period.end_date, '2027-05-09', 'Couvre 1 mois calendaire entier depuis le nouvel ancrage (2027-04-10 au 2027-05-09)');
            assert.strictEqual(cycle2.period.status, 'active', 'La nouvelle période après interruption est active');
            assert.strictEqual(cycle2.subscription.billing_anchor_date, '2027-04-10', 'Nouvel ancrage d anniversaire au 10 avril');
            assert.strictEqual(cycle2.subscription.cumulative_months, 1, 'Cumul réinitialisé pour la nouvelle chaîne continue');

            // Contrôle direct de la persistance en base pour la période après interruption
            const dbPeriodCheck = await client1.query(`
                SELECT start_date::text, end_date::text, status
                FROM ${testSchema}.parent_subscription_periods
                WHERE payment_intent_id = $1;
            `, [cycle2.intentId]);
            assert.strictEqual(dbPeriodCheck.rows[0].start_date, '2027-04-10', 'start_date persisté non-null en base');
            assert.strictEqual(dbPeriodCheck.rows[0].end_date, '2027-05-09', 'end_date persisté non-null en base');
            assert.strictEqual(dbPeriodCheck.rows[0].status, 'active', 'status persisté actif en base');

            // Étape 3 : Renouvellement continu de ce nouveau cycle le 10 mai 2027
            const cycle2Renew = await executePaymentFlow({
                parentRef: 'parent_interrupted',
                studentGlobalId: studentId17,
                pricingIdToUse: pricingId,
                durationMonths: 1,
                certifiedAt: '2027-05-10T09:00:00Z',
                providerEventId: 'evt_gap_cycle2_renew'
            });
            assert.strictEqual(cycle2Renew.period.start_date, '2027-05-10', 'Renouvellement exact au 10 mai');
            assert.strictEqual(cycle2Renew.period.end_date, '2027-06-09');
            assert.strictEqual(cycle2Renew.subscription.billing_anchor_date, '2027-04-10', 'Ancrage du 10 avril conservé');
            assert.strictEqual(cycle2Renew.subscription.cumulative_months, 2);
        });

        // --------------------------------------------------------------------
        // TEST 18 : Résilience historique : gestion des interruptions sans supposer MIN(start_date)
        // --------------------------------------------------------------------
        await t.test('18. Résilience historique : isolation de la chaîne continue sans supposer MIN(start_date)', async () => {
            const studentRes18 = await client1.query(`INSERT INTO global_students DEFAULT VALUES RETURNING student_global_id;`);
            const studentId18 = studentRes18.rows[0].student_global_id;

            // Insertion manuelle d une souscription historique avec billing_anchor_date = NULL
            const subInsert = await client1.query(`
                INSERT INTO ${testSchema}.parent_subscriptions (
                    parent_ref, student_global_id, school_slug, student_ref, pricing_id, status, billing_anchor_date, cumulative_months
                ) VALUES (
                    'parent_hist_legacy', $1, 'ecole_test', 'eleve_hist_1', $2, 'active', NULL, 0
                ) RETURNING id;
            `, [studentId18, pricingId]);
            const legacySubId = subInsert.rows[0].id;

            // Période ancienne interrompue (janvier 2026)
            const intentOldRes = await client1.query(`
                INSERT INTO ${testSchema}.payment_intents (
                    target_id, expected_amount, expected_currency, status, payment_type, school_slug, metadata, processed_at
                ) VALUES ($1, 20000, 'XOF', 'completed', 'parent_pack', 'ecole_test', jsonb_build_object('duration_months', 1), '2026-01-15T10:00:00.000Z')
                RETURNING id;
            `, [legacySubId]);
            await client1.query(`
                INSERT INTO ${testSchema}.parent_subscription_periods (
                    subscription_id, payment_intent_id, start_date, end_date, status
                ) VALUES ($1, $2, '2026-01-15', '2026-02-14', 'expired');
            `, [legacySubId, intentOldRes.rows[0].id]);

            // Période récente (31 août 2026 à 29 septembre 2026) après une interruption de 6 mois
            const intentRecentRes = await client1.query(`
                INSERT INTO ${testSchema}.payment_intents (
                    target_id, expected_amount, expected_currency, status, payment_type, school_slug, metadata, processed_at
                ) VALUES ($1, 20000, 'XOF', 'completed', 'parent_pack', 'ecole_test', jsonb_build_object('duration_months', 1), '2026-08-31T10:00:00.000Z')
                RETURNING id;
            `, [legacySubId]);
            await client1.query(`
                INSERT INTO ${testSchema}.parent_subscription_periods (
                    subscription_id, payment_intent_id, start_date, end_date, status
                ) VALUES ($1, $2, '2026-08-31', '2026-09-29', 'active');
            `, [legacySubId, intentRecentRes.rows[0].id]);

            // Renouvellement continu au 30 septembre 2026
            await ensureParentLink(client1, 'parent_hist_legacy', studentId18, true);
            const renewIntentRes = await client1.query(`
                SELECT ${testSchema}.prepare_parent_pack_checkout($1, $2, $3, $4, $5, $6, $7) AS res;
            `, ['parent_hist_legacy', studentId18, 'ecole_test', 'eleve_hist_1', pricingId, 'maternelle', 1]);
            const renewIntentId = renewIntentRes.rows[0].res.payment_intent_id;

            const webhookRes = await client1.query(
                `SELECT ${testSchema}.process_parent_pack_webhook_event($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) AS res;`,
                ['fedapay', 'evt_hist_renew_sep30', 'transaction.approved', renewIntentId, 'txn_hist_renew_sep30', 20000, 'XOF', 'approved', '2026-09-30T09:00:00Z', 600, 0, true]
            );
            assert.strictEqual(webhookRes.rows[0].res.status, 'completed');

            const periodRes = await client1.query(
                `SELECT start_date::text, end_date::text FROM ${testSchema}.parent_subscription_periods WHERE payment_intent_id = $1;`,
                [renewIntentId]
            );
            // La CTE récursive s est arrêtée à 2026-08-31 et a ignoré 2026-01-15 !
            // Ancrage détecté = 2026-08-31. Mois cumulés = 1 (période récente) + 1 (renouvellement) = 2 mois.
            // 2026-08-31 + 2 mois - 1 jour = 2026-10-31 - 1 jour = 2026-10-30.
            assert.strictEqual(periodRes.rows[0].start_date, '2026-09-30');
            assert.strictEqual(periodRes.rows[0].end_date, '2026-10-30', 'Calcul exact basé sur l ancrage du cycle récent 2026-08-31');

            const subCheck = await client1.query(
                `SELECT billing_anchor_date::text, cumulative_months FROM ${testSchema}.parent_subscriptions WHERE id = $1;`,
                [legacySubId]
            );
            assert.strictEqual(subCheck.rows[0].billing_anchor_date, '2026-08-31', 'Ancrage récent correctement assigné');
            assert.strictEqual(subCheck.rows[0].cumulative_months, 2);
        });

        // --------------------------------------------------------------------
        // TEST 19 : Renouvellement anticipé : conservation de la couverture en cours sans jour perdu
        // --------------------------------------------------------------------
        await t.test('19. Renouvellement anticipé : aucun chevauchement ni jour de couverture perdu', async () => {
            const studentRes19 = await client1.query(`INSERT INTO global_students DEFAULT VALUES RETURNING student_global_id;`);
            const studentId19 = studentRes19.rows[0].student_global_id;

            // Étape 1 : Achat 1 mois le 15 février 2027 (échéance au 14 mars)
            const p1 = await executePaymentFlow({
                parentRef: 'parent_early_renew',
                studentGlobalId: studentId19,
                pricingIdToUse: pricingId,
                durationMonths: 1,
                certifiedAt: '2027-02-15T08:00:00Z',
                providerEventId: 'evt_early_p1'
            });
            assert.strictEqual(p1.period.start_date, '2027-02-15');
            assert.strictEqual(p1.period.end_date, '2027-03-14');
            assert.strictEqual(p1.subscription.billing_anchor_date, '2027-02-15');
            assert.strictEqual(p1.subscription.cumulative_months, 1);

            // Étape 2 : Le parent paie son renouvellement en avance le 5 mars 2027 (9 jours avant expiration)
            const p2 = await executePaymentFlow({
                parentRef: 'parent_early_renew',
                studentGlobalId: studentId19,
                pricingIdToUse: pricingId,
                durationMonths: 1,
                certifiedAt: '2027-03-05T14:00:00Z',
                providerEventId: 'evt_early_p2_advance'
            });

            // La nouvelle période doit démarrer le 15 mars (lendemain de la fin de la période 1), et non le 5 mars
            assert.strictEqual(p2.period.start_date, '2027-03-15', 'La nouvelle période s enchaîne sans écraser les 9 jours restants');
            assert.strictEqual(p2.period.end_date, '2027-04-14', 'Couvre jusqu au 14 avril inclus');
            assert.strictEqual(p2.subscription.billing_anchor_date, '2027-02-15', 'Ancrage du 15 février préservé');
            assert.strictEqual(p2.subscription.cumulative_months, 2, 'Cumul incrémenté à 2 mois');

            // Vérifier que les deux périodes sont actives et strictement consécutives dans la base
            const allPeriods = await client1.query(
                `SELECT start_date::text, end_date::text, status FROM ${testSchema}.parent_subscription_periods WHERE subscription_id = $1 ORDER BY start_date ASC;`,
                [p1.subscription.id]
            );
            assert.strictEqual(allPeriods.rows.length, 2);
            assert.strictEqual(allPeriods.rows[0].end_date, '2027-03-14');
            assert.strictEqual(allPeriods.rows[1].start_date, '2027-03-15');
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
