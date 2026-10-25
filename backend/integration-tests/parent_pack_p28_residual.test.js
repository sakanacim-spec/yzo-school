// backend/integration-tests/parent_pack_p28_residual.test.js
/**
 * Complementary tests for migration P28.
 * Scenarios:
 * 1. Two parents linked to same student_global_id with distinct parent_ref.
 * 2. First checkout creates an inactive subscription, second checkout changes school_slug, student_ref, pricing_id.
 * 3. Verify final values of parent_ref, student_ref, school_slug, pricing_id.
 * 4. Same scenario when subscription already active – values must stay unchanged.
 * 5. Rejected checkout leaves no persistent changes.
 * 6. Payment intent integrity (target_id, metadata, amount).
 * 7. Concurrent checkouts on same child with two independent DB connections.
 * 8. Verify function execution rights (SECURITY INVOKER) via role inspection.
 */
const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('assert');
const pg = require('pg');
const { randomUUID } = require('crypto');

const { Client } = pg;
let client;
let globalPricingId;

// Ensure each test runs inside a transaction that is rolled back afterwards
beforeEach(async () => {
  await client.query('BEGIN');
});
afterEach(async () => {
  await client.query('ROLLBACK');
});

before(async () => {
  const connStr = process.env.DATABASE_URL;
  if (!connStr) throw new Error('DATABASE_URL not set');
  client = new Client({ connectionString: connStr });
  await client.connect();
  const pricingRes = await client.query(
    `SELECT id FROM public.parent_pack_pricing WHERE cycle_name = 'maternelle_primaire' AND currency = 'XOF' AND pricing_version = 1 LIMIT 1`
  );
  if (pricingRes.rows.length === 0) throw new Error('Required pricing record not found');
  globalPricingId = pricingRes.rows[0].id;
});

after(async () => {
  if (client) await client.end();
});

async function checkout(params) {
  const { p_parent_ref, p_student_local_id, p_school_slug, p_pricing_id, p_duration_months = 1, p_cycle_name = 'maternelle_primaire' } = params;
  const studentGlobalId = params.p_student_global_id || p_student_local_id;
  await client.query(`INSERT INTO public.global_students (student_global_id) VALUES ($1) ON CONFLICT DO NOTHING`, [studentGlobalId]);
  await client.query(`INSERT INTO public.parent_child_links (parent_ref, student_global_id, current_link_active) VALUES ($1, $2, true) ON CONFLICT (parent_ref, student_global_id) DO UPDATE SET current_link_active = true`, [p_parent_ref, studentGlobalId]);

  // Use a SAVEPOINT to protect transaction from abortion if checkout intentionally fails
  const savepointName = 'sp_' + randomUUID().replace(/-/g, '_');
  await client.query(`SAVEPOINT ${savepointName}`);
  try {
    const res = await client.query(
      `SELECT * FROM public.prepare_parent_pack_checkout($1::text, $2::uuid, $3::text, $4::text, $5::uuid, $6::text, $7::integer) AS result`,
      [p_parent_ref, studentGlobalId, p_school_slug, p_student_local_id, p_pricing_id, p_cycle_name, p_duration_months]
    );
    await client.query(`RELEASE SAVEPOINT ${savepointName}`);
    return res.rows[0].result;
  } catch (err) {
    await client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
    throw err;
  }
}

async function fetchSubscription(studentGlobalId) {
  const res = await client.query(`SELECT * FROM public.parent_subscriptions WHERE student_global_id = $1`, [studentGlobalId]);
  return res.rows[0];
}

async function fetchIntent(subscriptionId) {
  const res = await client.query(`SELECT * FROM public.payment_intents WHERE target_id = $1::text ORDER BY created_at DESC LIMIT 1`, [subscriptionId]);
  return res.rows[0];
}

