// backend/tests/parent_pack_j30.test.js
/**
 * Tests for Parent Pack J‑30 logic and webhook handling.
 * These tests run against a real PostgreSQL instance (DATABASE_URL).
 */
const { describe, it, before, after } = require('node:test');
const assert = require('assert');
const pg = require('pg');
const { randomUUID } = require('crypto');

const { Client } = pg;
let client;

let globalPricingId;
before(async () => {
  const connStr = process.env.DATABASE_URL;
  if (!connStr) throw new Error('DATABASE_URL not set');
  client = new Client({ connectionString: connStr });
  await client.connect();
  // Reuse an existing pricing record inserted by migrations
  const pricingRes = await client.query(
    `SELECT id FROM public.parent_pack_pricing WHERE cycle_name = 'maternelle_primaire' AND currency = 'XOF' AND pricing_version = 1 LIMIT 1`
  );
  if (pricingRes.rows.length === 0) {
    throw new Error('Required pricing record not found');
  }
  globalPricingId = pricingRes.rows[0].id;
});

after(async () => {
  await client.end();
});

/** Helper to invoke the checkout SQL function */
async function checkout(params) {
  const {
    p_parent_ref,
    p_student_local_id,
    p_school_slug,
    p_pricing_id,
    p_duration_months,
  } = params;
  const res = await client.query(
    `SELECT * FROM public.prepare_parent_pack_checkout(
      $1::text, $2::uuid, $3::text, $4::text, $5::uuid, $6::text, $7::integer
    ) AS result`,
    [
      p_parent_ref,
      randomUUID(), // subscription_id placeholder
      p_student_local_id,
      p_school_slug,
      p_pricing_id,
      p_school_slug,
      p_duration_months,
    ]
  );
  return res.rows[0].result;
}

/** Helper to invoke the webhook processing function */
async function processWebhook(intentId, certifiedAt) {
  const res = await client.query(
    `SELECT * FROM public.process_parent_pack_webhook_event(
      $1::uuid,
      $2::text,
      $3::numeric,
      $4::numeric,
      $5::numeric,
      $6::numeric,
      $7::timestamp,
      $8::text,
      $9::boolean,
      $10::text,
      $11::text
    ) AS result`,
    [
      intentId,
      'usd', // remote currency
      1000,
      1000,
      0,
      0,
      certifiedAt,
      'provider_evt_1',
      true,
      'parent_pack',
      null,
    ]
  );
  return res.rows[0].result;
}

