'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

const migrationSqlPath = path.resolve(__dirname, '../scripts/migration_p26_b_link_approval_foundation.sql');
const inspectorScriptPath = path.resolve(__dirname, '../scripts/inspect_historical_links.cjs');

// ============================================================================
// SUITE 1 : VÉRIFICATION STATIQUE AVANT EXÉCUTION POSTGRESQL
// ============================================================================

test('P26-B Intégration - Présence des livrables et intégrité de la migration', () => {
    assert.ok(fs.existsSync(migrationSqlPath), 'Le fichier migration_p26_b_link_approval_foundation.sql doit exister');
    assert.ok(fs.existsSync(inspectorScriptPath), 'Le fichier inspect_historical_links.cjs doit exister');

    const sql = fs.readFileSync(migrationSqlPath, 'utf8');

    // Vérification des éléments critiques
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.parent_student_link_requests/, 'Table parent_student_link_requests requise');
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.approve_parent_student_link/, 'RPC approve_parent_student_link requise');
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.reject_parent_student_link/, 'RPC reject_parent_student_link requise');
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.revoke_parent_student_link/, 'RPC revoke_parent_student_link requise');
    assert.match(sql, /SECURITY DEFINER/);
    assert.match(sql, /SET search_path = public, pg_temp/);
});

// ============================================================================
// SUITE 2 : EXÉCUTION RÉELLE SUR POSTGRESQL ÉPHÉMÈRE / ISOLÉ
// ============================================================================

