'use strict';
const { describe, it, before, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const TEST_JWT_SECRET = 'a_very_secure_jwt_secret_key_for_testing_purposes_at_least_32_chars_12345';
process.env.JWT_SECRET = TEST_JWT_SECRET;
process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock_service_key_for_test';

const {
    computeSchoolSubscriptionQuote,
    calculateDeterministicTranches,
    normalizeCycleToBillingCategory,
    normalizeClassName,
    validateFedaPayRedirectUrl,
    configureFedaPay,
    getSubscriptionQuote,
    createSaasTransaction,
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

function createMockSupabaseQuery(options = {}) {
    const chain = {
        update: () => chain,
        insert: () => ({
            select: () => ({
                single: () => Promise.resolve(options.insertResult || { data: { id: 'intent_mock_123' } })
            })
        }),
        select: () => chain,
        eq: () => chain,
        lte: () => Promise.resolve({ error: null }),
        single: () => Promise.resolve(options.singleResult || { data: { id: 'intent_mock_123' } })
    };
    return chain;
}

const DEFAULT_MOCK_SETTINGS = [
    { key: 'school_year', value: '2026-2027' },
    { key: 'classes', value: JSON.stringify([]) }
];

describe('🔒 SUITE DE VALIDATION COMPLÈTE — SOUSCRIPTION SAAS ET PAIEMENT (37 CONTRÔLES)', () => {
    let originalEnvSecret;
    let originalEnvMode;
    let originalFedaCreate;
    let originalSupabaseFrom;

    before(() => {
        originalEnvSecret = process.env.FEDAPAY_SECRET_KEY;
        originalEnvMode = process.env.FEDAPAY_ENVIRONMENT;
        originalFedaCreate = Transaction.create;
        originalSupabaseFrom = supabase.from;
    });

    afterEach(() => {
        process.env.FEDAPAY_SECRET_KEY = originalEnvSecret;
        process.env.FEDAPAY_ENVIRONMENT = originalEnvMode;
        Transaction.create = originalFedaCreate;
        supabase.from = originalSupabaseFrom;
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
        assert.strictEqual(res.body.code, 'ANNUAL_ALREADY_PAID');
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
            if (table === 'app_settings_ecole_new_period') return { select: () => Promise.resolve({ data: [{ key: 'school_year', value: '2027-2028' }] }) };
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
            if (table === 'app_settings_ecole_immutable') return { select: () => Promise.resolve({ data: [{ key: 'school_year', value: '2026-2027' }] }) };
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
            if (table === 'app_settings_ecole_multi_period') return { select: () => Promise.resolve({ data: [{ key: 'school_year', value: '2027-2028' }] }) };
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
    it('29: Timeout de la passerelle FedaPay -> HTTP 503 PAYMENT_PROVIDER_UNAVAILABLE', async () => {
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
        assert.strictEqual(res.body.code, 'PAYMENT_PROVIDER_UNAVAILABLE');
    });

    // ── 30. Rejet API FedaPay → 503
    it('30: Rejet API FedaPay (401 / 500) -> HTTP 503 PAYMENT_PROVIDER_UNAVAILABLE', async () => {
        process.env.FEDAPAY_SECRET_KEY = 'sk_sandbox_test_key_ok';
        process.env.FEDAPAY_ENVIRONMENT = 'sandbox';

        Transaction.create = async () => {
            const err = new Error('API Error');
            err.statusCode = 401;
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
        assert.strictEqual(res.body.code, 'PAYMENT_PROVIDER_UNAVAILABLE');
    });

    // ── 31. Token ou URL fournisseur absent → échec fail-closed
    it('31: Token ou URL fournisseur absent -> HTTP 500 PAYMENT_INITIALIZATION_FAILED', async () => {
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

        assert.strictEqual(res.statusCode, 500);
        assert.strictEqual(res.body.code, 'PAYMENT_INITIALIZATION_FAILED');
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
});
