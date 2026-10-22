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
  if (client) {
    await client.end();
  }
});

/** Helper to invoke the checkout SQL function */
async function checkout(params) {
  const {
    p_parent_ref,
    p_student_local_id,
    p_school_slug,
    p_pricing_id,
    p_duration_months,
    p_cycle_name = 'maternelle_primaire',
  } = params;
  const studentGlobalId = params.p_student_global_id || p_student_local_id;

  // Assurer la présence de l'élève global et du lien parent-enfant actif (pré-requis P24/P27)
  await client.query(
    `INSERT INTO public.global_students (student_global_id) VALUES ($1) ON CONFLICT DO NOTHING`,
    [studentGlobalId]
  );
  await client.query(
    `INSERT INTO public.parent_child_links (parent_ref, student_global_id, current_link_active)
     VALUES ($1, $2, true)
     ON CONFLICT (parent_ref, student_global_id) DO UPDATE SET current_link_active = true`,
    [p_parent_ref, studentGlobalId]
  );

  const res = await client.query(
    `SELECT * FROM public.prepare_parent_pack_checkout(
      $1::text, $2::uuid, $3::text, $4::text, $5::uuid, $6::text, $7::integer
    ) AS result`,
    [
      p_parent_ref,
      studentGlobalId,
      p_school_slug,
      p_student_local_id,
      p_pricing_id,
      p_cycle_name,
      p_duration_months,
    ]
  );
  return res.rows[0].result;
}

/** Helper to invoke the webhook processing function */
async function processWebhook(intentId, certifiedAt, providerEvtId = 'provider_evt_' + randomUUID()) {
  const intentRes = await client.query('SELECT expected_amount FROM public.payment_intents WHERE id = $1', [intentId]);
  const amount = intentRes.rows[0] ? Number(intentRes.rows[0].expected_amount) : 100;

  const res = await client.query(
    `SELECT * FROM public.process_parent_pack_webhook_event(
      $1::varchar,
      $2::varchar,
      $3::varchar,
      $4::uuid,
      $5::text,
      $6::numeric,
      $7::text,
      $8::text,
      $9::timestamptz,
      $10::numeric,
      $11::numeric,
      $12::boolean
    ) AS result`,
    [
      'fedapay',
      providerEvtId,
      'transaction.approved',
      intentId,
      'tx_' + randomUUID(),
      amount,
      'XOF',
      'approved',
      certifiedAt,
      0,
      0,
      true,
    ]
  );
  return res.rows[0].result;
}

