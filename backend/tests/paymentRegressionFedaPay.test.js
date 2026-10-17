'use strict';
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'dummy';
process.env.JWT_SECRET = 'dummy';

const test = require('node:test');
const assert = require('node:assert');
const {
    configureFedaPay,
    validateFedaPayRedirectUrl,
    createTransaction,
    createDonationTransaction,
    fedapayWebhook
} = require('../controllers/paymentController');
const { supabase } = require('../utils/supabase');
const { Transaction, FedaPay, Webhook } = require('fedapay');

function createMockReqRes(body = {}, params = {}, headers = {}, user = null) {
    const req = { body, params, headers, user };
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

test('Non-régression FedaPay : configureFedaPay, validateFedaPayRedirectUrl, Scolarité, Dons et Webhook', async (t) => {
    const originalFrom = supabase.from;
    const originalEnv = { ...process.env };
    const originalTxCreate = Transaction.create;

    t.afterEach(() => {
        supabase.from = originalFrom;
        Transaction.create = originalTxCreate;
        process.env.FEDAPAY_SECRET_KEY = originalEnv.FEDAPAY_SECRET_KEY;
        process.env.FEDAPAY_ENVIRONMENT = originalEnv.FEDAPAY_ENVIRONMENT;
        process.env.FEDAPAY_WEBHOOK_SECRET = originalEnv.FEDAPAY_WEBHOOK_SECRET;
    });

    await t.test('1. validateFedaPayRedirectUrl - validation stricte HTTPS, hôtes officiels et cohérence environnementale', () => {
        // Validation basique
        assert.strictEqual(validateFedaPayRedirectUrl(null), false);
        assert.strictEqual(validateFedaPayRedirectUrl(''), false);
        assert.strictEqual(validateFedaPayRedirectUrl('not-a-url'), false);
        assert.strictEqual(validateFedaPayRedirectUrl('http://sandbox-checkout.fedapay.com/pay'), false, 'HTTP doit être refusé');
        assert.strictEqual(validateFedaPayRedirectUrl('https://phishing.fedapay.com.attacker.com/pay'), false);
        assert.strictEqual(validateFedaPayRedirectUrl('https://user:pass@checkout.fedapay.com/pay'), false, 'Identifiants inline refusés');

        // Sans spécification denvironnement (rétro-compatibilité)
        assert.strictEqual(validateFedaPayRedirectUrl('https://sandbox-checkout.fedapay.com/pay'), true);
        assert.strictEqual(validateFedaPayRedirectUrl('https://checkout.fedapay.com/pay'), true);

        // En environnement Sandbox (isLive === false)
        assert.strictEqual(validateFedaPayRedirectUrl('https://sandbox-checkout.fedapay.com/token/123', false), true);
        assert.strictEqual(validateFedaPayRedirectUrl('https://checkout.fedapay.com/token/123', false), false, 'URL Live doit être rejetée en mode Sandbox');

        // En environnement Live (isLive === true)
        assert.strictEqual(validateFedaPayRedirectUrl('https://checkout.fedapay.com/token/123', true), true);
        assert.strictEqual(validateFedaPayRedirectUrl('https://sandbox-checkout.fedapay.com/token/123', true), false, 'URL Sandbox doit être rejetée en mode Live');
    });

    await t.test('2. configureFedaPay - protection anti-clé Live en Sandbox et gestion fail-closed', async () => {
        // Clé absente
        process.env.FEDAPAY_SECRET_KEY = '';
        process.env.FEDAPAY_ENVIRONMENT = 'sandbox';
        supabase.from = () => ({ select: async () => ({ data: [], error: null }) });
        const resNoKey = await configureFedaPay();
        assert.strictEqual(resNoKey.isConfigured, false);
        assert.strictEqual(resNoKey.reason, 'MISSING_SECRET_KEY');

        // Clé par défaut interdite
        process.env.FEDAPAY_SECRET_KEY = 'sk_sandbox_default';
        const resDefKey = await configureFedaPay();
        assert.strictEqual(resDefKey.isConfigured, false);

        // Clé live en environnement sandbox (REJET STRICT)
        process.env.FEDAPAY_SECRET_KEY = 'sk_live_super_secret_real_key';
        process.env.FEDAPAY_ENVIRONMENT = 'sandbox';
        const resLiveInSandbox = await configureFedaPay();
        assert.strictEqual(resLiveInSandbox.isConfigured, false);
        assert.strictEqual(resLiveInSandbox.reason, 'LIVE_KEY_FORBIDDEN_IN_SANDBOX');

        // Clé live injectée via global_settings en sandbox (REJET STRICT)
        process.env.FEDAPAY_SECRET_KEY = 'sk_sandbox_test';
        supabase.from = () => ({
            select: async () => ({
                data: [
                    { key: 'payment_gateway', value: 'fedapay' },
                    { key: 'payment_secret_key', value: 'sk_live_accidental_prod_dump_key' }
                ],
                error: null
            })
        });
        const resGlobalLiveInSandbox = await configureFedaPay();
        assert.strictEqual(resGlobalLiveInSandbox.isConfigured, false);
        assert.strictEqual(resGlobalLiveInSandbox.reason, 'LIVE_KEY_FORBIDDEN_IN_SANDBOX');

        // Clé sandbox valide en sandbox (SUCCÈS)
        process.env.FEDAPAY_SECRET_KEY = 'sk_sandbox_valid_synthetic_123';
        process.env.FEDAPAY_ENVIRONMENT = 'sandbox';
        supabase.from = () => ({ select: async () => ({ data: [], error: null }) });
        const resValidSandbox = await configureFedaPay();
        assert.strictEqual(resValidSandbox.isConfigured, true);
        assert.strictEqual(resValidSandbox.isLive, false);

        // Clé live valide en live (SUCCÈS)
        process.env.FEDAPAY_SECRET_KEY = 'sk_live_valid_synthetic_123';
        process.env.FEDAPAY_ENVIRONMENT = 'live';
        const resValidLive = await configureFedaPay();
        assert.strictEqual(resValidLive.isConfigured, true);
        assert.strictEqual(resValidLive.isLive, true);
    });

    await t.test('3. createTransaction (Scolarité) - fonctionne avec sandbox et rejette clé live interdite', async () => {
        process.env.FEDAPAY_SECRET_KEY = 'sk_live_attempt_in_sandbox';
        process.env.FEDAPAY_ENVIRONMENT = 'sandbox';

        const { req, res } = createMockReqRes({
            studentId: 'stud_123',
            amount: 50000,
            parentPhone: '+221771234567',
            parentName: 'Dupont'
        }, {}, {}, { id: 'admin_1', role: 'admin', schoolSlug: 'ecole_test' });

        supabase.from = (table) => {
            const query = {
                select: () => query,
                eq: () => query,
                lte: () => query,
                insert: () => query,
                update: () => query,
                single: async () => {
                    if (table === 'students_ecole_test') {
                        return { data: { id: 'stud_123', nom: 'Jean', prenom: 'Paul', ecolage: 100000, deja_paye: 0 }, error: null };
                    }
                    if (table === 'payment_intents') {
                        return { data: { id: 'intent_tuition_1' }, error: null };
                    }
                    if (table === 'global_settings') {
                        return { data: [], error: null };
                    }
                    return { data: null, error: null };
                }
            };
            return query;
        };

        let txCreated = false;
        Transaction.create = async () => {
            const cfg = await configureFedaPay();
            if (!cfg.isConfigured) throw new Error('FEDAPAY_NOT_CONFIGURED');
            txCreated = true;
            return { id: 'tx_tuition' };
        };

        await createTransaction(req, res);

        assert.strictEqual(txCreated, false, 'Transaction FedaPay scolarité ne doit pas être créée avec clé live en sandbox');
        assert.strictEqual(res.statusCode, 500);
    });

    await t.test('4. createDonationTransaction (Dons) - rejette clé live interdite en sandbox', async () => {
        process.env.FEDAPAY_SECRET_KEY = 'sk_live_attempt_in_sandbox';
        process.env.FEDAPAY_ENVIRONMENT = 'sandbox';

        const { req, res } = createMockReqRes({
            amount: 25000,
            donor_name: 'Bienfaiteur'
        }, {
            schoolSlug: 'ecole_test',
            campaignId: '00000000-0000-0000-0000-000000000001'
        });

        supabase.from = (table) => {
            const query = {
                select: () => query,
                eq: () => query,
                lte: () => query,
                insert: () => query,
                update: () => query,
                single: async () => {
                    if (table === 'campaigns_ecole_test') {
                        return { data: { id: '00000000-0000-0000-0000-000000000001', title: 'Cantine', status: 'active' }, error: null };
                    }
                    if (table === 'payment_intents') {
                        return { data: { id: 'intent_don_1' }, error: null };
                    }
                    if (table === 'donations_ecole_test') {
                        return { data: { id: 'don_1' }, error: null };
                    }
                    if (table === 'global_settings') {
                        return { data: [], error: null };
                    }
                    return { data: null, error: null };
                }
            };
            return query;
        };

        let txCreated = false;
        Transaction.create = async () => {
            const cfg = await configureFedaPay();
            if (!cfg.isConfigured) throw new Error('FEDAPAY_NOT_CONFIGURED');
            txCreated = true;
            return { id: 'tx_don' };
        };

        await createDonationTransaction(req, res);

        assert.strictEqual(txCreated, false, 'Transaction FedaPay don ne doit pas être créée avec clé live en sandbox');
        assert.strictEqual(res.statusCode, 500);
    });

    await t.test('5. fedapayWebhook - signature manquante ou invalide rejetée', async () => {
        process.env.FEDAPAY_WEBHOOK_SECRET = 'whsec_test_secret_123';
        const { req, res } = createMockReqRes({}, {}, {});

        await fedapayWebhook(req, res);

        assert.strictEqual(res.statusCode, 400);
        assert.ok(res.body.error.includes('Signature'));
    });
});
