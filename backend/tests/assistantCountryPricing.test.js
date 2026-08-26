'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    getAssistantPricingContext,
    extractGuestCountry,
    detectPricingIntent,
    detectGlobalPricingRequest,
    formatAmount,
    formatMonthlyRates,
    buildCountryPricingResponse
} = require('../services/assistantPricingContextService');

const {
    chatWithAssistant,
    chatWithPrivateAssistant
} = require('../controllers/assistantController');

process.env.AI_QUOTA_HASH_SECRET = 'test_secret_for_hmac_sha256_quota_enforcement';

const { supabase: realSupabase } = require('../utils/supabase');

// ── Fixtures de test ─────────────────────────────────────────────
const MOCK_SCHOOLS = {
    'ecole-ghana': { id: 'sch_gh', slug: 'ecole-ghana', country: 'GH' },
    'ecole-cameroun': { id: 'sch_cm', slug: 'ecole-cameroun', country: 'CM' },
    'ecole-espagne': { id: 'sch_es', slug: 'ecole-espagne', country: 'ES' },
    'ecole-benin': { id: 'sch_bj', slug: 'ecole-benin', country: 'BJ' },
    'ecole-niger': { id: 'sch_ne', slug: 'ecole-niger', country: 'NE' },
    'ecole-nigeria': { id: 'sch_ng', slug: 'ecole-nigeria', country: 'NG' }
};

const MOCK_ASSOCIATIONS = {
    GH: [{ pricing_grid_id: 'grid_gh', country_code: 'GH' }],
    CM: [{ pricing_grid_id: 'grid_cemac', country_code: 'CM' }],
    ES: [{ pricing_grid_id: 'grid_es', country_code: 'ES' }],
    BJ: [{ pricing_grid_id: 'grid_uemoa', country_code: 'BJ' }],
    NE: [{ pricing_grid_id: 'grid_uemoa', country_code: 'NE' }],
    NG: [{ pricing_grid_id: 'grid_ng', country_code: 'NG' }]
};

const MOCK_GRIDS = {
    grid_gh: {
        id: 'grid_gh',
        pricing_version: '2026.1_ghs_ghana',
        scope_type: 'country',
        scope_code: 'GH',
        currency_code: 'GHS',
        currency_symbol: 'GH₵',
        currency_minor_unit: 2,
        rates_monthly: { maternelle_primaire: 200, college_secondaire: 300, superieur_formation: 400 },
        billing_months: 10,
        annual_discount_percent: 10,
        installments_count: 3,
        pricing_status: 'active',
        payment_status: 'configuration_pending',
        enabled: true
    },
    grid_cemac: {
        id: 'grid_cemac',
        pricing_version: '2026.1_xaf_cemac',
        scope_type: 'region',
        scope_code: 'CEMAC',
        currency_code: 'XAF',
        currency_symbol: 'FCFA',
        currency_minor_unit: 0,
        rates_monthly: { maternelle_primaire: 100, college_secondaire: 150, superieur_formation: 200 },
        billing_months: 10,
        annual_discount_percent: 10,
        installments_count: 3,
        pricing_status: 'active',
        payment_status: 'configuration_pending',
        enabled: true
    },
    grid_es: {
        id: 'grid_es',
        pricing_version: '2026.1_eur_spain',
        scope_type: 'country',
        scope_code: 'ES',
        currency_code: 'EUR',
        currency_symbol: '€',
        currency_minor_unit: 2,
        rates_monthly: { maternelle_primaire: 50, college_secondaire: 75, superieur_formation: 100 },
        billing_months: 10,
        annual_discount_percent: 10,
        installments_count: 3,
        pricing_status: 'active',
        payment_status: 'configuration_pending',
        enabled: true
    },
    grid_uemoa: {
        id: 'grid_uemoa',
        pricing_version: '2026.1_xof_uemoa',
        scope_type: 'region',
        scope_code: 'UEMOA',
        currency_code: 'XOF',
        currency_symbol: 'FCFA',
        currency_minor_unit: 0,
        rates_monthly: { maternelle_primaire: 100, college_secondaire: 150, superieur_formation: 200 },
        billing_months: 10,
        annual_discount_percent: 10,
        installments_count: 3,
        pricing_status: 'active',
        payment_status: 'production',
        enabled: true
    },
    grid_ng: {
        id: 'grid_ng',
        pricing_version: '2026.1_ngn_nigeria',
        scope_type: 'country',
        scope_code: 'NG',
        currency_code: 'NGN',
        currency_symbol: '₦',
        currency_minor_unit: 2,
        rates_monthly: { maternelle_primaire: 30000, college_secondaire: 45000, superieur_formation: 60000 },
        billing_months: 10,
        annual_discount_percent: 10,
        installments_count: 3,
        pricing_status: 'active',
        payment_status: 'configuration_pending',
        enabled: true
    }
};

