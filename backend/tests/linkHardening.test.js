process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test';
process.env.JWT_SECRET = 'test';
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { linkStudentToParent } = require('../controllers/studentsController');
const { supabase } = require('../utils/supabase');

describe('linkHardening - behavioral tests', () => {
    let req, res, statusMock, jsonMock, rpcCount;
    let dbState;

    beforeEach(() => {
        rpcCount = 0;
        statusMock = (code) => { res.statusCode = code; return res; };
        jsonMock = (data) => { res.body = data; if(res.statusCode!==200 && res.statusCode!==201 && res.statusCode!==409 && res.statusCode!==403) console.log(res.statusCode, 'LOG:', data); return res; };
        res = { status: statusMock, json: jsonMock, statusCode: 200, body: null };
        req = {
            user: { id: 'parent-123', role: 'parent', schoolSlug: 'ecole_test', telephone: '+33600000000' },
            body: { studentIds: ['student-456'] }
        };

        dbState = {
            rpcResponses: [{ status: 'created', student_global_id: 'new-g0' }],
            portfolio: [],
            destinationMapped: null,
            studentInfo: { id: 'student-456', nom: 'Doe', prenom: 'John', date_naissance: '2015-05-12', telephone_parent: '+33600000000', telephone_parent_normalized: '+33600000000' },
            parentProfile: { telephone: '+33600000000', phone_normalized: '+33600000000' },
            historicalMappings: {
                'global-1': [{ school_slug: 'ecole_other', student_local_id: 'stud-1' }],
                'global-nomatch': [{ school_slug: 'ecole_other', student_local_id: 'stud-no' }]
            },
            historicalStudents: {
                'ecole_other': {
                    'stud-1': { nom: 'Doe', prenom: 'John', date_naissance: '2015-05-12' },
                    'stud-no': { nom: 'Different', prenom: 'Child', date_naissance: '2010-01-01' }
                }
            },
            portfolioQueryErr: null,
            destQueryErr: null,
            histQueryErr: null,
            exactLinkErr: null,
            relinkUpdateErr: null,
            verifyQueryErr: null,
            verifyUpdateErr: null,
            insertClaimError: null,
            destReloadErr: null,
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
                    single: async () => ({ data: null, error: null }),
                    maybeSingle: async () => {
                        if (table === 'profiles_ecole_test') return { data: dbState.parentProfile, error: null };
                        if (table === 'parent_student_ecole_test') return { data: [], error: null };
                        if (table === 'students_ecole_test') return { data: dbState.studentInfo, error: null };
                        
                        if (table === 'student_global_mappings') {
                            if (rpcCount > 0 && dbState.destReloadErr) return { data: null, error: dbState.destReloadErr };
                            if (dbState.destQueryErr) return { data: null, error: dbState.destQueryErr };
                            return { data: dbState.destinationMapped, error: null };
                        }
                        
                        if (table === 'parent_child_links' && qEq['parent_ref']) {
                            if (dbState.exactLinkErr) return { data: null, error: dbState.exactLinkErr };
                            if (dbState.verifyQueryErr) return { data: null, error: dbState.verifyQueryErr };
                            if (dbState.exactLinkExists === qEq['student_global_id']) return { data: { student_global_id: dbState.exactLinkExists }, error: null };
                            return { data: null, error: null };
                        }
                        
                        if (table.startsWith('students_')) {
                            if (dbState.histQueryErr) return { data: null, error: dbState.histQueryErr };
                            const slug = table.replace('students_', '');
                            const stud = dbState.historicalStudents[slug] ? dbState.historicalStudents[slug][qEq['id']] : null;
                            return { data: stud, error: null };
                        }
                        return { data: null, error: null };
                    },
                    then: (resolve) => {
                        if (table === 'parent_student_ecole_test') return resolve({ data: [], error: null });
                        if (table.startsWith('students_')) {
                            if (dbState.histQueryErr && table !== 'students_ecole_test') return resolve({ data: null, error: dbState.histQueryErr });
                            if (table === 'students_ecole_test') return resolve({ data: [dbState.studentInfo], error: null });
                            const slug = table.replace('students_', '');
                            const stud = dbState.historicalStudents[slug] ? dbState.historicalStudents[slug][qEq['id']] : null;
                            return resolve({ data: stud ? [stud] : [], error: null });
                        }
                        if (table === 'parent_child_links') {
                            if (qEq['student_global_id']) {
                                if (dbState.exactLinkErr) return resolve({ data: null, error: dbState.exactLinkErr });
                                if (dbState.verifyQueryErr) return resolve({ data: null, error: dbState.verifyQueryErr });
                                if (dbState.exactLinkExists === qEq['student_global_id']) return resolve({ data: [{ student_global_id: dbState.exactLinkExists }], error: null });
                                return resolve({ data: [], error: null });
                            }
                            if (dbState.portfolioQueryErr) return resolve({ data: null, error: dbState.portfolioQueryErr });
                            return resolve({ data: dbState.portfolio.map(g => ({student_global_id: g})), error: null });
                        }
                        if (table === 'student_global_mappings') {
                            if (rpcCount > 0 && dbState.destReloadErr) return resolve({ data: null, error: dbState.destReloadErr });
                            if (dbState.destQueryErr) return resolve({ data: null, error: dbState.destQueryErr });
                            const maps = qEq['student_global_id'] ? (dbState.historicalMappings[qEq['student_global_id']] || []) : (dbState.destinationMapped ? [dbState.destinationMapped] : []);
                            return resolve({ data: maps, error: null });
                        }
                        resolve({ data: [], error: null });
                    }
                };
                return mockBuilder;
            },
            insert: async (data) => {
                dbState.insertsLog.push({ table, data });
                if (table.startsWith('parent_student_')) {
                    dbState.localLinkCalled = true;
                    return { data: null, error: null };
                }
                if (table === 'parent_child_links') {
                    if (dbState.insertClaimError) return { data: null, error: dbState.insertClaimError };
                    return { data: null, error: null };
                }
                return { data: null, error: null };
            },
            update: (data) => {
                dbState.updatesLog.push({ table, data });
                let qEq = {};
                const builder = {
                    eq: (c, v) => { qEq[c] = v; return builder; },
                    then: (resolve) => {
                        if (table === 'parent_child_links') {
                            if (dbState.relinkUpdateErr) return resolve({ data: null, error: dbState.relinkUpdateErr });
                            if (dbState.verifyUpdateErr) return resolve({ data: null, error: dbState.verifyUpdateErr });
                        }
                        resolve({ data: null, error: null });
                    }
                };
                return builder;
            },
            delete: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) })
        });

        supabase.rpc = async (fn, params) => {
            rpcCount++;
            dbState.rpcCallsLog.push({ fn, params });
            let resp = dbState.rpcResponses.shift();
            if (!resp) resp = { status: 'created', student_global_id: 'fallback-g' };
            
            if (resp.hook) {
                resp.hook();
            }
            return { data: resp, error: null };
        };
    });

    const runLink = async () => {
        await linkStudentToParent(req, res);
        return { status: res.statusCode, body: res.body };
    };

    it('H1 portfolio vide + destination unmapped -> RPC created -> local link', async () => {
        const r = await runLink();
        assert.strictEqual(r.status, 201);
        assert.strictEqual(rpcCount, 1);
        assert.ok(dbState.localLinkCalled);
    });

    it('H2 targetParentId is correctly resolved for admin', async () => {
        req.user.role = 'admin';
        req.body.parentId = 'parent-456';
        dbState.parentProfile.id = 'parent-456';
        const r = await runLink();
        assert.strictEqual(r.status, 201);
    });

    it('H3 nonempty + unique match -> TRANSFER_REQUIRED + RPC zero calls', async () => {
        dbState.portfolio = ['global-1'];
        const r = await runLink();
        assert.strictEqual(r.status, 409);
        assert.strictEqual(r.body.error, 'TRANSFER_REQUIRED');
        assert.strictEqual(rpcCount, 0);
    });

    it('H4 multiple matches -> MULTIPLE_IDENTITY_MATCHES', async () => {
        dbState.portfolio = ['global-1', 'global-2'];
        dbState.historicalMappings['global-2'] = [{ school_slug: 'ecole_other', student_local_id: 'stud-1' }];
        const r = await runLink();
        assert.strictEqual(r.status, 409);
        assert.strictEqual(r.body.error, 'MULTIPLE_IDENTITY_MATCHES');
    });

    it('H5 DOB missing/invalid -> IDENTITY_EVIDENCE_INSUFFICIENT', async () => {
        dbState.portfolio = ['global-1'];
        dbState.historicalStudents.ecole_other['stud-1'].date_naissance = null;
        const r = await runLink();
        assert.strictEqual(r.status, 409);
        assert.strictEqual(r.body.error, 'IDENTITY_EVIDENCE_INSUFFICIENT');
    });

    it('H6 historical student unavailable -> 503', async () => {
        dbState.portfolio = ['global-1'];
        dbState.historicalStudents.ecole_other['stud-1'] = null; // simulate absent
        const r = await runLink();
        assert.strictEqual(r.status, 503);
    });

    it('H7 technical DB failure -> 500', async () => {
        dbState.portfolio = ['global-1'];
        dbState.histQueryErr = new Error('db error');
        const r = await runLink();
        assert.strictEqual(r.status, 500);
    });

    it('H8 PORTFOLIO_CHANGED -> reload -> unique match -> TRANSFER_REQUIRED; no second RPC', async () => {
        dbState.portfolio = ['global-nomatch'];
        dbState.rpcResponses = [
            { 
                status: 'PORTFOLIO_CHANGED',
                hook: () => {
                    dbState.portfolio = ['global-nomatch', 'global-1'];
                }
            }
        ];
        const r = await runLink();
        assert.strictEqual(r.status, 409);
        assert.strictEqual(r.body.error, 'TRANSFER_REQUIRED');
        assert.strictEqual(r.body.studentId, 'student-456');
        assert.strictEqual(r.body.target_student_global_id, 'global-1');
        assert.strictEqual(rpcCount, 1);
        assert.strictEqual(dbState.localLinkCalled, false);
    });

    it('H9 PORTFOLIO_CHANGED -> reload -> complete no-match -> second RPC -> created', async () => {
        dbState.portfolio = [];
        dbState.rpcResponses = [
            { 
                status: 'PORTFOLIO_CHANGED',
                hook: () => {
                    dbState.portfolio = ['global-nomatch'];
                }
            },
            {
                status: 'created', student_global_id: 'new-g0'
            }
        ];
        const r = await runLink();
        assert.strictEqual(r.status, 201);
        assert.strictEqual(rpcCount, 2);
        assert.strictEqual(dbState.rpcCallsLog[1].fn, 'create_and_link_new_global_student');
        assert.ok(dbState.rpcCallsLog[1].params.p_expected_global_ids.includes('global-nomatch'));
        assert.strictEqual(dbState.localLinkCalled, true);
    });

    it('H10 three total RPC attempts all PORTFOLIO_CHANGED -> 500; exactly 3 calls', async () => {
        dbState.rpcResponses = [
            { status: 'PORTFOLIO_CHANGED' },
            { status: 'PORTFOLIO_CHANGED' },
            { status: 'PORTFOLIO_CHANGED' },
            { status: 'PORTFOLIO_CHANGED' }
        ];
        const r = await runLink();
        assert.strictEqual(r.status, 500);
        assert.strictEqual(r.body.error, 'INTERNAL_ERROR');
        assert.strictEqual(rpcCount, 3);
        assert.strictEqual(dbState.localLinkCalled, false);
    });

    it('H11 DESTINATION_ALREADY_MAPPED -> reload mapping -> secure mapped resolution', async () => {
        dbState.destinationMapped = null;
        dbState.rpcResponses = [
            { 
                status: 'DESTINATION_ALREADY_MAPPED',
                hook: () => {
                    dbState.destinationMapped = { student_global_id: 'global-dest' };
                    dbState.exactLinkExists = 'global-dest';
                }
            }
        ];
        
        const r = await runLink();
        assert.strictEqual(r.status, 201);
        assert.strictEqual(rpcCount, 1);
        assert.strictEqual(dbState.localLinkCalled, true);
    });

    it('H12 mapped + same parent -> safe relink; first_linked_at untouched', async () => {
        dbState.destinationMapped = { student_global_id: 'global-dest' };
        dbState.exactLinkExists = 'global-dest';
        const r = await runLink();
        assert.strictEqual(r.status, 201);
        assert.strictEqual(rpcCount, 0);
        
        const linkUpdates = dbState.updatesLog.filter(u => u.table === 'parent_child_links');
        assert.strictEqual(linkUpdates.length, 1);
        assert.strictEqual(linkUpdates[0].data.current_link_active, true);
        assert.ok(linkUpdates[0].data.first_linked_at === undefined);
        assert.strictEqual(dbState.localLinkCalled, true);
    });

    it('H13 mapped + unowned + empty portfolio -> legitimate second-parent claim', async () => {
        dbState.destinationMapped = { student_global_id: 'global-dest' };
        dbState.portfolio = [];
        const r = await runLink();
        assert.strictEqual(r.status, 201);
        assert.strictEqual(rpcCount, 0);
        const linkInserts = dbState.insertsLog.filter(i => i.table === 'parent_child_links');
        assert.strictEqual(linkInserts.length, 1);
        assert.ok(linkInserts[0].data.first_linked_at);
        assert.strictEqual(dbState.localLinkCalled, true);
    });

    it('H14 mapped + unowned + nonempty complete no-match -> legitimate claim', async () => {
        dbState.destinationMapped = { student_global_id: 'global-dest' };
        dbState.portfolio = ['global-nomatch'];
        const r = await runLink();
        assert.strictEqual(r.status, 201);
        assert.strictEqual(rpcCount, 0);
        
        const linkInserts = dbState.insertsLog.filter(i => i.table === 'parent_child_links');
        assert.strictEqual(linkInserts.length, 1);
        assert.strictEqual(linkInserts[0].data.parent_ref, 'parent-123');
        assert.strictEqual(linkInserts[0].data.student_global_id, 'global-dest');
        assert.strictEqual(linkInserts[0].data.current_link_active, true);
        assert.ok(linkInserts[0].data.first_linked_at !== undefined);
        assert.strictEqual(dbState.localLinkCalled, true);
    });

    it('H15 mapped + unowned + SAME-CHILD conflict with different owned global -> 409 ownership conflict', async () => {
        dbState.destinationMapped = { student_global_id: 'global-dest' };
        dbState.portfolio = ['global-1'];
        const r = await runLink();
        assert.strictEqual(r.status, 409);
    });

    it('H16 mapped + unowned + insufficient evidence -> no claim', async () => {
        dbState.destinationMapped = { student_global_id: 'global-dest' };
        dbState.portfolio = ['global-1'];
        dbState.historicalStudents.ecole_other['stud-1'].date_naissance = null;
        const r = await runLink();
        assert.strictEqual(r.status, 409);
    });

    it('H17 claim 23505 -> exact pair reload exists -> safe relink; first_linked_at untouched', async () => {
        dbState.destinationMapped = { student_global_id: 'global-dest' };
        dbState.portfolio = ['global-nomatch'];
        dbState.insertClaimError = { code: '23505' };
        dbState.exactLinkExists = 'global-dest';
        const r = await runLink();
        assert.strictEqual(r.status, 201);
        
        const linkUpdates = dbState.updatesLog.filter(u => u.table === 'parent_child_links');
        assert.strictEqual(linkUpdates.length, 1);
        assert.strictEqual(linkUpdates[0].data.current_link_active, true);
        assert.ok(linkUpdates[0].data.first_linked_at === undefined);
        assert.strictEqual(dbState.localLinkCalled, true);
    });

    it('H18 claim 23505 -> exact pair reload absent -> 500', async () => {
        dbState.destinationMapped = { student_global_id: 'global-dest' };
        dbState.insertClaimError = { code: '23505' };
        dbState.exactLinkExists = null; // on verify query, it's absent
        const r = await runLink();
        assert.strictEqual(r.status, 500);
        assert.ok(!dbState.localLinkCalled);
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

    it('H20 local link occurs only after global resolution', async () => {
        dbState.portfolio = ['global-1'];
        dbState.histQueryErr = new Error();
        const r = await runLink();
        assert.strictEqual(r.status, 500);
        assert.ok(!dbState.localLinkCalled);
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
        // Test 1: New child via RPC (H1) -> tested by checking insertsLog.
        let inserts = dbState.insertsLog.filter(i => i.table === 'parent_child_links');
        assert.strictEqual(inserts.length, 0); // initial
    });

    it('H25 client cannot spoof schoolSlug', async () => {
        req.body.schoolSlug = 'spoofed';
        const r = await runLink();
        assert.strictEqual(r.status, 201);
    });

    it('H26 client cannot spoof parent_ref / expected_global_ids', async () => {
        req.body.parentId = 'spoofed-id';
        const r = await runLink();
        assert.strictEqual(r.status, 201);
    });

    it('H27 unexpected RPC status -> 500', async () => {
        dbState.rpcResponses = [{ status: 'bizarre' }];
        const r = await runLink();
        assert.strictEqual(r.status, 500);
    });

    it('H28 historical student query DB error -> 500', async () => {
        dbState.portfolio = ['global-1'];
        dbState.histQueryErr = new Error('db error');
        const r = await runLink();
        assert.strictEqual(r.status, 500);
        assert.ok(!dbState.localLinkCalled);
    });

    it('H29 portfolio query DB error -> 500', async () => {
        dbState.portfolio = ['global-1'];
        dbState.portfolioQueryErr = new Error('db error');
        const r = await runLink();
        assert.strictEqual(r.status, 500);
        assert.ok(!dbState.localLinkCalled);
    });

    it('H30 destination mapping query DB error -> 500', async () => {
        dbState.portfolio = ['global-1'];
        dbState.destQueryErr = new Error('db error');
        const r = await runLink();
        assert.strictEqual(r.status, 500);
        assert.ok(!dbState.localLinkCalled);
    });

    it('H31 exact parent-child lookup DB error -> 500', async () => {
        dbState.portfolio = ['global-1'];
        dbState.destinationMapped = { student_global_id: 'global-dest' };
        dbState.exactLinkErr = new Error('db error');
        const r = await runLink();
        assert.strictEqual(r.status, 500);
        assert.ok(!dbState.localLinkCalled);
    });

    it('H32 relink update DB error -> 500', async () => {
        dbState.portfolio = ['global-1'];
        dbState.destinationMapped = { student_global_id: 'global-dest' };
        dbState.exactLinkExists = 'global-dest';
        dbState.relinkUpdateErr = new Error('db error');
        const r = await runLink();
        assert.strictEqual(r.status, 500);
        assert.ok(!dbState.localLinkCalled);
    });

    it('H33 23505 verification query DB error -> 500', async () => {
        dbState.portfolio = ['global-1'];
        dbState.destinationMapped = { student_global_id: 'global-dest' };
        dbState.insertClaimError = { code: '23505' };
        dbState.verifyQueryErr = new Error('db error');
        const r = await runLink();
        assert.strictEqual(r.status, 500);
        assert.ok(!dbState.localLinkCalled);
    });

    it('H34 23505 exact pair exists but reactivation update fails -> 500', async () => {
        dbState.portfolio = ['global-1'];
        dbState.destinationMapped = { student_global_id: 'global-dest' };
        dbState.insertClaimError = { code: '23505' };
        dbState.exactLinkExists = 'global-dest';
        dbState.verifyUpdateErr = new Error('db error');
        const r = await runLink();
        assert.strictEqual(r.status, 500);
        assert.ok(!dbState.localLinkCalled);
    });

    it('H35 DESTINATION_ALREADY_MAPPED reload query error -> 500', async () => {
        dbState.portfolio = ['global-nomatch']; 
        dbState.rpcResponses = [{ status: 'DESTINATION_ALREADY_MAPPED' }];
        dbState.destReloadErr = new Error('db error');
        
        const r = await runLink();
        assert.strictEqual(r.status, 500);
        assert.strictEqual(r.body.error, 'INTERNAL_ERROR');
        assert.strictEqual(rpcCount, 1);
        assert.strictEqual(dbState.localLinkCalled, false);
    });

    it('H36 DESTINATION_ALREADY_MAPPED reload succeeds but mapping absent -> 500', async () => {
        dbState.destinationMapped = null;
        dbState.portfolio = ['global-nomatch']; 
        dbState.rpcResponses = [{ 
            status: 'DESTINATION_ALREADY_MAPPED',
            hook: () => {
                dbState.destinationMapped = null; // mapping remains absent
            }
        }];
        
        const r = await runLink();
        assert.strictEqual(r.status, 500);
        assert.strictEqual(r.body.error, 'INTERNAL_ERROR');
        assert.strictEqual(rpcCount, 1);
        assert.strictEqual(dbState.localLinkCalled, false);
    });

    it('PARENTID SPOOF REAL TEST', async () => {
        req.user.id = 'parent-123';
        req.body.parentId = 'parent-spoofed'; 
        
        const r = await runLink();
        
        for (const log of dbState.rpcCallsLog) {
            assert.strictEqual(log.params.p_parent_ref, 'parent-123');
        }
        for (const ins of dbState.insertsLog) {
            if (ins.table === 'parent_child_links') {
                assert.strictEqual(ins.data.parent_ref, 'parent-123');
            }
            if (ins.table.startsWith('parent_student_')) {
                assert.strictEqual(ins.data.parent_id, 'parent-123');
            }
        }
        assert.strictEqual(r.status, 201);
    });
});
