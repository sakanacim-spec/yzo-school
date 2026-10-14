'use strict';

/**
 * ============================================================================
 * YZIOW — P26-B Lot 1B : Banc de Test PostgreSQL Isolé Multi-Clients
 * ============================================================================
 *
 * Ce banc de test exécute des assertions SQL réelles sous forte concurrence
 * avec au moins deux connexions PostgreSQL indépendantes.
 *
 * Scénarios couverts :
 * 1. Concurrence Ordre 1 : Suppression gagne le verrou, le rattachement direct est mis en attente puis rejeté
 * 2. Concurrence Ordre 2 : Rattachement direct gagne le verrou, la suppression est mise en attente puis absorbe le lien
 * 3. Concurrence Ordre 1 : Suppression gagne le verrou, l'approbation est mise en attente puis rejetée STUDENT_DELETED_LOCAL
 * 4. Concurrence Ordre 2 : Approbation gagne le verrou, la suppression est mise en attente puis absorbe le lien et désactive le lien global
 * 5A. Création / liaison visant un élève supprimé : Rejet immédiat STUDENT_NOT_FOUND
 * 5B. Demande orpheline résiduelle : Rejet défensif SELECT FOR UPDATE, zéro lien orphelin
 * 6. Préservation stricte des liens dans un autre établissement et désactivation sélective au dernier détachement
 * 7. Conflits de verrouillage temporaires et résolution séquentielle sans deadlock
 * 8. Contrôle strict des habilitations (rôle comptable / directeur tiers / usurpation)
 * 9. Rollback transactionnel complet après exception provoquée
 * 10. Privilèges PostgreSQL stricts (Rôles anon et authenticated confinés)
 *
 * Garde-fous de sécurité stricts :
 * - Hôte imposé : 127.0.0.1 exclusivement (refus de tout autre hôte)
 * - Port imposé : 54329 exclusivement
 * - Base imposée : yziow_disposable_test_p26b exclusivement
 * - Nettoyage strict limité exclusivement aux données fictives créées pour ces tests
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Pool } = require('pg');

// Définition des configurations autorisées en liste blanche stricte
const ALLOWED_TARGETS = [
    {
        name: 'Local Disposable Docker Container',
        hosts: ['127.0.0.1'],
        ports: ['54329'],
        databases: ['yziow_disposable_test_p26b']
    },
    {
        name: 'CI GitHub Actions PostgreSQL Service',
        hosts: ['localhost', '127.0.0.1'],
        ports: ['5432'],
        databases: ['yzo_test'],
        requiresCI: true
    }
];

function validateDatabaseUrlSecurity(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
        assert.fail('POSTGRES_TEST_BLOCKED: DATABASE_URL non défini.');
    }

    let parsed;
    try {
        parsed = new URL(rawUrl.trim());
    } catch {
        assert.fail('POSTGRES_TEST_BLOCKED: Format DATABASE_URL invalide.');
    }

    // 1. Contrôle strict du protocole
    const protocol = (parsed.protocol || '').toLowerCase();
    if (protocol !== 'postgres:' && protocol !== 'postgresql:') {
        assert.fail(
            `SECURITY_VIOLATION: Protocole non autorisé (${protocol}). ` +
            `Seuls les protocoles postgres: et postgresql: sont autorisés.`
        );
    }

    const hostname = parsed.hostname.toLowerCase();
    const port = parsed.port || '5432';
    const dbName = (parsed.pathname || '').replace(/^\//, '');

    // 2. Refus formel des bases système ou de production
    const FORBIDDEN_DATABASES = ['postgres', 'production', 'prod', 'yziow_prod', 'yziow_production', 'supabase'];
    if (FORBIDDEN_DATABASES.includes(dbName.toLowerCase())) {
        assert.fail(
            `SECURITY_VIOLATION: Base de données de production ou système interdite (${dbName}).`
        );
    }

    // 3. Refus catégorique des domaines distants, URLs Supabase et IPs publiques
    if (
        hostname.includes('supabase.co') ||
        hostname.includes('amazonaws.com') ||
        hostname.includes('azure.com') ||
        hostname.includes('render.com') ||
        hostname.includes('vercel.app') ||
        (!['127.0.0.1', 'localhost'].includes(hostname))
    ) {
        assert.fail(
            `SECURITY_VIOLATION: Hôte non autorisé (${hostname}). ` +
            `Seules l'adresse locale 127.0.0.1 et localhost sont admises.`
        );
    }

    // 4. Vérification contre la liste blanche des environnements autorisés
    const matched = ALLOWED_TARGETS.find(target => {
        const hostOk = target.hosts.includes(hostname);
        const portOk = target.ports.includes(port);
        const dbOk = target.databases.includes(dbName);
        if (target.requiresCI) {
            return hostOk && portOk && dbOk && process.env.CI === 'true';
        }
        return hostOk && portOk && dbOk;
    });

    if (!matched) {
        assert.fail(
            `SECURITY_VIOLATION: Configuration de test non autorisée ` +
            `[host=${hostname}, port=${port}, db=${dbName}, CI=${process.env.CI}]. ` +
            `Ce banc exige formellement le conteneur local (127.0.0.1:54329/yziow_disposable_test_p26b) ` +
            `ou le service CI (localhost:5432/yzo_test avec CI=true confirmé).`
        );
    }

    return { hostname, port, dbName, targetName: matched.name };
}

const migrationSqlPath = path.resolve(__dirname, '../scripts/migration_p26_b_link_approval_foundation.sql');

test('P26-B Lot 1B — Banc de validation PostgreSQL sous concurrence multi-clients', async (t) => {
    // Tests négatifs de conformité du garde-fou
    await t.test('Garde-fou : Rejet formel des protocoles, domaines distants, URLs Supabase et configurations non autorisées', () => {
        // Rejet de protocole non-postgres
        assert.throws(
            () => validateDatabaseUrlSecurity('http://127.0.0.1:54329/yziow_disposable_test_p26b'),
            /SECURITY_VIOLATION: Protocole non autorisé/
        );
        assert.throws(
            () => validateDatabaseUrlSecurity('mysql://127.0.0.1:54329/yziow_disposable_test_p26b'),
            /SECURITY_VIOLATION: Protocole non autorisé/
        );

        // Rejet des bases de production ou système
        assert.throws(
            () => validateDatabaseUrlSecurity('postgresql://postgres:pwd@127.0.0.1:54329/postgres'),
            /SECURITY_VIOLATION: Base de données de production ou système interdite/
        );
        assert.throws(
            () => validateDatabaseUrlSecurity('postgresql://postgres:pwd@127.0.0.1:54329/production'),
            /SECURITY_VIOLATION: Base de données de production ou système interdite/
        );

        // Rejet des hôtes distants et Supabase
        assert.throws(
            () => validateDatabaseUrlSecurity('postgresql://postgres:pwd@db.supabase.co:5432/yzo_test'),
            /SECURITY_VIOLATION/
        );
        assert.throws(
            () => validateDatabaseUrlSecurity('postgresql://postgres:pwd@192.168.1.50:5432/yzo_test'),
            /SECURITY_VIOLATION/
        );

        // Rejet port / base discordant
        assert.throws(
            () => validateDatabaseUrlSecurity('postgresql://postgres:pwd@127.0.0.1:5432/yziow_disposable_test_p26b'),
            /SECURITY_VIOLATION/
        );
    });

    const databaseUrl = (process.env.DATABASE_URL || '').trim();
    validateDatabaseUrlSecurity(databaseUrl);

    const pool = new Pool({
        connectionString: databaseUrl,
        connectionTimeoutMillis: 5000,
        max: 5
    });

    let client1;
    let client2;
    let pid1;
    let pid2;

    try {
        client1 = await pool.connect();
        client2 = await pool.connect();

        const { rows: rows1 } = await client1.query('SELECT pg_backend_pid() AS pid');
        pid1 = rows1[0].pid;

        const { rows: rows2 } = await client2.query('SELECT pg_backend_pid() AS pid');
        pid2 = rows2[0].pid;
    } catch (err) {
        assert.fail(`Connexion PostgreSQL impossible (${err.message}). Vérifier le conteneur Docker.`);
    }

    // =========================================================================
    // GESTION DÉTERMINISTE DES TRANSACTIONS ET ÉVITEMENT DE LA CONTAMINATION 25P02
    // =========================================================================
    let client1InTx = false;
    let client2InTx = false;

    async function beginTx(client, label) {
        await client.query('BEGIN');
        if (label === 'client1') client1InTx = true;
        if (label === 'client2') client2InTx = true;
    }

    async function commitTx(client, label) {
        await client.query('COMMIT');
        if (label === 'client1') client1InTx = false;
        if (label === 'client2') client2InTx = false;
    }

    async function rollbackTx(client, label) {
        try {
            await client.query('ROLLBACK');
        } catch {
            // Ignorer si la transaction était déjà avortée ou terminée
        }
        if (label === 'client1') client1InTx = false;
        if (label === 'client2') client2InTx = false;
    }

    async function ensureCleanTransactions() {
        if (client1InTx) {
            await rollbackTx(client1, 'client1');
        }
        if (client2InTx) {
            await rollbackTx(client2, 'client2');
        }
    }

    /**
     * Vérification déterministe de l'attente effective d'un client bloqué sur un verrou.
     * Interroge pg_stat_activity sur la connexion cible jusqu'à observer wait_event_type = 'Lock'.
     */
    async function waitForClientWaiting(targetPid, maxWaitMs = 1500) {
        const start = Date.now();
        while (Date.now() - start < maxWaitMs) {
            const { rows } = await pool.query(
                "SELECT wait_event_type, wait_event FROM pg_stat_activity WHERE pid = $1",
                [targetPid]
            );
            if (rows.length > 0 && rows[0].wait_event_type === 'Lock') {
                return true;
            }
            await new Promise((r) => setTimeout(r, 20));
        }
        return false;
    }

    function extractMigrationBody(sqlText) {
        const lines = sqlText.split(/\r?\n/);
        const firstBeginIdx = lines.findIndex(l => l.trim() === 'BEGIN;');
        let lastCommitIdx = -1;
        for (let i = lines.length - 1; i >= 0; i--) {
            if (lines[i].trim() === 'COMMIT;') {
                lastCommitIdx = i;
                break;
            }
        }
        if (firstBeginIdx !== -1 && lastCommitIdx !== -1 && lastCommitIdx > firstBeginIdx) {
            return lines.slice(firstBeginIdx + 1, lastCommitIdx).join('\n');
        }
        return sqlText;
    }

    const runNonce = Date.now().toString(36) + '_' + crypto.randomUUID().slice(0, 4);
    const slugA = `ecole_test_a_${runNonce}`;
    const slugB = `ecole_test_b_${runNonce}`;

    const directorAId = crypto.randomUUID();
    const directorBId = crypto.randomUUID();
    const comptableAId = crypto.randomUUID();

    try {
        // =====================================================================
        // PHASE 0 : VÉRIFICATION ET INITIALISATION IDEMPOTENTE DU SCHÉMA CANONIQUE
        // =====================================================================
        // Attente de stabilisation si une autre suite (ex. Lot 6B) est en cours de transaction active
        const waitStart = Date.now();
        while (Date.now() - waitStart < 10000) {
            const { rows } = await client1.query(`
                SELECT count(*)::int AS active_tx
                FROM pg_stat_activity
                WHERE datname = current_database()
                  AND pid <> pg_backend_pid()
                  AND pid <> $1
                  AND xact_start IS NOT NULL
            `, [pid2]);
            if (rows[0].active_tx === 0) break;
            await new Promise((r) => setTimeout(r, 100));
        }

        await client1.query('SELECT pg_advisory_lock(999999);');
        try {
            await client1.query(`
                DO $$
                BEGIN
                    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
                    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
                    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
                    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'postgres') THEN CREATE ROLE postgres SUPERUSER; END IF;
                END $$;
            `);

            await client1.query(`
                -- Table maître des établissements
                CREATE TABLE IF NOT EXISTS public.schools (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    slug TEXT NOT NULL UNIQUE,
                    name TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'active',
                    country TEXT DEFAULT 'BJ',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    affiliate_id UUID NULL
                );

                -- P24.1 : global_students
                CREATE TABLE IF NOT EXISTS public.global_students (
                    student_global_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
                );

                -- P24.2 : student_global_mappings
                CREATE TABLE IF NOT EXISTS public.student_global_mappings (
                    mapping_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    school_slug TEXT NOT NULL,
                    student_local_id TEXT NOT NULL,
                    student_global_id UUID NOT NULL REFERENCES public.global_students(student_global_id),
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    UNIQUE (school_slug, student_local_id)
                );
                CREATE INDEX IF NOT EXISTS idx_student_global_mappings_global_id
                    ON public.student_global_mappings(student_global_id);

                -- P24.3 : parent_child_links
                CREATE TABLE IF NOT EXISTS public.parent_child_links (
                    parent_ref TEXT NOT NULL,
                    student_global_id UUID NOT NULL REFERENCES public.global_students(student_global_id),
                    first_linked_at TIMESTAMPTZ NULL,
                    current_link_active BOOLEAN NOT NULL DEFAULT true,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    PRIMARY KEY (parent_ref, student_global_id)
                );
                CREATE INDEX IF NOT EXISTS idx_parent_child_links_parent_ref
                    ON public.parent_child_links(parent_ref);
                CREATE INDEX IF NOT EXISTS idx_parent_child_links_global_id
                    ON public.parent_child_links(student_global_id);

                -- P25-T.2a : parent_student_identity_transfers
                CREATE TABLE IF NOT EXISTS public.parent_student_identity_transfers (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    parent_ref TEXT NOT NULL,
                    student_global_id UUID NOT NULL REFERENCES public.global_students(student_global_id),
                    destination_school_slug TEXT NOT NULL,
                    destination_student_local_id TEXT NOT NULL,
                    status TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                );
            `);

            // Application de la migration P26-B
            const migrationSql = fs.readFileSync(migrationSqlPath, 'utf8');
            const cleanSql = extractMigrationBody(migrationSql);
            await client1.query(cleanSql);
        } finally {
            await client1.query('SELECT pg_advisory_unlock(999999);');
        }

        // Initialisation des écoles et tables scolaires associées
        await client1.query(
            'INSERT INTO public.schools (slug, name) VALUES ($1, $2), ($3, $4)',
            [slugA, `École A ${runNonce}`, slugB, `École B ${runNonce}`]
        );

        await client1.query(
            'SELECT public.create_school_tables($1, $2, $3, $4, $5::uuid)',
            [slugA, 'Directeur A', '+22990000001', '+22990000001', directorAId]
        );
        await client1.query(
            'SELECT public.create_school_tables($1, $2, $3, $4, $5::uuid)',
            [slugB, 'Directeur B', '+22990000002', '+22990000002', directorBId]
        );

        // Profil comptable de test pour le contrôle d'accès
        await client1.query(
            `INSERT INTO public.profiles_${slugA} (id, nom, telephone, phone_normalized, role) VALUES
             ($1, 'Comptable A', '0197000003', '+2290197000003', 'comptable')`,
            [comptableAId]
        );

        // =====================================================================
        // SCÉNARIO 1 : Concurrence Ordre 1 — Suppression avant Rattachement direct
        // Orchestration déterministe découplée : Tx1 verrouille -> Tx2 attend -> Tx1 commit -> Tx2 résout
        // =====================================================================
        await t.test('1. Concurrence Ordre 1 : Suppression gagne le verrou, le rattachement est rejeté', async () => {
            const studentS1 = `STU_S1_${crypto.randomUUID().slice(0, 8)}`;
            const parentS1Id = crypto.randomUUID();

            try {
                // Fixture dédiée
                await client1.query(
                    `INSERT INTO public.profiles_${slugA} (id, nom, telephone, phone_normalized, role) VALUES
                     ($1, 'Parent S1', '0197000101', '+2290197000101', 'parent')`,
                    [parentS1Id]
                );
                await client1.query(
                    `INSERT INTO public.students_${slugA} (id, nom, prenom, classe, telephone_parent_normalized) VALUES
                     ($1, 'Élève S1', 'Marc', '6e', '+2290197000101')`,
                    [studentS1]
                );
                await client1.query(
                    `INSERT INTO public.notes_${slugA} (id, student_id, eleve_nom, eleve_prenom, classe, matiere, note, periode, date)
                     VALUES ($1, $2, 'Élève S1', 'Marc', '6e', 'Maths', 15, 'T1', '2026-10-01')`,
                    [`note_${studentS1}`, studentS1]
                );
                await client1.query(
                    `INSERT INTO public.payments_${slugA} (id, student_id, montant) VALUES ($1, $2, 50000)`,
                    [`pay_${studentS1}`, studentS1]
                );

                // 1. Transaction 1 ouvre et exécute la suppression (acquiert le verrou pg_advisory_xact_lock)
                await beginTx(client1, 'client1');
                const delRes = await client1.query(
                    'SELECT public.delete_student_local_atomically($1, $2, $3::uuid) AS res',
                    [slugA, studentS1, directorAId]
                );
                assert.equal(delRes.rows[0].res.success, true, 'Suppression réussie dans Tx1');

                // 2. Transaction 2 lance le rattachement concurrent (tente d acquérir le même verrou et est mise en attente)
                const linkPromise = client2.query(
                    `SELECT public.link_parent_student_direct_atomic($1, $2::uuid, $3, $4::uuid, 'parent_manual', NULL) AS res`,
                    [slugA, parentS1Id, studentS1, parentS1Id]
                );

                // 3. Vérification de l attente effective de Client 2 sur le verrou PostgreSQL
                const isBlocked = await waitForClientWaiting(pid2);
                assert.ok(isBlocked, 'Client 2 doit être effectivement mis en attente du verrou détenu par Tx1');

                // 4. Libération explicite du verrou par COMMIT de Tx1
                await commitTx(client1, 'client1');

                // 5. Réception du résultat de Client 2 (débloqué, il constate la suppression et est rejeté)
                const linkRes = await linkPromise;
                const linkJson = linkRes.rows[0].res;

                assert.equal(linkJson.success, false, 'Le rattachement direct doit échouer');
                assert.equal(linkJson.error, 'STUDENT_NOT_FOUND', 'L élève n existe plus dans l établissement');

                // Assertions d état final
                const stuCheck = await client1.query(`SELECT count(*) FROM public.students_${slugA} WHERE id = $1`, [studentS1]);
                assert.equal(parseInt(stuCheck.rows[0].count), 0, 'Élève supprimé de students_');

                const linkCheck = await client1.query(`SELECT count(*) FROM public.parent_student_${slugA} WHERE student_id = $1`, [studentS1]);
                assert.equal(parseInt(linkCheck.rows[0].count), 0, 'Aucun lien dans parent_student_');

                const noteCheck = await client1.query(`SELECT count(*) FROM public.notes_${slugA} WHERE student_id = $1`, [studentS1]);
                assert.equal(parseInt(noteCheck.rows[0].count), 0, 'Notes associées supprimées');

                const mapCheck = await client1.query(
                    `SELECT count(*) FROM public.student_global_mappings WHERE school_slug = $1 AND student_local_id = $2`,
                    [slugA, studentS1]
                );
                assert.equal(parseInt(mapCheck.rows[0].count), 0, 'Mapping local supprimé');
            } finally {
                await ensureCleanTransactions();
            }
        });

        // =====================================================================
        // SCÉNARIO 2 : Concurrence Ordre 2 — Rattachement direct avant Suppression
        // Orchestration déterministe découplée : Tx2 lie -> Tx1 attend -> Tx2 commit -> Tx1 absorbe
        // =====================================================================
        await t.test('2. Concurrence Ordre 2 : Rattachement direct gagne le verrou, puis suppression absorbe le lien', async () => {
            const studentS2 = `STU_S2_${crypto.randomUUID().slice(0, 8)}`;
            const parentS2Id = crypto.randomUUID();

            try {
                // Fixture dédiée
                await client1.query(
                    `INSERT INTO public.profiles_${slugA} (id, nom, telephone, phone_normalized, role) VALUES
                     ($1, 'Parent S2', '0197000102', '+2290197000102', 'parent')`,
                    [parentS2Id]
                );
                await client1.query(
                    `INSERT INTO public.students_${slugA} (id, nom, prenom, classe, telephone_parent_normalized) VALUES
                     ($1, 'Élève S2', 'Maxime', '5e', '+2290197000102')`,
                    [studentS2]
                );

                // 1. Transaction 2 ouvre et exécute le rattachement direct (détient le verrou pg_advisory_xact_lock)
                await beginTx(client2, 'client2');
                const linkRes = await client2.query(
                    `SELECT public.link_parent_student_direct_atomic($1, $2::uuid, $3, $4::uuid, 'parent_manual', NULL) AS res`,
                    [slugA, parentS2Id, studentS2, parentS2Id]
                );
                const linkJson = linkRes.rows[0].res;
                assert.equal(linkJson.success, true, 'Le rattachement direct doit réussir dans Tx2');
                const assignedGlobalId = linkJson.student_global_id;
                assert.ok(assignedGlobalId, 'Un student_global_id doit être attribué');

                // 2. Transaction 1 lance la suppression concurrente (est mise en attente par le verrou de Tx2)
                const delPromise = client1.query(
                    'SELECT public.delete_student_local_atomically($1, $2, $3::uuid) AS res',
                    [slugA, studentS2, directorAId]
                );

                // 3. Vérification de l attente effective de Client 1
                const isBlocked = await waitForClientWaiting(pid1);
                assert.ok(isBlocked, 'Client 1 doit être effectivement mis en attente du verrou détenu par Tx2');

                // 4. Libération du verrou par COMMIT de Tx2
                await commitTx(client2, 'client2');

                // 5. Réception du résultat de Client 1 (débloqué, il absorbe le nouveau lien et désactive le lien global)
                const delRes = await delPromise;
                const delJson = delRes.rows[0].res;

                assert.equal(delJson.success, true, 'La suppression doit réussir après déblocage');
                assert.equal(delJson.deleted_parents_count, 1, 'Le lien créé par Tx2 a été absorbé et supprimé');
                assert.equal(delJson.global_links_deactivated_count, 1, 'Le lien global a été désactivé');

                // Assertions d état final
                const linkCheck = await client1.query(
                    `SELECT count(*) FROM public.parent_student_${slugA} WHERE student_id = $1`,
                    [studentS2]
                );
                assert.equal(parseInt(linkCheck.rows[0].count), 0, 'Le lien parent_student a été atomiquement supprimé');

                const pLinkCheck = await client1.query(
                    'SELECT current_link_active FROM public.parent_child_links WHERE parent_ref = $1 AND student_global_id = $2',
                    [parentS2Id, assignedGlobalId]
                );
                assert.equal(pLinkCheck.rows[0].current_link_active, false, 'Le lien global est désactivé');
            } finally {
                await ensureCleanTransactions();
            }
        });

        // =====================================================================
        // SCÉNARIO 3 : Concurrence Ordre 1 — Suppression avant Approbation
        // Orchestration déterministe découplée : Tx1 supprime -> Tx2 attend -> Tx1 commit -> Tx2 rejette
        // =====================================================================
        await t.test('3. Concurrence Ordre 1 : Suppression gagne le verrou, approbation rejetée STUDENT_DELETED_LOCAL', async () => {
            const studentS3 = `STU_S3_${crypto.randomUUID().slice(0, 8)}`;
            const parentS3Id = crypto.randomUUID();

            try {
                // Fixture dédiée
                await client1.query(
                    `INSERT INTO public.profiles_${slugA} (id, nom, telephone, phone_normalized, role) VALUES
                     ($1, 'Parent S3', '0197000103', '+2290197000103', 'parent')`,
                    [parentS3Id]
                );
                await client1.query(
                    `INSERT INTO public.students_${slugA} (id, nom, prenom, classe, telephone_parent_normalized) VALUES
                     ($1, 'Élève S3', 'Paul', '4e', '+2290197000103')`,
                    [studentS3]
                );

                const reqRes = await client1.query(
                    `INSERT INTO public.parent_student_link_requests (
                        school_slug, parent_id, student_id, parent_phone_normalized, parent_name, student_name, status
                    ) VALUES ($1, $2, $3, '+2290197000103', 'Parent S3', 'Élève S3', 'pending') RETURNING id`,
                    [slugA, parentS3Id, studentS3]
                );
                const reqId = reqRes.rows[0].id;

                // 1. Transaction 1 ouvre et exécute la suppression atomique
                await beginTx(client1, 'client1');
                const delRes = await client1.query(
                    'SELECT public.delete_student_local_atomically($1, $2, $3::uuid) AS res',
                    [slugA, studentS3, directorAId]
                );
                assert.equal(delRes.rows[0].res.success, true);

                // 2. Transaction 2 lance l approbation concurrente
                const appPromise = client2.query(
                    'SELECT public.approve_parent_student_link($1::uuid, $2, $3::uuid, $4) AS res',
                    [reqId, slugA, directorAId, 'Directeur A']
                );

                // 3. Vérification de l attente effective de Client 2
                const isBlocked = await waitForClientWaiting(pid2);
                assert.ok(isBlocked, 'Client 2 doit être effectivement mis en attente du verrou élève');

                // 4. Libération du verrou par COMMIT de Tx1
                await commitTx(client1, 'client1');

                // 5. Réception du résultat de Client 2 (débloqué, il constate que l élève a été supprimé)
                const appRes = await appPromise;
                const appJson = appRes.rows[0].res;

                assert.equal(appJson.success, false, 'L approbation doit échouer car la demande est déjà rejetée');
                assert.equal(appJson.error, 'INVALID_STATUS_TRANSITION', 'La demande a été rejetée avec STUDENT_DELETED_LOCAL lors de la suppression atomique');

                const reqCheck = await client1.query(
                    'SELECT status, rejection_reason_code FROM public.parent_student_link_requests WHERE id = $1',
                    [reqId]
                );
                assert.equal(reqCheck.rows[0].status, 'rejected');
                assert.equal(reqCheck.rows[0].rejection_reason_code, 'STUDENT_DELETED_LOCAL');

                const linkCheck = await client1.query(
                    `SELECT count(*) FROM public.parent_student_${slugA} WHERE student_id = $1`,
                    [studentS3]
                );
                assert.equal(parseInt(linkCheck.rows[0].count), 0, 'Zéro lien local orphelin créé');

                // Absence de lien global dans parent_child_links
                const globalCheck = await client1.query(
                    'SELECT count(*) FROM public.parent_child_links WHERE parent_ref = $1',
                    [parentS3Id]
                );
                assert.equal(parseInt(globalCheck.rows[0].count), 0, 'Zéro réactivation du lien global');
            } finally {
                await ensureCleanTransactions();
            }
        });

        // =====================================================================
        // SCÉNARIO 4 : Concurrence Ordre 2 — Approbation avant Suppression
        // Orchestration déterministe découplée : Tx2 approuve -> Tx1 attend -> Tx2 commit -> Tx1 absorbe
        // =====================================================================
        await t.test('4. Concurrence Ordre 2 : Approbation gagne le verrou, puis suppression absorbe le lien et désactive le lien global', async () => {
            const studentS4 = `STU_S4_${crypto.randomUUID().slice(0, 8)}`;
            const parentS4Id = crypto.randomUUID();

            try {
                // Fixture dédiée
                await client1.query(
                    `INSERT INTO public.profiles_${slugA} (id, nom, telephone, phone_normalized, role) VALUES
                     ($1, 'Parent S4', '0197000104', '+2290197000104', 'parent')`,
                    [parentS4Id]
                );
                await client1.query(
                    `INSERT INTO public.students_${slugA} (id, nom, prenom, classe, telephone_parent_normalized) VALUES
                     ($1, 'Élève S4', 'Sara', '3e', '+2290197000104')`,
                    [studentS4]
                );

                const reqRes = await client1.query(
                    `INSERT INTO public.parent_student_link_requests (
                        school_slug, parent_id, student_id, parent_phone_normalized, parent_name, student_name, status
                    ) VALUES ($1, $2, $3, '+2290197000104', 'Parent S4', 'Élève S4', 'pending') RETURNING id`,
                    [slugA, parentS4Id, studentS4]
                );
                const reqId = reqRes.rows[0].id;

                // 1. Transaction 2 ouvre et exécute l approbation
                await beginTx(client2, 'client2');
                const appRes = await client2.query(
                    'SELECT public.approve_parent_student_link($1::uuid, $2, $3::uuid, $4) AS res',
                    [reqId, slugA, directorAId, 'Directeur A']
                );
                const appJson = appRes.rows[0].res;
                assert.equal(appJson.success, true, 'L approbation doit réussir dans Tx2');
                const studentGid = appJson.student_global_id;
                assert.ok(studentGid, 'Un student_global_id doit être généré');

                // 2. Transaction 1 lance la suppression concurrente (mise en attente)
                const delPromise = client1.query(
                    'SELECT public.delete_student_local_atomically($1, $2, $3::uuid) AS res',
                    [slugA, studentS4, directorAId]
                );

                // 3. Vérification de l attente effective de Client 1
                const isBlocked = await waitForClientWaiting(pid1);
                assert.ok(isBlocked, 'Client 1 doit être effectivement mis en attente du verrou élève');

                // 4. Libération du verrou par COMMIT de Tx2
                await commitTx(client2, 'client2');

                // 5. Réception du résultat de Client 1 (débloqué, il absorbe le lien approuvé)
                const delRes = await delPromise;
                const delJson = delRes.rows[0].res;

                assert.equal(delJson.success, true, 'La suppression atomique doit réussir');
                assert.equal(delJson.deleted_parents_count, 1, 'Le lien créé par l approbation doit être supprimé');
                assert.equal(delJson.global_links_deactivated_count, 1, 'Le lien global doit être désactivé');

                // Assertions d état final
                const finalLocal = await client1.query(
                    `SELECT count(*) FROM public.parent_student_${slugA} WHERE student_id = $1`,
                    [studentS4]
                );
                assert.equal(parseInt(finalLocal.rows[0].count), 0, 'Zéro lien résiduel dans parent_student_');

                const finalGlobal = await client1.query(
                    'SELECT current_link_active FROM public.parent_child_links WHERE parent_ref = $1 AND student_global_id = $2',
                    [parentS4Id, studentGid]
                );
                assert.equal(finalGlobal.rows[0].current_link_active, false, 'Le lien global est désactivé au final');
            } finally {
                await ensureCleanTransactions();
            }
        });

        // =====================================================================
        // SCÉNARIO 5A : Rejet à la création d'une liaison sur élève supprimé
        // =====================================================================
        await t.test('5A. Création / liaison visant un élève supprimé : Rejet immédiat STUDENT_NOT_FOUND', async () => {
            const studentDeleted = `STU_DEL_A_${crypto.randomUUID().slice(0, 8)}`;
            const parent5AId = crypto.randomUUID();

            try {
                await client1.query(
                    `INSERT INTO public.profiles_${slugA} (id, nom, telephone, phone_normalized, role) VALUES
                     ($1, 'Parent 5A', '0197000105', '+2290197000105', 'parent')`,
                    [parent5AId]
                );

                const linkRes = await client1.query(
                    `SELECT public.link_parent_student_direct_atomic($1, $2::uuid, $3, $4::uuid, 'parent_manual', NULL) AS res`,
                    [slugA, parent5AId, studentDeleted, parent5AId]
                );
                const linkJson = linkRes.rows[0].res;

                assert.equal(linkJson.success, false, 'Doit refuser la liaison');
                assert.equal(linkJson.error, 'STUDENT_NOT_FOUND', 'L élève est inexistant');

                // Vérification de non-pollution SQL
                const linkCount = await client1.query(
                    `SELECT count(*) FROM public.parent_student_${slugA} WHERE student_id = $1`,
                    [studentDeleted]
                );
                assert.equal(parseInt(linkCount.rows[0].count), 0, 'Zéro ligne insérée');
            } finally {
                await ensureCleanTransactions();
            }
        });

        // =====================================================================
        // SCÉNARIO 5B : Demande orpheline résiduelle (Protection défensive)
        // =====================================================================
        await t.test('5B. Demande orpheline : approve rejette avec SELECT FOR UPDATE et zéro orphelin', async () => {
            const studentDeleted = `STU_DEL_B_${crypto.randomUUID().slice(0, 8)}`;
            const parent5BId = crypto.randomUUID();

            try {
                await client1.query(
                    `INSERT INTO public.profiles_${slugA} (id, nom, telephone, phone_normalized, role) VALUES
                     ($1, 'Parent 5B', '0197000106', '+2290197000106', 'parent')`,
                    [parent5BId]
                );

                const reqRes = await client1.query(
                    `INSERT INTO public.parent_student_link_requests (
                        school_slug, parent_id, student_id, parent_phone_normalized, parent_name, student_name, status
                    ) VALUES ($1, $2, $3, '+2290197000106', 'Parent 5B', 'Élève Supprimé', 'pending') RETURNING id`,
                    [slugA, parent5BId, studentDeleted]
                );
                const reqId = reqRes.rows[0].id;

                const appRes = await client1.query(
                    'SELECT public.approve_parent_student_link($1::uuid, $2, $3::uuid, $4) AS res',
                    [reqId, slugA, directorAId, 'Directeur A']
                );
                const appJson = appRes.rows[0].res;

                assert.equal(appJson.success, false);
                assert.equal(appJson.error, 'STUDENT_NOT_FOUND');

                const reqCheck = await client1.query(
                    'SELECT status, rejection_reason_code FROM public.parent_student_link_requests WHERE id = $1',
                    [reqId]
                );
                assert.equal(reqCheck.rows[0].status, 'rejected');
                assert.equal(reqCheck.rows[0].rejection_reason_code, 'STUDENT_DELETED_LOCAL');

                const localLinkCheck = await client1.query(
                    `SELECT count(*) FROM public.parent_student_${slugA} WHERE student_id = $1`,
                    [studentDeleted]
                );
                assert.equal(parseInt(localLinkCheck.rows[0].count), 0, 'Aucun lien orphelin ne doit être créé');
            } finally {
                await ensureCleanTransactions();
            }
        });

        // =====================================================================
        // SCÉNARIO 6 : Préservation inter-écoles et multi-tenant
        // =====================================================================
        await t.test('6. Préservation des liens dans un autre établissement et désactivation sélective', async () => {
            const studentMultiA = `STU_MA_${crypto.randomUUID().slice(0, 8)}`;
            const studentMultiB = `STU_MB_${crypto.randomUUID().slice(0, 8)}`;
            const parentMultiId = crypto.randomUUID();

            try {
                await client1.query(
                    `INSERT INTO public.profiles_${slugA} (id, nom, telephone, phone_normalized, role) VALUES
                     ($1, 'Parent Multi', '0197000107', '+2290197000107', 'parent')`,
                    [parentMultiId]
                );
                await client1.query(
                    `INSERT INTO public.profiles_${slugB} (id, nom, telephone, phone_normalized, role) VALUES
                     ($1, 'Parent Multi', '0197000107', '+2290197000107', 'parent')`,
                    [parentMultiId]
                );

                await client1.query(
                    `INSERT INTO public.students_${slugA} (id, nom, prenom, classe, telephone_parent_normalized) VALUES
                     ($1, 'Multi Enfant', 'A', '6e', '+2290197000107')`,
                    [studentMultiA]
                );
                await client1.query(
                    `INSERT INTO public.students_${slugB} (id, nom, prenom, classe, telephone_parent_normalized) VALUES
                     ($1, 'Multi Enfant', 'B', '6e', '+2290197000107')`,
                    [studentMultiB]
                );

                const linkARes = await client1.query(
                    `SELECT public.link_parent_student_direct_atomic($1, $2::uuid, $3, $4::uuid, 'parent_manual', NULL) AS res`,
                    [slugA, parentMultiId, studentMultiA, parentMultiId]
                );
                assert.equal(linkARes.rows[0].res.success, true);
                const sharedGlobalId = linkARes.rows[0].res.student_global_id;

                const linkBRes = await client1.query(
                    `SELECT public.link_parent_student_direct_atomic($1, $2::uuid, $3, $4::uuid, 'parent_manual', $5::uuid) AS res`,
                    [slugB, parentMultiId, studentMultiB, parentMultiId, sharedGlobalId]
                );
                assert.equal(linkBRes.rows[0].res.success, true);

                const gCheck = await client1.query(
                    'SELECT current_link_active FROM public.parent_child_links WHERE parent_ref = $1 AND student_global_id = $2',
                    [parentMultiId, sharedGlobalId]
                );
                assert.equal(gCheck.rows[0].current_link_active, true);

                // Suppression dans École A : ne doit PAS affecter École B ni désactiver le lien global
                const delARes = await client1.query(
                    'SELECT public.delete_student_local_atomically($1, $2, $3::uuid) AS res',
                    [slugA, studentMultiA, directorAId]
                );
                const delAJson = delARes.rows[0].res;
                assert.equal(delAJson.success, true);
                assert.equal(delAJson.global_links_preserved_count, 1, 'Le lien global doit être préservé car Ecole B est active');
                assert.equal(delAJson.global_links_deactivated_count, 0);

                const checkB = await client1.query(
                    `SELECT count(*) FROM public.parent_student_${slugB} WHERE parent_id = $1 AND student_id = $2`,
                    [parentMultiId, studentMultiB]
                );
                assert.equal(parseInt(checkB.rows[0].count), 1, 'Le lien dans Ecole B est strictement préservé');

                const gCheck2 = await client1.query(
                    'SELECT current_link_active FROM public.parent_child_links WHERE parent_ref = $1 AND student_global_id = $2',
                    [parentMultiId, sharedGlobalId]
                );
                assert.equal(gCheck2.rows[0].current_link_active, true, 'Le portefeuille global parent_child_links reste actif');

                // Suppression dans École B : dernier détachement, doit désactiver le lien global
                const delBRes = await client1.query(
                    'SELECT public.delete_student_local_atomically($1, $2, $3::uuid) AS res',
                    [slugB, studentMultiB, directorBId]
                );
                assert.equal(delBRes.rows[0].res.success, true);
                assert.equal(delBRes.rows[0].res.global_links_deactivated_count, 1);

                const gCheck3 = await client1.query(
                    'SELECT current_link_active FROM public.parent_child_links WHERE parent_ref = $1 AND student_global_id = $2',
                    [parentMultiId, sharedGlobalId]
                );
                assert.equal(gCheck3.rows[0].current_link_active, false, 'Le lien global est maintenant désactivé');
            } finally {
                await ensureCleanTransactions();
            }
        });

        // =====================================================================
        // SCÉNARIO 7 : Gestion des verrous transactionnels concurrents
        // Résolution séquentielle et idempotente sans deadlock (40P01)
        // =====================================================================
        await t.test('7. Conflits de verrous : Résolution séquentielle propre sans deadlock', async () => {
            const studentLock = `STU_LK_${crypto.randomUUID().slice(0, 8)}`;
            const parentLockId = crypto.randomUUID();

            try {
                await client1.query(
                    `INSERT INTO public.profiles_${slugA} (id, nom, telephone, phone_normalized, role) VALUES
                     ($1, 'Parent Lock', '0197000108', '+2290197000108', 'parent')`,
                    [parentLockId]
                );
                await client1.query(
                    `INSERT INTO public.students_${slugA} (id, nom, prenom, classe, telephone_parent_normalized) VALUES
                     ($1, 'Élève Verrou', 'Test', '6e', '+2290197000108')`,
                    [studentLock]
                );

                // Client 1 et Client 2 tentent deux rattachements concurrents sur le même élève
                // Sans BEGIN préalable : les RPC gèrent leurs verrous advisory internes
                const [res1, res2] = await Promise.all([
                    client1.query(
                        `SELECT public.link_parent_student_direct_atomic($1, $2::uuid, $3, $4::uuid, 'parent_manual', NULL) AS res`,
                        [slugA, parentLockId, studentLock, parentLockId]
                    ),
                    client2.query(
                        `SELECT public.link_parent_student_direct_atomic($1, $2::uuid, $3, $4::uuid, 'parent_manual', NULL) AS res`,
                        [slugA, parentLockId, studentLock, parentLockId]
                    )
                ]);

                const j1 = res1.rows[0].res;
                const j2 = res2.rows[0].res;

                // L'un réussit l'insertion initiale, l'autre est idempotent (already_linked ou success)
                assert.ok(j1.success, 'La première opération concurrente doit réussir');
                assert.ok(j2.success, 'La seconde opération concurrente doit réussir de manière idempotente');
            } finally {
                await ensureCleanTransactions();
            }
        });

        // =====================================================================
        // SCÉNARIO 8 : Rôles et Autorisations (Sécurité stricte)
        // =====================================================================
        await t.test('8. Rôles et confinement : Le comptable et les directeurs tiers sont rejetés', async () => {
            const studentSec = `STU_SEC_${crypto.randomUUID().slice(0, 8)}`;
            const parentSecId = crypto.randomUUID();

            try {
                await client1.query(
                    `INSERT INTO public.profiles_${slugA} (id, nom, telephone, phone_normalized, role) VALUES
                     ($1, 'Parent Sec', '0197000109', '+2290197000109', 'parent')`,
                    [parentSecId]
                );
                await client1.query(
                    `INSERT INTO public.students_${slugA} (id, nom, prenom, classe, telephone_parent_normalized) VALUES
                     ($1, 'Élève Sec', 'Test', '6e', '+2290197000109')`,
                    [studentSec]
                );

                const compDel = await client1.query(
                    'SELECT public.delete_student_local_atomically($1, $2, $3::uuid) AS res',
                    [slugA, studentSec, comptableAId]
                );
                assert.equal(compDel.rows[0].res.success, false);
                assert.equal(compDel.rows[0].res.error, 'UNAUTHORIZED_ACTOR');

                const crossDel = await client1.query(
                    'SELECT public.delete_student_local_atomically($1, $2, $3::uuid) AS res',
                    [slugA, studentSec, directorBId]
                );
                assert.equal(crossDel.rows[0].res.success, false);
                assert.equal(crossDel.rows[0].res.error, 'ACTOR_NOT_IN_SCHOOL');

                const compLink = await client1.query(
                    `SELECT public.link_parent_student_direct_atomic($1, $2::uuid, $3, $4::uuid, 'admin', NULL) AS res`,
                    [slugA, parentSecId, studentSec, comptableAId]
                );
                assert.equal(compLink.rows[0].res.success, false);
                assert.equal(compLink.rows[0].res.error, 'UNAUTHORIZED_ACTOR');
            } finally {
                await ensureCleanTransactions();
            }
        });

        // =====================================================================
        // SCÉNARIO 9 : Rollback transactionnel complet après erreur provoquée
        // =====================================================================
        await t.test('9. Rollback transactionnel : aucune écriture résiduelle après exception provoquée', async () => {
            const studentRollback = `STU_ROLL_${crypto.randomUUID().slice(0, 8)}`;
            const parentRollId = crypto.randomUUID();

            try {
                await client1.query(
                    `INSERT INTO public.profiles_${slugA} (id, nom, telephone, phone_normalized, role) VALUES
                     ($1, 'Parent Roll', '0197000110', '+2290197000110', 'parent')`,
                    [parentRollId]
                );
                await client1.query(
                    `INSERT INTO public.students_${slugA} (id, nom, prenom, classe, telephone_parent_normalized) VALUES
                     ($1, 'Élève Rollback', 'Test', '6e', '+2290197000110')`,
                    [studentRollback]
                );

                // Début de transaction explicite
                await beginTx(client1, 'client1');

                // Étape 1 : Rattachement direct dans la transaction (doit réussir)
                const rpcRes = await client1.query(
                    `SELECT public.link_parent_student_direct_atomic($1, $2::uuid, $3, $4::uuid, 'parent_manual', NULL) AS res`,
                    [slugA, parentRollId, studentRollback, parentRollId]
                );
                assert.equal(rpcRes.rows[0].res.success, true, 'Le rattachement direct préalable doit impérativement réussir dans la transaction');

                // Étape 2 : Erreur provoquée (violation de contrainte clé primaire)
                try {
                    await client1.query(
                        `INSERT INTO public.students_${slugA} (id, nom, prenom, classe) VALUES ($1, 'Doublon', 'Erreur', '6e')`,
                        [studentRollback]
                    );
                    
                    await commitTx(client1, 'client1');
                    assert.fail('La transaction aurait dû lever une erreur 23505 unique_violation');
                } catch (err) {
                    if (err.code === 'ERR_ASSERTION') throw err;
                    // Erreur attendue : rollback automatique
                    await rollbackTx(client1, 'client1');
                    assert.ok(
                        err.message.includes('unique') || err.code === '23505',
                        `Violation d unicité attendue (obtenu: ${err.message})`
                    );
                }

                // Vérification post-rollback : le lien local créé à l'étape 1 a été entièrement annulé
                const linkCheck = await client1.query(
                    `SELECT count(*) FROM public.parent_student_${slugA} WHERE student_id = $1`,
                    [studentRollback]
                );
                assert.equal(parseInt(linkCheck.rows[0].count), 0, 'Zéro écriture résiduelle dans parent_student_ après rollback');
            } finally {
                await ensureCleanTransactions();
            }
        });

        // =====================================================================
        // SCÉNARIO 10 : Privilèges PostgreSQL stricts (Rôles anon et authenticated)
        // =====================================================================
        await t.test('10. Sécurité et privilèges : rôles non privilégiés bloqués sur tables et fonctions sensibles', async () => {
            // Test 10.1 : anon ne peut pas lire parent_student_link_requests
            await client1.query('SET ROLE anon');
            try {
                await client1.query('SELECT * FROM public.parent_student_link_requests LIMIT 1');
                assert.fail('Le rôle anon ne doit pas avoir accès en lecture à parent_student_link_requests');
            } catch (err) {
                assert.ok(err.message.includes('permission denied'), 'Accès refusé attendu pour anon');
            } finally {
                await client1.query('RESET ROLE');
            }

            // Test 10.2 : authenticated ne peut pas exécuter create_school_tables
            await client1.query('SET ROLE authenticated');
            try {
                await client1.query(`SELECT public.create_school_tables('hacked_slug')`);
                assert.fail('Le rôle authenticated ne doit pas pouvoir exécuter create_school_tables');
            } catch (err) {
                assert.ok(err.message.includes('permission denied'), 'Exécution refusée attendue pour authenticated');
            } finally {
                await client1.query('RESET ROLE');
            }
        });

    } finally {
        if (client1) {
            try {
                await rollbackTx(client1, 'client1');
                await client1.query(`
                    DROP TABLE IF EXISTS public.parent_student_${slugA} CASCADE;
                    DROP TABLE IF EXISTS public.notes_${slugA} CASCADE;
                    DROP TABLE IF EXISTS public.payments_${slugA} CASCADE;
                    DROP TABLE IF EXISTS public.presences_${slugA} CASCADE;
                    DROP TABLE IF EXISTS public.devoirs_${slugA} CASCADE;
                    DROP TABLE IF EXISTS public.students_${slugA} CASCADE;
                    DROP TABLE IF EXISTS public.profiles_${slugA} CASCADE;

                    DROP TABLE IF EXISTS public.parent_student_${slugB} CASCADE;
                    DROP TABLE IF EXISTS public.notes_${slugB} CASCADE;
                    DROP TABLE IF EXISTS public.payments_${slugB} CASCADE;
                    DROP TABLE IF EXISTS public.presences_${slugB} CASCADE;
                    DROP TABLE IF EXISTS public.devoirs_${slugB} CASCADE;
                    DROP TABLE IF EXISTS public.students_${slugB} CASCADE;
                    DROP TABLE IF EXISTS public.profiles_${slugB} CASCADE;

                    DO $$
                    BEGIN
                        IF to_regclass('public.parent_student_link_requests') IS NOT NULL THEN
                            DELETE FROM public.parent_student_link_requests WHERE school_slug IN ($1, $2);
                        END IF;
                        IF to_regclass('public.student_global_mappings') IS NOT NULL THEN
                            DELETE FROM public.student_global_mappings WHERE school_slug IN ($1, $2);
                        END IF;
                        IF to_regclass('public.schools') IS NOT NULL THEN
                            DELETE FROM public.schools WHERE slug IN ($1, $2);
                        END IF;
                    END $$;
                `, [slugA, slugB]).catch(() => {});
            } catch (cleanupErr) {
                console.error('Erreur nettoyage fixtures:', cleanupErr.message);
            }
            client1.release();
        }
        if (client2) {
            try {
                await rollbackTx(client2, 'client2');
            } catch {}
            client2.release();
        }
        await pool.end().catch(() => {});
    }
});