/**
 * Crée un mock du client Supabase garantissant l'absence totale d'écriture.
 */
function createMockSupabase(customConfig = {}) {
    const writeCalls = [];

    const mockClient = {
        _writeCalls: writeCalls,
        from(tableName) {
            let filterField = null;
            let filterValue = null;
            let inField = null;
            let inValues = [];
            let isSingle = false;

            return {
                insert() {
                    writeCalls.push({ action: 'insert', table: tableName });
                    return Promise.resolve({ data: null, error: new Error('WRITE_FORBIDDEN') });
                },
                update() {
                    writeCalls.push({ action: 'update', table: tableName });
                    return Promise.resolve({ data: null, error: new Error('WRITE_FORBIDDEN') });
                },
                delete() {
                    writeCalls.push({ action: 'delete', table: tableName });
                    return Promise.resolve({ data: null, error: new Error('WRITE_FORBIDDEN') });
                },
                select() {
                    const queryBuilder = {
                        eq(field, val) {
                            filterField = field;
                            filterValue = val;
                            return queryBuilder;
                        },
                        in(field, vals) {
                            inField = field;
                            inValues = vals;
                            return queryBuilder;
                        },
                        single() {
                            isSingle = true;
                            return queryBuilder._exec();
                        },
                        then(resolve, reject) {
                            return queryBuilder._exec().then(resolve, reject);
                        },
                        _exec() {
                            if (customConfig.simulateDbError) {
                                return Promise.resolve({ data: null, error: new Error('DB_CONNECTION_ERROR') });
                            }

                            if (tableName === 'schools') {
                                const sch = (customConfig.schools || MOCK_SCHOOLS)[filterValue];
                                if (!sch) {
                                    return Promise.resolve({ data: null, error: { message: 'School not found' } });
                                }
                                return Promise.resolve({ data: sch, error: null });
                            }

                            if (tableName === 'saas_pricing_grid_countries') {
                                const assocs = (customConfig.associations || MOCK_ASSOCIATIONS)[filterValue] || [];
                                return Promise.resolve({ data: assocs, error: null });
                            }

                            if (tableName === 'saas_pricing_grids') {
                                const gridsMap = customConfig.grids || MOCK_GRIDS;
                                const matched = inValues.map(id => gridsMap[id]).filter(Boolean);
                                return Promise.resolve({ data: matched, error: null });
                            }

                            return Promise.resolve({ data: [], error: null });
                        }
                    };
                    return queryBuilder;
                }
            };
        }
    };

    return mockClient;
}

// ── Tests Unitaires et Fonctionnels ──────────────────────────────

test('1. Ghana authentifié → résout exclusivement la grille Ghana', async () => {
    const supabase = createMockSupabase();
    const ctx = await getAssistantPricingContext({
        authenticatedUser: { id: 'u1', schoolSlug: 'ecole-ghana', role: 'directeur' },
        supabaseClient: supabase
    });

    assert.equal(ctx.country_code, 'GH');
    assert.equal(ctx.currency_code, 'GHS');
    assert.equal(ctx.currency_symbol, 'GH₵');
    assert.equal(ctx.currency_minor_unit, 2);
    assert.equal(ctx.rates_monthly.maternelle_primaire, 200);
});

