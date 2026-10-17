'use strict';
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'dummy';
process.env.JWT_SECRET = 'dummy';
process.env.FEDAPAY_SECRET_KEY = 'sk_sandbox_mock_test_key_123';
process.env.FEDAPAY_ENVIRONMENT = 'sandbox';

const test = require('node:test');
const assert = require('node:assert');
const { createParentPackTransaction, configureFedaPay, validateFedaPayRedirectUrl } = require('../controllers/paymentController');
const { supabase } = require('../utils/supabase');
const { Transaction, FedaPay } = require('fedapay');

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

function setupBaseMockSupabase(overrides = {}) {
    const transitions = [];

    const mockFrom = (table) => {
        const query = {
            _table: table,
            select: () => query,
            eq: () => query,
            lte: () => query,
            update: (payload) => {
                query._updatePayload = payload;
                return query;
            },
            single: async () => {
                if (query._updatePayload && table === 'payment_intents') {
                    transitions.push(query._updatePayload);
                    if (overrides.transitionFails) {
                        return { data: null, error: { message: 'CAS_TRANSITION_FAILED' } };
                    }
                    return { data: { id: 'intent_uuid' }, error: null };
                }
                if (table === 'parent_student_ecole_1') {
                    if (overrides.noOwnership) return { data: null, error: { message: 'Not found' } };
                    return { data: { parent_id: 'parent_123' }, error: null };
                }
                if (table === 'students_ecole_1') {
                    if (overrides.unknownClass) return { data: { id: 'student_xyz', classe: 'Université' }, error: null };
                    return { data: { id: 'student_xyz', classe: 'CP1', nom: 'Doe', prenom: 'John' }, error: null };
                }
                if (table === 'student_global_mappings') {
                    return { data: { student_global_id: 'global_uuid' }, error: null };
                }
                if (table === 'parent_pack_pricing') {
                    return { data: { id: 'pricing_uuid', annual_duration_months: 9 }, error: null };
                }
                if (table === 'payment_intents') {
                    if (overrides.intentFetchError) {
                        return { data: null, error: { message: 'Supabase read error' } };
                    }
                    const amount = overrides.expectedAmount !== undefined ? overrides.expectedAmount : 150000;
                    return { data: { id: 'intent_uuid', expected_amount: amount }, error: null };
                }
                if (table === 'global_settings') {
                    return { data: overrides.globalSettings || [], error: null };
                }
                return { data: null, error: null };
            }
        };
        return query;
    };

    return { mockFrom, transitions };
}

