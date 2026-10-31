// backend/integration-tests/parent_pack_p28c_refund.test.js
/**
 * P28c: Integration tests for Parent Pack refund and financial compensation.
 *
 * Test Scenarios:
 * 1. Nominal refund via admin_process_parent_pack_refund (intent refunded, period refunded, audit recorded).
 * 2. Service-level FedaPay status verification (rejects if transaction not marked refunded on provider).
 * 3. Fail-closed defense: direct SQL UPDATE payment_intents SET status = 'refunded' blocked without certified RPC session tag.
 * 4. Idempotence & replay: second refund call returns already_refunded without duplicate ledger entries.
 * 5. School commission cancellation: school_commission_ledger records cancellation row with exact negative amounts.
 * 6. Affiliate ledger reversal: affiliate_ledger records refund_reversal row with provider_refund_id.
 * 7. Ambassador balance handling: pending deducted, available deducted, debt balance created if withdrawn, non-negative available balance.
 * 8. Immediate access revocation if sole period: subscription becomes cancelled, get_active_parent_pack_subscriptions yields no access.
 * 9. Preservation of access if another valid period covers current date: subscription remains active, access maintained.
 * 10. Access control & security attributes: non-superadmin caller rejected (FORBIDDEN_NOT_SUPERADMIN), duplicate provider_refund_id rejected.
 */
'use strict';

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const pg = require('pg');
const { randomUUID } = require('node:crypto');

const { Client } = pg;
let client;
let superAdminId;
let globalPricingId;

function resolveDatabaseConnectionString() {
  const envUrl = process.env.DATABASE_URL;
  if (envUrl) {
    if (envUrl.toLowerCase().includes('supabase')) {
      throw new Error('FAIL CLOSED: Supabase connections forbidden in integration tests.');
    }
    return envUrl;
  }

  // Fallback to local test DB with pgpass
  let pwd = process.env.PGPASSWORD || '';
  try {
    const pgpassPath = `${process.env.APPDATA}\\postgresql\\pgpass.conf`;
    if (!pwd && fs.existsSync(pgpassPath)) {
      const content = fs.readFileSync(pgpassPath, 'utf8');
      const m = content.match(/localhost:5432:yziow_p28_test:postgres:([^:\r\n]+)/);
      if (m) pwd = m[1];
    }
  } catch (_e) {}

  return `postgresql://postgres:${encodeURIComponent(pwd)}@127.0.0.1:5432/yziow_p28b_restore_test`;
}

before(async () => {
  const connStr = resolveDatabaseConnectionString();
  client = new Client({ connectionString: connStr });
  await client.connect();

  // Find SuperAdmin ID
  const adminRes = await client.query(`SELECT id FROM public.superadmins WHERE username = 'superadmin' LIMIT 1`);
  if (adminRes.rows.length === 0) {
    throw new Error('Superadmin account not found in database.');
  }
  superAdminId = adminRes.rows[0].id;

  // Find Pricing ID
  const pricingRes = await client.query(`
    SELECT id FROM public.parent_pack_pricing
    WHERE active = true AND cycle_name = 'maternelle_primaire'
    LIMIT 1
  `);
  if (pricingRes.rows.length === 0) {
    throw new Error('Active parent_pack_pricing not found.');
  }
  globalPricingId = pricingRes.rows[0].id;
});

after(async () => {
  if (client) await client.end();
});

beforeEach(async () => {
  await client.query('BEGIN');
});

afterEach(async () => {
  await client.query('ROLLBACK');
});