test('2. Cameroun authentifié → résout exclusivement la grille CEMAC (XAF)', async () => {
    const supabase = createMockSupabase();
    const ctx = await getAssistantPricingContext({
        authenticatedUser: { id: 'u2', schoolSlug: 'ecole-cameroun', role: 'admin' },
        supabaseClient: supabase
    });

    assert.equal(ctx.country_code, 'CM');
    assert.equal(ctx.currency_code, 'XAF');
    assert.equal(ctx.currency_symbol, 'FCFA');
    assert.equal(ctx.currency_minor_unit, 0);
    assert.equal(ctx.rates_monthly.maternelle_primaire, 100);
});

test('3. Espagne authentifiée → résout exclusivement la grille Espagne (EUR)', async () => {
    const supabase = createMockSupabase();
    const ctx = await getAssistantPricingContext({
        authenticatedUser: { id: 'u3', schoolSlug: 'ecole-espagne', role: 'directeur' },
        supabaseClient: supabase
    });

    assert.equal(ctx.country_code, 'ES');
    assert.equal(ctx.currency_code, 'EUR');
    assert.equal(ctx.currency_symbol, '€');
    assert.equal(ctx.currency_minor_unit, 2);
    assert.equal(ctx.rates_monthly.maternelle_primaire, 50);
});

test('4. Bénin authentifié → résout exclusivement la grille UEMOA (XOF)', async () => {
    const supabase = createMockSupabase();
    const ctx = await getAssistantPricingContext({
        authenticatedUser: { id: 'u4', schoolSlug: 'ecole-benin', role: 'directeur' },
        supabaseClient: supabase
    });

    assert.equal(ctx.country_code, 'BJ');
    assert.equal(ctx.currency_code, 'XOF');
    assert.equal(ctx.currency_symbol, 'FCFA');
    assert.equal(ctx.currency_minor_unit, 0);
    assert.equal(ctx.rates_monthly.maternelle_primaire, 100);
});

test('5. Payload hermétique → la réponse finale ne contient que la grille ciblée sans codes ISO entre crochets', async () => {
    const supabase = createMockSupabase();
    const ctx = await getAssistantPricingContext({
        authenticatedUser: { id: 'u1', schoolSlug: 'ecole-ghana' },
        supabaseClient: supabase
    });
    const reply = buildCountryPricingResponse(ctx);

    assert.match(reply, /Ghana/);
    assert.match(reply, /cedis ghanéens \(GHS\)/);
    assert.match(reply, /2,00 GH₵/);
    // Strict prohibition of brackets and redundant currency format
    assert.doesNotMatch(reply, /\[GH\]/);
    assert.doesNotMatch(reply, /GHS \/ GH₵/);
    assert.doesNotMatch(reply, /FCFA/);
    assert.doesNotMatch(reply, /EUR/);
    assert.doesNotMatch(reply, /XOF/);
    assert.doesNotMatch(reply, /XAF/);
    assert.doesNotMatch(reply, /NGN/);
});

test('6. Priorité autoritaire : Authentifié Ghana demandant ES → ES ignoré, Ghana résolu', async () => {
    const supabase = createMockSupabase();
    const ctx = await getAssistantPricingContext({
        authenticatedUser: { id: 'u1', schoolSlug: 'ecole-ghana' },
        requestedCountryCode: 'ES',
        supabaseClient: supabase
    });

    assert.equal(ctx.country_code, 'GH');
    assert.equal(ctx.currency_code, 'GHS');
});

test('7. Invité sans pays → COUNTRY_REQUIRED', async () => {
    const supabase = createMockSupabase();
    await assert.rejects(
        async () => {
            await getAssistantPricingContext({
                requestedCountryCode: null,
                supabaseClient: supabase
            });
        },
        (err) => err.code === 'COUNTRY_REQUIRED'
    );
});

test('8. Invité avec Ghana explicite → grille Ghana résolue', async () => {
    const supabase = createMockSupabase();
    const ctx = await getAssistantPricingContext({
        requestedCountryCode: 'GH',
        supabaseClient: supabase
    });

    assert.equal(ctx.country_code, 'GH');
    assert.equal(ctx.currency_code, 'GHS');
});

