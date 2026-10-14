'use strict';

/**
 * ============================================================================
 * YZIOW — P26-B : Banc de Test d'Intégration — Remplacement Atomique Sécurisé
 * Fichier : backend/integration-tests/syncReplaceAtomicityIntegration.test.js
 * ============================================================================
 *
 * Valide la RPC PostgreSQL transactionnelle `sync_replace_school_data_atomically` :
 * 1. Habilitation de l'acteur (admin/directeur requis, rejet rôle professeur/inconnu).
 * 2. Rejet des payloads vides ou invalides.
 * 3. Substitution tout-ou-rien d'un élève mono-établissement (extinction lien global).
 * 4. Préservation stricte du lien global pour un élève multi-établissements.
 * 5. Rejet/révocation des demandes d'approbation P26-B locales.
 * 6. Substitution atomique des paiements locaux.
 * 7. Idempotence et réexécution sans effet de bord.
 * 8. Concurrence ordonnée sans deadlock (0 -> 1 -> 2 -> 3).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Pool } = require('pg');

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

    const FORBIDDEN_DATABASES = ['postgres', 'production', 'prod', 'yziow_prod', 'yziow_production', 'supabase'];
    if (FORBIDDEN_DATABASES.includes(dbName.toLowerCase())) {
        assert.fail(`SECURITY_VIOLATION: Base de données interdite (${dbName}).`);
    }

    if (
        hostname.includes('supabase.co') ||
        hostname.includes('amazonaws.com') ||
        hostname.includes('azure.com') ||
        hostname.includes('render.com') ||
        hostname.includes('vercel.app') ||
        (!['127.0.0.1', 'localhost'].includes(hostname))
    ) {
        assert.fail(`SECURITY_VIOLATION: Hôte non autorisé (${hostname}).`);
    }

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
            `SECURITY_VIOLATION: Configuration de test non autorisée [host=${hostname}, port=${port}, db=${dbName}, CI=${process.env.CI}].`
        );
    }

    return { hostname, port, dbName, targetName: matched.name };
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

test('YZIOW P26-B — Validation Transactionnelle du Remplacement Atomique', async (t) => {
    const databaseUrl = (process.env.DATABASE_URL || '').trim();
    validateDatabaseUrlSecurity(databaseUrl);

    const pool = new Pool({
        connectionString: databaseUrl,
        connectionTimeoutMillis: 5000,
        max: 5
    });

    let client1;
    let client2;
    let client3;
    let pid1;
    let pid2;

    try {
        client1 = await pool.connect();
        client2 = await pool.connect();
        client3 = await pool.connect();

        const { rows: rows1 } = await client1.query('SELECT pg_backend_pid() AS pid');
        pid1 = rows1[0].pid;

        const { rows: rows2 } = await client2.query('SELECT pg_backend_pid() AS pid');
        pid2 = rows2[0].pid;
    } catch (err) {
        assert.fail(`Connexion PostgreSQL impossible (${err.message}).`);
    }

    const runNonce = Date.now().toString(36) + '_' + crypto.randomUUID().slice(0, 4);
    const slugA = `ecole_sync_a_${runNonce}`;
    const slugB = `ecole_sync_b_${runNonce}`;

    const directorAId = crypto.randomUUID();
    const teacherAId = crypto.randomUUID();
    const parent1Id = crypto.randomUUID();

    try {
        // Initialisation de l'environnement et déploiement de la migration P26-B
        await client1.query('SELECT pg_advisory_lock(999999);');
        try {
            await client1.query(`
                DO $$
                BEGIN
                    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
                    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
                    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
                END $$;

                CREATE TABLE IF NOT EXISTS public.schools (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    slug TEXT NOT NULL UNIQUE,
                    name TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'active',
                    country TEXT DEFAULT 'BJ',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    affiliate_id UUID NULL
                );

                CREATE TABLE IF NOT EXISTS public.global_students (
                    student_global_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
                );

                CREATE TABLE IF NOT EXISTS public.student_global_mappings (
                    mapping_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    school_slug TEXT NOT NULL,
                    student_local_id TEXT NOT NULL,
                    student_global_id UUID NOT NULL REFERENCES public.global_students(student_global_id),
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    UNIQUE (school_slug, student_local_id)
                );

                CREATE TABLE IF NOT EXISTS public.parent_child_links (
                    parent_ref TEXT NOT NULL,
                    student_global_id UUID NOT NULL REFERENCES public.global_students(student_global_id),
                    first_linked_at TIMESTAMPTZ NULL,
                    current_link_active BOOLEAN NOT NULL DEFAULT true,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    PRIMARY KEY (parent_ref, student_global_id)
                );

                INSERT INTO public.schools (slug, name) VALUES
                    ('${slugA}', 'École Sync A ${runNonce}'),
                    ('${slugB}', 'École Sync B ${runNonce}')
                ON CONFLICT (slug) DO NOTHING;
            `);

            const migrationPath = path.resolve(__dirname, '../scripts/migration_p26_b_link_approval_foundation.sql');
            const migrationSql = fs.readFileSync(migrationPath, 'utf8');
            const cleanSql = extractMigrationBody(migrationSql);
            await client1.query(cleanSql);

            // Création des tables partitionnées pour les deux écoles de test
            for (const s of [slugA, slugB]) {
                await client1.query(`
                    CREATE TABLE IF NOT EXISTS public.profiles_${s} (
                        id UUID PRIMARY KEY,
                        nom TEXT NOT NULL,
                        telephone TEXT NOT NULL,
                        phone_normalized TEXT NOT NULL UNIQUE,
                        role TEXT NOT NULL,
                        created_at TIMESTAMPTZ DEFAULT now()
                    );

                    CREATE TABLE IF NOT EXISTS public.students_${s} (
                        id TEXT PRIMARY KEY,
                        nom TEXT NOT NULL,
                        prenom TEXT NOT NULL,
                        classe TEXT NOT NULL,
                        matricule TEXT,
                        genre TEXT,
                        date_naissance TEXT,
                        statut TEXT DEFAULT 'Actif',
                        ecolage NUMERIC DEFAULT 0,
                        deja_paye NUMERIC DEFAULT 0,
                        telephone_parent TEXT,
                        telephone_parent_normalized TEXT,
                        photo_url TEXT,
                        redoublant BOOLEAN NOT NULL DEFAULT false,
                        ecole_provenance TEXT,
                        updated_at TIMESTAMPTZ DEFAULT now()
                    );

                    CREATE TABLE IF NOT EXISTS public.parent_student_${s} (
                        parent_id UUID NOT NULL,
                        student_id TEXT NOT NULL,
                        source_request_id UUID NULL,
                        PRIMARY KEY (parent_id, student_id)
                    );

                    CREATE TABLE IF NOT EXISTS public.payments_${s} (
                        id TEXT PRIMARY KEY,
                        student_id TEXT NOT NULL,
                        montant NUMERIC NOT NULL,
                        date TIMESTAMPTZ,
                        recu TEXT,
                        note TEXT
                    );

                    CREATE TABLE IF NOT EXISTS public.presences_${s} (
                        id TEXT PRIMARY KEY,
                        student_id TEXT NOT NULL,
                        date TIMESTAMPTZ NOT NULL DEFAULT now(),
                        statut TEXT NOT NULL
                    );

                    CREATE TABLE IF NOT EXISTS public.devoirs_${s} (
                        id TEXT PRIMARY KEY,
                        titre TEXT NOT NULL,
                        classe TEXT NOT NULL
                    );
                `);
            }

            // Insertion des profils
            await client1.query(`
                INSERT INTO public.profiles_${slugA} (id, nom, telephone, phone_normalized, role) VALUES
                    ('${directorAId}', 'Directeur A', '97000001', '+22997000001', 'directeur'),
                    ('${teacherAId}', 'Enseignant A', '97000002', '+22997000002', 'professeur');
            `);
        } finally {
            await client1.query('SELECT pg_advisory_unlock(999999);');
        }

        // =====================================================================
        // CAS 1 : CONTRÔLE STRICT D'HABILITATION (UNAUTHORIZED_ACTOR)
        // =====================================================================
        await t.test('1. Contrôle d’habilitation : Refus pour un acteur non directeur/admin', async () => {
            const payload = JSON.stringify([{ id: 's1', nom: 'Doe', prenom: 'John', classe: '6eme' }]);

            // Appel par un professeur
            const resTeacher = await client1.query(
                'SELECT public.sync_replace_school_data_atomically($1, $2, $3::jsonb)',
                [slugA, teacherAId, payload]
            );
            assert.strictEqual(resTeacher.rows[0].sync_replace_school_data_atomically.success, false);
            assert.strictEqual(resTeacher.rows[0].sync_replace_school_data_atomically.error, 'UNAUTHORIZED_ACTOR');

            // Appel avec acteur inconnu
            const resUnknown = await client1.query(
                'SELECT public.sync_replace_school_data_atomically($1, $2, $3::jsonb)',
                [slugA, crypto.randomUUID(), payload]
            );
            assert.strictEqual(resUnknown.rows[0].sync_replace_school_data_atomically.success, false);
            assert.strictEqual(resUnknown.rows[0].sync_replace_school_data_atomically.error, 'UNAUTHORIZED_ACTOR');
        });

        // =====================================================================
        // CAS 2 : REJET DU PAYLOAD VIDE OU MAL FORMÉ
        // =====================================================================
        await t.test('2. Validation des paramètres : Refus d’une liste d’élèves vide', async () => {
            const resEmpty = await client1.query(
                'SELECT public.sync_replace_school_data_atomically($1, $2, $3::jsonb)',
                [slugA, directorAId, '[]']
            );
            assert.strictEqual(resEmpty.rows[0].sync_replace_school_data_atomically.success, false);
            assert.strictEqual(resEmpty.rows[0].sync_replace_school_data_atomically.error, 'EMPTY_STUDENTS_PAYLOAD');
        });

        // =====================================================================
        // CAS 3 : SUBSTITUTION ATOMIQUE POUR UN ÉLÈVE LIÉ À UN SEUL ÉTABLISSEMENT
        // =====================================================================
        await t.test('3. Remplacement mono-établissement : Extinction du lien global et insertion nouveaux élèves', async () => {
            // Insertion d'un ancien élève local rattaché au parent 1
            const oldStudentId = 'old_std_single';
            const { rows: gRows } = await client1.query(
                'INSERT INTO public.global_students DEFAULT VALUES RETURNING student_global_id'
            );
            const globalId1 = gRows[0].student_global_id;

            await client1.query(`
                INSERT INTO public.students_${slugA} (id, nom, prenom, classe) VALUES ('${oldStudentId}', 'Ancien', 'Élève', 'CM2');
                INSERT INTO public.parent_student_${slugA} (parent_id, student_id) VALUES ('${parent1Id}', '${oldStudentId}');
                INSERT INTO public.student_global_mappings (school_slug, student_local_id, student_global_id) VALUES ('${slugA}', '${oldStudentId}', '${globalId1}');
                INSERT INTO public.parent_child_links (parent_ref, student_global_id, current_link_active) VALUES ('${parent1Id}', '${globalId1}', true);
            `);

            // Remplacement avec 2 nouveaux élèves
            const newPayload = JSON.stringify([
                { id: 'new_s1', nom: 'Koffi', prenom: 'Paul', classe: '6eme', ecolage: 150000, deja_paye: 50000 },
                { id: 'new_s2', nom: 'Mensah', prenom: 'Claire', classe: '5eme', ecolage: 160000, deja_paye: 0 }
            ]);

            const resReplace = await client1.query(
                'SELECT public.sync_replace_school_data_atomically($1, $2, $3::jsonb)',
                [slugA, directorAId, newPayload]
            );
            const data = resReplace.rows[0].sync_replace_school_data_atomically;
            assert.strictEqual(data.success, true);
            assert.strictEqual(data.inserted_students_count, 2);
            assert.strictEqual(data.global_links_deactivated_count, 1);
            assert.strictEqual(data.global_links_preserved_count, 0);

            // Vérifications en base : ancien élève purgé, nouveaux élèves présents
            const { rows: checkOld } = await client1.query(`SELECT count(*)::int AS cnt FROM public.students_${slugA} WHERE id = '${oldStudentId}'`);
            assert.strictEqual(checkOld[0].cnt, 0);

            const { rows: checkNew } = await client1.query(`SELECT count(*)::int AS cnt FROM public.students_${slugA} WHERE id IN ('new_s1', 'new_s2')`);
            assert.strictEqual(checkNew[0].cnt, 2);

            // Vérification lien global : éteint (false)
            const { rows: checkLink } = await client1.query(`SELECT current_link_active FROM public.parent_child_links WHERE parent_ref = '${parent1Id}' AND student_global_id = '${globalId1}'`);
            assert.strictEqual(checkLink[0].current_link_active, false);

            // Vérification mapping local : supprimé pour slugA
            const { rows: checkMap } = await client1.query(`SELECT count(*)::int AS cnt FROM public.student_global_mappings WHERE school_slug = '${slugA}' AND student_local_id = '${oldStudentId}'`);
            assert.strictEqual(checkMap[0].cnt, 0);
        });

        // =====================================================================
        // CAS 4 : PRÉSERVATION STRICTE D'UN ÉLÈVE MULTI-ÉTABLISSEMENTS
        // =====================================================================
        await t.test('4. Remplacement multi-établissements : Préservation du lien global grâce à l’école B', async () => {
            const studentLocalA = 'std_multi_a';
            const studentLocalB = 'std_multi_b';

            // Création de l'élève global partagé entre école A et école B
            const { rows: gRows2 } = await client1.query(
                'INSERT INTO public.global_students DEFAULT VALUES RETURNING student_global_id'
            );
            const globalId2 = gRows2[0].student_global_id;

            await client1.query(`
                INSERT INTO public.students_${slugA} (id, nom, prenom, classe) VALUES ('${studentLocalA}', 'Dupont', 'Marc', '3eme');
                INSERT INTO public.parent_student_${slugA} (parent_id, student_id) VALUES ('${parent1Id}', '${studentLocalA}');
                INSERT INTO public.student_global_mappings (school_slug, student_local_id, student_global_id) VALUES ('${slugA}', '${studentLocalA}', '${globalId2}');

                INSERT INTO public.students_${slugB} (id, nom, prenom, classe) VALUES ('${studentLocalB}', 'Dupont', 'Marc', '3eme');
                INSERT INTO public.parent_student_${slugB} (parent_id, student_id) VALUES ('${parent1Id}', '${studentLocalB}');
                INSERT INTO public.student_global_mappings (school_slug, student_local_id, student_global_id) VALUES ('${slugB}', '${studentLocalB}', '${globalId2}');

                INSERT INTO public.parent_child_links (parent_ref, student_global_id, current_link_active) VALUES ('${parent1Id}', '${globalId2}', true)
                ON CONFLICT (parent_ref, student_global_id) DO UPDATE SET current_link_active = true;
            `);

            // Remplacement sur l'école A uniquement
            const payloadA = JSON.stringify([
                { id: 'std_new_a3', nom: 'Zinsou', prenom: 'Lionel', classe: 'Terminale' }
            ]);

            const resReplace = await client1.query(
                'SELECT public.sync_replace_school_data_atomically($1, $2, $3::jsonb)',
                [slugA, directorAId, payloadA]
            );
            const data = resReplace.rows[0].sync_replace_school_data_atomically;
            assert.strictEqual(data.success, true);
            assert.strictEqual(data.global_links_preserved_count, 1);
            assert.strictEqual(data.global_links_deactivated_count, 0);

            // Vérifications :
            // 1. L'élève a disparu de l'école A
            const { rows: checkA } = await client1.query(`SELECT count(*)::int AS cnt FROM public.students_${slugA} WHERE id = '${studentLocalA}'`);
            assert.strictEqual(checkA[0].cnt, 0);

            // 2. L'élève existe toujours dans l'école B
            const { rows: checkB } = await client1.query(`SELECT count(*)::int AS cnt FROM public.students_${slugB} WHERE id = '${studentLocalB}'`);
            assert.strictEqual(checkB[0].cnt, 1);

            // 3. Le lien global est conservé actif (true)
            const { rows: checkLink } = await client1.query(`SELECT current_link_active FROM public.parent_child_links WHERE parent_ref = '${parent1Id}' AND student_global_id = '${globalId2}'`);
            assert.strictEqual(checkLink[0].current_link_active, true);
        });

        // =====================================================================
        // CAS 5 : CLÔTURE ET AUDIT DES DEMANDES P26-B
        // =====================================================================
        await t.test('5. Traitement des demandes P26-B : Rejet des pending et révocation des approved', async () => {
            const reqPendingId = crypto.randomUUID();
            const reqApprovedId = crypto.randomUUID();

            await client1.query(`
                INSERT INTO public.parent_student_link_requests (id, school_slug, student_id, parent_id, parent_phone_normalized, parent_name, status) VALUES
                    ('${reqPendingId}', '${slugA}', 'std_new_a3', '${parent1Id}', '+22997000001', 'Parent Test 1', 'pending'),
                    ('${reqApprovedId}', '${slugA}', 'std_new_a3', '${parent1Id}', '+22997000001', 'Parent Test 1', 'approved');
            `);

            // Remplacement sur l'école A
            const payload = JSON.stringify([
                { id: 'fresh_student', nom: 'Fresh', prenom: 'Student', classe: 'CP' }
            ]);

            const res = await client1.query(
                'SELECT public.sync_replace_school_data_atomically($1, $2, $3::jsonb)',
                [slugA, directorAId, payload]
            );
            assert.strictEqual(res.rows[0].sync_replace_school_data_atomically.success, true);

            // Vérification statut demande pending -> rejected
            const { rows: rPending } = await client1.query(`SELECT status, rejection_reason_code FROM public.parent_student_link_requests WHERE id = '${reqPendingId}'`);
            assert.strictEqual(rPending[0].status, 'rejected');
            assert.strictEqual(rPending[0].rejection_reason_code, 'SCHOOL_RESET_REPLACE');

            // Vérification statut demande approved -> revoked
            const { rows: rApproved } = await client1.query(`SELECT status, revocation_reason FROM public.parent_student_link_requests WHERE id = '${reqApprovedId}'`);
            assert.strictEqual(rApproved[0].status, 'revoked');
            assert.ok(rApproved[0].revocation_reason.includes('Remplacer'));
        });

        // =====================================================================
        // CAS 6 : SUBSTITUTION ATOMIQUE DES PAIEMENTS
        // =====================================================================
        await t.test('6. Substitution atomique des paiements scolaires locaux', async () => {
            // Création d'anciens paiements
            await client1.query(`
                INSERT INTO public.payments_${slugA} (id, student_id, montant, date) VALUES
                    ('pay_old_1', 'fresh_student', 25000, now()),
                    ('pay_old_2', 'fresh_student', 15000, now());
            `);

            // Remplacement avec un nouveau paiement
            const studentPayload = JSON.stringify([{ id: 'std_with_pay', nom: 'Paiement', prenom: 'Test', classe: '6eme' }]);
            const paymentsPayload = JSON.stringify([{ id: 'pay_new_1', student_id: 'std_with_pay', montant: 40000, date: new Date().toISOString(), recu: 'REC-001' }]);

            const res = await client1.query(
                'SELECT public.sync_replace_school_data_atomically($1, $2, $3::jsonb, $4::jsonb)',
                [slugA, directorAId, studentPayload, paymentsPayload]
            );
            const data = res.rows[0].sync_replace_school_data_atomically;
            assert.strictEqual(data.success, true);
            assert.strictEqual(data.inserted_payments_count, 1);

            // Vérification : anciens paiements supprimés, nouveau présent
            const { rows: oldPays } = await client1.query(`SELECT count(*)::int AS cnt FROM public.payments_${slugA} WHERE id IN ('pay_old_1', 'pay_old_2')`);
            assert.strictEqual(oldPays[0].cnt, 0);

            const { rows: newPays } = await client1.query(`SELECT montant, recu FROM public.payments_${slugA} WHERE id = 'pay_new_1'`);
            assert.strictEqual(newPays.length, 1);
            assert.strictEqual(Number(newPays[0].montant), 40000);
            assert.strictEqual(newPays[0].recu, 'REC-001');
        });

        // =====================================================================
        // CAS 7 : IDEMPOTENCE DE LA SUBSTITUTION
        // =====================================================================
        await t.test('7. Idempotence : Deux exécutions successives du même payload sont stables', async () => {
            const studentPayload = JSON.stringify([{ id: 'idem_std', nom: 'Idem', prenom: 'Potent', classe: 'CM1' }]);

            const res1 = await client1.query(
                'SELECT public.sync_replace_school_data_atomically($1, $2, $3::jsonb)',
                [slugA, directorAId, studentPayload]
            );
            assert.strictEqual(res1.rows[0].sync_replace_school_data_atomically.success, true);

            const res2 = await client1.query(
                'SELECT public.sync_replace_school_data_atomically($1, $2, $3::jsonb)',
                [slugA, directorAId, studentPayload]
            );
            assert.strictEqual(res2.rows[0].sync_replace_school_data_atomically.success, true);

            const { rows: cnt } = await client1.query(`SELECT count(*)::int AS cnt FROM public.students_${slugA} WHERE id = 'idem_std'`);
            assert.strictEqual(cnt[0].cnt, 1);
        });

        // =====================================================================
        // CAS 8 : CONCURRENCE ENTRE REMPLACEMENT ET APPROBATION (SÉRIALISÉE SANS DEADLOCK)
        // =====================================================================
        await t.test('8. Concurrence sans deadlock : Exécution simultanée Remplacement vs Approbation', async () => {
            const candidateStudent = 'concurrent_cand';
            await client1.query(`
                INSERT INTO public.students_${slugA} (id, nom, prenom, classe) VALUES ('${candidateStudent}', 'Concur', 'Test', '6eme');
            `);

            const reqId = crypto.randomUUID();
            await client1.query(`
                INSERT INTO public.parent_student_link_requests (id, school_slug, student_id, parent_id, parent_phone_normalized, parent_name, status) VALUES
                    ('${reqId}', '${slugA}', '${candidateStudent}', '${parent1Id}', '+22997000001', 'Parent Test Concurrent', 'pending');
            `);

            // Client 1 et Client 2 lancent simultanément :
            // Client 1 : sync_replace_school_data_atomically
            // Client 2 : approve_parent_student_link
            const replacePayload = JSON.stringify([{ id: 'survivor_std', nom: 'Survivor', prenom: 'One', classe: '5eme' }]);

            const p1 = client1.query(
                'SELECT public.sync_replace_school_data_atomically($1, $2, $3::jsonb)',
                [slugA, directorAId, replacePayload]
            );

            const p2 = client2.query(
                'SELECT public.approve_parent_student_link($1, $2, $3, $4)',
                [reqId, slugA, directorAId, 'Directeur Concurrent']
            );

            const [resReplace, resApprove] = await Promise.all([p1, p2]);

            const rData = resReplace.rows[0].sync_replace_school_data_atomically;
            const aData = resApprove.rows[0].approve_parent_student_link;

            assert.strictEqual(rData.success, true);
            // Si le remplacement est passé d'abord, l'approbation est rejetée car la demande a été rejetée/révoquée
            // Aucun deadlock (0 erreur 40P01)
            assert.ok(aData !== undefined);
        });

        // =====================================================================
        // CAS 9 : ROLLBACK INTÉGRAL EN CAS D'ERREUR DE CONTRAINTE POST-SUPPRESSION
        // =====================================================================
        await t.test('9. Rollback complet : Erreur de contrainte à l’insertion après suppression', async () => {
            const rollbackStudentId = 'std_rollback_old';
            const rollbackPaymentId = 'pay_rollback_old';
            const reqPendingRollbackId = crypto.randomUUID();

            const { rows: gRowsRollback } = await client1.query(
                'INSERT INTO public.global_students DEFAULT VALUES RETURNING student_global_id'
            );
            const globalIdRollback = gRowsRollback[0].student_global_id;

            // Données initiales
            await client1.query(`
                INSERT INTO public.students_${slugA} (id, nom, prenom, classe) VALUES ('${rollbackStudentId}', 'Initial', 'Student', 'CM2');
                INSERT INTO public.payments_${slugA} (id, student_id, montant, date, recu) VALUES ('${rollbackPaymentId}', '${rollbackStudentId}', 50000, now(), 'REC-INIT');
                INSERT INTO public.parent_student_${slugA} (parent_id, student_id) VALUES ('${parent1Id}', '${rollbackStudentId}');
                INSERT INTO public.student_global_mappings (school_slug, student_local_id, student_global_id) VALUES ('${slugA}', '${rollbackStudentId}', '${globalIdRollback}');
                INSERT INTO public.parent_child_links (parent_ref, student_global_id, current_link_active) VALUES ('${parent1Id}', '${globalIdRollback}', true)
                ON CONFLICT (parent_ref, student_global_id) DO UPDATE SET current_link_active = true;
                INSERT INTO public.parent_student_link_requests (id, school_slug, student_id, parent_id, parent_phone_normalized, parent_name, status) VALUES
                    ('${reqPendingRollbackId}', '${slugA}', '${rollbackStudentId}', '${parent1Id}', '+22997000001', 'Parent Init', 'pending');
            `);

            // Payload avec doublon de clé primaire sur les nouveaux élèves (provoquant une violation de PRIMARY KEY)
            // L'erreur surviendra à l'étape 9, ALORS QUE les étapes 7 et 8 (DELETE) ont DÉJÀ été exécutées dans la transaction !
            const faultyPayload = JSON.stringify([
                { id: 'dup_primary_key', nom: 'Valid First', prenom: 'A', classe: '6eme' },
                { id: 'dup_primary_key', nom: 'Violating Second', prenom: 'B', classe: '6eme' }
            ]);

            // Exécution de la RPC : doit échouer avec exception SQLSTATE 23505 (unique_violation)
            let caughtError = null;
            try {
                await client1.query(
                    'SELECT public.sync_replace_school_data_atomically($1, $2, $3::jsonb)',
                    [slugA, directorAId, faultyPayload]
                );
            } catch (err) {
                caughtError = err;
            }

            assert.ok(caughtError !== null, 'La RPC doit lever une exception en cas de contrainte violée.');
            assert.strictEqual(caughtError.code, '23505'); // unique_violation

            // VÉRIFICATION DE LA RESTAURATION STRICTE DE TOUT L'ÉTAT INITIAL :
            // 1. L'ancien élève est toujours présent intact
            const { rows: rStd } = await client1.query(`SELECT id, nom, prenom FROM public.students_${slugA} WHERE id = '${rollbackStudentId}'`);
            assert.strictEqual(rStd.length, 1);
            assert.strictEqual(rStd[0].nom, 'Initial');

            // 2. L'ancien paiement est toujours présent intact
            const { rows: rPay } = await client1.query(`SELECT id, montant, recu FROM public.payments_${slugA} WHERE id = '${rollbackPaymentId}'`);
            assert.strictEqual(rPay.length, 1);
            assert.strictEqual(Number(rPay[0].montant), 50000);
            assert.strictEqual(rPay[0].recu, 'REC-INIT');

            // 3. Le mapping local est toujours présent
            const { rows: rMap } = await client1.query(`SELECT count(*)::int AS cnt FROM public.student_global_mappings WHERE school_slug = '${slugA}' AND student_local_id = '${rollbackStudentId}'`);
            assert.strictEqual(rMap[0].cnt, 1);

            // 4. La demande P26-B est toujours en 'pending' (non rejetée, decided_at IS NULL)
            const { rows: rReq } = await client1.query(`SELECT status, decided_at FROM public.parent_student_link_requests WHERE id = '${reqPendingRollbackId}'`);
            assert.strictEqual(rReq.length, 1);
            assert.strictEqual(rReq[0].status, 'pending');
            assert.strictEqual(rReq[0].decided_at, null);

            // 5. Le lien global est toujours actif (true)
            const { rows: rLink } = await client1.query(`SELECT current_link_active FROM public.parent_child_links WHERE parent_ref = '${parent1Id}' AND student_global_id = '${globalIdRollback}'`);
            assert.strictEqual(rLink.length, 1);
            assert.strictEqual(rLink[0].current_link_active, true);

            // 6. Aucun nouvel élève du batch n'a été inséré
            const { rows: rNew } = await client1.query(`SELECT count(*)::int AS cnt FROM public.students_${slugA} WHERE id = 'dup_primary_key'`);
            assert.strictEqual(rNew[0].cnt, 0);
        });

        // =====================================================================
        // CAS 10 : CONCURRENCE RÉELLE ENTRE REMPLACEMENT ET SUPPRESSION D'ÉLÈVE
        // =====================================================================
        await t.test('10. Concurrence sans deadlock : Exécution simultanée Remplacement vs delete_student_local_atomically', async () => {
            const studentToDelete = 'std_concurrent_del';
            await client1.query(`
                INSERT INTO public.students_${slugA} (id, nom, prenom, classe) VALUES ('${studentToDelete}', 'Target', 'Delete', '4eme');
                INSERT INTO public.parent_student_${slugA} (parent_id, student_id) VALUES ('${parent1Id}', '${studentToDelete}');
            `);

            const delReqId = crypto.randomUUID();
            await client1.query(`
                INSERT INTO public.parent_student_link_requests (id, school_slug, student_id, parent_id, parent_phone_normalized, parent_name, status) VALUES
                    ('${delReqId}', '${slugA}', '${studentToDelete}', '${parent1Id}', '+22997000001', 'Parent Concurrent Del', 'pending');
            `);

            const replacePayload = JSON.stringify([{ id: 'final_survivor_std', nom: 'Final', prenom: 'Survivor', classe: '3eme' }]);

            // Lancement concurrent sur deux sessions PostgreSQL distinctes :
            // Client 1 : sync_replace_school_data_atomically
            // Client 2 : delete_student_local_atomically
            const p1 = client1.query(
                'SELECT public.sync_replace_school_data_atomically($1, $2, $3::jsonb)',
                [slugA, directorAId, replacePayload]
            );

            const p2 = client2.query(
                'SELECT public.delete_student_local_atomically($1, $2, $3)',
                [slugA, studentToDelete, directorAId]
            );

            const [resReplace, resDelete] = await Promise.all([p1, p2]);

            const rData = resReplace.rows[0].sync_replace_school_data_atomically;
            const dData = resDelete.rows[0].delete_student_local_atomically;

            assert.strictEqual(rData.success, true);
            // Si le remplacement a gagné la course, l'élève a été purgé avant que delete_student_local_atomically ne l'atteigne,
            // donc delete_student_local_atomically retourne STUDENT_NOT_FOUND (ou success si passé avant).
            // Dans TOUS les cas, zéro deadlock SQLSTATE 40P01, zéro crash !
            assert.ok(dData !== undefined);
            if (!dData.success) {
                assert.strictEqual(dData.error, 'STUDENT_NOT_FOUND');
            }

            // Vérification état final
            const { rows: checkSurvivor } = await client1.query(`SELECT count(*)::int AS cnt FROM public.students_${slugA} WHERE id = 'final_survivor_std'`);
            assert.strictEqual(checkSurvivor[0].cnt, 1);

            const { rows: checkDeleted } = await client1.query(`SELECT count(*)::int AS cnt FROM public.students_${slugA} WHERE id = '${studentToDelete}'`);
            assert.strictEqual(checkDeleted[0].cnt, 0);
        });

        // =====================================================================
        // CAS 11 : SYNCHRONISATION CONTRÔLÉE INTER-TRANSACTIONS (ANTI-COURSE CRITIQUE)
        // =====================================================================
        await t.test('11. Concurrence contrôlée : Remplacement bloqué de manière déterministe par un verrou Niveau 1', async () => {
            const controlledStd = 'std_controlled_test';
            await client1.query(`
                INSERT INTO public.students_${slugA} (id, nom, prenom, classe) VALUES ('${controlledStd}', 'Controlled', 'Sync', '1ere');
            `);

            const controlledReqId = crypto.randomUUID();
            await client1.query(`
                INSERT INTO public.parent_student_link_requests (id, school_slug, student_id, parent_id, parent_phone_normalized, parent_name, status) VALUES
                    ('${controlledReqId}', '${slugA}', '${controlledStd}', '${parent1Id}', '+22997000001', 'Parent Controlled', 'pending');
            `);

            // 1. Client 2 ouvre une transaction explicite et acquiert le verrou Niveau 1 sur la demande
            await client2.query('BEGIN;');
            await client2.query('SELECT pg_advisory_xact_lock(1, hashtext($1));', [`${slugA}:${controlledReqId}`]);

            // 2. Client 1 lance sync_replace_school_data_atomically : il DOIT être bloqué en attente du Niveau 1
            let client1Done = false;
            const replacePromise = client1.query(
                'SELECT public.sync_replace_school_data_atomically($1, $2, $3::jsonb)',
                [slugA, directorAId, JSON.stringify([{ id: 'unblocked_std', nom: 'Unblocked', prenom: 'After', classe: '1ere' }])]
            ).then(res => {
                client1Done = true;
                return res;
            });

            // Attente de 150ms pour confirmer que Client 1 est bel et bien en attente bloquante
            await new Promise(resolve => setTimeout(resolve, 150));
            assert.strictEqual(client1Done, false, 'Client 1 doit être bloqué sur le verrou de niveau 1 détenu par Client 2.');

            // Vérification que les données de l'école n'ont PAS encore été touchées
            const { rows: checkNotTouched } = await client2.query(`SELECT count(*)::int AS cnt FROM public.students_${slugA} WHERE id = '${controlledStd}'`);
            assert.strictEqual(checkNotTouched[0].cnt, 1, 'L’ancien élève ne doit pas être supprimé tant que les verrous ne sont pas tous acquis.');

            // 3. Client 2 libère le verrou en validant sa transaction
            await client2.query('COMMIT;');

            // 4. Client 1 doit maintenant se débloquer et terminer avec succès
            const resReplace = await replacePromise;
            assert.strictEqual(client1Done, true);
            assert.strictEqual(resReplace.rows[0].sync_replace_school_data_atomically.success, true);

            // Vérification finale : ancien élève purgé, nouveau présent
            const { rows: checkOld } = await client1.query(`SELECT count(*)::int AS cnt FROM public.students_${slugA} WHERE id = '${controlledStd}'`);
            assert.strictEqual(checkOld[0].cnt, 0);

            const { rows: checkNew } = await client1.query(`SELECT count(*)::int AS cnt FROM public.students_${slugA} WHERE id = 'unblocked_std'`);
            assert.strictEqual(checkNew[0].cnt, 1);
        });

        // =====================================================================
        // CAS 12 : ROLLBACK TRANSACTIONNEL SUR LOCK TIMEOUT (CONCURRENCY_LOCK_TIMEOUT)
        // =====================================================================
        await t.test('12. Rollback complet sur lock timeout : Restauration intégrale de l’état initial', async () => {
            const timeoutStd = 'std_lock_timeout_old';
            const timeoutPay = 'pay_lock_timeout_old';
            const timeoutReqId = crypto.randomUUID();

            const { rows: gRowsTimeout } = await client1.query(
                'INSERT INTO public.global_students DEFAULT VALUES RETURNING student_global_id'
            );
            const globalIdTimeout = gRowsTimeout[0].student_global_id;

            await client1.query(`
                INSERT INTO public.students_${slugA} (id, nom, prenom, classe) VALUES ('${timeoutStd}', 'Timeout', 'Initial', 'Tle');
                INSERT INTO public.payments_${slugA} (id, student_id, montant, date, recu) VALUES ('${timeoutPay}', '${timeoutStd}', 30000, now(), 'REC-TIMEOUT');
                INSERT INTO public.parent_student_${slugA} (parent_id, student_id) VALUES ('${parent1Id}', '${timeoutStd}');
                INSERT INTO public.student_global_mappings (school_slug, student_local_id, student_global_id) VALUES ('${slugA}', '${timeoutStd}', '${globalIdTimeout}');
                INSERT INTO public.parent_child_links (parent_ref, student_global_id, current_link_active) VALUES ('${parent1Id}', '${globalIdTimeout}', true)
                ON CONFLICT (parent_ref, student_global_id) DO UPDATE SET current_link_active = true;
                INSERT INTO public.parent_student_link_requests (id, school_slug, student_id, parent_id, parent_phone_normalized, parent_name, status) VALUES
                    ('${timeoutReqId}', '${slugA}', '${timeoutStd}', '${parent1Id}', '+22997000001', 'Parent Timeout', 'pending');
            `);

            // 1. Client 2 bloque le verrou d'orchestration Niveau 0 pendant plus de 2s (> lock_timeout de 2s)
            await client2.query('BEGIN;');
            await client2.query('SELECT pg_advisory_xact_lock(0, hashtext($1));', [`${slugA}:sync_reset`]);

            // 2. Client 1 tente le remplacement : lock_timeout (2s) va expirer et lever lock_not_available
            const res = await client1.query(
                'SELECT public.sync_replace_school_data_atomically($1, $2, $3::jsonb)',
                [slugA, directorAId, JSON.stringify([{ id: 'never_inserted', nom: 'Never', prenom: 'Inserted', classe: 'CP' }])]
            );

            // Libération de la transaction de Client 2
            await client2.query('COMMIT;');

            const data = res.rows[0].sync_replace_school_data_atomically;
            assert.strictEqual(data.success, false);
            assert.strictEqual(data.error, 'CONCURRENCY_LOCK_TIMEOUT');

            // 3. VÉRIFICATION STRICTE DU ROLLBACK ET DE LA CONSERVATION DE TOUTES LES DONNÉES :
            // Élève initial toujours présent
            const { rows: rStd } = await client1.query(`SELECT count(*)::int AS cnt FROM public.students_${slugA} WHERE id = '${timeoutStd}'`);
            assert.strictEqual(rStd[0].cnt, 1);

            // Paiement initial toujours présent
            const { rows: rPay } = await client1.query(`SELECT count(*)::int AS cnt FROM public.payments_${slugA} WHERE id = '${timeoutPay}'`);
            assert.strictEqual(rPay[0].cnt, 1);

            // Mapping toujours présent
            const { rows: rMap } = await client1.query(`SELECT count(*)::int AS cnt FROM public.student_global_mappings WHERE school_slug = '${slugA}' AND student_local_id = '${timeoutStd}'`);
            assert.strictEqual(rMap[0].cnt, 1);

            // Demande toujours en 'pending'
            const { rows: rReq } = await client1.query(`SELECT status, decided_at FROM public.parent_student_link_requests WHERE id = '${timeoutReqId}'`);
            assert.strictEqual(rReq[0].status, 'pending');
            assert.strictEqual(rReq[0].decided_at, null);

            // Lien global toujours actif
            const { rows: rLink } = await client1.query(`SELECT current_link_active FROM public.parent_child_links WHERE parent_ref = '${parent1Id}' AND student_global_id = '${globalIdTimeout}'`);
            assert.strictEqual(rLink[0].current_link_active, true);

            // Le nouvel élève n'a jamais été inséré
            const { rows: rNever } = await client1.query(`SELECT count(*)::int AS cnt FROM public.students_${slugA} WHERE id = 'never_inserted'`);
            assert.strictEqual(rNever[0].cnt, 0);
        });

        // =====================================================================
        // CAS 13 : BLOCAGE DÉTERMINISTE DES NOUVELLES DEMANDES P26-B (TRIGGER SYNC GUARD)
        // =====================================================================
        await t.test('13. Anti-fantôme : Nouvelle demande P26-B bloquée pendant le remplacement de l’école A, école B non impactée', async () => {
            const anchorStd = 'std_anchor_13';
            await client1.query(`
                INSERT INTO public.students_${slugA} (id, nom, prenom, classe) VALUES ('${anchorStd}', 'Anchor', 'Std', 'CP');
            `);

            const anchorReqId = crypto.randomUUID();
            await client1.query(`
                INSERT INTO public.parent_student_link_requests (id, school_slug, student_id, parent_id, parent_phone_normalized, parent_name, status) VALUES
                    ('${anchorReqId}', '${slugA}', '${anchorStd}', '${parent1Id}', '+22997000001', 'Parent Anchor', 'pending');
            `);

            // 1. Client 2 ouvre une transaction et détient le verrou Niveau 1 sur anchorReqId
            await client2.query('BEGIN;');
            await client2.query('SELECT pg_advisory_xact_lock(1, hashtext($1));', [`${slugA}:${anchorReqId}`]);

            // 2. Client 1 lance sync_replace_school_data_atomically.
            // Client 1 acquiert Niveau 0 (exclusif) et LOCK TABLE, puis se bloque sur anchorReqId (Niveau 1).
            let replaceFinished = false;
            const replaceP = client1.query(
                'SELECT public.sync_replace_school_data_atomically($1, $2, $3::jsonb)',
                [slugA, directorAId, JSON.stringify([{ id: 'survivor_13', nom: 'Survivor', prenom: 'Thirteen', classe: 'CE1' }])]
            ).then(res => {
                replaceFinished = true;
                return res;
            });

            // Attente de confirmation du blocage de Client 1
            await new Promise(r => setTimeout(r, 150));
            assert.strictEqual(replaceFinished, false, 'Client 1 doit être bloqué sur la demande anchor.');

            // 3. Client 3 tente une écriture directe (INSERT dans parent_student_link_requests) pour l’école A
            // ciblant l'ancien élève anchorStd qui va être purgé par le remplacement
            const newReqIdA = crypto.randomUUID();
            let insertReqADone = false;
            let insertReqAError = null;
            const insertReqAP = client3.query(`
                INSERT INTO public.parent_student_link_requests (id, school_slug, student_id, parent_id, parent_phone_normalized, parent_name, status) VALUES
                    ('${newReqIdA}', '${slugA}', '${anchorStd}', '${parent1Id}', '+22997000001', 'Phantom Parent', 'pending');
            `).then(() => {
                insertReqADone = true;
            }).catch(err => {
                insertReqADone = true;
                insertReqAError = err;
            });

            await new Promise(r => setTimeout(r, 150));
            assert.strictEqual(insertReqADone, false, 'L’insertion directe sur l’école A doit être bloquée par le trigger sync_guard !');

            // 4. Parallélisme multi-établissements : Client 2 vérifie qu’une demande pour un élève existant de l’école B N’EST PAS bloquée
            await client2.query(`
                INSERT INTO public.students_${slugB} (id, nom, prenom, classe) VALUES ('std_b_test', 'Eleve', 'B', '6eme')
                ON CONFLICT (id) DO NOTHING;
            `);
            const newReqIdB = crypto.randomUUID();
            await client2.query(`
                INSERT INTO public.parent_student_link_requests (id, school_slug, student_id, parent_id, parent_phone_normalized, parent_name, status) VALUES
                    ('${newReqIdB}', '${slugB}', 'std_b_test', '${parent1Id}', '+22997000002', 'Parent B', 'pending');
            `);
            const { rows: checkB } = await client2.query(`SELECT count(*)::int AS cnt FROM public.parent_student_link_requests WHERE id = '${newReqIdB}'`);
            assert.strictEqual(checkB[0].cnt, 1, 'L’école B doit pouvoir insérer sans aucun blocage !');

            // 5. Client 2 valide sa transaction pour débloquer Client 1
            await client2.query('COMMIT;');

            // Client 1 et la requête d’insertion en attente doivent se résoudre
            await replaceP;
            assert.strictEqual(replaceFinished, true);

            // La requête d'insertion de Client 3 se débloque :
            // Comme anchorStd a été supprimé par le remplacement, le trigger rejette l'insertion avec STUDENT_NOT_FOUND !
            await insertReqAP;
            assert.strictEqual(insertReqADone, true);
            assert.ok(insertReqAError !== null, 'La demande pour l’ancien élève supprimé doit être rejetée');
            assert.ok(insertReqAError.message.includes('STUDENT_NOT_FOUND'));

            // Vérification en base : aucune demande fantôme créée
            const { rows: checkPhantom } = await client1.query(`SELECT count(*)::int AS cnt FROM public.parent_student_link_requests WHERE id = '${newReqIdA}'`);
            assert.strictEqual(checkPhantom[0].cnt, 0);
        });

        // =====================================================================
        // CAS 14 : BLOCAGE DÉTERMINISTE DES MUTATIONS DIRECTES LOCALES (LOCK TABLE EXCLUSIVE)
        // =====================================================================
        await t.test('14. Anti-fantôme : Écriture directe dans parent_student_<slug> bloquée par LOCK TABLE EXCLUSIVE', async () => {
            const blockStd = 'std_block_14';
            await client1.query(`
                INSERT INTO public.students_${slugA} (id, nom, prenom, classe) VALUES ('${blockStd}', 'Block', 'Fourteen', 'CE2');
            `);

            const blockReqId = crypto.randomUUID();
            await client1.query(`
                INSERT INTO public.parent_student_link_requests (id, school_slug, student_id, parent_id, parent_phone_normalized, parent_name, status) VALUES
                    ('${blockReqId}', '${slugA}', '${blockStd}', '${parent1Id}', '+22997000001', 'Parent Block', 'pending');
            `);

            // 1. Client 2 détient le verrou Niveau 1
            await client2.query('BEGIN;');
            await client2.query('SELECT pg_advisory_xact_lock(1, hashtext($1));', [`${slugA}:${blockReqId}`]);

            // 2. Client 1 lance le remplacement (détient Niveau 0 et LOCK TABLE EXCLUSIVE sur students_A et parent_student_A)
            let replace14Done = false;
            const replace14P = client1.query(
                'SELECT public.sync_replace_school_data_atomically($1, $2, $3::jsonb)',
                [slugA, directorAId, JSON.stringify([{ id: 'new_14_std', nom: 'NewFourteen', prenom: 'Ok', classe: 'CE2' }])]
            ).then(res => {
                replace14Done = true;
                return res;
            });

            await new Promise(r => setTimeout(r, 150));
            assert.strictEqual(replace14Done, false);

            // 3. Client 3 tente une insertion directe dans parent_student_A : doit être suspendu par LOCK TABLE
            let directInsertDone = false;
            const directInsertP = client3.query(`
                INSERT INTO public.parent_student_${slugA} (parent_id, student_id) VALUES ('${parent1Id}', '${blockStd}');
            `).then(() => {
                directInsertDone = true;
            });

            await new Promise(r => setTimeout(r, 150));
            assert.strictEqual(directInsertDone, false, 'L’insertion directe dans parent_student_<slugA> doit être bloquée par le verrou de table !');

            // 4. Client 2 libère son verrou
            await client2.query('COMMIT;');

            await replace14P;
            assert.strictEqual(replace14Done, true);

            await directInsertP;
            assert.strictEqual(directInsertDone, true, 'L’insertion directe en attente se termine après le remplacement.');
        });

        // =====================================================================
        // CAS 15 : ABSENCE DE DEADLOCK LORS DE L'UPDATE DE DEMANDE PAR APPROBATION CONCURRENTE
        // =====================================================================
        await t.test('15. Anti-deadlock : approve_parent_student_link (Niveau 1 -> UPDATE) vs sync_replace (Niveau 0 -> Niveau 1)', async () => {
            const deadlockStd = 'std_deadlock_15';
            await client1.query(`
                INSERT INTO public.students_${slugA} (id, nom, prenom, classe) VALUES ('${deadlockStd}', 'Deadlock', 'Fifteen', 'CM1');
            `);

            const deadlockReqId = crypto.randomUUID();
            await client1.query(`
                INSERT INTO public.parent_student_link_requests (id, school_slug, student_id, parent_id, parent_phone_normalized, parent_name, status) VALUES
                    ('${deadlockReqId}', '${slugA}', '${deadlockStd}', '${parent1Id}', '+22997000001', 'Parent Deadlock', 'pending');
            `);

            // Transaction A (client2) : démarre et acquiert le verrou Niveau 1 sur deadlockReqId (comme le fait approve_parent_student_link)
            await client2.query('BEGIN;');
            await client2.query('SELECT pg_advisory_xact_lock(1, hashtext($1));', [`${slugA}:${deadlockReqId}`]);

            // Transaction B (client1) : démarre sync_replace_school_data_atomically.
            // Acquiert Niveau 0 exclusif, puis se met en attente du verrou Niveau 1 sur deadlockReqId (détenu par Transaction A).
            let txBDone = false;
            const txBPromise = client1.query(
                'SELECT public.sync_replace_school_data_atomically($1, $2, $3::jsonb)',
                [slugA, directorAId, JSON.stringify([{ id: 'new_after_deadlock', nom: 'New', prenom: 'After', classe: 'CM1' }])]
            ).then(res => {
                txBDone = true;
                return res;
            });

            await new Promise(r => setTimeout(r, 150));
            assert.strictEqual(txBDone, false, 'Transaction B doit attendre le Niveau 1 détenu par Transaction A');

            // Transaction A (client2) : effectue son UPDATE sur parent_student_link_requests.
            // Sans trigger sur UPDATE, l'opération s'exécute immédiatement sans inversion ni deadlock A <-> B (40P01) !
            let updateError = null;
            try {
                await client2.query(`
                    UPDATE public.parent_student_link_requests
                    SET status = 'approved', decided_by = '${directorAId}', decided_at = now()
                    WHERE id = '${deadlockReqId}';
                `);
            } catch (err) {
                updateError = err;
            }
            assert.strictEqual(updateError, null, 'L’UPDATE par Transaction A ne doit pas provoquer de deadlock');

            // Transaction A valide et libère le Niveau 1
            await client2.query('COMMIT;');

            // Transaction B se débloque et termine
            const resB = await txBPromise;
            assert.strictEqual(txBDone, true);
            assert.strictEqual(resB.rows[0].sync_replace_school_data_atomically.success, true);
        });

        // =====================================================================
        // CAS 16 : HIÉRARCHIE UNIFIÉE 0 -> 1 : APPROVE RPC (NIVEAU 0 PARTAGÉ) VS SYNC_REPLACE (NIVEAU 0 EXCLUSIF)
        // =====================================================================
        await t.test('16. Anti-deadlock bout-en-bout : approve_parent_student_link (Niveau 0 partagé) vs sync_replace (Niveau 0 exclusif)', async () => {
            const student16Id = 'std_test_16';
            await client1.query(`
                INSERT INTO public.students_${slugA} (id, nom, prenom, classe) VALUES ('${student16Id}', 'Sixteen', 'Student', 'CM2');
            `);

            const req16Id = crypto.randomUUID();
            await client1.query(`
                INSERT INTO public.parent_student_link_requests (id, school_slug, student_id, parent_id, parent_phone_normalized, parent_name, status) VALUES
                    ('${req16Id}', '${slugA}', '${student16Id}', '${parent1Id}', '+22997000001', 'Parent Sixteen', 'pending');
            `);

            // Transaction A (client2) : démarre une transaction et exécute approve_parent_student_link.
            // L'opération acquiert Niveau 0 partagé, puis Niveau 1, insère dans parent_student et met à jour la demande.
            await client2.query('BEGIN;');
            const approveRes = await client2.query(
                'SELECT public.approve_parent_student_link($1, $2, $3, $4)',
                [req16Id, slugA, directorAId, 'Directeur Test']
            );
            assert.strictEqual(approveRes.rows[0].approve_parent_student_link.success, true, 'Approbation réussie dans Transaction A');

            // Transaction B (client1) : démarre sync_replace_school_data_atomically.
            // Demande le verrou Niveau 0 exclusif sur l'école A -> mise en attente car Transaction A détient Niveau 0 partagé.
            let txBFinished = false;
            const txBPromise = client1.query(
                'SELECT public.sync_replace_school_data_atomically($1, $2, $3::jsonb)',
                [slugA, directorAId, JSON.stringify([{ id: 'student_post_16', nom: 'NewSixteen', prenom: 'Post', classe: 'CM2' }])]
            ).then(res => {
                txBFinished = true;
                return res;
            });

            await new Promise(r => setTimeout(r, 150));
            assert.strictEqual(txBFinished, false, 'Transaction B doit être bloquée au Niveau 0 sans deadlock');

            // Transaction A valide sa transaction (libère Niveau 0 partagé, Niveau 1 et verrous de lignes)
            await client2.query('COMMIT;');

            // Transaction B se débloque, effectue le remplacement atomique complet et réussit
            const resReplace = await txBPromise;
            assert.strictEqual(txBFinished, true);
            assert.strictEqual(resReplace.rows[0].sync_replace_school_data_atomically.success, true);

            // Vérification post-remplacement : la demande req16Id a été révoquée par le remplacement atomique
            const reqCheck = await client1.query(`SELECT status, revocation_reason FROM public.parent_student_link_requests WHERE id = '${req16Id}'`);
            assert.strictEqual(reqCheck.rows[0].status, 'revoked');
            assert.strictEqual(reqCheck.rows[0].revocation_reason, 'Réinitialisation complète de l\'établissement en mode Remplacer.');
        });

        // =====================================================================
        // CAS 17 : VALIDATION DU TRIGGER HORS CONCURRENCE (ÉLÈVE INEXISTANT VS ÉLÈVE EXISTANT)
        // =====================================================================
        await t.test('17. Validation systématique du trigger hors concurrence : Rejet immédiat pour élève inexistant', async () => {
            const ghostStudentId = 'non_existent_ghost_999';
            const ghostReqId = crypto.randomUUID();

            let ghostError = null;
            try {
                await client1.query(`
                    INSERT INTO public.parent_student_link_requests (id, school_slug, student_id, parent_id, parent_phone_normalized, parent_name, status) VALUES
                        ('${ghostReqId}', '${slugA}', '${ghostStudentId}', '${parent1Id}', '+22997000001', 'Parent Ghost', 'pending');
                `);
            } catch (err) {
                ghostError = err;
            }

            assert.ok(ghostError !== null, 'L’insertion d’une demande pour un élève inexistant sans concurrence doit être rejetée');
            assert.ok(ghostError.message.includes('STUDENT_NOT_FOUND'), `Le message d'erreur doit contenir STUDENT_NOT_FOUND: ${ghostError.message}`);

            // Vérification en base : aucune demande insérée
            const { rows: ghostRows } = await client1.query(`SELECT count(*)::int AS cnt FROM public.parent_student_link_requests WHERE id = '${ghostReqId}'`);
            assert.strictEqual(ghostRows[0].cnt, 0);

            // Cas nominal sans concurrence : insertion avec un élève qui existe réellement
            const validStudentId = 'std_valid_17';
            await client1.query(`
                INSERT INTO public.students_${slugA} (id, nom, prenom, classe) VALUES ('${validStudentId}', 'Existant', 'Reel', 'CM1');
            `);

            const validReqId = crypto.randomUUID();
            let validError = null;
            try {
                await client1.query(`
                    INSERT INTO public.parent_student_link_requests (id, school_slug, student_id, parent_id, parent_phone_normalized, parent_name, status) VALUES
                        ('${validReqId}', '${slugA}', '${validStudentId}', '${parent1Id}', '+22997000001', 'Parent Valide', 'pending');
                `);
            } catch (err) {
                validError = err;
            }

            assert.strictEqual(validError, null, 'L’insertion d’une demande pour un élève existant sans concurrence doit réussir');
            const { rows: validRows } = await client1.query(`SELECT count(*)::int AS cnt FROM public.parent_student_link_requests WHERE id = '${validReqId}'`);
            assert.strictEqual(validRows[0].cnt, 1, 'La demande pour élève existant doit être enregistrée');
        });

        // =====================================================================
        // CAS 18 : REJET EXPLICITE D'UNE DEMANDE AVEC STUDENT_ID NULL OU VIDE
        // =====================================================================
        await t.test('18. Sécurité trigger : Rejet strict des demandes avec student_id NULL ou vide', async () => {
            const nullReqId = crypto.randomUUID();
            let nullError = null;
            try {
                await client1.query(`
                    INSERT INTO public.parent_student_link_requests (id, school_slug, student_id, parent_id, parent_phone_normalized, parent_name, status) VALUES
                        ('${nullReqId}', '${slugA}', NULL, '${parent1Id}', '+22997000001', 'Parent Null', 'pending');
                `);
            } catch (err) {
                nullError = err;
            }
            assert.ok(nullError !== null, 'L’insertion avec student_id NULL doit échouer');
            assert.strictEqual(nullError.code, '23502', 'L’erreur doit être une violation NOT NULL (code 23502)');

            const emptyReqId = crypto.randomUUID();
            let emptyError = null;
            try {
                await client1.query(`
                    INSERT INTO public.parent_student_link_requests (id, school_slug, student_id, parent_id, parent_phone_normalized, parent_name, status) VALUES
                        ('${emptyReqId}', '${slugA}', '   ', '${parent1Id}', '+22997000001', 'Parent Vide', 'pending');
                `);
            } catch (err) {
                emptyError = err;
            }
            assert.ok(emptyError !== null, 'L’insertion avec student_id vide doit échouer');
            assert.ok(emptyError.message.includes('INVALID_STUDENT_ID'), `L’erreur doit mentionner INVALID_STUDENT_ID: ${emptyError.message}`);
        });

        // =====================================================================
        // CAS 19 : ÉCHEC EXPLICITE SI LA TABLE STUDENTS_<SLUG> EST ABSENTE
        // =====================================================================
        await t.test('19. Sécurité trigger : Échec explicite et sécurisé si la table students_<slug> est absente', async () => {
            const orphanSchoolSlug = 'ecole_sans_tables';
            const orphanReqId = crypto.randomUUID();
            let tableError = null;

            try {
                await client1.query(`
                    INSERT INTO public.parent_student_link_requests (id, school_slug, student_id, parent_id, parent_phone_normalized, parent_name, status) VALUES
                        ('${orphanReqId}', '${orphanSchoolSlug}', 'std_orphelin', '${parent1Id}', '+22997000001', 'Parent École Inexistante', 'pending');
                `);
            } catch (err) {
                tableError = err;
            }

            assert.ok(tableError !== null, 'L’insertion sur un établissement sans table students doit lever une exception');
            assert.strictEqual(tableError.code, '42P01', 'Le code d’erreur doit être 42P01 (undefined_table)');
            assert.ok(tableError.message.includes('STUDENTS_TABLE_NOT_FOUND'), `Le message doit mentionner STUDENTS_TABLE_NOT_FOUND: ${tableError.message}`);

            // Vérification : aucune insertion fantôme
            const { rows: orphanRows } = await client1.query(`SELECT count(*)::int AS cnt FROM public.parent_student_link_requests WHERE id = '${orphanReqId}'`);
            assert.strictEqual(orphanRows[0].cnt, 0);
        });

    } finally {
        // Teardown strict : suppression des tables et fiches de test
        try {
            await client1.query(`
                DELETE FROM public.parent_student_link_requests WHERE school_slug IN ('${slugA}', '${slugB}');
                DELETE FROM public.student_global_mappings WHERE school_slug IN ('${slugA}', '${slugB}');
                DELETE FROM public.schools WHERE slug IN ('${slugA}', '${slugB}');
                DROP TABLE IF EXISTS public.devoirs_${slugA};
                DROP TABLE IF EXISTS public.presences_${slugA};
                DROP TABLE IF EXISTS public.payments_${slugA};
                DROP TABLE IF EXISTS public.parent_student_${slugA};
                DROP TABLE IF EXISTS public.students_${slugA};
                DROP TABLE IF EXISTS public.profiles_${slugA};
                DROP TABLE IF EXISTS public.devoirs_${slugB};
                DROP TABLE IF EXISTS public.presences_${slugB};
                DROP TABLE IF EXISTS public.payments_${slugB};
                DROP TABLE IF EXISTS public.parent_student_${slugB};
                DROP TABLE IF EXISTS public.students_${slugB};
                DROP TABLE IF EXISTS public.profiles_${slugB};
            `);
        } catch (cleanErr) {
            console.error('Erreur teardown:', cleanErr.message);
        }

        if (client1) client1.release();
        if (client2) client2.release();
        if (client3) client3.release();
        await pool.end();
    }
});
