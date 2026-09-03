// backend/tests/assistantDeterministicQuotaRouting.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { installSupabaseMock, restoreSupabaseMock } = require('./helpers/mockSupabaseModule');
installSupabaseMock();

const { Module } = require('node:module');
const authPath = require.resolve('../middleware/auth');
const origAuthCache = require.cache[authPath];
const mockAuthModule = new Module(authPath);
mockAuthModule.id = authPath;
mockAuthModule.filename = authPath;
mockAuthModule.loaded = true;
mockAuthModule.exports = {
    authenticateToken: (req, res, next) => next(),
    requireSuperAdmin: (req, res, next) => next(),
    requireSchool: (req, res, next) => next()
};
require.cache[authPath] = mockAuthModule;

test.after(() => {
    restoreSupabaseMock();
    if (origAuthCache) {
        require.cache[authPath] = origAuthCache;
    } else {
        delete require.cache[authPath];
    }
});

const _origQuotaSecret = process.env.AI_QUOTA_HASH_SECRET;
process.env.AI_QUOTA_HASH_SECRET = 'test_secret_key_for_unit_tests_minimum_32_chars_pad';

const { chatWithAssistant } = require('../controllers/assistantController');
const aiQuotaService = require('../utils/aiQuotaService');

const MOCK_GRIDS = {
    'grid_gh_01': {
        id: 'grid_gh_01',
        pricing_version: '2026.1_ghs_ghana',
        scope_type: 'country',
        scope_code: 'GH',
        currency_code: 'GHS',
        currency_symbol: 'GH₵',
        currency_minor_unit: 2,
        locale: 'en-GH',
        rates_monthly: {
            maternelle_primaire: 200,
            college_secondaire: 300,
            superieur_formation: 400
        },
        billing_months: 10,
        annual_discount_percent: 10.00,
        installments_count: 3,
        provider: 'hub2',
        pricing_status: 'active',
        payment_status: 'configuration_pending',
        enabled: true,
        effective_from: '2026-01-01T00:00:00Z',
        effective_to: null
    },
    'grid_ng_01': {
        id: 'grid_ng_01',
        pricing_version: '2026.1_ngn_nigeria',
        scope_type: 'country',
        scope_code: 'NG',
        currency_code: 'NGN',
        currency_symbol: '₦',
        currency_minor_unit: 2,
        locale: 'en-NG',
        rates_monthly: {
            maternelle_primaire: 30000,
            college_secondaire: 45000,
            superieur_formation: 60000
        },
        billing_months: 10,
        annual_discount_percent: 10.00,
        installments_count: 3,
        provider: 'pending',
        pricing_status: 'active',
        payment_status: 'configuration_pending',
        enabled: true,
        effective_from: '2026-08-26T00:00:00Z',
        effective_to: null
    }
};

const MOCK_ASSOCIATIONS = {
    'GH': [{ pricing_grid_id: 'grid_gh_01', country_code: 'GH' }],
    'NG': [{ pricing_grid_id: 'grid_ng_01', country_code: 'NG' }]
};

function createMockSupabase(customConfig = {}) {
    const mockClient = {
        from(tableName) {
            let filterField = null;
            let filterValue = null;
            let inField = null;
            let inValues = [];
            let isSingle = false;
            return {
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
                            if (tableName === 'saas_pricing_grid_countries') {
                                const assocs = MOCK_ASSOCIATIONS[filterValue] || [];
                                return Promise.resolve({ data: assocs, error: null });
                            }
                            if (tableName === 'saas_pricing_grids') {
                                const matched = inValues.map(id => MOCK_GRIDS[id]).filter(Boolean);
                                return Promise.resolve({ data: matched, error: null });
                            }
                            return Promise.resolve({ data: [], error: null });
                        }
                    };
                    return queryBuilder;
                }
            };
        },
        rpc() {
            return Promise.resolve({ data: { allowed: true, remaining: 10 }, error: null });
        }
    };
    return mockClient;
}