test('9. Pays non configuré (ex: ZZ) → PRICING_NOT_CONFIGURED, aucun fallback silencieux', async () => {
    const supabase = createMockSupabase();
    await assert.rejects(
        async () => {
            await getAssistantPricingContext({
                requestedCountryCode: 'ZZ',
                supabaseClient: supabase
            });
        },
        (err) => err.code === 'PRICING_NOT_CONFIGURED'
    );
});

test('10. Collision de grilles actives (>1) → MULTIPLE_ACTIVE_PRICING_GRIDS (fail-closed)', async () => {
    const customConfig = {
        associations: {
            GH: [
                { pricing_grid_id: 'grid_gh_1', country_code: 'GH' },
                { pricing_grid_id: 'grid_gh_2', country_code: 'GH' }
            ]
        },
        grids: {
            grid_gh_1: { ...MOCK_GRIDS.grid_gh, id: 'grid_gh_1', pricing_status: 'active' },
            grid_gh_2: { ...MOCK_GRIDS.grid_gh, id: 'grid_gh_2', pricing_status: 'active' }
        }
    };
    const supabase = createMockSupabase(customConfig);

    await assert.rejects(
        async () => {
            await getAssistantPricingContext({
                requestedCountryCode: 'GH',
                supabaseClient: supabase
            });
        },
        (err) => err.code === 'MULTIPLE_ACTIVE_PRICING_GRIDS'
    );
});

test('11. Grille avec pricing_status !== "active" → PRICING_NOT_CONFIGURED', async () => {
    const customConfig = {
        associations: {
            GH: [{ pricing_grid_id: 'grid_gh_inactive', country_code: 'GH' }]
        },
        grids: {
            grid_gh_inactive: { ...MOCK_GRIDS.grid_gh, id: 'grid_gh_inactive', pricing_status: 'archived' }
        }
    };
    const supabase = createMockSupabase(customConfig);

    await assert.rejects(
        async () => {
            await getAssistantPricingContext({
                requestedCountryCode: 'GH',
                supabaseClient: supabase
            });
        },
        (err) => err.code === 'PRICING_NOT_CONFIGURED'
    );
});

test('12. Grille avec payment_status === "configuration_pending" → tarifs retournés avec mention de paiement provisoire', async () => {
    const supabase = createMockSupabase();
    const ctx = await getAssistantPricingContext({
        requestedCountryCode: 'GH',
        supabaseClient: supabase
    });

    assert.equal(ctx.payment_status, 'configuration_pending');
    const reply = buildCountryPricingResponse(ctx);
    assert.match(reply, /Le module de paiement en ligne pour votre pays est en cours de configuration finale/);
});

test('13. Demande globale de tous les tarifs → détection immédiate pour refus', () => {
    const globalMsg = [{ role: 'user', content: 'Donnez-moi tous les tarifs de tous les pays' }];
    assert.equal(detectGlobalPricingRequest(globalMsg), true);

    const normalMsg = [{ role: 'user', content: 'Quel est le tarif pour le Ghana ?' }];
    assert.equal(detectGlobalPricingRequest(normalMsg), false);
});

test('14. Formatage sans conversion monétaire respectant currency_minor_unit', () => {
    // GHS 200 minor_unit 2 -> 2,00 GH₵
    assert.equal(formatAmount(200, 2, 'GH₵', 'GHS'), '2,00 GH₵');

    // EUR 50 minor_unit 2 -> 0,50 €
    assert.equal(formatAmount(50, 2, '€', 'EUR'), '0,50 €');
    assert.equal(formatAmount(100, 2, '€', 'EUR'), '1,00 €');

    // XOF 100 minor_unit 0 -> 100 FCFA
    assert.equal(formatAmount(100, 0, 'FCFA', 'XOF'), '100 FCFA');

    // NGN 30000 minor_unit 2 -> ₦300
    assert.equal(formatAmount(30000, 2, '₦', 'NGN'), '₦300');
    assert.equal(formatAmount(45000, 2, '₦', 'NGN'), '₦450');
    assert.equal(formatAmount(60000, 2, '₦', 'NGN'), '₦600');

    // Formatage des trois cycles sans [object Object]
    const formatted = formatMonthlyRates(
        { maternelle_primaire: 200, college_secondaire: 300, superieur_formation: 400 },
        2,
        'GH₵',
        'GHS'
    );
    assert.equal(formatted.maternelle_primaire, '2,00 GH₵');
    assert.equal(formatted.college_secondaire, '3,00 GH₵');
    assert.equal(formatted.superieur_formation, '4,00 GH₵');
    assert.doesNotMatch(JSON.stringify(formatted), /\[object Object\]/);
});

