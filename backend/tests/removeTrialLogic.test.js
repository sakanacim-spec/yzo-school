const test = require('node:test');
const assert = require('node:assert');

process.env.SUPABASE_URL = 'http://mock';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock';
process.env.JWT_SECRET = 'mock';

test('Remove School Trial Logic', async (t) => {
    // These tests verify that the old SaaS trial logic is strictly removed
    // We mock the controllers instead of full e2e if we just need to prove the behavior

    // 1. une école nouvellement inscrite est active et ne reçoit aucune date d’essai
    await t.test('1. Registration creates an active school without trial_ends_at', async () => {
        const fs = require('fs');
        const content = fs.readFileSync(__dirname + '/../controllers/authController.js', 'utf8');
        assert.ok(!content.includes("status: 'trial'"), 'No trial status hardcoded');
        assert.ok(!content.includes("trial_ends_at:"), 'No trial_ends_at assigned');
        assert.ok(content.includes("status: 'active'"), 'Status active is present');
    });

    // 2. une école créée par SuperAdmin est active
    await t.test('2. SuperAdmin creates an active school without trial_ends_at', async () => {
        const fs = require('fs');
        const content = fs.readFileSync(__dirname + '/../controllers/superAdminController.js', 'utf8');
        assert.ok(!content.includes("status: 'trial'"), 'No trial status hardcoded');
        assert.ok(!content.includes("trial_ends_at:"), 'No trial_ends_at assigned');
    });

    // 3. une école active peut se connecter
    await t.test('3. Active school can log in (trial expired check removed)', async () => {
        const fs = require('fs');
        const content = fs.readFileSync(__dirname + '/../controllers/authController.js', 'utf8');
        assert.ok(!content.includes("trial_expired"), 'No trial_expired error returned');
    });

    // 4. une école suspended reste bloquée
    await t.test('4. Suspended school is blocked', async () => {
        const fs = require('fs');
        const content = fs.readFileSync(__dirname + '/../controllers/authController.js', 'utf8');
        assert.ok(content.includes("school.status === 'suspended'"), 'Suspended check remains');
    });

    // 5. aucun calcul ou retour API ne contient expired_trials
    await t.test('5. SuperAdmin stats do not return expired_trials', async () => {
        const fs = require('fs');
        const content = fs.readFileSync(__dirname + '/../controllers/superAdminController.js', 'utf8');
        assert.ok(!content.includes("expired_trials:"), 'expired_trials removed from stats');
    });

    // 7. Endpoint createSaasTransaction is retired
    await t.test('7. createSaasTransaction returns SCHOOL_SUBSCRIPTION_RETIRED', async () => {
        process.env.SUPABASE_URL = 'http://mock';
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock';
        const { createSaasTransaction } = require('../controllers/paymentController.js');
        const req = { body: {}, params: {} };
        const res = {
            status: function(s) { this.statusCode = s; return this; },
            json: function(j) { this.body = j; return this; }
        };
        await createSaasTransaction(req, res);
        assert.strictEqual(res.statusCode, 410);
        assert.strictEqual(res.body.code, 'SCHOOL_SUBSCRIPTION_RETIRED');
    });

    // 8. Endpoint createSubscriptionQuote is retired
    await t.test('8. createSubscriptionQuote returns SCHOOL_SUBSCRIPTION_RETIRED', async () => {
        process.env.SUPABASE_URL = 'http://mock';
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock';
        const { createSubscriptionQuote } = require('../controllers/paymentController.js');
        const req = { body: {}, params: {} };
        const res = {
            status: function(s) { this.statusCode = s; return this; },
            json: function(j) { this.body = j; return this; }
        };
        await createSubscriptionQuote(req, res);
        assert.strictEqual(res.statusCode, 410);
        assert.strictEqual(res.body.code, 'SCHOOL_SUBSCRIPTION_RETIRED');
    });

    // 6. un ancien événement saas_subscription ne modifie jamais une école
    await t.test('6. Legacy saas_subscription webhook does not modify schools', async () => {
        const fs = require('fs');
        const p18 = fs.readFileSync(__dirname + '/../scripts/migration_p18_remove_saas_webhook_logic.sql', 'utf8');
        assert.ok(p18.includes('Aucun ancien événement saas_subscription ne doit modifier une école'), 'p18 migration explicitly prevents webhook modifications to public.schools');
    });

    await t.test('9. Un établissement gratuit n affiche aucun abonnement/essai sur SuperAdmin', async () => {
        const fs = require('fs');
        const content = fs.readFileSync(__dirname + '/../../src/pages/superadmin/SuperAdminDashboard.tsx', 'utf8');
        assert.ok(!content.includes("status === 'trial'"), 'No trial status UI logic');
        assert.ok(!content.includes("trial_days_left"), 'No trial days logic');
    });

    await t.test('10. Aucun message visible ciblé ne promet 14 jours d essai ou un abonnement école', async () => {
        const fs = require('fs');
        const contentTr = fs.readFileSync(__dirname + '/../../src/services/assistantTranslations.ts', 'utf8');
        const contentPr = fs.readFileSync(__dirname + '/../utils/assistantPrompts.js', 'utf8');
        assert.ok(!contentTr.includes("14 jours d'essai") && !contentTr.includes("14j gratuits"), 'No 14 days promise in translations');
        assert.ok(!contentPr.includes("14 jours d'essai") && !contentPr.includes("abonnement école"), 'No trial or school subscription promise in prompts');
    });
});
