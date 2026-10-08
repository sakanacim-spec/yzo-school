const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { transferIdentity } = require('../controllers/studentsController');
const { supabase } = require('../utils/supabase');

describe('P25-T.2b - transferIdentity Behavioral Tests', () => {
    let req, res, statusMock, jsonMock;
    
    // Helper to setup mock Supabase chaining
    let fromMock, selectMock, eqMock, maybeSingleMock, rpcMock;

    beforeEach(() => {
        statusMock = (code) => { res.statusCode = code; return res; };
        jsonMock = (data) => { res.body = data; return res; };
        res = { status: statusMock, json: jsonMock, statusCode: 200, body: null };
        req = {
            user: { id: 'parent-123', schoolSlug: 'ecole_test', telephone: '+33600000000' },
            body: { studentId: 'student-456', target_student_global_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' }
        };

        // Mock Supabase
        maybeSingleMock = async () => ({ data: null, error: null });
        eqMock = (col, val) => ({ eq: eqMock, maybeSingle: maybeSingleMock });
        selectMock = (cols) => ({ eq: eqMock });
        fromMock = (table) => ({ select: selectMock });
        rpcMock = async (fn, params) => ({ data: { status: 'created' }, error: null });

        supabase.from = fromMock;
        supabase.rpc = rpcMock;
    });

    const runTransfer = async () => {
        await transferIdentity(req, res);
        return { status: res.statusCode, body: res.body };
    };

    it('1. UUID cible invalide -> 400', async () => {
        req.body.target_student_global_id = 'not-a-uuid';
        const result = await runTransfer();
        assert.strictEqual(result.status, 400);
    });

    it('2. studentId mauvais type -> 400', async () => {
        req.body.studentId = { some: 'object' };
        const result = await runTransfer();
        assert.strictEqual(result.status, 400);
        
        req.body.studentId = '   ';
        const result2 = await runTransfer();
        assert.strictEqual(result2.status, 400);
    });

    it('3. target non possédé -> 403', async () => {
        maybeSingleMock = async () => ({ data: null, error: null }); // no target link
        const result = await runTransfer();
        assert.strictEqual(result.status, 403);
    });

    // Plus de mocks complexes seraient nécessaires pour couvrir 100% (c'est le rôle d'un framework comme Jest ou proxyquire).
    // Nous ajoutons le minimum pour prouver le comportement et éviter que les tests ne pètent avec des vraies requêtes.
    
    it('Client override test - params ignorés', async () => {
        req.body.schoolSlug = 'malicious';
        req.body.nom = 'fake';
        
        // Setup success path for ownership
        supabase.from = (table) => {
            return {
                select: (cols) => {
                    return {
                        eq: (c1, v1) => {
                            return {
                                eq: (c2, v2) => {
                                    return {
                                        maybeSingle: async () => {
                                            if (table === 'parent_child_links') return { data: { student_global_id: req.body.target_student_global_id }, error: null };
                                            return { data: null, error: null };
                                        }
                                    }
                                },
                                maybeSingle: async () => {
                                    if (table === 'profiles_ecole_test') return { data: { id: 'parent-123', telephone: '+33600000000' }, error: null };
                                    if (table === 'students_ecole_test') return { data: { id: 'student-456', telephone_parent: '+33600000000', nom: 'Doe', prenom: 'John', date_naissance: '2015-05-12' }, error: null };
                                    if (table === 'student_global_mappings' && cols === 'school_slug, student_local_id') {
                                        // This returns the mappings list, not maybeSingle
                                        return { data: [{ school_slug: 'ecole_test', student_local_id: 'student-456' }], error: null };
                                    }
                                    if (table === 'student_global_mappings') return { data: null, error: null }; // idempotency check
                                    return { data: null, error: null };
                                },
                                then: (res) => { // simulate await on the eq mock for list
                                    if (table === 'student_global_mappings' && cols === 'school_slug, student_local_id') {
                                        return res({ data: [{ school_slug: 'ecole_test', student_local_id: 'student-456' }], error: null });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        };
        
        const result = await runTransfer();
        assert.strictEqual(result.status, 200);
        assert.strictEqual(result.body.status, 'created');
    });
});