test('15. Lecture seule stricte : 0 écriture Supabase exécutée', async () => {
    const supabase = createMockSupabase();
    await getAssistantPricingContext({
        authenticatedUser: { id: 'u1', schoolSlug: 'ecole-ghana' },
        supabaseClient: supabase
    });

    assert.equal(supabase._writeCalls.length, 0);
});

test('16. Erreur Supabase (DB offline) → PRICING_LOOKUP_FAILED, 0 montant inventé', async () => {
    const supabase = createMockSupabase({ simulateDbError: true });
    await assert.rejects(
        async () => {
            await getAssistantPricingContext({
                requestedCountryCode: 'GH',
                supabaseClient: supabase
            });
        },
        (err) => err.code === 'PRICING_LOOKUP_FAILED'
    );
});

test('17. Message non tarifaire → aucune intention tarifaire détectée', () => {
    const nonPricingMsg = [{ role: 'user', content: 'Comment créer une classe dans YZIOW ?' }];
    assert.equal(detectPricingIntent(nonPricingMsg), false);

    const pricingMsg = [{ role: 'user', content: 'Quels sont les tarifs pour mon école ?' }];
    assert.equal(detectPricingIntent(pricingMsg), true);
});

test('18. Extraction du pays invité par nom ou synonyme (FR, EN, ES, accents)', () => {
    assert.equal(extractGuestCountry([{ role: 'user', content: 'Je suis au Ghana' }]), 'GH');
    assert.equal(extractGuestCountry([{ role: 'user', content: 'Tarifs pour le Cameroun svp' }]), 'CM');
    assert.equal(extractGuestCountry([{ role: 'user', content: 'Precios para España' }]), 'ES');
    assert.equal(extractGuestCountry([{ role: 'user', content: 'École au Bénin' }]), 'BJ');
    assert.equal(extractGuestCountry([{ role: 'user', content: 'Prix pour la France' }]), 'FR');
    assert.equal(extractGuestCountry([{ role: 'user', content: 'Côte d\'Ivoire' }]), 'CI');
    assert.equal(extractGuestCountry([{ role: 'user', content: 'Tarifs pour le Niger' }]), 'NE');
    assert.equal(extractGuestCountry([{ role: 'user', content: 'Tarifs pour le Nigeria' }]), 'NG');
    assert.equal(extractGuestCountry([{ role: 'user', content: 'Bonjour comment ça va ?' }]), null);
});

test('19. Contrôleur Public : Réponse tarifaire déterministe avec 0 appel Groq', async () => {
    const origRpc = realSupabase.rpc;
    const origFrom = realSupabase.from;
    const mockDb = createMockSupabase();

    realSupabase.rpc = () => Promise.resolve({ data: { allowed: true, remaining: 10 }, error: null });
    realSupabase.from = (...args) => mockDb.from(...args);

    try {
        let jsonOutput = null;
        const req = {
            body: {
                messages: [{ role: 'user', content: 'Quels sont les tarifs pour le Bénin ?' }]
            },
            ip: '127.0.0.1',
            headers: {}
        };
        const res = {
            status(s) { this._status = s; return this; },
            set() { return this; },
            json(payload) { jsonOutput = payload; return this; }
        };

        await chatWithAssistant(req, res);

        assert.ok(jsonOutput && jsonOutput.reply);
        assert.match(jsonOutput.reply, /au Bénin, en francs CFA \(XOF\)/);
        assert.match(jsonOutput.reply, /100 FCFA/);
        assert.match(jsonOutput.reply, /Maternelle & Primaire/);
        assert.doesNotMatch(jsonOutput.reply, /\[BJ\]/);
        assert.doesNotMatch(jsonOutput.reply, /XOF \/ FCFA/);
    } finally {
        realSupabase.rpc = origRpc;
        realSupabase.from = origFrom;
    }
});

