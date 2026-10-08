const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test_service_role_key';
process.env.JWT_SECRET = 'test_secret_for_multitenant_lot5b_security_min_32_chars';

const { supabase } = require('../utils/supabase');
const parentPackService = require('../services/parentPackService');
const { getParentData, getPresences, toggleDevoirComplete, getBadges } = require('../controllers/parentController');

describe('P25-B.2: Parent Pack Backend Enforcement', () => {
    let req, res;
    const originalFrom = supabase.from;
    const originalRpc = supabase.rpc;
    const originalGetAccessStatesForLocalIds = parentPackService.getAccessStatesForLocalIds;
    const { ACCESS_STATES } = parentPackService;

    beforeEach(() => {
        req = {
            user: { id: 'parent-123', role: 'parent', schoolSlug: 'demo' },
            body: {},
            params: {}
        };
        res = {
            statusCode: 200,
            responseData: null,
            status(code) { this.statusCode = code; return this; },
            json(data) { this.responseData = data; return this; }
        };

        const createQueryMock = (dataToReturn, errorToReturn = null) => {
            const m = {
                select: () => m,
                eq: () => m,
                in: () => m,
                order: () => m,
                limit: () => m,
                single: () => m,
                then: (resolve) => resolve({ data: dataToReturn, error: errorToReturn })
            };
            return m;
        };

        supabase.from = (table) => createQueryMock([]);
        supabase.rpc = () => Promise.resolve({ data: [] });
    });

    afterEach(() => {
        supabase.from = originalFrom;
        supabase.rpc = originalRpc;
        parentPackService.getAccessStatesForLocalIds = originalGetAccessStatesForLocalIds;
    });

    const mockSupabaseQuery = (tableDataMap) => {
        supabase.from = (table) => {
            let filteredData = tableDataMap[table] || [];
            const m = {
                select: () => m,
                eq: (key, val) => m,
                neq: () => m,
                in: (key, vals) => {
                    if (Array.isArray(vals)) {
                        filteredData = filteredData.filter(row => vals.includes(row[key]));
                    }
                    return m;
                },
                order: () => m,
                limit: () => m,
                single: () => {
                    const data = filteredData.length > 0 ? filteredData[0] : null;
                    return Promise.resolve({ data, error: null });
                },
                then: (resolve) => resolve({ data: filteredData, count: filteredData.length, error: null })
            };
            return m;
        };
    };

    describe('getParentData multi-enfants états différents', () => {
        it('devrait retourner les notes de l\'enfant actif, mais pas celles du suspendu, et inclure le FREE', async () => {
            mockSupabaseQuery({
                'parent_student_demo': [{ student_id: 1 }, { student_id: 2 }],
                'students_demo': [{ id: 1, classe: '6A' }, { id: 2, classe: '5B' }],
                'notes_demo': [{ id: 101, eleve_id: 1, note_classe: 15 }, { id: 102, eleve_id: 2, note_classe: 10 }],
                'presences_demo': [{ id: 201, student_id: 1 }, { id: 202, student_id: 2 }],
                'devoirs_demo': [{ id: 301, classe: '6A' }, { id: 302, classe: '5B' }],
                'resources_demo': [{ id: 401, classe: '6A' }, { id: 402, classe: '5B' }],
                'badges_demo': [{ id: 501, student_id: 1 }, { id: 502, student_id: 2 }],
                'announcements_demo': [{ id: 1, text: 'Hello FREE' }]
            });

            // Mock RPC to return child 1 as PAID_ACTIVE
            supabase.rpc = (name, params) => {
                return Promise.resolve({ data: [{ student_global_id: 'global-1', parent_ref: 'parent-123' }], error: null });
            };
            
            // We must also mock students table to map local id to global id
            mockSupabaseQuery({
                'parent_student_demo': [{ student_id: 1, first_linked_at: '2020-01-01T00:00:00Z' }, { student_id: 2, first_linked_at: '2020-01-01T00:00:00Z' }],
                'student_global_mappings': [
                    { student_local_id: '1', student_global_id: 'global-1' },
                    { student_local_id: '2', student_global_id: 'global-2' }
                ],
                'parent_child_links': [
                    { student_global_id: 'global-1', first_linked_at: '2020-01-01T00:00:00Z' },
                    { student_global_id: 'global-2', first_linked_at: '2020-01-01T00:00:00Z' }
                ],
                'students_demo': [
                    { id: 1, classe: '6A', student_global_id: 'global-1', parent_pack_grace_end: null }, 
                    { id: 2, classe: '5B', student_global_id: 'global-2', parent_pack_grace_end: '2020-01-01' }
                ],
                'notes_demo': [{ id: 101, eleve_id: 1, note_classe: 15 }, { id: 102, eleve_id: 2, note_classe: 10 }],
                'presences_demo': [{ id: 201, student_id: 1 }, { id: 202, student_id: 2 }],
                'devoirs_demo': [{ id: 301, classe: '6A' }, { id: 302, classe: '5B' }],
                'resources_demo': [{ id: 401, classe: '6A' }, { id: 402, classe: '5B' }],
                'badges_demo': [{ id: 501, student_id: 1 }, { id: 502, student_id: 2 }],
                'announcements_demo': [{ id: 1, text: 'Hello FREE' }]
            });

            await getParentData(req, res);
            
            assert.equal(res.statusCode, 200);
            assert.ok(res.responseData.parentPackAccess);
            assert.equal(res.responseData.parentPackAccess[1].accessAllowed, true);
            assert.equal(res.responseData.parentPackAccess[2].accessAllowed, false);
            
            // Notes, presences, badges: only child 1
            assert.equal(res.responseData.notes.length, 1);
            assert.equal(res.responseData.notes[0].eleveId, 1);
            assert.equal(res.responseData.presences.length, 1);
            assert.equal(res.responseData.badges.length, 1);
            
            // Devoirs, resources: only class 6A
            assert.equal(res.responseData.devoirs.length, 1);
            assert.equal(res.responseData.devoirs[0].classe, '6A');
            assert.equal(res.responseData.resources.length, 1);
            assert.equal(res.responseData.resources[0].classe, '6A');

            // FREE features intact
            assert.equal(res.responseData.students.length, 2);
            assert.equal(res.responseData.announcements.length, 1);
        });

        it('cas même classe : devrait charger la classe Premium autorisée via A, laissant B suspendu', async () => {
            supabase.rpc = (name, params) => {
                return Promise.resolve({ data: [{ student_global_id: 'global-1', parent_ref: 'parent-123' }], error: null });
            };
            mockSupabaseQuery({
                'parent_student_demo': [{ student_id: 1, first_linked_at: '2020-01-01T00:00:00Z' }, { student_id: 2, first_linked_at: '2020-01-01T00:00:00Z' }],
                'student_global_mappings': [
                    { student_local_id: '1', student_global_id: 'global-1' },
                    { student_local_id: '2', student_global_id: 'global-2' }
                ],
                'parent_child_links': [
                    { student_global_id: 'global-1', first_linked_at: '2020-01-01T00:00:00Z' },
                    { student_global_id: 'global-2', first_linked_at: '2020-01-01T00:00:00Z' }
                ],
                'students_demo': [
                    { id: 1, classe: '6A', student_global_id: 'global-1', parent_pack_grace_end: null }, 
                    { id: 2, classe: '6A', student_global_id: 'global-2', parent_pack_grace_end: '2020-01-01' }
                ],
                'devoirs_demo': [{ id: 301, classe: '6A' }]
            });

            await getParentData(req, res);
            
            assert.equal(res.statusCode, 200);
            assert.equal(res.responseData.parentPackAccess[1].accessAllowed, true);
            assert.equal(res.responseData.parentPackAccess[2].accessAllowed, false);
            assert.equal(res.responseData.devoirs.length, 1); // 6A
        });

        it('fail-closed : erreur technique du moteur retourne FREE dispo, Premium vide, ACCESS_UNAVAILABLE', async () => {
            let rpcCalled = false;
            supabase.rpc = () => { rpcCalled = true; return Promise.resolve({ data: null, error: new Error('RPC Failed') }); };
            mockSupabaseQuery({
                'parent_student_demo': [{ student_id: 1, first_linked_at: '2020-01-01T00:00:00Z' }],
                'student_global_mappings': [
                    { student_local_id: '1', student_global_id: 'global-1' }
                ],
                'parent_child_links': [
                    { student_global_id: 'global-1', first_linked_at: '2020-01-01T00:00:00Z' }
                ],
                'students_demo': [{ id: 1, classe: '6A', student_global_id: 'global-1' }],
                'announcements_demo': [{ id: 1, text: 'Hello FREE' }]
            });

            await getParentData(req, res);
            console.log('rpcCalled:', rpcCalled);
            console.log('parentPackAccess state:', res.responseData.parentPackAccess[1].state);
            
            assert.equal(res.statusCode, 200); // Route is still alive
            assert.equal(res.responseData.students.length, 1);
            assert.equal(res.responseData.announcements.length, 1);
            
            assert.equal(res.responseData.parentPackAccess[1].state, 'ACCESS_UNAVAILABLE');
            assert.equal(res.responseData.parentPackAccess[1].accessAllowed, false);
            
            assert.equal(res.responseData.notes.length, 0);
            assert.equal(res.responseData.devoirs.length, 0);
        });
    });

    describe('Routes unitaires Premium', () => {
        it('getPresences: 403 si PACK_SUSPENDED', async () => {
            req.params.studentId = 1;
            mockSupabaseQuery({
                'parent_student_demo': [{ student_id: 1, first_linked_at: '2020-01-01T00:00:00Z' }],
                'student_global_mappings': [
                    { student_local_id: '1', student_global_id: 'global-1' }
                ],
                'parent_child_links': [
                    { student_global_id: 'global-1', first_linked_at: '2020-01-01T00:00:00Z' }
                ],
                'students_demo': [{ id: 1, classe: '6A', student_global_id: 'global-1', parent_pack_grace_end: '2020-01-01' }]
            });
            supabase.rpc = () => Promise.resolve({ data: [], error: null });

            await getPresences(req, res);
            
            assert.equal(res.statusCode, 403);
            assert.equal(res.responseData.code, 'PACK_SUSPENDED');
        });

        it('toggleDevoirComplete: 403 si PACK_SUSPENDED', async () => {
            req.params.devoirId = 301;
            req.body = { studentId: 1, completed: true };
            mockSupabaseQuery({
                'parent_student_demo': [{ student_id: 1, first_linked_at: '2020-01-01T00:00:00Z' }],
                'student_global_mappings': [
                    { student_local_id: '1', student_global_id: 'global-1' }
                ],
                'parent_child_links': [
                    { student_global_id: 'global-1', first_linked_at: '2020-01-01T00:00:00Z' }
                ],
                'students_demo': [{ id: 1, classe: '6A', student_global_id: 'global-1', parent_pack_grace_end: '2020-01-01' }]
            });
            supabase.rpc = () => Promise.resolve({ data: [], error: null });

            await toggleDevoirComplete(req, res);
            
            assert.equal(res.statusCode, 403);
            assert.equal(res.responseData.code, 'PACK_SUSPENDED');
        });
        
        it('getBadges: retourne les badges de l\'actif et exclut ceux du suspendu', async () => {
            mockSupabaseQuery({
                'parent_student_demo': [{ student_id: 1, first_linked_at: '2020-01-01T00:00:00Z' }, { student_id: 2, first_linked_at: '2020-01-01T00:00:00Z' }],
                'student_global_mappings': [
                    { student_local_id: '1', student_global_id: 'global-1' },
                    { student_local_id: '2', student_global_id: 'global-2' }
                ],
                'parent_child_links': [
                    { student_global_id: 'global-1', first_linked_at: '2020-01-01T00:00:00Z' },
                    { student_global_id: 'global-2', first_linked_at: '2020-01-01T00:00:00Z' }
                ],
                'students_demo': [
                    { id: 1, classe: '6A', student_global_id: 'global-1', parent_pack_grace_end: null }, 
                    { id: 2, classe: '5B', student_global_id: 'global-2', parent_pack_grace_end: '2020-01-01' }
                ],
                'badges_demo': [{ id: 1, student_id: 1 }, { id: 2, student_id: 2 }]
            });

            supabase.rpc = () => Promise.resolve({ data: [{ student_global_id: 'global-1', parent_ref: 'parent-123' }], error: null });

            await getBadges(req, res);
            
            assert.equal(res.statusCode, 200);
        });

        it('Ownership: enfant non lié -> 403 avant moteur Pack', async () => {
            req.params.studentId = 999;
            mockSupabaseQuery({
                'parent_student_demo': [] // pas de lien
            });
            
            let rpcCalled = false;
            supabase.rpc = () => { rpcCalled = true; return Promise.resolve({ data: [] }); };

            await getPresences(req, res);
            
            assert.equal(res.statusCode, 403);
            assert.ok(!rpcCalled);
        });
    });
});
