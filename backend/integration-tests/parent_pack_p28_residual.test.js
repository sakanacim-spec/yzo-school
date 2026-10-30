// backend/integration-tests/parent_pack_p28_residual.test.js
/**
 * Integration & residual risk tests for migrations P28 and P28b.
 *
 * Architecture & Safety Requirements (P28b):
 * - NEVER loads or executes a migration file containing BEGIN/COMMIT inside the test runner.
 *   Migrations must be applied beforehand on a disposable local test database.
 * - Requires explicit DATABASE_URL and P28B_ALLOW_DISPOSABLE_DB=true.
 * - Strictly allows ONLY host 127.0.0.1, port 55428, and an explicitly authorized disposable
 *   database (default: yziow_p28b_disposable_test, or P28B_DISPOSABLE_DB_NAME matching
 *   /^yziow_p28b_disposable_test(_[a-z0-9_]+)?$/).
 * - Always rejects yziow_p28_restore_20261027, postgres, template0, template1,
 *   yziow_production, and any Supabase connection.
 * - Logs non-sensitive connection parameters (Host, Port, Database, User) without password.
 * - Wraps each test in BEGIN / ROLLBACK and uses SAVEPOINT around expected SQL failures.
 *
 * Scenarios covered:
 * 1 & 2. Two parents linked to same student_global_id; second checkout rejected when initializing intent exists (ACTIVE_INTENT_ALREADY_EXISTS).
 * 3. Inactive subscription after cancelled/expired intent: same-school renewal preserves parent_ref; different school without transfer fails (SCHOOL_MISMATCH_WITHOUT_VALIDATED_TRANSFER).
 * 4. Active or expired subscription with paid history: unpaid checkout never overwrites historical parent_ref, school_slug, student_ref, or pricing_id.
 * 5. Rejected checkout (RENEWAL_TOO_EARLY) leaves no persistent changes and creates no new payment_intent.
 * 6. Payment intent integrity & trg_protect_parent_pack_intent (blocks financial/metadata mutation or deletion on completed/linked intent; allows harmless non-financial touch).
 * 7. Concurrent checkouts on same child with two independent DB connections.
 * 8. Verify function security attributes (SECURITY INVOKER / DEFINER) and EXECUTE privileges (service_role only).
 * 9. Multi-parent access & revocation via get_active_parent_pack_subscriptions (father, mother, revoked mother, revoked initial subscriber father, unknown parent, unlinked child, expired period).
 * 10. Multi-school official transfer (parent_student_identity_transfers + student_global_mappings) and webhook commission routing (20% school, 10% ambassador of remainder).
 * 11. Refund fail-closed security (blocks transition to 'refunded' via ordinary SQL both without and with a valid P19 'cancellation' row in school_commission_ledger).
 */
const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('assert');
const pg = require('pg');
const { randomUUID } = require('crypto');

const { Client } = pg;
let client;
let validatedConnStr;
let globalPricingId;
let globalMonthlyPriceMinor;

function validateAndParseDisposableDbUrl() {
  const connStr = process.env.DATABASE_URL;
  if (!connStr) {
    throw new Error('FAIL CLOSED: DATABASE_URL must be explicitly set (no automatic fallback allowed).');
  }
  if (process.env.P28B_ALLOW_DISPOSABLE_DB !== 'true') {
    throw new Error('FAIL CLOSED: P28B_ALLOW_DISPOSABLE_DB=true is required to run P28b integration tests on a disposable local database.');
  }
  if (connStr.toLowerCase().includes('supabase')) {
    throw new Error('FAIL CLOSED: Supabase connections are strictly forbidden in P28b tests.');
  }

  let parsed;
  try {
    parsed = new URL(connStr);
  } catch (_err) {
    throw new Error('FAIL CLOSED: DATABASE_URL is not a valid URL.');
  }

  if (parsed.hostname.toLowerCase().includes('supabase')) {
    throw new Error(`FAIL CLOSED: Refusing Supabase database host "${parsed.hostname}".`);
  }
  if (parsed.hostname !== '127.0.0.1') {
    throw new Error(`FAIL CLOSED: Refusing database host "${parsed.hostname}". Only 127.0.0.1 is permitted.`);
  }
  if (parsed.port !== '55428') {
    throw new Error(`FAIL CLOSED: Refusing database port "${parsed.port || '(default)'}". Only local cluster port 55428 is permitted.`);
  }

  const dbName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  const forbiddenDatabases = new Set([
    '',
    'yziow_p28_restore_20261027',
    'postgres',
    'template0',
    'template1',
    'yziow_production'
  ]);
  if (forbiddenDatabases.has(dbName)) {
    throw new Error(`FAIL CLOSED: Refusing to run tests against protected or reference database "${dbName}". Use a dedicated disposable local test database.`);
  }

  const authorizedDisposableDb = process.env.P28B_DISPOSABLE_DB_NAME || 'yziow_p28b_disposable_test';
  const disposableDbPattern = /^yziow_p28b_disposable_test(_[a-z0-9_]+)?$/;
  if (
    forbiddenDatabases.has(authorizedDisposableDb) ||
    !disposableDbPattern.test(authorizedDisposableDb) ||
    dbName !== authorizedDisposableDb
  ) {
    throw new Error(
      `FAIL CLOSED: Database "${dbName}" is not an explicitly authorized disposable test database (expected "${authorizedDisposableDb}" matching ${disposableDbPattern}).`
    );
  }

  console.log(
    `[P28b Test Runner] Target DB verified -> Host=${parsed.hostname} Port=${parsed.port} Database=${dbName} User=${decodeURIComponent(parsed.username || '')} DisposableConfirmed=${process.env.P28B_ALLOW_DISPOSABLE_DB}`
  );

  return connStr;
}