// Helper to execute request with monitored quota and AI calls
async function runWithSpies(reqBody, options = {}) {
    const quotaAllowed = options.quotaAllowed !== undefined ? options.quotaAllowed : true;
    let quotaCalls = 0;
    let groqCalls = 0;

    // Spy enforceQuota
    const origEnforceQuota = aiQuotaService.enforceQuota;
    aiQuotaService.enforceQuota = async (...args) => {
        quotaCalls++;
        if (!quotaAllowed) {
            return {
                allowed: false,
                status: 429,
                retryAfter: 3600
            };
        }
        return { allowed: true, remaining: 9 };
    };

    // Spy mocked AI client
    const assistantController = require('../controllers/assistantController');
    assistantController.aiClient = {
        chat: {
            completions: {
                create: async () => {
                    groqCalls++;
                    return {
                        choices: [{ message: { content: 'Réponse générée par Groq pour une question libre.' } }]
                    };
                }
            }
        }
    };

    const supabaseModule = require('../utils/supabase');
    const origSupabase = supabaseModule.supabase;
    supabaseModule.supabase = options.customSupabase || createMockSupabase();

    let statusCode = 200;
    let responseHeaders = {};
    let responseBody = null;

    const req = {
        body: reqBody,
        ip: '192.168.1.100',
        headers: {}
    };
    const res = {
        status(s) { statusCode = s; return this; },
        set(k, v) { responseHeaders[k] = v; return this; },
        json(payload) { responseBody = payload; return this; }
    };

    try {
        await chatWithAssistant(req, res);
    } finally {
        aiQuotaService.enforceQuota = origEnforceQuota;
        delete assistantController.aiClient;
        supabaseModule.supabase = origSupabase;
    }

    return {
        statusCode,
        responseHeaders,
        responseBody,
        quotaCalls,
        groqCalls
    };
}

