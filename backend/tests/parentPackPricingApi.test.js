'use strict';

const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');

let mockResponses = {};
let mockQueries = {};

const mockSupabase = {
    from: (table) => {
        if (!mockQueries[table]) mockQueries[table] = [];
        const queryLog = { table, eqs: {} };
        mockQueries[table].push(queryLog);
        
        const chain = {
            select: () => chain,
            eq: (col, val) => {
                queryLog.eqs[col] = val;
                return chain;
            },
            maybeSingle: async () => {
                if (table.startsWith('parent_student_')) return mockResponses.link;
                if (table.startsWith('students_')) return mockResponses.student;
                if (table === 'parent_pack_pricing') return mockResponses.pricing;
                return { data: null, error: null };
            }
        };
        return chain;
    }
};

const originalRequire = Module.prototype.require;
Module.prototype.require = function() {
    if (arguments[0] === '../utils/supabase') {
        return { supabase: mockSupabase };
    }
    return originalRequire.apply(this, arguments);
};

const { getParentPackPricing } = require('../controllers/paymentController');

test('P25-C.1: Parent Pack Pricing API', async (t) => {
    global.SLUG_REGEX = /^[a-z0-9_]{1,50}$/;

    t.beforeEach(() => {
        mockResponses = {
            link: { data: { parent_id: 'parent-1' }, error: null },
            student: { data: { id: '123', classe: '6A' }, error: null },
            pricing: { data: { monthly_price_minor: 1000, annual_price_minor: 9000, annual_duration_months: 10, currency: 'XOF' }, error: null }
        };
        mockQueries = {};
    });

    function createMockRes() {
        const res = {
            statusCode: 200,
            body: null,
            status: function(code) {
                this.statusCode = code;
                return this;
            },
            json: function(data) {
                this.body = data;
                return this;
            }
        };
        return res;
    }

    await t.test('1. Rejet si pas authentifié', async () => {
        const req = { params: { schoolSlug: 'test_school', studentId: '123' }, user: null };
        const res = createMockRes();
        await getParentPackPricing(req, res);
        assert.strictEqual(res.statusCode, 403);
    });

    await t.test('2. invalid schoolSlug', async () => {
        const req = { params: { schoolSlug: 'invalid-school-slug!', studentId: '123' }, user: { id: 'parent-1' } };
        const res = createMockRes();
        await getParentPackPricing(req, res);
        assert.strictEqual(res.statusCode, 400);
        assert.ok(res.body.error.includes('invalide'));
    });

    await t.test('3. link DB error', async () => {
        const req = { params: { schoolSlug: 'test_school', studentId: '123' }, user: { id: 'parent-1' } };
        const res = createMockRes();
        mockResponses.link = { data: null, error: new Error('DB timeout') };
        await getParentPackPricing(req, res);
        assert.strictEqual(res.statusCode, 500);
        assert.ok(res.body.error.includes('technique'));
    });

    await t.test('4. non-owner (link absent)', async () => {
        const req = { params: { schoolSlug: 'test_school', studentId: '123' }, user: { id: 'parent-1' } };
        const res = createMockRes();
        mockResponses.link = { data: null, error: null };
        await getParentPackPricing(req, res);
        assert.strictEqual(res.statusCode, 403);
        assert.ok(res.body.error.includes('non autorisé'));
    });

    await t.test('5. student DB error', async () => {
        const req = { params: { schoolSlug: 'test_school', studentId: '123' }, user: { id: 'parent-1' } };
        const res = createMockRes();
        mockResponses.student = { data: null, error: new Error('DB crash') };
        await getParentPackPricing(req, res);
        assert.strictEqual(res.statusCode, 500);
        assert.ok(res.body.error.includes('technique'));
    });

    await t.test('6. student missing', async () => {
        const req = { params: { schoolSlug: 'test_school', studentId: '123' }, user: { id: 'parent-1' } };
        const res = createMockRes();
        mockResponses.student = { data: null, error: null };
        await getParentPackPricing(req, res);
        assert.strictEqual(res.statusCode, 404);
        assert.ok(res.body.error.includes('introuvable'));
    });

    await t.test('7. unknown class', async () => {
        const req = { params: { schoolSlug: 'test_school', studentId: '123' }, user: { id: 'parent-1' } };
        const res = createMockRes();
        mockResponses.student = { data: { id: '123', classe: 'UNKNOWN' }, error: null };
        
        const originalRequireTest = Module.prototype.require;
        Module.prototype.require = function() {
            if (arguments[0] === '../config/parentPackClassifications') {
                return { resolveCycleName: () => { throw new Error('CLASS_UNKNOWN'); } };
            }
            if (arguments[0] === '../utils/supabase') return { supabase: mockSupabase };
            return originalRequireTest.apply(this, arguments);
        };

        await getParentPackPricing(req, res);
        Module.prototype.require = originalRequireTest;

        assert.strictEqual(res.statusCode, 400);
        assert.ok(res.body.error.includes('inconnue'));
    });

    await t.test('8. pricing DB error', async () => {
        const req = { params: { schoolSlug: 'test_school', studentId: '123' }, user: { id: 'parent-1' } };
        const res = createMockRes();
        mockResponses.pricing = { data: null, error: new Error('DB dead') };
        
        const originalRequireTest = Module.prototype.require;
        Module.prototype.require = function() {
            if (arguments[0] === '../config/parentPackClassifications') return { resolveCycleName: () => 'college' };
            if (arguments[0] === '../utils/supabase') return { supabase: mockSupabase };
            return originalRequireTest.apply(this, arguments);
        };

        await getParentPackPricing(req, res);
        Module.prototype.require = originalRequireTest;

        assert.strictEqual(res.statusCode, 500);
        assert.ok(res.body.error.includes('technique'));
    });

    await t.test('9. pricing missing or inactive', async () => {
        const req = { params: { schoolSlug: 'test_school', studentId: '123' }, user: { id: 'parent-1' } };
        const res = createMockRes();
        mockResponses.pricing = { data: null, error: null }; // Simule aucune ligne active
        
        const originalRequireTest = Module.prototype.require;
        Module.prototype.require = function() {
            if (arguments[0] === '../config/parentPackClassifications') return { resolveCycleName: () => 'college' };
            if (arguments[0] === '../utils/supabase') return { supabase: mockSupabase };
            return originalRequireTest.apply(this, arguments);
        };

        await getParentPackPricing(req, res);
        Module.prototype.require = originalRequireTest;

        assert.strictEqual(res.statusCode, 404);
        assert.ok(res.body.error.includes('Aucun tarif Parent Pack actif'));
        
        // Assert mock query forced active=true
        const pricingQueries = mockQueries['parent_pack_pricing'];
        assert.ok(pricingQueries.length > 0);
        assert.strictEqual(pricingQueries[0].eqs.active, true);
    });

    await t.test('10. Succès nominal (authenticated owner, client cannot impose)', async () => {
        // Le client essaie d'imposer un montant, une devise, une durée, etc. par le body ou params supplémentaires
        const req = { 
            params: { schoolSlug: 'test_school', studentId: '123' },
            body: { amount: 1, currency: 'USD', durationMonths: 100, pricing_id: 'fake', parent_ref: 'other', student_global_id: 'other' },
            user: { id: 'parent-1' } 
        };
        const res = createMockRes();
        
        const originalRequireTest = Module.prototype.require;
        Module.prototype.require = function() {
            if (arguments[0] === '../config/parentPackClassifications') return { resolveCycleName: () => 'college' };
            if (arguments[0] === '../utils/supabase') return { supabase: mockSupabase };
            return originalRequireTest.apply(this, arguments);
        };

        await getParentPackPricing(req, res);
        Module.prototype.require = originalRequireTest;

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.studentId, '123');
        assert.strictEqual(res.body.cycleName, 'college');
        assert.strictEqual(res.body.plans.length, 2);
        
        const monthly = res.body.plans.find(p => p.periodicity === 'monthly');
        assert.strictEqual(monthly.amountMinor, 1000); // from DB, not body
        assert.strictEqual(monthly.currency, 'XOF'); // from DB, not body

        const annual = res.body.plans.find(p => p.periodicity === 'annual');
        assert.strictEqual(annual.amountMinor, 9000); // from DB
        assert.strictEqual(annual.currency, 'XOF'); // from DB
        assert.strictEqual(annual.durationMonths, 10); // from DB
    });
});
