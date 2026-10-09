const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

// Configurer l'environnement pour bypasser la vérification de supabase.js
process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test_service_role_key';
process.env.JWT_SECRET = 'test_secret_for_multitenant_lot5b_security_min_32_chars';
process.env.PASSWORD_RESET_OTP_SECRET = 'test_otp_secret_for_lot5b_hmac_min_32_chars';
process.env.AI_QUOTA_HASH_SECRET = 'test_ai_quota_hash_secret_min_32_chars_ok';

const { linkStudentToParent, unlinkStudentFromParent } = require('../controllers/studentsController');
const { supabase } = require('../utils/supabase');

describe('P25-A: Students Controller (link/unlink/relink)', () => {
    let res, req;

    // Sauvegarde des fonctions originales
    const originalFrom = supabase.from;
    const originalStorage = supabase.storage;

    beforeEach(() => {
        req = {
            user: { id: 'parent-123', role: 'parent', telephone: '+22990000000', schoolSlug: 'demo' },
            body: {}
        };
        res = {
            statusCode: null,
            body: null,
            status: function(code) { this.statusCode = code; return this; },
            json: function(data) { this.body = data; return this; }
        };

        const createQueryMock = () => {
            const m = {
                select: () => m,
                eq: () => m,
                in: () => m,
                insert: () => m,
                update: () => m,
                delete: () => m,
                single: () => m,
                maybeSingle: () => m,
                then: (resolve) => resolve({ data: null, error: null })
            };
            return m;
        };

        supabase.from = () => createQueryMock();
        supabase.storage = { from: () => {} };
    });

    afterEach(() => {
        supabase.from = originalFrom;
        supabase.storage = originalStorage;
    });

    it('Test 13: FIRST LINK - création globale puis locale', async () => {
        let rpcCalled = false;
        let localInsertCalled = false;
        let firstLinkedAtVal = null;
        let rpcPayload = null;

        supabase.rpc = (fn, payload) => {
            if (fn === 'create_and_link_new_global_student') {
                rpcCalled = true;
                rpcPayload = payload;
                return Promise.resolve({ data: { status: 'created', student_global_id: 'g-123' }, error: null });
            }
            return Promise.resolve({ data: null, error: null });
        };

        supabase.from = (table) => {
            const m = {
                select: () => m,
                eq: () => m,
                in: () => m,
                single: () => Promise.resolve({ data: { student_global_id: 'g-123' } }),
                maybeSingle: () => {
                    if (table === `profiles_demo`) return Promise.resolve({ data: { telephone: '+22990000000' } });
                    if (table === `students_demo`) return Promise.resolve({ data: { id: 1, nom: 'A', prenom: 'B', date_naissance: '2010-01-01', telephone_parent: '+22990000000' } });
                    return Promise.resolve({ data: null }); // no mapping, empty portfolio
                },
                insert: (data) => {
                    let result;
                    if (table === 'parent_student_demo') {
                        localInsertCalled = true;
                        result = { error: null };
                    } else if (table === 'global_students' || table === 'student_global_mappings') {
                        throw new Error("Direct insert in " + table + " forbidden!");
                    } else {
                        result = { error: null };
                    }
                    return {
                        select: () => m,
                        single: () => Promise.resolve(result),
                        then: (resolve) => resolve(result)
                    };
                },
                update: () => m,
                delete: () => m,
                then: (resolve) => {
                    if (table === 'students_demo') return resolve({ data: [{ id: 1, telephone_parent: '+22990000000' }] });
                    return resolve({ data: null, error: null });
                }
            };
            return m;
        };

        req.body = { studentId: 1 };
        await linkStudentToParent(req, res);

        assert.equal(rpcCalled, true);
        assert.equal(localInsertCalled, true);
        assert.notEqual(rpcPayload, null);
        assert.equal(res.statusCode, 201);
    });

    it('Test 14: UNLINK / RELINK COMPLET', async () => {
        let globalUpdatePayloadUnlink = null;
        let globalUpdatePayloadRelink = null;
        let isRelink = false;

        supabase.from = (table) => {
            const m = {
                select: () => m,
                eq: () => m,
                in: () => m,
                maybeSingle: () => Promise.resolve({ data: { student_global_id: 'g-123' } }),
                single: () => Promise.resolve({ data: { student_global_id: 'g-123' } }),
                update: (data) => {
                    if (table === 'parent_child_links') {
                        if (!isRelink) globalUpdatePayloadUnlink = data;
                        else globalUpdatePayloadRelink = data;
                    }
                    const res = { error: null };
                    const m2 = { eq: () => m2, then: (resolve) => resolve(res) };
                    return m2;
                },
                delete: () => {
                    const res = { error: null };
                    const m2 = { eq: () => m2, then: (resolve) => resolve(res) };
                    return m2;
                },
                insert: (data) => {
                    if (table === 'parent_child_links') {
                        // Simuler 23505 pour forcer le relink (fallback update)
                        const res = { error: { code: '23505' } };
                        return { select: () => ({ single: () => Promise.resolve(res) }), then: resolve => resolve(res) };
                    }
                    const res = { error: null };
                    return { select: () => ({ single: () => Promise.resolve(res) }), then: resolve => resolve(res) };
                },
                then: (resolve) => {
                    if (table === 'students_demo') return resolve({ data: [{ id: 1, telephone_parent: '+22990000000' }] });
                    return resolve({ data: null, error: null });
                }
            };
            return m;
        };

        // A. & B. UNLINK
        req.params = { studentId: 1 };
        await unlinkStudentFromParent(req, res);

        assert.notEqual(globalUpdatePayloadUnlink, null);
        assert.deepEqual(globalUpdatePayloadUnlink, { current_link_active: false });

        // C. RELINK
        isRelink = true;
        req.body = { studentId: 1 };
        await linkStudentToParent(req, res);

        assert.notEqual(globalUpdatePayloadRelink, null);
        assert.deepEqual(globalUpdatePayloadRelink, { current_link_active: true });
    });

    it('Test 15: LEGACY NULL / RELINK', async () => {
        let globalUpdatePayload = null;
        let parentChildLinksMaybeSingleCount = 0;

        supabase.rpc = (fn) => Promise.resolve({ data: null, error: null });

        supabase.from = (table) => {
            const m = {
                select: () => m,
                eq: () => m,
                in: () => m,
                single: () => Promise.resolve({ data: { student_global_id: 'g-123' } }),
                maybeSingle: () => {
                    if (table === `profiles_demo`) return Promise.resolve({ data: { telephone: '+22990000000' } });
                    if (table === `students_demo`) return Promise.resolve({ data: { id: 1, nom: 'A', prenom: 'B', date_naissance: '2010-01-01', telephone_parent: '+22990000000' } });
                    if (table === 'student_global_mappings') return Promise.resolve({ data: { student_global_id: 'g-123' } });
                    if (table === 'parent_child_links') {
                        parentChildLinksMaybeSingleCount++;
                        if (parentChildLinksMaybeSingleCount === 1) {
                            return Promise.resolve({ data: null }); // First time returning null to simulate missing exact link
                        }
                        return Promise.resolve({ data: { student_global_id: 'g-123' } }); // Reload exact pair successful
                    }
                    return Promise.resolve({ data: null });
                },
                insert: (data) => {
                    const res = (table === 'parent_child_links') ? { error: { code: '23505' } } : { error: null };
                    return { select: () => ({ single: () => Promise.resolve(res) }), then: resolve => resolve(res) };
                },
                update: (data) => {
                    if (table === 'parent_child_links') {
                        globalUpdatePayload = data;
                    }
                    const res = { error: null };
                    const m2 = { eq: () => m2, then: (resolve) => resolve(res) };
                    return m2;
                },
                then: (resolve) => {
                    if (table === 'students_demo') return resolve({ data: [{ id: 1, telephone_parent: '+22990000000' }] });
                    return resolve({ data: null, error: null });
                }
            };
            return m;
        };

        req.body = { studentId: 1 };
        await linkStudentToParent(req, res);

        assert.notEqual(globalUpdatePayload, null);
        assert.equal(globalUpdatePayload.first_linked_at, undefined);
        assert.deepEqual(globalUpdatePayload, { current_link_active: true });
        assert.equal(res.statusCode, 201);
    });

    it('Test 16: CONCURRENCE', async () => {
        let globalUpdateCalled = false;
        let rpcCalled = false;
        let studentGlobalMappingsMaybeSingleCount = 0;

        supabase.rpc = (fn) => {
            if (fn === 'create_and_link_new_global_student') {
                rpcCalled = true;
                return Promise.resolve({ data: { status: 'DESTINATION_ALREADY_MAPPED' }, error: null });
            }
            return Promise.resolve({ data: null, error: null });
        };

        supabase.from = (table) => {
            const m = {
                select: () => m,
                eq: () => m,
                in: () => m,
                single: () => Promise.resolve({ data: { student_global_id: 'g-123' } }),
                maybeSingle: () => {
                    if (table === `profiles_demo`) return Promise.resolve({ data: { telephone: '+22990000000' } });
                    if (table === `students_demo`) return Promise.resolve({ data: { id: 1, nom: 'A', prenom: 'B', date_naissance: '2010-01-01', telephone_parent: '+22990000000' } });
                    if (table === 'student_global_mappings') {
                        studentGlobalMappingsMaybeSingleCount++;
                        if (studentGlobalMappingsMaybeSingleCount === 1) {
                            return Promise.resolve({ data: null }); // First time empty mapping
                        }
                        return Promise.resolve({ data: { student_global_id: 'g-123' } }); // Reload successful
                    }
                    if (table === 'parent_child_links') return Promise.resolve({ data: { student_global_id: 'g-123' } });
                    return Promise.resolve({ data: null });
                },
                insert: (data) => {
                    if (table === 'student_global_mappings') throw new Error("Direct insert in " + table + " forbidden!");
                    const res = { error: null };
                    return { select: () => ({ single: () => Promise.resolve(res) }), then: resolve => resolve(res) };
                },
                update: (data) => {
                    if (table === 'parent_child_links' && data.current_link_active === true) {
                        globalUpdateCalled = true;
                    }
                    const res = { error: null };
                    const m2 = { eq: () => m2, then: (resolve) => resolve(res) };
                    return m2;
                },
                then: (resolve) => {
                    if (table === 'students_demo') return resolve({ data: [{ id: 1, telephone_parent: '+22990000000' }] });
                    return resolve({ data: null, error: null });
                }
            };
            return m;
        };

        req.body = { studentId: 1 };
        await linkStudentToParent(req, res);

        assert.equal(rpcCalled, true);
        assert.equal(globalUpdateCalled, true);
        assert.equal(res.statusCode, 201);
    });

    it('Test 16b: CONCURRENCE NEGATIF', async () => {
        let rpcCalled = false;

        supabase.rpc = (fn) => {
            if (fn === 'create_and_link_new_global_student') {
                rpcCalled = true;
                return Promise.resolve({ data: { status: 'DESTINATION_ALREADY_MAPPED' }, error: null });
            }
            return Promise.resolve({ data: null, error: null });
        };

        supabase.from = (table) => {
            const m = {
                select: () => m,
                eq: () => m,
                in: () => m,
                single: () => Promise.resolve({ data: { student_global_id: 'g-123' } }),
                maybeSingle: () => {
                    if (table === `profiles_demo`) return Promise.resolve({ data: { telephone: '+22990000000' } });
                    if (table === `students_demo`) return Promise.resolve({ data: { id: 1, nom: 'A', prenom: 'B', date_naissance: '2010-01-01', telephone_parent: '+22990000000' } });
                    if (table === 'student_global_mappings') return Promise.resolve({ data: null }); // toujours null, même après RPC
                    return Promise.resolve({ data: null });
                },
                insert: (data) => {
                    const res = { error: null };
                    return { select: () => ({ single: () => Promise.resolve(res) }), then: resolve => resolve(res) };
                },
                update: () => {
                    const res = { error: null };
                    const m2 = { eq: () => m2, then: (resolve) => resolve(res) };
                    return m2;
                },
                then: (resolve) => {
                    if (table === 'students_demo') return resolve({ data: [{ id: 1, telephone_parent: '+22990000000' }] });
                    return resolve({ data: null, error: null });
                }
            };
            return m;
        };

        req.body = { studentId: 1 };
        await linkStudentToParent(req, res);

        assert.equal(rpcCalled, true);
        assert.equal(res.statusCode, 500);
        assert.equal(res.body.error, 'INTERNAL_ERROR');
    });

    it('Test 17A: CHANGEMENT ECOLE - PARENT POSSEDE DEJA L IDENTITE', async () => {
        let rpcCalled = false;

        supabase.rpc = (fn) => {
            rpcCalled = true;
            return Promise.resolve({ data: null, error: null });
        };

        const originalFrom = supabase.from;
        supabase.from = (table) => {
            const m = {
                select: () => m,
                eq: () => m,
                in: () => m,
                single: () => Promise.resolve({ data: { student_global_id: 'g-123' } }),
                maybeSingle: () => {
                    if (table === `profiles_demo`) return Promise.resolve({ data: { telephone: '+22990000000' } });
                    if (table === `students_demo`) return Promise.resolve({ data: { id: 2, nom: 'A', prenom: 'B', date_naissance: '2010-01-01', telephone_parent: '+22990000000' } });
                    if (table === 'student_global_mappings') return Promise.resolve({ data: null }); // Pas de mapping pour le nouveau
                    return Promise.resolve({ data: null });
                },
                insert: (data) => {
                    const res = { error: null };
                    return { select: () => ({ single: () => Promise.resolve(res) }), then: resolve => resolve(res) };
                },
                update: () => {
                    const res = { error: null };
                    const m2 = { eq: () => m2, then: (resolve) => resolve(res) };
                    return m2;
                },
                then: (resolve) => {
                    if (table === 'students_demo') return resolve({ data: [{ id: 2, telephone_parent: '+22990000000', prenom: 'A', nom: 'B', date_naissance: '2010-01-01' }] });
                    if (table.startsWith('students_')) return resolve({ data: [{ student_global_id: 'g-old', prenom: 'A', nom: 'B', date_naissance: '2010-01-01' }] });
                    if (table === 'parent_child_links') return resolve({ data: [{ student_global_id: 'g-old' }] });
                    if (table === 'student_global_mappings') return resolve({ data: [{ school_slug: 'demo', student_local_id: '1' }] });
                    return resolve({ data: [], error: null });
                }
            };
            return m;
        };

        req.body = { studentId: 2 };
        await linkStudentToParent(req, res);

        assert.equal(rpcCalled, false);
        assert.equal(res.statusCode, 409);
        assert.equal(res.body.error, 'TRANSFER_REQUIRED');
        assert.equal(res.body.target_student_global_id, 'g-old');
    });

    it('Test 17B: CHANGEMENT ECOLE - PORTFOLIO VIDE', async () => {
        let rpcCalled = false;

        supabase.rpc = (fn) => {
            if (fn === 'create_and_link_new_global_student') {
                rpcCalled = true;
                return Promise.resolve({ data: { status: 'created', student_global_id: 'g-new' }, error: null });
            }
            return Promise.resolve({ data: null, error: null });
        };

        supabase.from = (table) => {
            const m = {
                select: () => m,
                eq: () => m,
                in: () => m,
                single: () => Promise.resolve({ data: { student_global_id: 'g-new' } }),
                maybeSingle: () => {
                    if (table === `profiles_demo`) return Promise.resolve({ data: { telephone: '+22990000000' } });
                    if (table === `students_demo`) return Promise.resolve({ data: { id: 2, nom: 'A', prenom: 'B', date_naissance: '2010-01-01', telephone_parent: '+22990000000' } });
                    if (table === 'student_global_mappings') return Promise.resolve({ data: null });
                    return Promise.resolve({ data: null });
                },
                insert: (data) => {
                    const res = { error: null };
                    return { select: () => ({ single: () => Promise.resolve(res) }), then: resolve => resolve(res) };
                },
                update: () => {
                    const res = { error: null };
                    const m2 = { eq: () => m2, then: (resolve) => resolve(res) };
                    return m2;
                },
                then: (resolve) => {
                    if (table === 'students_demo') return resolve({ data: [{ id: 2, telephone_parent: '+22990000000', prenom: 'A', nom: 'B', date_naissance: '2010-01-01' }] });
                    if (table === 'global_students') return resolve({ data: [] });
                    if (table.startsWith('students_')) return resolve({ data: [] }); // PORTFOLIO VIDE
                    return resolve({ data: null, error: null });
                }
            };
            return m;
        };

        req.body = { studentId: 2 };
        await linkStudentToParent(req, res);

        assert.equal(rpcCalled, true);
        assert.equal(res.statusCode, 201);
    });
});
