'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');

// Mocks environnement de test
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'mock_service_key_1234567890';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'mock_jwt_secret_32_characters_long_!';
process.env.AI_QUOTA_HASH_SECRET = process.env.AI_QUOTA_HASH_SECRET || 'mock_hash_secret_at_least_32_chars_long!';
process.env.PASSWORD_RESET_OTP_SECRET = process.env.PASSWORD_RESET_OTP_SECRET || 'mock_otp_secret_at_least_32_chars_long!';

const supabaseModule = require('../utils/supabase');
const publicRouter = require('../routes/public');

const app = express();
app.use(express.json());
app.use('/api/public', publicRouter);

let server;
let baseUrl;

// Fixtures contrôlées de test (uniquement dans la suite de tests, jamais dans le service de production)
const TEST_FIXTURES = {
    BJ: [
        {
            id: 'grid-bj-uemoa-01',
            pricing_version: '2026.1_xof_uemoa',
            scope_type: 'region',
            scope_code: 'UEMOA',
            currency_code: 'XOF',
            currency_symbol: 'FCFA',
            currency_minor_unit: 0,
            locale: 'fr-BJ',
            rates_monthly: { maternelle_primaire: 100, college_secondaire: 150, superieur_formation: 200 },
            billing_months: 10,
            annual_discount_percent: 10,
            installments_count: 3,
            pricing_status: 'active',
            payment_status: 'production',
            enabled: true,
            effective_from: '2026-01-01T00:00:00.000Z',
            effective_to: null,
            saas_pricing_grid_countries: [{ country_code: 'BJ' }]
        }
    ],
    ES: [
        {
            id: 'grid-es-01',
            pricing_version: '2026.1_eur_spain',
            scope_type: 'country',
            scope_code: 'ES',
            currency_code: 'EUR',
            currency_symbol: '€',
            currency_minor_unit: 2,
            locale: 'es-ES',
            rates_monthly: { maternelle_primaire: 50, college_secondaire: 75, superieur_formation: 100 },
            billing_months: 10,
            annual_discount_percent: 10,
            installments_count: 3,
            pricing_status: 'active',
            payment_status: 'configuration_pending',
            enabled: true,
            effective_from: '2026-01-01T00:00:00.000Z',
            effective_to: null,
            saas_pricing_grid_countries: [{ country_code: 'ES' }]
        }
    ],
    GH: [
        {
            id: 'grid-gh-01',
            pricing_version: '2026.1_ghs_ghana',
            scope_type: 'country',
            scope_code: 'GH',
            currency_code: 'GHS',
            currency_symbol: 'GH₵',
            currency_minor_unit: 2,
            locale: 'en-GH',
            rates_monthly: { maternelle_primaire: 200, college_secondaire: 300, superieur_formation: 400 },
            billing_months: 10,
            annual_discount_percent: 10,
            installments_count: 3,
            pricing_status: 'active',
            payment_status: 'configuration_pending',
            enabled: true,
            effective_from: '2026-01-01T00:00:00.000Z',
            effective_to: null,
            saas_pricing_grid_countries: [{ country_code: 'GH' }]
        }
    ]
};

// Helper pour créer un mock Supabase dynamique
function createMockSupabase(handler) {
    return {
        from: (table) => {
            return {
                select: (columns) => {
                    let countryFilter = null;
                    const builder = {
                        eq: (field, val) => {
                            if (field === 'saas_pricing_grid_countries.country_code') {
                                countryFilter = val;
                            }
                            return builder;
                        },
                        lte: (field, val) => {
                            return builder;
                        },
                        then: (resolve, reject) => {
                            try {
                                const result = handler(table, countryFilter);
                                resolve(result);
                            } catch (err) {
                                reject(err);
                            }
                        }
                    };
                    return builder;
                }
            };
        }
    };
}

const originalSupabase = supabaseModule.supabase;