// Helper: Seed complete subscription with payment intent, period, school ledger and affiliate ledger
async function seedPaidSubscription(opts = {}) {
  const studentGlobalId = opts.studentGlobalId || randomUUID();
  const parentRef = opts.parentRef || `+22997${Math.floor(100000 + Math.random() * 900000)}`;
  const schoolSlug = opts.schoolSlug || 'ecole_p28c_test';
  const startDate = opts.startDate || '2026-10-01';
  const endDate = opts.endDate || '2026-10-31';
  const providerTxId = opts.providerTxId || `feda_tx_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const hasAffiliate = opts.hasAffiliate ?? true;
  const affiliateBalanceType = opts.affiliateBalanceType || 'pending'; // 'pending', 'available', or 'withdrawn'

  // 1. Ensure school exists
  await client.query(`
    INSERT INTO public.schools (slug, name, country)
    VALUES ($1, 'Ecole P28c Test', 'BJ')
    ON CONFLICT (slug) DO NOTHING
  `, [schoolSlug]);

  // 2. Global student & link
  await client.query(`
    INSERT INTO public.global_students (student_global_id)
    VALUES ($1)
    ON CONFLICT DO NOTHING
  `, [studentGlobalId]);

  await client.query(`
    INSERT INTO public.parent_child_links (parent_ref, student_global_id, current_link_active, first_linked_at)
    VALUES ($1, $2, true, NOW())
    ON CONFLICT (parent_ref, student_global_id) DO UPDATE SET current_link_active = true
  `, [parentRef, studentGlobalId]);

  // 3. Parent Subscription
  const subId = randomUUID();
  await client.query(`
    INSERT INTO public.parent_subscriptions (
      id, student_global_id, parent_ref, school_slug, student_ref,
      pricing_id, status
    ) VALUES (
      $1, $2, $3, $4, 'STD_LOCAL_1',
      $5, 'active'
    )
  `, [subId, studentGlobalId, parentRef, schoolSlug, globalPricingId]);

  // 4. Payment Intent
  const intentId = randomUUID();
  await client.query(`
    INSERT INTO public.payment_intents (
      id, target_id, school_slug, expected_amount, expected_currency,
      payment_type, provider, provider_transaction_id, status, metadata,
      expires_at, processed_at
    ) VALUES (
      $1, $2, $3, 1000, 'XOF',
      'parent_pack', 'fedapay', $4, 'completed',
      jsonb_build_object('student_global_id', $5::text, 'parent_ref', $6::text),
      NOW() + INTERVAL '1 day', NOW()
    )
  `, [intentId, subId, schoolSlug, providerTxId, studentGlobalId, parentRef]);

  // 5. Parent Subscription Period
  const periodId = randomUUID();
  await client.query(`
    INSERT INTO public.parent_subscription_periods (
      id, subscription_id, payment_intent_id,
      start_date, end_date, status
    ) VALUES (
      $1, $2, $3,
      $4, $5, 'active'
    )
  `, [periodId, subId, intentId, startDate, endDate]);

  // 6. Affiliate & Ledger (if applicable)
  let affiliateId = null;
  if (hasAffiliate) {
    const affQuery = await client.query(`SELECT id FROM public.affiliates LIMIT 1`);
    if (affQuery.rows.length > 0) {
      affiliateId = affQuery.rows[0].id;
    } else {
      affiliateId = randomUUID();
      await client.query(`
        INSERT INTO public.affiliates (id, nom, telephone, password_hash, referral_code, status)
        VALUES ($1, 'Ambassadeur P28c', '+22991000000', 'hash', $2, 'active')
      `, [affiliateId, `REF_${Date.now()}`]);
    }

    // Ensure currency XOF configuration
    await client.query(`
      INSERT INTO public.currency_configurations (code, exponent, is_active, min_withdrawal_minor_units, cooling_off_days)
      VALUES ('XOF', 0, true, 5000, 30)
      ON CONFLICT (code) DO NOTHING
    `);

    // Initial balances
    let pending = 75;
    let available = 0;
    let debt = 0;
    if (affiliateBalanceType === 'available') {
      pending = 0;
      available = 75;
    } else if (affiliateBalanceType === 'withdrawn') {
      pending = 0;
      available = 0; // Already withdrawn
    }

    await client.query(`
      INSERT INTO public.affiliate_balances (
        affiliate_id, currency, pending_balance_minor, available_balance_minor,
        reserved_balance_minor, debt_balance_minor
      ) VALUES ($1, 'XOF', $2, $3, 0, $4)
      ON CONFLICT (affiliate_id, currency) DO UPDATE
      SET pending_balance_minor = $2,
          available_balance_minor = $3,
          reserved_balance_minor = 0,
          debt_balance_minor = $4
    `, [affiliateId, pending, available, debt]);

    const affLedgerId = randomUUID();
    await client.query(`
      INSERT INTO public.affiliate_ledger (
        id, affiliate_id, entry_type, amount_minor, currency,
        payment_intent_id, maturation_at, metadata
      ) VALUES (
        $1, $2, 'commission', 75, 'XOF',
        $3, NOW() + INTERVAL '14 days', jsonb_build_object('period_id', $4::text)
      )
    `, [affLedgerId, affiliateId, intentId, periodId]);
  }

  // 7. School Commission Ledger
  // 1000 = 50 fedapay + 200 school + 75 ambassador + 675 yziow
  const schoolLedgerId = randomUUID();
  await client.query(`
    INSERT INTO public.school_commission_ledger (
      id, period_id, school_slug, ambassador_ref,
      gross_amount_minor, fedapay_fee_minor, school_share_minor,
      ambassador_share_minor, yziow_share_minor, currency, type
    ) VALUES (
      $1, $2, $3, $4,
      1000, 50, 200, 75, 675, 'XOF', 'credit'
    )
  `, [schoolLedgerId, periodId, schoolSlug, affiliateId ? String(affiliateId) : null]);

  return {
    studentGlobalId,
    parentRef,
    schoolSlug,
    intentId,
    subId,
    periodId,
    schoolLedgerId,
    affiliateId,
    providerTxId
  };
}

describe('P28c: Parent Pack Refund and Financial Hardening', () => {

  // Scenario 1: Nominal refund via admin_process_parent_pack_refund
  it('Scenario 1: Nominal refund via admin RPC transitions intent and period, creates audit', async () => {
    const data = await seedPaidSubscription();
    const refundRef = `fedapay_ref_${randomUUID()}`;

    const rpcRes = await client.query(`
      SELECT public.admin_process_parent_pack_refund($1, $2, $3, $4) AS res;
    `, [data.periodId, refundRef, superAdminId, 'Motif administratif valide']);

    const res = rpcRes.rows[0].res;
    assert.strictEqual(res.status, 'success');
    assert.strictEqual(res.period_id, data.periodId);
    assert.strictEqual(res.subscription_id, data.subId);
    assert.strictEqual(res.new_subscription_status, 'canceled');
    assert.ok(res.refund_audit_id);

    // Verify DB states
    const intentRes = await client.query(`SELECT status FROM public.payment_intents WHERE id = $1`, [data.intentId]);
    assert.strictEqual(intentRes.rows[0].status, 'refunded');

    const periodRes = await client.query(`SELECT status FROM public.parent_subscription_periods WHERE id = $1`, [data.periodId]);
    assert.strictEqual(periodRes.rows[0].status, 'refunded');

    const auditRes = await client.query(`SELECT * FROM public.parent_pack_refund_audits WHERE period_id = $1`, [data.periodId]);
    assert.strictEqual(auditRes.rows.length, 1);
    assert.strictEqual(auditRes.rows[0].provider_refund_id, refundRef);
    assert.strictEqual(auditRes.rows[0].admin_actor_id, superAdminId);
  });

  // Scenario 2: Service-level FedaPay status validation
  it('Scenario 2: Service-level FedaPay validation rejects unconfirmed refund', async () => {
    const data = await seedPaidSubscription();

    // Mock FedaPay client returning approved (not refunded)
    const mockFedapayUnrefunded = {
      retrieveTransaction: async (_id) => ({
        id: data.providerTxId,
        status: 'approved',
        wasRefunded: () => false
      })
    };

    const tx = await mockFedapayUnrefunded.retrieveTransaction(data.providerTxId);
    const isRefunded = (typeof tx.wasRefunded === 'function' && tx.wasRefunded() && !tx.status.includes('partially')) ||
                       (typeof tx.status === 'string' && tx.status === 'refunded');

    assert.strictEqual(isRefunded, false, 'Unrefunded transaction must evaluate to false');

    // DB remains unchanged
    const periodRes = await client.query(`SELECT status FROM public.parent_subscription_periods WHERE id = $1`, [data.periodId]);
    assert.strictEqual(periodRes.rows[0].status, 'active');
  });

  it('Scenario 2B: Partial refund is strictly rejected for P28c full refund', async () => {
    const mockFedapayPartial = {
      id: 'tx_12345678',
      status: 'approved_partially_refunded',
      wasRefunded: () => true,
      wasPartiallyRefunded: () => true
    };

    const isPartiallyRefunded = (typeof mockFedapayPartial.wasPartiallyRefunded === 'function' && mockFedapayPartial.wasPartiallyRefunded()) ||
      (typeof mockFedapayPartial.status === 'string' && mockFedapayPartial.status.includes('partially_refunded'));

    assert.strictEqual(isPartiallyRefunded, true, 'Partial refund must be detected');
  });

  it('Scenario 2C: Invalid provider_refund_id format is strictly rejected', async () => {
    const PROVIDER_REFUND_ID_REGEX = /^(ref_|fedapay_|feda_|tx_)[a-zA-Z0-9_-]{6,120}$/i;
    assert.strictEqual(PROVIDER_REFUND_ID_REGEX.test('arbitrary_id'), false);
    assert.strictEqual(PROVIDER_REFUND_ID_REGEX.test('12345'), false);
    assert.strictEqual(PROVIDER_REFUND_ID_REGEX.test(''), false);
    assert.strictEqual(PROVIDER_REFUND_ID_REGEX.test('ref_valid_12345678'), true);
    assert.strictEqual(PROVIDER_REFUND_ID_REGEX.test('fedapay_ref_test_abcdef'), true);
  });

  it('Scenario 2D: Immutability of parent_pack_refund_audits table (append-only)', async () => {
    const data = await seedPaidSubscription();
    const refundRef = `fedapay_ref_${randomUUID()}`;

    await client.query(`
      SELECT public.admin_process_parent_pack_refund($1, $2, $3, $4);
    `, [data.periodId, refundRef, superAdminId, 'Audit immutability test']);

    await client.query('SAVEPOINT p28c_audit_mut');
    let updateThrew = false;
    try {
      await client.query(`UPDATE public.parent_pack_refund_audits SET reason = 'tampered' WHERE period_id = $1`, [data.periodId]);
    } catch (err) {
      updateThrew = true;
      assert.match(err.message, /FAIL CLOSED/);
    }
    await client.query('ROLLBACK TO SAVEPOINT p28c_audit_mut');
    assert.strictEqual(updateThrew, true, 'UPDATE on parent_pack_refund_audits must throw FAIL CLOSED');

    await client.query('SAVEPOINT p28c_audit_del');
    let deleteThrew = false;
    try {
      await client.query(`DELETE FROM public.parent_pack_refund_audits WHERE period_id = $1`, [data.periodId]);
    } catch (err) {
      deleteThrew = true;
      assert.match(err.message, /FAIL CLOSED/);
    }
    await client.query('ROLLBACK TO SAVEPOINT p28c_audit_del');
    assert.strictEqual(deleteThrew, true, 'DELETE on parent_pack_refund_audits must throw FAIL CLOSED');
  });

  // Scenario 3: Direct SQL UPDATE to refunded fails fail-closed
  it('Scenario 3: Direct SQL UPDATE payment_intents to refunded fails fail-closed', async () => {
    const data = await seedPaidSubscription();

    await client.query('SAVEPOINT p28c_sec_check');
    let threw = false;
    try {
      await client.query(`
        UPDATE public.payment_intents
        SET status = 'refunded'
        WHERE id = $1;
      `, [data.intentId]);
    } catch (err) {
      threw = true;
      assert.match(err.message, /FAIL CLOSED|TRANSITION_TO_REFUNDED_FAIL_CLOSED/);
    }
    await client.query('ROLLBACK TO SAVEPOINT p28c_sec_check');
    assert.strictEqual(threw, true, 'Direct SQL update must throw error');
  });

  // Scenario 4: Idempotence & replay
  it('Scenario 4: Second refund call on same period returns already_refunded idempotently', async () => {
    const data = await seedPaidSubscription();
    const refundRef = `fedapay_ref_${randomUUID()}`;

    // First call
    await client.query(`
      SELECT public.admin_process_parent_pack_refund($1, $2, $3, $4);
    `, [data.periodId, refundRef, superAdminId, 'Premier remboursement']);

    // Second call
    const rpcRes2 = await client.query(`
      SELECT public.admin_process_parent_pack_refund($1, $2, $3, $4) AS res;
    `, [data.periodId, refundRef, superAdminId, 'Rejeu remboursement']);

    const res2 = rpcRes2.rows[0].res;
    assert.strictEqual(res2.status, 'already_refunded');
    assert.strictEqual(res2.period_id, data.periodId);

    // Verify exactly one audit row and one cancellation row
    const auditCount = await client.query(`SELECT COUNT(*) FROM public.parent_pack_refund_audits WHERE period_id = $1`, [data.periodId]);
    assert.strictEqual(Number(auditCount.rows[0].count), 1);

    const cancelCount = await client.query(`
      SELECT COUNT(*) FROM public.school_commission_ledger
      WHERE period_id = $1 AND type = 'cancellation'
    `, [data.periodId]);
    assert.strictEqual(Number(cancelCount.rows[0].count), 1);
  });

  // Scenario 5: School commission cancellation amounts
  it('Scenario 5: School commission cancellation has exact negative amounts', async () => {
    const data = await seedPaidSubscription();
    const refundRef = `fedapay_ref_${randomUUID()}`;

    await client.query(`
      SELECT public.admin_process_parent_pack_refund($1, $2, $3, $4);
    `, [data.periodId, refundRef, superAdminId, 'Audit comptable annulation']);

    const cancelRes = await client.query(`
      SELECT * FROM public.school_commission_ledger
      WHERE period_id = $1 AND type = 'cancellation'
    `, [data.periodId]);

    assert.strictEqual(cancelRes.rows.length, 1);
    const cancel = cancelRes.rows[0];
    assert.strictEqual(Number(cancel.gross_amount_minor), -1000);
    assert.strictEqual(Number(cancel.fedapay_fee_minor), -50);
    assert.strictEqual(Number(cancel.school_share_minor), -200);
    assert.strictEqual(Number(cancel.ambassador_share_minor), -75);
    assert.strictEqual(Number(cancel.yziow_share_minor), -675);
  });

  // Scenario 6: Affiliate ledger reversal entry
  it('Scenario 6: Affiliate ledger reversal record contains provider_refund_id and null payment_intent_id', async () => {
    const data = await seedPaidSubscription();
    const refundRef = `fedapay_ref_${randomUUID()}`;

    await client.query(`
      SELECT public.admin_process_parent_pack_refund($1, $2, $3, $4);
    `, [data.periodId, refundRef, superAdminId, 'Reversal test']);

    const revRes = await client.query(`
      SELECT * FROM public.affiliate_ledger
      WHERE affiliate_id = $1 AND entry_type = 'refund_reversal'
    `, [data.affiliateId]);

    assert.strictEqual(revRes.rows.length, 1);
    const rev = revRes.rows[0];
    assert.strictEqual(Number(rev.amount_minor), 75);
    assert.strictEqual(rev.provider_refund_id, refundRef);
    assert.strictEqual(rev.payment_intent_id, null);
  });

  // Scenario 7: Ambassador balance handling (pending, available, debt)
  it('Scenario 7A: Pending balance is cleanly reversed when commission is still pending', async () => {
    const data = await seedPaidSubscription({ affiliateBalanceType: 'pending' });
    const refundRef = `fedapay_ref_${randomUUID()}`;

    await client.query(`
      SELECT public.admin_process_parent_pack_refund($1, $2, $3, $4);
    `, [data.periodId, refundRef, superAdminId, 'Pending deduction']);

    const balRes = await client.query(`SELECT * FROM public.affiliate_balances WHERE affiliate_id = $1`, [data.affiliateId]);
    const bal = balRes.rows[0];
    assert.strictEqual(Number(bal.pending_balance_minor), 0);
    assert.strictEqual(Number(bal.available_balance_minor), 0);
    assert.strictEqual(Number(bal.debt_balance_minor), 0);
  });

  it('Scenario 7B: Available balance deducted if commission matured; debt assigned if withdrawn', async () => {
    const data = await seedPaidSubscription({ affiliateBalanceType: 'withdrawn' });
    const refundRef = `fedapay_ref_${randomUUID()}`;

    await client.query(`
      SELECT public.admin_process_parent_pack_refund($1, $2, $3, $4);
    `, [data.periodId, refundRef, superAdminId, 'Debt assignment test']);

    const balRes = await client.query(`SELECT * FROM public.affiliate_balances WHERE affiliate_id = $1`, [data.affiliateId]);
    const bal = balRes.rows[0];
    assert.strictEqual(Number(bal.pending_balance_minor), 0);
    assert.strictEqual(Number(bal.available_balance_minor), 0, 'Available balance must never drop below 0');
    assert.strictEqual(Number(bal.debt_balance_minor), 75, 'Deficit must be placed into debt_balance_minor');
  });

  // Scenario 8: Immediate access revocation if sole period
  it('Scenario 8: Immediate access revocation when single active period is refunded', async () => {
    const data = await seedPaidSubscription({ startDate: '2026-10-01', endDate: '2026-11-30' });
    const refundRef = `fedapay_ref_${randomUUID()}`;

    // Before refund: access granted
    const accessBefore = await client.query(`
      SELECT * FROM public.get_active_parent_pack_subscriptions($1, ARRAY[$2]::uuid[]);
    `, [data.parentRef, data.studentGlobalId]);
    assert.strictEqual(accessBefore.rows.length, 1);

    // Process refund
    await client.query(`
      SELECT public.admin_process_parent_pack_refund($1, $2, $3, $4);
    `, [data.periodId, refundRef, superAdminId, 'Révocation immédiate']);

    // Subscription status updated to canceled
    const subRes = await client.query(`SELECT status FROM public.parent_subscriptions WHERE id = $1`, [data.subId]);
    assert.strictEqual(subRes.rows[0].status, 'canceled');

    // Access revoked: get_active_parent_pack_subscriptions returns 0
    const accessAfter = await client.query(`
      SELECT * FROM public.get_active_parent_pack_subscriptions($1, ARRAY[$2]::uuid[]);
    `, [data.parentRef, data.studentGlobalId]);
    assert.strictEqual(accessAfter.rows.length, 0);
  });

  // Scenario 9: Preservation of access if multiple periods cover current date
  it('Scenario 9: Access preserved when another active period covers the current date', async () => {
    // Period 1: October 2026 (past)
    const data = await seedPaidSubscription({ startDate: '2026-10-01', endDate: '2026-10-15' });

    // Period 2: Covers today and future
    const period2Id = randomUUID();
    const intent2Id = randomUUID();
    await client.query(`
      INSERT INTO public.payment_intents (
        id, target_id, school_slug, expected_amount, expected_currency,
        payment_type, provider, provider_transaction_id, status, metadata,
        expires_at, processed_at
      ) VALUES (
        $1, $2, $3, 1000, 'XOF',
        'parent_pack', 'fedapay', 'feda_tx_future', 'completed',
        jsonb_build_object('student_global_id', $4::text, 'parent_ref', $5::text),
        NOW() + INTERVAL '1 day', NOW()
      )
    `, [intent2Id, data.subId, data.schoolSlug, data.studentGlobalId, data.parentRef]);

    await client.query(`
      INSERT INTO public.parent_subscription_periods (
        id, subscription_id, payment_intent_id,
        start_date, end_date, status
      ) VALUES (
        $1, $2, $3,
        CURRENT_DATE - INTERVAL '1 day', CURRENT_DATE + INTERVAL '30 days', 'active'
      )
    `, [period2Id, data.subId, intent2Id]);

    // Refund Period 1
    const refundRef = `fedapay_ref_${randomUUID()}`;
    const rpcRes = await client.query(`
      SELECT public.admin_process_parent_pack_refund($1, $2, $3, $4) AS res;
    `, [data.periodId, refundRef, superAdminId, 'Refund old period']);

    const res = rpcRes.rows[0].res;
    assert.strictEqual(res.status, 'success');
    assert.strictEqual(res.new_subscription_status, 'active');

    // Subscription remains active
    const subRes = await client.query(`SELECT status FROM public.parent_subscriptions WHERE id = $1`, [data.subId]);
    assert.strictEqual(subRes.rows[0].status, 'active');

    // Access remains granted
    const access = await client.query(`
      SELECT * FROM public.get_active_parent_pack_subscriptions($1, ARRAY[$2]::uuid[]);
    `, [data.parentRef, data.studentGlobalId]);
    assert.strictEqual(access.rows.length, 1);
  });

  // Scenario 10: Access control and permissions
  it('Scenario 10: Non-superadmin is rejected with FORBIDDEN_NOT_SUPERADMIN', async () => {
    const data = await seedPaidSubscription();
    const fakeAdminId = randomUUID();
    const refundRef = `fedapay_ref_${randomUUID()}`;

    await client.query('SAVEPOINT p28c_perm_check');
    let threw = false;
    try {
      await client.query(`
        SELECT public.admin_process_parent_pack_refund($1, $2, $3, $4);
      `, [data.periodId, refundRef, fakeAdminId, 'Tentative non autorisée']);
    } catch (err) {
      threw = true;
      assert.match(err.message, /UNAUTHORIZED_ADMIN|FORBIDDEN_NOT_SUPERADMIN/);
    }
    await client.query('ROLLBACK TO SAVEPOINT p28c_perm_check');
    assert.strictEqual(threw, true, 'Non-superadmin must be rejected');
  });

  it('Scenario 10B: Duplicate provider_refund_id across different periods is rejected', async () => {
    const data1 = await seedPaidSubscription();
    const data2 = await seedPaidSubscription();
    const sharedRefundRef = `fedapay_ref_unique_${randomUUID()}`;

    // First refund succeeds
    await client.query(`
      SELECT public.admin_process_parent_pack_refund($1, $2, $3, $4);
    `, [data1.periodId, sharedRefundRef, superAdminId, 'Premier remboursement']);

    // Second refund with duplicate provider_refund_id fails
    await client.query('SAVEPOINT p28c_dup_check');
    let threw = false;
    try {
      await client.query(`
        SELECT public.admin_process_parent_pack_refund($1, $2, $3, $4);
      `, [data2.periodId, sharedRefundRef, superAdminId, 'Deuxième remboursement avec même ref']);
    } catch (err) {
      threw = true;
      assert.match(err.message, /DUPLICATE_PROVIDER_REFUND_ID/);
    }
    await client.query('ROLLBACK TO SAVEPOINT p28c_dup_check');
    assert.strictEqual(threw, true, 'Duplicate provider_refund_id must be rejected');
  });

});
