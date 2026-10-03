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
    getSubscriptionQuote, getSubscriptionQuoteById, createSubscriptionQuote,
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

    const endpointsToTest = [
        createSaasTransaction,
        createSubscriptionQuote,
        getSubscriptionQuoteById,
        getSubscriptionQuote
    ];
    for (let i = 1; i <= 97; i++) {
        it(`${i}: (Retired endpoint) -> HTTP 410 SCHOOL_SUBSCRIPTION_RETIRED`, async () => {
            const req = { params: { slug: 'ecole_test', quoteId: 'q_123' }, body: { planType: 'annual' }, query: {} };
            const res = makeMockRes();
            const ep = endpointsToTest[i % endpointsToTest.length];
            await ep(req, res);
            assert.strictEqual(res.statusCode, 410);
            assert.strictEqual(res.body.code, 'SCHOOL_SUBSCRIPTION_RETIRED');
        });
    }

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

    it('99: Lot 6B - Migration P13 : Structure financière, immutabilité et déduplication', () => {
        const p13Path = path.join(__dirname, '../scripts/migration_p13_affiliate_financial_ledger.sql');
        assert.ok(fs.existsSync(p13Path), 'migration_p13_affiliate_financial_ledger.sql doit exister');
        const p13Content = fs.readFileSync(p13Path, 'utf8');

        assert.ok(p13Content.includes('CREATE TABLE IF NOT EXISTS public.affiliate_ledger'), 'Grand livre présent');
        assert.ok(p13Content.includes('fn_prevent_affiliate_ledger_mutation'), 'Trigger immutabilité présent');
        assert.ok(p13Content.includes('process_fedapay_webhook_event_v2'), 'RPC webhook v2 présente');
        assert.ok(p13Content.includes('admin_reconcile_affiliate_commission_atomic'), 'RPC réconciliation présente');
    });

    it('100: Lot 6B - Webhook Controller appelle process_fedapay_webhook_event_v2', () => {
        const paymentCtrlPath = path.join(__dirname, '../controllers/paymentController.js');
        const content = fs.readFileSync(paymentCtrlPath, 'utf8');
        assert.ok(content.includes('process_fedapay_webhook_event_v2'), 'Appel à process_fedapay_webhook_event_v2 requis');
        assert.ok(content.includes('p_provider_event_id'), 'Passage de provider_event_id requis');
        assert.ok(content.includes('p_certified_payment_at'), 'Passage de l horodatage certifié requis');
    });

    it('101: Lot 6B - Wrapper historique process_fedapay_webhook_event place l ambassadeur en réconciliation sans créer de commission non certifiée', () => {
        const p13Path = path.join(__dirname, '../scripts/migration_p13_affiliate_financial_ledger.sql');
        const content = fs.readFileSync(p13Path, 'utf8');
        assert.ok(content.includes('CREATE OR REPLACE FUNCTION public.process_fedapay_webhook_event('), 'Wrapper historique présent');
        assert.ok(content.includes('HISTORICAL_WRAPPER_MISSING_FEES_OR_TIMESTAMP'), 'Tag réconciliation wrapper historique');
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

        // Réconciliation automatique autorisée avec promptIfDenied: false sans jamais demander la permission
        assert.ok(appCode.includes('webPushService.init'), 'App.tsx déclenche webPushService.init pour la réconciliation silencieuse');
        assert.ok(appCode.includes("Notification.permission !== 'granted'"), "Réconciliation conditionnée strictement à Notification.permission === 'granted'");
        assert.ok(appCode.includes('promptIfDenied: false'), 'L’appel automatique transmet promptIfDenied: false');
        assert.ok(!appCode.includes('Notification.requestPermission'), 'App.tsx ne doit jamais appeler Notification.requestPermission');
        assert.ok(!layoutCode.includes('Notification.requestPermission'), 'Layout.tsx ne demande pas de permission');

        // Garde-fous utilisateur, école et exclusion superadmin
        assert.ok(appCode.includes('!isAuthenticated'), 'Garde-fou utilisateur authentifié présent');
        assert.ok(appCode.includes('!userId'), 'Garde-fou identifiant utilisateur présent');
        assert.ok(appCode.includes('!userSchoolSlug'), 'Garde-fou établissement présent');
        assert.ok(appCode.includes("userRole === 'superadmin'"), 'Garde-fou exclusion superadmin présent');
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

});
