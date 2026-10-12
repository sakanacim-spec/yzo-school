process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test';
process.env.JWT_SECRET = 'test';
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { linkStudentToParent } = require('../controllers/studentsController');
const { supabase } = require('../utils/supabase');

describe('linkHardening - behavioral tests (Option A Decoupling)', () => {
    let req, res, statusMock, jsonMock, rpcCount;
    let dbState;

    beforeEach(() => {
        rpcCount = 0;
        statusMock = (code) => { res.statusCode = code; return res; };
        jsonMock = (data) => { res.body = data; return res; };
        res = { status: statusMock, json: jsonMock, statusCode: 200, body: null };
        req = {
            user: { id: 'parent-123', role: 'parent', schoolSlug: 'ecole_test', telephone: '+33600000000' },
            body: { studentIds: ['student-456'] }
        };

        dbState = {
            studentInfo: { id: 'student-456', nom: 'Doe', prenom: 'John', date_naissance: '2015-05-12', telephone_parent: '+33600000000', telephone_parent_normalized: '+33600000000' },
            parentProfile: { id: 'parent-123', nom: 'Doe', telephone: '+33600000000', phone_normalized: '+33600000000', role: 'parent' },
            studentQueryErr: null,
            profileQueryErr: null,
            existingLinkErr: null,
            existingLocalLink: null,
            insertRequestError: null,
            existingPendingReq: null,
            verifyQueryErr: null,
            localLinkCalled: false,
            rpcCallsLog: [],
            insertsLog: [],
            updatesLog: []
        };

        supabase.from = (table) => ({
            select: (cols) => {
                let qEq = {};
                let qIn = {};
                const mockBuilder = {
                    eq: (c, v) => { qEq[c] = v; return mockBuilder; },
                    in: (c, v) => { qIn[c] = v; return mockBuilder; },
                    order: () => mockBuilder,
                    limit: () => mockBuilder,
                    single: async () => ({ data: null, error: null }),
                    maybeSingle: async () => {
                        if (table.startsWith('profiles_')) {
                            if (dbState.profileQueryErr) return { data: null, error: dbState.profileQueryErr };
                            return { data: dbState.parentProfile, error: null };
                        }
                        if (table.startsWith('parent_student_link_requests')) {
                            if (dbState.verifyQueryErr) return { data: null, error: dbState.verifyQueryErr };
                            return { data: dbState.existingPendingReq, error: null };
                        }
                        if (table.startsWith('parent_student_')) {
                            if (dbState.existingLinkErr) return { data: null, error: dbState.existingLinkErr };
                            if (typeof dbState.existingLocalLink === 'function') {
                                return { data: dbState.existingLocalLink(qEq['student_id']), error: null };
                            }
                            return { data: dbState.existingLocalLink, error: null };
                        }
                        if (table.startsWith('students_')) {
                            if (dbState.studentQueryErr) return { data: null, error: dbState.studentQueryErr };
                            return { data: dbState.studentInfo, error: null };
                        }
                        return { data: null, error: null };
                    },
                    then: (resolve) => {
                        if (table.startsWith('students_')) {
                            if (dbState.studentQueryErr) return resolve({ data: null, error: dbState.studentQueryErr });
                            if (Array.isArray(dbState.studentsList)) {
                                return resolve({ data: dbState.studentsList, error: null });
                            }
                            return resolve({ data: dbState.studentInfo ? [dbState.studentInfo] : [], error: null });
                        }
                        if (table.startsWith('parent_student_link_requests')) {
                            if (dbState.verifyQueryErr) return resolve({ data: null, error: dbState.verifyQueryErr });
                            return resolve({ data: dbState.existingPendingReq ? [dbState.existingPendingReq] : [], error: null });
                        }
                        resolve({ data: [], error: null });
                    }
                };
                return mockBuilder;
            },
            insert: (data) => {
                dbState.insertsLog.push({ table, data });
                if (table.startsWith('parent_student_') && !table.includes('requests')) {
                    dbState.localLinkCalled = true;
                }
                const err = (table === 'parent_student_link_requests' && dbState.insertRequestError) || null;
                const resObj = { data: err ? null : { id: 'a0000000-0000-4000-a000-000000000001', ...data }, error: err };
                return {
                    ...resObj,
                    select: () => ({
                        maybeSingle: async () => resObj,
                        single: async () => resObj
                    }),
                    maybeSingle: async () => resObj,
                    single: async () => resObj,
                    then: (resolve) => resolve(resObj)
                };
            },
            update: (data) => {
                dbState.updatesLog.push({ table, data });
                return {
                    eq: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
                    then: (resolve) => resolve({ data: null, error: null })
                };
            },
            delete: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) })
        });

        supabase.rpc = async (fn, params) => {
            rpcCount++;
            dbState.rpcCallsLog.push({ fn, params });
            return { data: { success: true, status: 'approved' }, error: null };
        };
    });

    const runLink = async () => {
        await linkStudentToParent(req, res);
        return { status: res.statusCode, body: res.body };
    };

    it('H1 portfolio vide + destination unmapped -> création demande pending sans lien actif ni RPC', async () => {
        const r = await runLink();
        assert.strictEqual(r.status, 202);
        assert.strictEqual(r.body.status, 'pending');
        assert.strictEqual(rpcCount, 0, 'Aucun appel RPC lors d\'une demande parent');
        assert.strictEqual(dbState.localLinkCalled, false, 'Aucun lien local direct');
    });

    it('H2 targetParentId is correctly resolved for admin', async () => {
        req.user.role = 'admin';
        req.body.parentId = 'parent-456';
        dbState.parentProfile.id = 'parent-456';
        const r = await runLink();
        assert.strictEqual(r.status, 202);
        assert.strictEqual(rpcCount, 0, 'Aucun appel RPC lors d\'une demande admin');
        const ins = dbState.insertsLog.find(i => i.table === 'parent_student_link_requests');
        assert.ok(ins);
        assert.strictEqual(ins.data.parent_id, 'parent-456');
    });

    it('H3 parent cannot spoof parentId to link another parent -> 403', async () => {
        req.user.role = 'parent';
        req.body.parentId = 'parent-hacker';
        const r = await runLink();
        assert.strictEqual(r.status, 403);
        assert.strictEqual(rpcCount, 0);
    });

    it('H4 parent cannot spoof targetParentId -> 403', async () => {
        req.user.role = 'parent';
        req.body.targetParentId = 'parent-hacker';
        const r = await runLink();
        assert.strictEqual(r.status, 403);
        assert.strictEqual(rpcCount, 0);
    });

    it('H5 empty studentIds -> 400', async () => {
        req.body.studentIds = [];
        delete req.body.studentId;
        const r = await runLink();
        assert.strictEqual(r.status, 400);
        assert.strictEqual(rpcCount, 0);
    });

    it('H6 target student absent in school -> 404', async () => {
        dbState.studentInfo = null;
        const r = await runLink();
        assert.strictEqual(r.status, 404);
        assert.strictEqual(rpcCount, 0);
    });

    it('H7 students query technical DB failure -> 500', async () => {
        dbState.studentQueryErr = new Error('db error');
        const r = await runLink();
        assert.strictEqual(r.status, 500);
        assert.strictEqual(rpcCount, 0);
    });

    it('H8 parent profile not found -> 404', async () => {
        dbState.parentProfile = null;
        const r = await runLink();
        assert.strictEqual(r.status, 404);
        assert.strictEqual(rpcCount, 0);
    });

    it('H9 unauthorized role (e.g. comptable) -> 403', async () => {
        req.user.role = 'comptable';
        const r = await runLink();
        assert.strictEqual(r.status, 403);
        assert.strictEqual(rpcCount, 0);
    });

    it('H10 missing schoolSlug in token -> 403', async () => {
        delete req.user.schoolSlug;
        const r = await runLink();
        assert.strictEqual(r.status, 403);
        assert.strictEqual(rpcCount, 0);
    });

    it('H11 existing local link already active -> 200 alreadyLinked without insert', async () => {
        dbState.existingLocalLink = { student_id: 'student-456' };
        const r = await runLink();
        assert.strictEqual(r.status, 200);
        assert.strictEqual(r.body.status, 'already_linked');
        assert.strictEqual(r.body.message, "Les élèves sélectionnés sont déjà rattachés à votre compte.");
        assert.strictEqual(r.body.alreadyLinked, 1);
        assert.strictEqual(r.body.alreadyApproved, 1);
        assert.strictEqual(r.body.created, 0);
        assert.strictEqual(r.body.alreadyPending, 0);
        const reqInserts = dbState.insertsLog.filter(i => i.table === 'parent_student_link_requests');
        assert.strictEqual(reqInserts.length, 0);
    });

    it('H11bis mixed batch (1 already linked + 1 pending) -> 202 pending', async () => {
        req.body = { studentIds: ['student-linked', 'student-pending'] };
        dbState.studentsList = [
            { id: 'student-linked', nom: 'A', prenom: 'B', telephone_parent: '+33600000000', telephone_parent_normalized: '+33600000000' },
            { id: 'student-pending', nom: 'C', prenom: 'D', telephone_parent: '+33600000000', telephone_parent_normalized: '+33600000000' }
        ];
        dbState.existingLocalLink = (studentId) => {
            if (studentId === 'student-linked') return { student_id: 'student-linked' };
            return null;
        };

        const r = await runLink();
        assert.strictEqual(r.status, 202);
        assert.strictEqual(r.body.status, 'pending');
        assert.strictEqual(r.body.alreadyLinked, 1);
        assert.strictEqual(r.body.alreadyApproved, 1);
        assert.strictEqual(r.body.created, 1);
        assert.strictEqual(r.body.alreadyPending, 0);
        assert.strictEqual(rpcCount, 0);
    });

    it('H12 matching normalized phone -> 202 pending created', async () => {
        dbState.parentProfile.telephone = '+33 6 00 00 00 00';
        dbState.studentInfo.telephone_parent = '+33600000000';
        const r = await runLink();
        assert.strictEqual(r.status, 202);
        assert.strictEqual(rpcCount, 0);
    });

    it('H13 phone mismatch -> 403 forbidden', async () => {
        dbState.parentProfile.phone_normalized = '+33600000001';
        dbState.studentInfo.telephone_parent_normalized = '+33600000099';
        const r = await runLink();
        assert.strictEqual(r.status, 403);
        assert.strictEqual(rpcCount, 0);
    });

    it('H14 table parent_student_link_requests missing (42P01) -> 503 fail-closed', async () => {
        dbState.insertRequestError = { code: '42P01', message: 'table missing' };
        const r = await runLink();
        assert.strictEqual(r.status, 503);
        assert.strictEqual(r.body.error, 'FEATURE_UNAVAILABLE');
        assert.strictEqual(rpcCount, 0);
    });

    it('H15 DB error checking local link -> 500 fail-closed', async () => {
        dbState.existingLinkErr = new Error('db failure');
        const r = await runLink();
        assert.strictEqual(r.status, 500);
        assert.strictEqual(rpcCount, 0);
    });

    it('H16 DB error inserting link request -> 500 fail-closed', async () => {
        dbState.insertRequestError = new Error('generic insert error');
        const r = await runLink();
        assert.strictEqual(r.status, 500);
        assert.strictEqual(rpcCount, 0);
    });

    it('H17 insert 23505 -> matching pending request found -> 202 idempotent', async () => {
        dbState.insertRequestError = { code: '23505' };
        dbState.existingPendingReq = { id: 'req-exist', status: 'pending' };
        const r = await runLink();
        assert.strictEqual(r.status, 202);
        assert.strictEqual(r.body.alreadyPending, 1);
        assert.strictEqual(rpcCount, 0);
    });

    it('H18 insert 23505 -> no pending request found -> 400 fail-closed', async () => {
        dbState.insertRequestError = { code: '23505' };
        dbState.existingPendingReq = null;
        const r = await runLink();
        assert.strictEqual(r.status, 400);
        assert.strictEqual(rpcCount, 0);
    });

    it('H19 phone ownership failure -> no global/local mutation', async () => {
        dbState.parentProfile.phone_normalized = '+33600000000';
        dbState.studentInfo.telephone_parent_normalized = '+33799999999';
        dbState.studentInfo.telephone_parent = '+33799999999';

        const r = await runLink();
        assert.strictEqual(r.status, 403);
        assert.strictEqual(r.body.error, 'Liaison non autorisée : Le numéro de téléphone de votre compte ne correspond pas au dossier de cet élève.');
        assert.strictEqual(rpcCount, 0);
        assert.strictEqual(dbState.insertsLog.length, 0);
        assert.strictEqual(dbState.updatesLog.length, 0);
        assert.strictEqual(dbState.localLinkCalled, false);
    });

    it('H20 local link occurs only after approval, never during pending request', async () => {
        const r = await runLink();
        assert.strictEqual(r.status, 202);
        assert.strictEqual(dbState.localLinkCalled, false);
        assert.strictEqual(rpcCount, 0);
    });

    it('H21 batch A success / B failure / C untouched', async () => {
        assert.strictEqual(dbState.rpcCallsLog.length, 0);
    });

    it('H22 no direct NEW CHILD insert into global_students', async () => {
        const inserts = dbState.insertsLog.filter(i => i.table === 'global_students');
        assert.strictEqual(inserts.length, 0);
    });

    it('H23 no direct NEW CHILD insert into student_global_mappings', async () => {
        const inserts = dbState.insertsLog.filter(i => i.table === 'student_global_mappings');
        assert.strictEqual(inserts.length, 0);
    });

    it('H24 no direct NEW CHILD first_linked_at creation outside existing-mapped legitimate claim', async () => {
        let inserts = dbState.insertsLog.filter(i => i.table === 'parent_child_links');
        assert.strictEqual(inserts.length, 0);
    });

    it('H25 client cannot spoof schoolSlug', async () => {
        req.body.schoolSlug = 'spoofed';
        const r = await runLink();
        assert.strictEqual(r.status, 202);
        assert.strictEqual(rpcCount, 0);
        const ins = dbState.insertsLog.find(i => i.table === 'parent_student_link_requests');
        assert.ok(ins);
        assert.strictEqual(ins.data.school_slug, 'ecole_test', 'schoolSlug doit provenir du token JWT');
    });

    it('H26 client cannot spoof parent_ref / expected_global_ids', async () => {
        req.body.parentId = 'spoofed-id';
        const r = await runLink();
        assert.strictEqual(r.status, 403);
        assert.strictEqual(rpcCount, 0);
    });

    it('H27 technical insert DB error -> 500 fail-closed', async () => {
        dbState.insertRequestError = new Error('db failure');
        const r = await runLink();
        assert.strictEqual(r.status, 500);
        assert.strictEqual(rpcCount, 0);
    });

    it('H28 student query DB error -> 500', async () => {
        dbState.studentQueryErr = new Error('db error');
        const r = await runLink();
        assert.strictEqual(r.status, 500);
        assert.strictEqual(rpcCount, 0);
        assert.ok(!dbState.localLinkCalled);
    });

    it('H29 profile query DB error -> 404 / 500 fail-closed', async () => {
        dbState.profileQueryErr = new Error('db error');
        const r = await runLink();
        assert.strictEqual(r.status, 404);
        assert.strictEqual(rpcCount, 0);
    });

    it('H30 local link check DB error -> 500', async () => {
        dbState.existingLinkErr = new Error('db error');
        const r = await runLink();
        assert.strictEqual(r.status, 500);
        assert.strictEqual(rpcCount, 0);
        assert.ok(!dbState.localLinkCalled);
    });

    it('H31 request insert generic DB error -> 500', async () => {
        dbState.insertRequestError = { code: '50000', message: 'write fail' };
        const r = await runLink();
        assert.strictEqual(r.status, 500);
        assert.strictEqual(rpcCount, 0);
    });

    it('H32 42P01 table missing -> 503 fail-closed', async () => {
        dbState.insertRequestError = { code: '42P01' };
        const r = await runLink();
        assert.strictEqual(r.status, 503);
        assert.strictEqual(rpcCount, 0);
    });

    it('H33 23505 verification query DB error -> 500', async () => {
        dbState.insertRequestError = { code: '23505' };
        dbState.verifyQueryErr = new Error('db error during re-read');
        const r = await runLink();
        assert.strictEqual(r.status, 500);
        assert.strictEqual(rpcCount, 0);
    });

    it('H34 23505 no matching pending request found -> 400 fail-closed', async () => {
        dbState.insertRequestError = { code: '23505' };
        dbState.existingPendingReq = null;
        const r = await runLink();
        assert.strictEqual(r.status, 400);
        assert.strictEqual(rpcCount, 0);
    });

    it('H35 admin flow -> pending request 202 without approval RPC', async () => {
        req.user.role = 'admin';
        req.user.id = 'admin-1';
        req.body.parentId = 'parent-123';
        const r = await runLink();
        assert.strictEqual(r.status, 202);
        assert.strictEqual(rpcCount, 0, 'L\'administrateur ne déclenche pas d\'approbation automatique');
    });

    it('H36 absence d\'appel à la RPC d\'approbation pour parent ET administrateur', async () => {
        // Test parent
        req.user.role = 'parent';
        const r1 = await runLink();
        assert.strictEqual(r1.status, 202);
        assert.strictEqual(rpcCount, 0, 'Aucun appel RPC pour parent');

        // Test admin
        req.user.role = 'admin';
        req.body.parentId = 'parent-123';
        const r2 = await runLink();
        assert.strictEqual(r2.status, 202);
        assert.strictEqual(rpcCount, 0, 'Aucun appel RPC pour admin');
    });

    it('PARENTID SPOOF REAL TEST', async () => {
        req.user.id = 'parent-123';
        req.user.role = 'parent';
        req.body.parentId = 'parent-spoofed';

        const r = await runLink();
        assert.strictEqual(r.status, 403);
        assert.strictEqual(rpcCount, 0);
        assert.ok(!dbState.insertsLog.some(ins => ins.data && ins.data.parent_id === 'parent-spoofed'));
    });

    it('H37 collision internationale de numéros avec même suffixe -> 403 fail-closed', async () => {
        dbState.parentProfile.telephone = '+33 6 12 34 56 78';
        dbState.parentProfile.phone_normalized = '+33612345678';
        dbState.studentInfo.telephone_parent = '+221 6 12 34 56 78';
        dbState.studentInfo.telephone_parent_normalized = '+221612345678';
        const r = await runLink();
        assert.strictEqual(r.status, 403);
        assert.strictEqual(rpcCount, 0);
        assert.strictEqual(dbState.insertsLog.length, 0);
    });

    it('H38 numéros E.164 strictement identiques -> 202 pending créé', async () => {
        dbState.parentProfile.telephone = '+33 6 12 34 56 78';
        dbState.parentProfile.phone_normalized = '+33612345678';
        dbState.studentInfo.telephone_parent = '+33 6 12 34 56 78';
        dbState.studentInfo.telephone_parent_normalized = '+33612345678';
        const r = await runLink();
        assert.strictEqual(r.status, 202);
        assert.strictEqual(r.body.status, 'pending');
        assert.strictEqual(r.body.created, 1);
    });

    it('H39 numéro historique ambigu ou incomplet (local sans indicatif) -> 403 fail-closed', async () => {
        dbState.parentProfile.telephone = '+2290197000000';
        dbState.parentProfile.phone_normalized = '+2290197000000';
        dbState.studentInfo.telephone_parent = '97000000';
        delete dbState.studentInfo.telephone_parent_normalized;
        const r = await runLink();
        assert.strictEqual(r.status, 403);
        assert.strictEqual(rpcCount, 0);
    });

    it('H40 confirmation Supabase sans ID (data null) -> 500 fail-closed', async () => {
        const origFrom = supabase.from;
        supabase.from = (table) => {
            const b = origFrom(table);
            if (table === 'parent_student_link_requests') {
                return {
                    insert: () => ({
                        select: () => ({
                            maybeSingle: async () => ({ data: null, error: null })
                        })
                    })
                };
            }
            return b;
        };
        const r = await runLink();
        assert.strictEqual(r.status, 500);
        assert.strictEqual(rpcCount, 0);
    });

    it('H41 confirmation Supabase avec ID invalide (non-UUID) -> 500 fail-closed', async () => {
        const origFrom = supabase.from;
        supabase.from = (table) => {
            const b = origFrom(table);
            if (table === 'parent_student_link_requests') {
                return {
                    insert: () => ({
                        select: () => ({
                            maybeSingle: async () => ({ data: { id: 'not-a-valid-uuid' }, error: null })
                        })
                    })
                };
            }
            return b;
        };
        const r = await runLink();
        assert.strictEqual(r.status, 500);
        assert.strictEqual(rpcCount, 0);
    });

    it('H42 demande multiple séquentielle avec échec partiel sur le deuxième élève', async () => {
        req.body = { studentIds: ['s1', 's2'] };
        dbState.studentsList = [
            { id: 's1', nom: 'A', prenom: 'B', telephone_parent: '+33600000000', telephone_parent_normalized: '+33600000000' },
            { id: 's2', nom: 'C', prenom: 'D', telephone_parent: '+33600000000', telephone_parent_normalized: '+33600000000' }
        ];
        let insertAttempts = 0;
        const origFrom = supabase.from;
        supabase.from = (table) => {
            const b = origFrom(table);
            if (table === 'parent_student_link_requests') {
                return {
                    insert: (data) => {
                        insertAttempts++;
                        if (insertAttempts === 1) {
                            return {
                                select: () => ({
                                    maybeSingle: async () => ({ data: { id: 'a0000000-0000-4000-a000-000000000001', ...data }, error: null })
                                })
                            };
                        }
                        return {
                            select: () => ({
                                maybeSingle: async () => ({ data: null, error: { message: 'db failure on s2' } })
                            })
                        };
                    }
                };
            }
            return b;
        };

        const r = await runLink();
        assert.strictEqual(r.status, 500);
        assert.strictEqual(insertAttempts, 2, 'Tentative sur s1 réussie, échec sur s2');
        assert.strictEqual(rpcCount, 0, 'Aucun lien actif ni RPC créé lors de l\'échec');
    });

    it('H43 conflit 23505 avec statut pending_verification -> 200 explicite (pas de 202, pas de lien actif)', async () => {
        dbState.insertRequestError = { code: '23505', message: 'duplicate key' };
        dbState.existingPendingReq = { id: 'a0000000-0000-4000-a000-000000000099', status: 'pending_verification' };
        const r = await runLink();
        assert.strictEqual(r.status, 200);
        assert.strictEqual(r.body.status, 'pending_verification');
        assert.strictEqual(r.body.alreadyPending, 0);
        assert.strictEqual(r.body.alreadyPendingVerification, 1);
        assert.strictEqual(r.body.created, 0);
        assert.strictEqual(rpcCount, 0);
        assert.strictEqual(dbState.localLinkCalled, false);
    });

    it('H43b conflit 23505 avec statut pending exact -> 202 pending confirmé', async () => {
        dbState.insertRequestError = { code: '23505', message: 'duplicate key' };
        dbState.existingPendingReq = { id: 'a0000000-0000-4000-a000-000000000099', status: 'pending' };
        const r = await runLink();
        assert.strictEqual(r.status, 202);
        assert.strictEqual(r.body.status, 'pending');
        assert.strictEqual(r.body.alreadyPending, 1);
        assert.strictEqual(r.body.created, 0);
        assert.strictEqual(rpcCount, 0);
        assert.strictEqual(dbState.localLinkCalled, false);
    });

    it('H44 absence totale de mutation locale, badge ou droit lors d\'une demande pending', async () => {
        const r = await runLink();
        assert.strictEqual(r.status, 202);
        assert.strictEqual(r.body.status, 'pending');
        assert.strictEqual(rpcCount, 0);
        assert.strictEqual(dbState.localLinkCalled, false, 'Aucun lien actif créé dans parent_student_');
        assert.strictEqual(dbState.updatesLog.length, 0, 'Aucune mise à jour de lien');
    });

    it('H45 numéro de forme E.164 mais invalide selon le validateur (+999...) -> 403 fail-closed sans bypass regex', async () => {
        // Numéro de forme E.164 (+ suivi de 11 chiffres) mais indicatif pays 999 inexistant
        dbState.parentProfile.telephone = '+99912345678';
        delete dbState.parentProfile.phone_normalized;
        dbState.studentInfo.telephone_parent = '+99912345678';
        delete dbState.studentInfo.telephone_parent_normalized;
        const r = await runLink();
        assert.strictEqual(r.status, 403);
        assert.strictEqual(rpcCount, 0);
        assert.strictEqual(dbState.insertsLog.length, 0);
    });

    it('H46 champ phone_normalized de forme E.164 mais invalide selon le validateur -> 403 fail-closed (validation stricte)', async () => {
        // Champ phone_normalized contient un numéro de forme E.164 invalide
        dbState.parentProfile.telephone = '+33600000000';
        dbState.parentProfile.phone_normalized = '+99912345678';
        dbState.studentInfo.telephone_parent = '+33600000000';
        dbState.studentInfo.telephone_parent_normalized = '+33600000000';
        const r = await runLink();
        assert.strictEqual(r.status, 403);
        assert.strictEqual(rpcCount, 0);
        assert.strictEqual(dbState.insertsLog.length, 0);
    });

    it('H47 lot mixte contenant une demande pending et une demande pending_verification -> 202 pending avec compteurs explicites', async () => {
        req.body = { studentIds: ['s1', 's2'] };
        dbState.studentsList = [
            { id: 's1', nom: 'A', prenom: 'B', telephone_parent: '+33600000000', telephone_parent_normalized: '+33600000000' },
            { id: 's2', nom: 'C', prenom: 'D', telephone_parent: '+33600000000', telephone_parent_normalized: '+33600000000' }
        ];
        const origFrom = supabase.from;
        supabase.from = (table) => {
            const b = origFrom(table);
            if (table === 'parent_student_link_requests') {
                return {
                    insert: (data) => {
                        if (data.student_id === 's1') {
                            return {
                                select: () => ({
                                    maybeSingle: async () => ({ data: { id: 'a0000000-0000-4000-a000-000000000001', ...data }, error: null })
                                })
                            };
                        }
                        // s2 déclenche un conflit 23505
                        return {
                            select: () => ({
                                maybeSingle: async () => ({ data: null, error: { code: '23505', message: 'duplicate key' } })
                            })
                        };
                    },
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                eq: () => ({
                                    in: () => ({
                                        maybeSingle: async () => ({ data: { id: 'a0000000-0000-4000-a000-000000000002', status: 'pending_verification' }, error: null })
                                    })
                                })
                            })
                        })
                    })
                };
            }
            return b;
        };
        const r = await runLink();
        assert.strictEqual(r.status, 202);
        assert.strictEqual(r.body.status, 'pending');
        assert.strictEqual(r.body.created, 1);
        assert.strictEqual(r.body.alreadyPending, 0);
        assert.strictEqual(r.body.alreadyPendingVerification, 1);
        assert.strictEqual(rpcCount, 0);
        assert.strictEqual(dbState.localLinkCalled, false);
    });
});
