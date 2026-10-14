const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test_service_role_key';
process.env.JWT_SECRET = 'test_secret_for_multitenant_lot5b_security_min_32_chars';
process.env.PASSWORD_RESET_OTP_SECRET = 'test_otp_secret_for_lot5b_hmac_min_32_chars';
process.env.AI_QUOTA_HASH_SECRET = 'test_ai_quota_hash_secret_min_32_chars_ok';

const { unlinkStudentFromParent } = require('../controllers/studentsController');
const { getGlobalPortfolio } = require('../controllers/parentController');
const { supabase } = require('../utils/supabase');

describe('P26-B Lot 1 — Unlink Transactionnel & Portfolio Filter Unit Tests', () => {

    it('1. unlinkStudentFromParent appelle la RPC unlink_parent_student_local avec les bons paramètres', async () => {
        let calledRpcName = null;
        let calledRpcParams = null;

        supabase.rpc = (name, params) => {
            calledRpcName = name;
            calledRpcParams = params;
            return Promise.resolve({
                data: {
                    success: true,
                    local_deleted: true,
                    has_other_legitimate_link: true,
                    global_link_deactivated: false
                },
                error: null
            });
        };

        const req = {
            user: { id: 'parent-uuid-1', role: 'parent', schoolSlug: 'ecole_a' },
            params: { studentId: 'stu-local-1' },
            query: {}
        };
        let responseData = null;
        let statusCode = 200;
        const res = {
            status: (code) => { statusCode = code; return res; },
            json: (data) => { responseData = data; return res; }
        };

        await unlinkStudentFromParent(req, res);

        assert.equal(statusCode, 200);
        assert.equal(calledRpcName, 'unlink_parent_student_local');
        assert.deepEqual(calledRpcParams, {
            p_school_slug: 'ecole_a',
            p_parent_id: 'parent-uuid-1',
            p_student_id: 'stu-local-1',
            p_actor_id: 'parent-uuid-1'
        });
        assert.equal(responseData.has_other_legitimate_link, true);
        assert.equal(responseData.global_link_deactivated, false);
    });

    it('2. unlinkStudentFromParent préserve le lien global si un autre établissement est actif', async () => {
        supabase.rpc = () => Promise.resolve({
            data: {
                success: true,
                local_deleted: true,
                has_other_legitimate_link: true,
                global_link_deactivated: false
            },
            error: null
        });

        const req = {
            user: { id: 'parent-uuid-1', role: 'parent', schoolSlug: 'ecole_a' },
            params: { studentId: 'stu-1' }
        };
        let responseData = null;
        const res = {
            status: () => res,
            json: (data) => { responseData = data; return res; }
        };

        await unlinkStudentFromParent(req, res);

        assert.equal(responseData.local_deleted, true);
        assert.equal(responseData.has_other_legitimate_link, true);
        assert.equal(responseData.global_link_deactivated, false);
    });

    it('3. unlinkStudentFromParent désactive le lien global s\'il ne reste aucun autre établissement', async () => {
        supabase.rpc = () => Promise.resolve({
            data: {
                success: true,
                local_deleted: true,
                has_other_legitimate_link: false,
                global_link_deactivated: true
            },
            error: null
        });

        const req = {
            user: { id: 'parent-uuid-1', role: 'parent', schoolSlug: 'ecole_a' },
            params: { studentId: 'stu-1' }
        };
        let responseData = null;
        const res = {
            status: () => res,
            json: (data) => { responseData = data; return res; }
        };

        await unlinkStudentFromParent(req, res);

        assert.equal(responseData.local_deleted, true);
        assert.equal(responseData.has_other_legitimate_link, false);
        assert.equal(responseData.global_link_deactivated, true);
    });

    it('4. unlinkStudentFromParent renvoie 404 si la RPC renvoie LINK_NOT_FOUND', async () => {
        supabase.rpc = () => Promise.resolve({
            data: {
                success: false,
                error: 'LINK_NOT_FOUND',
                message: 'Aucun rattachement local actif trouvé.'
            },
            error: null
        });

        const req = {
            user: { id: 'parent-uuid-1', role: 'parent', schoolSlug: 'ecole_a' },
            params: { studentId: 'stu-inexistant' }
        };
        let statusCode = 200;
        let responseData = null;
        const res = {
            status: (code) => { statusCode = code; return res; },
            json: (data) => { responseData = data; return res; }
        };

        await unlinkStudentFromParent(req, res);

        assert.equal(statusCode, 404);
        assert.equal(responseData.error, 'Aucun rattachement local actif trouvé.');
    });

    it('5. unlinkStudentFromParent renvoie 403 si la RPC signale UNAUTHORIZED_ACTOR ou ACTOR_NOT_IN_SCHOOL', async () => {
        supabase.rpc = () => Promise.resolve({
            data: {
                success: false,
                error: 'UNAUTHORIZED_ACTOR',
                message: 'Rôle insuffisant pour détacher un tiers.'
            },
            error: null
        });

        const req = {
            user: { id: 'prof-uuid-1', role: 'professeur', schoolSlug: 'ecole_a' },
            params: { studentId: 'stu-1' }
        };
        let statusCode = 200;
        const res = {
            status: (code) => { statusCode = code; return res; },
            json: () => res
        };

        await unlinkStudentFromParent(req, res);

        assert.equal(statusCode, 403);
    });

    it('6. unlinkStudentFromParent renvoie 409 si un conflit de verrouillage survient (CONCURRENCY_LOCK_TIMEOUT)', async () => {
        supabase.rpc = () => Promise.resolve({
            data: {
                success: false,
                error: 'CONCURRENCY_LOCK_TIMEOUT',
                message: 'Conflit de verrouillage temporaire lors de la suppression.'
            },
            error: null
        });

        const req = {
            user: { id: 'parent-uuid-1', role: 'parent', schoolSlug: 'ecole_a' },
            params: { studentId: 'stu-1' }
        };
        let statusCode = 200;
        const res = {
            status: (code) => { statusCode = code; return res; },
            json: () => res
        };

        await unlinkStudentFromParent(req, res);

        assert.equal(statusCode, 409);
    });

    it('7. unlinkStudentFromParent refuse qu\'un non-admin spécifie un parentId tiers', async () => {
        const req = {
            user: { id: 'parent-uuid-1', role: 'parent', schoolSlug: 'ecole_a' },
            params: { studentId: 'stu-1' },
            query: { parentId: 'autre-parent-uuid' }
        };
        let statusCode = 200;
        const res = {
            status: (code) => { statusCode = code; return res; },
            json: () => res
        };

        await unlinkStudentFromParent(req, res);

        assert.equal(statusCode, 403);
    });

    it('8. Vérification que getGlobalPortfolio filtre effectivement current_link_active = true', async () => {
        const queryFilterLog = [];

        supabase.from = (table) => {
            const builder = {
                select: (cols) => builder,
                eq: (col, val) => {
                    queryFilterLog.push({ table, col, val });
                    return builder;
                },
                then: (resolve) => {
                    if (table === 'parent_child_links') {
                        return resolve({ data: [], error: null });
                    }
                    return resolve({ data: [], error: null });
                }
            };
            return builder;
        };

        const req = {
            user: { id: 'parent-test-uuid', role: 'parent' }
        };
        let responseData = null;
        const res = {
            set: () => res,
            status: () => res,
            json: (data) => { responseData = data; return res; }
        };

        await getGlobalPortfolio(req, res);

        const filterPcl = queryFilterLog.find(f => f.table === 'parent_child_links' && f.col === 'current_link_active');
        assert.ok(filterPcl, 'Le filtre current_link_active doit être présent sur parent_child_links');
        assert.equal(filterPcl.val, true, 'Le filtre doit exiger current_link_active === true');
    });

    it('9. unlinkStudentFromParent échoue immédiatement (HTTP 500) sans mutation si supabase.rpc est absent', async () => {
        const originalRpc = supabase.rpc;
        supabase.rpc = undefined;

        let fromCalled = false;
        supabase.from = () => {
            fromCalled = true;
            throw new Error('NE_DOIT_PAS_APPELER_FROM');
        };

        const req = {
            user: { id: 'parent-uuid-1', role: 'parent', schoolSlug: 'ecole_a' },
            params: { studentId: 'stu-1' }
        };
        let statusCode = null;
        let responseData = null;
        const res = {
            status: (code) => { statusCode = code; return res; },
            json: (data) => { responseData = data; return res; }
        };

        try {
            await unlinkStudentFromParent(req, res);
            assert.equal(statusCode, 500);
            assert.equal(responseData.error, 'Service de détachement non disponible.');
            assert.equal(fromCalled, false, 'Aucun repli vers supabase.from ne doit être exécuté');
        } finally {
            supabase.rpc = originalRpc;
        }
    });

    it('10. unlinkStudentFromParent échoue immédiatement (HTTP 500) sans mutation si supabase.rpc renvoie une erreur DB', async () => {
        supabase.rpc = () => Promise.resolve({
            data: null,
            error: { message: 'Database connection terminated', code: '08006' }
        });

        let fromCalled = false;
        supabase.from = () => {
            fromCalled = true;
            throw new Error('NE_DOIT_PAS_APPELER_FROM');
        };

        const req = {
            user: { id: 'parent-uuid-1', role: 'parent', schoolSlug: 'ecole_a' },
            params: { studentId: 'stu-1' }
        };
        let statusCode = null;
        let responseData = null;
        const res = {
            status: (code) => { statusCode = code; return res; },
            json: (data) => { responseData = data; return res; }
        };

        await unlinkStudentFromParent(req, res);
        assert.equal(statusCode, 500);
        assert.equal(responseData.error, 'Erreur lors de la suppression du lien.');
        assert.equal(fromCalled, false, 'Aucun repli vers supabase.from ne doit être exécuté');
    });
});