describe('Parent Pack J‑30 and webhook scenarios', () => {
  it('Checkout at J‑31 should be rejected', async () => {
    const subId = randomUUID();
    const studentId = randomUUID();
    const piId = randomUUID();
    await client.query('INSERT INTO public.global_students (student_global_id) VALUES ($1)', [studentId]);
    await client.query(
      `INSERT INTO public.parent_subscriptions (id, school_slug, student_global_id, student_ref, parent_ref, pricing_id, billing_anchor_date, cumulative_months, status)
       VALUES ($1, $2, $3, $4, $5, $6, now()::date, 12, 'active')`,
      [subId, 'school', studentId, studentId, 'father', globalPricingId]
    );
    await client.query(
      `INSERT INTO public.payment_intents (id, target_id, expected_amount, expected_currency, status, payment_type, school_slug, plan_type, metadata, expires_at, processed_at)
       VALUES ($1, $2, 100, 'XOF', 'completed', 'parent_pack', 'school', NULL, '{}'::jsonb, now() + interval '1 hour', now())`,
      [piId, subId]
    );
    await client.query(
      `INSERT INTO public.parent_subscription_periods (subscription_id, payment_intent_id, start_date, end_date, status)
       VALUES ($1, $2, now() - interval '40 days', now() + interval '40 days', 'active')`,
      [subId, piId]
    );

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
      /RENEWAL_TOO_EARLY/
    );
  });

  it('Checkout at J‑30 should be accepted', async () => {
    const subId = randomUUID();
    const studentId = randomUUID();
    const piId = randomUUID();
    await client.query('INSERT INTO public.global_students (student_global_id) VALUES ($1)', [studentId]);
    await client.query(
      `INSERT INTO public.parent_subscriptions (id, school_slug, student_global_id, student_ref, parent_ref, pricing_id, billing_anchor_date, cumulative_months, status)
       VALUES ($1, $2, $3, $4, $5, $6, now()::date, 12, 'active')`,
      [subId, 'school', studentId, studentId, 'father', globalPricingId]
    );
    await client.query(
      `INSERT INTO public.payment_intents (id, target_id, expected_amount, expected_currency, status, payment_type, school_slug, plan_type, metadata, expires_at, processed_at)
       VALUES ($1, $2, 100, 'XOF', 'completed', 'parent_pack', 'school', NULL, '{}'::jsonb, now() + interval '1 hour', now())`,
      [piId, subId]
    );
    await client.query(
      `INSERT INTO public.parent_subscription_periods (subscription_id, payment_intent_id, start_date, end_date, status)
       VALUES ($1, $2, now() - interval '35 days', now() + interval '25 days', 'active')`,
      [subId, piId]
    );

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
    await client.query('INSERT INTO public.global_students (student_global_id) VALUES ($1)', [studentId]);
    await client.query(
      `INSERT INTO public.parent_subscriptions (id, school_slug, student_global_id, student_ref, parent_ref, pricing_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'active')`,
      [subId, 'school', studentId, studentId, 'father', globalPricingId]
    );
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
    // Verify coverage date respects J‑30 rule
    const period = await client.query(
      `SELECT max(end_date) AS max_end FROM public.parent_subscription_periods WHERE subscription_id = $1`,
      [subId]
    );
    const maxEnd = period.rows[0].max_end;
    const expectedDeadline = new Date(maxEnd);
    expectedDeadline.setDate(expectedDeadline.getDate() - 30);
    assert.ok(futureDate >= expectedDeadline, 'Webhook date respects J‑30 deadline');
  });

  it('Webhook processed twice is idempotent', async () => {
    const subId = randomUUID();
    const studentId = randomUUID();
    await client.query('INSERT INTO public.global_students (student_global_id) VALUES ($1)', [studentId]);
    await client.query(
      `INSERT INTO public.parent_subscriptions (id, school_slug, student_global_id, student_ref, parent_ref, pricing_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'active')`,
      [subId, 'school', studentId, studentId, 'father', globalPricingId]
    );
    const checkoutRes = await checkout({
      p_parent_ref: 'father',
      p_student_local_id: studentId,
      p_school_slug: 'school',
      p_pricing_id: globalPricingId,
      p_duration_months: 1,
    });
    const intentId = checkoutRes.payment_intent_id;
    // Capture state after first webhook (should have created one period)
    const now = new Date();
    const evtId = 'evt_idemp_' + randomUUID();
    const first = await processWebhook(intentId, now, evtId);
    assert.strictEqual(first.status, 'completed');

    // Capture state after first webhook
    const periodsAfterFirst = await client.query(
      `SELECT COUNT(*) AS cnt, max(end_date) AS max_end FROM public.parent_subscription_periods WHERE subscription_id = $1`,
      [subId]
    );

    // Run duplicate webhook with same event id
    const second = await processWebhook(intentId, now, evtId);
    assert.strictEqual(second.status, 'duplicate');

    // Capture state after second webhook
    const periodsAfterSecond = await client.query(
      `SELECT COUNT(*) AS cnt, max(end_date) AS max_end FROM public.parent_subscription_periods WHERE subscription_id = $1`,
      [subId]
    );

    // Verify no new period created and dates unchanged
    assert.strictEqual(parseInt(periodsAfterSecond.rows[0].cnt), parseInt(periodsAfterFirst.rows[0].cnt), 'Idempotent webhook must not create additional periods');
    assert.deepStrictEqual(periodsAfterSecond.rows[0].max_end, periodsAfterFirst.rows[0].max_end, 'Coverage end date must remain unchanged');
  });

  it('Father then mother payers keep distinct parent_ref in intentions', async () => {
    const subId = randomUUID();
    const studentId = randomUUID();
    await client.query('INSERT INTO public.global_students (student_global_id) VALUES ($1)', [studentId]);
    await client.query(
      `INSERT INTO public.parent_subscriptions (id, school_slug, student_global_id, student_ref, parent_ref, pricing_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'active')`,
      [subId, 'school', studentId, studentId, 'father', globalPricingId]
    );
    // Father checkout
    const fRes = await checkout({
      p_parent_ref: 'father',
      p_student_local_id: studentId,
      p_school_slug: 'school',
      p_pricing_id: globalPricingId,
      p_duration_months: 1,
    });
    // Simulate payment finalization for father
    await processWebhook(fRes.payment_intent_id, new Date());

    // Mother checkout using same studentId
    const mRes = await checkout({
      p_parent_ref: 'mother',
      p_student_local_id: studentId,
      p_school_slug: 'school',
      p_pricing_id: globalPricingId,
      p_duration_months: 1,
    });
    const fMeta = await client.query(`SELECT metadata FROM public.payment_intents WHERE id = $1`, [fRes.payment_intent_id]);
    const mMeta = await client.query(`SELECT metadata FROM public.payment_intents WHERE id = $1`, [mRes.payment_intent_id]);
    assert.strictEqual(fMeta.rows[0].metadata.parent_ref, 'father');
    assert.strictEqual(mMeta.rows[0].metadata.parent_ref, 'mother');
    // Both intentions should point to the same subscription
    const fTarget = await client.query(`SELECT target_id FROM public.payment_intents WHERE id = $1`, [fRes.payment_intent_id]);
    const mTarget = await client.query(`SELECT target_id FROM public.payment_intents WHERE id = $1`, [mRes.payment_intent_id]);
    assert.strictEqual(fTarget.rows[0].target_id, subId);
    assert.strictEqual(mTarget.rows[0].target_id, subId);
  });

  it('No second subscription created for same child', async () => {
    const subId = randomUUID();
    const studentId = randomUUID();
    await client.query('INSERT INTO public.global_students (student_global_id) VALUES ($1)', [studentId]);
    await client.query(
      `INSERT INTO public.parent_subscriptions (id, school_slug, student_global_id, student_ref, parent_ref, pricing_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'active')`,
      [subId, 'school', studentId, studentId, 'father', globalPricingId]
    );
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
    // Verify exactly one subscription exists for the child
    const subCount = await client.query(`SELECT COUNT(*) AS cnt FROM public.parent_subscriptions WHERE student_global_id = $1`, [studentId]);
    assert.strictEqual(parseInt(subCount.rows[0].cnt), 1, 'Exactly one subscription should exist for the child');
  });

  it('Only one unresolved intent exists per child', async () => {
    const subId = randomUUID();
    const studentId = randomUUID();
    await client.query('INSERT INTO public.global_students (student_global_id) VALUES ($1)', [studentId]);
    await client.query(
      `INSERT INTO public.parent_subscriptions (id, school_slug, student_global_id, student_ref, parent_ref, pricing_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'active')`,
      [subId, 'school', studentId, studentId, 'father', globalPricingId]
    );
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
          p_student_local_id: studentId,
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
    await client.query('INSERT INTO public.global_students (student_global_id) VALUES ($1)', [missingStudentId]);
    await client.query(
      `INSERT INTO public.parent_subscriptions (id, school_slug, student_global_id, student_ref, parent_ref, pricing_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'active')`,
      [subId, 'school', missingStudentId, missingStudentId, 'father', globalPricingId]
    );
    const intentRes = await client.query(
      `INSERT INTO public.payment_intents (target_id, expected_amount, expected_currency, status, payment_type, school_slug, plan_type, metadata, expires_at)
       VALUES ($1, 100, 'XOF', 'initializing', 'parent_pack', 'school', NULL, jsonb_build_object('pricing_id', $2::text, 'duration_months', '1', 'student_ref', $3::text, 'parent_ref', 'father'), now() + interval '1 hour')
       RETURNING id`,
      [subId, globalPricingId, missingStudentId]
    );
    const intentId = intentRes.rows[0].id;
    const webhookRes = await processWebhook(intentId, new Date());
    assert.strictEqual(webhookRes.status, 'completed');
  });
});