// Ensure each test runs inside a transaction that is rolled back afterwards
beforeEach(async () => {
  await client.query('BEGIN');
});

afterEach(async () => {
  await client.query('ROLLBACK');
});

before(async () => {
  validatedConnStr = validateAndParseDisposableDbUrl();
  client = new Client({ connectionString: validatedConnStr });
  await client.connect();
  const pricingRes = await client.query(
    `SELECT id, monthly_price_minor
     FROM public.parent_pack_pricing
     WHERE cycle_name = 'maternelle_primaire'
       AND currency = 'XOF'
       AND pricing_version = 1
       AND active = true
     LIMIT 1`
  );
  if (pricingRes.rows.length === 0) {
    throw new Error('Required pricing record not found in public.parent_pack_pricing (active = true)');
  }
  globalPricingId = pricingRes.rows[0].id;
  globalMonthlyPriceMinor = Number(pricingRes.rows[0].monthly_price_minor);
});

after(async () => {
  if (client) await client.end();
});

async function checkout(params) {
  const {
    p_parent_ref,
    p_student_local_id,
    p_school_slug,
    p_pricing_id = globalPricingId,
    p_duration_months = 1,
    p_cycle_name = 'maternelle_primaire'
  } = params;
  const studentGlobalId = params.p_student_global_id || p_student_local_id;

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

  // Use a SAVEPOINT to protect the outer test transaction if checkout intentionally fails
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

async function execExpectError(sql, params, expectedRegex) {
  const sp = 'sp_err_' + randomUUID().replace(/-/g, '_');
  await client.query(`SAVEPOINT ${sp}`);
  try {
    await client.query(sql, params);
    await client.query(`RELEASE SAVEPOINT ${sp}`);
    assert.fail(`Expected SQL error matching ${expectedRegex}, but query succeeded`);
  } catch (err) {
    await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
    if (err.code === 'ERR_ASSERTION') throw err;
    assert.match(err.message, expectedRegex);
  }
}

async function fetchSubscription(studentGlobalId) {
  const res = await client.query(
    `SELECT * FROM public.parent_subscriptions WHERE student_global_id = $1`,
    [studentGlobalId]
  );
  return res.rows[0];
}

async function fetchIntent(subscriptionId) {
  const res = await client.query(
    `SELECT * FROM public.payment_intents WHERE target_id = $1::text ORDER BY created_at DESC LIMIT 1`,
    [subscriptionId]
  );
  return res.rows[0];
}

describe('P28 & P28b residual risk and hardening tests', () => {
  it('Scenario 1 & 2: two parents, second checkout is rejected when initializing intent exists (ACTIVE_INTENT_ALREADY_EXISTS)', async () => {
    const studentId = randomUUID();
    await checkout({
      p_parent_ref: 'father',
      p_student_local_id: studentId,
      p_school_slug: 'school_a',
      p_pricing_id: globalPricingId
    });
    const subBefore = await fetchSubscription(studentId);
    assert.strictEqual(subBefore.parent_ref, 'father');
    assert.strictEqual(subBefore.school_slug, 'school_a');
    assert.strictEqual(subBefore.pricing_id, globalPricingId);

    // Second checkout must be rejected with ACTIVE_INTENT_ALREADY_EXISTS
    await assert.rejects(async () => {
      await checkout({
        p_parent_ref: 'mother',
        p_student_local_id: studentId,
        p_school_slug: 'school_b',
        p_pricing_id: globalPricingId
      });
    }, /ACTIVE_INTENT_ALREADY_EXISTS/);

    const subAfter = await fetchSubscription(studentId);
    assert.strictEqual(subAfter.parent_ref, 'father', 'parent_ref must stay unchanged');
    assert.strictEqual(subAfter.school_slug, 'school_a', 'school_slug must stay unchanged');
    assert.strictEqual(subAfter.pricing_id, globalPricingId);
    assert.strictEqual(subAfter.student_ref, studentId);
  });

  it('Scenario 3: inactive subscription after cancelled intent rejects school change without transfer and preserves parent_ref on same school', async () => {
    const studentId = randomUUID();
    const first = await checkout({
      p_parent_ref: 'father',
      p_student_local_id: 'loc_father_1',
      p_student_global_id: studentId,
      p_school_slug: 'school_a',
      p_pricing_id: globalPricingId
    });

    // Cancel the first intent so no active intent blocks checkout
    await client.query(
      `UPDATE public.payment_intents SET status = 'cancelled' WHERE id = $1`,
      [first.payment_intent_id]
    );

    // Mother attempts checkout on school_b without a validated transfer -> rejected
    await assert.rejects(async () => {
      await checkout({
        p_parent_ref: 'mother',
        p_student_local_id: 'loc_mother_b',
        p_student_global_id: studentId,
        p_school_slug: 'school_b',
        p_pricing_id: globalPricingId
      });
    }, /SCHOOL_MISMATCH_WITHOUT_VALIDATED_TRANSFER/);

    // Mother retries on official school_a -> succeeds, preserving initial parent_ref = 'father'
    const second = await checkout({
      p_parent_ref: 'mother',
      p_student_local_id: 'loc_father_1',
      p_student_global_id: studentId,
      p_school_slug: 'school_a',
      p_pricing_id: globalPricingId
    });
    assert.strictEqual(second.subscription_id, first.subscription_id);

    const subAfter = await fetchSubscription(studentId);
    assert.strictEqual(subAfter.parent_ref, 'father', 'historical parent_ref must remain father');
    assert.strictEqual(subAfter.school_slug, 'school_a');
  });

  it('Scenario 4: unpaid checkout NEVER overwrites historical fields when subscription is active or expired', async () => {
    const studentId = randomUUID();
    const first = await checkout({
      p_parent_ref: 'father',
      p_student_local_id: 'student_loc_x',
      p_student_global_id: studentId,
      p_school_slug: 'school_x',
      p_pricing_id: globalPricingId
    });
    const subId = first.subscription_id;
    const intentId = first.payment_intent_id;

    // Complete payment intent FIRST (P28b transactional requirement), then insert active period within J-30 window
    await client.query(
      `UPDATE public.payment_intents SET status = 'completed', processed_at = now(), provider_transaction_id = 'tx_scen4' WHERE id = $1`,
      [intentId]
    );
    await client.query(
      `INSERT INTO public.parent_subscription_periods (subscription_id, payment_intent_id, start_date, end_date, status)
       VALUES ($1, $2, (now() - interval '15 days')::date, (now() + interval '15 days')::date, 'active')`,
      [subId, intentId]
    );
    await client.query(
      `UPDATE public.parent_subscriptions SET status = 'active' WHERE id = $1`,
      [subId]
    );

    // Record a validated transfer to school_y so Mother can initiate an unpaid checkout within J-30
    await client.query(
      `INSERT INTO public.student_global_mappings (school_slug, student_local_id, student_global_id)
       VALUES ('school_y', 'student_loc_y', $1) ON CONFLICT DO NOTHING`,
      [studentId]
    );
    await client.query(
      `INSERT INTO public.parent_student_identity_transfers (parent_ref, student_global_id, destination_school_slug, destination_student_local_id, status)
       VALUES ('mother', $1, 'school_y', 'student_loc_y', 'completed')`,
      [studentId]
    );

    // Mother initiates an UNPAID renewal checkout on school_y
    await checkout({
      p_parent_ref: 'mother',
      p_student_local_id: 'student_loc_y',
      p_student_global_id: studentId,
      p_school_slug: 'school_y',
      p_pricing_id: globalPricingId
    });

    const subAfter = await fetchSubscription(studentId);
    // Historical fields on parent_subscriptions must remain untouched by an unpaid checkout
    assert.strictEqual(subAfter.parent_ref, 'father');
    assert.strictEqual(subAfter.school_slug, 'school_x');
    assert.strictEqual(subAfter.student_ref, 'student_loc_x');
    assert.strictEqual(subAfter.pricing_id, globalPricingId);
  });

  it('Scenario 5: rejected checkout (RENEWAL_TOO_EARLY) leaves no persistent changes', async () => {
    const studentId = randomUUID();
    const subId = randomUUID();
    await client.query(`INSERT INTO public.global_students (student_global_id) VALUES ($1)`, [studentId]);
    await client.query(
      `INSERT INTO public.parent_child_links (parent_ref, student_global_id, current_link_active) VALUES ($1, $2, true)`,
      ['father', studentId]
    );
    await client.query(
      `INSERT INTO public.parent_subscriptions (id, school_slug, student_global_id, student_ref, parent_ref, pricing_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'active')`,
      [subId, 'school_z', studentId, studentId, 'father', globalPricingId]
    );
    const periodIntentId = randomUUID();
    await client.query(
      `INSERT INTO public.payment_intents (id, target_id, expected_amount, expected_currency, status, payment_type, school_slug, plan_type, metadata, expires_at, processed_at)
       VALUES ($1, $2, $3, 'XOF', 'completed', 'parent_pack', 'school_z', NULL, '{}'::jsonb, now() + interval '1 hour', now())`,
      [periodIntentId, subId, globalMonthlyPriceMinor]
    );
    await client.query(
      `INSERT INTO public.parent_subscription_periods (subscription_id, payment_intent_id, start_date, end_date, status)
       VALUES ($1, $2, (now() - interval '10 days')::date, (now() + interval '40 days')::date, 'active')`,
      [subId, periodIntentId]
    );

    await assert.rejects(async () => {
      await checkout({
        p_parent_ref: 'father',
        p_student_local_id: studentId,
        p_school_slug: 'school_z',
        p_pricing_id: globalPricingId
      });
    }, /RENEWAL_TOO_EARLY/);

    const sub = await fetchSubscription(studentId);
    assert.strictEqual(sub.school_slug, 'school_z');
    const intentRes = await client.query(
      `SELECT COUNT(*) AS cnt FROM public.payment_intents WHERE target_id = $1::text AND id <> $2`,
      [subId, periodIntentId]
    );
    assert.strictEqual(parseInt(intentRes.rows[0].cnt, 10), 0, 'No new intent should be created');
  });

  it('Scenario 6: payment_intent integrity and trg_protect_parent_pack_intent protections', async () => {
    const studentId = randomUUID();
    const res = await checkout({
      p_parent_ref: 'father',
      p_student_local_id: studentId,
      p_school_slug: 'school_int',
      p_pricing_id: globalPricingId
    });
    const intent = await fetchIntent(res.subscription_id);
    assert.ok(intent);
    assert.strictEqual(intent.target_id, res.subscription_id.toString());
    assert.strictEqual(intent.school_slug, 'school_int');
    assert.strictEqual(intent.metadata.parent_ref, 'father');
    assert.strictEqual(intent.metadata.pricing_id, globalPricingId);
    assert.strictEqual(Number(intent.expected_amount), globalMonthlyPriceMinor);

    // Insert a pending_payment period linked to this initializing intent
    await client.query(
      `INSERT INTO public.parent_subscription_periods (subscription_id, payment_intent_id, start_date, end_date, status)
       VALUES ($1, $2, CURRENT_DATE, (CURRENT_DATE + interval '30 days')::date, 'pending_payment')`,
      [res.subscription_id, intent.id]
    );

    // Changing target_id or school_slug while linked to a pending_payment period must fail
    await execExpectError(
      `UPDATE public.payment_intents SET target_id = $1 WHERE id = $2`,
      [randomUUID(), intent.id],
      /FAIL CLOSED: Modification des champs financiers/
    );

    // Confirm payment intent and activate period
    await client.query(
      `UPDATE public.payment_intents SET status = 'completed', processed_at = now(), provider_transaction_id = 'tx_int_1' WHERE id = $1`,
      [intent.id]
    );
    await client.query(
      `UPDATE public.parent_subscription_periods SET status = 'active' WHERE payment_intent_id = $1`,
      [intent.id]
    );

    // Harmless non-financial update keeping status = 'completed' and unchanged metadata must succeed
    await client.query(
      `UPDATE public.payment_intents SET updated_at = clock_timestamp() WHERE id = $1`,
      [intent.id]
    );

    // Modifying metadata or downgrading status on completed intent must fail
    await execExpectError(
      `UPDATE public.payment_intents SET metadata = metadata || '{"provider_refund_id": "rf_1"}'::jsonb WHERE id = $1`,
      [intent.id],
      /FAIL CLOSED: Modification de metadata interdite/
    );
    await execExpectError(
      `UPDATE public.payment_intents SET status = 'cancelled', processed_at = NULL WHERE id = $1`,
      [intent.id],
      /FAIL CLOSED: Retrogradation ou changement de statut/
    );
    await execExpectError(
      `DELETE FROM public.payment_intents WHERE id = $1`,
      [intent.id],
      /FAIL CLOSED: Suppression interdite/
    );
  });

  it('Scenario 7: concurrent checkouts on same child', async () => {
    const studentId = randomUUID();
    let clientA;
    let clientB;
    let testError = null;

    async function checkoutWithClient(cl, params) {
      const {
        p_parent_ref,
        p_student_local_id,
        p_school_slug,
        p_pricing_id,
        p_duration_months = 1,
        p_cycle_name = 'maternelle_primaire'
      } = params;
      const studentGlobalId = params.p_student_global_id || p_student_local_id;
      await cl.query(
        `INSERT INTO public.global_students (student_global_id) VALUES ($1) ON CONFLICT DO NOTHING`,
        [studentGlobalId]
      );
      await cl.query(
        `INSERT INTO public.parent_child_links (parent_ref, student_global_id, current_link_active)
         VALUES ($1, $2, true)
         ON CONFLICT (parent_ref, student_global_id) DO UPDATE SET current_link_active = true`,
        [p_parent_ref, studentGlobalId]
      );
      const res = await cl.query(
        `SELECT * FROM public.prepare_parent_pack_checkout($1::text, $2::uuid, $3::text, $4::text, $5::uuid, $6::text, $7::integer) AS result`,
        [p_parent_ref, studentGlobalId, p_school_slug, p_student_local_id, p_pricing_id, p_cycle_name, p_duration_months]
      );
      return res.rows[0].result;
    }

    try {
      clientA = new Client({ connectionString: validatedConnStr });
      clientB = new Client({ connectionString: validatedConnStr });
      await clientA.connect();
      await clientB.connect();

      const results = await Promise.allSettled([
        checkoutWithClient(clientA, {
          p_parent_ref: 'father',
          p_student_local_id: studentId,
          p_school_slug: 'school_con_a',
          p_pricing_id: globalPricingId
        }),
        checkoutWithClient(clientB, {
          p_parent_ref: 'mother',
          p_student_local_id: studentId,
          p_school_slug: 'school_con_b',
          p_pricing_id: globalPricingId
        })
      ]);

      const succeeded = results.filter(r => r.status === 'fulfilled');
      const rejected = results.filter(r => r.status === 'rejected');
      assert.strictEqual(succeeded.length, 1, 'Exactly one concurrent checkout must succeed');
      assert.strictEqual(rejected.length, 1, 'Second concurrent checkout must be rejected');
      assert.match(rejected[0].reason?.message || '', /ACTIVE_INTENT_ALREADY_EXISTS/);

      const subRes = await clientA.query(
        `SELECT * FROM public.parent_subscriptions WHERE student_global_id = $1`,
        [studentId]
      );
      const finalSub = subRes.rows[0];
      assert.ok(finalSub, 'A single subscription record must exist');
      assert.ok(['father', 'mother'].includes(finalSub.parent_ref));
      assert.ok(['school_con_a', 'school_con_b'].includes(finalSub.school_slug));
    } catch (err) {
      testError = err;
      throw err;
    } finally {
      // Autonomous, reliable and transactional cleanup via dedicated connection
      let cleanupError = null;
      let cleanClient = null;

      try {
        cleanClient = new Client({ connectionString: validatedConnStr });
        await cleanClient.connect();

        // Transaction dediee : les suppressions ne sont commitees qu'apres verification des donnees restantes
        await cleanClient.query('BEGIN');

        // 1. Capture des identifiants des intents crees specifiquement pour cette souscription
        const createdIntents = await cleanClient.query(
          `SELECT id FROM public.payment_intents
           WHERE target_id IN (SELECT id::text FROM public.parent_subscriptions WHERE student_global_id = $1)
             AND payment_type = 'parent_pack'`,
          [studentId]
        );
        const intentIds = createdIntents.rows.map(r => r.id);

        // 1b. Capture des identifiants des intentions préexistantes extérieures au scénario pour garantir leur non-altération
        const externalIntentsRes = intentIds.length > 0
          ? await cleanClient.query(
              `SELECT id FROM public.payment_intents WHERE id != ALL($1::uuid[])`,
              [intentIds]
            )
          : await cleanClient.query(`SELECT id FROM public.payment_intents`);
        const externalIntentIds = externalIntentsRes.rows.map(r => r.id);

        // 2. Suppression de l'intent cree (statut 'initializing', sans periode : compatible avec le trigger P28b protect_parent_pack_intent)
        await cleanClient.query(
          `DELETE FROM public.payment_intents
           WHERE target_id IN (SELECT id::text FROM public.parent_subscriptions WHERE student_global_id = $1)
             AND payment_type = 'parent_pack'`,
          [studentId]
        );

        // 3. Suppression de la souscription parent (respect des cles etrangeres)
        await cleanClient.query(
          `DELETE FROM public.parent_subscriptions WHERE student_global_id = $1`,
          [studentId]
        );

        // 4. Suppression du lien parent-eleve
        await cleanClient.query(
          `DELETE FROM public.parent_child_links WHERE student_global_id = $1`,
          [studentId]
        );

        // 5. Suppression de l'entite racine global_students
        await cleanClient.query(
          `DELETE FROM public.global_students WHERE student_global_id = $1`,
          [studentId]
        );

        // 6. Verification transactionnelle des donnees creees : 0 ligne restante
        if (intentIds.length > 0) {
          const verifySpecificIntents = await cleanClient.query(
            `SELECT COUNT(*) AS cnt FROM public.payment_intents WHERE id = ANY($1::uuid[])`,
            [intentIds]
          );
          assert.strictEqual(parseInt(verifySpecificIntents.rows[0].cnt, 10), 0, 'Cleanup verification failed: created payment_intents still exist');
        }

        const verifySubs = await cleanClient.query(
          `SELECT COUNT(*) AS cnt FROM public.parent_subscriptions WHERE student_global_id = $1`,
          [studentId]
        );
        assert.strictEqual(parseInt(verifySubs.rows[0].cnt, 10), 0, 'Cleanup verification failed: parent_subscriptions row remains');

        const verifyLinks = await cleanClient.query(
          `SELECT COUNT(*) AS cnt FROM public.parent_child_links WHERE student_global_id = $1`,
          [studentId]
        );
        assert.strictEqual(parseInt(verifyLinks.rows[0].cnt, 10), 0, 'Cleanup verification failed: parent_child_links row remains');

        const verifyStudent = await cleanClient.query(
          `SELECT COUNT(*) AS cnt FROM public.global_students WHERE student_global_id = $1`,
          [studentId]
        );
        assert.strictEqual(parseInt(verifyStudent.rows[0].cnt, 10), 0, 'Cleanup verification failed: global_students row remains');

        // 7. Verification transactionnelle qu'aucun intent residuel associe a l'eleve ne subsiste
        const verifyResidualIntents = await cleanClient.query(
          `SELECT COUNT(*) AS cnt FROM public.payment_intents
           WHERE payment_type = 'parent_pack'
             AND (metadata->>'student_global_id' = $1::text OR target_id = $1::text)`,
          [studentId]
        );
        assert.strictEqual(parseInt(verifyResidualIntents.rows[0].cnt, 10), 0, 'Cleanup verification failed: residual parent_pack payment_intents exist for student');

        // 8. Verification transactionnelle de la préservation intégrale des intentions extérieures au scénario
        if (externalIntentIds.length > 0) {
          const verifyPreserved = await cleanClient.query(
            `SELECT COUNT(*) AS cnt FROM public.payment_intents WHERE id = ANY($1::uuid[])`,
            [externalIntentIds]
          );
          assert.strictEqual(
            parseInt(verifyPreserved.rows[0].cnt, 10),
            externalIntentIds.length,
            'External payment_intents were altered or deleted during Scenario 7 cleanup'
          );
        }

        // 9. Validation de la transaction uniquement apres succes de toutes les assertions
        await cleanClient.query('COMMIT');
      } catch (err) {
        if (cleanClient) {
          try { await cleanClient.query('ROLLBACK'); } catch (_) {}
        }
        cleanupError = err;
      } finally {
        if (cleanClient) {
          try { await cleanClient.end(); } catch (_) {}
        }
        await Promise.allSettled([
          clientA ? clientA.end() : Promise.resolve(),
          clientB ? clientB.end() : Promise.resolve()
        ]);
        if (cleanupError) {
          // L'erreur initiale du test n'est jamais masquee si le test et le nettoyage ont echoue tous les deux
          if (testError && !cleanupError.cause) {
            cleanupError.cause = testError;
          }
          throw cleanupError;
        }
      }
    }
  });

  it('Scenario 8: verify SECURITY attributes and role permissions', async () => {
    const checkoutSec = await client.query(
      `SELECT NOT prosecdef AS is_security_invoker FROM pg_proc WHERE proname = 'prepare_parent_pack_checkout'`
    );
    assert.strictEqual(checkoutSec.rows[0].is_security_invoker, true);

    const accessSec = await client.query(
      `SELECT NOT prosecdef AS is_security_invoker FROM pg_proc WHERE proname = 'get_active_parent_pack_subscriptions'`
    );
    assert.strictEqual(accessSec.rows[0].is_security_invoker, true);

    const webhookSec = await client.query(
      `SELECT prosecdef AS is_security_definer FROM pg_proc WHERE proname = 'process_parent_pack_webhook_event'`
    );
    assert.strictEqual(webhookSec.rows[0].is_security_definer, true);

    const privs = await client.query(`
      SELECT
        has_function_privilege('service_role', 'public.prepare_parent_pack_checkout(text,uuid,text,text,uuid,text,integer)', 'EXECUTE') AS sr_checkout,
        has_function_privilege('anon', 'public.prepare_parent_pack_checkout(text,uuid,text,text,uuid,text,integer)', 'EXECUTE') AS anon_checkout,
        has_function_privilege('authenticated', 'public.prepare_parent_pack_checkout(text,uuid,text,text,uuid,text,integer)', 'EXECUTE') AS auth_checkout,
        has_function_privilege('service_role', 'public.get_active_parent_pack_subscriptions(text,uuid[])', 'EXECUTE') AS sr_access,
        has_function_privilege('anon', 'public.get_active_parent_pack_subscriptions(text,uuid[])', 'EXECUTE') AS anon_access,
        has_function_privilege('authenticated', 'public.get_active_parent_pack_subscriptions(text,uuid[])', 'EXECUTE') AS auth_access
    `);
    const row = privs.rows[0];
    assert.strictEqual(row.sr_checkout, true);
    assert.strictEqual(row.anon_checkout, false);
    assert.strictEqual(row.auth_checkout, false);
    assert.strictEqual(row.sr_access, true);
    assert.strictEqual(row.anon_access, false);
    assert.strictEqual(row.auth_access, false);
  });

  it('Scenario 9: authorized parents access, link revocation (including initial subscriber), and expiration (Decision 3)', async () => {
    const studentId = randomUUID();
    const otherStudentId = randomUUID();
    await client.query(`INSERT INTO public.global_students (student_global_id) VALUES ($1), ($2)`, [studentId, otherStudentId]);
    await client.query(
      `INSERT INTO public.parent_child_links (parent_ref, student_global_id, current_link_active)
       VALUES ('father_p28b', $1, true), ('mother_p28b', $1, true), ('father_p28b', $2, true)`,
      [studentId, otherStudentId]
    );

    const co = await checkout({
      p_parent_ref: 'father_p28b',
      p_student_local_id: 'loc_9',
      p_student_global_id: studentId,
      p_school_slug: 'school_a',
      p_pricing_id: globalPricingId
    });

    await client.query(
      `UPDATE public.payment_intents SET status = 'completed', processed_at = now(), provider_transaction_id = 'tx_scen9' WHERE id = $1`,
      [co.payment_intent_id]
    );
    await client.query(
      `INSERT INTO public.parent_subscription_periods (subscription_id, payment_intent_id, start_date, end_date, status)
       VALUES ($1, $2, (CURRENT_DATE - interval '2 days')::date, (CURRENT_DATE + interval '28 days')::date, 'active')`,
      [co.subscription_id, co.payment_intent_id]
    );
    await client.query(`UPDATE public.parent_subscriptions SET status = 'active' WHERE id = $1`, [co.subscription_id]);

    // Both Father and Mother must have access to studentId (and NOT to unpaid otherStudentId)
    const fatherAccess = await client.query(
      `SELECT student_global_id FROM public.get_active_parent_pack_subscriptions('father_p28b', ARRAY[$1::uuid, $2::uuid])`,
      [studentId, otherStudentId]
    );
    assert.deepStrictEqual(fatherAccess.rows.map(r => r.student_global_id), [studentId]);

    const motherAccess = await client.query(
      `SELECT student_global_id FROM public.get_active_parent_pack_subscriptions('mother_p28b', ARRAY[$1::uuid])`,
      [studentId]
    );
    assert.deepStrictEqual(motherAccess.rows.map(r => r.student_global_id), [studentId]);

    // Unknown parent has zero access
    const strangerAccess = await client.query(
      `SELECT student_global_id FROM public.get_active_parent_pack_subscriptions('stranger_p28b', ARRAY[$1::uuid])`,
      [studentId]
    );
    assert.strictEqual(strangerAccess.rows.length, 0);

    // Revoke Mother's link -> Mother immediately loses access while Father keeps access
    await client.query(
      `UPDATE public.parent_child_links SET current_link_active = false WHERE parent_ref = 'mother_p28b' AND student_global_id = $1`,
      [studentId]
    );
    const motherAfterRevoke = await client.query(
      `SELECT student_global_id FROM public.get_active_parent_pack_subscriptions('mother_p28b', ARRAY[$1::uuid])`,
      [studentId]
    );
    assert.strictEqual(motherAfterRevoke.rows.length, 0);

    // Revoke initial subscriber Father's link -> Father also immediately loses access despite parent_subscriptions.parent_ref = 'father_p28b'
    await client.query(
      `UPDATE public.parent_child_links SET current_link_active = false WHERE parent_ref = 'father_p28b' AND student_global_id = $1`,
      [studentId]
    );
    const fatherAfterRevoke = await client.query(
      `SELECT student_global_id FROM public.get_active_parent_pack_subscriptions('father_p28b', ARRAY[$1::uuid])`,
      [studentId]
    );
    assert.strictEqual(fatherAfterRevoke.rows.length, 0);

    // Restore Father's link, then expire period -> Father loses access due to period expiration
    await client.query(
      `UPDATE public.parent_child_links SET current_link_active = true WHERE parent_ref = 'father_p28b' AND student_global_id = $1`,
      [studentId]
    );
    await client.query(
      `UPDATE public.parent_subscription_periods SET status = 'expired' WHERE subscription_id = $1`,
      [co.subscription_id]
    );
    const fatherAfterExpire = await client.query(
      `SELECT student_global_id FROM public.get_active_parent_pack_subscriptions('father_p28b', ARRAY[$1::uuid])`,
      [studentId]
    );
    assert.strictEqual(fatherAfterExpire.rows.length, 0);
  });

  it('Scenario 10: multi-school transfer & webhook commission routing (Decisions 1 & 2)', async () => {
    const studentId = randomUUID();
    const affiliateBId = randomUUID();
    const schoolAId = randomUUID();
    const schoolBId = randomUUID();

    // Ensure XOF currency configuration exists
    await client.query(
      `INSERT INTO public.currency_configurations (code, exponent, is_active, min_withdrawal_minor_units, cooling_off_days)
       VALUES ('XOF', 0, true, 5000, 30)
       ON CONFLICT (code) DO NOTHING`
    );

    // Create active school_a, active ambassador B and school_b
    await client.query(
      `INSERT INTO public.schools (id, name, slug, status)
       VALUES ($1, 'Ecole A P28b', 'school_a', 'active')
       ON CONFLICT (slug) DO UPDATE SET status = 'active'`,
      [schoolAId]
    );
    await client.query(
      `INSERT INTO public.affiliates (id, nom, telephone, password_hash, referral_code, status)
       VALUES ($1, 'Ambassadeur B', '+22999001122', 'hash_test', 'REF_P28B_B', 'active')`,
      [affiliateBId]
    );
    await client.query(
      `INSERT INTO public.schools (id, name, slug, status, affiliate_id)
       VALUES ($1, 'Ecole B P28b', 'school_b', 'active', $2)
       ON CONFLICT (slug) DO UPDATE SET affiliate_id = EXCLUDED.affiliate_id, status = 'active'`,
      [schoolBId, affiliateBId]
    );

    // Father creates subscription at school_a and pays
    const firstCo = await checkout({
      p_parent_ref: 'father_tx',
      p_student_local_id: 'loc_a_1',
      p_student_global_id: studentId,
      p_school_slug: 'school_a',
      p_pricing_id: globalPricingId
    });
    const evt1 = 'evt_p28b_' + randomUUID();
    const wh1 = await client.query(
      `SELECT public.process_parent_pack_webhook_event('fedapay', $1, 'transaction.approved', $2, 'feda_tx_1', $3, 'XOF', 'approved', now() - interval '20 days', 10, 0, true) AS res`,
      [evt1, firstCo.payment_intent_id, globalMonthlyPriceMinor]
    );
    assert.strictEqual(wh1.rows[0].res.status, 'completed');

    // Register official transfer to school_b
    await client.query(
      `INSERT INTO public.student_global_mappings (school_slug, student_local_id, student_global_id)
       VALUES ('school_b', 'loc_b_1', $1) ON CONFLICT DO NOTHING`,
      [studentId]
    );
    await client.query(
      `INSERT INTO public.parent_student_identity_transfers (parent_ref, student_global_id, destination_school_slug, destination_student_local_id, status)
       VALUES ('mother_tx', $1, 'school_b', 'loc_b_1', 'completed')`,
      [studentId]
    );

    // Mother initiates renewal checkout at school_b (within J-30 since first period started 20 days ago)
    const secondCo = await checkout({
      p_parent_ref: 'mother_tx',
      p_student_local_id: 'loc_b_1',
      p_student_global_id: studentId,
      p_school_slug: 'school_b',
      p_pricing_id: globalPricingId
    });

    // Before webhook payment, parent_subscriptions still points to school_a
    const subBeforeWh = await fetchSubscription(studentId);
    assert.strictEqual(subBeforeWh.school_slug, 'school_a');
    assert.strictEqual(subBeforeWh.parent_ref, 'father_tx');

    // Webhook confirms Mother's payment for school_b (8th param p_remote_status = 'approved')
    const evt2 = 'evt_p28b_' + randomUUID();
    const feeMinor = 10;
    const wh2 = await client.query(
      `SELECT public.process_parent_pack_webhook_event('fedapay', $1, 'transaction.approved', $2, 'feda_tx_2', $3, 'XOF', 'approved', now(), $4, 0, true) AS res`,
      [evt2, secondCo.payment_intent_id, globalMonthlyPriceMinor, feeMinor]
    );
    const whRes = wh2.rows[0].res;
    assert.strictEqual(whRes.status, 'completed');

    const expectedSchoolShare = Math.floor((globalMonthlyPriceMinor * 20) / 100);
    const expectedRemainder = globalMonthlyPriceMinor - feeMinor - expectedSchoolShare;
    const expectedAmbassadorShare = Math.floor((expectedRemainder * 10) / 100);
    const expectedYziowShare = expectedRemainder - expectedAmbassadorShare;
    assert.strictEqual(Number(whRes.school_share_minor), expectedSchoolShare);
    assert.strictEqual(Number(whRes.ambassador_share_minor), expectedAmbassadorShare);
    assert.strictEqual(Number(whRes.yziow_share_minor), expectedYziowShare);

    // After webhook payment, school_slug is updated to school_b, while historical parent_ref remains father_tx
    const subAfterWh = await fetchSubscription(studentId);
    assert.strictEqual(subAfterWh.school_slug, 'school_b');
    assert.strictEqual(subAfterWh.student_ref, 'loc_b_1');
    assert.strictEqual(subAfterWh.parent_ref, 'father_tx');

    // Verify school_commission_ledger (real P19 columns: period_id, school_slug, ambassador_ref, type = 'credit')
    const sclRes = await client.query(
      `SELECT * FROM public.school_commission_ledger WHERE period_id = $1 AND type = 'credit'`,
      [whRes.period_id]
    );
    assert.strictEqual(sclRes.rows.length, 1);
    assert.strictEqual(sclRes.rows[0].school_slug, 'school_b');
    assert.strictEqual(sclRes.rows[0].ambassador_ref, affiliateBId);
    assert.strictEqual(Number(sclRes.rows[0].school_share_minor), expectedSchoolShare);
    assert.strictEqual(Number(sclRes.rows[0].ambassador_share_minor), expectedAmbassadorShare);
    assert.strictEqual(Number(sclRes.rows[0].yziow_share_minor), expectedYziowShare);

    // Verify affiliate_ledger entry (real P13/P27 columns, no school_id column)
    const affRes = await client.query(
      `SELECT * FROM public.affiliate_ledger WHERE payment_intent_id = $1`,
      [secondCo.payment_intent_id]
    );
    assert.strictEqual(affRes.rows.length, 1);
    assert.strictEqual(affRes.rows[0].affiliate_id, affiliateBId);
    assert.strictEqual(Number(affRes.rows[0].amount_minor), expectedAmbassadorShare);
    assert.strictEqual(affRes.rows[0].metadata.payer_parent_ref, 'mother_tx');

    // Verify affiliate_balances entry (real P13/P27 columns)
    const balRes = await client.query(
      `SELECT * FROM public.affiliate_balances WHERE affiliate_id = $1 AND currency = 'XOF'`,
      [affiliateBId]
    );
    assert.strictEqual(balRes.rows.length, 1);
    assert.strictEqual(Number(balRes.rows[0].pending_balance_minor), expectedAmbassadorShare);
    assert.strictEqual(Number(balRes.rows[0].available_balance_minor), 0);
    assert.strictEqual(Number(balRes.rows[0].reserved_balance_minor), 0);
    assert.strictEqual(Number(balRes.rows[0].debt_balance_minor), 0);

    // Verify duplicate webhook event on already-completed intent uses 'duplicate' status on webhook_events
    const evtDup = 'evt_p28b_dup_' + randomUUID();
    const whDup = await client.query(
      `SELECT public.process_parent_pack_webhook_event('fedapay', $1, 'transaction.approved', $2, 'feda_tx_2', $3, 'XOF', 'approved', now(), $4, 0, true) AS res`,
      [evtDup, secondCo.payment_intent_id, globalMonthlyPriceMinor, feeMinor]
    );
    assert.strictEqual(whDup.rows[0].res.status, 'duplicate');
    assert.strictEqual(whDup.rows[0].res.reason, 'intent_already_completed');
    const weDupRes = await client.query(
      `SELECT status FROM public.webhook_events WHERE provider = 'fedapay' AND provider_event_id = $1`,
      [evtDup]
    );
    assert.strictEqual(weDupRes.rows[0].status, 'duplicate');
  });

  it('Scenario 11: transition to refunded via ordinary SQL is strictly forbidden even with a valid P19 cancellation ledger row (Section 3)', async () => {
    const studentId = randomUUID();
    const schoolAId = randomUUID();
    await client.query(
      `INSERT INTO public.currency_configurations (code, exponent, is_active, min_withdrawal_minor_units, cooling_off_days)
       VALUES ('XOF', 0, true, 5000, 30)
       ON CONFLICT (code) DO NOTHING`
    );
    await client.query(
      `INSERT INTO public.schools (id, name, slug, status)
       VALUES ($1, 'Ecole A Refund', 'school_a', 'active')
       ON CONFLICT (slug) DO UPDATE SET status = 'active'`,
      [schoolAId]
    );

    const co = await checkout({
      p_parent_ref: 'father_rf',
      p_student_local_id: 'loc_rf',
      p_student_global_id: studentId,
      p_school_slug: 'school_a',
      p_pricing_id: globalPricingId
    });
    const evt = 'evt_rf_' + randomUUID();
    const wh = await client.query(
      `SELECT public.process_parent_pack_webhook_event('fedapay', $1, 'transaction.approved', $2, 'feda_tx_rf', $3, 'XOF', 'approved', now(), 10, 0, true) AS res`,
      [evt, co.payment_intent_id, globalMonthlyPriceMinor]
    );
    assert.strictEqual(wh.rows[0].res.status, 'completed');
    const periodId = wh.rows[0].res.period_id;

    // 11a. Direct status change to 'refunded' is blocked
    await execExpectError(
      `UPDATE public.parent_subscription_periods SET status = 'refunded' WHERE id = $1`,
      [periodId],
      /FAIL CLOSED: Transition vers refunded interdite par operation SQL ordinaire/
    );

    // 11b. Even if a valid P19 cancellation row (type = 'cancellation', original_ledger_id = credit.id)
    // is inserted into school_commission_ledger, ordinary SQL transition to 'refunded' remains blocked until P28c
    const creditRes = await client.query(
      `SELECT * FROM public.school_commission_ledger WHERE period_id = $1 AND type = 'credit'`,
      [periodId]
    );
    assert.strictEqual(creditRes.rows.length, 1);
    const creditRow = creditRes.rows[0];

    await client.query(
      `INSERT INTO public.school_commission_ledger (
         period_id, school_slug, ambassador_ref,
         gross_amount_minor, fedapay_fee_minor, school_share_minor, ambassador_share_minor, yziow_share_minor,
         currency, type, original_ledger_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'XOF', 'cancellation', $9)`,
      [
        periodId,
        creditRow.school_slug,
        creditRow.ambassador_ref,
        -Number(creditRow.gross_amount_minor),
        -Number(creditRow.fedapay_fee_minor),
        -Number(creditRow.school_share_minor),
        -Number(creditRow.ambassador_share_minor),
        -Number(creditRow.yziow_share_minor),
        creditRow.id
      ]
    );

    await execExpectError(
      `UPDATE public.parent_subscription_periods SET status = 'refunded' WHERE id = $1`,
      [periodId],
      /FAIL CLOSED: Transition vers refunded interdite par operation SQL ordinaire/
    );
  });
});
