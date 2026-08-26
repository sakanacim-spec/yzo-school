// backend/tests/assistantPricingConversation.test.js
'use strict';

// Save original secret and set a 48-char test-only value (restored by final cleanup test)
const _origQuotaSecret = process.env.AI_QUOTA_HASH_SECRET;
process.env.AI_QUOTA_HASH_SECRET = 'test_secret_key_for_unit_tests_minimum_32_chars_pad';

const test = require('node:test');
const assert = require('node:assert/strict');

const { chatWithAssistant, chatWithPrivateAssistant } = require('../controllers/assistantController');

// Reuse mock supabase logic from existing test file
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
                upsert() {
                    writeCalls.push({ action: 'upsert', table: tableName });
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

const MOCK_SCHOOLS = {
    'ecole-ghana': { id: 'sch_gh', slug: 'ecole-ghana', country: 'GH' },
    'ecole-espagne': { id: 'sch_es', slug: 'ecole-espagne', country: 'ES' },
    'ecole-benin': { id: 'sch_bj', slug: 'ecole-benin', country: 'BJ' }
};

const MOCK_ASSOCIATIONS = {
    GH: [{ pricing_grid_id: 'grid_gh', country_code: 'GH' }],
    ES: [{ pricing_grid_id: 'grid_es', country_code: 'ES' }],
    BJ: [{ pricing_grid_id: 'grid_bj', country_code: 'BJ' }]
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
    grid_bj: {
        id: 'grid_bj',
        pricing_version: '2026.1_xof_benin',
        scope_type: 'country',
        scope_code: 'BJ',
        currency_code: 'XOF',
        currency_symbol: 'FCFA',
        currency_minor_unit: 0,
        rates_monthly: { maternelle_primaire: 5000, college_secondaire: 7500, superieur_formation: 10000 },
        billing_months: 10,
        annual_discount_percent: 10,
        installments_count: 3,
        pricing_status: 'active',
        payment_status: 'configuration_pending',
        enabled: true
    }
};

// Helper to mock quota enforcement (always allowed)
function mockQuota() {
    const supabase = require('../utils/supabase').supabase;
    const origRpc = supabase.rpc;
    supabase.rpc = () => Promise.resolve({ data: { allowed: true, remaining: 10 }, error: null });
    return () => { supabase.rpc = origRpc; };
}

// Helper to run a request against the public controller
async function runPublic(reqBody) {
    const restoreQuota = mockQuota();
    const mockDb = createMockSupabase();
    const supabase = require('../utils/supabase').supabase;
    const origFrom = supabase.from;
    supabase.from = (...args) => mockDb.from(...args);
    try {
        let jsonOutput = null;
        const req = { body: reqBody };
        const res = { status(s){ this._status = s; return this; }, set(){ return this; }, json(p){ jsonOutput = p; return this; } };
        await chatWithAssistant(req, res);
        return jsonOutput;
    } finally {
        supabase.from = origFrom;
        restoreQuota();
    }
}

// 1. Pricing question without country -> ask for country
test('1. Pricing question without country triggers country request', async () => {
    const out = await runPublic({ messages: [{ role: 'user', content: 'Quels sont les tarifs ?' }] });
    assert.ok(out.reply);
    assert.match(out.reply, /préciser le pays/);
    assert.deepStrictEqual(out.conversation_state, { awaiting: 'pricing_country' });
});

// 2. Follow‑up with "Ghana" returns pricing, clears state
test('2. Follow‑up with Ghana returns pricing and clears state', async () => {
    // first trigger awaiting
    await runPublic({ messages: [{ role: 'user', content: 'Tarifs ?' }] });
    const out = await runPublic({ messages: [
        { role: 'user', content: 'Tarifs ?' },
        { role: 'assistant', content: 'Veuillez préciser le pays.' },
        { role: 'user', content: 'Ghana' }
    ] });
    assert.ok(out.reply.includes('GH'));
    assert.deepStrictEqual(out.conversation_state, null);
});

// 3. "Mon établissement est au Ghana" resolves directly
test('3. "Mon établissement est au Ghana" resolves pricing', async () => {
    const out = await runPublic({ messages: [{ role: 'user', content: 'Mon établissement se trouve au Ghana' }] });
    assert.ok(out.reply.includes('GH'));
    assert.deepStrictEqual(out.conversation_state, null);
});

// 4. Ghana then Spain – only Spain retained
test('4. Ghana then Spain – only Spain retained', async () => {
    const out = await runPublic({ messages: [
        { role: 'user', content: 'Quel est le tarif ?' },
        { role: 'assistant', content: 'Pays ?' },
        { role: 'user', content: 'Ghana' },
        { role: 'assistant', content: 'Voici les tarifs GH' },
        { role: 'user', content: "Et pour l'Espagne ?" }
    ] });
    assert.ok(out.reply.includes('ES'));
    assert.ok(!out.reply.includes('GH'));
    assert.deepStrictEqual(out.conversation_state, null);
});

// 5. Spain then Ghana – only Ghana retained
test('5. Spain then Ghana – only Ghana retained', async () => {
    const out = await runPublic({ messages: [
        { role: 'user', content: 'Tarifs ?' },
        { role: 'assistant', content: 'Pays ?' },
        { role: 'user', content: 'Espagne' },
        { role: 'assistant', content: 'Voici les tarifs ES' },
        { role: 'user', content: 'Mon établissement est au Ghana' }
    ] });
    assert.ok(out.reply.includes('GH'));
    assert.ok(!out.reply.includes('ES'));
    assert.deepStrictEqual(out.conversation_state, null);
});

// 6. Multiple countries in last message triggers clarification
test('6. Multiple countries in last message triggers clarification', async () => {
    const out = await runPublic({ messages: [{ role: 'user', content: 'Je travaille au Ghana et en Espagne' }] });
    assert.match(out.reply, /Quel pays souhaitez‑vous recevoir/);
    assert.deepStrictEqual(out.conversation_state, { awaiting: 'pricing_country' });
});

// 7. Global pricing request is refused deterministically
test('7. Global pricing request is refused deterministically', async () => {
    const out = await runPublic({ messages: [{ role: 'user', content: 'Donnez‑moi tous les tarifs' }] });
    assert.ok(out.reply.includes('adaptés au pays de chaque établissement'));
    assert.deepStrictEqual(out.conversation_state, null);
});

// 8. Authenticated private request returns pricing directly
test('8. Authenticated private request returns pricing directly', async () => {
    const restoreQuota = mockQuota();
    const mockDb = createMockSupabase();
    const supabase = require('../utils/supabase').supabase;
    const origFrom = supabase.from;
    supabase.from = (...args) => mockDb.from(...args);
    try {
        let jsonOutput = null;
        const req = { user: { id: 'u1', role: 'directeur', schoolSlug: 'ecole-ghana' }, body: { messages: [{ role: 'user', content: 'Quel est le tarif ?' }] } };
        const res = { status(s){ this._status = s; return this; }, set(){ return this; }, json(p){ jsonOutput = p; return this; } };
        await chatWithPrivateAssistant(req, res);
        assert.ok(jsonOutput.reply.includes('GH'));
        assert.deepStrictEqual(jsonOutput.conversation_state, null);
    } finally { supabase.from = origFrom; restoreQuota(); }
});

// 9. Conversation state cleared after successful pricing response
test('9. Conversation state cleared after pricing response', async () => {
    const out = await runPublic({ messages: [
        { role: 'user', content: 'Tarifs ?' },
        { role: 'assistant', content: 'Pays ?' },
        { role: 'user', content: 'Ghana' }
    ] });
    assert.deepStrictEqual(out.conversation_state, null);
});

// 10. Malformed or unallowed conversation_state is strictly ignored
test('10. Malformed or unallowed conversation_state ignored (ex: { awaiting: "other_state" })', async () => {
    // 10a: Unallowed awaiting state with non-pricing message does not trigger country awaiting
    const restoreQuota = mockQuota();
    const mockDb = createMockSupabase();
    const supabase = require('../utils/supabase').supabase;
    const origFrom = supabase.from;
    const origRpc = supabase.rpc;
    supabase.from = (...args) => mockDb.from(...args);
    supabase.rpc = () => Promise.resolve({ data: { allowed: true, remaining: 10 }, error: null });
    const controller = require('../controllers/assistantController');
    const origAiClient = controller.aiClient;
    controller.aiClient = { chat: { completions: { create: async () => ({ choices: [{ message: { content: 'Réponse IA normale' } }] }) } } };
    try {
        let jsonOutput = null;
        const req = {
            body: {
                messages: [{ role: 'user', content: 'Comment fonctionne la messagerie ?' }],
                conversation_state: { awaiting: 'other_state' }
            }
        };
        const res = { status(s){ this._status = s; return this; }, set(){ return this; }, json(p){ jsonOutput = p; return this; } };
        await controller.chatWithAssistant(req, res);
        assert.ok(jsonOutput.reply.includes('Réponse IA normale'));
        assert.deepStrictEqual(jsonOutput.conversation_state, undefined);
    } finally {
        supabase.from = origFrom;
        supabase.rpc = origRpc;
        controller.aiClient = origAiClient;
        restoreQuota();
    }

    // 10b: Unallowed awaiting state with country-only pricing resolves country deterministically without awaiting
    const outCountry = await runPublic({
        messages: [{ role: 'user', content: 'Tarifs pour le Ghana' }],
        conversation_state: { awaiting: 'unknown' }
    });
    assert.ok(outCountry.reply.includes('GH'));
    assert.deepStrictEqual(outCountry.conversation_state, null);
});

// 11. Feature discovery intent returns product presentation and sets awaiting state
test('11. Feature discovery intent returns product presentation and sets awaiting state', async () => {
    const out = await runPublic({ messages: [{ role: 'user', content: 'Découvrir les fonctionnalités & Tarifs' }] });
    assert.ok(out.reply.includes('YZIOW'));
    assert.deepStrictEqual(out.conversation_state, { awaiting: 'pricing_country' });
});

// 12. Active session: after feature discovery, conversation_state: { awaiting: 'pricing_country' } + country yields pricing
test('12. Active session: awaiting pricing_country + country yields pricing and resets state to null', async () => {
    const out = await runPublic({
        messages: [
            { role: 'user', content: 'Découvrir les fonctionnalités & Tarifs' },
            { role: 'assistant', content: 'Dans quel pays se trouve votre établissement ?' },
            { role: 'user', content: 'Ghana' }
        ],
        conversation_state: { awaiting: 'pricing_country' }
    });
    assert.ok(out.reply.includes('GH'));
    assert.ok(out.reply.includes('GHS'));
    assert.deepStrictEqual(out.conversation_state, null);
});

// 13. Non‑pricing message triggers Groq path (simulated)
test('13. Non‑pricing message triggers Groq path (simulated)', async () => {
    const restoreQuota = mockQuota();
    const mockDb = createMockSupabase();
    const supabase = require('../utils/supabase').supabase;
    const origFrom = supabase.from;
    const origRpc = supabase.rpc;
    supabase.from = (...args) => mockDb.from(...args);
    supabase.rpc = () => Promise.resolve({ data: { allowed: true, remaining: 10 }, error: null });
    // Stub Groq client
    const controller = require('../controllers/assistantController');
    const origAiClient = controller.aiClient;
    controller.aiClient = { chat: { completions: { create: async () => ({ choices: [{ message: { content: 'Réponse IA fictive' } }] }) } } };
    try {
        let jsonOutput = null;
        const req = { body: { messages: [{ role: 'user', content: 'Comment créer une classe ?' }] } };
        const res = { status(s){ this._status = s; return this; }, set(){ return this; }, json(p){ jsonOutput = p; return this; } };
        await controller.chatWithAssistant(req, res);
        assert.ok(jsonOutput.reply.includes('Réponse IA fictive'));
    } finally {
        supabase.from = origFrom;
        supabase.rpc = origRpc;
        controller.aiClient = origAiClient;
        restoreQuota();
    }
});

// ════════════════════════════════════════════════════════════════════════════════
// Requirements 14–22, ambiguity scenarios, and cleanup
// ════════════════════════════════════════════════════════════════════════════════

// 14. Historique Ghana, dernier message Espagne → Espagne/EUR uniquement, zéro contenu Ghana/GHS
test('14. Historique Ghana → dernier message Espagne : EUR uniquement, zéro GHS', async () => {
    const out = await runPublic({ messages: [
        { role: 'user', content: 'Tarifs pour le Ghana ?' },
        { role: 'assistant', content: 'Voici la grille tarifaire GH...' },
        { role: 'user', content: "Et pour l'Espagne ?" }
    ] });
    // Only Spain/EUR must appear
    assert.ok(out.reply.includes('[ES]'), 'reply must contain [ES]');
    assert.ok(out.reply.includes('EUR'), 'reply must contain EUR');
    assert.ok(out.reply.includes('€'), 'reply must contain €');
    // No Ghana content at all
    assert.ok(!out.reply.includes('[GH]'), 'reply must NOT contain [GH]');
    assert.ok(!out.reply.includes('GHS'), 'reply must NOT contain GHS');
    assert.ok(!out.reply.includes('GH₵'), 'reply must NOT contain GH₵');
    assert.deepStrictEqual(out.conversation_state, null);
});

// 15. Utilisateur authentifié Bénin demandant Espagne → BJ/XOF/FCFA uniquement, zéro ES/EUR
test('15. Authentifié BJ demandant Espagne → grille UEMOA/XOF, zéro EUR', async () => {
    const restoreQuota = mockQuota();
    const mockDb = createMockSupabase();
    const supabase = require('../utils/supabase').supabase;
    const origFrom = supabase.from;
    supabase.from = (...args) => mockDb.from(...args);
    try {
        let jsonOutput = null;
        const req = {
            user: { id: 'u_bj', role: 'directeur', schoolSlug: 'ecole-benin' },
            body: { messages: [{ role: 'user', content: "Tarifs pour l'Espagne ?" }] }
        };
        const res = { status(s){ this._status = s; return this; }, set(){ return this; }, json(p){ jsonOutput = p; return this; } };
        await chatWithPrivateAssistant(req, res);
        // School country BJ is authoritative
        assert.ok(jsonOutput.reply.includes('[BJ]'), 'must contain [BJ]');
        assert.ok(jsonOutput.reply.includes('XOF'), 'must contain XOF');
        assert.ok(jsonOutput.reply.includes('FCFA'), 'must contain FCFA');
        // No Spain/EUR
        assert.ok(!jsonOutput.reply.includes('[ES]'), 'must NOT contain [ES]');
        assert.ok(!jsonOutput.reply.includes('EUR'), 'must NOT contain EUR');
        assert.ok(!jsonOutput.reply.includes('€'), 'must NOT contain €');
        assert.deepStrictEqual(jsonOutput.conversation_state, null);
    } finally { supabase.from = origFrom; restoreQuota(); }
});

// 16. Absence de persistance et de reconstruction indirecte de conversation_state
// L'historique des messages peut être conservé, mais conversation_state n'est ni stocké ni reconstruit à partir de cet historique.
test('16. Exigence 16 complète : conversation_state non persisté ni reconstruit depuis l\'historique', async () => {
    // 16A. Nouvelle session simulée (après rechargement) :
    // Historique conservé contenant une demande de pays de l'assistant, aucun conversation_state envoyé,
    // nouvelle question utilisateur sans rapport ("Comment créer une classe ?")
    // Attendu : aucun awaiting: "pricing_country" reconstruit, appel normal vers le LLM
    const restoreQuota = mockQuota();
    const mockDb = createMockSupabase();
    const supabase = require('../utils/supabase').supabase;
    const origFrom = supabase.from;
    const origRpc = supabase.rpc;
    supabase.from = (...args) => mockDb.from(...args);
    supabase.rpc = () => Promise.resolve({ data: { allowed: true, remaining: 10 }, error: null });
    const controller = require('../controllers/assistantController');
    const origAiClient = controller.aiClient;
    let groqInvoked = false;
    controller.aiClient = {
        chat: {
            completions: {
                create: async () => {
                    groqInvoked = true;
                    return { choices: [{ message: { content: 'Pour créer une classe, allez dans le menu Structure.' } }] };
                }
            }
        }
    };
    try {
        let jsonOutput = null;
        const simulatedReloadReq = {
            body: {
                messages: [
                    { role: 'user', content: 'Quels sont les tarifs ?' },
                    { role: 'assistant', content: 'Veuillez préciser le pays de votre établissement pour obtenir les tarifs.' },
                    { role: 'user', content: 'Comment créer une classe ?' }
                ],
                // Après rechargement de page, conversation_state est null (non conservé)
                conversation_state: null
            }
        };
        const res = { status(s){ this._status = s; return this; }, set(){ return this; }, json(p){ jsonOutput = p; return this; } };
        await controller.chatWithAssistant(simulatedReloadReq, res);

        assert.ok(groqInvoked, 'LLM must be invoked for non-pricing question after page reload without state');
        assert.ok(jsonOutput.reply.includes('Pour créer une classe'), 'Response must answer the actual question, not re-prompt for country');
        assert.deepStrictEqual(jsonOutput.conversation_state, undefined, 'No conversation_state should be returned for general inquiries');
    } finally {
        supabase.from = origFrom;
        supabase.rpc = origRpc;
        controller.aiClient = origAiClient;
        restoreQuota();
    }

    // 16B. État non autorisé : conversation_state = { awaiting: "other_state" }
    // Attendu : état ignoré, aucun comportement tarifaire déclenché
    const outUnauthorized = await runPublic({
        messages: [{ role: 'user', content: 'Parlez-moi de votre équipe' }],
        conversation_state: { awaiting: 'other_state' }
    });
    assert.deepStrictEqual(outUnauthorized.conversation_state, undefined);

    // 16C. Session active : conversation_state = { awaiting: "pricing_country" } puis message "Ghana"
    // Attendu : grille Ghana et état remis à null
    const outActive = await runPublic({
        messages: [
            { role: 'user', content: 'Quels sont les tarifs ?' },
            { role: 'assistant', content: 'Veuillez préciser le pays de votre établissement pour obtenir les tarifs.' },
            { role: 'user', content: 'Ghana' }
        ],
        conversation_state: { awaiting: 'pricing_country' }
    });
    assert.ok(outActive.reply.includes('[GH]'), 'Must return Ghana grid in active session');
    assert.ok(outActive.reply.includes('GHS'), 'Must contain GHS');
    assert.deepStrictEqual(outActive.conversation_state, null, 'Must clear state to null');

    // 16D. Vérification code source frontend (GuideAssistantWidget.tsx et assistantChatService.ts) :
    // - conversation_state est stocké uniquement dans useState
    // - il n'est jamais transmis à saveStoredAssistantHistory
    // - le chargement de l'historique ne reconstruit jamais conversationState
    const fs = require('fs');
    const path = require('path');
    const widgetPath = path.resolve(__dirname, '../../src/components/GuideAssistantWidget.tsx');
    const widgetSrc = fs.readFileSync(widgetPath, 'utf-8');
    assert.ok(widgetSrc.includes('useState'), 'widget must use React useState');
    // Ensure conversationState is held in React state and initialized to null
    assert.ok(widgetSrc.includes('const [conversationState, setConversationState] = useState<{ awaiting?: string } | null>(null);'),
        'conversationState must be initialized to null in useState');
    // Search for any persistence of conversationState in storage
    const lines = widgetSrc.split('\n');
    for (const line of lines) {
        const lower = line.toLowerCase();
        if (lower.includes('conversationstate') || lower.includes('conversation_state')) {
            assert.ok(
                !lower.includes('localstorage') && !lower.includes('sessionstorage') && !lower.includes('document.cookie'),
                `conversation_state must not be persisted in storage: ${line.trim()}`
            );
        }
    }
    // Verify assistantChatService only persists message items (id, sender, text)
    const servicePath = path.resolve(__dirname, '../../src/services/assistantChatService.ts');
    const serviceSrc = fs.readFileSync(servicePath, 'utf-8');
    assert.ok(!serviceSrc.includes('conversation_state'), 'assistantChatService must not store or handle conversation_state');
    assert.ok(!serviceSrc.includes('conversationState'), 'assistantChatService must not store or handle conversationState');
});

// 17. Zéro écriture métier Supabase sur tous les parcours tarifaires
// Seul RPC invoqué : consume_assistant_quota (mécanisme transversal de rate limiting et comptage de quota P3)
// Interdit : tout insert, update, upsert, delete direct sur les tables métier ou tout RPC métier d'écriture
test('17. Zéro écriture métier Supabase (zéro insert/update/upsert/delete métier, seul RPC: consume_assistant_quota)', async () => {
    const mockDb = createMockSupabase();
    const supabase = require('../utils/supabase').supabase;
    const origFrom = supabase.from;
    const origRpc = supabase.rpc;
    supabase.from = (...args) => mockDb.from(...args);
    const rpcCalls = [];
    // RPC mock: track all calls, verify that only the transversal quota RPC is invoked
    supabase.rpc = (fnName, ...rest) => {
        rpcCalls.push({ fn: fnName });
        return Promise.resolve({ data: { allowed: true, remaining: 10 }, error: null });
    };
    const makeRes = () => {
        let out = null;
        return {
            obj: { status(s){ this._status = s; return this; }, set(){ return this; }, json(p){ out = p; return this; } },
            get result() { return out; }
        };
    };
    try {
        // Scenario A: tarif sans pays
        const rA = makeRes();
        await chatWithAssistant({ body: { messages: [{ role: 'user', content: 'Tarifs ?' }] } }, rA.obj);
        // Scenario B: suivi avec pays
        const rB = makeRes();
        await chatWithAssistant({ body: { messages: [{ role: 'user', content: 'Tarifs au Ghana' }] } }, rB.obj);
        // Scenario C: demande globale
        const rC = makeRes();
        await chatWithAssistant({ body: { messages: [{ role: 'user', content: 'Tous les tarifs' }] } }, rC.obj);
        // Scenario D: plusieurs pays
        const rD = makeRes();
        await chatWithAssistant({ body: { messages: [{ role: 'user', content: 'Ghana et Espagne' }] } }, rD.obj);
        // Scenario E: assistant_action découverte
        const rE = makeRes();
        await chatWithAssistant({ body: { messages: [{ role: 'user', content: 'Bonjour' }], assistant_action: 'discover_features_and_pricing' } }, rE.obj);

        // Verify zero business writes on any database table
        const writes = mockDb._writeCalls;
        assert.strictEqual(writes.filter(w => w.action === 'insert').length, 0, 'zero business insert');
        assert.strictEqual(writes.filter(w => w.action === 'update').length, 0, 'zero business update');
        assert.strictEqual(writes.filter(w => w.action === 'upsert').length, 0, 'zero business upsert');
        assert.strictEqual(writes.filter(w => w.action === 'delete').length, 0, 'zero business delete');
        // All RPC calls must be exclusively consume_assistant_quota (transversal quota control)
        for (const call of rpcCalls) {
            assert.strictEqual(call.fn, 'consume_assistant_quota',
                `Only consume_assistant_quota RPC allowed, got: ${call.fn}`);
        }
    } finally {
        supabase.from = origFrom;
        supabase.rpc = origRpc;
    }
});

// 18. Zéro appel Groq/LLM sur les parcours déterministes
test('18. Zéro appel Groq/LLM sur 6 parcours déterministes', async () => {
    const restoreQuota = mockQuota();
    const mockDb = createMockSupabase();
    const supabase = require('../utils/supabase').supabase;
    const origFrom = supabase.from;
    supabase.from = (...args) => mockDb.from(...args);
    const controller = require('../controllers/assistantController');
    const origAiClient = controller.aiClient;
    let groqCallCount = 0;
    controller.aiClient = { chat: { completions: { create: async () => { groqCallCount++; return { choices: [{ message: { content: 'SHOULD_NOT_APPEAR' } }] }; } } } };
    const makeRes = () => {
        let out = null;
        return {
            obj: { status(s){ this._status = s; return this; }, set(){ return this; }, json(p){ out = p; return this; } },
            get result() { return out; }
        };
    };
    try {
        // a) tarif sans pays
        const ra = makeRes(); await chatWithAssistant({ body: { messages: [{ role: 'user', content: 'Tarifs ?' }] } }, ra.obj);
        // b) suivi avec pays
        const rb = makeRes(); await chatWithAssistant({ body: { messages: [{ role: 'user', content: 'Tarifs Ghana' }] } }, rb.obj);
        // c) demande globale
        const rc = makeRes(); await chatWithAssistant({ body: { messages: [{ role: 'user', content: 'Tous les tarifs' }] } }, rc.obj);
        // d) plusieurs pays
        const rd = makeRes(); await chatWithAssistant({ body: { messages: [{ role: 'user', content: 'Ghana et Espagne' }] } }, rd.obj);
        // e) erreur de récupération tarifaire (pays non configuré → handled gracefully)
        const re = makeRes(); await chatWithAssistant({ body: { messages: [{ role: 'user', content: 'Tarifs en Russie' }] } }, re.obj);
        // f) assistant_action de découverte
        const rf = makeRes(); await chatWithAssistant({ body: { messages: [{ role: 'user', content: 'Bonjour' }], assistant_action: 'discover_features_and_pricing' } }, rf.obj);

        assert.strictEqual(groqCallCount, 0, `Groq/LLM must not be called, was called ${groqCallCount} times`);
        // Verify none of the replies contain the mock LLM response
        for (const r of [ra, rb, rc, rd, re, rf]) {
            assert.ok(!r.result?.reply?.includes('SHOULD_NOT_APPEAR'), 'LLM mock response must not appear');
        }
    } finally {
        supabase.from = origFrom;
        controller.aiClient = origAiClient;
        restoreQuota();
    }
});

// 19. Frontend : widget source vérification
test('19. Widget source : assistant_action, pas de t.infoResponse, état React', () => {
    const fs = require('fs');
    const path = require('path');
    const widgetPath = path.resolve(__dirname, '../../src/components/GuideAssistantWidget.tsx');
    const src = fs.readFileSync(widgetPath, 'utf-8');
    // Info button triggers backend call (fetch)
    assert.ok(src.includes('fetch('), 'Info handler must call fetch (backend call)');
    // Payload contains assistant_action: 'discover_features_and_pricing'
    assert.ok(src.includes("assistant_action"), 'payload must contain assistant_action');
    assert.ok(src.includes("discover_features_and_pricing"), 'payload must use discover_features_and_pricing');
    // Payload also includes messages and language (technical fields)
    assert.ok(src.includes('messages:'), 'payload must include messages');
    assert.ok(src.includes('language:'), 'payload must include language');
    // No legacy t.infoResponse for the Info button
    assert.ok(!src.includes('t.infoResponse'), 'legacy t.infoResponse must not be used');
    // conversationState is held in React state (useState)
    assert.ok(src.includes('setConversationState'), 'conversationState must use React setter');
    assert.ok(src.includes('useState'), 'state must be React useState');
});

// 20. Présentation commerciale complète et factuelle
test('20. Présentation commerciale couvre les 9 domaines fonctionnels', () => {
    const { getProductPresentation } = require('../utils/assistantProductCatalog');
    const pres = getProductPresentation({ language: 'fr' });
    // 9 mandatory functional domains
    assert.ok(/[Aa]dministration/i.test(pres), 'must mention administration');
    assert.ok(/[Éé]l[èe]ves?/i.test(pres) || /[Ii]nscription/i.test(pres), 'must mention students/enrollment');
    assert.ok(/[Nn]otes?|[Mm]oyenne|[Bb]ulletin/i.test(pres), 'must mention grades/averages/report cards');
    assert.ok(/[Pp]r[ée]sence|[Pp]ointage|QR/i.test(pres), 'must mention attendance/QR');
    assert.ok(/[Dd]evoir|[Pp][ée]dagog|[Cc]ahier/i.test(pres), 'must mention homework/pedagogy');
    assert.ok(/[Pp]aiement|[Rr]e[çc]u|[Ff]inanc|[Ss]colarit/i.test(pres), 'must mention payments/receipts/finance');
    assert.ok(/[Pp]arent|[Ff]amille/i.test(pres), 'must mention parents/families');
    assert.ok(/[Ss][ée]curit/i.test(pres), 'must mention security');
    assert.ok(/[Mm]ultilingue|[Ll]angue|[Ff]ran[çc]ais.*[Aa]nglais/i.test(pres), 'must mention multilingual');
    // No unverified commercial claims (e.g., specific market share, invented statistics)
    assert.ok(!/#1|numéro 1|leader mondial|market leader/i.test(pres), 'must not invent unverified market claims');
    // Plain text formatting verification (no markdown markers)
    assert.ok(!pres.includes('**'), 'presentation must NOT contain raw markdown ** markers');
    assert.ok(!pres.includes('###'), 'presentation must NOT contain markdown headers');
    assert.ok(!pres.includes('---'), 'presentation must NOT contain markdown hr separators');
    assert.ok(pres.includes('Dans quel pays se trouve votre établissement ?'), 'presentation must conclude with explicit country request');
});

// 21. Exactitude et séparation des grilles (minor_unit, 3 catégories, zéro contamination)
test('21. Grilles Ghana/Espagne : montants, catégories, zéro contamination croisée', async () => {
    // Ghana : 200/300/400 stored, minor_unit=2 → displayed as 2,00/3,00/4,00 GH₵
    const outGH = await runPublic({ messages: [{ role: 'user', content: 'Tarifs Ghana' }] });
    assert.ok(outGH.reply.includes('[GH]'), 'Ghana reply must contain [GH]');
    assert.ok(outGH.reply.includes('GHS'), 'Ghana reply must contain GHS');
    assert.ok(outGH.reply.includes('GH₵'), 'Ghana reply must contain GH₵');
    // Three categories with formatted amounts (200/100=2, 300/100=3, 400/100=4)
    assert.ok(outGH.reply.includes('Maternelle'), 'must have Maternelle category');
    assert.ok(outGH.reply.includes('Collège'), 'must have Collège category');
    assert.ok(outGH.reply.includes('Supérieur'), 'must have Supérieur category');
    // Verify minor_unit conversion: 200 stored / 10^2 = 2.00 → "2,00" in fr-FR
    assert.match(outGH.reply, /GH₵2/, 'maternelle must show GH₵2 (not 200)');
    assert.match(outGH.reply, /GH₵3/, 'collège must show GH₵3 (not 300)');
    assert.match(outGH.reply, /GH₵4/, 'supérieur must show GH₵4 (not 400)');
    // No Spain contamination
    assert.ok(!outGH.reply.includes('EUR'), 'Ghana reply must NOT contain EUR');
    assert.ok(!outGH.reply.includes('€'), 'Ghana reply must NOT contain €');

    // Espagne : 50/75/100 stored, minor_unit=2 → displayed as 0,50/0,75/1,00 €
    const outES = await runPublic({ messages: [{ role: 'user', content: "Tarifs pour l'Espagne" }] });
    assert.ok(outES.reply.includes('[ES]'), 'Spain reply must contain [ES]');
    assert.ok(outES.reply.includes('EUR'), 'Spain reply must contain EUR');
    assert.ok(outES.reply.includes('€'), 'Spain reply must contain €');
    // Verify minor_unit conversion: 50/100=0.50 → "0,50" in fr-FR
    assert.match(outES.reply, /0,50/, 'maternelle must show 0,50 (not 50)');
    assert.match(outES.reply, /0,75/, 'collège must show 0,75 (not 75)');
    assert.match(outES.reply, /1,00/, 'supérieur must show 1,00 (not 100)');
    // No Ghana contamination
    assert.ok(!outES.reply.includes('GH₵'), 'Spain reply must NOT contain GH₵');
    assert.ok(!outES.reply.includes('GHS'), 'Spain reply must NOT contain GHS');
});

// 22. Parcours complet : présentation → awaiting → pays → grille → null
test('22. Parcours complet : présentation → awaiting → pays → grille → null', async () => {
    // Step 1: Feature discovery → product presentation + awaiting
    const step1 = await runPublic({
        messages: [{ role: 'user', content: 'Découvrir les fonctionnalités & Tarifs' }]
    });
    assert.ok(step1.reply.includes('YZIOW'), 'step1 must include product presentation');
    assert.ok(step1.reply.includes('Dans quel pays se trouve votre établissement ?'),
        'step1 must conclude with explicit country request: "Dans quel pays se trouve votre établissement ?"');
    // Ensure no raw markdown formatting
    assert.ok(!step1.reply.includes('**'), 'step1 must NOT contain raw markdown ** markers');
    assert.ok(!step1.reply.includes('###'), 'step1 must NOT contain markdown headers');
    assert.deepStrictEqual(step1.conversation_state, { awaiting: 'pricing_country' }, 'step1 must set awaiting');

    // Step 2: User provides country → pricing grid + state cleared
    const step2 = await runPublic({
        messages: [
            { role: 'user', content: 'Découvrir les fonctionnalités & Tarifs' },
            { role: 'assistant', content: step1.reply.substring(0, 100) + '...' },
            { role: 'user', content: 'Ghana' }
        ],
        conversation_state: step1.conversation_state
    });
    assert.ok(step2.reply.includes('[GH]'), 'step2 must show GH pricing');
    assert.ok(step2.reply.includes('GHS'), 'step2 must show GHS currency');
    assert.deepStrictEqual(step2.conversation_state, null, 'step2 must clear conversation_state');
});

// ────────────────────────────────────────────────────────────────────────────────
// Additional required scenarios
// ────────────────────────────────────────────────────────────────────────────────

// Ancien Ghana dans historique, dernier message "Ghana et Espagne" → clarification
test('Ancien Ghana + dernier msg "Ghana et Espagne" → clarification obligatoire', async () => {
    const out = await runPublic({ messages: [
        { role: 'user', content: 'Tarifs Ghana ?' },
        { role: 'assistant', content: 'Voici la grille GH...' },
        { role: 'user', content: 'Et si je compare le Ghana et l\'Espagne ?' }
    ] });
    assert.ok(out.reply.includes('Ghana'), 'clarification must mention Ghana');
    assert.ok(out.reply.includes('Espagne'), 'clarification must mention Espagne');
    assert.deepStrictEqual(out.conversation_state, { awaiting: 'pricing_country' });
});

// État déjà awaiting + nouvelle question "Tarifs ?" → conserve awaiting sans double reset
test('Déjà awaiting + "Tarifs ?" → conserve awaiting sans double reset', async () => {
    const out = await runPublic({
        messages: [
            { role: 'user', content: 'Combien ça coûte ?' },
            { role: 'assistant', content: 'Veuillez préciser le pays de votre établissement pour obtenir les tarifs.' },
            { role: 'user', content: 'Tarifs ?' }
        ],
        conversation_state: { awaiting: 'pricing_country' }
    });
    assert.deepStrictEqual(out.conversation_state, { awaiting: 'pricing_country' },
        'awaiting must be preserved, not reset to null or doubled');
    assert.ok(out.reply.includes('préciser le pays'), 'must re-prompt for country');
});

// Ambiguity: multi-country in single message → clarification lists both
test('Ambiguité : Ghana+Espagne → clarification avec les deux pays', async () => {
    const out = await runPublic({ messages: [{ role: 'user', content: 'Je veux les tarifs du Ghana et de l\'Espagne' }] });
    assert.ok(out.reply.includes('Ghana'), 'clarification must mention Ghana');
    assert.ok(out.reply.includes('Espagne'), 'clarification must mention Espagne');
    assert.deepStrictEqual(out.conversation_state, { awaiting: 'pricing_country' });
});

// ────────────────────────────────────────────────────────────────────────────────
// Cleanup: restore original AI_QUOTA_HASH_SECRET
// ────────────────────────────────────────────────────────────────────────────────
test('cleanup: restore AI_QUOTA_HASH_SECRET', () => {
    if (_origQuotaSecret !== undefined) {
        process.env.AI_QUOTA_HASH_SECRET = _origQuotaSecret;
    } else {
        delete process.env.AI_QUOTA_HASH_SECRET;
    }
    // Verify restoration
    assert.strictEqual(process.env.AI_QUOTA_HASH_SECRET, _origQuotaSecret);
});
