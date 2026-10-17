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
            CREATE TABLE IF NOT EXISTS currency_config (
                currency_code TEXT PRIMARY KEY,
                cooling_off_days INTEGER DEFAULT 14
            );
            INSERT INTO currency_config (currency_code, cooling_off_days) VALUES ('XOF', 14) ON CONFLICT DO NOTHING;
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
                subscription_id UUID NOT NULL,
                start_date DATE NOT NULL,
                end_date DATE NOT NULL,
                pricing_id UUID NOT NULL,
                duration_months INTEGER NOT NULL,
                payment_intent_id UUID NOT NULL,
                created_at TIMESTAMPTZ DEFAULT clock_timestamp()
            );

            CREATE TABLE IF NOT EXISTS affiliate_financial_ledger (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                affiliate_id UUID NOT NULL,
                school_slug TEXT NOT NULL,
                event_type TEXT NOT NULL,
                reference_type TEXT NOT NULL,
                reference_id UUID NOT NULL,
                amount_minor BIGINT NOT NULL,
                currency TEXT NOT NULL,
                status TEXT NOT NULL,
                maturation_at TIMESTAMPTZ
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
        // TEST 4 : Échec Fail-Closed strict de la migration si doublons
        // --------------------------------------------------------------------
        await t.test('4. Échec transactionnel (ROLLBACK) de la migration P27 en cas de doublons', async () => {
            // A. Reproduire fidèlement l'état historique avant déploiement P27 dans le schéma de test
            await client1.query(`DROP INDEX IF EXISTS ${testSchema}.uq_active_parent_pack_intent;`);

            // Récupérer le target_id d'une intention existante
            const intentRow = await client1.query(
                `SELECT target_id FROM ${testSchema}.payment_intents WHERE payment_type = 'parent_pack' LIMIT 1;`
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
