const assert = require('assert');
const path = require('path');
const { describe, it, beforeEach, afterEach, after } = require('node:test');

// Save original env
const __originalEnv = { ...process.env };

// Define dummy values BEFORE loading anything
process.env.SUPABASE_URL = 'https://example.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'dummy_key';
process.env.JWT_SECRET = 'abcdefghijklmnopqrstuvwxyz123456';
process.env.FEDAPAY_WEBHOOK_SECRET = 'testsecret';

const { fedapayWebhook } = require('../controllers/paymentController');
const { supabase } = require('../utils/supabase');
const { Transaction, Webhook } = require('fedapay');

function mockReq(rawBody) {
  return { headers: { 'x-fedapay-signature': 'sig' }, rawBody, body: {} };
}
function mockRes() {
  const res = {};
  res.statusCode = null;
  res.body = null;
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => { res.body = obj; return res; };
  return res;
}

describe('Legacy SaaS Webhook Cutover', () => {
  let originalSupabaseFrom;
  let originalSupabaseRpc;
  let originalTransactionRetrieve;
  let originalWebhookConstructEvent;
  let rpcCallCount = 0;

  beforeEach(() => {
    originalSupabaseFrom = supabase.from;
    originalSupabaseRpc = supabase.rpc;
    originalTransactionRetrieve = Transaction.retrieve;
    originalWebhookConstructEvent = Webhook.constructEvent;
    rpcCallCount = 0;

    supabase.rpc = async (fnName, params) => {
      if (fnName === 'process_fedapay_webhook_event_v2') {
        rpcCallCount++;
        return { data: { status: 'completed' }, error: null };
      }
      return { data: null, error: null };
    };

    Transaction.retrieve = async (id) => ({
      id,
      status: 'approved',
      amount: 1000,
      currency: { iso: 'XOF' },
      custom_metadata: { intent_id: '123e4567-e89b-12d3-a456-426614174000' }
    });

    Webhook.constructEvent = (rawBody, sig, secret) => ({
      name: 'transaction.approved',
      entity: { id: 'remote_tx', custom_metadata: { intent_id: '123e4567-e89b-12d3-a456-426614174000' } },
      id: 'event-123'
    });
  });

  afterEach(() => {
    supabase.from = originalSupabaseFrom;
    supabase.rpc = originalSupabaseRpc;
    Transaction.retrieve = originalTransactionRetrieve;
    Webhook.constructEvent = originalWebhookConstructEvent;
  });

  after(() => {
    for (const key of Object.keys(process.env)) {
        if (!__originalEnv.hasOwnProperty(key)) {
            delete process.env[key];
        }
    }
    for (const key of Object.keys(__originalEnv)) {
        process.env[key] = __originalEnv[key];
    }
  });

  it('creates P16 review for SaaS subscription and returns 200', async () => {
    supabase.from = (table) => {
      if (table === 'payment_intents') {
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { payment_type: 'saas_subscription' } }) }) }) };
      }
      if (table === 'legacy_saas_manual_reviews') {
        return {
          insert: () => Promise.resolve({ data: {} })
        };
      }
    };
    const req = mockReq(Buffer.from('test'));
    const res = mockRes();
    await fedapayWebhook(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.status, 'manual_review_queued');
    assert.strictEqual(rpcCallCount, 0);
  });

  it('handles duplicate P16 insertion gracefully (23505)', async () => {
    supabase.from = (table) => {
      if (table === 'payment_intents') {
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { payment_type: 'saas_subscription' } }) }) }) };
      }
      if (table === 'legacy_saas_manual_reviews') {
        return {
          insert: () => {
            const err = new Error('Duplicate');
            err.code = '23505';
            return Promise.reject(err);
          },
          select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: '123' } }) }) }) })
        };
      }
    };
    const req = mockReq(Buffer.from('test'));
    const res = mockRes();
    await fedapayWebhook(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.status, 'manual_review_duplicate');
    assert.strictEqual(rpcCallCount, 0);
  });

  it('returns 500 on unexpected P16 error non-duplicate', async () => {
    supabase.from = (table) => {
      if (table === 'payment_intents') {
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { payment_type: 'saas_subscription' } }) }) }) };
      }
      if (table === 'legacy_saas_manual_reviews') {
        return {
          insert: () => Promise.reject({ code: 'OTHER_ERROR' }),
          select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: true }) }) }) })
        };
      }
    };
    const req = mockReq(Buffer.from('test'));
    const res = mockRes();
    await fedapayWebhook(req, res);
    assert.strictEqual(res.statusCode, 500);
    assert.deepStrictEqual(res.body, { error: 'Erreur lors de la persistance P16.' });
    assert.strictEqual(rpcCallCount, 0);
  });

  it('returns 500 when payment_intents read fails', async () => {
    supabase.from = (table) => {
      if (table === 'payment_intents') {
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: { message: 'DB Error' } }) }) }) };
      }
    };
    const req = mockReq(Buffer.from('test'));
    const res = mockRes();
    await fedapayWebhook(req, res);
    assert.strictEqual(res.statusCode, 500);
    assert.deepStrictEqual(res.body, { error: 'Erreur lors de la récupération du type d\'intention.' });
    assert.strictEqual(rpcCallCount, 0);
  });

  it('fallback when event.id missing inserts P16 with provider_event_ref', async () => {
    Webhook.constructEvent = (rawBody, sig, secret) => ({
      name: 'transaction.approved',
      entity: { id: 'remote_tx', custom_metadata: { intent_id: '123e4567-e89b-12d3-a456-426614174000' } }
      // no event.id
    });
    
    let insertedRef = null;
    supabase.from = (table) => {
      if (table === 'payment_intents') {
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { payment_type: 'saas_subscription' } }) }) }) };
      }
      if (table === 'legacy_saas_manual_reviews') {
        return {
          insert: (obj) => {
            insertedRef = obj.provider_event_ref;
            return Promise.resolve({ data: {} });
          }
        };
      }
    };
    const req = mockReq(Buffer.from('test'));
    const res = mockRes();
    await fedapayWebhook(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(insertedRef, 'uncertified_intent_123e4567-e89b-12d3-a456-426614174000');
    assert.strictEqual(rpcCallCount, 0);
  });

  it('processes tuition payment_type and calls RPC once', async () => {
    supabase.from = (table) => {
      if (table === 'payment_intents') {
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { payment_type: 'tuition' } }) }) }) };
      }
    };
    const req = mockReq(Buffer.from('test'));
    const res = mockRes();
    await fedapayWebhook(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(rpcCallCount, 1);
  });

  it('processes donation payment_type and calls RPC once', async () => {
    supabase.from = (table) => {
      if (table === 'payment_intents') {
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { payment_type: 'donation' } }) }) }) };
      }
    };
    const req = mockReq(Buffer.from('test'));
    const res = mockRes();
    await fedapayWebhook(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(rpcCallCount, 1);
  });

  it('returns 400 on invalid webhook signature', async () => {
    Webhook.constructEvent = () => { throw new Error('Invalid signature'); };
    const req = mockReq(Buffer.from('test'));
    const res = mockRes();
    await fedapayWebhook(req, res);
    assert.strictEqual(res.statusCode, 400);
  });

  it('payment router returns 410 for SaaS route', async () => {
    const router = require('../routes/payment');
    const req = { params: { slug: 'school1' } };
    const res = { statusCode: null, jsonData: null, status: function(code){ this.statusCode = code; return this; }, json: function(obj){ this.jsonData = obj; return this; } };
    const route = router.stack.find(l => l.route && l.route.path === '/saas/schools/:slug/quotes');
    const handler = route.route.stack[0].handle;
    await handler(req, res);
    assert.strictEqual(res.statusCode, 410);
    assert.deepStrictEqual(res.jsonData, { error: "SCHOOL_BILLING_RETIRED", message: "La facturation école est retirée, la plateforme est gratuite." });
  });
});
