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
            status: () => res,
            json: () => {}
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
        let globalInsertCalled = false;
        let localInsertCalled = false;
        let firstLinkedAtVal = null;

        supabase.from = (table) => {
            const m = {
                select: () => m,
                eq: () => m,
                in: () => m,
                single: () => Promise.resolve({ data: { student_global_id: 'g-123' } }),
                maybeSingle: () => {
                    if (table === `profiles_demo`) return Promise.resolve({ data: { telephone: '+22990000000' } });
                    return Promise.resolve({ data: null }); // no mapping
                },
                insert: (data) => {
                    let result;
                    if (table === 'global_students') result = { data: [{ student_global_id: 'g-123' }], error: null };
                    else if (table === 'student_global_mappings') result = { error: null };
                    else if (table === 'parent_child_links') {
                        globalInsertCalled = true;
                        firstLinkedAtVal = data.first_linked_at;
                        result = { error: null };
                    }
                    else if (table === 'parent_student_demo') {
                        localInsertCalled = true;
                        result = { error: null };
                    }
                    else result = { error: null };

                    return {
                        select: () => m, // si un insert est chainé avec select(), cela le redirige vers le mock habituel
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

        assert.equal(globalInsertCalled, true);
        assert.equal(localInsertCalled, true);
        assert.notEqual(firstLinkedAtVal, null);
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
                    return { eq: () => ({ then: resolve => resolve(res) }) };
                },
                delete: () => {
                    const res = { error: null };
                    return { eq: () => ({ then: resolve => resolve(res) }) };
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
        supabase.from = (table) => {
            const m = {
                select: () => m,
                eq: () => m,
                in: () => m,
                single: () => Promise.resolve({ data: { student_global_id: 'g-123' } }),
                maybeSingle: () => {
                    if (table === `profiles_demo`) return Promise.resolve({ data: { telephone: '+22990000000' } });
                    if (table === 'student_global_mappings') return Promise.resolve({ data: { student_global_id: 'g-123' } });
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
                    return { eq: () => ({ then: resolve => resolve(res) }) };
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
        assert.deepEqual(globalUpdatePayload, { current_link_active: true });
    });

    it('Test 16: CONCURRENCE', async () => {
        let globalUpdateCalled = false;
        supabase.from = (table) => {
            const m = {
                select: () => m,
                eq: () => m,
                in: () => m,
                single: () => Promise.resolve({ data: { student_global_id: 'g-123' } }),
                maybeSingle: () => {
                    if (table === `profiles_demo`) return Promise.resolve({ data: { telephone: '+22990000000' } });
                    return Promise.resolve({ data: null }); // Simule aucune mapping existante
                },
                insert: (data) => {
                    let result;
                    if (table === 'global_students') result = { data: [{ student_global_id: 'g-123' }], error: null };
                    else if (table === 'student_global_mappings') result = { error: { code: '23505' } };
                    else if (table === 'parent_child_links') result = { error: { code: '23505' } };
                    else result = { error: null };

                    return { select: () => ({ single: () => Promise.resolve(result) }), then: resolve => resolve(result) };
                },
                update: (data) => {
                    if (table === 'parent_child_links' && data.current_link_active === true) {
                        globalUpdateCalled = true;
                    }
                    const res = { error: null };
                    return { eq: () => ({ then: resolve => resolve(res) }) };
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
        assert.equal(globalUpdateCalled, true);
    });

    it('Test 17: CHANGEMENT D\'ÉCOLE (BLOCKED)', async () => {
        // Le test documente l'incapacité de P24/P25 à dédupliquer automatiquement un élève
        // qui change d'école sans mapping cross-school existant.
        let newGlobalStudentCreated = false;

        supabase.from = (table) => {
            const m = {
                select: () => m,
                eq: () => m,
                in: () => m,
                single: () => Promise.resolve({ data: { student_global_id: 'g-new' } }),
                maybeSingle: () => {
                    if (table === `profiles_demo`) return Promise.resolve({ data: { telephone: '+22990000000' } });
                    // Pas de mapping global trouvé pour le NOUVEAU local_id de la NOUVELLE école
                    if (table === 'student_global_mappings') return Promise.resolve({ data: null });
                    return Promise.resolve({ data: null });
                },
                insert: (data) => {
                    if (table === 'global_students') newGlobalStudentCreated = true;
                    const res = { error: null };
                    return { select: () => ({ single: () => Promise.resolve(res) }), then: resolve => resolve(res) };
                },
                update: () => {
                    const res = { error: null };
                    return { eq: () => ({ then: resolve => resolve(res) }) };
                },
                then: (resolve) => {
                    if (table === 'students_demo') return resolve({ data: [{ id: 2, telephone_parent: '+22990000000' }] });
                    return resolve({ data: null, error: null });
                }
            };
            return m;
        };

        req.body = { studentId: 2 };
        await linkStudentToParent(req, res);
        // On s'attend à ce qu'un nouveau global_student soit créé, car aucun mécanisme
        // ne permet de retrouver l'ancien global_id (identifiant bloquant soulevé).
        assert.equal(newGlobalStudentCreated, true);
    });
});
