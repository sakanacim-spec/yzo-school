/**
 * Tests unitaires et statiques : Sécurisation de deleteStudent via delete_student_local_atomically (P26-B Lot 1)
 *
 * Vérifie :
 * 1. L'arrêt immédiat et sécurisé si supabase.rpc est absent, échoue ou renvoie une erreur.
 * 2. L'absence définitive de tout repli de suppression directe (parent_student_..., payments, presences, notes, students).
 * 3. L'exécution exclusive de la RPC transactionnelle unique delete_student_local_atomically.
 * 4. La gestion appropriée des statuts HTTP (400, 403, 404, 409, 500).
 * 5. L'analyse statique du code source pour interdire tout découpage non atomique.
 */
'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test_service_role_key';
process.env.JWT_SECRET = 'test_secret_for_multitenant_lot5b_security_min_32_chars';
process.env.PASSWORD_RESET_OTP_SECRET = 'test_otp_secret_for_lot5b_hmac_min_32_chars';
process.env.AI_QUOTA_HASH_SECRET = 'test_ai_quota_hash_secret_min_32_chars_ok';

const { deleteStudent } = require('../controllers/syncController');
const { supabase } = require('../utils/supabase');

describe('P26-B Lot 1 — Sécurisation deleteStudent (Unit & Static Tests)', () => {
    const originalFrom = supabase.from;
    const originalRpc = supabase.rpc;

    let res;
    let statusCode = null;
    let responseBody = null;

    beforeEach(() => {
        statusCode = 200;
        responseBody = null;
        res = {
            statusCode: 200,
            status: function (code) {
                statusCode = code;
                this.statusCode = code;
                return this;
            },
            json: function (data) {
                responseBody = data;
                this.responseBody = data;
                return this;
            }
        };
    });

    afterEach(() => {
        supabase.from = originalFrom;
        supabase.rpc = originalRpc;
    });

    describe('1. Contrôles d\'accès et validation des paramètres', () => {
        it('1.1. Refuse l\'accès à un rôle non autorisé (ex: parent, comptable)', async () => {
            const reqParent = {
                user: { id: 'user-1', role: 'parent', schoolSlug: 'ecole_test' },
                params: { id: 'stu-1' }
            };
            await deleteStudent(reqParent, res);
            assert.equal(statusCode, 403);
            assert.deepEqual(responseBody, { error: 'Non autorisé.' });

            const reqComptable = {
                user: { id: 'user-2', role: 'comptable', schoolSlug: 'ecole_test' },
                params: { id: 'stu-1' }
            };
            await deleteStudent(reqComptable, res);
            assert.equal(statusCode, 403);
            assert.deepEqual(responseBody, { error: 'Non autorisé.' });
        });

        it('1.2. Refuse si schoolSlug est absent', async () => {
            const req = {
                user: { id: 'user-1', role: 'directeur' },
                params: { id: 'stu-1' }
            };
            await deleteStudent(req, res);
            assert.equal(statusCode, 403);
            assert.deepEqual(responseBody, { error: 'Établissement non identifié.' });
        });

        it('1.3. Refuse si l\'identifiant élève est vide ou invalide', async () => {
            const req = {
                user: { id: 'user-1', role: 'directeur', schoolSlug: 'ecole_test' },
                params: { id: '   ' }
            };
            await deleteStudent(req, res);
            assert.equal(statusCode, 400);
            assert.deepEqual(responseBody, { error: 'Identifiant élève requis.' });
        });
    });

    describe('2. Gestion sécurisée des erreurs RPC (Atomicité garantie)', () => {
        it('2.1. Interrompt sans suppression directe si supabase.rpc est absent', async () => {
            supabase.rpc = null;

            const deletedTables = [];
            supabase.from = (table) => ({
                delete: () => {
                    deletedTables.push(table);
                    return { eq: () => Promise.resolve({ error: null }) };
                }
            });

            const req = {
                user: { id: 'admin-1', role: 'admin', schoolSlug: 'ecole_test' },
                params: { id: 'stu-100' }
            };

            await deleteStudent(req, res);

            assert.equal(statusCode, 500);
            assert.ok(responseBody.error.includes('indisponible'));
            assert.equal(deletedTables.length, 0, 'Aucune suppression directe ne doit être exécutée');
        });

        it('2.2. Interrompt sans suppression directe si la RPC delete_student renvoie une erreur DB', async () => {
            supabase.rpc = () => Promise.resolve({
                data: null,
                error: { message: 'Database connection failed' }
            });

            const req = {
                user: { id: 'admin-1', role: 'directeur', schoolSlug: 'ecole_test' },
                params: { id: 'stu-100' }
            };

            await deleteStudent(req, res);

            assert.equal(statusCode, 500);
            assert.equal(responseBody.error, "Erreur lors de la suppression de l'élève.");
        });

        it('2.3. Renvoie 404 si la RPC signale STUDENT_NOT_FOUND', async () => {
            supabase.rpc = () => Promise.resolve({
                data: { success: false, error: 'STUDENT_NOT_FOUND' },
                error: null
            });

            const req = {
                user: { id: 'admin-1', role: 'directeur', schoolSlug: 'ecole_test' },
                params: { id: 'stu-inconnu' }
            };

            await deleteStudent(req, res);

            assert.equal(statusCode, 404);
            assert.equal(responseBody.error, "Élève introuvable dans cet établissement.");
        });

        it('2.4. Renvoie 409 si un conflit de verrouillage survient (CONCURRENCY_LOCK_TIMEOUT)', async () => {
            supabase.rpc = () => Promise.resolve({
                data: { success: false, error: 'CONCURRENCY_LOCK_TIMEOUT' },
                error: null
            });

            const req = {
                user: { id: 'admin-1', role: 'directeur', schoolSlug: 'ecole_test' },
                params: { id: 'stu-100' }
            };

            await deleteStudent(req, res);

            assert.equal(statusCode, 409);
            assert.ok(responseBody.error.includes('Conflit de verrouillage temporaire'));
        });

        it('2.5. Renvoie 403 si la RPC signale UNAUTHORIZED_ACTOR ou ACTOR_NOT_IN_SCHOOL', async () => {
            supabase.rpc = () => Promise.resolve({
                data: { success: false, error: 'UNAUTHORIZED_ACTOR' },
                error: null
            });

            const req = {
                user: { id: 'admin-1', role: 'directeur', schoolSlug: 'ecole_test' },
                params: { id: 'stu-100' }
            };

            await deleteStudent(req, res);

            assert.equal(statusCode, 403);
            assert.equal(responseBody.error, 'Non autorisé.');
        });
    });

    describe('3. Exécution nominale atomique', () => {
        it('3.1. Appelle delete_student_local_atomically avec les bons paramètres et renvoie 200', async () => {
            let capturedCall = null;
            supabase.rpc = (fn, params) => {
                capturedCall = { fn, params };
                return Promise.resolve({
                    data: {
                        success: true,
                        student_id: 'stu-42',
                        deleted_parents_count: 2,
                        global_links_deactivated_count: 1,
                        global_links_preserved_count: 1
                    },
                    error: null
                });
            };

            const req = {
                user: { id: 'admin-1', role: 'admin', schoolSlug: 'ecole_test' },
                params: { id: 'stu-42' }
            };

            await deleteStudent(req, res);

            assert.equal(statusCode, 200);
            assert.equal(capturedCall.fn, 'delete_student_local_atomically');
            assert.deepEqual(capturedCall.params, {
                p_school_slug: 'ecole_test',
                p_student_id: 'stu-42',
                p_actor_id: 'admin-1'
            });
            assert.equal(responseBody.success, true);
            assert.equal(responseBody.deleted_parents_count, 2);
        });
    });

    describe('4. Tests statiques du code source de syncController.js', () => {
        const sourcePath = path.resolve(__dirname, '../controllers/syncController.js');
        const sourceCode = fs.readFileSync(sourcePath, 'utf8');

        const fnMatch = sourceCode.match(/async function deleteStudent\([\s\S]*?\n\}/);
        const fnCode = fnMatch ? fnMatch[0] : '';

        it('4.1. deleteStudent appelle exclusivement delete_student_local_atomically', () => {
            assert.ok(fnCode.includes('delete_student_local_atomically'), 'deleteStudent doit appeler delete_student_local_atomically');
            assert.ok(!fnCode.includes('unlink_parent_student_local'), 'deleteStudent ne doit plus appeler unlink en boucle unitaire');
        });

        it('4.2. Aucun delete REST direct n\'est effectué dans deleteStudent', () => {
            assert.ok(!fnCode.includes('.delete()'), 'Aucune requête .delete() directe ne doit subsister dans deleteStudent');
        });

        it('4.3. Le rôle comptable est exclu de deleteStudent', () => {
            assert.ok(!fnCode.includes('\'comptable\''), 'Le rôle comptable ne doit pas figurer dans les rôles autorisés de deleteStudent');
        });

        it('4.4. Interruption immédiate si supabase.rpc est absent', () => {
            assert.ok(fnCode.includes('typeof supabase.rpc !== \'function\''), 'Vérification explicite de typeof supabase.rpc requis');
        });
    });
});