test('createParentPackTransaction & FedaPay Security', async (t) => {
    const originalFrom = supabase.from;
    const originalRpc = supabase.rpc;
    const originalTxCreate = Transaction.create;
    const originalEnv = { ...process.env };

    t.afterEach(() => {
        supabase.from = originalFrom;
        supabase.rpc = originalRpc;
        Transaction.create = originalTxCreate;
        process.env.FEDAPAY_SECRET_KEY = originalEnv.FEDAPAY_SECRET_KEY;
        process.env.FEDAPAY_ENVIRONMENT = originalEnv.FEDAPAY_ENVIRONMENT;
    });

    await t.test('Scénario A - ownership refusé (403)', async () => {
        const { req, res } = createMockReqRes({ schoolSlug: 'ecole_1', studentId: 'enfant_non_lie', planType: 'monthly' });
        const { mockFrom } = setupBaseMockSupabase({ noOwnership: true });
        supabase.from = mockFrom;

        let txCalled = false;
        Transaction.create = async () => { txCalled = true; return {}; };

        await createParentPackTransaction(req, res);

        assert.strictEqual(res.statusCode, 403);
        assert.ok(res.body.error.includes('Accès non autorisé'));
        assert.strictEqual(txCalled, false, 'FedaPay ne doit pas être appelé');
    });

    await t.test('Scénario B - classe inconnue (400)', async () => {
        const { req, res } = createMockReqRes({ schoolSlug: 'ecole_1', studentId: 'student_xyz', planType: 'monthly' });
        const { mockFrom } = setupBaseMockSupabase({ unknownClass: true });
        supabase.from = mockFrom;

        let txCalled = false;
        Transaction.create = async () => { txCalled = true; return {}; };

        await createParentPackTransaction(req, res);

        assert.strictEqual(res.statusCode, 400);
        assert.ok(res.body.error.includes('Classe inconnue'));
        assert.strictEqual(txCalled, false, 'FedaPay ne doit pas être appelé');
    });

    await t.test('Scénario D - planType invalid (400)', async () => {
        const { req, res } = createMockReqRes({ schoolSlug: 'ecole_1', studentId: 'student_xyz', planType: 'fake_plan' });
        await createParentPackTransaction(req, res);
        assert.strictEqual(res.statusCode, 400);
        assert.ok(res.body.error.includes('Plan type invalide'));
    });

    await t.test('Scénario C & E - succès nominal, FedaPay payload et URL HTTPS sandbox valide (200)', async () => {
        const { req, res } = createMockReqRes({
            schoolSlug: 'ecole_1',
            studentId: 'student_xyz',
            planType: 'annual',
            // Tampering attempts
            parent_ref: 'fake_parent',
            pricing_id: 'fake_pricing',
            amount: 1,
            currency: 'USD'
        });

        const { mockFrom, transitions } = setupBaseMockSupabase();
        supabase.from = mockFrom;

        let rpcCalledWith = null;
        supabase.rpc = async (rpcName, params) => {
            if (rpcName === 'prepare_parent_pack_checkout') {
                rpcCalledWith = params;
                return { data: { subscription_id: 'sub_uuid', payment_intent_id: 'intent_uuid' }, error: null };
            }
            return { error: { message: 'unknown' } };
        };

        let txPayload = null;
        Transaction.create = async (payload) => {
            txPayload = payload;
            return {
                id: 'tx_12345',
                generateToken: async () => ({
                    token: 'tok_secret_nominal_123',
                    url: 'https://sandbox-checkout.fedapay.com/token/tok_secret_nominal_123'
                })
            };
        };

        await createParentPackTransaction(req, res);

        assert.strictEqual(res.statusCode, 200, res.body?.error || 'Should succeed');
        assert.strictEqual(res.body.transactionId, 'tx_12345');
        assert.strictEqual(res.body.token, 'tok_secret_nominal_123');
        assert.strictEqual(res.body.url, 'https://sandbox-checkout.fedapay.com/token/tok_secret_nominal_123');

        // Payload assertions
        assert.strictEqual(txPayload.amount, 150000);
        assert.strictEqual(txPayload.currency.iso, 'XOF');
        assert.strictEqual(txPayload.custom_metadata.intent_id, 'intent_uuid');

        // Transition CAS to pending
        const pendingTransition = transitions.find(t => t.status === 'pending');
        assert.ok(pendingTransition, 'Transition CAS vers pending requise');
        assert.strictEqual(pendingTransition.provider_transaction_id, 'tx_12345');
    });

    await t.test('Scénario F - FedaPay non configuré (503, intention cancelled)', async () => {
        process.env.FEDAPAY_SECRET_KEY = '';
        const { req, res } = createMockReqRes({ schoolSlug: 'ecole_1', studentId: 'student_xyz', planType: 'monthly' });
        const { mockFrom, transitions } = setupBaseMockSupabase();
        supabase.from = mockFrom;

        supabase.rpc = async () => ({
            data: { subscription_id: 'sub_uuid', payment_intent_id: 'intent_uuid' },
            error: null
        });

        let txCalled = false;
        Transaction.create = async () => { txCalled = true; return {}; };

        await createParentPackTransaction(req, res);

        assert.strictEqual(res.statusCode, 503);
        assert.strictEqual(txCalled, false, 'FedaPay ne doit pas être appelé sans configuration');
        const cancelTransition = transitions.find(t => t.status === 'cancelled');
        assert.ok(cancelTransition, 'Intention doit être transitionnée en cancelled');
        assert.strictEqual(cancelTransition.reconciliation_reason, 'MISSING_SECRET_KEY');
    });

    await t.test('Scénario G - Clé Live tentée en environnement Sandbox (503, intention cancelled)', async () => {
        process.env.FEDAPAY_ENVIRONMENT = 'sandbox';
        process.env.FEDAPAY_SECRET_KEY = 'sk_live_malicious_or_accidental_key';

        const { req, res } = createMockReqRes({ schoolSlug: 'ecole_1', studentId: 'student_xyz', planType: 'monthly' });
        const { mockFrom, transitions } = setupBaseMockSupabase();
        supabase.from = mockFrom;

        supabase.rpc = async () => ({
            data: { subscription_id: 'sub_uuid', payment_intent_id: 'intent_uuid' },
            error: null
        });

        let txCalled = false;
        Transaction.create = async () => { txCalled = true; return {}; };

        await createParentPackTransaction(req, res);

        assert.strictEqual(res.statusCode, 503);
        assert.strictEqual(txCalled, false, 'FedaPay ne doit pas être appelé avec une clé live en sandbox');
        const cancelTransition = transitions.find(t => t.status === 'cancelled');
        assert.ok(cancelTransition, 'Intention doit être transitionnée en cancelled');
        assert.strictEqual(cancelTransition.reconciliation_reason, 'LIVE_KEY_FORBIDDEN_IN_SANDBOX');
    });

    await t.test('Scénario H - Erreur de lecture de l intention Supabase (500, intention cancelled)', async () => {
        const { req, res } = createMockReqRes({ schoolSlug: 'ecole_1', studentId: 'student_xyz', planType: 'monthly' });
        const { mockFrom, transitions } = setupBaseMockSupabase({ intentFetchError: true });
        supabase.from = mockFrom;

        supabase.rpc = async () => ({
            data: { subscription_id: 'sub_uuid', payment_intent_id: 'intent_uuid' },
            error: null
        });

        let txCalled = false;
        Transaction.create = async () => { txCalled = true; return {}; };

        await createParentPackTransaction(req, res);

        assert.strictEqual(res.statusCode, 500);
        assert.strictEqual(txCalled, false, 'FedaPay ne doit pas être appelé en cas derreur de lecture');
        const cancelTransition = transitions.find(t => t.status === 'cancelled');
        assert.ok(cancelTransition);
        assert.strictEqual(cancelTransition.reconciliation_reason, 'INTENT_FETCH_FAILED');
    });

    await t.test('Scénario I - Montant invalide ou négatif (400, intention cancelled)', async () => {
        const { req, res } = createMockReqRes({ schoolSlug: 'ecole_1', studentId: 'student_xyz', planType: 'monthly' });
        const { mockFrom, transitions } = setupBaseMockSupabase({ expectedAmount: -500 });
        supabase.from = mockFrom;

        supabase.rpc = async () => ({
            data: { subscription_id: 'sub_uuid', payment_intent_id: 'intent_uuid' },
            error: null
        });

        let txCalled = false;
        Transaction.create = async () => { txCalled = true; return {}; };

        await createParentPackTransaction(req, res);

        assert.strictEqual(res.statusCode, 400);
        assert.strictEqual(txCalled, false, 'FedaPay ne doit pas être appelé avec un montant négatif');
        const cancelTransition = transitions.find(t => t.status === 'cancelled');
        assert.ok(cancelTransition);
        assert.strictEqual(cancelTransition.reconciliation_reason, 'INVALID_EXPECTED_AMOUNT');
    });

    await t.test('Scénario J - Échec FedaPay Transaction.create (500, reconciliation_required)', async () => {
        const { req, res } = createMockReqRes({ schoolSlug: 'ecole_1', studentId: 'student_xyz', planType: 'monthly' });
        const { mockFrom, transitions } = setupBaseMockSupabase();
        supabase.from = mockFrom;

        supabase.rpc = async () => ({
            data: { subscription_id: 'sub_uuid', payment_intent_id: 'intent_uuid' },
            error: null
        });

        Transaction.create = async () => {
            const err = new Error('Network Timeout');
            err.code = 'ECONNABORTED';
            throw err;
        };

        await createParentPackTransaction(req, res);

        assert.strictEqual(res.statusCode, 500);
        const reconTransition = transitions.find(t => t.status === 'reconciliation_required');
        assert.ok(reconTransition, 'Résultat incertain requiert réconciliation');
        assert.strictEqual(reconTransition.reconciliation_reason, 'PROVIDER_CREATION_OUTCOME_UNKNOWN');
    });

    await t.test('Scénario K - Transaction FedaPay sans ID valide (500, reconciliation_required)', async () => {
        const { req, res } = createMockReqRes({ schoolSlug: 'ecole_1', studentId: 'student_xyz', planType: 'monthly' });
        const { mockFrom, transitions } = setupBaseMockSupabase();
        supabase.from = mockFrom;

        supabase.rpc = async () => ({
            data: { subscription_id: 'sub_uuid', payment_intent_id: 'intent_uuid' },
            error: null
        });

        Transaction.create = async () => ({ id: '' });

        await createParentPackTransaction(req, res);

        assert.strictEqual(res.statusCode, 500);
        const reconTransition = transitions.find(t => t.status === 'reconciliation_required');
        assert.ok(reconTransition);
        assert.strictEqual(reconTransition.reconciliation_reason, 'PROVIDER_RESPONSE_INVALID');
    });

    await t.test('Scénario L - Échec generateToken (502, reconciliation_required avec provider_transaction_id)', async () => {
        const { req, res } = createMockReqRes({ schoolSlug: 'ecole_1', studentId: 'student_xyz', planType: 'monthly' });
        const { mockFrom, transitions } = setupBaseMockSupabase();
        supabase.from = mockFrom;

        supabase.rpc = async () => ({
            data: { subscription_id: 'sub_uuid', payment_intent_id: 'intent_uuid' },
            error: null
        });

        Transaction.create = async () => ({
            id: 'tx_failed_token_123',
            generateToken: async () => { throw new Error('Token generation network error'); }
        });

        await createParentPackTransaction(req, res);

        assert.strictEqual(res.statusCode, 502);
        const reconTransition = transitions.find(t => t.status === 'reconciliation_required');
        assert.ok(reconTransition);
        assert.strictEqual(reconTransition.reconciliation_reason, 'TOKEN_GENERATION_FAILED');
        assert.strictEqual(reconTransition.provider_transaction_id, 'tx_failed_token_123');
    });

    await t.test('Scénario M - Token absent ou vide (502, reconciliation_required)', async () => {
        const { req, res } = createMockReqRes({ schoolSlug: 'ecole_1', studentId: 'student_xyz', planType: 'monthly' });
        const { mockFrom, transitions } = setupBaseMockSupabase();
        supabase.from = mockFrom;

        supabase.rpc = async () => ({
            data: { subscription_id: 'sub_uuid', payment_intent_id: 'intent_uuid' },
            error: null
        });

        Transaction.create = async () => ({
            id: 'tx_empty_token_123',
            generateToken: async () => ({ token: '', url: 'https://sandbox-checkout.fedapay.com/pay' })
        });

        await createParentPackTransaction(req, res);

        assert.strictEqual(res.statusCode, 502);
        const reconTransition = transitions.find(t => t.status === 'reconciliation_required');
        assert.ok(reconTransition);
        assert.strictEqual(reconTransition.reconciliation_reason, 'TOKEN_GENERATION_FAILED');
        assert.strictEqual(reconTransition.provider_transaction_id, 'tx_empty_token_123');
    });

    await t.test('Scénario N - URL non HTTPS ou domaine non autorisé (502, reconciliation_required)', async () => {
        const { req, res } = createMockReqRes({ schoolSlug: 'ecole_1', studentId: 'student_xyz', planType: 'monthly' });
        const { mockFrom, transitions } = setupBaseMockSupabase();
        supabase.from = mockFrom;

        supabase.rpc = async () => ({
            data: { subscription_id: 'sub_uuid', payment_intent_id: 'intent_uuid' },
            error: null
        });

        Transaction.create = async () => ({
            id: 'tx_malicious_url_123',
            generateToken: async () => ({ token: 'tok_abc', url: 'https://malicious-phishing.com/pay' })
        });

        await createParentPackTransaction(req, res);

        assert.strictEqual(res.statusCode, 502);
        const reconTransition = transitions.find(t => t.status === 'reconciliation_required');
        assert.ok(reconTransition);
        assert.strictEqual(reconTransition.reconciliation_reason, 'TOKEN_GENERATION_FAILED');
        assert.strictEqual(reconTransition.provider_transaction_id, 'tx_malicious_url_123');
    });

    await t.test('Scénario O - URL Live en environnement Sandbox rejetée (502, reconciliation_required)', async () => {
        process.env.FEDAPAY_ENVIRONMENT = 'sandbox';
        const { req, res } = createMockReqRes({ schoolSlug: 'ecole_1', studentId: 'student_xyz', planType: 'monthly' });
        const { mockFrom, transitions } = setupBaseMockSupabase();
        supabase.from = mockFrom;

        supabase.rpc = async () => ({
            data: { subscription_id: 'sub_uuid', payment_intent_id: 'intent_uuid' },
            error: null
        });

        // Hôte live renvoyé alors que l'environnement est sandbox
        Transaction.create = async () => ({
            id: 'tx_mismatch_live_url_123',
            generateToken: async () => ({ token: 'tok_abc', url: 'https://checkout.fedapay.com/token/123' })
        });

        await createParentPackTransaction(req, res);

        assert.strictEqual(res.statusCode, 502);
        const reconTransition = transitions.find(t => t.status === 'reconciliation_required');
        assert.ok(reconTransition);
        assert.strictEqual(reconTransition.reconciliation_reason, 'TOKEN_GENERATION_FAILED');
        assert.strictEqual(reconTransition.provider_transaction_id, 'tx_mismatch_live_url_123');
    });

    await t.test('Scénario P - Échec de liaison locale CAS (500, reconciliation_required)', async () => {
        const { req, res } = createMockReqRes({ schoolSlug: 'ecole_1', studentId: 'student_xyz', planType: 'monthly' });

        let updateCount = 0;
        supabase.from = (table) => {
            const query = {
                select: () => query,
                eq: () => query,
                lte: () => query,
                update: (payload) => {
                    query._payload = payload;
                    return query;
                },
                single: async () => {
                    if (table === 'parent_student_ecole_1') return { data: { parent_id: 'parent_123' }, error: null };
                    if (table === 'students_ecole_1') return { data: { id: 'student_xyz', classe: 'CP1', nom: 'Doe', prenom: 'John' }, error: null };
                    if (table === 'student_global_mappings') return { data: { student_global_id: 'global_uuid' }, error: null };
                    if (table === 'parent_pack_pricing') return { data: { id: 'pricing_uuid', annual_duration_months: 9 }, error: null };
                    if (table === 'payment_intents') {
                        if (query._payload) {
                            updateCount++;
                            if (query._payload.status === 'pending') {
                                // Première transition CAS vers pending échoue
                                return { data: null, error: { message: 'DB connection failure' } };
                            }
                            // Transition de compensation vers reconciliation_required
                            return { data: { id: 'intent_uuid' }, error: null };
                        }
                        return { data: { id: 'intent_uuid', expected_amount: 150000 }, error: null };
                    }
                    return { data: null, error: null };
                }
            };
            return query;
        };

        supabase.rpc = async () => ({
            data: { subscription_id: 'sub_uuid', payment_intent_id: 'intent_uuid' },
            error: null
        });

        Transaction.create = async () => ({
            id: 'tx_link_fail_123',
            generateToken: async () => ({
                token: 'tok_ok_123',
                url: 'https://sandbox-checkout.fedapay.com/token/tok_ok_123'
            })
        });

        await createParentPackTransaction(req, res);

        assert.strictEqual(res.statusCode, 500);
        assert.ok(updateCount >= 2, 'Doit tenter pending puis basculer en reconciliation_required');
    });

    await t.test('Scénario Q - Intention précédente en reconciliation_required (409 RECONCILIATION_PENDING, FedaPay non appelé)', async () => {
        const { req, res } = createMockReqRes({ schoolSlug: 'ecole_1', studentId: 'student_xyz', planType: 'monthly' });
        const { mockFrom } = setupBaseMockSupabase();
        supabase.from = mockFrom;

        supabase.rpc = async (rpcName) => {
            if (rpcName === 'prepare_parent_pack_checkout') {
                return {
                    data: null,
                    error: { message: 'FAIL CLOSED: RECONCILIATION_REQUIRED_PENDING (intent_id: 11111111-2222-3333-4444-555555555555)' }
                };
            }
            return { error: { message: 'unknown' } };
        };

        let fedapayCalled = false;
        Transaction.create = async () => {
            fedapayCalled = true;
            return { id: 'should_not_be_called' };
        };

        await createParentPackTransaction(req, res);

        assert.strictEqual(res.statusCode, 409);
        assert.strictEqual(res.body.code, 'RECONCILIATION_PENDING');
        assert.strictEqual(fedapayCalled, false, 'FedaPay Transaction.create ne doit JAMAIS être appelé en cas de réconciliation requise pendante');
    });

    await t.test('Scénario R - Intention déjà active en initializing/pending (409 ACTIVE_INTENT_EXISTS, FedaPay non appelé)', async () => {
        const { req, res } = createMockReqRes({ schoolSlug: 'ecole_1', studentId: 'student_xyz', planType: 'monthly' });
        const { mockFrom } = setupBaseMockSupabase();
        supabase.from = mockFrom;

        supabase.rpc = async (rpcName) => {
            if (rpcName === 'prepare_parent_pack_checkout') {
                return {
                    data: null,
                    error: { message: 'FAIL CLOSED: ACTIVE_INTENT_ALREADY_EXISTS (intent_id: 22222222-3333-4444-5555-666666666666)' }
                };
            }
            return { error: { message: 'unknown' } };
        };

        let fedapayCalled = false;
        Transaction.create = async () => {
            fedapayCalled = true;
            return { id: 'should_not_be_called' };
        };

        await createParentPackTransaction(req, res);

        assert.strictEqual(res.statusCode, 409);
        assert.strictEqual(res.body.code, 'ACTIVE_INTENT_EXISTS');
        assert.strictEqual(fedapayCalled, false, 'FedaPay Transaction.create ne doit JAMAIS être appelé si une intention est déjà active');
    });

    await t.test('Scénario S - Violation contrainte SQL uq_active_parent_pack_intent (409 ACTIVE_INTENT_EXISTS, FedaPay non appelé)', async () => {
        const { req, res } = createMockReqRes({ schoolSlug: 'ecole_1', studentId: 'student_xyz', planType: 'monthly' });
        const { mockFrom } = setupBaseMockSupabase();
        supabase.from = mockFrom;

        supabase.rpc = async (rpcName) => {
            if (rpcName === 'prepare_parent_pack_checkout') {
                return {
                    data: null,
                    error: { message: 'duplicate key value violates unique constraint "uq_active_parent_pack_intent"' }
                };
            }
            return { error: { message: 'unknown' } };
        };

        let fedapayCalled = false;
        Transaction.create = async () => {
            fedapayCalled = true;
            return { id: 'should_not_be_called' };
        };

        await createParentPackTransaction(req, res);

        assert.strictEqual(res.statusCode, 409);
        assert.strictEqual(res.body.code, 'ACTIVE_INTENT_EXISTS');
        assert.strictEqual(fedapayCalled, false, 'FedaPay Transaction.create ne doit JAMAIS être appelé sur collision d index unique');
    });
});
