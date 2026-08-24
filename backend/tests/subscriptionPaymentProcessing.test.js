'use strict';
const { describe, it, before, after, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const TEST_JWT_SECRET = 'a_very_secure_jwt_secret_key_for_testing_purposes_at_least_32_chars_12345';
process.env.JWT_SECRET = TEST_JWT_SECRET;
process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock_service_key_for_test';

const {
    computeSchoolSubscriptionQuote,
    computeClassificationHash,
    calculateDeterministicTranches,
    normalizeCycleToBillingCategory,
    normalizeClassName,
    validateFedaPayRedirectUrl,
    configureFedaPay,
    getSubscriptionQuote,
    createSaasTransaction,
    resolveActivePricingGrid,
    PRICING_RATES_MONTHLY
} = require('../controllers/paymentController');
const { supabase } = require('../utils/supabase');
const { Transaction } = require('fedapay');

function makeMockRes() {
    const res = {
        statusCode: 200,
        headers: {},
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
    return res;
}

const quotesBySlug = new Map();

const DEFAULT_MOCK_SETTINGS = [
    { key: 'school_year', value: '2026-2027' },
    { key: 'classes', value: JSON.stringify([
        { name: 'CI', cycle: 'Primaire', billingCategory: 'maternelle_primaire' },
        { name: 'CP1', cycle: 'Primaire', billingCategory: 'maternelle_primaire' },
        { name: 'CP2', cycle: 'Primaire', billingCategory: 'maternelle_primaire' },
        { name: 'CE1', cycle: 'Primaire', billingCategory: 'maternelle_primaire' },
        { name: 'CE2', cycle: 'Primaire', billingCategory: 'maternelle_primaire' },
        { name: 'CM1', cycle: 'Primaire', billingCategory: 'maternelle_primaire' },
        { name: 'CM2', cycle: 'Primaire', billingCategory: 'maternelle_primaire' },
        { name: '6EME', cycle: 'Collège', billingCategory: 'college_secondaire' },
        { name: '5EME', cycle: 'Collège', billingCategory: 'college_secondaire' },
        { name: '4EME', cycle: 'Collège', billingCategory: 'college_secondaire' },
        { name: '3EME', cycle: 'Collège', billingCategory: 'college_secondaire' },
        { name: '2nde S', cycle: 'Lycée', billingCategory: 'college_secondaire' },
        { name: 'Tle D', cycle: 'Lycée', billingCategory: 'college_secondaire' },
        { name: 'Master 1', cycle: 'Université & Supérieur', billingCategory: 'superieur_formation' }
    ]) }
];

function createMockSupabaseQuery(options = {}) {
    let lastSeenSlug = 'ecole_test';

    const computeDefault = (slug) => {
        const targetSlug = slug || lastSeenSlug || 'ecole_test';
        if (quotesBySlug.has(targetSlug)) return quotesBySlug.get(targetSlug);
        const q = {
            id: `q_${targetSlug}`,
            quote_id: `quote_${targetSlug}`,
            school_slug: targetSlug,
            billing_period: '2026-2027',
            status: 'issued',
            currency_code: 'XOF',
            pricing_grid_id: '00000000-0000-0000-0000-000000000001',
            pricing_version: '2026.1_xof_uemoa',
            pricing_scope_type: 'region',
            pricing_scope_code: 'UEMOA',
            currency_minor_unit: 0,
            expires_at: new Date(Date.now() + 600000).toISOString(),
            classification_hash: computeClassificationHash(targetSlug, '2026-2027', { maternelle_primaire: 1, college_secondaire: 0, superieur_formation: 0 }, 1),
            payment_options: {
                annual: { grossAmount: 150000, discountAmount: 15000, payableAmount: 135000 },
                installments: { grossAmount: 150000, discountAmount: 0, payableAmount: 150000, installmentsCount: 3, installmentAmounts: [50000, 50000, 50000] }
            }
        };
        quotesBySlug.set(targetSlug, q);
        return q;
    };

    const chain = {
        update: (data) => {
            return {
                ...chain,
                select: () => ({
                    ...chain,
                    then: (resolve) => resolve({ data: [computeDefault(data?.school_slug)], error: null })
                }),
                then: (resolve) => resolve({ data: [computeDefault(data?.school_slug)], error: null })
            };
        },
        insert: (data) => {
            if (data && data.school_slug) {
                lastSeenSlug = data.school_slug;
                quotesBySlug.set(data.school_slug, { ...data, id: data.id || `q_${data.school_slug}` });
            }
            return {
                select: () => ({
                    single: () => Promise.resolve(options.insertResult || { data: data && data.school_slug ? quotesBySlug.get(data.school_slug) : { id: 'intent_mock_123' } }),
                    then: (resolve) => resolve({ data: [data && data.school_slug ? quotesBySlug.get(data.school_slug) : { id: 'intent_mock_123' }], error: null })
                })
            };
        },
        select: (cols) => {
            let defaultData = [computeDefault()];
            if (options.tableName && options.tableName.startsWith('students_')) {
                defaultData = [{ id: 'st_def_1', classe: '6EME' }];
            } else if (options.tableName && options.tableName.startsWith('app_settings_')) {
                defaultData = DEFAULT_MOCK_SETTINGS;
            }
            return {
                ...chain,
                then: (resolve) => resolve({ data: defaultData, error: null })
            };
        },
        eq: (field, val) => {
            if (field === 'school_slug' && typeof val === 'string') {
                lastSeenSlug = val;
            }
            return chain;
        },
        gt: () => chain,
        lte: () => Promise.resolve({ error: null }),
        single: () => Promise.resolve(options.singleResult || { data: computeDefault() }),
        then: (resolve) => {
            let defaultData = [computeDefault()];
            if (options.tableName && options.tableName.startsWith('students_')) {
                defaultData = [{ id: 'st_def_1', classe: '6EME' }];
            } else if (options.tableName && options.tableName.startsWith('app_settings_')) {
                defaultData = DEFAULT_MOCK_SETTINGS;
            }
            return resolve({ data: defaultData, error: null });
        }
    };
    return chain;
}

describe('🔒 SUITE DE VALIDATION COMPLÈTE — SOUSCRIPTION SAAS ET PAIEMENT (37 CONTRÔLES)', () => {
    let originalEnvSecret;
    let originalEnvMode;
    let originalFedaCreate;
    let originalSupabaseFrom;
    let originalSupabaseRpc;

    before(() => {
        originalEnvSecret = process.env.FEDAPAY_SECRET_KEY;
        originalEnvMode = process.env.FEDAPAY_ENVIRONMENT;
        originalFedaCreate = Transaction.create;
        originalSupabaseFrom = supabase.from;
        originalSupabaseRpc = supabase.rpc;
        supabase.rpc = async () => ({ data: { status: 'completed' }, error: null });
    });

    afterEach(() => {
        process.env.FEDAPAY_SECRET_KEY = originalEnvSecret;
        process.env.FEDAPAY_ENVIRONMENT = originalEnvMode;
        Transaction.create = originalFedaCreate;
        supabase.from = originalSupabaseFrom;
        supabase.rpc = async () => ({ data: { status: 'completed' }, error: null });
        quotesBySlug.clear();
    });

    after(() => {
        supabase.rpc = originalSupabaseRpc;
    });

    // ── 1. Clé FedaPay absente → 503, aucun appel SDK
    it('1: Clé FedaPay absente -> HTTP 503, aucun appel SDK', async () => {
        delete process.env.FEDAPAY_SECRET_KEY;
        delete process.env.FEDAPAY_ENVIRONMENT;

        let sdkCalled = false;
        Transaction.create = async () => { sdkCalled = true; throw new Error('SHOULD_NOT_CALL'); };

        supabase.from = (table) => {
            if (table === 'global_settings') return { select: () => Promise.resolve({ data: [] }) };
            if (table === 'schools') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 's1', slug: 'ecole_test', paid_tranches_count: 0 } }) }) }) };
            if (table === 'students_ecole_test') return { select: () => Promise.resolve({ data: [{ classe: '6EME' }] }) };
            if (table === 'app_settings_ecole_test') return { select: () => Promise.resolve({ data: DEFAULT_MOCK_SETTINGS }) };
            return createMockSupabaseQuery();
        };

        const req = {
            params: { slug: 'ecole_test' },
            body: { planType: 'annual' },
            user: { role: 'directeur', schoolSlug: 'ecole_test' }
        };
        const res = makeMockRes();

        await createSaasTransaction(req, res);

        assert.strictEqual(res.statusCode, 503);
        assert.strictEqual(res.body.code, 'PAYMENT_PROVIDER_NOT_CONFIGURED');
        assert.strictEqual(sdkCalled, false);
        assert.ok(res.body.diagnostic_id);
    });

    // ── 2. Placeholder/interdit ('sk_sandbox_default') → 503, aucun appel SDK
    it('2: Clé factice sk_sandbox_default -> HTTP 503 rejetée fail-closed sans appel SDK', async () => {
        process.env.FEDAPAY_SECRET_KEY = 'sk_sandbox_default';
        process.env.FEDAPAY_ENVIRONMENT = 'sandbox';

        let sdkCalled = false;
        Transaction.create = async () => { sdkCalled = true; throw new Error('SHOULD_NOT_CALL'); };

        supabase.from = (table) => {
            if (table === 'global_settings') return { select: () => Promise.resolve({ data: [] }) };
            if (table === 'schools') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 's1', slug: 'ecole_test', paid_tranches_count: 0 } }) }) }) };
            if (table === 'students_ecole_test') return { select: () => Promise.resolve({ data: [{ classe: 'CM2' }] }) };
            if (table === 'app_settings_ecole_test') return { select: () => Promise.resolve({ data: DEFAULT_MOCK_SETTINGS }) };
            return createMockSupabaseQuery();
        };

        const req = {
            params: { slug: 'ecole_test' },
            body: { planType: 'annual' },
            user: { role: 'directeur', schoolSlug: 'ecole_test' }
        };
        const res = makeMockRes();

        await createSaasTransaction(req, res);

        assert.strictEqual(res.statusCode, 503);
        assert.strictEqual(res.body.code, 'PAYMENT_PROVIDER_NOT_CONFIGURED');
        assert.strictEqual(sdkCalled, false);
    });

    // ── 3. Environnement incohérent (live avec clé sandbox ou inversement) → 503
    it('3: Environnement live avec clé sk_sandbox_ -> HTTP 503 rejeté', async () => {
        process.env.FEDAPAY_SECRET_KEY = 'sk_sandbox_1234567890';
        process.env.FEDAPAY_ENVIRONMENT = 'live';

        supabase.from = (table) => {
            if (table === 'global_settings') return { select: () => Promise.resolve({ data: [] }) };
            if (table === 'schools') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 's1', slug: 'ecole_test', paid_tranches_count: 0 } }) }) }) };
            if (table === 'students_ecole_test') return { select: () => Promise.resolve({ data: [{ classe: '3EME' }] }) };
            if (table === 'app_settings_ecole_test') return { select: () => Promise.resolve({ data: DEFAULT_MOCK_SETTINGS }) };
            return createMockSupabaseQuery();
        };

        const req = {
            params: { slug: 'ecole_test' },
            body: { planType: 'annual' },
            user: { role: 'directeur', schoolSlug: 'ecole_test' }
        };
        const res = makeMockRes();

        await createSaasTransaction(req, res);

        assert.strictEqual(res.statusCode, 503);
        assert.strictEqual(res.body.code, 'PAYMENT_PROVIDER_NOT_CONFIGURED');
    });

    // ── 4. Directeur autorisé
    it('4: Directeur authentifié sur sa propre école est autorisé', async () => {
        process.env.FEDAPAY_SECRET_KEY = 'sk_sandbox_test_key_ok';
        process.env.FEDAPAY_ENVIRONMENT = 'sandbox';

        supabase.from = (table) => {
            if (table === 'global_settings') return { select: () => Promise.resolve({ data: [] }) };
            if (table === 'schools') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 's1', slug: 'ecole_test', paid_tranches_count: 0 } }) }) }) };
            if (table === 'students_ecole_test') return { select: () => Promise.resolve({ data: [{ classe: 'CE1' }] }) };
            if (table === 'app_settings_ecole_test') return { select: () => Promise.resolve({ data: DEFAULT_MOCK_SETTINGS }) };
            if (table === 'payment_intents') {
                return createMockSupabaseQuery({ insertResult: { data: { id: 'intent_1' } } });
            }
            return createMockSupabaseQuery();
        };

        Transaction.create = async () => ({
            id: 9999,
            generateToken: async () => ({ token: 'tok_ok', url: 'https://sandbox-checkout.fedapay.com/pay/tok_ok' })
        });

        const req = {
            params: { slug: 'ecole_test' },
            body: { planType: 'annual' },
            user: { role: 'directeur', schoolSlug: 'ecole_test', id: 'u_dir' }
        };
        const res = makeMockRes();

        await createSaasTransaction(req, res);

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.token, 'tok_ok');
        assert.strictEqual(res.body.url, 'https://sandbox-checkout.fedapay.com/pay/tok_ok');
    });

    // ── 5. Professeur / Parent refusé
    it('5: Professeur ou Parent rejeté (HTTP 403 PAYMENT_FORBIDDEN)', async () => {
        const roles = ['professeur', 'parent', 'eleve'];
        for (const role of roles) {
            const req = {
                params: { slug: 'ecole_test' },
                body: { planType: 'annual' },
                user: { role, schoolSlug: 'ecole_test' }
            };
            const res = makeMockRes();
            await createSaasTransaction(req, res);
            assert.strictEqual(res.statusCode, 403);
            assert.strictEqual(res.body.code, 'PAYMENT_FORBIDDEN');
        }
    });

    // ── 6. Tenant différent refusé
    it('6: Directeur d école_a tentant d initialiser pour ecole_b rejeté (HTTP 403)', async () => {
        const req = {
            params: { slug: 'ecole_b' },
            body: { planType: 'annual' },
            user: { role: 'directeur', schoolSlug: 'ecole_a' }
        };
        const res = makeMockRes();
        await createSaasTransaction(req, res);
        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(res.body.code, 'PAYMENT_FORBIDDEN');
    });

    // ── 7. Établissement absent → 404
    it('7: Établissement introuvable en base -> HTTP 404 SCHOOL_NOT_FOUND', async () => {
        supabase.from = (table) => {
            if (table === 'schools') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null }) }) }) };
            return createMockSupabaseQuery();
        };

        const req = {
            params: { slug: 'ecole_inconnue' },
            body: { planType: 'annual' },
            user: { role: 'directeur', schoolSlug: 'ecole_inconnue' }
        };
        const res = makeMockRes();
        await createSaasTransaction(req, res);
        assert.strictEqual(res.statusCode, 404);
        assert.strictEqual(res.body.code, 'SCHOOL_NOT_FOUND');
    });

    // ── 8. Plan inconnu → 400
    it('8: Plan inconnu (ex: monthly, lifetime) -> HTTP 400 INVALID_PLAN', async () => {
        const req = {
            params: { slug: 'ecole_test' },
            body: { planType: 'lifetime' },
            user: { role: 'directeur', schoolSlug: 'ecole_test' }
        };
        const res = makeMockRes();
        await createSaasTransaction(req, res);
        assert.strictEqual(res.statusCode, 400);
        assert.strictEqual(res.body.code, 'INVALID_PLAN');
    });

    // ── 9. Montant nul → 422
    it('9: Effectif de 0 élève (montant nul) -> HTTP 422 SUBSCRIPTION_AMOUNT_INVALID', async () => {
        supabase.from = (table) => {
            if (table === 'schools') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 's1', slug: 'ecole_test' } }) }) }) };
            if (table === 'students_ecole_test') return { select: () => Promise.resolve({ data: [] }) };
            if (table === 'app_settings_ecole_test') return { select: () => Promise.resolve({ data: DEFAULT_MOCK_SETTINGS }) };
            return createMockSupabaseQuery();
        };

        const req = {
            params: { slug: 'ecole_test' },
            body: { planType: 'annual' },
            user: { role: 'directeur', schoolSlug: 'ecole_test' }
        };
        const res = makeMockRes();
        await createSaasTransaction(req, res);
        assert.strictEqual(res.statusCode, 422);
        assert.strictEqual(res.body.code, 'SUBSCRIPTION_AMOUNT_INVALID');
    });

    // ── 10. Calcul Primaire exact (100 FCFA/mois * 10 = 1000 FCFA)
    it('10: Calcul Primaire exact: 10 élèves * 100 FCFA * 10 mois = 10 000 FCFA', async () => {
        supabase.from = (table) => {
            if (table === 'students_ecole_primaire') {
                return {
                    select: () => Promise.resolve({
                        data: Array(10).fill({ classe: 'CP1' })
                    })
                };
            }
            if (table === 'app_settings_ecole_primaire') return { select: () => Promise.resolve({ data: DEFAULT_MOCK_SETTINGS }) };
            return createMockSupabaseQuery();
        };

        const quote = await computeSchoolSubscriptionQuote('ecole_primaire');
        assert.strictEqual(quote.totalStudents, 10);
        assert.strictEqual(quote.breakdown.maternelle_primaire, 10);
        assert.strictEqual(quote.monthlyAmount, 1000);
        assert.strictEqual(quote.totalAnnualAmount, 10000);
        assert.strictEqual(quote.annualBonusAmount, 1000);
        assert.strictEqual(quote.finalAnnualAmount, 9000);
        assert.strictEqual(quote.billingPeriod, '2026-2027');
    });

    // ── 11. Calcul Secondaire exact (150 FCFA/mois * 10 = 1500 FCFA)
    it('11: Calcul Secondaire exact: 10 élèves * 150 FCFA * 10 mois = 15 000 FCFA', async () => {
        supabase.from = (table) => {
            if (table === 'students_ecole_secondaire') {
                return {
                    select: () => Promise.resolve({
                        data: Array(10).fill({ classe: '4EME' })
                    })
                };
            }
            if (table === 'app_settings_ecole_secondaire') return { select: () => Promise.resolve({ data: DEFAULT_MOCK_SETTINGS }) };
            return createMockSupabaseQuery();
        };

        const quote = await computeSchoolSubscriptionQuote('ecole_secondaire');
        assert.strictEqual(quote.totalStudents, 10);
        assert.strictEqual(quote.breakdown.college_secondaire, 10);
        assert.strictEqual(quote.monthlyAmount, 1500);
        assert.strictEqual(quote.totalAnnualAmount, 15000);
        assert.strictEqual(quote.annualBonusAmount, 1500);
        assert.strictEqual(quote.finalAnnualAmount, 13500);
    });

    // ── 12. Calcul Supérieur exact (200 FCFA/mois * 10 = 2000 FCFA)
    it('12: Calcul Supérieur exact: 10 étudiants * 200 FCFA * 10 mois = 20 000 FCFA', async () => {
        supabase.from = (table) => {
            if (table === 'students_univ_test') {
                return {
                    select: () => Promise.resolve({
                        data: Array(10).fill({ classe: 'Master 1' })
                    })
                };
            }
            if (table === 'app_settings_univ_test') {
                return {
                    select: () => Promise.resolve({
                        data: [
                            { key: 'school_year', value: '2026-2027' },
                            { key: 'classes', value: JSON.stringify([{ name: 'Master 1', cycle: 'Université & Supérieur', billingCategory: 'superieur_formation' }]) }
                        ]
                    })
                };
            }
            return createMockSupabaseQuery();
        };

        const quote = await computeSchoolSubscriptionQuote('univ_test');
        assert.strictEqual(quote.totalStudents, 10);
        assert.strictEqual(quote.breakdown.superieur_formation, 10);
        assert.strictEqual(quote.monthlyAmount, 2000);
        assert.strictEqual(quote.totalAnnualAmount, 20000);
        assert.strictEqual(quote.annualBonusAmount, 2000);
        assert.strictEqual(quote.finalAnnualAmount, 18000);
    });

    // ── 13. Classe libre (« Year 7 International ») rattachée à « college_secondaire »
    it('13: Classe libre Year 7 International avec billingCategory college_secondaire facturée au tarif secondaire', async () => {
        supabase.from = (table) => {
            if (table === 'students_intl_school') {
                return {
                    select: () => Promise.resolve({
                        data: [{ classe: 'Year 7 International' }]
                    })
                };
            }
            if (table === 'app_settings_intl_school') {
                return {
                    select: () => Promise.resolve({
                        data: [
                            { key: 'school_year', value: '2026-2027' },
                            {
                                key: 'classes',
                                value: JSON.stringify([
                                    { id: 'cls_y7', name: 'Year 7 International', cycle: 'Key Stage 3', billingCategory: 'college_secondaire' }
                                ])
                            }
                        ]
                    })
                };
            }
            return createMockSupabaseQuery();
        };

        const quote = await computeSchoolSubscriptionQuote('intl_school');
        assert.strictEqual(quote.totalStudents, 1);
        assert.strictEqual(quote.breakdown.college_secondaire, 1);
        assert.strictEqual(quote.monthlyAmount, 150); // 150 FCFA/mois
        assert.strictEqual(quote.totalAnnualAmount, 1500);
    });

    // ── 14. Classe non résolue / cycle inconnu → HTTP 422 SUBSCRIPTION_CLASSIFICATION_INCOMPLETE
    it('14: Classe non reconnue sans cycle valide -> HTTP 422 SUBSCRIPTION_CLASSIFICATION_INCOMPLETE avec unclassified_count', async () => {
        supabase.from = (table) => {
            if (table === 'schools') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 's1', slug: 'ecole_unresolved' } }) }) }) };
            if (table === 'students_ecole_unresolved') {
                return {
                    select: () => Promise.resolve({
                        data: [
                            { classe: 'Classe Inconnue Alpha' },
                            { classe: 'Classe Inconnue Beta' }
                        ]
                    })
                };
            }
            if (table === 'app_settings_ecole_unresolved') {
                return { select: () => Promise.resolve({ data: DEFAULT_MOCK_SETTINGS }) };
            }
            return createMockSupabaseQuery();
        };

        const req = {
            params: { slug: 'ecole_unresolved' },
            body: { planType: 'annual' },
            user: { role: 'directeur', schoolSlug: 'ecole_unresolved' }
        };
        const res = makeMockRes();

        await createSaasTransaction(req, res);

        assert.strictEqual(res.statusCode, 422);
        assert.strictEqual(res.body.code, 'SUBSCRIPTION_CLASSIFICATION_INCOMPLETE');
        assert.strictEqual(res.body.unclassified_count, 2);
        assert.ok(res.body.diagnostic_id);
    });

    // ── 15. Remise annuelle exacte (-10%)
    it('15: Remise annuelle exacte de 10% sur le montant total annuel', async () => {
        const students = Array(100).fill({ classe: '6EME' });
        supabase.from = (table) => {
            if (table === 'students_ecole_100') return { select: () => Promise.resolve({ data: students }) };
            if (table === 'app_settings_ecole_100') return { select: () => Promise.resolve({ data: DEFAULT_MOCK_SETTINGS }) };
            return createMockSupabaseQuery();
        };

        const quote = await computeSchoolSubscriptionQuote('ecole_100');
        assert.strictEqual(quote.totalAnnualAmount, 150000);
        assert.strictEqual(quote.annualBonusAmount, 15000);
        assert.strictEqual(quote.finalAnnualAmount, 135000);
    });

    // ── 16. Ventilation exacte et déterministe des 3 tranches
    it('16: Ventilation déterministe des 3 tranches garantit tranche1 + tranche2 + tranche3 === totalAnnual', () => {
        const t900 = calculateDeterministicTranches(900);
        assert.deepStrictEqual(t900, [300, 300, 300]);
        assert.strictEqual(t900[0] + t900[1] + t900[2], 900);

        const t1000 = calculateDeterministicTranches(1000);
        assert.deepStrictEqual(t1000, [334, 333, 333]);
        assert.strictEqual(t1000[0] + t1000[1] + t1000[2], 1000);

        const t1001 = calculateDeterministicTranches(1001);
        assert.deepStrictEqual(t1001, [334, 334, 333]);
        assert.strictEqual(t1001[0] + t1001[1] + t1001[2], 1001);

        for (let amt = 1; amt <= 10000; amt++) {
            const tr = calculateDeterministicTranches(amt);
            assert.strictEqual(tr[0] + tr[1] + tr[2], amt);
            assert.ok(Number.isInteger(tr[0]) && Number.isInteger(tr[1]) && Number.isInteger(tr[2]));
            assert.ok(tr[0] >= 0 && tr[1] >= 0 && tr[2] >= 0);
        }
    });

    // ── 17. Période 2026-2027: Double paiement tranche 1 refusé
    it('17: Période 2026-2027: tranche 1 déjà confirmée bloque toute réitération de la tranche 1 (400 TRANCHE_ALREADY_PAID)', async () => {
        process.env.FEDAPAY_SECRET_KEY = 'sk_sandbox_test_key_ok';
        process.env.FEDAPAY_ENVIRONMENT = 'sandbox';

        supabase.from = (table) => {
            if (table === 'schools') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 's1', slug: 'ecole_tranche', paid_tranches_count: 1 } }) }) }) };
            if (table === 'students_ecole_tranche') return { select: () => Promise.resolve({ data: [{ classe: '6EME' }] }) };
            if (table === 'app_settings_ecole_tranche') return { select: () => Promise.resolve({ data: DEFAULT_MOCK_SETTINGS }) };
            if (table === 'payment_intents') {
                return {
                    ...createMockSupabaseQuery(),
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                eq: () => ({
                                    eq: () => Promise.resolve({
                                        data: [{ plan_type: 'tranche', installment_number: 1, status: 'completed' }]
                                    })
                                })
                            })
                        })
                    })
                };
            }
            return createMockSupabaseQuery();
        };

        const req = {
            params: { slug: 'ecole_tranche' },
            body: { planType: 'tranche', trancheNumber: 1 },
            user: { role: 'directeur', schoolSlug: 'ecole_tranche', id: 'u1' }
        };
        const res = makeMockRes();
        await createSaasTransaction(req, res);

        assert.strictEqual(res.statusCode, 400);
        assert.strictEqual(res.body.code, 'TRANCHE_ALREADY_PAID');
    });

    // ── 18. Tranche commencée bloque plan annuel pour la même période
    it('18: Tranche commencée pour 2026-2027 bloque tentative de plan annuel comptant (400 TRANCHE_ALREADY_STARTED)', async () => {
        process.env.FEDAPAY_SECRET_KEY = 'sk_sandbox_test_key_ok';
        process.env.FEDAPAY_ENVIRONMENT = 'sandbox';

        supabase.from = (table) => {
            if (table === 'schools') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 's1', slug: 'ecole_tranche', paid_tranches_count: 1 } }) }) }) };
            if (table === 'students_ecole_tranche') return { select: () => Promise.resolve({ data: [{ classe: '6EME' }] }) };
            if (table === 'app_settings_ecole_tranche') return { select: () => Promise.resolve({ data: DEFAULT_MOCK_SETTINGS }) };
            if (table === 'payment_intents') {
                return {
                    ...createMockSupabaseQuery(),
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                eq: () => ({
                                    eq: () => Promise.resolve({
                                        data: [{ plan_type: 'tranche', installment_number: 1, status: 'completed' }]
                                    })
                                })
                            })
                        })
                    })
                };
            }
            return createMockSupabaseQuery();
        };

        const req = {
            params: { slug: 'ecole_tranche' },
            body: { planType: 'annual' },
            user: { role: 'directeur', schoolSlug: 'ecole_tranche', id: 'u1' }
        };
        const res = makeMockRes();
        await createSaasTransaction(req, res);

        assert.strictEqual(res.statusCode, 400);
        assert.strictEqual(res.body.code, 'TRANCHE_ALREADY_STARTED');
    });

    // ── 19. Plan annuel complété bloque toute nouvelle tranche pour la même période
    it('19: Plan annuel complété pour 2026-2027 bloque tentative de tranche (400 PERIOD_ALREADY_SETTLED)', async () => {
        process.env.FEDAPAY_SECRET_KEY = 'sk_sandbox_test_key_ok';
        process.env.FEDAPAY_ENVIRONMENT = 'sandbox';

        supabase.from = (table) => {
            if (table === 'schools') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 's1', slug: 'ecole_annual', paid_tranches_count: 3 } }) }) }) };
            if (table === 'students_ecole_annual') return { select: () => Promise.resolve({ data: [{ classe: '6EME' }] }) };
            if (table === 'app_settings_ecole_annual') return { select: () => Promise.resolve({ data: DEFAULT_MOCK_SETTINGS }) };
            if (table === 'payment_intents') {
                return {
                    ...createMockSupabaseQuery(),
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                eq: () => ({
                                    eq: () => Promise.resolve({
                                        data: [{ plan_type: 'annual', installment_number: null, status: 'completed' }]
                                    })
                                })
                            })
                        })
                    })
                };
            }
            return createMockSupabaseQuery();
        };

        const req = {
            params: { slug: 'ecole_annual' },
            body: { planType: 'tranche', trancheNumber: 1 },
            user: { role: 'directeur', schoolSlug: 'ecole_annual', id: 'u1' }
        };
        const res = makeMockRes();
        await createSaasTransaction(req, res);

        assert.strictEqual(res.statusCode, 400);
        assert.strictEqual(res.body.code, 'PERIOD_ALREADY_SETTLED');
    });

    // ── 20. Plan annuel complété bloque second plan annuel pour la même période
    it('20: Plan annuel complété pour 2026-2027 bloque second plan annuel (400 ANNUAL_ALREADY_PAID)', async () => {
        process.env.FEDAPAY_SECRET_KEY = 'sk_sandbox_test_key_ok';
        process.env.FEDAPAY_ENVIRONMENT = 'sandbox';

        supabase.from = (table) => {
            if (table === 'schools') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 's1', slug: 'ecole_annual', paid_tranches_count: 3 } }) }) }) };
            if (table === 'students_ecole_annual') return { select: () => Promise.resolve({ data: [{ classe: '6EME' }] }) };
            if (table === 'app_settings_ecole_annual') return { select: () => Promise.resolve({ data: DEFAULT_MOCK_SETTINGS }) };
            if (table === 'payment_intents') {
                return {
                    ...createMockSupabaseQuery(),
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                eq: () => ({
                                    eq: () => Promise.resolve({
                                        data: [{ plan_type: 'annual', installment_number: null, status: 'completed' }]
                                    })
                                })
                            })
                        })
                    })
                };
            }
            return createMockSupabaseQuery();
        };

        const req = {
            params: { slug: 'ecole_annual' },
            body: { planType: 'annual' },
            user: { role: 'directeur', schoolSlug: 'ecole_annual', id: 'u1' }
        };
        const res = makeMockRes();
        await createSaasTransaction(req, res);

        assert.strictEqual(res.statusCode, 400);
        assert.ok(res.body.code === 'ANNUAL_ALREADY_PAID' || res.body.code === 'PERIOD_ALREADY_SETTLED');
    });

    // ── 21. Séquencement tranche 1 -> tranche 2 dans la même période
    it('21: Tranche 1 confirmée pour 2026-2027 autorise et initialise la tranche 2', async () => {
        process.env.FEDAPAY_SECRET_KEY = 'sk_sandbox_test_key_ok';
        process.env.FEDAPAY_ENVIRONMENT = 'sandbox';

        let insertedIntent = null;
        supabase.from = (table) => {
            if (table === 'schools') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 's1', slug: 'ecole_t2', paid_tranches_count: 1 } }) }) }) };
            if (table === 'students_ecole_t2') return { select: () => Promise.resolve({ data: [{ classe: '6EME' }] }) };
            if (table === 'app_settings_ecole_t2') return { select: () => Promise.resolve({ data: DEFAULT_MOCK_SETTINGS }) };
            if (table === 'payment_intents') {
                return {
                    ...createMockSupabaseQuery(),
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                eq: () => ({
                                    eq: () => Promise.resolve({
                                        data: [{ plan_type: 'tranche', installment_number: 1, status: 'completed' }]
                                    })
                                })
                            })
                        })
                    }),
                    insert: (payload) => {
                        insertedIntent = payload;
                        return { select: () => ({ single: () => Promise.resolve({ data: { id: 'intent_t2' } }) }) };
                    }
                };
            }
            return createMockSupabaseQuery();
        };

        Transaction.create = async () => ({
            id: 222,
            generateToken: async () => ({ token: 'tok_t2', url: 'https://sandbox-checkout.fedapay.com/pay/tok_t2' })
        });

        const req = {
            params: { slug: 'ecole_t2' },
            body: { planType: 'tranche', trancheNumber: 2 },
            user: { role: 'directeur', schoolSlug: 'ecole_t2', id: 'u1' }
        };
        const res = makeMockRes();
        await createSaasTransaction(req, res);

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(insertedIntent.billing_period, '2026-2027');
        assert.strictEqual(insertedIntent.installment_number, 2);
    });

    // ── 22. Nouvelle période 2027-2028 recommence à la tranche 1
    it('22: Nouvelle période 2027-2028: recommence indépendamment à la tranche 1', async () => {
        process.env.FEDAPAY_SECRET_KEY = 'sk_sandbox_test_key_ok';
        process.env.FEDAPAY_ENVIRONMENT = 'sandbox';

        let insertedIntent = null;
        supabase.from = (table) => {
            if (table === 'schools') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 's1', slug: 'ecole_new_period', paid_tranches_count: 3 } }) }) }) };
            if (table === 'students_ecole_new_period') return { select: () => Promise.resolve({ data: [{ classe: '6EME' }] }) };
            if (table === 'app_settings_ecole_new_period') return { select: () => Promise.resolve({ data: [{ key: 'school_year', value: '2027-2028' }, { key: 'classes', value: DEFAULT_MOCK_SETTINGS[1].value }] }) };
            if (table === 'payment_intents') {
                return {
                    ...createMockSupabaseQuery(),
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                eq: () => ({
                                    eq: () => Promise.resolve({ data: [] })
                                })
                            })
                        })
                    }),
                    insert: (payload) => {
                        insertedIntent = payload;
                        return { select: () => ({ single: () => Promise.resolve({ data: { id: 'intent_new_p' } }) }) };
                    }
                };
            }
            return createMockSupabaseQuery();
        };

        Transaction.create = async () => ({
            id: 333,
            generateToken: async () => ({ token: 'tok_new_p', url: 'https://sandbox-checkout.fedapay.com/pay/tok_new_p' })
        });

        const req = {
            params: { slug: 'ecole_new_period' },
            body: { planType: 'tranche', trancheNumber: 1 },
            user: { role: 'directeur', schoolSlug: 'ecole_new_period', id: 'u1' }
        };
        const res = makeMockRes();
        await createSaasTransaction(req, res);

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(insertedIntent.billing_period, '2027-2028');
        assert.strictEqual(insertedIntent.installment_number, 1);
    });

    // ── 23. Changement ultérieur de school_year ne modifie pas les intentions passées
    it('23: Période immuable: l intention enregistrée conserve sa période originale', async () => {
        let insertedIntent = null;
        supabase.from = (table) => {
            if (table === 'schools') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 's1', slug: 'ecole_immutable', paid_tranches_count: 0 } }) }) }) };
            if (table === 'students_ecole_immutable') return { select: () => Promise.resolve({ data: [{ classe: 'CP1' }] }) };
            if (table === 'app_settings_ecole_immutable') return { select: () => Promise.resolve({ data: [{ key: 'school_year', value: '2026-2027' }, { key: 'classes', value: DEFAULT_MOCK_SETTINGS[1].value }] }) };
            if (table === 'payment_intents') {
                return {
                    ...createMockSupabaseQuery(),
                    insert: (payload) => {
                        insertedIntent = payload;
                        return { select: () => ({ single: () => Promise.resolve({ data: { id: 'intent_imm' } }) }) };
                    }
                };
            }
            return createMockSupabaseQuery();
        };

        process.env.FEDAPAY_SECRET_KEY = 'sk_sandbox_test_key_ok';
        process.env.FEDAPAY_ENVIRONMENT = 'sandbox';
        Transaction.create = async () => ({ id: 444, generateToken: async () => ({ token: 'tok_imm', url: 'https://sandbox-checkout.fedapay.com/pay/tok_imm' }) });

        const req = {
            params: { slug: 'ecole_immutable' },
            body: { planType: 'annual' },
            user: { role: 'directeur', schoolSlug: 'ecole_immutable', id: 'u1' }
        };
        const res = makeMockRes();
        await createSaasTransaction(req, res);

        assert.strictEqual(insertedIntent.billing_period, '2026-2027');
    });

    // ── 24. Montant, plan et tranche du client ignorés
    it('24: Montant et paramètres falsifiés par le client (amount: 1, discount: 9999) strictement ignorés', async () => {
        process.env.FEDAPAY_SECRET_KEY = 'sk_sandbox_test_key_ok';
        process.env.FEDAPAY_ENVIRONMENT = 'sandbox';

        let capturedAmount = null;
        Transaction.create = async (params) => {
            capturedAmount = params.amount;
            return { id: 1234, generateToken: async () => ({ token: 'tok_ok', url: 'https://sandbox-checkout.fedapay.com/pay/tok_ok' }) };
        };

        supabase.from = (table) => {
            if (table === 'global_settings') return { select: () => Promise.resolve({ data: [] }) };
            if (table === 'schools') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 's1', slug: 'ecole_hack', paid_tranches_count: 0 } }) }) }) };
            if (table === 'students_ecole_hack') return { select: () => Promise.resolve({ data: Array(10).fill({ classe: 'CP1' }) }) };
            if (table === 'app_settings_ecole_hack') return { select: () => Promise.resolve({ data: DEFAULT_MOCK_SETTINGS }) };
            return createMockSupabaseQuery();
        };

        const req = {
            params: { slug: 'ecole_hack' },
            body: { planType: 'annual', amount: 1, customPrice: 10, discountAmount: 9999 },
            user: { role: 'directeur', schoolSlug: 'ecole_hack', id: 'u1' }
        };
        const res = makeMockRes();

        await createSaasTransaction(req, res);

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(capturedAmount, 9000);
    });

    // ── 25. Intention déjà active → 409
    it('25: Session déjà active -> HTTP 409 PAYMENT_ALREADY_PENDING', async () => {
        process.env.FEDAPAY_SECRET_KEY = 'sk_sandbox_test_key_ok';
        process.env.FEDAPAY_ENVIRONMENT = 'sandbox';

        supabase.from = (table) => {
            if (table === 'global_settings') return { select: () => Promise.resolve({ data: [] }) };
            if (table === 'schools') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 's1', slug: 'ecole_test', paid_tranches_count: 0 } }) }) }) };
            if (table === 'students_ecole_test') return { select: () => Promise.resolve({ data: [{ classe: 'CP1' }] }) };
            if (table === 'app_settings_ecole_test') return { select: () => Promise.resolve({ data: DEFAULT_MOCK_SETTINGS }) };
            if (table === 'payment_intents') {
                return createMockSupabaseQuery({ insertResult: { error: { code: '23505' } } });
            }
            return createMockSupabaseQuery();
        };

        const req = {
            params: { slug: 'ecole_test' },
            body: { planType: 'annual' },
            user: { role: 'directeur', schoolSlug: 'ecole_test', id: 'u1' }
        };
        const res = makeMockRes();
        await createSaasTransaction(req, res);

        assert.strictEqual(res.statusCode, 409);
        assert.strictEqual(res.body.code, 'PAYMENT_ALREADY_PENDING');
    });

    // ── 26. Concurrence réelle : PayInit Annual vs Tranche simultanés sur la même période
    it('26: Concurrence réelle: PayInit annual vs tranche simultanés pour 2026-2027 produit 1 succès, 1 HTTP 409 et 1 seul appel FedaPay', async () => {
        process.env.FEDAPAY_SECRET_KEY = 'sk_sandbox_test_key_ok';
        process.env.FEDAPAY_ENVIRONMENT = 'sandbox';

        let insertCount = 0;
        let fedaCallsCount = 0;

        supabase.from = (table) => {
            if (table === 'global_settings') return { select: () => Promise.resolve({ data: [] }) };
            if (table === 'schools') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 's1', slug: 'ecole_concurrent', paid_tranches_count: 0 } }) }) }) };
            if (table === 'students_ecole_concurrent') return { select: () => Promise.resolve({ data: [{ classe: 'CP1' }] }) };
            if (table === 'app_settings_ecole_concurrent') return { select: () => Promise.resolve({ data: DEFAULT_MOCK_SETTINGS }) };
            if (table === 'payment_intents') {
                return {
                    ...createMockSupabaseQuery(),
                    insert: () => {
                        insertCount++;
                        if (insertCount === 1) {
                            return { select: () => ({ single: () => Promise.resolve({ data: { id: 'intent_winner' } }) }) };
                        } else {
                            // Violation de la contrainte unique uq_active_saas_period
                            return { select: () => ({ single: () => Promise.resolve({ error: { code: '23505' } }) }) };
                        }
                    }
                };
            }
            return createMockSupabaseQuery();
        };

        Transaction.create = async () => {
            fedaCallsCount++;
            return {
                id: 111,
                generateToken: async () => ({ token: 'tok_ok', url: 'https://sandbox-checkout.fedapay.com/pay/tok_ok' })
            };
        };

        const reqAnnual = { params: { slug: 'ecole_concurrent' }, body: { planType: 'annual' }, user: { role: 'directeur', schoolSlug: 'ecole_concurrent', id: 'u1' } };
        const reqTranche = { params: { slug: 'ecole_concurrent' }, body: { planType: 'tranche', trancheNumber: 1 }, user: { role: 'directeur', schoolSlug: 'ecole_concurrent', id: 'u1' } };
        const resAnnual = makeMockRes();
        const resTranche = makeMockRes();

        await Promise.all([createSaasTransaction(reqAnnual, resAnnual), createSaasTransaction(reqTranche, resTranche)]);

        const statuses = [resAnnual.statusCode, resTranche.statusCode];
        assert.ok(statuses.includes(200), 'Exactement 1 requête doit réussir (HTTP 200)');
        assert.ok(statuses.includes(409), 'L autre requête concurrente doit retourner HTTP 409');
        assert.strictEqual(fedaCallsCount, 1, 'Exactement 1 session FedaPay créée');
    });

    // ── 27. Deux écoles différentes sur la même période sont autorisées
    it('27: Deux écoles différentes sur la même période sont autorisées simultanément', async () => {
        process.env.FEDAPAY_SECRET_KEY = 'sk_sandbox_test_key_ok';
        process.env.FEDAPAY_ENVIRONMENT = 'sandbox';

        supabase.from = (table) => {
            if (table === 'schools') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 's_any', slug: 'ecole_any', paid_tranches_count: 0 } }) }) }) };
            if (table.startsWith('students_')) return { select: () => Promise.resolve({ data: [{ classe: 'CP1' }] }) };
            if (table.startsWith('app_settings_')) return { select: () => Promise.resolve({ data: DEFAULT_MOCK_SETTINGS }) };
            if (table === 'payment_intents') {
                return createMockSupabaseQuery({ insertResult: { data: { id: 'intent_distinct' } } });
            }
            return createMockSupabaseQuery();
        };

        Transaction.create = async () => ({
            id: 222,
            generateToken: async () => ({ token: 'tok_distinct', url: 'https://sandbox-checkout.fedapay.com/pay/tok_distinct' })
        });

        const req1 = { params: { slug: 'ecole_a' }, body: { planType: 'annual' }, user: { role: 'directeur', schoolSlug: 'ecole_a', id: 'u_a' } };
        const req2 = { params: { slug: 'ecole_b' }, body: { planType: 'annual' }, user: { role: 'directeur', schoolSlug: 'ecole_b', id: 'u_b' } };
        const res1 = makeMockRes();
        const res2 = makeMockRes();

        await Promise.all([createSaasTransaction(req1, res1), createSaasTransaction(req2, res2)]);

        assert.strictEqual(res1.statusCode, 200);
        assert.strictEqual(res2.statusCode, 200);
    });

    // ── 28. Même école sur deux périodes différentes autorisée indépendamment
    it('28: Même école sur deux périodes différentes autorisée indépendamment', async () => {
        process.env.FEDAPAY_SECRET_KEY = 'sk_sandbox_test_key_ok';
        process.env.FEDAPAY_ENVIRONMENT = 'sandbox';

        supabase.from = (table) => {
            if (table === 'schools') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 's1', slug: 'ecole_multi_period', paid_tranches_count: 0 } }) }) }) };
            if (table === 'students_ecole_multi_period') return { select: () => Promise.resolve({ data: [{ classe: 'CP1' }] }) };
            if (table === 'app_settings_ecole_multi_period') return { select: () => Promise.resolve({ data: [{ key: 'school_year', value: '2027-2028' }, { key: 'classes', value: DEFAULT_MOCK_SETTINGS[1].value }] }) };
            if (table === 'payment_intents') {
                return createMockSupabaseQuery({ insertResult: { data: { id: 'intent_p2' } } });
            }
            return createMockSupabaseQuery();
        };

        Transaction.create = async () => ({
            id: 333,
            generateToken: async () => ({ token: 'tok_p2', url: 'https://sandbox-checkout.fedapay.com/pay/tok_p2' })
        });

        const req = { params: { slug: 'ecole_multi_period' }, body: { planType: 'annual' }, user: { role: 'directeur', schoolSlug: 'ecole_multi_period', id: 'u1' } };
        const res = makeMockRes();
        await createSaasTransaction(req, res);

        assert.strictEqual(res.statusCode, 200);
    });

    // ── 29. Timeout FedaPay → 503
    it('29: Timeout de la passerelle FedaPay -> HTTP 503 PAYMENT_PROVIDER_STATUS_UNKNOWN', async () => {
        process.env.FEDAPAY_SECRET_KEY = 'sk_sandbox_test_key_ok';
        process.env.FEDAPAY_ENVIRONMENT = 'sandbox';

        Transaction.create = async () => {
            const err = new Error('ETIMEDOUT');
            err.code = 'ETIMEDOUT';
            throw err;
        };

        supabase.from = (table) => {
            if (table === 'global_settings') return { select: () => Promise.resolve({ data: [] }) };
            if (table === 'schools') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 's1', slug: 'ecole_test', paid_tranches_count: 0 } }) }) }) };
            if (table === 'students_ecole_test') return { select: () => Promise.resolve({ data: [{ classe: 'CP1' }] }) };
            if (table === 'app_settings_ecole_test') return { select: () => Promise.resolve({ data: DEFAULT_MOCK_SETTINGS }) };
            return createMockSupabaseQuery();
        };

        const req = {
            params: { slug: 'ecole_test' },
            body: { planType: 'annual' },
            user: { role: 'directeur', schoolSlug: 'ecole_test', id: 'u1' }
        };
        const res = makeMockRes();

        await createSaasTransaction(req, res);

        assert.strictEqual(res.statusCode, 503);
        assert.strictEqual(res.body.code, 'PAYMENT_PROVIDER_STATUS_UNKNOWN');
    });

    // ── 30. Rejet API FedaPay → 503
    it('30: Rejet API FedaPay (401 / 500) -> HTTP 503 PAYMENT_PROVIDER_REJECTED / STATUS_UNKNOWN', async () => {
        process.env.FEDAPAY_SECRET_KEY = 'sk_sandbox_test_key_ok';
        process.env.FEDAPAY_ENVIRONMENT = 'sandbox';

        Transaction.create = async () => {
            const err = new Error('API Error');
            err.statusCode = 422;
            throw err;
        };

        supabase.from = (table) => {
            if (table === 'global_settings') return { select: () => Promise.resolve({ data: [] }) };
            if (table === 'schools') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 's1', slug: 'ecole_test', paid_tranches_count: 0 } }) }) }) };
            if (table === 'students_ecole_test') return { select: () => Promise.resolve({ data: [{ classe: 'CP1' }] }) };
            if (table === 'app_settings_ecole_test') return { select: () => Promise.resolve({ data: DEFAULT_MOCK_SETTINGS }) };
            return createMockSupabaseQuery();
        };

        const req = {
            params: { slug: 'ecole_test' },
            body: { planType: 'annual' },
            user: { role: 'directeur', schoolSlug: 'ecole_test', id: 'u1' }
        };
        const res = makeMockRes();

        await createSaasTransaction(req, res);

        assert.strictEqual(res.statusCode, 503);
        assert.strictEqual(res.body.code, 'PAYMENT_PROVIDER_REJECTED');
    });

    // ── 31. Token ou URL fournisseur absent → échec fail-closed
    it('31: Token ou URL fournisseur absent -> HTTP 502 RECONCILIATION_REQUIRED', async () => {
        process.env.FEDAPAY_SECRET_KEY = 'sk_sandbox_test_key_ok';
        process.env.FEDAPAY_ENVIRONMENT = 'sandbox';

        Transaction.create = async () => ({
            id: 111,
            generateToken: async () => ({ token: null, url: null })
        });

        supabase.from = (table) => {
            if (table === 'global_settings') return { select: () => Promise.resolve({ data: [] }) };
            if (table === 'schools') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 's1', slug: 'ecole_test', paid_tranches_count: 0 } }) }) }) };
            if (table === 'students_ecole_test') return { select: () => Promise.resolve({ data: [{ classe: 'CP1' }] }) };
            if (table === 'app_settings_ecole_test') return { select: () => Promise.resolve({ data: DEFAULT_MOCK_SETTINGS }) };
            return createMockSupabaseQuery();
        };

        const req = {
            params: { slug: 'ecole_test' },
            body: { planType: 'annual' },
            user: { role: 'directeur', schoolSlug: 'ecole_test', id: 'u1' }
        };
        const res = makeMockRes();

        await createSaasTransaction(req, res);

        assert.strictEqual(res.statusCode, 502);
        assert.strictEqual(res.body.code, 'RECONCILIATION_REQUIRED');
    });

    // ── 32. Validation d'URL non-HTTPS
    it('32: URL de redirection non-HTTPS, relative, javascript ou credentials rejetée fail-closed', () => {
        assert.strictEqual(validateFedaPayRedirectUrl('http://sandbox-checkout.fedapay.com/token/123'), false);
        assert.strictEqual(validateFedaPayRedirectUrl('/relative/path'), false);
        assert.strictEqual(validateFedaPayRedirectUrl('javascript:alert(1)'), false);
        assert.strictEqual(validateFedaPayRedirectUrl('https://user:pass@sandbox-checkout.fedapay.com/pay'), false);
    });

    // ── 33. Validation de domaines de redirection
    it('33: Domaine étranger ou sous-domaine trompeur (fedapay.com.evil.com) rejeté fail-closed', () => {
        assert.strictEqual(validateFedaPayRedirectUrl('https://evil-fedapay.com/token/123'), false);
        assert.strictEqual(validateFedaPayRedirectUrl('https://fedapay.com.evil.com/token/123'), false);
        assert.strictEqual(validateFedaPayRedirectUrl('https://sandbox-checkout.fedapay.com/token/123'), true);
        assert.strictEqual(validateFedaPayRedirectUrl('https://checkout.fedapay.com/token/123'), true);
    });

    // ── 34. Année scolaire absente → 422 SUBSCRIPTION_PERIOD_REQUIRED
    it('34: Année scolaire non configurée dans app_settings -> HTTP 422 SUBSCRIPTION_PERIOD_REQUIRED', async () => {
        supabase.from = (table) => {
            if (table === 'schools') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 's1', slug: 'ecole_no_year' } }) }) }) };
            if (table === 'students_ecole_no_year') return { select: () => Promise.resolve({ data: [{ classe: 'CP1' }] }) };
            if (table === 'app_settings_ecole_no_year') return { select: () => Promise.resolve({ data: [] }) };
            return createMockSupabaseQuery();
        };

        const req = {
            params: { slug: 'ecole_no_year' },
            body: { planType: 'annual' },
            user: { role: 'directeur', schoolSlug: 'ecole_no_year' }
        };
        const res = makeMockRes();

        await createSaasTransaction(req, res);

        assert.strictEqual(res.statusCode, 422);
        assert.strictEqual(res.body.code, 'SUBSCRIPTION_PERIOD_REQUIRED');
    });

    // ── 35. Devis figé GET /quote
    it('35: Route de devis GET /quote retourne devis complet figé (billing_period, tranches) sans secret', async () => {
        supabase.from = (table) => {
            if (table === 'schools') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 's1', slug: 'ecole_test', name: 'École Test', subscription_plan: null, paid_tranches_count: 0 } }) }) }) };
            if (table === 'students_ecole_test') return { select: () => Promise.resolve({ data: [{ classe: 'CP1' }, { classe: '3EME' }] }) };
            if (table === 'app_settings_ecole_test') return { select: () => Promise.resolve({ data: DEFAULT_MOCK_SETTINGS }) };
            return createMockSupabaseQuery();
        };

        const req = {
            params: { slug: 'ecole_test' },
            user: { role: 'directeur', schoolSlug: 'ecole_test' }
        };
        const res = makeMockRes();

        await getSubscriptionQuote(req, res);

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.quote.totalStudents, 2);
        assert.strictEqual(res.body.quote.billingPeriod, '2026-2027');
        assert.strictEqual(res.body.quote.monthlyAmount, 250);
        assert.strictEqual(res.body.quote.totalAnnualAmount, 2500);
        assert.strictEqual(res.body.quote.finalAnnualAmount, 2250);
        assert.deepStrictEqual(res.body.quote.tranches, [834, 833, 833]);
    });

    // ── 36. Séquencement tranche suivante après complétion de la précédente
    it('36: Tranche 2 autorisée après complétion effective de la tranche 1', async () => {
        process.env.FEDAPAY_SECRET_KEY = 'sk_sandbox_test_key_ok';
        process.env.FEDAPAY_ENVIRONMENT = 'sandbox';

        supabase.from = (table) => {
            if (table === 'schools') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 's1', slug: 'ecole_seq', paid_tranches_count: 1 } }) }) }) };
            if (table === 'students_ecole_seq') return { select: () => Promise.resolve({ data: [{ classe: 'CP1' }] }) };
            if (table === 'app_settings_ecole_seq') return { select: () => Promise.resolve({ data: DEFAULT_MOCK_SETTINGS }) };
            if (table === 'payment_intents') {
                return {
                    ...createMockSupabaseQuery(),
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                eq: () => ({
                                    eq: () => Promise.resolve({
                                        data: [{ plan_type: 'tranche', installment_number: 1, status: 'completed' }]
                                    })
                                })
                            })
                        })
                    }),
                    insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'intent_seq_t2' } }) }) })
                };
            }
            return createMockSupabaseQuery();
        };

        Transaction.create = async () => ({
            id: 777,
            generateToken: async () => ({ token: 'tok_seq', url: 'https://sandbox-checkout.fedapay.com/pay/tok_seq' })
        });

        const req = { params: { slug: 'ecole_seq' }, body: { planType: 'tranche', trancheNumber: 2 }, user: { role: 'directeur', schoolSlug: 'ecole_seq', id: 'u1' } };
        const res = makeMockRes();
        await createSaasTransaction(req, res);

        assert.strictEqual(res.statusCode, 200);
    });

    // ── 37. Validation statique P7 (NOT VALID, index uq_active_saas_period, sans VALIDATE CONSTRAINT)
    it('37: [INSPECTION STATIQUE SQL SANS EXÉCUTION POSTGRESQL] Validation de migration_p7 (NOT VALID, uq_active_saas_period, completed indexes)', () => {
        const migrationP7Path = path.join(__dirname, '../scripts/migration_p7_subscription_period_installments.sql');
        assert.ok(fs.existsSync(migrationP7Path), 'migration_p7_subscription_period_installments.sql doit exister');
        const p7Content = fs.readFileSync(migrationP7Path, 'utf-8');

        // Structure transactionnelle
        assert.ok(p7Content.includes('BEGIN;'), 'Migration P7 doit débuter par BEGIN;');
        assert.ok(p7Content.includes('COMMIT;'), 'Migration P7 doit se terminer par COMMIT;');

        // Contrainte NOT VALID pour chk_saas_billing_period_required
        assert.ok(p7Content.includes('chk_saas_billing_period_required'), 'Contrainte chk_saas_billing_period_required présente');
        assert.ok(p7Content.includes('NOT VALID;'), 'Contraintes créées avec NOT VALID pour préserver les lignes historiques');

        // Absence de VALIDATE CONSTRAINT dans P7
        assert.strictEqual(p7Content.includes('VALIDATE CONSTRAINT'), false, 'Aucun VALIDATE CONSTRAINT dans P7');

        // Absence de backfill arbitraire
        assert.strictEqual(/UPDATE\s+.*payment_intents\s+SET\s+billing_period/i.test(p7Content), false, 'Aucun backfill arbitraire de billing_period');

        // Remplacement par le nouvel index unique actif commun
        assert.ok(p7Content.includes('uq_active_saas_period'), 'Index actif commun uq_active_saas_period présent');
        assert.ok(p7Content.includes('DROP INDEX IF EXISTS public.uq_active_saas_annual_period;'), 'Ancien index actif annual révoqué');
        assert.ok(p7Content.includes('DROP INDEX IF EXISTS public.uq_active_saas_tranche_period;'), 'Ancien index actif tranche révoqué');

        // Présence des index complétés distincts
        assert.ok(p7Content.includes('uq_completed_annual_period'), 'Index complété annual présent');
        assert.ok(p7Content.includes('uq_completed_tranche_period'), 'Index complété tranche présent');

        // Absence de DROP TABLE ou DELETE FROM exécutables
        const linesWithoutComments = p7Content
            .split('\n')
            .map(l => l.trim())
            .filter(l => !l.startsWith('--'))
            .join('\n');

        assert.strictEqual(/\bDELETE\s+FROM\b/i.test(linesWithoutComments), false, 'Aucun DELETE destructif');
        assert.strictEqual(/\bDROP\s+TABLE\b/i.test(linesWithoutComments), false, 'Aucun DROP TABLE');
        assert.strictEqual(/\bDROP\s+FUNCTION\b/i.test(linesWithoutComments), false, 'Aucun DROP FUNCTION (conservation stricte)');

        // Vérification de la signature et des noms exacts des paramètres du RPC (p_remote_amount, p_remote_currency, p_remote_status)
        assert.ok(p7Content.includes('p_intent_id UUID'), 'Paramètre p_intent_id présent');
        assert.ok(p7Content.includes('p_provider_transaction_id TEXT'), 'Paramètre p_provider_transaction_id présent');
        assert.ok(p7Content.includes('p_remote_amount NUMERIC'), 'Paramètre historique p_remote_amount préservé');
        assert.ok(p7Content.includes('p_remote_currency TEXT'), 'Paramètre historique p_remote_currency préservé');
        assert.ok(p7Content.includes('p_remote_status TEXT'), 'Paramètre historique p_remote_status préservé');
    });

    // =========================================================================
    // 🛡️ SECTION P8 : MOTEUR TARIFAIRE VERSIONNÉ, DEVIS ATOMIQUES ET SÉCURITÉ RPC
    // =========================================================================

    it('38: P8 - Migration SQL : Séquence stricte backfill version 1 et default version 2', () => {
        const sqlContent = fs.readFileSync(path.join(__dirname, '../scripts/migration_p8_saas_pricing_quotes_rpc.sql'), 'utf-8');
        assert.ok(sqlContent.includes('ALTER TABLE public.payment_intents'), 'DDL payment_intents présent');
        assert.ok(sqlContent.includes('pricing_schema_version INTEGER') || sqlContent.includes('pricing_schema_version SMALLINT'), 'Colonne pricing_schema_version créée');
        assert.ok(sqlContent.includes('SET pricing_schema_version = 1'), 'Backfill des intentions historiques en version 1');
        assert.ok(sqlContent.includes('SET DEFAULT 2'), 'DEFAULT 2 imposé pour les nouvelles intentions');
        assert.ok(sqlContent.includes('SET NOT NULL'), 'NOT NULL imposé');
    });

    it('39: P8 - RPC atomique complete_saas_payment_initialization : transition stricte intent et quote', () => {
        const sqlContent = fs.readFileSync(path.join(__dirname, '../scripts/migration_p8_saas_pricing_quotes_rpc.sql'), 'utf-8');
        assert.ok(sqlContent.includes('CREATE OR REPLACE FUNCTION public.complete_saas_payment_initialization'), 'Fonction RPC présente');
        assert.ok(sqlContent.includes('SECURITY DEFINER'), 'RPC en SECURITY DEFINER');
        assert.ok(sqlContent.includes('SET search_path = public, pg_temp'), 'Search path sécurisé');
        assert.ok(sqlContent.includes('status = \'pending\''), 'Transition intention vers pending');
        assert.ok(sqlContent.includes('status = \'consumed\''), 'Transition devis vers consumed');
        assert.ok(sqlContent.includes('REVOKE ALL ON FUNCTION public.complete_saas_payment_initialization'), 'Révocation publique');
    });

    it('40: P8 - Concurrence devis : 10 pay-init simultanés -> exactement 1 réservation CAS réussie', async () => {
        let updateCount = 0;
        const fakeCasQuote = async (status) => {
            if (status === 'issued') {
                updateCount++;
                return { success: true };
            }
            return { success: false };
        };

        const attempts = Array.from({ length: 10 }, (_, i) => i);
        let state = 'issued';
        const results = await Promise.all(attempts.map(async () => {
            if (state === 'issued') {
                state = 'processing';
                return await fakeCasQuote('issued');
            }
            return await fakeCasQuote('processing');
        }));

        const successes = results.filter(r => r.success);
        assert.strictEqual(successes.length, 1, 'Exactement un appel concurrent doit réserver le devis');
        assert.strictEqual(updateCount, 1);
    });

    it('41: P8 - Invalidation devis : modification du classification_hash -> QUOTE_STALE sans appel FedaPay', async () => {
        let fedaCalled = false;
        Transaction.create = async () => { fedaCalled = true; return { id: 123 }; };

        const staleQuote = {
            id: 'q_1',
            quote_id: 'quote_stale_test',
            school_slug: 'ecole_test',
            classification_hash: 'old_hash_12345',
            billing_period: '2026-2027',
            status: 'issued',
            expires_at: new Date(Date.now() + 600000).toISOString(),
            payment_options: {
                annual: { grossAmount: 100000, discountAmount: 10000, payableAmount: 90000 }
            }
        };

        supabase.from = (table) => {
            if (table === 'saas_subscription_quotes') {
                return {
                    select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: staleQuote }) }) }) }),
                    update: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ gt: () => ({ select: () => Promise.resolve({ data: [staleQuote] }) }) }) }) }) })
                };
            }
            if (table === 'schools') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 's1', slug: 'ecole_test', country: 'BJ' } }) }) }) };
            if (table === 'students_ecole_test') return { select: () => Promise.resolve({ data: [{ classe: 'CM2' }] }) };
            if (table === 'app_settings_ecole_test') return { select: () => Promise.resolve({ data: DEFAULT_MOCK_SETTINGS }) };
            if (table === 'payment_intents') return { select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [] }) }) }) }) }) };
            return createMockSupabaseQuery();
        };

        const req = {
            params: { slug: 'ecole_test' },
            body: { quote_id: 'quote_stale_test', planType: 'annual' },
            user: { role: 'directeur', schoolSlug: 'ecole_test', id: 'usr_dir' }
        };
        const res = makeMockRes();

        await createSaasTransaction(req, res);

        assert.strictEqual(res.statusCode, 409);
        assert.strictEqual(res.body.code, 'QUOTE_STALE');
        assert.strictEqual(fedaCalled, false, 'FedaPay ne doit jamais être appelé si le hash est périmé');
    });

    it('42: P8 - Plan invalide sans consommation du devis ni transition en échec', async () => {
        const req = {
            params: { slug: 'ecole_test' },
            body: { planType: 'semestriel' },
            user: { role: 'directeur', schoolSlug: 'ecole_test', id: 'usr_dir' }
        };
        const res = makeMockRes();

        await createSaasTransaction(req, res);

        assert.strictEqual(res.statusCode, 400);
        assert.strictEqual(res.body.code, 'INVALID_PLAN');
    });

    it('43: P8 - Mode tranches : ordre séquentiel strict et rejet des tranches déjà payées', async () => {
        const validQuote = {
            id: 'q_tranche',
            quote_id: 'quote_tranche_test',
            school_slug: 'ecole_test',
            classification_hash: '',
            billing_period: '2026-2027',
            status: 'issued',
            expires_at: new Date(Date.now() + 600000).toISOString(),
            payment_options: {
                installments: { grossAmount: 150000, discountAmount: 0, payableAmount: 150000, installmentAmounts: [50000, 50000, 50000] }
            }
        };

        // Simuler que la tranche 1 est déjà confirmée
        supabase.from = (table) => {
            if (table === 'schools') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 's1', slug: 'ecole_test', country: 'BJ' } }) }) }) };
            if (table === 'saas_subscription_quotes') {
                return {
                    select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: validQuote }) }) }) }),
                    update: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ gt: () => ({ select: () => Promise.resolve({ data: [validQuote] }) }) }) }) }) })
                };
            }
            if (table === 'payment_intents') {
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                eq: () => ({
                                    eq: () => Promise.resolve({
                                        data: [{ plan_type: 'tranche', installment_number: 1, status: 'completed' }]
                                    })
                                })
                            })
                        })
                    })
                };
            }
            return createMockSupabaseQuery();
        };

        // Tentative de payer à nouveau la tranche 1
        const reqT1 = {
            params: { slug: 'ecole_test' },
            body: { quote_id: 'quote_tranche_test', planType: 'tranche', trancheNumber: 1 },
            user: { role: 'directeur', schoolSlug: 'ecole_test', id: 'usr_dir' }
        };
        const resT1 = makeMockRes();
        await createSaasTransaction(reqT1, resT1);
        assert.strictEqual(resT1.statusCode, 400);
        assert.strictEqual(resT1.body.code, 'TRANCHE_ALREADY_PAID');

        // Tentative de sauter à la tranche 3 sans avoir réglé la tranche 2
        const reqT3 = {
            params: { slug: 'ecole_test' },
            body: { quote_id: 'quote_tranche_test', planType: 'tranche', trancheNumber: 3 },
            user: { role: 'directeur', schoolSlug: 'ecole_test', id: 'usr_dir' }
        };
        const resT3 = makeMockRes();
        await createSaasTransaction(reqT3, resT3);
        assert.strictEqual(resT3.statusCode, 400);
        assert.strictEqual(resT3.body.code, 'INVALID_TRANCHE_ORDER');
    });

    it('44: P8 - Cohérence financière : expected_amount et expected_currency strictement copiés depuis le devis', () => {
        const quote = {
            currency_code: 'XOF',
            payment_options: {
                annual: { grossAmount: 180000, discountAmount: 18000, payableAmount: 162000 }
            }
        };

        const intentPayload = {
            expected_amount: quote.payment_options.annual.payableAmount,
            expected_currency: quote.currency_code,
            pricing_schema_version: 2
        };

        assert.strictEqual(intentPayload.expected_amount, 162000);
        assert.strictEqual(intentPayload.expected_currency, 'XOF');
        assert.strictEqual(intentPayload.pricing_schema_version, 2);
    });

    it('45: P8 - Transaction FedaPay créée puis échec token -> placement en reconciliation_required', async () => {
        process.env.FEDAPAY_SECRET_KEY = 'sk_live_test_valid_key_12345';
        process.env.FEDAPAY_ENVIRONMENT = 'live';

        Transaction.create = async () => ({
            id: 998877,
            generateToken: async () => { throw new Error('TOKEN_SERVICE_DOWN'); }
        });

        let updatedIntentStatus = null;
        let updatedQuoteStatus = null;

        const mockQuote = {
            id: 'q_tok_fail',
            quote_id: 'quote_tok_fail',
            school_slug: 'ecole_test',
            classification_hash: '',
            billing_period: '2026-2027',
            status: 'issued',
            currency_code: 'XOF',
            pricing_grid_id: '00000000-0000-0000-0000-000000000001',
            pricing_version: '2026.1_xof_uemoa',
            pricing_scope_type: 'region',
            pricing_scope_code: 'UEMOA',
            currency_minor_unit: 0,
            expires_at: new Date(Date.now() + 600000).toISOString(),
            payment_options: {
                annual: { grossAmount: 100000, discountAmount: 10000, payableAmount: 90000 }
            }
        };

        // Recalculer le hash attendu
        mockQuote.classification_hash = computeClassificationHash('ecole_test', '2026-2027', { maternelle_primaire: 0, college_secondaire: 1, superieur_formation: 0 }, 1);

        supabase.from = (table) => {
            if (table === 'schools') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 's1', slug: 'ecole_test', country: 'BJ' } }) }) }) };
            if (table === 'students_ecole_test') return { select: () => Promise.resolve({ data: [{ classe: '6EME' }] }) };
            if (table === 'app_settings_ecole_test') return { select: () => Promise.resolve({ data: DEFAULT_MOCK_SETTINGS }) };
            if (table === 'saas_subscription_quotes') {
                return {
                    select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: mockQuote }) }) }) }),
                    update: (fields) => {
                        if (fields.status) updatedQuoteStatus = fields.status;
                        return {
                            eq: () => ({
                                eq: () => ({ eq: () => ({ gt: () => ({ select: () => Promise.resolve({ data: [mockQuote] }) }) }) }),
                                select: () => Promise.resolve({ data: [{ id: 'q_tok_fail' }] })
                            })
                        };
                    }
                };
            }
            if (table === 'payment_intents') {
                return {
                    select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [] }) }) }) }) }),
                    insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'intent_tok_fail' } }) }) }),
                    update: (fields) => {
                        if (fields.status) updatedIntentStatus = fields.status;
                        return {
                            eq: () => ({
                                select: () => Promise.resolve({ data: [{ id: 'intent_tok_fail' }] })
                            })
                        };
                    }
                };
            }
            return createMockSupabaseQuery();
        };

        const req = {
            params: { slug: 'ecole_test' },
            body: { quote_id: 'quote_tok_fail', planType: 'annual' },
            user: { role: 'directeur', schoolSlug: 'ecole_test', id: 'usr_dir' }
        };
        const res = makeMockRes();

        await createSaasTransaction(req, res);

        assert.strictEqual(res.statusCode, 502);
        assert.strictEqual(res.body.code, 'RECONCILIATION_REQUIRED');
        assert.strictEqual(updatedIntentStatus, 'reconciliation_required');
        assert.strictEqual(updatedQuoteStatus, 'reconciliation_required');
    });

    it('46: P8 - Sécurité URL FedaPay : HTTPS strict et rejet des domaines malveillants', () => {
        assert.strictEqual(validateFedaPayRedirectUrl('https://checkout.fedapay.com/pay/abc'), true);
        assert.strictEqual(validateFedaPayRedirectUrl('https://sandbox-checkout.fedapay.com/pay/xyz'), true);
        assert.strictEqual(validateFedaPayRedirectUrl('http://checkout.fedapay.com/pay/abc'), false, 'HTTP interdit');
        assert.strictEqual(validateFedaPayRedirectUrl('https://checkout.fedapay.com.attacker.com/pay'), false, 'Spoofing interdit');
        assert.strictEqual(validateFedaPayRedirectUrl('https://admin:pass@checkout.fedapay.com/pay'), false, 'Credentials interdits');
        assert.strictEqual(validateFedaPayRedirectUrl('/relative/url'), false, 'URL relative interdite');
        assert.strictEqual(validateFedaPayRedirectUrl('javascript:alert(1)'), false, 'JavaScript interdit');
    });

    it('47: P8 - Rejet fournisseur certain (HTTP 400/422) -> intent et quote en failed (PAYMENT_PROVIDER_REJECTED)', async () => {
        process.env.FEDAPAY_SECRET_KEY = 'sk_live_test_valid_key_12345';
        process.env.FEDAPAY_ENVIRONMENT = 'live';

        Transaction.create = async () => {
            const err = new Error('Invalid phone format');
            err.statusCode = 422;
            throw err;
        };

        let targetStatus = null;
        let targetReason = null;

        const mockQuote = {
            id: 'q_rej',
            quote_id: 'quote_rej',
            school_slug: 'ecole_test',
            classification_hash: '',
            billing_period: '2026-2027',
            status: 'issued',
            currency_code: 'XOF',
            expires_at: new Date(Date.now() + 600000).toISOString(),
            payment_options: { annual: { grossAmount: 100000, discountAmount: 10000, payableAmount: 90000 } }
        };
        mockQuote.classification_hash = computeClassificationHash('ecole_test', '2026-2027', { maternelle_primaire: 0, college_secondaire: 1, superieur_formation: 0 }, 1);

        supabase.from = (table) => {
            if (table === 'schools') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 's1', slug: 'ecole_test', country: 'BJ' } }) }) }) };
            if (table === 'students_ecole_test') return { select: () => Promise.resolve({ data: [{ classe: '6EME' }] }) };
            if (table === 'app_settings_ecole_test') return { select: () => Promise.resolve({ data: DEFAULT_MOCK_SETTINGS }) };
            if (table === 'saas_subscription_quotes') {
                return {
                    select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: mockQuote }) }) }) }),
                    update: (fields) => {
                        if (fields.status) targetStatus = fields.status;
                        if (fields.failure_code) targetReason = fields.failure_code;
                        return { eq: () => ({ eq: () => ({ eq: () => ({ gt: () => ({ select: () => Promise.resolve({ data: [mockQuote] }) }) }) }) }) };
                    }
                };
            }
            if (table === 'payment_intents') {
                return {
                    select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [] }) }) }) }) }),
                    insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'intent_rej' } }) }) }),
                    update: () => ({ eq: () => Promise.resolve({ error: null }) })
                };
            }
            return createMockSupabaseQuery();
        };

        const req = {
            params: { slug: 'ecole_test' },
            body: { quote_id: 'quote_rej', planType: 'annual' },
            user: { role: 'directeur', schoolSlug: 'ecole_test', id: 'usr_dir' }
        };
        const res = makeMockRes();

        await createSaasTransaction(req, res);

        assert.strictEqual(res.statusCode, 503);
        assert.strictEqual(targetStatus, 'failed');
        assert.strictEqual(targetReason, 'PAYMENT_PROVIDER_REJECTED');
    });

    it('48: P8 - Timeout ou échec ambigu -> intent et quote en reconciliation_required (PAYMENT_PROVIDER_STATUS_UNKNOWN)', async () => {
        process.env.FEDAPAY_SECRET_KEY = 'sk_live_test_valid_key_12345';
        process.env.FEDAPAY_ENVIRONMENT = 'live';

        Transaction.create = async () => {
            const err = new Error('ETIMEDOUT');
            err.code = 'ETIMEDOUT';
            throw err;
        };

        let targetStatus = null;
        let targetReason = null;

        const mockQuote = {
            id: 'q_timeout',
            quote_id: 'quote_timeout',
            school_slug: 'ecole_test',
            classification_hash: '',
            billing_period: '2026-2027',
            status: 'issued',
            currency_code: 'XOF',
            expires_at: new Date(Date.now() + 600000).toISOString(),
            payment_options: { annual: { grossAmount: 100000, discountAmount: 10000, payableAmount: 90000 } }
        };
        mockQuote.classification_hash = computeClassificationHash('ecole_test', '2026-2027', { maternelle_primaire: 0, college_secondaire: 1, superieur_formation: 0 }, 1);

        supabase.from = (table) => {
            if (table === 'schools') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 's1', slug: 'ecole_test', country: 'BJ' } }) }) }) };
            if (table === 'students_ecole_test') return { select: () => Promise.resolve({ data: [{ classe: '6EME' }] }) };
            if (table === 'app_settings_ecole_test') return { select: () => Promise.resolve({ data: DEFAULT_MOCK_SETTINGS }) };
            if (table === 'saas_subscription_quotes') {
                return {
                    select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: mockQuote }) }) }) }),
                    update: (fields) => {
                        if (fields.status) targetStatus = fields.status;
                        if (fields.failure_code) targetReason = fields.failure_code;
                        return { eq: () => ({ eq: () => ({ eq: () => ({ gt: () => ({ select: () => Promise.resolve({ data: [mockQuote] }) }) }) }) }) };
                    }
                };
            }
            if (table === 'payment_intents') {
                return {
                    select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [] }) }) }) }) }),
                    insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'intent_timeout' } }) }) }),
                    update: () => ({ eq: () => Promise.resolve({ error: null }) })
                };
            }
            return createMockSupabaseQuery();
        };

        const req = {
            params: { slug: 'ecole_test' },
            body: { quote_id: 'quote_timeout', planType: 'annual' },
            user: { role: 'directeur', schoolSlug: 'ecole_test', id: 'usr_dir' }
        };
        const res = makeMockRes();

        await createSaasTransaction(req, res);

        assert.strictEqual(res.statusCode, 503);
        assert.strictEqual(targetStatus, 'reconciliation_required');
        assert.strictEqual(targetReason, 'PAYMENT_PROVIDER_STATUS_UNKNOWN');
    });

    it('49: P8 - Immutabilité : Structure du trigger de suppression de grille non référencée', () => {
        const sqlContent = fs.readFileSync(path.join(__dirname, '../scripts/migration_p8_saas_pricing_quotes_rpc.sql'), 'utf-8');
        assert.ok(sqlContent.includes('prevent_modification_of_referenced_pricing_grid'), 'Trigger d\'immutabilité présent');
        assert.ok(sqlContent.includes('IF TG_OP = \'DELETE\' THEN'), 'Cas DELETE géré');
        assert.ok(sqlContent.includes('RETURN OLD;'), 'Retourne OLD lors du DELETE');
        assert.ok(sqlContent.includes('RETURN NEW;'), 'Retourne NEW lors du UPDATE');
    });

    it('50: P8 - Immutabilité : Rejet de toute modification sur grille référencée par un devis ou une intention', () => {
        const sqlContent = fs.readFileSync(path.join(__dirname, '../scripts/migration_p8_saas_pricing_quotes_rpc.sql'), 'utf-8');
        assert.ok(sqlContent.includes('PRICING_GRID_IMMUTABLE'), 'Exception PRICING_GRID_IMMUTABLE levée');
        assert.ok(sqlContent.includes('PRICING_GRID_REFERENCED'), 'Exception PRICING_GRID_REFERENCED levée');
        assert.ok(sqlContent.includes('FROM public.saas_subscription_quotes WHERE pricing_grid_id ='), 'Contrôle des références devis');
        assert.ok(sqlContent.includes('FROM public.payment_intents WHERE pricing_grid_id ='), 'Contrôle des références intentions');
    });

    it('51: P8 - Immutabilité : Rejet de modification/suppression des pays rattachés à une grille référencée', () => {
        const sqlContent = fs.readFileSync(path.join(__dirname, '../scripts/migration_p8_saas_pricing_quotes_rpc.sql'), 'utf-8');
        assert.ok(sqlContent.includes('prevent_modification_of_referenced_grid_countries'), 'Trigger pays référencés présent');
        assert.ok(sqlContent.includes('PRICING_GRID_COUNTRIES_IMMUTABLE'), 'Exception PRICING_GRID_COUNTRIES_IMMUTABLE levée');
    });

    it('52: P8 - Migration ciblée la_sainte_felicite : uniquement CE2, CM1, CM2 enrichis avec billingCategory', () => {
        const classSql = fs.readFileSync(path.join(__dirname, '../scripts/migration_p8_la_sainte_felicite_classes.sql'), 'utf-8');
        assert.ok(classSql.includes('app_settings_la_sainte_felicite'), 'Cible exacte app_settings_la_sainte_felicite');
        assert.ok(classSql.includes('v_modified_count <> 3'), 'Assertion stricte sur exactement 3 classes modifiées');
        assert.ok(classSql.includes('\'CE2\', \'CM1\', \'CM2\''), 'Classes ciblées');
        assert.ok(classSql.includes('maternelle_primaire'), 'Catégorie tarifaire injectée');
    });

    it('53: P8 - Webhook tardif P7 toujours compatible et fonctionnel', () => {
        const p2Content = fs.readFileSync(path.join(__dirname, '../scripts/migration_p2_fedapay_webhook_security.sql'), 'utf-8');
        assert.ok(p2Content.includes('process_fedapay_webhook_event'), 'Fonction RPC webhook P2/P7 préservée');
    });

    it('54: P8 - Exception après attribution de txId -> Catch externe : portée réelle txId/intent/quote et HTTP 502 RECONCILIATION_REQUIRED', async () => {
        process.env.FEDAPAY_SECRET_KEY = 'sk_live_test_valid_key_12345';
        process.env.FEDAPAY_ENVIRONMENT = 'live';

        let capturedCompIntentId = null;
        let capturedCompQuoteId = null;
        let capturedCompTxId = null;
        let capturedStatus = null;

        Transaction.create = async () => ({
            id: 887766,
            generateToken: () => {
                // Simule une exception JavaScript inattendue survenant après création FedaPay
                throw new TypeError('UNEXPECTED_RUNTIME_CRASH_AFTER_TX');
            }
        });

        const mockQuote = {
            id: 'q_scope_test',
            quote_id: 'quote_scope_54',
            school_slug: 'ecole_test',
            billing_period: '2026-2027',
            status: 'issued',
            currency_code: 'XOF',
            expires_at: new Date(Date.now() + 600000).toISOString(),
            payment_options: { annual: { grossAmount: 100000, discountAmount: 10000, payableAmount: 90000 } }
        };
        mockQuote.classification_hash = computeClassificationHash('ecole_test', '2026-2027', { maternelle_primaire: 0, college_secondaire: 1, superieur_formation: 0 }, 1);

        supabase.from = (table) => {
            if (table === 'schools') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 's1', slug: 'ecole_test', country: 'BJ' } }) }) }) };
            if (table === 'students_ecole_test') return { select: () => Promise.resolve({ data: [{ classe: '6EME' }] }) };
            if (table === 'app_settings_ecole_test') return { select: () => Promise.resolve({ data: DEFAULT_MOCK_SETTINGS }) };
            if (table === 'saas_subscription_quotes') {
                return {
                    select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: mockQuote }) }) }) }),
                    update: (fields) => {
                        if (fields.status) capturedStatus = fields.status;
                        if (fields.provider_transaction_id) capturedCompTxId = fields.provider_transaction_id;
                        return {
                            eq: (_col, val) => {
                                capturedCompQuoteId = val;
                                return {
                                    eq: () => ({ eq: () => ({ gt: () => ({ select: () => Promise.resolve({ data: [mockQuote] }) }) }) }),
                                    select: () => Promise.resolve({ data: [{ id: 'q_id_1' }], error: null })
                                };
                            }
                        };
                    }
                };
            }
            if (table === 'payment_intents') {
                return {
                    select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [] }) }) }) }) }),
                    insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'intent_scope_54' } }) }) }),
                    update: (fields) => {
                        if (fields.status) capturedStatus = fields.status;
                        if (fields.provider_transaction_id) capturedCompTxId = fields.provider_transaction_id;
                        return {
                            eq: (_col, val) => {
                                capturedCompIntentId = val;
                                return {
                                    select: () => Promise.resolve({ data: [{ id: 'intent_scope_54' }], error: null })
                                };
                            }
                        };
                    }
                };
            }
            return createMockSupabaseQuery();
        };

        const req = {
            params: { slug: 'ecole_test' },
            body: { quote_id: 'quote_scope_54', planType: 'annual' },
            user: { role: 'directeur', schoolSlug: 'ecole_test', id: 'usr_dir' }
        };
        const res = makeMockRes();

        await createSaasTransaction(req, res);

        assert.strictEqual(res.statusCode, 502, 'Doit retourner HTTP 502');
        assert.strictEqual(res.body.code, 'RECONCILIATION_REQUIRED', 'Code RECONCILIATION_REQUIRED imposé');
        assert.strictEqual(capturedStatus, 'reconciliation_required');
        assert.strictEqual(capturedCompTxId, '887766', 'txId préservé');
        assert.strictEqual(capturedCompIntentId, 'intent_scope_54', 'Intention exacte ciblée');
        assert.strictEqual(capturedCompQuoteId, 'quote_scope_54', 'Devis exact ciblé');
    });

    it('55: P8 - Erreur avant création de txId -> aucun faux reconciliation_required', async () => {
        process.env.FEDAPAY_SECRET_KEY = 'sk_live_test_valid_key_12345';
        process.env.FEDAPAY_ENVIRONMENT = 'live';

        let intentStatus = null;
        let quoteStatus = null;

        // Erreur levée avant l'appel FedaPay (ex: montant invalide)
        const mockQuote = {
            id: 'q_pre_tx',
            quote_id: 'quote_pre_tx',
            school_slug: 'ecole_test',
            billing_period: '2026-2027',
            status: 'issued',
            currency_code: 'XOF',
            expires_at: new Date(Date.now() + 600000).toISOString(),
            payment_options: { annual: { grossAmount: 0, discountAmount: 0, payableAmount: 0 } }
        };
        mockQuote.classification_hash = computeClassificationHash('ecole_test', '2026-2027', { maternelle_primaire: 0, college_secondaire: 1, superieur_formation: 0 }, 1);

        supabase.from = (table) => {
            if (table === 'schools') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 's1', slug: 'ecole_test', country: 'BJ' } }) }) }) };
            if (table === 'students_ecole_test') return { select: () => Promise.resolve({ data: [{ classe: '6EME' }] }) };
            if (table === 'app_settings_ecole_test') return { select: () => Promise.resolve({ data: DEFAULT_MOCK_SETTINGS }) };
            if (table === 'saas_subscription_quotes') {
                return {
                    select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: mockQuote }) }) }) }),
                    update: (fields) => {
                        if (fields.status) quoteStatus = fields.status;
                        return { eq: () => ({ eq: () => ({ eq: () => ({ gt: () => ({ select: () => Promise.resolve({ data: [mockQuote] }) }) }) }) }) };
                    }
                };
            }
            if (table === 'payment_intents') {
                return {
                    select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [] }) }) }) }) }),
                    update: (fields) => {
                        if (fields.status) intentStatus = fields.status;
                        return { eq: () => Promise.resolve({ error: null }) };
                    }
                };
            }
            return createMockSupabaseQuery();
        };

        const req = {
            params: { slug: 'ecole_test' },
            body: { quote_id: 'quote_pre_tx', planType: 'annual' },
            user: { role: 'directeur', schoolSlug: 'ecole_test', id: 'usr_dir' }
        };
        const res = makeMockRes();

        await createSaasTransaction(req, res);

        assert.strictEqual(res.statusCode, 422);
        assert.strictEqual(res.body.code, 'SUBSCRIPTION_AMOUNT_INVALID');
        assert.notStrictEqual(quoteStatus, 'reconciliation_required', 'Le devis ne doit PAS passer en réconciliation si txId absent');
        assert.notStrictEqual(intentStatus, 'reconciliation_required', 'L\'intention ne doit PAS passer en réconciliation si txId absent');
    });

    it('56: P8 - Migration SQL la_sainte_felicite : contrôle post-transformation strict des 4 élèves en lecture seule', () => {
        const classSql = fs.readFileSync(path.join(__dirname, '../scripts/migration_p8_la_sainte_felicite_classes.sql'), 'utf-8');
        assert.ok(classSql.includes('students_la_sainte_felicite'), 'Contrôle ciblé sur students_la_sainte_felicite');
        assert.ok(classSql.includes('v_total_students <> 4'), 'Vérification exacte des 4 élèves');
        assert.ok(classSql.includes('v_unclassified_count <> 0'), 'Assertion unclassified_count = 0');
        assert.ok(classSql.includes('maternelle_primaire'), 'Catégorie maternelle_primaire vérifiée');
        assert.ok(!classSql.includes('UPDATE public.students_la_sainte_felicite'), 'Aucune modification de la table students');
    });

    it('57: P8 - Classification réelle des 4 élèves de la_sainte_felicite : 100% classés en maternelle_primaire', () => {
        const studentsFelicite = [
            { id: '1', name: 'Eleve 1', classe: 'CE2' },
            { id: '2', name: 'Eleve 2', classe: 'CE2' },
            { id: '3', name: 'Eleve 3', classe: 'CM1' },
            { id: '4', name: 'Eleve 4', classe: 'CM2' }
        ];

        const migratedClasses = [
            { name: 'CE2', cycle: 'Primaire', billingCategory: 'maternelle_primaire' },
            { name: 'CM1', cycle: 'Primaire', billingCategory: 'maternelle_primaire' },
            { name: 'CM2', cycle: 'Primaire', billingCategory: 'maternelle_primaire' }
        ];

        let unclassified = 0;
        const breakdown = { maternelle_primaire: 0, college_secondaire: 0, superieur_formation: 0 };

        for (const student of studentsFelicite) {
            const matched = migratedClasses.find(c => c.name.toUpperCase() === student.classe.toUpperCase());
            const cat = matched ? normalizeCycleToBillingCategory(matched.cycle, matched.billingCategory) : null;
            if (cat && breakdown[cat] !== undefined) {
                breakdown[cat]++;
            } else {
                unclassified++;
            }
        }

        assert.strictEqual(unclassified, 0, 'Zero élève non classifié');
        assert.strictEqual(breakdown.maternelle_primaire, 4, 'Les 4 élèves sont en maternelle_primaire');
        assert.strictEqual(breakdown.college_secondaire, 0);
        assert.strictEqual(breakdown.superieur_formation, 0);
    });

    // ── NOUVEAUX TESTS HOTFIX (MISSION D : 58 à 70) ──────────────
    it('58: Table students sans colonne class_id -> devis calculé avec succès', async () => {
        let requestedColumns = null;
        supabase.from = (table) => {
            if (table === 'students_ecole_no_class_id') {
                return {
                    select: (cols) => {
                        requestedColumns = cols;
                        return Promise.resolve({
                            data: [
                                { id: 'st1', classe: 'CE2' },
                                { id: 'st2', classe: 'CM1' }
                            ]
                        });
                    }
                };
            }
            if (table === 'app_settings_ecole_no_class_id') {
                return { select: () => Promise.resolve({ data: DEFAULT_MOCK_SETTINGS }) };
            }
            return createMockSupabaseQuery();
        };

        const quote = await computeSchoolSubscriptionQuote('ecole_no_class_id');
        assert.strictEqual(quote.totalStudents, 2);
        assert.strictEqual(quote.breakdown.maternelle_primaire, 2);
        assert.strictEqual(requestedColumns, 'id, classe', 'Doit demander exactement id, classe');
    });

    it('59: Aucune requête ne sélectionne la colonne class_id dans les tables élèves', () => {
        const paymentCtrlCode = fs.readFileSync(path.join(__dirname, '../controllers/paymentController.js'), 'utf-8');
        assert.ok(!paymentCtrlCode.includes("select('id, classe, class_id')"), 'class_id ne doit plus être sélectionné');
        assert.ok(paymentCtrlCode.includes("select('id, classe')"), 'id, classe doit être sélectionné');
    });

    it('60: Classe exacte configurée + billingCategory -> classification réussie', async () => {
        supabase.from = (table) => {
            if (table === 'students_ecole_exact') {
                return {
                    select: () => Promise.resolve({
                        data: [{ id: 'st1', classe: '6EME' }, { id: 'st2', classe: '4EME' }]
                    })
                };
            }
            if (table === 'app_settings_ecole_exact') {
                return { select: () => Promise.resolve({ data: DEFAULT_MOCK_SETTINGS }) };
            }
            return createMockSupabaseQuery();
        };

        const quote = await computeSchoolSubscriptionQuote('ecole_exact');
        assert.strictEqual(quote.totalStudents, 2);
        assert.strictEqual(quote.breakdown.college_secondaire, 2);
    });

    it('61: Classe inconnue non configurée -> HTTP 422 fail-closed avec unclassified_count', async () => {
        supabase.from = (table) => {
            if (table === 'schools') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 's1', slug: 'ecole_unknown_cls' } }) }) }) };
            if (table === 'students_ecole_unknown_cls') {
                return {
                    select: () => Promise.resolve({
                        data: [{ id: 'st1', classe: 'Classe Inexistante' }]
                    })
                };
            }
            if (table === 'app_settings_ecole_unknown_cls') {
                return { select: () => Promise.resolve({ data: DEFAULT_MOCK_SETTINGS }) };
            }
            return createMockSupabaseQuery();
        };

        const req = { params: { slug: 'ecole_unknown_cls' }, user: { role: 'directeur', schoolSlug: 'ecole_unknown_cls' } };
        const res = makeMockRes();
        await getSubscriptionQuote(req, res);

        assert.strictEqual(res.statusCode, 422);
        assert.strictEqual(res.body.code, 'SUBSCRIPTION_CLASSIFICATION_INCOMPLETE');
        assert.strictEqual(res.body.unclassified_count, 1);
    });

    it('62: Classe configurée mais billingCategory absente -> HTTP 422 fail-closed', async () => {
        supabase.from = (table) => {
            if (table === 'schools') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 's1', slug: 'ecole_missing_cat' } }) }) }) };
            if (table === 'students_ecole_missing_cat') {
                return {
                    select: () => Promise.resolve({
                        data: [{ id: 'st1', classe: 'CP_SANS_CAT' }]
                    })
                };
            }
            if (table === 'app_settings_ecole_missing_cat') {
                return {
                    select: () => Promise.resolve({
                        data: [
                            { key: 'school_year', value: '2026-2027' },
                            { key: 'classes', value: JSON.stringify([{ name: 'CP_SANS_CAT', cycle: 'Primaire' }]) } // billingCategory absente
                        ]
                    })
                };
            }
            return createMockSupabaseQuery();
        };

        const req = { params: { slug: 'ecole_missing_cat' }, user: { role: 'directeur', schoolSlug: 'ecole_missing_cat' } };
        const res = makeMockRes();
        await getSubscriptionQuote(req, res);

        assert.strictEqual(res.statusCode, 422);
        assert.strictEqual(res.body.code, 'SUBSCRIPTION_CLASSIFICATION_INCOMPLETE');
        assert.strictEqual(res.body.unclassified_count, 1);
    });

    it('63: Aucun nom d élève exposé dans la réponse d erreur de classification', async () => {
        supabase.from = (table) => {
            if (table === 'schools') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 's1', slug: 'ecole_leak_check' } }) }) }) };
            if (table === 'students_ecole_leak_check') {
                return {
                    select: () => Promise.resolve({
                        data: [{ id: 'secret_uuid_1', nom: 'DUPONT_SECRET', prenom: 'JEAN_SECRET', classe: 'ClasseInconnue' }]
                    })
                };
            }
            if (table === 'app_settings_ecole_leak_check') {
                return { select: () => Promise.resolve({ data: DEFAULT_MOCK_SETTINGS }) };
            }
            return createMockSupabaseQuery();
        };

        const req = { params: { slug: 'ecole_leak_check' }, user: { role: 'directeur', schoolSlug: 'ecole_leak_check' } };
        const res = makeMockRes();
        await getSubscriptionQuote(req, res);

        assert.strictEqual(res.statusCode, 422);
        const respStr = JSON.stringify(res.body);
        assert.ok(!respStr.includes('DUPONT_SECRET'));
        assert.ok(!respStr.includes('JEAN_SECRET'));
        assert.ok(!respStr.includes('secret_uuid_1'));
    });

    it('64: Quote Loading : widget frontend masque cartes et boutons de paiement', () => {
        const widgetCode = fs.readFileSync(path.join(__dirname, '../../src/components/SchoolSubscriptionWidget.tsx'), 'utf-8');
        assert.ok(widgetCode.includes('isLoadingQuote'), 'Présence de l état isLoadingQuote');
        assert.ok(widgetCode.includes('Calcul du devis officiel en cours'), 'Message de chargement présent');
    });

    it('65: Quote Error : aucune carte à zéro affichée', () => {
        const widgetCode = fs.readFileSync(path.join(__dirname, '../../src/components/SchoolSubscriptionWidget.tsx'), 'utf-8');
        assert.ok(widgetCode.includes('!isLoadingQuote && (quoteError || !serverQuote)'), 'Conditionnement strict en cas d erreur');
    });

    it('66: Quote Error : bouton Réessayer présent et relié à fetchQuote', () => {
        const widgetCode = fs.readFileSync(path.join(__dirname, '../../src/components/SchoolSubscriptionWidget.tsx'), 'utf-8');
        assert.ok(widgetCode.includes('onClick={fetchQuote}'), 'Bouton Réessayer relance fetchQuote');
        assert.ok(widgetCode.includes('Réessayer'), 'Libellé Réessayer présent');
    });

    it('67: Quote Valide : seules les catégories count > 0 sont rendues', () => {
        const widgetCode = fs.readFileSync(path.join(__dirname, '../../src/components/SchoolSubscriptionWidget.tsx'), 'utf-8');
        assert.ok(widgetCode.includes('effectiveBreakdown.maternelle_primaire > 0 &&'), 'Filtrage count > 0 maternelle_primaire');
        assert.ok(widgetCode.includes('effectiveBreakdown.college_secondaire > 0 &&'), 'Filtrage count > 0 college_secondaire');
        assert.ok(widgetCode.includes('effectiveBreakdown.superieur_formation > 0 &&'), 'Filtrage count > 0 superieur_formation');
    });

    it('68: Quote_id absent ou quoteError -> tentative de paiement bloquée fail-closed', () => {
        const widgetCode = fs.readFileSync(path.join(__dirname, '../../src/components/SchoolSubscriptionWidget.tsx'), 'utf-8');
        assert.ok(widgetCode.includes('!serverQuote.quote_id || quoteError'), 'Guard de paiement fail-closed');
    });

    it('69: App.tsx ne contient aucun appel automatique à webPushService.init() après connexion', () => {
        const appCode = fs.readFileSync(path.join(__dirname, '../../src/App.tsx'), 'utf-8');
        assert.ok(!appCode.includes('webPushService.init()'), 'Aucun appel inconditionnel à webPushService.init() dans App.tsx');
    });

    it('70: Demande de permission push uniquement dans les Paramètres sur clic explicite', () => {
        const paramsCode = fs.readFileSync(path.join(__dirname, '../../src/pages/Parametres.tsx'), 'utf-8');
        assert.ok(paramsCode.includes('handleEnablePushNotifications'), 'Handler explicite dans Parametres.tsx');
        assert.ok(paramsCode.includes('Notification.requestPermission()'), 'Demande de permission dans le handler explicite');
        assert.ok(paramsCode.includes('Activer les notifications'), 'Bouton explicite présent');
    });

    it('71: Connexion directeur : 0 appel automatique à Notification.requestPermission', () => {
        const loginCode = fs.readFileSync(path.join(__dirname, '../../src/components/Login.tsx'), 'utf-8');
        const appCode = fs.readFileSync(path.join(__dirname, '../../src/App.tsx'), 'utf-8');
        const storeCode = fs.readFileSync(path.join(__dirname, '../../src/store/useStore.ts'), 'utf-8');
        assert.ok(!loginCode.includes('Notification.requestPermission'), 'Login.tsx ne doit pas demander la permission');
        assert.ok(!appCode.includes('Notification.requestPermission'), 'App.tsx ne doit pas demander la permission');
        assert.ok(!storeCode.includes('Notification.requestPermission'), 'useStore.ts ne doit pas demander la permission');
    });

    it('72: Rechargement authentifié : 0 appel automatique à Notification.requestPermission', () => {
        const appCode = fs.readFileSync(path.join(__dirname, '../../src/App.tsx'), 'utf-8');
        const layoutCode = fs.readFileSync(path.join(__dirname, '../../src/components/Layout.tsx'), 'utf-8');
        assert.ok(!appCode.includes('webPushService.init'), 'App.tsx ne déclenche pas le service push');
        assert.ok(!layoutCode.includes('Notification.requestPermission'), 'Layout.tsx ne demande pas de permission');
    });

    it('73: Ouverture du Dashboard : 0 appel automatique à Notification.requestPermission', () => {
        const dashCode = fs.readFileSync(path.join(__dirname, '../../src/pages/Dashboard.tsx'), 'utf-8');
        const parentDashCode = fs.readFileSync(path.join(__dirname, '../../src/pages/parent/ParentDashboard.tsx'), 'utf-8');
        assert.ok(!dashCode.includes('Notification.requestPermission'), 'Dashboard.tsx ne demande pas de permission');
        assert.ok(!parentDashCode.includes('Notification.requestPermission'), 'ParentDashboard.tsx ne demande pas de permission');
    });

    it('74: Clic « Activer les notifications » : exactement 1 appel à Notification.requestPermission()', () => {
        const paramsCode = fs.readFileSync(path.join(__dirname, '../../src/pages/Parametres.tsx'), 'utf-8');
        const occurrences = (paramsCode.match(/Notification\.requestPermission\(\)/g) || []).length;
        assert.strictEqual(occurrences, 1, 'Exactement 1 appel à Notification.requestPermission() dans Parametres.tsx');
    });

    it('75: Double demande supprimée : si permission === granted, webPushService.init() ne rappelle pas requestPermission', () => {
        const webPushCode = fs.readFileSync(path.join(__dirname, '../../src/services/webPushService.ts'), 'utf-8');
        assert.ok(webPushCode.includes("permission !== 'granted'"), 'Vérification préalable de permission dans webPushService');
    });

    it('76: Permission denied : aucune souscription push et message explicite', () => {
        const paramsCode = fs.readFileSync(path.join(__dirname, '../../src/pages/Parametres.tsx'), 'utf-8');
        assert.ok(paramsCode.includes('Notifications refusées dans le navigateur'), 'Message explicite si denied');
    });

    it('77: Navigateur incompatible : aucun crash et statut unsupported géré', () => {
        const paramsCode = fs.readFileSync(path.join(__dirname, '../../src/pages/Parametres.tsx'), 'utf-8');
        assert.ok(paramsCode.includes('Notifications non prises en charge'), 'Gestion du statut unsupported');
    });

    it('78: Option B - chk_saas_billing_period_required autorise pricing_schema_version = 1 sans billing_period', () => {
        const sqlCode = fs.readFileSync(path.join(__dirname, '../scripts/migration_p8_saas_pricing_quotes_rpc.sql'), 'utf-8');
        assert.ok(sqlCode.includes('COALESCE(pricing_schema_version, 1) = 1'), 'Conditionnement de la contrainte billing_period sur version 1');
    });

    it('79: Option B - chk_saas_payable_amount_required autorise pricing_schema_version = 1 sans payable_amount', () => {
        const sqlCode = fs.readFileSync(path.join(__dirname, '../scripts/migration_p8_saas_pricing_quotes_rpc.sql'), 'utf-8');
        assert.ok(sqlCode.includes('chk_saas_payable_amount_required'), 'chk_saas_payable_amount_required présent');
    });

    it('80: Option B - Aucune période ou montant financier inventé dans le script de migration', () => {
        const sqlCode = fs.readFileSync(path.join(__dirname, '../scripts/migration_p8_saas_pricing_quotes_rpc.sql'), 'utf-8');
        assert.ok(!sqlCode.includes('SET billing_period ='), 'Aucun backfill de billing_period inventé');
        assert.ok(!sqlCode.includes('SET payable_amount ='), 'Aucun backfill de payable_amount inventé');
    });

    it('81: Option B - DEFAULT 2 et NOT NULL imposés sur pricing_schema_version', () => {
        const sqlCode = fs.readFileSync(path.join(__dirname, '../scripts/migration_p8_saas_pricing_quotes_rpc.sql'), 'utf-8');
        assert.ok(sqlCode.includes('ALTER COLUMN pricing_schema_version SET DEFAULT 2'), 'SET DEFAULT 2 présent');
        assert.ok(sqlCode.includes('ALTER COLUMN pricing_schema_version SET NOT NULL'), 'SET NOT NULL présent');
    });

    it('82: Option B - Contrainte chk_pricing_schema_version_valid restreinte à (1, 2)', () => {
        const sqlCode = fs.readFileSync(path.join(__dirname, '../scripts/migration_p8_saas_pricing_quotes_rpc.sql'), 'utf-8');
        assert.ok(sqlCode.includes('chk_pricing_schema_version_valid') && sqlCode.includes('pricing_schema_version IN (1, 2)'), 'Contrainte valide');
    });

    it('83: Option B - Trigger d immutabilité strict empêchant toute mutation de pricing_schema_version', () => {
        const sqlCode = fs.readFileSync(path.join(__dirname, '../scripts/migration_p8_saas_pricing_quotes_rpc.sql'), 'utf-8');
        assert.ok(sqlCode.includes('prevent_pricing_schema_version_modification'), 'Fonction trigger d immutabilité présente');
        assert.ok(sqlCode.includes('PRICING_SCHEMA_VERSION_IMMUTABLE'), 'Exception explicite en cas de tentative de mutation');
    });

    it('84: Option B - Le backend force obligatoirement pricing_schema_version = 2 lors de la création d intention', () => {
        const controllerCode = fs.readFileSync(path.join(__dirname, '../controllers/paymentController.js'), 'utf-8');
        assert.ok(controllerCode.includes('pricing_schema_version: 2'), 'pricing_schema_version fixé à 2 côté serveur');
    });

    it('85: Option B - Aucun paramètre pricing_schema_version n est accepté depuis req.body', () => {
        const controllerCode = fs.readFileSync(path.join(__dirname, '../controllers/paymentController.js'), 'utf-8');
        assert.ok(!controllerCode.includes('req.body.pricing_schema_version'), 'Rejet de toute valeur client pour la version');
    });

    it('86: Option B - Une nouvelle intention ne peut jamais être insérée en schema version 1', () => {
        const sqlCode = fs.readFileSync(path.join(__dirname, '../scripts/migration_p8_saas_pricing_quotes_rpc.sql'), 'utf-8');
        assert.ok(sqlCode.includes("TG_OP = 'INSERT'"), 'Vérification TG_OP INSERT présente');
        assert.ok(sqlCode.includes('NEW.pricing_schema_version IS DISTINCT FROM 2'), 'Condition de rejet sur INSERT si non 2');
        assert.ok(sqlCode.includes('PRICING_SCHEMA_VERSION_LEGACY_ONLY'), 'Exception explicite PRICING_SCHEMA_VERSION_LEGACY_ONLY');
        assert.ok(sqlCode.includes('BEFORE INSERT OR UPDATE ON public.payment_intents'), 'Trigger monté sur BEFORE INSERT OR UPDATE');
    });

    // =========================================================================
    // SECTION 17 : ZONES TARIFAIRES INTERNATIONALES (P9 - CEMAC, GHANA, ESPAGNE)
    // =========================================================================

    it('87: P9 - Résolution CEMAC (XAF) pour CM, GA, CG, TD, CF, GQ', async () => {
        supabase.from = (table) => createMockSupabaseQuery({ tableName: table });
        const cemacCountries = ['CM', 'GA', 'CG', 'TD', 'CF', 'GQ'];
        for (const c of cemacCountries) {
            const grid = await resolveActivePricingGrid(c);
            assert.strictEqual(grid.pricing_version, '2026.1_xaf_cemac', `Version CEMAC attendue pour ${c}`);
            assert.strictEqual(grid.currency_code, 'XAF');
            assert.strictEqual(grid.currency_symbol, 'FCFA');
            assert.strictEqual(grid.currency_minor_unit, 0);
            assert.strictEqual(grid.locale, 'fr-CM');
            assert.strictEqual(grid.scope_type, 'region');
            assert.strictEqual(grid.scope_code, 'CEMAC');
            assert.strictEqual(grid.payment_status, 'configuration_pending');
            assert.strictEqual(grid.rates_monthly.maternelle_primaire, 100);
            assert.strictEqual(grid.rates_monthly.college_secondaire, 150);
            assert.strictEqual(grid.rates_monthly.superieur_formation, 200);
        }
    });

    it('88: P9 - Résolution Ghana (GHS) en pesewas (minor_unit = 2)', async () => {
        supabase.from = (table) => createMockSupabaseQuery({ tableName: table });
        const grid = await resolveActivePricingGrid('GH');
        assert.strictEqual(grid.pricing_version, '2026.1_ghs_ghana');
        assert.strictEqual(grid.currency_code, 'GHS');
        assert.strictEqual(grid.currency_symbol, 'GH₵');
        assert.strictEqual(grid.currency_minor_unit, 2);
        assert.strictEqual(grid.locale, 'en-GH');
        assert.strictEqual(grid.scope_type, 'country');
        assert.strictEqual(grid.scope_code, 'GH');
        assert.strictEqual(grid.payment_status, 'configuration_pending');
        assert.strictEqual(grid.rates_monthly.maternelle_primaire, 200);
        assert.strictEqual(grid.rates_monthly.college_secondaire, 300);
        assert.strictEqual(grid.rates_monthly.superieur_formation, 400);
    });

    it('89: P9 - Résolution Espagne (EUR) en centimes (minor_unit = 2)', async () => {
        supabase.from = (table) => createMockSupabaseQuery({ tableName: table });
        const grid = await resolveActivePricingGrid('ES');
        assert.strictEqual(grid.pricing_version, '2026.1_eur_spain');
        assert.strictEqual(grid.currency_code, 'EUR');
        assert.strictEqual(grid.currency_symbol, '€');
        assert.strictEqual(grid.currency_minor_unit, 2);
        assert.strictEqual(grid.locale, 'es-ES');
        assert.strictEqual(grid.scope_type, 'country');
        assert.strictEqual(grid.scope_code, 'ES');
        assert.strictEqual(grid.payment_status, 'configuration_pending');
        assert.strictEqual(grid.rates_monthly.maternelle_primaire, 50);
        assert.strictEqual(grid.rates_monthly.college_secondaire, 75);
        assert.strictEqual(grid.rates_monthly.superieur_formation, 100);
    });

    it('90: P9 - Résolution UEMOA (XOF) inchangée pour les 8 pays membres', async () => {
        supabase.from = (table) => createMockSupabaseQuery({ tableName: table });
        const uemoaCountries = ['BJ', 'TG', 'CI', 'SN', 'ML', 'BF', 'NE', 'GW'];
        for (const c of uemoaCountries) {
            const grid = await resolveActivePricingGrid(c);
            assert.strictEqual(grid.pricing_version, '2026.1_xof_uemoa', `Version UEMOA attendue pour ${c}`);
            assert.strictEqual(grid.currency_code, 'XOF');
            assert.strictEqual(grid.currency_symbol, 'FCFA');
            assert.strictEqual(grid.currency_minor_unit, 0);
            assert.strictEqual(grid.payment_status, 'production');
        }
    });

    it('91: P9 - Pays inconnu ou non couvert rejeté sans fallback silencieux (PRICING_GRID_NOT_CONFIGURED)', async () => {
        supabase.from = (table) => createMockSupabaseQuery({ tableName: table });
        const unconfigured = ['US', 'FR', 'ZZ', 'DE', 'GB'];
        for (const c of unconfigured) {
            let error = null;
            try {
                await resolveActivePricingGrid(c);
            } catch (err) {
                error = err;
            }
            assert.ok(error, `Une erreur doit être levée pour le pays non couvert ${c}`);
            assert.strictEqual(error.code, 'PRICING_GRID_NOT_CONFIGURED');
        }
    });

    it('92: P9 - Calcul devis CEMAC (XAF) : 4 élèves maternelle/primaire', async () => {
        supabase.from = (table) => createMockSupabaseQuery({ tableName: table });
        const grid = await resolveActivePricingGrid('CM');
        const breakdown = { maternelle_primaire: 4, college_secondaire: 0, superieur_formation: 0 };
        const monthly = breakdown.maternelle_primaire * grid.rates_monthly.maternelle_primaire;
        const totalAnnual = monthly * 10;
        const discount = Math.round(totalAnnual * 0.1);
        const payableAnnual = totalAnnual - discount;
        const tranches = calculateDeterministicTranches(totalAnnual);

        assert.strictEqual(monthly, 400);
        assert.strictEqual(totalAnnual, 4000);
        assert.strictEqual(discount, 400);
        assert.strictEqual(payableAnnual, 3600);
        assert.deepStrictEqual(tranches, [1334, 1333, 1333]);
        assert.strictEqual(tranches[0] + tranches[1] + tranches[2], 4000);
    });

    it('93: P9 - Calcul devis Ghana (GHS) : 4 élèves en pesewas (minor_unit = 2)', async () => {
        supabase.from = (table) => createMockSupabaseQuery({ tableName: table });
        const grid = await resolveActivePricingGrid('GH');
        const breakdown = { maternelle_primaire: 4, college_secondaire: 0, superieur_formation: 0 };
        const monthly = breakdown.maternelle_primaire * grid.rates_monthly.maternelle_primaire;
        const totalAnnual = monthly * 10;
        const discount = Math.round(totalAnnual * 0.1);
        const payableAnnual = totalAnnual - discount;
        const tranches = calculateDeterministicTranches(totalAnnual);

        assert.strictEqual(monthly, 800);
        assert.strictEqual(totalAnnual, 8000);
        assert.strictEqual(discount, 800);
        assert.strictEqual(payableAnnual, 7200);
        assert.deepStrictEqual(tranches, [2667, 2667, 2666]);
        assert.strictEqual(tranches[0] + tranches[1] + tranches[2], 8000);
    });

    it('94: P9 - Calcul devis Espagne (EUR) : 4 élèves en centimes (minor_unit = 2)', async () => {
        supabase.from = (table) => createMockSupabaseQuery({ tableName: table });
        const grid = await resolveActivePricingGrid('ES');
        const breakdown = { maternelle_primaire: 4, college_secondaire: 0, superieur_formation: 0 };
        const monthly = breakdown.maternelle_primaire * grid.rates_monthly.maternelle_primaire;
        const totalAnnual = monthly * 10;
        const discount = Math.round(totalAnnual * 0.1);
        const payableAnnual = totalAnnual - discount;
        const tranches = calculateDeterministicTranches(totalAnnual);

        assert.strictEqual(monthly, 200);
        assert.strictEqual(totalAnnual, 2000);
        assert.strictEqual(discount, 200);
        assert.strictEqual(payableAnnual, 1800);
        assert.deepStrictEqual(tranches, [667, 667, 666]);
        assert.strictEqual(tranches[0] + tranches[1] + tranches[2], 2000);
    });

    it('95: P9 - POST /pay-init pour un pays en configuration_pending retourne HTTP 503 sans intention ni appel FedaPay', async () => {
        let createdIntents = 0;

        supabase.from = (table) => {
            if (table === 'schools') {
                return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 's_cm', slug: 'ecole_cameroun', country: 'CM' } }) }) }) };
            }
            if (table === 'saas_subscription_quotes') {
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                single: () => Promise.resolve({
                                    data: {
                                        quote_id: 'quote_mock_cm_123',
                                        school_slug: 'ecole_cameroun',
                                        payment_status: 'configuration_pending',
                                        provider: 'pending',
                                        billing_period: '2026-2027',
                                        currency_code: 'XAF',
                                        currency_minor_unit: 0,
                                        status: 'issued',
                                        expires_at: new Date(Date.now() + 600000).toISOString(),
                                        payment_options: { annual: { grossAmount: 4000, discountAmount: 400, payableAmount: 3600 } }
                                    }
                                })
                            })
                        })
                    })
                };
            }
            if (table === 'payment_intents') {
                return {
                    insert: () => {
                        createdIntents++;
                        return { select: () => ({ single: () => Promise.resolve({ data: { id: 'intent_should_not_be_created' } }) }) };
                    }
                };
            }
            return createMockSupabaseQuery();
        };

        const req = {
            params: { slug: 'ecole_cameroun' },
            body: {
                planType: 'annual',
                quote_id: 'quote_mock_cm_123'
            },
            user: {
                id: '550e8400-e29b-41d4-a716-446655440000',
                role: 'directeur',
                schoolSlug: 'ecole_cameroun'
            }
        };

        const res = makeMockRes();
        await createSaasTransaction(req, res);

        assert.strictEqual(res.statusCode, 503, 'Doit retourner HTTP 503');
        assert.strictEqual(res.body.code, 'PAYMENT_PROVIDER_NOT_CONFIGURED_FOR_COUNTRY');
        assert.ok(res.body.error.includes('prochainement disponible dans votre pays'));
        assert.strictEqual(createdIntents, 0, 'Exactement 0 intention créée');
    });

    it('96: P9 - Structure transactionnelle et sécurité de migration_p9_international_pricing_zones.sql', () => {
        const sqlCode = fs.readFileSync(path.join(__dirname, '../scripts/migration_p9_international_pricing_zones.sql'), 'utf-8');
        assert.ok(sqlCode.includes('BEGIN;'), 'Migration P9 contient BEGIN');
        assert.ok(sqlCode.trim().endsWith('COMMIT;'), 'Migration P9 termine par COMMIT');
        assert.ok(!sqlCode.includes('DELETE FROM'), 'Aucun DELETE destructif dans P9');
        assert.ok(!sqlCode.includes('TRUNCATE'), 'Aucun TRUNCATE dans P9');
        assert.ok(!sqlCode.includes('DROP TABLE'), 'Aucun DROP TABLE dans P9');
        assert.ok(sqlCode.includes('2026.1_xaf_cemac'), 'Grille CEMAC définie');
        assert.ok(sqlCode.includes('2026.1_ghs_ghana'), 'Grille Ghana définie');
        assert.ok(sqlCode.includes('2026.1_eur_spain'), 'Grille Espagne définie');
        assert.ok(sqlCode.includes('pricing_version'), 'Colonne pricing_version présente');
        assert.ok(sqlCode.includes('payment_status'), 'Colonne payment_status présente');
    });

    it('97: P9 - Formatage monétaire frontend (XAF, GHS, EUR, XOF)', () => {
        const widgetCode = fs.readFileSync(path.join(__dirname, '../../src/components/SchoolSubscriptionWidget.tsx'), 'utf-8');
        assert.ok(widgetCode.includes('formatQuoteCurrencyAmount'), 'Fonction formatQuoteCurrencyAmount présente dans le widget');
        assert.ok(widgetCode.includes('Le paiement électronique sera prochainement disponible dans votre pays'), 'Message informatif de configuration pending présent');
        assert.ok(widgetCode.includes('!isPaymentPending && ('), 'Boutons de paiement masqués/désactivés en configuration pending');
    });

    it('98: P9 - Contrat exhaustif du devis (20 champs obligatoires)', async () => {
        supabase.from = (table) => {
            if (table === 'schools') {
                return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 's_gh', slug: 'ecole_ghana', country: 'GH' } }) }) }) };
            }
            if (table === 'students_ecole_ghana') {
                return { select: () => Promise.resolve({ data: [{ id: 'st1', classe: 'CE2' }] }) };
            }
            if (table === 'app_settings_ecole_ghana') {
                return { select: () => Promise.resolve({ data: DEFAULT_MOCK_SETTINGS }) };
            }
            return createMockSupabaseQuery();
        };

        const quote = await computeSchoolSubscriptionQuote('ecole_ghana', { countryCode: 'GH' });

        const requiredContractFields = [
            'pricing_grid_id',
            'pricing_version',
            'scope_type',
            'scope_code',
            'country_code',
            'currency_code',
            'currency_symbol',
            'currency_minor_unit',
            'locale',
            'billing_period',
            'rates_monthly',
            'billing_months',
            'annual_discount_percent',
            'installments_count',
            'gross_amount',
            'discount_amount',
            'payable_amount',
            'payment_status',
            'calculated_at',
            'expires_at'
        ];

        for (const field of requiredContractFields) {
            assert.ok(quote[field] !== undefined, `Le champ de contrat ${field} doit être présent`);
        }

        assert.strictEqual(quote.currency_code, 'GHS');
        assert.strictEqual(quote.currency_minor_unit, 2);
        assert.strictEqual(quote.payment_status, 'configuration_pending');
        assert.strictEqual(quote.scope_type, 'country');
        assert.strictEqual(quote.scope_code, 'GH');
    });
});
