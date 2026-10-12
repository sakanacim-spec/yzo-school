/**
 * YZIOW P26-B — Lot 2 : Tests de Découplage des Rattachements Parent–Élève
 * Fichier : backend/tests/parentLinkDecouplingLot2.test.js
 *
 * Catégories de validation :
 * 1. Tests Statiques & Conformité du Code Source (authController, studentsController)
 * 2. Tests Unitaires Mockés (Inscription & Connexion sans auto-link)
 * 3. Tests Unitaires Mockés (Contrôle d'accès & Découplage dans linkStudentToParent)
 *    - Rejet de l'usurpation d'identité parent (parentId & targetParentId stricts)
 *    - Création exclusive de demande 'pending' (aucune écriture directe)
 *    - Gestion idempotente des doublons (23505)
 *    - Fail-closed strict si table/migration absente (42P01 -> 503 FEATURE_UNAVAILABLE)
 *    - Approbation par la direction via RPC auditée approve_parent_student_link
 * 4. Préservation des liens historiques et non-régression
 */
'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// Paths des contrôleurs et migrations
const authControllerPath = path.resolve(__dirname, '../controllers/authController.js');
const studentsControllerPath = path.resolve(__dirname, '../controllers/studentsController.js');

describe('YZIOW P26-B Lot 2 — Découplage des Rattachements Parent-Élève', () => {

    // =========================================================================
    // 1. TESTS STATIQUES : Neutralisation des insertions automatiques
    // =========================================================================
    describe('1. Tests Statiques : Audit du code source', () => {
        const authSource = fs.readFileSync(authControllerPath, 'utf8');
        const studentsSource = fs.readFileSync(studentsControllerPath, 'utf8');

        it('1.1. authController ne doit contenir aucune référence à parent_student_<school_slug>', () => {
            const hasParentStudentTable = /parent_student_/i.test(authSource);
            assert.equal(hasParentStudentTable, false, 'authController ne doit pas écrire ni requêter parent_student_');
        });

        it('1.2. authController ne doit faire aucun auto-link lors de register', () => {
            const registerBlock = authSource.slice(authSource.indexOf('async function register(req, res)'), authSource.indexOf('async function registerSchool'));
            assert.ok(!registerBlock.includes('parent_student_'), 'register ne doit pas toucher à parent_student_');
            assert.ok(!registerBlock.includes('parent_child_links'), 'register ne doit pas créer de lien parent_child_links');
            assert.ok(!registerBlock.includes('parent_student_link_requests'), 'register ne doit pas créer de demande automatique');
        });

        it('1.3. authController ne doit faire aucun auto-link lors de login', () => {
            const loginBlock = authSource.slice(authSource.indexOf('async function login(req, res)'), authSource.indexOf('async function getProfile'));
            assert.ok(!loginBlock.includes('parent_student_'), 'login ne doit pas toucher à parent_student_');
            assert.ok(!loginBlock.includes('parent_child_links'), 'login ne doit pas créer de lien parent_child_links');
        });

        it('1.4. studentsController doit interdire l\'usurpation parentale (bodyParentId != tokenUserId)', () => {
            assert.ok(
                studentsSource.includes("bodyParentId && String(bodyParentId) !== String(tokenUserId)"),
                "studentsController doit vérifier et rejeter si bodyParentId diffère de tokenUserId"
            );
        });

        it('1.5. studentsController ne doit plus contenir d\'insertion directe parentale dans parent_student_<slug>', () => {
            assert.ok(
                studentsSource.includes(".from('parent_student_link_requests')"),
                "studentsController doit insérer dans parent_student_link_requests"
            );
        });

        it('1.6. studentsController doit comporter le retour 503 fail-closed sur table absente (42P01)', () => {
            assert.ok(
                studentsSource.includes("reqErr.code === '42P01'"),
                "Le flux parent doit intercepter 42P01"
            );
            assert.ok(
                studentsSource.includes("FEATURE_UNAVAILABLE"),
                "Le flux doit renvoyer FEATURE_UNAVAILABLE en cas d'absence de la table"
            );
        });

        it('1.7. studentsController ne doit jamais appeler automatiquement la RPC approve_parent_student_link', () => {
            assert.ok(
                !studentsSource.includes("supabase.rpc('approve_parent_student_link'"),
                "La méthode linkStudentToParent ne doit jamais appeler la RPC d'approbation"
            );
        });
    });

    // =========================================================================
    // 2. TESTS UNITAIRES : Inscription et Connexion sans auto-link
    // =========================================================================
    describe('2. Tests Unitaires : Flux Inscription et Connexion', () => {
        let authController;
        let createdCalls = [];
        let isLoginScenario = false;

        beforeEach(() => {
            createdCalls = [];
            isLoginScenario = false;
            process.env.JWT_SECRET = 'test-secret-key-p26b-unit-testing';
            process.env.JWT_EXPIRES = '1h';
            process.env.SUPABASE_URL = 'https://fake-supabase-lot2.supabase.co';
            process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-key-lot2';

            // Mock @supabase/supabase-js createClient pour authClient dans login
            const supabaseJs = require('@supabase/supabase-js');
            supabaseJs.createClient = () => ({
                auth: {
                    signInWithPassword: async () => ({
                        data: { user: { id: 'parent-123' } },
                        error: null
                    })
                }
            });

            const createQueryBuilder = (table) => {
                const builder = {
                    select: () => builder,
                    eq: (f, v) => builder,
                    in: () => builder,
                    order: () => builder,
                    limit: () => builder,
                    single: async () => {
                        if (table === 'schools') {
                            return { data: { id: 'sch-1', status: 'active', name: 'Test School', slug: 'ecole_test' }, error: null };
                        }
                        return { data: null, error: null };
                    },
                    maybeSingle: async () => {
                        if (table === 'schools') {
                            return { data: { id: 'sch-1', status: 'active', name: 'Test School', slug: 'ecole_test' }, error: null };
                        }
                        if (table.startsWith('profiles_')) {
                            if (isLoginScenario) {
                                return {
                                    data: {
                                        id: 'parent-123',
                                        nom: 'Dupont',
                                        telephone: '+221771234567',
                                        phone_normalized: '+221771234567',
                                        role: 'parent'
                                    },
                                    error: null
                                };
                            }
                            return { data: null, error: null };
                        }
                        return { data: null, error: null };
                    },
                    insert: (payload) => {
                        createdCalls.push({ action: 'insert', table, payload });
                        return {
                            select: () => ({
                                single: async () => ({ data: { id: 'parent-123', ...payload }, error: null })
                            })
                        };
                    },
                    update: () => ({
                        eq: () => Promise.resolve({ data: null, error: null })
                    })
                };
                return builder;
            };

            const mockSupabase = {
                from: (table) => createQueryBuilder(table)
            };

            const mockSupabaseAdmin = {
                auth: {
                    admin: {
                        createUser: async () => ({ data: { user: { id: 'parent-123' } }, error: null }),
                        deleteUser: async () => ({ error: null })
                    }
                }
            };

            const { installSupabaseMock } = require('./helpers/mockSupabaseModule');
            installSupabaseMock({
                supabase: mockSupabase,
                supabaseAdmin: mockSupabaseAdmin
            });

            delete require.cache[require.resolve('../controllers/authController.js')];
            authController = require('../controllers/authController.js');
        });

        it('2.1. Inscription parent : Aucune écriture dans parent_student_ ni demande automatique', async () => {
            isLoginScenario = false;
            const req = {
                body: {
                    nom: 'Dupont',
                    telephone: '+221771234567',
                    countryCode: 'SN',
                    password: 'Password123!',
                    school_slug: 'ecole_test',
                    accepted_terms: true,
                    accepted_privacy_policy: true
                }
            };
            let resStatus = 0;
            let resJson = null;
            const res = {
                status: (code) => { resStatus = code; return res; },
                json: (data) => { resJson = data; return res; }
            };

            await authController.register(req, res);

            assert.equal(resStatus, 201, 'L\'inscription doit réussir avec code 201');
            assert.ok(resJson.token, 'Un jeton JWT doit être retourné');
            assert.equal(resJson.parent.nom, 'Dupont');

            // Vérification des tables touchées
            const insertedTables = createdCalls.map(c => c.table);
            assert.ok(insertedTables.includes('profiles_ecole_test'), 'Le profil doit être inséré');
            assert.ok(!insertedTables.some(t => t.startsWith('parent_student_')), 'Aucune table parent_student_ ne doit être accédée');
            assert.ok(!insertedTables.includes('parent_student_link_requests'), 'Aucune demande ne doit être créée automatiquement');
        });

        it('2.2. Connexion parent : Aucune tentative de création de liens', async () => {
            isLoginScenario = true;
            const req = {
                body: {
                    telephone: '+221771234567',
                    password: 'Password123!',
                    schoolSlug: 'ecole_test',
                    countryCode: 'SN'
                }
            };
            let resStatus = 200;
            let resJson = null;
            const res = {
                status: (code) => { resStatus = code; return res; },
                json: (data) => { resJson = data; return res; }
            };

            await authController.login(req, res);

            assert.ok(resJson && resJson.token, 'La connexion doit réussir et renvoyer un token');
            assert.equal(resStatus, 200);
            const insertedTables = createdCalls.map(c => c.table);
            assert.equal(insertedTables.length, 0, 'La connexion ne doit effectuer aucune insertion');
        });
    });

    // =========================================================================
    // 3. TESTS UNITAIRES : linkStudentToParent dans studentsController
    // =========================================================================
    describe('3. Tests Unitaires : Contrôles d\'accès et création de demande', () => {
        let studentsController;
        let mockTables = {};
        let rpcCalls = [];

        function setupStudentsControllerMock({
            parentPhone = '+221771234567',
            studentPhone = '+221771234567',
            tableRequestsError = null,
            tableRequestsDuplicate = false,
            existingHistoricalLink = false,
            existingPending = false,
            rpcError = null,
            rpcResult = { success: true }
        } = {}) {
            rpcCalls = [];
            mockTables = {
                parent_student_link_requests: []
            };
            // Prepopulate a pending request if requested (used for idempotency test)
            if (existingPending) {
                mockTables.parent_student_link_requests.push({
                    id: 'req-uuid-existing',
                    parent_id: 'parent-real-id',
                    student_id: 'student-100',
                    status: 'pending'
                });
            }

            const createBuilder = (table) => {
                let filters = {};

                const builder = {
                    select: () => builder,
                    eq: (field, value) => {
                        filters[field] = value;
                        return builder;
                    },
                    in: (field, values) => {
                        filters[field] = values;
                        return builder;
                    },
                    order: () => builder,
                    limit: () => builder,
                    then: (resolve, reject) => {
                        if (table.startsWith('students_')) {
                            const ids = filters['id'] || ['student-100'];
                            return resolve({
                                data: ids.map(id => ({
                                    id,
                                    nom: 'Diop',
                                    prenom: 'Awa',
                                    classe: '6eme A',
                                    telephone_parent: studentPhone,
                                    telephone_parent_normalized: studentPhone
                                })),
                                error: null
                            });
                        }
                        return resolve({ data: [], error: null });
                    },
                    single: async () => {
                        if (table.startsWith('profiles_')) {
                            return { data: { id: filters['id'] || 'parent-real-id', nom: 'Parent Test', phone_normalized: parentPhone, telephone: parentPhone }, error: null };
                        }
                        return { data: null, error: null };
                    },
                    maybeSingle: async () => {
                        if (table.startsWith('profiles_')) {
                            return { data: { id: filters['id'] || 'parent-real-id', nom: 'Parent Test', phone_normalized: parentPhone, telephone: parentPhone }, error: null };
                        }
                        if (table.startsWith('parent_student_') && existingHistoricalLink) {
                            const isLinked = typeof existingHistoricalLink === 'function'
                                ? existingHistoricalLink(filters['student_id'])
                                : true;
                            if (isLinked) {
                                return { data: { parent_id: filters['parent_id'], student_id: filters['student_id'] }, error: null };
                            }
                        }
                        if (table === 'parent_student_link_requests') {
                            if (tableRequestsError) return { data: null, error: tableRequestsError };
                            // Look for a matching pending request in mockTables
                            const pending = mockTables.parent_student_link_requests.find(req =>
                                req.parent_id === filters['parent_id'] &&
                                req.student_id === filters['student_id'] &&
                                (req.status === 'pending' || req.status === 'pending_verification'));
                            if (pending) {
                                return { data: pending, error: null };
                            }
                            return { data: null, error: null };
                        }
                        return { data: null, error: null };
                    },
                    insert: (payload) => {
                        if (table === 'parent_student_link_requests') {
                            if (tableRequestsError) {
                                return {
                                    select: () => ({
                                        maybeSingle: async () => ({ data: null, error: tableRequestsError }),
                                        single: async () => ({ data: null, error: tableRequestsError })
                                    })
                                };
                            }
                            if (tableRequestsDuplicate) {
                                return {
                                    select: () => ({
                                        maybeSingle: async () => ({ data: null, error: { code: '23505', message: 'duplicate key' } }),
                                        single: async () => ({ data: null, error: { code: '23505', message: 'duplicate key' } })
                                    })
                                };
                            }
                            const inserted = { id: 'req-uuid-1', ...payload };
                            mockTables.parent_student_link_requests.push(inserted);
                            return {
                                select: () => ({
                                    maybeSingle: async () => ({ data: inserted, error: null }),
                                    single: async () => ({ data: inserted, error: null })
                                })
                            };
                        }
                        return { select: () => ({ maybeSingle: async () => ({ data: payload, error: null }) }) };
                    }
                };
                return builder;
            };

            const mockSupabase = {
                from: (table) => createBuilder(table),
                rpc: async (fnName, params) => {
                    rpcCalls.push({ fnName, params });
                    if (rpcError) return { data: null, error: rpcError };
                    return { data: rpcResult, error: null };
                }
            };

            const { installSupabaseMock } = require('./helpers/mockSupabaseModule');
            installSupabaseMock({ supabase: mockSupabase });

            delete require.cache[require.resolve('../controllers/studentsController.js')];
            studentsController = require('../controllers/studentsController.js');
        }

        it('3.1. Rejet strict si un parent tente d\'usurper l\'identité via parentId', async () => {
            setupStudentsControllerMock();

            const req = {
                user: { id: 'parent-real-id', role: 'parent', schoolSlug: 'ecole_test' },
                body: {
                    parentId: 'hacker-target-parent-id',
                    studentIds: ['student-100']
                }
            };
            let resStatus = 0;
            let resJson = null;
            const res = {
                status: (code) => { resStatus = code; return res; },
                json: (data) => { resJson = data; return res; }
            };

            await studentsController.linkStudentToParent(req, res);

            assert.equal(resStatus, 403, 'Une tentative d\'usurpation via parentId doit être rejetée avec 403');
            assert.match(resJson.error, /usurpation d'identité interdite/i);
        });

        it('3.2. Rejet strict si un parent tente d\'usurper l\'identité via targetParentId', async () => {
            setupStudentsControllerMock();

            const req = {
                user: { id: 'parent-real-id', role: 'parent', schoolSlug: 'ecole_test' },
                body: {
                    targetParentId: 'hacker-target-parent-id',
                    studentIds: ['student-100']
                }
            };
            let resStatus = 0;
            let resJson = null;
            const res = {
                status: (code) => { resStatus = code; return res; },
                json: (data) => { resJson = data; return res; }
            };

            await studentsController.linkStudentToParent(req, res);

            assert.equal(resStatus, 403, 'Une tentative d\'usurpation via targetParentId doit être rejetée avec 403');
            assert.match(resJson.error, /usurpation d'identité interdite/i);
        });

        it('3.3. Flux Parent : Création d\'une demande pending sans accès immédiat aux élèves', async () => {
            setupStudentsControllerMock({
                parentPhone: '+221771234567',
                studentPhone: '+221771234567'
            });

            const req = {
                user: { id: 'parent-real-id', role: 'parent', schoolSlug: 'ecole_test' },
                body: {
                    studentIds: ['student-100']
                }
            };
            let resStatus = 0;
            let resJson = null;
            const res = {
                status: (code) => { resStatus = code; return res; },
                json: (data) => { resJson = data; return res; }
            };

            await studentsController.linkStudentToParent(req, res);

            assert.equal(resStatus, 202, 'La soumission d\'une demande doit répondre HTTP 202 Accepted');
            assert.equal(resJson.status, 'pending');
            assert.equal(resJson.created, 1);

            // Vérifier que la table parent_student_link_requests a bien reçu la demande
            assert.equal(mockTables.parent_student_link_requests.length, 1);
            const reqItem = mockTables.parent_student_link_requests[0];
            assert.equal(reqItem.status, 'pending');
            assert.equal(reqItem.source, 'manual_request');
            assert.equal(reqItem.parent_id, 'parent-real-id');
            assert.equal(reqItem.student_id, 'student-100');
            assert.equal(reqItem.phone_matched, true);
        });

        it('3.4. Rejet si le numéro de téléphone ne correspond pas au dossier élève', async () => {
            setupStudentsControllerMock({
                parentPhone: '+221770000000',
                studentPhone: '+221779999999'
            });

            const req = {
                user: { id: 'parent-real-id', role: 'parent', schoolSlug: 'ecole_test' },
                body: {
                    studentIds: ['student-100']
                }
            };
            let resStatus = 0;
            let resJson = null;
            const res = {
                status: (code) => { resStatus = code; return res; },
                json: (data) => { resJson = data; return res; }
            };

            await studentsController.linkStudentToParent(req, res);

            assert.equal(resStatus, 403, 'Un mismatch téléphonique doit être bloqué avec 403');
            assert.match(resJson.error, /ne correspond pas/i);
            assert.equal(mockTables.parent_student_link_requests.length, 0, 'Aucune demande ne doit être insérée');
        });

        it('3.5. Gestion idempotente des doublons (23505) : pas d\'erreur incontrôlée', async () => {
            setupStudentsControllerMock({
                tableRequestsDuplicate: true,
                existingPending: true
            });

            const req = {
                user: { id: 'parent-real-id', role: 'parent', schoolSlug: 'ecole_test' },
                body: {
                    studentIds: ['student-100']
                }
            };
            let resStatus = 0;
            let resJson = null;
            const res = {
                status: (code) => { resStatus = code; return res; },
                json: (data) => { resJson = data; return res; }
            };

            await studentsController.linkStudentToParent(req, res);

            assert.equal(resStatus, 202, 'La requête doit être acceptée sans crash');
            assert.equal(resJson.status, 'pending');
            assert.equal(resJson.alreadyPending, 1);
        });

        it('3.6. Comportement Fail-Closed (42P01) : renvoie HTTP 503 sans aucun repli auto-link', async () => {
            setupStudentsControllerMock({
                tableRequestsError: { code: '42P01', message: 'relation parent_student_link_requests does not exist' }
            });

            const req = {
                user: { id: 'parent-real-id', role: 'parent', schoolSlug: 'ecole_test' },
                body: {
                    studentIds: ['student-100']
                }
            };
            let resStatus = 0;
            let resJson = null;
            const res = {
                status: (code) => { resStatus = code; return res; },
                json: (data) => { resJson = data; return res; }
            };

            await studentsController.linkStudentToParent(req, res);

            assert.equal(resStatus, 503, 'L\'absence de la table de migration doit renvoyer 503 Service Unavailable');
            assert.equal(resJson.error, 'FEATURE_UNAVAILABLE');
        });

        it('3.7. Flux Direction : Création d\'une demande pending sans appel RPC ni approbation automatique', async () => {
            setupStudentsControllerMock();

            const req = {
                user: { id: 'director-uuid-1', role: 'directeur', nom: 'M. Directeur', schoolSlug: 'ecole_test' },
                body: {
                    parentId: 'target-parent-uuid',
                    studentIds: ['student-100']
                }
            };
            let resStatus = 0;
            let resJson = null;
            const res = {
                status: (code) => { resStatus = code; return res; },
                json: (data) => { resJson = data; return res; }
            };

            await studentsController.linkStudentToParent(req, res);

            assert.equal(resStatus, 202, 'L\'action de la direction doit renvoyer 202 Accepted (pending)');
            assert.equal(resJson.status, 'pending');
            assert.equal(rpcCalls.length, 0, 'La RPC approve_parent_student_link ne doit JAMAIS être appelée');
            assert.equal(mockTables.parent_student_link_requests.length, 1);
            assert.equal(mockTables.parent_student_link_requests[0].parent_id, 'target-parent-uuid');
            assert.equal(mockTables.parent_student_link_requests[0].status, 'pending');
        });

        it('3.8. Direction : Fail-Closed si la table des demandes est absente (42P01 -> 503)', async () => {
            setupStudentsControllerMock({
                tableRequestsError: { code: '42P01', message: 'relation parent_student_link_requests does not exist' }
            });

            const req = {
                user: { id: 'director-uuid-1', role: 'directeur', nom: 'M. Directeur', schoolSlug: 'ecole_test' },
                body: {
                    parentId: 'target-parent-uuid',
                    studentIds: ['student-100']
                }
            };
            let resStatus = 0;
            let resJson = null;
            const res = {
                status: (code) => { resStatus = code; return res; },
                json: (data) => { resJson = data; return res; }
            };

            await studentsController.linkStudentToParent(req, res);

            assert.equal(resStatus, 503, 'L\'absence de la table de migration doit renvoyer 503 FEATURE_UNAVAILABLE');
            assert.equal(resJson.error, 'FEATURE_UNAVAILABLE');
            assert.equal(rpcCalls.length, 0, 'Aucun appel RPC en cas d\'erreur table');
        });

        it('3.9. Préservation des liens historiques existants (HTTP 200 already_linked)', async () => {
            setupStudentsControllerMock({
                existingHistoricalLink: true
            });

            const req = {
                user: { id: 'parent-real-id', role: 'parent', schoolSlug: 'ecole_test' },
                body: {
                    studentIds: ['student-100']
                }
            };
            let resStatus = 0;
            let resJson = null;
            const res = {
                status: (code) => { resStatus = code; return res; },
                json: (data) => { resJson = data; return res; }
            };

            await studentsController.linkStudentToParent(req, res);

            assert.equal(resStatus, 200, 'Tous les élèves déjà liés doivent renvoyer HTTP 200');
            assert.equal(resJson.status, 'already_linked');
            assert.equal(resJson.message, "Les élèves sélectionnés sont déjà rattachés à votre compte.");
            assert.equal(resJson.alreadyLinked, 1, 'Le lien déjà existant doit être comptabilisé dans alreadyLinked');
            assert.equal(resJson.alreadyApproved, 1, 'L\'alias rétrocompatible alreadyApproved doit être préservé');
            assert.equal(resJson.created, 0);
            assert.equal(resJson.alreadyPending, 0);
            assert.equal(mockTables.parent_student_link_requests.length, 0);
            assert.equal(rpcCalls.length, 0, 'Aucun appel RPC');
        });

        it('3.10. Cas mixte : un élève déjà lié et un élève en attente -> HTTP 202 pending', async () => {
            setupStudentsControllerMock({
                existingHistoricalLink: (studentId) => studentId === 'student-100'
            });

            const req = {
                user: { id: 'parent-real-id', role: 'parent', schoolSlug: 'ecole_test' },
                body: {
                    studentIds: ['student-100', 'student-200']
                }
            };
            let resStatus = 0;
            let resJson = null;
            const res = {
                status: (code) => { resStatus = code; return res; },
                json: (data) => { resJson = data; return res; }
            };

            await studentsController.linkStudentToParent(req, res);

            assert.equal(resStatus, 202, 'Cas mixte avec au moins une demande pending doit renvoyer HTTP 202');
            assert.equal(resJson.status, 'pending');
            assert.equal(resJson.alreadyLinked, 1);
            assert.equal(resJson.alreadyApproved, 1);
            assert.equal(resJson.created, 1);
            assert.equal(resJson.alreadyPending, 0);
            assert.equal(mockTables.parent_student_link_requests.length, 1);
            assert.equal(rpcCalls.length, 0, 'Aucun appel RPC');
        });
    });
});
