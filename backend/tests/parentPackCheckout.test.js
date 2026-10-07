process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'dummy';
process.env.JWT_SECRET = 'dummy';
process.env.FEDAPAY_SECRET_KEY = 'sk_sandbox_dummy';
const test = require('node:test');
const assert = require('node:assert');
const { createParentPackTransaction } = require('../controllers/paymentController');
const { supabase } = require('../utils/supabase');
const { Transaction } = require('fedapay');

function createMockReqRes(body = {}, user = { id: 'parent_123' }) {
    const req = { body, user };
    const res = {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(data) {
            this.body = data;
            return this;
        }
    };
    return { req, res };
}

test('createParentPackTransaction scenarios', async (t) => {
    const originalFrom = supabase.from;
    const originalRpc = supabase.rpc;
    const originalTxCreate = Transaction.create;

    t.afterEach(() => {
        supabase.from = originalFrom;
        supabase.rpc = originalRpc;
        Transaction.create = originalTxCreate;
    });

    await t.test('Scénario A - ownership refusé', async () => {
        const { req, res } = createMockReqRes({ schoolSlug: 'ecole_1', studentId: 'enfant_non_lie', planType: 'monthly' });

        supabase.from = (table) => {
            const mock = {
                select: () => mock,
                eq: () => mock,
                single: async () => {
                    if (table === 'parent_student_ecole_1') return { error: { message: 'Not found' }, data: null };
                    return { data: null };
                }
            };
            return mock;
        };

        let txCalled = false;
        Transaction.create = async () => { txCalled = true; return {}; };

        await createParentPackTransaction(req, res);

        assert.strictEqual(res.statusCode, 403);
        assert.ok(res.body.error.includes('Accès non autorisé'));
        assert.strictEqual(txCalled, false, 'FedaPay ne doit pas être appelé');
    });

    await t.test('Scénario B - classe inconnue', async () => {
        const { req, res } = createMockReqRes({ schoolSlug: 'ecole_1', studentId: 'student_xyz', planType: 'monthly' });

        supabase.from = (table) => {
            const mock = {
                select: () => mock,
                eq: () => mock,
                single: async () => {
                    if (table === 'parent_student_ecole_1') return { data: { parent_id: 'parent_123' } };
                    if (table === 'students_ecole_1') return { data: { id: 'student_xyz', classe: 'Université' } };
                    return { data: null };
                }
            };
            return mock;
        };

        let txCalled = false;
        Transaction.create = async () => { txCalled = true; return {}; };

        await createParentPackTransaction(req, res);

        assert.strictEqual(res.statusCode, 400);
        assert.ok(res.body.error.includes('Classe inconnue'));
        assert.strictEqual(txCalled, false, 'FedaPay ne doit pas être appelé');
    });

    await t.test('Scénario C & E - client non autoritatif & FedaPay payload', async () => {
        const { req, res } = createMockReqRes({
            schoolSlug: 'ecole_1',
            studentId: 'student_xyz',
            planType: 'annual',
            // Tampering:
            parent_ref: 'fake_parent',
            pricing_id: 'fake_pricing',
            cycle_name: 'fake_cycle',
            amount: 1,
            currency: 'USD',
            duration_months: 1
        });

        supabase.from = (table) => {
             const mock = {
                select: () => mock,
                eq: () => mock,
                lte: () => mock,
                update: () => mock,
                single: async () => {
                    if(table === 'parent_student_ecole_1') return { data: { parent_id: 'parent_123' } };
                    if(table === 'students_ecole_1') return { data: { id: 'student_xyz', classe: 'CP1', nom: 'Doe', prenom: 'John' } };
                    if(table === 'student_global_mappings') return { data: { student_global_id: 'global_uuid' } };
                    if(table === 'parent_pack_pricing') return { data: { id: 'pricing_uuid', annual_duration_months: 9 } };
                    if(table === 'payment_intents') return { data: { expected_amount: 150000 } };
                    return { data: null };
                }
             };
             return mock;
        };

        let rpcCalledWith = null;
        supabase.rpc = async (rpcName, params) => {
            if (rpcName === 'prepare_parent_pack_checkout') {
                rpcCalledWith = params;
                return { data: { subscription_id: 'sub_uuid', payment_intent_id: 'intent_uuid' } };
            }
            return { error: { message: 'unknown' } };
        };

        let txPayload = null;
        Transaction.create = async (payload) => {
            txPayload = payload;
            return { id: 'tx_uuid', generateToken: async () => ({ token: 'tok', url: 'http://url' }) };
        };

        await createParentPackTransaction(req, res);

        assert.strictEqual(res.statusCode, 200, res.body?.error || 'Should succeed');

        // C. Client Tampering validation
        assert.strictEqual(rpcCalledWith.p_parent_ref, 'parent_123');
        assert.strictEqual(rpcCalledWith.p_pricing_id, 'pricing_uuid');
        assert.strictEqual(rpcCalledWith.p_cycle_name, 'maternelle_primaire');
        assert.strictEqual(rpcCalledWith.p_duration_months, 9); // Annual

        // E. FedaPay payload
        assert.strictEqual(txPayload.amount, 150000);
        assert.strictEqual(txPayload.currency.iso, 'XOF');
        assert.strictEqual(txPayload.custom_metadata.intent_id, 'intent_uuid');
    });

    await t.test('Scénario D - planType invalid', async () => {
        const { req, res } = createMockReqRes({ schoolSlug: 'ecole_1', studentId: 'student_xyz', planType: 'fake_plan' });
        await createParentPackTransaction(req, res);
        assert.strictEqual(res.statusCode, 400);
        assert.ok(res.body.error.includes('Plan type invalide'));
    });
});