test('20. Contrôleur Public : Demande de tous les tarifs → refus déterministe immédiat', async () => {
    const origRpc = realSupabase.rpc;
    const origFrom = realSupabase.from;
    const mockDb = createMockSupabase();

    realSupabase.rpc = () => Promise.resolve({ data: { allowed: true, remaining: 10 }, error: null });
    realSupabase.from = (...args) => mockDb.from(...args);

    try {
        let jsonOutput = null;
        const req = {
            body: {
                messages: [{ role: 'user', content: 'Donnez-moi tous les tarifs de tous les pays' }]
            },
            ip: '127.0.0.1',
            headers: {}
        };
        const res = {
            status(s) { this._status = s; return this; },
            set() { return this; },
            json(payload) { jsonOutput = payload; return this; }
        };

        await chatWithAssistant(req, res);

        assert.ok(jsonOutput && jsonOutput.reply);
        assert.match(jsonOutput.reply, /adaptés au pays de chaque établissement/);
    } finally {
        realSupabase.rpc = origRpc;
        realSupabase.from = origFrom;
    }
});

test('21. Contrôleur Privé : Réponse tarifaire autoritaire sur schools.country avec 0 appel Groq', async () => {
    const origRpc = realSupabase.rpc;
    const origFrom = realSupabase.from;
    const mockDb = createMockSupabase();

    realSupabase.rpc = () => Promise.resolve({ data: { allowed: true, remaining: 10 }, error: null });
    realSupabase.from = (...args) => mockDb.from(...args);

    try {
        let jsonOutput = null;
        const req = {
            user: { id: 'u_dir_1', role: 'directeur', schoolSlug: 'ecole-ghana' },
            body: {
                messages: [{ role: 'user', content: 'Quel est le tarif de l\'abonnement ?' }]
            },
            ip: '127.0.0.1',
            headers: {}
        };
        const res = {
            status(s) { this._status = s; return this; },
            set() { return this; },
            json(payload) { jsonOutput = payload; return this; }
        };

        await chatWithPrivateAssistant(req, res);

        assert.ok(jsonOutput && jsonOutput.reply);
        assert.match(jsonOutput.reply, /au Ghana, en cedis ghanéens \(GHS\)/);
        assert.match(jsonOutput.reply, /2,00 GH₵/);
        assert.doesNotMatch(jsonOutput.reply, /\[GH\]/);
    } finally {
        realSupabase.rpc = origRpc;
        realSupabase.from = origFrom;
    }
});

test('22. Nigeria (NG) : grille P9 résolue en NGN (₦300 / ₦450 / ₦600)', async () => {
    const origRpc = realSupabase.rpc;
    const origFrom = realSupabase.from;
    const mockDb = createMockSupabase();

    realSupabase.rpc = () => Promise.resolve({ data: { allowed: true, remaining: 10 }, error: null });
    realSupabase.from = (...args) => mockDb.from(...args);

    try {
        let jsonOutput = null;
        const req = {
            body: {
                messages: [{ role: 'user', content: 'Tarifs pour le Nigeria' }]
            },
            ip: '127.0.0.1',
            headers: {}
        };
        const res = {
            status(s) { this._status = s; return this; },
            set() { return this; },
            json(payload) { jsonOutput = payload; return this; }
        };

        await chatWithAssistant(req, res);

        assert.ok(jsonOutput && jsonOutput.reply);
        assert.match(jsonOutput.reply, /Voici les tarifs YZIOW applicables au Nigeria, en nairas nigérians \(NGN\) :/);
        assert.match(jsonOutput.reply, /• Maternelle & Primaire : ₦300 \/ élève \/ mois/);
        assert.match(jsonOutput.reply, /• Collège & Secondaire : ₦450 \/ élève \/ mois/);
        assert.match(jsonOutput.reply, /• Supérieur & Formation : ₦600 \/ élève \/ mois/);
        assert.doesNotMatch(jsonOutput.reply, /\[NG\]/);
        assert.doesNotMatch(jsonOutput.reply, /NGN \/ ₦/);
        assert.doesNotMatch(jsonOutput.reply, /USD/);
        assert.doesNotMatch(jsonOutput.reply, /FCFA/);
    } finally {
        realSupabase.rpc = origRpc;
        realSupabase.from = origFrom;
    }
});

