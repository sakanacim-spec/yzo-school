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

    it('Test 13: FIRST LINK - création globale puis locale (pending request)', async () => {
        let rpcCalled = false;
        let localInsertCalled = false;
        let rpcPayload = null;

        supabase.rpc = (fn, payload) => {
            // Should not be called in pending flow
            rpcCalled = true;
            rpcPayload = payload;
            return Promise.resolve({ data: null, error: null });
        };

        supabase.from = (table) => {
            const m = {
                select: () => m,
                eq: () => m,
                in: () => m,
                maybeSingle: () => {
                    if (table === `profiles_demo`) return Promise.resolve({ data: { telephone: '+22990000000' } });
                    if (table === `students_demo`) return Promise.resolve({ data: { id: 1, nom: 'A', prenom: 'B', date_naissance: '2010-01-01', telephone_parent: '+22990000000' } });
                    return Promise.resolve({ data: null }); // no mapping, empty portfolio
                },
                insert: (data) => {
                    if (table === 'parent_student_demo') {
                        localInsertCalled = true;
                    }
                    const resObj = { data: { id: 'req-1' }, error: null };
                    return {
                        select: () => ({
                            maybeSingle: () => Promise.resolve(resObj),
                            single: () => Promise.resolve(resObj)
                        }),
                        single: () => Promise.resolve(resObj),
                        maybeSingle: () => Promise.resolve(resObj),
                        then: (resolve) => resolve(resObj)
                    };
                },
                then: (resolve) => {
                    if (table === 'students_demo') {
                        return resolve({ data: [{ id: 1, nom: 'A', prenom: 'B', date_naissance: '2010-01-01', telephone_parent: '+22990000000' }], error: null });
                    }
                    return resolve({ data: null, error: null });
                }
            };
            return m;
        };

        req.body = { studentId: 1 };
        await linkStudentToParent(req, res);

        assert.equal(rpcCalled, false, 'RPC should not be called for pending request');
        assert.equal(localInsertCalled, false, 'Local insert should not be performed for pending request');
        assert.equal(res.statusCode, 202, 'Response should be 202 Pending');
    });

    it('Test 14: UNLINK / RELINK COMPLET (Option A)', async () => {
        let globalUpdatePayloadUnlink = null;
        let globalUpdatePayloadRelink = null;
        let isRelink = false;

        supabase.from = (table) => {
            const m = {
                select: () => m,
                eq: () => m,
                in: () => m,
                order: () => m,
                limit: () => m,
                maybeSingle: () => {
                    if (table === 'profiles_demo') return Promise.resolve({ data: { telephone: '+22990000000' } });
                    if (table === 'student_global_mappings') return Promise.resolve({ data: { student_global_id: 'g-123' } });
                    return Promise.resolve({ data: null, error: null });
                },
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
                    const resObj = { data: { id: 'req-1', status: 'pending' }, error: null };
                    return {
                        select: () => ({
                            maybeSingle: () => Promise.resolve(resObj),
                            single: () => Promise.resolve(resObj)
                        }),
                        maybeSingle: () => Promise.resolve(resObj),
                        single: () => Promise.resolve(resObj),
                        then: (resolve) => resolve(resObj)
                    };
                },
                then: (resolve) => {
                    if (table === 'students_demo') return resolve({ data: [{ id: 1, nom: 'A', prenom: 'B', telephone_parent: '+22990000000', telephone_parent_normalized: '+22990000000' }], error: null });
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

        // C. RELINK (Option A : crée une demande pending, pas de réactivation directe de parent_child_links)
        isRelink = true;
        req.body = { studentId: 1 };
        await linkStudentToParent(req, res);

        assert.equal(res.statusCode, 202, 'La demande de relink doit renvoyer 202 Pending');
        assert.equal(res.body.status, 'pending');
        assert.equal(globalUpdatePayloadRelink, null, 'Aucune réactivation directe de parent_child_links sans approbation');
    });

    it('Test 15: LEGACY NULL / RELINK (Option A : pending request)', async () => {
        let globalUpdatePayload = null;
        let rpcCalled = false;

        supabase.rpc = (fn) => {
            rpcCalled = true;
            return Promise.resolve({ data: null, error: null });
        };

        supabase.from = (table) => {
            const m = {
                select: () => m,
                eq: () => m,
                in: () => m,
                order: () => m,
                limit: () => m,
                single: () => Promise.resolve({ data: { student_global_id: 'g-123' } }),
                maybeSingle: () => {
                    if (table === `profiles_demo`) return Promise.resolve({ data: { telephone: '+22990000000' } });
                    if (table === `students_demo`) return Promise.resolve({ data: { id: 1, nom: 'A', prenom: 'B', date_naissance: '2010-01-01', telephone_parent: '+22990000000' } });
                    return Promise.resolve({ data: null, error: null });
                },
                insert: (data) => {
                    const resObj = { data: { id: 'req-1', status: 'pending' }, error: null };
                    return {
                        select: () => ({
                            maybeSingle: () => Promise.resolve(resObj),
                            single: () => Promise.resolve(resObj)
                        }),
                        maybeSingle: () => Promise.resolve(resObj),
                        single: () => Promise.resolve(resObj),
                        then: (resolve) => resolve(resObj)
                    };
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
                    if (table === 'students_demo') return resolve({ data: [{ id: 1, telephone_parent: '+22990000000', telephone_parent_normalized: '+22990000000' }] });
                    return resolve({ data: null, error: null });
                }
            };
            return m;
        };

        req.body = { studentId: 1 };
        await linkStudentToParent(req, res);

        assert.equal(res.statusCode, 202);
        assert.equal(res.body.status, 'pending');
        assert.equal(globalUpdatePayload, null, 'Aucune mutation de parent_child_links lors de la demande');
        assert.equal(rpcCalled, false, 'Aucun appel RPC lors de la demande parent');
    });

    it('Test 16: CONCURRENCE (Option A : conflit 23505 absorbé par relecture pending)', async () => {
        let globalUpdateCalled = false;
        let rpcCalled = false;

        supabase.rpc = (fn) => {
            rpcCalled = true;
            return Promise.resolve({ data: null, error: null });
        };

        supabase.from = (table) => {
            const m = {
                select: () => m,
                eq: () => m,
                in: () => m,
                order: () => m,
                limit: () => m,
                single: () => Promise.resolve({ data: null }),
                maybeSingle: () => {
                    if (table === `profiles_demo`) return Promise.resolve({ data: { telephone: '+22990000000' } });
                    if (table === `students_demo`) return Promise.resolve({ data: { id: 1, nom: 'A', prenom: 'B', date_naissance: '2010-01-01', telephone_parent: '+22990000000' } });
                    if (table === 'parent_student_link_requests') {
                        return Promise.resolve({ data: { id: 'req-exist', status: 'pending' }, error: null });
                    }
                    return Promise.resolve({ data: null, error: null });
                },
                insert: (data) => {
                    if (table === 'parent_student_link_requests') {
                        const errObj = { code: '23505', message: 'duplicate key' };
                        return {
                            select: () => ({
                                maybeSingle: () => Promise.resolve({ data: null, error: errObj }),
                                single: () => Promise.resolve({ data: null, error: errObj })
                            }),
                            then: (resolve) => resolve({ data: null, error: errObj })
                        };
                    }
                    return { select: () => ({ single: () => Promise.resolve({ data: null }) }), then: resolve => resolve({ data: null }) };
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
                    if (table === 'students_demo') return resolve({ data: [{ id: 1, telephone_parent: '+22990000000', telephone_parent_normalized: '+22990000000' }] });
                    return resolve({ data: null, error: null });
                }
            };
            return m;
        };

        req.body = { studentId: 1 };
        await linkStudentToParent(req, res);

        assert.equal(rpcCalled, false, 'Aucun appel RPC lors d\'une demande concurrente');
        assert.equal(globalUpdateCalled, false, 'Aucun update de parent_child_links');
        assert.equal(res.statusCode, 202);
        assert.equal(res.body.status, 'pending');
        assert.equal(res.body.alreadyPending, 1);
    });

    it('Test 16b: CONCURRENCE NEGATIF (Option A : 23505 sans pending -> 400 fail-closed)', async () => {
        let rpcCalled = false;

        supabase.rpc = (fn) => {
            rpcCalled = true;
            return Promise.resolve({ data: null, error: null });
        };

        supabase.from = (table) => {
            const m = {
                select: () => m,
                eq: () => m,
                in: () => m,
                order: () => m,
                limit: () => m,
                single: () => Promise.resolve({ data: null }),
                maybeSingle: () => {
                    if (table === `profiles_demo`) return Promise.resolve({ data: { telephone: '+22990000000' } });
                    if (table === `students_demo`) return Promise.resolve({ data: { id: 1, nom: 'A', prenom: 'B', date_naissance: '2010-01-01', telephone_parent: '+22990000000' } });
                    if (table === 'parent_student_link_requests') {
                        return Promise.resolve({ data: null, error: null });
                    }
                    return Promise.resolve({ data: null, error: null });
                },
                insert: (data) => {
                    if (table === 'parent_student_link_requests') {
                        const errObj = { code: '23505', message: 'duplicate key' };
                        return {
                            select: () => ({
                                maybeSingle: () => Promise.resolve({ data: null, error: errObj }),
                                single: () => Promise.resolve({ data: null, error: errObj })
                            }),
                            then: (resolve) => resolve({ data: null, error: errObj })
                        };
                    }
                    return { select: () => ({ single: () => Promise.resolve({ data: null }) }), then: resolve => resolve({ data: null }) };
                },
                update: () => {
                    const res = { error: null };
                    const m2 = { eq: () => m2, then: (resolve) => resolve(res) };
                    return m2;
                },
                then: (resolve) => {
                    if (table === 'students_demo') return resolve({ data: [{ id: 1, telephone_parent: '+22990000000', telephone_parent_normalized: '+22990000000' }] });
                    return resolve({ data: null, error: null });
                }
            };
            return m;
        };

        req.body = { studentId: 1 };
        await linkStudentToParent(req, res);

        assert.equal(rpcCalled, false);
        assert.equal(res.statusCode, 400);
        assert.match(res.body.error, /Conflit de doublon/);
    });

    it('Test 17A: CHANGEMENT ECOLE - PARENT POSSEDE DEJA L IDENTITE (Option A : mise en attente sans conflit)', async () => {
        let rpcCalled = false;

        supabase.rpc = (fn) => {
            rpcCalled = true;
            return Promise.resolve({ data: null, error: null });
        };

        supabase.from = (table) => {
            const m = {
                select: () => m,
                eq: () => m,
                in: () => m,
                order: () => m,
                limit: () => m,
                single: () => Promise.resolve({ data: null }),
                maybeSingle: () => {
                    if (table === `profiles_demo`) return Promise.resolve({ data: { telephone: '+22990000000' } });
                    if (table === `students_demo`) return Promise.resolve({ data: { id: 2, nom: 'A', prenom: 'B', date_naissance: '2010-01-01', telephone_parent: '+22990000000' } });
                    return Promise.resolve({ data: null, error: null });
                },
                insert: (data) => {
                    const resObj = { data: { id: 'req-2', status: 'pending' }, error: null };
                    return {
                        select: () => ({
                            maybeSingle: () => Promise.resolve(resObj),
                            single: () => Promise.resolve(resObj)
                        }),
                        maybeSingle: () => Promise.resolve(resObj),
                        single: () => Promise.resolve(resObj),
                        then: (resolve) => resolve(resObj)
                    };
                },
                update: () => {
                    const res = { error: null };
                    const m2 = { eq: () => m2, then: (resolve) => resolve(res) };
                    return m2;
                },
                then: (resolve) => {
                    if (table === 'students_demo') return resolve({ data: [{ id: 2, telephone_parent: '+22990000000', telephone_parent_normalized: '+22990000000', prenom: 'A', nom: 'B', date_naissance: '2010-01-01' }] });
                    return resolve({ data: [], error: null });
                }
            };
            return m;
        };

        req.body = { studentId: 2 };
        await linkStudentToParent(req, res);

        assert.equal(rpcCalled, false, 'Aucun appel RPC lors du dépôt de demande');
        assert.equal(res.statusCode, 202);
        assert.equal(res.body.status, 'pending');
        assert.equal(res.body.created, 1);
    });

    it('Test 17B: CHANGEMENT ECOLE - PORTFOLIO VIDE (Option A : mise en attente sans RPC)', async () => {
        let rpcCalled = false;

        supabase.rpc = (fn) => {
            rpcCalled = true;
            return Promise.resolve({ data: null, error: null });
        };

        supabase.from = (table) => {
            const m = {
                select: () => m,
                eq: () => m,
                in: () => m,
                order: () => m,
                limit: () => m,
                single: () => Promise.resolve({ data: null }),
                maybeSingle: () => {
                    if (table === `profiles_demo`) return Promise.resolve({ data: { telephone: '+22990000000' } });
                    if (table === `students_demo`) return Promise.resolve({ data: { id: 2, nom: 'A', prenom: 'B', date_naissance: '2010-01-01', telephone_parent: '+22990000000' } });
                    return Promise.resolve({ data: null, error: null });
                },
                insert: (data) => {
                    const resObj = { data: { id: 'req-new', status: 'pending' }, error: null };
                    return {
                        select: () => ({
                            maybeSingle: () => Promise.resolve(resObj),
                            single: () => Promise.resolve(resObj)
                        }),
                        maybeSingle: () => Promise.resolve(resObj),
                        single: () => Promise.resolve(resObj),
                        then: (resolve) => resolve(resObj)
                    };
                },
                update: () => {
                    const res = { error: null };
                    const m2 = { eq: () => m2, then: (resolve) => resolve(res) };
                    return m2;
                },
                then: (resolve) => {
                    if (table === 'students_demo') return resolve({ data: [{ id: 2, telephone_parent: '+22990000000', telephone_parent_normalized: '+22990000000', prenom: 'A', nom: 'B', date_naissance: '2010-01-01' }] });
                    return resolve({ data: null, error: null });
                }
            };
            return m;
        };

        req.body = { studentId: 2 };
        await linkStudentToParent(req, res);

        assert.equal(rpcCalled, false, 'Aucun appel RPC lors du dépôt de demande');
        assert.equal(res.statusCode, 202);
        assert.equal(res.body.status, 'pending');
        assert.equal(res.body.created, 1);
    });
});