test.before(async () => {
    // Injecter un mock Supabase par défaut pour les fixtures BJ, ES, GH
    supabaseModule.supabase = createMockSupabase((table, country) => {
        if (table === 'saas_pricing_grids' && TEST_FIXTURES[country]) {
            return { data: TEST_FIXTURES[country], error: null };
        }
        return { data: [], error: null };
    });

    await new Promise((resolve) => {
        server = http.createServer(app);
        server.listen(0, '127.0.0.1', () => {
            const port = server.address().port;
            baseUrl = `http://127.0.0.1:${port}/api/public`;
            resolve();
        });
    });
});

test.after(async () => {
    supabaseModule.supabase = originalSupabase;
    if (server) {
        await new Promise((resolve) => server.close(resolve));
    }
});

test('1. Code pays invalide (chiffres, trop long, vide) → 400 INVALID_COUNTRY_CODE', async () => {
    const invalidCodes = ['1', '12', 'B', 'BEN', 'B1', 'longname', 'b-'];
    for (const code of invalidCodes) {
        const res = await fetch(`${baseUrl}/pricing/${code}`);
        assert.strictEqual(res.status, 400, `Attendu 400 pour code ${code}`);
        const data = await res.json();
        assert.strictEqual(data.code, 'INVALID_COUNTRY_CODE');
    }
});