test('P26-B Intégration - Suite complète sur instance PostgreSQL réelle', async (t) => {
    const databaseUrl = (process.env.DATABASE_URL || '').trim();

    if (!databaseUrl) {
        // Détection de l'absence d'environnement PostgreSQL local
        assert.fail(
            'POSTGRES_TEST_BLOCKED: Aucune instance PostgreSQL isolée accessible (DATABASE_URL non défini). ' +
            'Cette suite est conçue pour s\'exécuter automatiquement dans la CI GitHub Actions (service postgres:17-alpine).'
        );
    }

    const pool = new Pool({
        connectionString: databaseUrl,
        connectionTimeoutMillis: 5000
    });

    let client;
    try {
        client = await pool.connect();
    } catch (err) {
        assert.fail(`Connexion PostgreSQL impossible (${err.message}). Vérifier DATABASE_URL.`);
    }

    try {
        // Isolation complète dans une transaction avec ROLLBACK final
        await client.query('BEGIN');

        // Pré-requis d'environnement PostgreSQL standard : existence des rôles Supabase s'ils n'existent pas
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
                    CREATE ROLE anon;
                END IF;
                IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
                    CREATE ROLE authenticated;
                END IF;
                IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
                    CREATE ROLE service_role;
                END IF;
            END
            $$;
        `);

        // Pré-requis de schéma global (nécessaires pour le modèle écosystème YZIOW P24/P25)
        await client.query(`
            -- Table maître des établissements
            CREATE TABLE IF NOT EXISTS public.schools (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                slug TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active',
                country TEXT DEFAULT 'BJ',
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );

            INSERT INTO public.schools (slug, name)
            VALUES ('ecole_a', 'École A Test'), ('ecole_b', 'École B Test')
            ON CONFLICT (slug) DO NOTHING;

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
        `);

        // Tables de test pour deux établissements fictifs : "ecole_a" et "ecole_b"
        await client.query(`
            -- Établissement A
            CREATE TABLE IF NOT EXISTS public.profiles_ecole_a (
                id UUID PRIMARY KEY,
                role TEXT NOT NULL,
                full_name TEXT
            );

            CREATE TABLE IF NOT EXISTS public.students_ecole_a (
                id TEXT PRIMARY KEY,
                nom TEXT NOT NULL,
                prenom TEXT NOT NULL,
                classe TEXT NOT NULL,
                telephone_parent_normalized TEXT NULL
            );

            CREATE TABLE IF NOT EXISTS public.parent_student_ecole_a (
                parent_id UUID NOT NULL,
                student_id TEXT NOT NULL,
                source_request_id UUID NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                PRIMARY KEY (parent_id, student_id)
            );

            -- Établissement B
            CREATE TABLE IF NOT EXISTS public.profiles_ecole_b (
                id UUID PRIMARY KEY,
                role TEXT NOT NULL,
                full_name TEXT
            );

            CREATE TABLE IF NOT EXISTS public.students_ecole_b (
                id TEXT PRIMARY KEY,
                nom TEXT NOT NULL,
                prenom TEXT NOT NULL,
                classe TEXT NOT NULL,
                telephone_parent_normalized TEXT NULL
            );

            CREATE TABLE IF NOT EXISTS public.parent_student_ecole_b (
                parent_id UUID NOT NULL,
                student_id TEXT NOT NULL,
                source_request_id UUID NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                PRIMARY KEY (parent_id, student_id)
            );
        `);

        // Helper : extraction ciblée du corps SQL de la migration
        // en retirant exclusivement le BEGIN; initial et le COMMIT; final de premier niveau,
        // afin de préserver l'isolation de la transaction globale du test tout en conservant
        // 100% des blocs PL/pgSQL internes (qui contiennent leurs propres BEGIN ... END).
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

        // A. INSTALLATION DE LA MIGRATION P26-B
        await t.test('A.1. Exécution réelle du DDL de migration P26-B', async () => {
            const migrationSql = fs.readFileSync(migrationSqlPath, 'utf8');
            const cleanSql = extractMigrationBody(migrationSql);

            await client.query(cleanSql);

            // Vérifier que la table parent_student_link_requests existe
            const tableCheck = await client.query(`
                SELECT tablename FROM pg_tables 
                WHERE schemaname = 'public' AND tablename = 'parent_student_link_requests';
            `);
            assert.equal(tableCheck.rows.length, 1, 'La table parent_student_link_requests doit exister en base');
        });

        await t.test('A.2. Idempotence de la migration (seconde exécution sans erreur)', async () => {
            const migrationSql = fs.readFileSync(migrationSqlPath, 'utf8');
            const cleanSql = extractMigrationBody(migrationSql);

            // Doit s'exécuter sans lever d'exception
            await assert.doesNotReject(async () => {
                await client.query(cleanSql);
            }, 'La réexécution du script DDL doit être idempotente');
        });

        // Jeu de données pour les tests fonctionnels
        const directorAId = 'a0000000-0000-0000-0000-000000000001';
        const teacherAId = 'a0000000-0000-0000-0000-000000000002';
        const directorBId = 'b0000000-0000-0000-0000-000000000001';

        const parent1Id = '11111111-1111-1111-1111-111111111111';
        const parent2Id = '22222222-2222-2222-2222-222222222222';
        const studentA1 = 'STU-A-001';
        const studentA2 = 'STU-A-002';

        await client.query(`
            INSERT INTO public.profiles_ecole_a (id, role, full_name) VALUES
            ('${directorAId}', 'directeur', 'Directeur École A'),
            ('${teacherAId}', 'enseignant', 'Enseignant École A');

            INSERT INTO public.students_ecole_a (id, nom, prenom, classe, telephone_parent_normalized) VALUES
            ('${studentA1}', 'Élève', 'A1', '6ème A', '+22997000001'),
            ('${studentA2}', 'Élève', 'A2', '5ème B', '+22997000002');

            INSERT INTO public.profiles_ecole_b (id, role, full_name) VALUES
            ('${directorBId}', 'directeur', 'Directeur École B');
        `);

        // B. SCÉNARIOS D'APPROBATION
        let req1Id;
        await t.test('B.1. Approbation nominale par le directeur habilité', async () => {
            const insertRes = await client.query(`
                INSERT INTO public.parent_student_link_requests (
                    school_slug, parent_id, student_id, parent_phone_normalized, parent_name, student_name, status
                ) VALUES (
                    'ecole_a', '${parent1Id}', '${studentA1}', '+22997000001', 'Parent Un', 'Élève A1', 'pending'
                ) RETURNING id;
            `);
            req1Id = insertRes.rows[0].id;

            const rpcRes = await client.query(`
                SELECT public.approve_parent_student_link(
                    $1::UUID, 'ecole_a', '${directorAId}'::UUID, 'Directeur École A'
                ) AS result;
            `, [req1Id]);

            const result = rpcRes.rows[0].result;
            assert.equal(result.success, true, 'L\'approbation doit réussir');
            assert.equal(result.status, 'approved');

            // Vérifier mise à jour en table centrale
            const reqCheck = await client.query('SELECT * FROM public.parent_student_link_requests WHERE id = $1', [req1Id]);
            assert.equal(reqCheck.rows[0].status, 'approved');
            assert.equal(reqCheck.rows[0].decided_by, directorAId);

            // Vérifier insertion dans parent_student_ecole_a
            const localCheck = await client.query(
                'SELECT * FROM public.parent_student_ecole_a WHERE parent_id = $1 AND student_id = $2',
                [parent1Id, studentA1]
            );
            assert.equal(localCheck.rows.length, 1, 'Le lien local doit être inséré dans parent_student_ecole_a');

            // Vérifier synchronisation parent_child_links
            const globalLinkCheck = await client.query(
                'SELECT * FROM public.parent_child_links WHERE parent_ref = $1 AND current_link_active = true',
                [parent1Id]
            );
            assert.equal(globalLinkCheck.rows.length, 1, 'Le lien global actif doit être créé');
        });

        await t.test('B.2. Idempotence : une approbation répétée ne duplique rien et retourne succès', async () => {
            const rpcRes = await client.query(`
                SELECT public.approve_parent_student_link(
                    $1::UUID, 'ecole_a', '${directorAId}'::UUID
                ) AS result;
            `, [req1Id]);

            const result = rpcRes.rows[0].result;
            assert.equal(result.success, true);
            assert.equal(result.status, 'already_approved');
        });

        await t.test('B.3. Multi-parentalité : un second parent peut être approuvé pour le même élève', async () => {
            const insertRes = await client.query(`
                INSERT INTO public.parent_student_link_requests (
                    school_slug, parent_id, student_id, parent_phone_normalized, parent_name, student_name, status
                ) VALUES (
                    'ecole_a', '${parent2Id}', '${studentA1}', '+22997000002', 'Parent Deux', 'Élève A1', 'pending'
                ) RETURNING id;
            `);
            const req2Id = insertRes.rows[0].id;

            const rpcRes = await client.query(`
                SELECT public.approve_parent_student_link(
                    $1::UUID, 'ecole_a', '${directorAId}'::UUID
                ) AS result;
            `, [req2Id]);

            assert.equal(rpcRes.rows[0].result.success, true);

            // Vérifier que parent_student_ecole_a a bien 2 parents pour cet élève
            const countCheck = await client.query(
                'SELECT count(*) FROM public.parent_student_ecole_a WHERE student_id = $1',
                [studentA1]
            );
            assert.equal(parseInt(countCheck.rows[0].count, 10), 2, 'Les deux parents distincts doivent coexister pour l\'élève');
        });

        await t.test('B.4. Cloisonnement : le directeur de l\'école B ne peut pas approuver pour l\'école A', async () => {
            const insertRes = await client.query(`
                INSERT INTO public.parent_student_link_requests (
                    school_slug, parent_id, student_id, parent_phone_normalized, parent_name, status
                ) VALUES (
                    'ecole_a', '${parent1Id}', '${studentA2}', '+22997000001', 'Parent Un', 'pending'
                ) RETURNING id;
            `);
            const req3Id = insertRes.rows[0].id;

            // Appel avec le directeur B sur l'école A
            const rpcRes = await client.query(`
                SELECT public.approve_parent_student_link(
                    $1::UUID, 'ecole_a', '${directorBId}'::UUID
                ) AS result;
            `, [req3Id]);

            assert.equal(rpcRes.rows[0].result.success, false);
            assert.equal(rpcRes.rows[0].result.error, 'UNAUTHORIZED_APPROVER');
        });

        await t.test('B.5. Non-directeur : un enseignant ne peut pas approuver', async () => {
            const insertRes = await client.query(`
                INSERT INTO public.parent_student_link_requests (
                    school_slug, parent_id, student_id, parent_phone_normalized, parent_name, status
                ) VALUES (
                    'ecole_a', '${parent2Id}', '${studentA2}', '+22997000002', 'Parent Deux', 'pending'
                ) RETURNING id;
            `);
            const req4Id = insertRes.rows[0].id;

            const rpcRes = await client.query(`
                SELECT public.approve_parent_student_link(
                    $1::UUID, 'ecole_a', '${teacherAId}'::UUID
                ) AS result;
            `, [req4Id]);

            assert.equal(rpcRes.rows[0].result.success, false);
            assert.equal(rpcRes.rows[0].result.error, 'UNAUTHORIZED_APPROVER');
        });

        // C. REJET ET RÉVOCATION
        let rejectReqId;
        await t.test('C.1. Rejet nominal avec motif obligatoire', async () => {
            const insertRes = await client.query(`
                INSERT INTO public.parent_student_link_requests (
                    school_slug, parent_id, student_id, parent_phone_normalized, parent_name, status
                ) VALUES (
                    'ecole_a', '${parent1Id}', 'STU-UNKNOWN', '+22997000001', 'Parent Un', 'pending'
                ) RETURNING id;
            `);
            rejectReqId = insertRes.rows[0].id;

            // Tentative sans motif -> Rejet
            const noReasonRes = await client.query(`
                SELECT public.reject_parent_student_link(
                    $1::UUID, 'ecole_a', '${directorAId}'::UUID, '   '
                ) AS result;
            `, [rejectReqId]);
            assert.equal(noReasonRes.rows[0].result.success, false);
            assert.equal(noReasonRes.rows[0].result.error, 'REJECTION_REASON_REQUIRED');

            // Rejet valide
            const rpcRes = await client.query(`
                SELECT public.reject_parent_student_link(
                    $1::UUID, 'ecole_a', '${directorAId}'::UUID, 'Élève introuvable dans nos registres', 'STUDENT_NOT_FOUND'
                ) AS result;
            `, [rejectReqId]);

            assert.equal(rpcRes.rows[0].result.success, true);
            assert.equal(rpcRes.rows[0].result.status, 'rejected');

            // Vérifier qu'aucun lien local n'a été créé
            const localCheck = await client.query(
                'SELECT * FROM public.parent_student_ecole_a WHERE parent_id = $1 AND student_id = $2',
                [parent1Id, 'STU-UNKNOWN']
            );
            assert.equal(localCheck.rows.length, 0);
        });

        await t.test('C.2. Révocation nominale d\'un lien approuvé', async () => {
            // Révocation de req1Id (parent1 sur studentA1)
            const rpcRes = await client.query(`
                SELECT public.revoke_parent_student_link(
                    $1::UUID, 'ecole_a', '${directorAId}'::UUID, 'Demande de la famille / radiation'
                ) AS result;
            `, [req1Id]);

            assert.equal(rpcRes.rows[0].result.success, true);
            assert.equal(rpcRes.rows[0].result.status, 'revoked');

            // Vérifier suppression physique dans parent_student_ecole_a
            const localCheck = await client.query(
                'SELECT * FROM public.parent_student_ecole_a WHERE parent_id = $1 AND student_id = $2',
                [parent1Id, studentA1]
            );
            assert.equal(localCheck.rows.length, 0, 'Le lien local doit être retiré');

            // Vérifier désactivation du lien global parent_child_links
            const globalLinkCheck = await client.query(
                'SELECT current_link_active FROM public.parent_child_links WHERE parent_ref = $1',
                [parent1Id]
            );
            assert.equal(globalLinkCheck.rows[0].current_link_active, false, 'Le lien global doit être désactivé');

            // L'autre parent (parent2) sur cet élève doit rester intègre !
            const otherParentCheck = await client.query(
                'SELECT * FROM public.parent_student_ecole_a WHERE parent_id = $1 AND student_id = $2',
                [parent2Id, studentA1]
            );
            assert.equal(otherParentCheck.rows.length, 1, 'Le lien du second parent ne doit pas être altéré');
        });

        // D. SÉCURITÉ, FORMATS ET INJECTIONS
        await t.test('D.1. Rejet strict des school_slug malformés ou injectés', async () => {
            const maliciousSlugs = [
                'ecole_a; DROP TABLE parent_student_link_requests;--',
                'ecole_a" OR 1=1--',
                'école_accent',
                'ecole-with-uppercase-ABC',
                'slug_trop_long_'.repeat(10)
            ];

            for (const badSlug of maliciousSlugs) {
                // Table CHECK : isolée par un SAVEPOINT pour ne pas corrompre la transaction globale
                await client.query('SAVEPOINT sp_check_slug;');
                let checkFailed = false;
                try {
                    await client.query(`
                        INSERT INTO public.parent_student_link_requests (
                            school_slug, parent_id, student_id, parent_phone_normalized, parent_name
                        ) VALUES ($1, '${parent1Id}', 'STU', '+229000', 'P')
                    `, [badSlug]);
                } catch (err) {
                    checkFailed = true;
                    assert.match(err.message, /chk_school_slug_format/, `Le slug "${badSlug}" doit violer chk_school_slug_format`);
                } finally {
                    await client.query('ROLLBACK TO SAVEPOINT sp_check_slug;');
                }
                assert.equal(checkFailed, true, `L'insertion avec le slug malformé "${badSlug}" aurait dû échouer`);

                // RPC guard : ne lève pas d'exception SQL mais retourne { success: false, error: 'INVALID_SCHOOL_SLUG' }
                const rpcRes = await client.query(`
                    SELECT public.approve_parent_student_link(
                        '${parent1Id}'::UUID, $1, '${directorAId}'::UUID
                    ) AS result;
                `, [badSlug]);
                assert.equal(rpcRes.rows[0].result.success, false);
                assert.equal(rpcRes.rows[0].result.error, 'INVALID_SCHOOL_SLUG');
            }
        });

        // E. CONTRAINTES D'UNICITÉ ET ANTI-CONCURRENCE
        await t.test('E.1. Index partiel : interdiction de doubler une demande pending', async () => {
            await client.query(`
                INSERT INTO public.parent_student_link_requests (
                    school_slug, parent_id, student_id, parent_phone_normalized, parent_name, status
                ) VALUES (
                    'ecole_a', '${parent1Id}', 'STU-CONCURRENCE', '+22997000001', 'Parent Un', 'pending'
                );
            `);

            // Seconde insertion en pending pour le même couple : isolée par un SAVEPOINT
            await client.query('SAVEPOINT sp_unique_pending;');
            let duplicateFailed = false;
            try {
                await client.query(`
                    INSERT INTO public.parent_student_link_requests (
                        school_slug, parent_id, student_id, parent_phone_normalized, parent_name, status
                    ) VALUES (
                        'ecole_a', '${parent1Id}', 'STU-CONCURRENCE', '+22997000001', 'Parent Un', 'pending'
                    );
                `);
            } catch (err) {
                duplicateFailed = true;
                assert.match(err.message, /uq_link_requests_single_pending_review/, 'L\'index partiel doit lever une erreur d\'unicité');
            } finally {
                await client.query('ROLLBACK TO SAVEPOINT sp_unique_pending;');
            }
            assert.equal(duplicateFailed, true, 'La double demande pending aurait dû être rejetée par l\'index partiel');
        });

    } finally {
        // Nettoyage absolu : Rollback pour laisser la base vierge
        await client.query('ROLLBACK');
        client.release();
        await pool.end();
    }
});