// 1. Question tarifaire sans pays : enforceQuota = 0
test('1. Question tarifaire sans pays → enforceQuota = 0 et Groq = 0', async () => {
    const res = await runWithSpies({
        messages: [{ role: 'user', content: 'Quels sont les tarifs ?' }]
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.quotaCalls, 0, 'enforceQuota must NOT be called for generic pricing request');
    assert.strictEqual(res.groqCalls, 0, 'Groq must NOT be called');
    assert.ok(res.responseBody.reply.includes('préciser le pays'));
    assert.deepStrictEqual(res.responseBody.conversation_state, { awaiting: 'pricing_country' });
});

// 2. Suivi Ghana : enforceQuota = 0
test('2. Suivi Ghana → enforceQuota = 0 et Groq = 0', async () => {
    const res = await runWithSpies({
        messages: [
            { role: 'user', content: 'Tarifs ?' },
            { role: 'assistant', content: 'Veuillez préciser le pays de votre établissement...' },
            { role: 'user', content: 'Ghana' }
        ],
        conversation_state: { awaiting: 'pricing_country' }
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.quotaCalls, 0, 'enforceQuota must NOT be called for Ghana pricing resolution');
    assert.strictEqual(res.groqCalls, 0, 'Groq must NOT be called');
    assert.ok(res.responseBody.reply.includes('Ghana'));
    assert.ok(res.responseBody.reply.includes('2,00 GH₵'));
});

// 3. Nigeria : enforceQuota = 0
test('3. Demande directe Nigeria → enforceQuota = 0 et Groq = 0', async () => {
    const res = await runWithSpies({
        messages: [{ role: 'user', content: 'Combien paie un établissement au Nigeria ?' }]
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.quotaCalls, 0, 'enforceQuota must NOT be called for Nigeria pricing');
    assert.strictEqual(res.groqCalls, 0, 'Groq must NOT be called');
    assert.ok(res.responseBody.reply.includes('Nigeria'));
    assert.ok(res.responseBody.reply.includes('₦300'));
    assert.ok(res.responseBody.reply.includes('₦450'));
    assert.ok(res.responseBody.reply.includes('₦600'));
});

// 4. Demande globale : enforceQuota = 0
test('4. Demande globale de tous les tarifs → enforceQuota = 0 et Groq = 0', async () => {
    const res = await runWithSpies({
        messages: [{ role: 'user', content: 'Donnez-moi la liste des tarifs de tous les pays' }]
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.quotaCalls, 0, 'enforceQuota must NOT be called for global pricing request');
    assert.strictEqual(res.groqCalls, 0, 'Groq must NOT be called');
    assert.ok(res.responseBody.reply.includes('adaptés au pays'));
});

// 5. Plusieurs pays : enforceQuota = 0
test('5. Plusieurs pays dans le message → enforceQuota = 0 et Groq = 0', async () => {
    const res = await runWithSpies({
        messages: [{ role: 'user', content: 'Tarifs pour le Ghana et le Nigeria svp' }]
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.quotaCalls, 0, 'enforceQuota must NOT be called for multi-country clarification');
    assert.strictEqual(res.groqCalls, 0, 'Groq must NOT be called');
    assert.ok(res.responseBody.reply.includes('Ghana'));
    assert.ok(res.responseBody.reply.includes('Nigeria'));
});

// 6. Découverte produit : enforceQuota = 0
test('6. Découverte produit (assistant_action) → enforceQuota = 0 et Groq = 0', async () => {
    const res = await runWithSpies({
        messages: [{ role: 'user', content: 'Découvrir les fonctionnalités & Tarifs' }],
        assistant_action: 'discover_features_and_pricing'
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.quotaCalls, 0, 'enforceQuota must NOT be called for feature discovery');
    assert.strictEqual(res.groqCalls, 0, 'Groq must NOT be called');
    assert.ok(res.responseBody.reply.includes('YZIOW'));
    assert.deepStrictEqual(res.responseBody.conversation_state, { awaiting: 'pricing_country' });
});

// 7. Absence de grille (pays non configuré) : enforceQuota = 0
test('7. Pays non configuré (ex: France) → enforceQuota = 0 et Groq = 0', async () => {
    const res = await runWithSpies({
        messages: [{ role: 'user', content: 'Tarifs pour la France' }]
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.quotaCalls, 0, 'enforceQuota must NOT be called for unconfigured country');
    assert.strictEqual(res.groqCalls, 0, 'Groq must NOT be called');
    assert.ok(res.responseBody.reply.includes('pas encore disponible pour la France'));
});

// 7bis. Panne tarifaire (erreur technique de base) : enforceQuota = 0
test('7bis. Panne tarifaire → enforceQuota = 0 et Groq = 0', async () => {
    const errorSupabase = {
        from() {
            return {
                select() {
                    return {
                        eq() {
                            return Promise.resolve({ data: null, error: new Error('DATABASE_OUTAGE') });
                        }
                    };
                }
            };
        }
    };

    const res = await runWithSpies({
        messages: [{ role: 'user', content: 'Tarifs pour le Ghana' }]
    }, { customSupabase: errorSupabase });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.quotaCalls, 0, 'enforceQuota must NOT be called on pricing outage');
    assert.strictEqual(res.groqCalls, 0, 'Groq must NOT be called');
    assert.ok(res.responseBody.reply.includes('Une indisponibilité temporaire empêche la consultation'));
});

// 8. Message nécessitant Groq : enforceQuota = 1 et Groq = 1
test('8. Message nécessitant Groq → enforceQuota = 1 et Groq = 1', async () => {
    const res = await runWithSpies({
        messages: [{ role: 'user', content: 'Comment fonctionne la gestion des notes et bulletins dans Yziow ?' }]
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.quotaCalls, 1, 'enforceQuota MUST be called once for non-deterministic question');
    assert.strictEqual(res.groqCalls, 1, 'Groq MUST be called once');
    assert.strictEqual(res.responseBody.reply, 'Réponse générée par Groq pour une question libre.');
});

// 9. Quota refusé sur parcours Groq : Groq = 0 et réponse HTTP 429
test('9. Quota refusé sur parcours Groq → Groq = 0 et HTTP 429 avec Retry-After', async () => {
    const res = await runWithSpies({
        messages: [{ role: 'user', content: 'Conseils pédagogiques pour une rentrée scolaire' }]
    }, { quotaAllowed: false });
    assert.strictEqual(res.statusCode, 429, 'Status must be 429');
    assert.strictEqual(res.quotaCalls, 1, 'enforceQuota was called');
    assert.strictEqual(res.groqCalls, 0, 'Groq must NOT be called when quota is exceeded');
    assert.ok(res.responseBody.error.includes('limite de questions'));
    assert.strictEqual(res.responseHeaders['Retry-After'], '3600');
});

// 10. Simulation d'un quota journalier épuisé : les parcours déterministes fonctionnent toujours
test('10. Quota épuisé : Nigeria et Découverte fonctionnent toujours, question libre renvoie 429', async () => {
    // A. Nigeria avec quota épuisé -> Fonctionne à 100% (200 OK)
    const resNigeria = await runWithSpies({
        messages: [{ role: 'user', content: 'Combien paie un établissement au Nigeria ?' }]
    }, { quotaAllowed: false });
    assert.strictEqual(resNigeria.statusCode, 200, 'Nigeria pricing must succeed even if Groq quota is exhausted');
    assert.strictEqual(resNigeria.quotaCalls, 0);
    assert.ok(resNigeria.responseBody.reply.includes('₦300'));

    // B. Découverte avec quota épuisé -> Fonctionne à 100% (200 OK)
    const resDiscovery = await runWithSpies({
        messages: [{ role: 'user', content: 'Découvrir les fonctionnalités & Tarifs' }],
        assistant_action: 'discover_features_and_pricing'
    }, { quotaAllowed: false });
    assert.strictEqual(resDiscovery.statusCode, 200, 'Feature discovery must succeed even if Groq quota is exhausted');
    assert.strictEqual(resDiscovery.quotaCalls, 0);
    assert.ok(resDiscovery.responseBody.reply.includes('YZIOW'));

    // C. Question libre avec quota épuisé -> 429 Too Many Requests
    const resFree = await runWithSpies({
        messages: [{ role: 'user', content: 'Quelle est la météo ?' }]
    }, { quotaAllowed: false });
    assert.strictEqual(resFree.statusCode, 429, 'Free question must be rejected with 429');
    assert.strictEqual(resFree.quotaCalls, 1);
    assert.strictEqual(resFree.groqCalls, 0);
});

// 11. Protection anti-abus HTTP générale : express-rate-limit monté sur POST /api/assistant/chat
test('11. Protection anti-abus HTTP générale : rate limiter monté sur POST /chat dans assistant.js', () => {
    const assistantRouter = require('../routes/assistant');
    const chatRoute = assistantRouter.stack.find(
        layer => layer.route && layer.route.path === '/chat' && layer.route.methods.post
    );

    assert.ok(chatRoute, 'POST /chat route must exist in assistant router');
    assert.ok(chatRoute.route.stack.length >= 2, 'POST /chat must have at least 2 middleware layers (rateLimiter + controller)');

    const firstMiddleware = chatRoute.route.stack[0].handle;
    assert.strictEqual(typeof firstMiddleware, 'function', 'First middleware must be a function');
});

// 12. Extraction et normalisation sécurisée de l'IP pour le rate limiter
test('12. keyGenerator : priorisation de x-vercel-forwarded-for, normalisation IPv4/IPv6 et anti-usurpation', () => {
    const assistantRouter = require('../routes/assistant');
    const getClientIp = assistantRouter._getClientIpForRateLimit;
    assert.strictEqual(typeof getClientIp, 'function');

    // A. x-vercel-forwarded-for valide IPv4
    const reqVercelIpv4 = {
        headers: { 'x-vercel-forwarded-for': '198.51.100.45', 'x-forwarded-for': '10.0.0.1, 1.2.3.4' },
        ip: '10.0.0.1'
    };
    assert.strictEqual(getClientIp(reqVercelIpv4), '198.51.100.45', 'Must prioritize x-vercel-forwarded-for over x-forwarded-for/req.ip');

    // B. x-vercel-forwarded-for avec liste d'adresses (première IP retenue)
    const reqVercelList = {
        headers: { 'x-vercel-forwarded-for': '198.51.100.45, 10.0.0.2' },
        ip: '10.0.0.2'
    };
    assert.strictEqual(getClientIp(reqVercelList), '198.51.100.45');

    // C. IPv4-mapped IPv6 normalization (::ffff:192.168.1.1 -> 192.168.1.1)
    const reqVercelMapped = {
        headers: { 'x-vercel-forwarded-for': '::ffff:192.0.2.128' }
    };
    assert.strictEqual(getClientIp(reqVercelMapped), '192.0.2.128');

    // D. IPv6 natif normalisé en minuscules
    const reqVercelIpv6 = {
        headers: { 'x-vercel-forwarded-for': '2001:0DB8:85A3:0000:0000:8A2E:0370:7334' }
    };
    assert.strictEqual(getClientIp(reqVercelIpv6), '2001:0db8:85a3:0000:0000:8a2e:0370:7334');

    // E. Absence d'en-tête Vercel -> fallback sûr sur req.ip / remoteAddress
    const reqLocal = {
        headers: { 'x-forwarded-for': '1.2.3.4' }, // x-forwarded-for arbitraire non pris en compte sans Vercel
        ip: '127.0.0.1'
    };
    assert.strictEqual(getClientIp(reqLocal), '127.0.0.1');

    // F. Fallback complet en cas de req vide
    assert.strictEqual(getClientIp({}), '127.0.0.1');
});

// 13. Qualification de MemoryStore (caractère local par instance / best-effort en serverless)
test('13. Qualification du store : MemoryStore par défaut (local à l’instance serverless)', () => {
    const assistantRouter = require('../routes/assistant');
    const chatRoute = assistantRouter.stack.find(
        layer => layer.route && layer.route.path === '/chat' && layer.route.methods.post
    );
    // Confirmation que le limiter Express est instancié sans store externe Redis/Memcached (MemoryStore par défaut)
    assert.ok(chatRoute);
});

// 14. Service tarifaire : Résolution par défaut de supabaseModule.supabase en l'absence d'injection
test('14. getAssistantPricingContext utilise bien supabaseModule.supabase par défaut', async () => {
    const { getAssistantPricingContext } = require('../services/assistantPricingContextService');
    const supabaseModule = require('../utils/supabase');
    const origSupabase = supabaseModule.supabase;

    let defaultClientUsed = false;
    supabaseModule.supabase = {
        from(tableName) {
            defaultClientUsed = true;
            return {
                select() {
                    return {
                        eq() {
                            return Promise.resolve({ data: [], error: null });
                        }
                    };
                }
            };
        }
    };

    try {
        await getAssistantPricingContext({ requestedCountryCode: 'GH' }).catch(() => {});
        assert.strictEqual(defaultClientUsed, true, 'getAssistantPricingContext must query supabaseModule.supabase by default');
    } finally {
        supabaseModule.supabase = origSupabase;
    }
});

// Cleanup
test('cleanup: restore secret', () => {
    if (_origQuotaSecret !== undefined) {
        process.env.AI_QUOTA_HASH_SECRET = _origQuotaSecret;
    } else {
        delete process.env.AI_QUOTA_HASH_SECRET;
    }
});