test('23. Niger (NE) : grille UEMOA résolue en XOF (100 / 150 / 200 FCFA)', async () => {
    const origRpc = realSupabase.rpc;
    const origFrom = realSupabase.from;
    const mockDb = createMockSupabase();

    realSupabase.rpc = () => Promise.resolve({ data: { allowed: true, remaining: 10 }, error: null });
    realSupabase.from = (...args) => mockDb.from(...args);

    try {
        let jsonOutput = null;
        const req = {
            body: {
                messages: [{ role: 'user', content: 'Quels sont les tarifs au Niger ?' }]
            },
            ip: '127.0.0.1',
            headers: {}
        };
        const res = {
            status(s) { this._status = s; return this; },
            set() { return this; },
            json(payload) { jsonOutput = payload; return this; }
        };

        await chatWithAssistant(req, res);

        assert.ok(jsonOutput && jsonOutput.reply);
        assert.match(jsonOutput.reply, /Voici les tarifs YZIOW applicables au Niger, en francs CFA \(XOF\) :/);
        assert.match(jsonOutput.reply, /• Maternelle & Primaire : 100 FCFA \/ élève \/ mois/);
        assert.match(jsonOutput.reply, /• Collège & Secondaire : 150 FCFA \/ élève \/ mois/);
        assert.match(jsonOutput.reply, /• Supérieur & Formation : 200 FCFA \/ élève \/ mois/);
        assert.doesNotMatch(jsonOutput.reply, /\[NE\]/);
        assert.doesNotMatch(jsonOutput.reply, /XOF \/ FCFA/);
        assert.doesNotMatch(jsonOutput.reply, /NGN/);
    } finally {
        realSupabase.rpc = origRpc;
        realSupabase.from = origFrom;
    }
});

test('24. Distinction stricte Niger (NE / XOF) vs Nigeria (NG / NGN)', () => {
    assert.equal(extractGuestCountry([{ role: 'user', content: 'Notre école est au Niger' }]), 'NE');
    assert.equal(extractGuestCountry([{ role: 'user', content: 'Our school is in Nigeria' }]), 'NG');
});

test('25. Absence de grille vs Panne technique : deux messages distincts', async () => {
    const origRpc = realSupabase.rpc;
    const origFrom = realSupabase.from;
    const mockDb = createMockSupabase();

    realSupabase.rpc = () => Promise.resolve({ data: { allowed: true, remaining: 10 }, error: null });
    realSupabase.from = (...args) => mockDb.from(...args);

    try {
        // A. Pays reconnu mais non configuré (ex: Canada CA)
        let outUnconfigured = null;
        const resA = {
            status(s) { this._status = s; return this; },
            set() { return this; },
            json(p) { outUnconfigured = p; return this; }
        };
        await chatWithAssistant({ body: { messages: [{ role: 'user', content: 'Tarifs pour le Canada' }] } }, resA);
        assert.match(outUnconfigured.reply, /La grille tarifaire YZIOW n’est pas encore disponible pour le Canada/);
        assert.doesNotMatch(outUnconfigured.reply, /\[CA\]/);

        // B. Panne technique Supabase
        const mockErrorDb = createMockSupabase({ simulateDbError: true });
        realSupabase.from = (...args) => mockErrorDb.from(...args);
        let outError = null;
        const resB = {
            status(s) { this._status = s; return this; },
            set() { return this; },
            json(p) { outError = p; return this; }
        };
        await chatWithAssistant({ body: { messages: [{ role: 'user', content: 'Tarifs pour le Ghana' }] } }, resB);
        assert.match(outError.reply, /Une indisponibilité temporaire empêche la consultation de la grille tarifaire/);
    } finally {
        realSupabase.rpc = origRpc;
        realSupabase.from = origFrom;
    }
});