describe('P28 residual risk tests', () => {
  it('Scenario 1 & 2: two parents, second checkout is rejected when initializing intent exists (ACTIVE_INTENT_ALREADY_EXISTS)', async () => {
    const studentId = randomUUID();
    const fatherRes = await checkout({ p_parent_ref: 'father', p_student_local_id: studentId, p_school_slug: 'school_a', p_pricing_id: globalPricingId });
    const subBefore = await fetchSubscription(studentId);
    assert.strictEqual(subBefore.parent_ref, 'father');
    assert.strictEqual(subBefore.school_slug, 'school_a');
    assert.strictEqual(subBefore.pricing_id, globalPricingId);
    // Second checkout must be rejected with ACTIVE_INTENT_ALREADY_EXISTS
    await assert.rejects(async () => {
      await checkout({ p_parent_ref: 'mother', p_student_local_id: studentId, p_school_slug: 'school_b', p_pricing_id: globalPricingId });
    }, /ACTIVE_INTENT_ALREADY_EXISTS/);
    const subAfter = await fetchSubscription(studentId);
    // Verify that nothing was overwritten
    assert.strictEqual(subAfter.parent_ref, 'father', 'parent_ref must stay unchanged');
    assert.strictEqual(subAfter.school_slug, 'school_a', 'school_slug must stay unchanged');
    assert.strictEqual(subAfter.pricing_id, globalPricingId);
    assert.strictEqual(subAfter.student_ref, studentId);
  });

  it('Scenario 4: second checkout does NOT modify fields when subscription already active', async () => {
    const studentId = randomUUID();
    const first = await checkout({ p_parent_ref: 'father', p_student_local_id: studentId, p_school_slug: 'school_x', p_pricing_id: globalPricingId });
    const subId = first.subscription_id;
    const intentId = first.payment_intent_id;
    await client.query(`INSERT INTO public.payment_intents (id, target_id, expected_amount, expected_currency, status, payment_type, school_slug, plan_type, metadata, expires_at, processed_at) VALUES ($1, $2, 100, 'XOF', 'completed', 'parent_pack', 'school_x', NULL, '{}'::jsonb, now() + interval '1 hour', now())`, [randomUUID(), subId]);
    await client.query(`INSERT INTO public.parent_subscription_periods (subscription_id, payment_intent_id, start_date, end_date, status) VALUES ($1, $2, now() - interval '5 days', now() + interval '25 days', 'active')`, [subId, intentId]);
    await assert.rejects(async () => {
      await checkout({ p_parent_ref: 'mother', p_student_local_id: studentId, p_school_slug: 'school_y', p_pricing_id: globalPricingId });
    }, /ACTIVE_INTENT_ALREADY_EXISTS/);
    const subAfter = await fetchSubscription(studentId);
    // Verify that nothing changed
    assert.strictEqual(subAfter.parent_ref, 'father');
    assert.strictEqual(subAfter.school_slug, 'school_x');
    assert.strictEqual(subAfter.pricing_id, globalPricingId);
    assert.strictEqual(subAfter.student_ref, studentId);
  });

  it('Scenario 5: rejected checkout leaves no persistent changes', async () => {
    const studentId = randomUUID();
    const subId = randomUUID();
    // Pre-insert parent student record to satisfy foreign key fk_parent_subs_global_student
    await client.query(`INSERT INTO public.global_students (student_global_id) VALUES ($1)`, [studentId]);
    await client.query(`INSERT INTO public.parent_child_links (parent_ref, student_global_id, current_link_active) VALUES ($1, $2, true)`, ['father', studentId]);
    await client.query(`INSERT INTO public.parent_subscriptions (id, school_slug, student_global_id, student_ref, parent_ref, pricing_id, status) VALUES ($1, $2, $3, $4, $5, $6, 'active')`, [subId, 'school_z', studentId, studentId, 'father', globalPricingId]);
    const periodIntentId = randomUUID();
    await client.query(`INSERT INTO public.payment_intents (id, target_id, expected_amount, expected_currency, status, payment_type, school_slug, plan_type, metadata, expires_at, processed_at) VALUES ($1, $2, 100, 'XOF', 'completed', 'parent_pack', 'school_z', NULL, '{}'::jsonb, now() + interval '1 hour', now())`, [periodIntentId, subId]);
    await client.query(`INSERT INTO public.parent_subscription_periods (subscription_id, payment_intent_id, start_date, end_date, status) VALUES ($1, $2, now() - interval '10 days', now() + interval '40 days', 'active')`, [subId, periodIntentId]);
    await assert.rejects(async () => {
      await checkout({ p_parent_ref: 'father', p_student_local_id: studentId, p_school_slug: 'school_z', p_pricing_id: globalPricingId });
    }, /RENEWAL_TOO_EARLY/);
    const sub = await fetchSubscription(studentId);
    assert.strictEqual(sub.school_slug, 'school_z');
    // Ensure that no new intent was created beyond the pre-existing one
    const intentRes = await client.query(`SELECT COUNT(*) AS cnt FROM public.payment_intents WHERE target_id = $1::text AND id <> $2`, [subId, periodIntentId]);
    assert.strictEqual(parseInt(intentRes.rows[0].cnt), 0, 'No new intent should be created');
  });

  it('Scenario 6: payment_intent integrity', async () => {
    const studentId = randomUUID();
    const res = await checkout({ p_parent_ref: 'father', p_student_local_id: studentId, p_school_slug: 'school_int', p_pricing_id: globalPricingId });
    const intent = await fetchIntent(res.subscription_id);
    assert.ok(intent);
    assert.strictEqual(intent.target_id, res.subscription_id.toString());
    // school_slug is a top-level column on public.payment_intents
    assert.strictEqual(intent.school_slug, 'school_int');
    const meta = intent.metadata;
    assert.strictEqual(meta.parent_ref, 'father');
    assert.strictEqual(meta.pricing_id, globalPricingId);
    const pricing = await client.query(`SELECT monthly_price_minor FROM public.parent_pack_pricing WHERE id = $1`, [globalPricingId]);
    assert.strictEqual(intent.expected_amount, pricing.rows[0].monthly_price_minor);
  });

  it('Scenario 7: concurrent checkouts on same child', async () => {
    const studentId = randomUUID();
    const clientA = new Client({ connectionString: process.env.DATABASE_URL });
    const clientB = new Client({ connectionString: process.env.DATABASE_URL });
    await clientA.connect();
    await clientB.connect();
    async function checkoutWithClient(cl, params) {
      const { p_parent_ref, p_student_local_id, p_school_slug, p_pricing_id, p_duration_months = 1, p_cycle_name = 'maternelle_primaire' } = params;
      const studentGlobalId = params.p_student_global_id || p_student_local_id;
      await cl.query(`INSERT INTO public.global_students (student_global_id) VALUES ($1) ON CONFLICT DO NOTHING`, [studentGlobalId]);
      await cl.query(`INSERT INTO public.parent_child_links (parent_ref, student_global_id, current_link_active) VALUES ($1, $2, true) ON CONFLICT (parent_ref, student_global_id) DO UPDATE SET current_link_active = true`, [p_parent_ref, studentGlobalId]);
      const res = await cl.query(`SELECT * FROM public.prepare_parent_pack_checkout($1::text, $2::uuid, $3::text, $4::text, $5::uuid, $6::text, $7::integer) AS result`, [p_parent_ref, studentGlobalId, p_school_slug, p_student_local_id, p_pricing_id, p_cycle_name, p_duration_months]);
      return res.rows[0].result;
    }
    try {
      const results = await Promise.allSettled([
        checkoutWithClient(clientA, { p_parent_ref: 'father', p_student_local_id: studentId, p_school_slug: 'school_con_a', p_pricing_id: globalPricingId }),
        checkoutWithClient(clientB, { p_parent_ref: 'mother', p_student_local_id: studentId, p_school_slug: 'school_con_b', p_pricing_id: globalPricingId })
      ]);
      // Separate logging of individual outcomes without masking errors
      console.log('Concurrent checkout A status:', results[0].status, results[0].status === 'rejected' ? results[0].reason?.message : 'fulfilled');
      console.log('Concurrent checkout B status:', results[1].status, results[1].status === 'rejected' ? results[1].reason?.message : 'fulfilled');

      // At least one must succeed; if one was rejected due to ACTIVE_INTENT_ALREADY_EXISTS, that is valid concurrency control
      const succeeded = results.filter(r => r.status === 'fulfilled');
      assert.ok(succeeded.length >= 1, 'At least one checkout must succeed');
      const finalSub = await fetchSubscription(studentId);
      assert.ok(finalSub, 'A single subscription record must exist');
      const possibleParents = ['father', 'mother'];
      assert.ok(possibleParents.includes(finalSub.parent_ref), 'parent_ref must be either father or mother');
      const allowedSchools = ['school_con_a', 'school_con_b'];
      assert.ok(allowedSchools.includes(finalSub.school_slug), 'school_slug must be one of the submitted values');
    } finally {
      // Reliable cleanup honoring referential integrity constraints
      try {
        await client.query(`DELETE FROM public.payment_intents WHERE target_id IN (SELECT id::text FROM public.parent_subscriptions WHERE student_global_id = $1)`, [studentId]);
        await client.query(`DELETE FROM public.parent_subscriptions WHERE student_global_id = $1`, [studentId]);
        await client.query(`DELETE FROM public.parent_child_links WHERE student_global_id = $1`, [studentId]);
        await client.query(`DELETE FROM public.global_students WHERE student_global_id = $1`, [studentId]);
      } catch (cleanErr) {
        // Log cleanup warning if needed without masking test result
      }
      await clientA.end();
      await clientB.end();
    }
  });

  it('Scenario 8: verify SECURITY INVOKER and role permissions (read‑only check)', async () => {
    const res = await client.query(`SELECT NOT prosecdef AS is_security_invoker FROM pg_proc WHERE proname = 'prepare_parent_pack_checkout'`);
    const row = res.rows[0];
    assert.ok(row.is_security_invoker, 'Function should run with SECURITY INVOKER (default)');
    const execRes = await client.query(`SELECT has_function_privilege('service_role', 'public.prepare_parent_pack_checkout(text,uuid,text,text,uuid,text,integer)', 'EXECUTE')`);
    assert.strictEqual(execRes.rows[0].has_function_privilege, true, 'service_role must have EXECUTE privilege');
  });
});