test('2. Pays simulé BJ → 200, XOF, minor_unit 0 et 3 cycles exacts du mock', async () => {
    const res = await fetch(`${baseUrl}/pricing/BJ`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    assert.strictEqual(data.country, 'BJ');
    assert.strictEqual(data.currency, 'XOF');
    assert.strictEqual(data.currency_symbol, 'FCFA');
    assert.strictEqual(data.currency_minor_unit, 0);
    assert.strictEqual(data.pricing_version, '2026.1_xof_uemoa');
    assert.ok(data.cycles);
    assert.strictEqual(data.cycles.maternelle_primaire.monthly, 100);
    assert.strictEqual(data.cycles.college_secondaire.monthly, 150);
    assert.strictEqual(data.cycles.superieur_formation.monthly, 200);

    // Aucune donnée privée
    assert.strictEqual(data.school, undefined);
    assert.strictEqual(data.students, undefined);
    assert.strictEqual(data.userId, undefined);
    assert.strictEqual(data.schoolSlug, undefined);
    assert.strictEqual(data.id, undefined);
    assert.strictEqual(data.scope_type, undefined);
    assert.strictEqual(data.scope_code, undefined);
    assert.strictEqual(data.payment_status, undefined);
    assert.strictEqual(data.enabled, undefined);
    assert.strictEqual(data.billing_months, undefined);
    assert.strictEqual(data.annual_discount_percent, undefined);
    assert.strictEqual(data.installments_count, undefined);
    assert.strictEqual(data.saas_pricing_grid_countries, undefined);
});

test('3. Pays simulé ES → 200, EUR, minor_unit 2 (centimes)', async () => {
    const res = await fetch(`${baseUrl}/pricing/ES`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    assert.strictEqual(data.country, 'ES');
    assert.strictEqual(data.currency, 'EUR');
    assert.strictEqual(data.currency_symbol, '€');
    assert.strictEqual(data.currency_minor_unit, 2);
    assert.strictEqual(data.cycles.maternelle_primaire.monthly, 50);
    assert.strictEqual(data.cycles.college_secondaire.monthly, 75);
    assert.strictEqual(data.cycles.superieur_formation.monthly, 100);
});

test('4. Pays simulé GH → 200, GHS, minor_unit 2 (pesewas)', async () => {
    const res = await fetch(`${baseUrl}/pricing/GH`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    assert.strictEqual(data.country, 'GH');
    assert.strictEqual(data.currency, 'GHS');
    assert.strictEqual(data.currency_symbol, 'GH₵');
    assert.strictEqual(data.currency_minor_unit, 2);
    assert.strictEqual(data.cycles.maternelle_primaire.monthly, 200);
    assert.strictEqual(data.cycles.college_secondaire.monthly, 300);
    assert.strictEqual(data.cycles.superieur_formation.monthly, 400);
});

test('5. Résultat base vide (pays valide non configuré) → 404 PRICING_GRID_NOT_CONFIGURED', async () => {
    const res = await fetch(`${baseUrl}/pricing/IS`);
    assert.strictEqual(res.status, 404);
    const data = await res.json();

    assert.strictEqual(data.code, 'PRICING_GRID_NOT_CONFIGURED');
    assert.strictEqual(data.message, 'Tarification sur devis');
});

test('6. Insensibilité à la casse (bj → BJ) avec trim', async () => {
    const res = await fetch(`${baseUrl}/pricing/bj`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.country, 'BJ');
});

test('7. Erreur Supabase simulée → 500 générique (aucun secours, aucun détail SQL)', async () => {
    const currentMock = supabaseModule.supabase;
    supabaseModule.supabase = {
        simulateDbError: true,
        from: () => {}
    };

    try {
        const res = await fetch(`${baseUrl}/pricing/BJ`);
        assert.strictEqual(res.status, 500);
        const data = await res.json();
        assert.strictEqual(data.code, 'INTERNAL_SERVER_ERROR');
        assert.strictEqual(data.error, 'Erreur interne lors de la consultation des tarifs.');
        assert.strictEqual(data.message, undefined);
    } finally {
        supabaseModule.supabase = currentMock;
    }
});

test('8. Ligne incomplète (cycle manquant) → 500, aucun secours', async () => {
    const currentMock = supabaseModule.supabase;
    supabaseModule.supabase = createMockSupabase(() => {
        return {
            data: [{
                id: 'grid-incomplete',
                pricing_version: '2026.1_broken',
                scope_type: 'country',
                scope_code: 'XX',
                currency_code: 'XOF',
                currency_symbol: 'FCFA',
                currency_minor_unit: 0,
                rates_monthly: { maternelle_primaire: 100 }, // manque college et superieur
                enabled: true,
                pricing_status: 'active',
                effective_from: '2026-01-01T00:00:00.000Z',
                saas_pricing_grid_countries: [{ country_code: 'XX' }]
            }],
            error: null
        };
    });

    try {
        const res = await fetch(`${baseUrl}/pricing/XX`);
        assert.strictEqual(res.status, 500);
        const data = await res.json();
        assert.strictEqual(data.code, 'INTERNAL_SERVER_ERROR');
    } finally {
        supabaseModule.supabase = currentMock;
    }
});

test('9. Montant invalide (négatif ou non entier) → 500', async () => {
    const currentMock = supabaseModule.supabase;
    supabaseModule.supabase = createMockSupabase(() => {
        return {
            data: [{
                id: 'grid-negative',
                pricing_version: '2026.1_broken',
                scope_type: 'country',
                scope_code: 'XX',
                currency_code: 'XOF',
                currency_symbol: 'FCFA',
                currency_minor_unit: 0,
                rates_monthly: { maternelle_primaire: -100, college_secondaire: 150, superieur_formation: 200 },
                enabled: true,
                pricing_status: 'active',
                effective_from: '2026-01-01T00:00:00.000Z',
                saas_pricing_grid_countries: [{ country_code: 'XX' }]
            }],
            error: null
        };
    });

    try {
        const res = await fetch(`${baseUrl}/pricing/XX`);
        assert.strictEqual(res.status, 500);
        const data = await res.json();
        assert.strictEqual(data.code, 'INTERNAL_SERVER_ERROR');
    } finally {
        supabaseModule.supabase = currentMock;
    }
});

test('10. Grille future ou inactive → jamais retournée (404 si aucune autre)', async () => {
    const currentMock = supabaseModule.supabase;

    // Cas A: Grille avec effective_from dans le futur
    supabaseModule.supabase = createMockSupabase(() => ({
        data: [{
            id: 'grid-future',
            pricing_version: '2099.1_future',
            scope_type: 'country',
            scope_code: 'YY',
            currency_code: 'XOF',
            currency_symbol: 'FCFA',
            currency_minor_unit: 0,
            rates_monthly: { maternelle_primaire: 100, college_secondaire: 150, superieur_formation: 200 },
            enabled: true,
            pricing_status: 'active',
            effective_from: '2099-01-01T00:00:00.000Z', // dans le futur
            saas_pricing_grid_countries: [{ country_code: 'YY' }]
        }],
        error: null
    }));

    try {
        const res = await fetch(`${baseUrl}/pricing/YY`);
        assert.strictEqual(res.status, 404);
        const data = await res.json();
        assert.strictEqual(data.code, 'PRICING_GRID_NOT_CONFIGURED');
    } finally {
        supabaseModule.supabase = currentMock;
    }

    // Cas B: Grille avec pricing_status inactif
    supabaseModule.supabase = createMockSupabase(() => ({
        data: [{
            id: 'grid-inactive',
            pricing_version: '2026.1_inactive',
            scope_type: 'country',
            scope_code: 'YY',
            currency_code: 'XOF',
            currency_symbol: 'FCFA',
            currency_minor_unit: 0,
            rates_monthly: { maternelle_primaire: 100, college_secondaire: 150, superieur_formation: 200 },
            enabled: true,
            pricing_status: 'archived', // statut inactif
            effective_from: '2026-01-01T00:00:00.000Z',
            saas_pricing_grid_countries: [{ country_code: 'YY' }]
        }],
        error: null
    }));

    try {
        const res = await fetch(`${baseUrl}/pricing/YY`);
        assert.strictEqual(res.status, 404);
        const data = await res.json();
        assert.strictEqual(data.code, 'PRICING_GRID_NOT_CONFIGURED');
    } finally {
        supabaseModule.supabase = currentMock;
    }

    // Cas C: Grille désactivée (enabled: false)
    supabaseModule.supabase = createMockSupabase(() => ({
        data: [{
            id: 'grid-disabled',
            pricing_version: '2026.1_disabled',
            scope_type: 'country',
            scope_code: 'YY',
            currency_code: 'XOF',
            currency_symbol: 'FCFA',
            currency_minor_unit: 0,
            rates_monthly: { maternelle_primaire: 100, college_secondaire: 150, superieur_formation: 200 },
            enabled: false, // désactivée
            pricing_status: 'active',
            effective_from: '2026-01-01T00:00:00.000Z',
            saas_pricing_grid_countries: [{ country_code: 'YY' }]
        }],
        error: null
    }));

    try {
        const res = await fetch(`${baseUrl}/pricing/YY`);
        assert.strictEqual(res.status, 404);
        const data = await res.json();
        assert.strictEqual(data.code, 'PRICING_GRID_NOT_CONFIGURED');
    } finally {
        supabaseModule.supabase = currentMock;
    }
});

test('11. Aucune opération INSERT, UPDATE, DELETE ou UPSERT (lecture seule pure)', async () => {
    let writeOperationsAttempted = [];
    const currentMock = supabaseModule.supabase;

    supabaseModule.supabase = {
        from: (table) => ({
            select: () => ({
                eq: () => ({
                    eq: () => ({
                        lte: () => Promise.resolve({ data: TEST_FIXTURES.BJ, error: null })
                    })
                })
            }),
            insert: () => { writeOperationsAttempted.push('insert'); return Promise.resolve({ error: null }); },
            update: () => { writeOperationsAttempted.push('update'); return Promise.resolve({ error: null }); },
            delete: () => { writeOperationsAttempted.push('delete'); return Promise.resolve({ error: null }); },
            upsert: () => { writeOperationsAttempted.push('upsert'); return Promise.resolve({ error: null }); }
        })
    };

    try {
        const resGet = await fetch(`${baseUrl}/pricing/BJ`);
        assert.strictEqual(resGet.status, 200);
        assert.deepStrictEqual(writeOperationsAttempted, [], 'Aucune opération d\'écriture ne doit être tentée');

        const resPost = await fetch(`${baseUrl}/pricing/BJ`, { method: 'POST', body: JSON.stringify({ fake: true }) });
        assert.strictEqual(resPost.status, 404);

        const resPut = await fetch(`${baseUrl}/pricing/BJ`, { method: 'PUT', body: JSON.stringify({ fake: true }) });
        assert.strictEqual(resPut.status, 404);

        const resDelete = await fetch(`${baseUrl}/pricing/BJ`, { method: 'DELETE' });
        assert.strictEqual(resDelete.status, 404);
    } finally {
        supabaseModule.supabase = currentMock;
    }
});