describe('Parent Pack J‑30 and webhook scenarios', () => {
  it('Checkout at J‑31 should be rejected', async () => {
    const subId = randomUUID();
    const studentId = randomUUID();
    await client.query('INSERT INTO public.global_students (student_global_id) VALUES ($1)', [studentId]);
await client.query(`INSERT INTO public.parent_subscriptions (id, school_slug, student_global_id, student_ref, parent_ref, pricing_id, billing_anchor_date, cumulative_months, status) VALUES ($1, $2, $3, $4, $5, $6, now()::date, 12, 'active')`, [subId, 'school', studentId, studentId, 'father', randomUUID()]);
    await client.query(`INSERT INTO public.parent_subscription_periods (subscription_id, start_date, end_date, status)
      VALUES ($1, now() - interval '40 days', now() + interval '20 days', 'active')`, [subId]);

    await assert.rejects(
      async () => {
 await checkout({
   p_parent_ref: 'father',
   p_student_local_id: studentId,
   p_school_slug: 'school',
   p_pricing_id: globalPricingId,
   p_duration_months: 1,
 });
      },
      /J-31_RENEWAL_TOO_EARLY/
    );
  });

  it('Checkout at J‑30 should be accepted', async () => {
    const subId = randomUUID();
    const studentId = randomUUID();
    const pricingId = randomUUID();
// Use shared pricing record
await client.query('INSERT INTO public.global_students (student_global_id) VALUES ($1)', [studentId]);
await client.query(`INSERT INTO public.parent_subscriptions (id, school_slug, student_global_id, student_ref, parent_ref, pricing_id, billing_anchor_date, cumulative_months, status) VALUES ($1, $2, $3, $4, $5, $6, now()::date, 12, 'active')`, [subId, 'school', studentId, studentId, 'father', pricingId]);
    await client.query(`INSERT INTO public.parent_subscription_periods (subscription_id, start_date, end_date, status)
      VALUES ($1, now() - interval '35 days', now() + interval '25 days', 'active')`, [subId]);

    const result = await checkout({
      p_parent_ref: 'father',
      p_student_local_id: studentId,
      p_school_slug: 'school',
      p_pricing_id: globalPricingId,
      p_duration_months: 1,
    });
    assert.ok(result && result.payment_intent_id, 'result should have payment_intent_id');
  });

  it('Webhook received after old coverage expiration respects stored J‑30 deadline', async () => {
    const subId = randomUUID();
    const studentId = randomUUID();
    const pricingId = randomUUID();
// Use shared pricing record
await client.query('INSERT INTO public.global_students (student_global_id) VALUES ($1)', [studentId]);
await client.query(`INSERT INTO public.parent_subscriptions (id, school_slug, student_global_id, student_ref, parent_ref, pricing_id, status) VALUES ($1, $2, $3, $4, $5, $6, 'active')`, [subId, 'school', studentId, studentId, 'father', globalPricingId]);
    const checkoutRes = await checkout({
      p_parent_ref: 'father',
      p_student_local_id: studentId,
      p_school_slug: 'school',
      p_pricing_id: globalPricingId,
      p_duration_months: 1,
    });
    const intentId = checkoutRes.payment_intent_id;
    const futureDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
    const webhookRes = await processWebhook(intentId, futureDate);
    assert.strictEqual(webhookRes.status, 'completed');
  });

  it('Webhook processed twice is idempotent', async () => {
    const subId = randomUUID();
    const studentId = randomUUID();
    const pricingId = randomUUID();
// Use shared pricing record
await client.query('INSERT INTO public.global_students (student_global_id) VALUES ($1)', [studentId]);
await client.query(`INSERT INTO public.parent_subscriptions (id, school_slug, student_global_id, student_ref, parent_ref, pricing_id, status) VALUES ($1, $2, $3, $4, $5, $6, 'active')`, [subId, 'school', studentId, studentId, 'father', globalPricingId]);
    const checkoutRes = await checkout({
      p_parent_ref: 'father',
      p_student_local_id: studentId,
      p_school_slug: 'school',
      p_pricing_id: globalPricingId,
      p_duration_months: 1,
    });
    const intentId = checkoutRes.payment_intent_id;
    const now = new Date();
    const first = await processWebhook(intentId, now);
    const second = await processWebhook(intentId, now);
    assert.strictEqual(first.status, 'completed');
    assert.strictEqual(second.status, 'duplicate');
  });

  it('Father then mother payers keep distinct parent_ref in intentions', async () => {
    const subId = randomUUID();
    const studentId = randomUUID();
    const pricingId = randomUUID();
// Use shared pricing record
await client.query('INSERT INTO public.global_students (student_global_id) VALUES ($1)', [studentId]);
await client.query(`INSERT INTO public.parent_subscriptions (id, school_slug, student_global_id, student_ref, parent_ref, pricing_id, status) VALUES ($1, $2, $3, $4, $5, $6, 'active')`, [subId, 'school', studentId, studentId, 'father', globalPricingId]);
    const fRes = await checkout({
      p_parent_ref: 'father',
      p_student_local_id: studentId,
      p_school_slug: 'school',
      p_pricing_id: globalPricingId,
      p_duration_months: 1,
    });
    const mRes = await checkout({
      p_parent_ref: 'mother',
      p_student_local_id: randomUUID(),
      p_school_slug: 'school',
      p_pricing_id: randomUUID(),
      p_duration_months: 1,
    });
    const fMeta = await client.query(`SELECT metadata FROM public.payment_intents WHERE id = $1`, [fRes.payment_intent_id]);
    const mMeta = await client.query(`SELECT metadata FROM public.payment_intents WHERE id = $1`, [mRes.payment_intent_id]);
    assert.strictEqual(fMeta.rows[0].metadata.parent_ref, 'father');
    assert.strictEqual(mMeta.rows[0].metadata.parent_ref, 'mother');
  });

  it('No second subscription created for same child', async () => {
    const subId = randomUUID();
    const studentId = randomUUID();
    const pricingId = randomUUID();
// Use shared pricing record
await client.query('INSERT INTO public.global_students (student_global_id) VALUES ($1)', [studentId]);
await client.query(`INSERT INTO public.parent_subscriptions (id, school_slug, student_global_id, student_ref, parent_ref, pricing_id, status) VALUES ($1, $2, $3, $4, $5, $6, 'active')`, [subId, 'school', studentId, studentId, 'father', globalPricingId]);
    const res = await checkout({
      p_parent_ref: 'mother',
      p_student_local_id: studentId,
      p_school_slug: 'school',
      p_pricing_id: globalPricingId,
      p_duration_months: 1,
    });
    const intentId = res.payment_intent_id;
    const intent = await client.query(`SELECT target_id FROM public.payment_intents WHERE id = $1`, [intentId]);
    assert.strictEqual(intent.rows[0].target_id, subId);
  });

  it('Only one unresolved intent exists per child', async () => {
    const subId = randomUUID();
    const studentId = randomUUID();
    const pricingId = randomUUID();
// Use shared pricing record
await client.query('INSERT INTO public.global_students (student_global_id) VALUES ($1)', [studentId]);
await client.query(`INSERT INTO public.parent_subscriptions (id, school_slug, student_global_id, student_ref, parent_ref, pricing_id, status) VALUES ($1, $2, $3, $4, $5, $6, 'active')`, [subId, 'school', studentId, studentId, 'father', globalPricingId]);
    await checkout({
      p_parent_ref: 'father',
      p_student_local_id: studentId,
      p_school_slug: 'school',
      p_pricing_id: globalPricingId,
      p_duration_months: 1,
    });
    await assert.rejects(
      async () => {
 await checkout({
   p_parent_ref: 'father',
   p_student_local_id: randomUUID(),
   p_school_slug: 'school',
   p_pricing_id: globalPricingId,
   p_duration_months: 1,
 });
      },
      /ACTIVE_INTENT_ALREADY_EXISTS/
    );
  });

  it('Missing J‑30 metadata handled gracefully (reconciliation)', async () => {
    const subId = randomUUID();
    const missingStudentId = randomUUID();
    const pricingId = randomUUID();
// Use shared pricing record
await client.query('INSERT INTO public.global_students (student_global_id) VALUES ($1)', [missingStudentId]);
await client.query(`INSERT INTO public.parent_subscriptions (id, school_slug, student_global_id, student_ref, parent_ref, pricing_id, status) VALUES ($1, $2, $3, $4, $5, $6, 'active')`, [subId, 'school', missingStudentId, missingStudentId, 'father', globalPricingId]);
    const intentRes = await client.query(
      `INSERT INTO public.payment_intents (target_id, expected_amount, expected_currency, status, payment_type, school_slug, plan_type, metadata, expires_at)
VALUES ($1, 1000, 'usd', 'initializing', 'parent_pack', 'school', NULL, jsonb_build_object('pricing_id', $2, 'duration_months', 1, 'student_ref', $3, 'parent_ref', 'father'), now() + interval '1 hour') RETURNING id`,
      [subId, randomUUID(), missingStudentId]
    );
    const intentId = intentRes.rows[0].id;
    const webhookRes = await processWebhook(intentId, new Date());
    assert.strictEqual(webhookRes.status, 'completed');
  });
});
