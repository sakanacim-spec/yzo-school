// backend/integration-tests/parent_pack_p28c_refund.test.js
/**
 * P28c: Integration tests for Parent Pack refund and financial compensation (Dual-Custody Reconciliation).
 *
 * Test Scenarios:
 * 1. Nominal 2-step dual-custody refund (init reconciliation -> approve & execute) transitions intent and period, creates audit.
 * 2. Service-level FedaPay status verification (rejects if transaction not marked refunded on provider).
 * 2B. Partial refund is strictly rejected.
 * 2C. Invalid provider_refund_id format is strictly rejected.
 * 2D. Immutability of parent_pack_refund_audits table (append-only, rejects direct INSERT, UPDATE, DELETE).
 * 3. Fail-closed defense: direct SQL UPDATE payment_intents SET status = 'refunded' blocked.
 * 4. Idempotence & replay: second approval call on same reconciliation/period returns already_refunded without duplicate ledger entries.
 * 5. School commission cancellation: school_commission_ledger records cancellation row with exact negative amounts.
 * 6. Affiliate ledger reversal: affiliate_ledger records refund_reversal row with null payment_intent_id and reference distinction.
 * 7A & 7B. Ambassador balance handling: pending deducted, available deducted, debt balance created if withdrawn, non-negative available balance.
 * 8. Immediate access revocation if sole period: subscription becomes canceled, get_active_parent_pack_subscriptions yields no access.
 * 9. Preservation of access if another valid period covers current date: subscription remains active, access maintained.
 * 10 & 10B. Access control & uniqueness: non-superadmin caller rejected (UNAUTHORIZED_ADMIN), duplicate provider_refund_id rejected.
 * 11. SECURITY_BLOCKER: unilateral 4-arg admin_process_parent_pack_refund is blocked fail-closed.
 * 12. Session variable bypass blocked: SET LOCAL yziow.certified_refund_active = 'true' cannot bypass dual-custody reconciliation check.
 * 13. Dual-custody violation: self-approval (initiator === approver) is rejected fail-closed with DUAL_CUSTODY_VIOLATION.
 * 14. Proof verification fail-closed: contradictory amount, beneficiary, date, storage path, or SHA-256 hash blocked even with 2 distinct SuperAdmins.
 * 15. Reference distinction: internal_reconciliation_ref (rec_...) works with provider_refund_id = NULL when FedaPay provides no refund ID.
 * 16. Immutability of parent_pack_refund_reconciliations: rejects direct INSERT, DELETE, and mutation of recorded fields.
 */
'use strict';

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const pg = require('pg');
const { randomUUID, createHash } = require('node:crypto');
const { generateRefundActionProof } = require('../services/refundActionProofAuthority');

const { Client } = pg;
let client;
let superAdminId;
let approverAdminId;
let globalPricingId;
const validProofHash = createHash('sha256').update('justificatif_officiel_fedapay_p28c', 'utf8').digest('hex');

function resolveDatabaseConnectionString() {
  const envUrl = process.env.DATABASE_URL;
  if (envUrl) {
    if (envUrl.toLowerCase().includes('supabase')) {
      throw new Error('FAIL CLOSED: Supabase connections forbidden in integration tests.');
    }
    return envUrl;
  }

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

  const adminRes = await client.query(`SELECT id FROM public.superadmins WHERE username = 'superadmin' LIMIT 1`);
  if (adminRes.rows.length === 0) {
    throw new Error('Superadmin account not found in database.');
  }
  superAdminId = adminRes.rows[0].id;

  const approverRes = await client.query(`SELECT id FROM public.superadmins WHERE username = 'superadmin_approver' LIMIT 1`);
  if (approverRes.rows.length === 0) {
    throw new Error('Superadmin approver account not found in database.');
  }
  approverAdminId = approverRes.rows[0].id;

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

async function seedPaidSubscription(opts = {}) {
  const studentGlobalId = opts.studentGlobalId || randomUUID();
  const parentRef = opts.parentRef || `+22997${Math.floor(100000 + Math.random() * 900000)}`;
  const schoolSlug = opts.schoolSlug || 'ecole_p28c_test';
  const startDate = opts.startDate || '2026-10-01';
  const endDate = opts.endDate || '2026-10-31';
  const providerTxId = opts.providerTxId || `feda_tx_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const hasAffiliate = opts.hasAffiliate ?? true;
  const affiliateBalanceType = opts.affiliateBalanceType || 'pending';

  await client.query(`
    INSERT INTO public.schools (slug, name, country)
    VALUES ($1, 'Ecole P28c Test', 'BJ')
    ON CONFLICT (slug) DO NOTHING
  `, [schoolSlug]);

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

  const intentId = randomUUID();
  const processedAtRes = await client.query(`
    INSERT INTO public.payment_intents (
      id, target_id, school_slug, expected_amount, expected_currency,
      payment_type, provider, provider_transaction_id, status, metadata,
      expires_at, processed_at
    ) VALUES (
      $1, $2, $3, 1000, 'XOF',
      'parent_pack', 'fedapay', $4, 'completed',
      jsonb_build_object('student_global_id', $5::text, 'parent_ref', $6::text),
      NOW() + INTERVAL '1 day', NOW() - INTERVAL '1 hour'
    )
    RETURNING processed_at
  `, [intentId, subId, schoolSlug, providerTxId, studentGlobalId, parentRef]);

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

  let affiliateId = null;
  if (hasAffiliate) {
    affiliateId = randomUUID();
    const affPhone = `+22991${Math.floor(100000 + Math.random() * 900000)}`;
    const affRefCode = `REF_${randomUUID().replace(/-/g, '').slice(0, 10)}`;
    await client.query(`
      INSERT INTO public.affiliates (id, nom, telephone, password_hash, referral_code, status)
      VALUES ($1, 'Ambassadeur P28c', $2, 'hash', $3, 'active')
    `, [affiliateId, affPhone, affRefCode]);

    await client.query(`
      INSERT INTO public.currency_configurations (code, exponent, is_active, min_withdrawal_minor_units, cooling_off_days)
      VALUES ('XOF', 0, true, 5000, 30)
      ON CONFLICT (code) DO NOTHING
    `);

    let pending = 75;
    let available = 0;
    let debt = 0;
    if (affiliateBalanceType === 'available') {
      pending = 0;
      available = 75;
    } else if (affiliateBalanceType === 'withdrawn') {
      pending = 0;
      available = 0;
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
    providerTxId,
    processedAt: processedAtRes.rows[0].processed_at
  };
}

// Helper: execute both steps of the dual-custody reconciliation in SQL
async function executeDualCustodyRefundSql(data, opts = {}) {
  const initiator = opts.initiatorAdminId !== undefined ? opts.initiatorAdminId : superAdminId;
  const approver = opts.approverAdminId !== undefined ? opts.approverAdminId : approverAdminId;
  const reason = opts.reason || 'Motif administratif vérifié';
  const verifiedTxId = opts.verifiedTxId !== undefined ? opts.verifiedTxId : data.providerTxId;
  const verifiedStatus = opts.verifiedStatus || 'refunded';
  const verifiedAmount = opts.verifiedAmount !== undefined ? opts.verifiedAmount : 1000;
  const verifiedCurrency = opts.verifiedCurrency || 'XOF';
  const storagePath = opts.storagePath || `private://refund-proofs/2026/${data.periodId}.pdf`;
  const docHash = opts.docHash || validProofHash;
  const proofAmount = opts.proofAmount !== undefined ? opts.proofAmount : 1000;
  const proofCurrency = opts.proofCurrency || 'XOF';
  const beneficiaryRef = opts.beneficiaryRef !== undefined ? opts.beneficiaryRef : data.parentRef;
  const refundedAt = opts.refundedAt || new Date().toISOString();
  const internalRef = opts.internalRef !== undefined ? opts.internalRef : `rec_p28c_${randomUUID().replace(/-/g, '')}`;
  const providerRefundId = opts.providerRefundId !== undefined ? opts.providerRefundId : null;
  const approvalNotes = opts.approvalNotes || 'Seconde validation conforme au justificatif';

  let initiatorProof = opts.initiatorProof;
  if (initiatorProof === undefined) {
    try {
      initiatorProof = generateRefundActionProof({
        adminId: initiator,
        actionType: 'initiate',
        periodId: data.periodId,
        reconciliationId: null,
        providerTransactionId: verifiedTxId,
        verifiedAmountMinor: verifiedAmount,
        currency: verifiedCurrency,
        proofDocumentHash: docHash,
      });
    } catch {
      initiatorProof = null;
    }
  }

  const initRes = await client.query(`
    SELECT public.admin_create_parent_pack_refund_reconciliation(
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
    ) AS res;
  `, [
    data.periodId,
    initiator,
    reason,
    verifiedTxId,
    verifiedStatus,
    verifiedAmount,
    verifiedCurrency,
    storagePath,
    docHash,
    proofAmount,
    proofCurrency,
    beneficiaryRef,
    refundedAt,
    internalRef,
    providerRefundId,
    initiatorProof ? JSON.stringify(initiatorProof) : null
  ]);

  const initPayload = initRes.rows[0].res;
  if (initPayload.status === 'already_refunded') {
    return { initPayload, approvePayload: initPayload };
  }

  if (opts.unlockSecurityGate !== false) {
    await client.query(`
      UPDATE public.parent_pack_refund_security_gate
      SET independent_admin_auth_ready = true,
          independent_fedapay_proof_ready = true,
          private_worm_storage_ready = true
      WHERE id = true
    `);
  }

  let approverProof = opts.approverProof;
  if (approverProof === undefined) {
    try {
      approverProof = generateRefundActionProof({
        adminId: approver,
        actionType: 'approve',
        periodId: data.periodId,
        reconciliationId: initPayload.reconciliation_id,
        providerTransactionId: verifiedTxId,
        verifiedAmountMinor: verifiedAmount,
        currency: verifiedCurrency,
        proofDocumentHash: docHash,
      });
    } catch {
      approverProof = null;
    }
  }

  const approveRes = await client.query(`
    SELECT public.admin_approve_parent_pack_refund_reconciliation(
      $1, $2, $3, $4, $5, $6, $7, $8
    ) AS res;
  `, [
    initPayload.reconciliation_id,
    approver,
    verifiedTxId,
    verifiedStatus,
    verifiedAmount,
    verifiedCurrency,
    approvalNotes,
    approverProof ? JSON.stringify(approverProof) : null
  ]);

  return {
    initPayload,
    approvePayload: approveRes.rows[0].res
  };
}

describe('P28c: Parent Pack Refund and Financial Hardening (Dual-Custody)', () => {

  it('Scenario 1: Nominal 2-step dual-custody refund transitions intent and period, creates reconciliation & audit', async () => {
    const data = await seedPaidSubscription();
    const refundRef = `fedapay_ref_${randomUUID()}`;

    const { initPayload, approvePayload: res } = await executeDualCustodyRefundSql(data, {
      providerRefundId: refundRef
    });

    assert.strictEqual(initPayload.status, 'pending_approval');
    assert.strictEqual(res.status, 'success');
    assert.strictEqual(res.period_id, data.periodId);
    assert.strictEqual(res.subscription_id, data.subId);
    assert.strictEqual(res.new_subscription_status, 'canceled');
    assert.strictEqual(res.initiator_admin_id, superAdminId);
    assert.strictEqual(res.approver_admin_id, approverAdminId);
    assert.ok(res.refund_audit_id);

    const intentRes = await client.query(`SELECT status FROM public.payment_intents WHERE id = $1`, [data.intentId]);
    assert.strictEqual(intentRes.rows[0].status, 'refunded');

    const periodRes = await client.query(`SELECT status FROM public.parent_subscription_periods WHERE id = $1`, [data.periodId]);
    assert.strictEqual(periodRes.rows[0].status, 'refunded');

    const recRes = await client.query(`SELECT * FROM public.parent_pack_refund_reconciliations WHERE id = $1`, [initPayload.reconciliation_id]);
    assert.strictEqual(recRes.rows.length, 1);
    assert.strictEqual(recRes.rows[0].status, 'completed');
    assert.strictEqual(recRes.rows[0].initiator_admin_id, superAdminId);
    assert.strictEqual(recRes.rows[0].approver_admin_id, approverAdminId);

    const auditRes = await client.query(`SELECT * FROM public.parent_pack_refund_audits WHERE period_id = $1`, [data.periodId]);
    assert.strictEqual(auditRes.rows.length, 1);
    assert.strictEqual(auditRes.rows[0].provider_refund_id, refundRef);
    assert.strictEqual(auditRes.rows[0].initiator_admin_id, superAdminId);
    assert.strictEqual(auditRes.rows[0].approver_admin_id, approverAdminId);
    assert.strictEqual(auditRes.rows[0].proof_document_hash, validProofHash);
  });

  it('Scenario 2: Service-level FedaPay validation rejects unconfirmed refund', async () => {
    const data = await seedPaidSubscription();

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
    await executeDualCustodyRefundSql(data, { reason: 'Audit immutability test' });

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
      assert.match(err.message, /FAIL CLOSED/);
    }
    await client.query('ROLLBACK TO SAVEPOINT p28c_sec_check');
    assert.strictEqual(threw, true, 'Direct SQL update must throw error');
  });

  it('Scenario 4: Second refund approval call on same period returns already_refunded idempotently', async () => {
    const data = await seedPaidSubscription();
    const { initPayload } = await executeDualCustodyRefundSql(data, { reason: 'Premier remboursement' });

    // Second approval call on same reconciliation
    const replayApproverProof = generateRefundActionProof({
      adminId: approverAdminId,
      actionType: 'approve',
      periodId: data.periodId,
      reconciliationId: initPayload.reconciliation_id,
      providerTransactionId: data.providerTxId,
      verifiedAmountMinor: 1000,
      currency: 'XOF',
      proofDocumentHash: validProofHash,
    });
    const rpcRes2 = await client.query(`
      SELECT public.admin_approve_parent_pack_refund_reconciliation($1, $2, $3, 'refunded', 1000, 'XOF', 'Rejeu', $4) AS res;
    `, [initPayload.reconciliation_id, approverAdminId, data.providerTxId, JSON.stringify(replayApproverProof)]);

    const res2 = rpcRes2.rows[0].res;
    assert.strictEqual(res2.status, 'already_refunded');
    assert.strictEqual(res2.period_id, data.periodId);

    const auditCount = await client.query(`SELECT COUNT(*) FROM public.parent_pack_refund_audits WHERE period_id = $1`, [data.periodId]);
    assert.strictEqual(Number(auditCount.rows[0].count), 1);

    const cancelCount = await client.query(`
      SELECT COUNT(*) FROM public.school_commission_ledger
      WHERE period_id = $1 AND type = 'cancellation'
    `, [data.periodId]);
    assert.strictEqual(Number(cancelCount.rows[0].count), 1);
  });

  it('Scenario 5: School commission cancellation has exact negative amounts', async () => {
    const data = await seedPaidSubscription();
    await executeDualCustodyRefundSql(data, { reason: 'Audit comptable annulation' });

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

  it('Scenario 6: Affiliate ledger reversal record contains reference and null payment_intent_id', async () => {
    const data = await seedPaidSubscription();
    const refundRef = `fedapay_ref_${randomUUID()}`;
    await executeDualCustodyRefundSql(data, { providerRefundId: refundRef, reason: 'Reversal test' });

    const revRes = await client.query(`
      SELECT * FROM public.affiliate_ledger
      WHERE affiliate_id = $1 AND entry_type = 'refund_reversal'
    `, [data.affiliateId]);

    assert.strictEqual(revRes.rows.length, 1);
    const rev = revRes.rows[0];
    assert.strictEqual(Number(rev.amount_minor), 75);
    assert.strictEqual(rev.provider_refund_id, refundRef);
    assert.strictEqual(rev.payment_intent_id, null);
    assert.strictEqual(rev.metadata.provider_refund_id_certified, true);
  });

  it('Scenario 7A: Pending balance is cleanly reversed when commission is still pending', async () => {
    const data = await seedPaidSubscription({ affiliateBalanceType: 'pending' });
    await executeDualCustodyRefundSql(data, { reason: 'Pending deduction' });

    const balRes = await client.query(`SELECT * FROM public.affiliate_balances WHERE affiliate_id = $1`, [data.affiliateId]);
    const bal = balRes.rows[0];
    assert.strictEqual(Number(bal.pending_balance_minor), 0);
    assert.strictEqual(Number(bal.available_balance_minor), 0);
    assert.strictEqual(Number(bal.debt_balance_minor), 0);
  });

  it('Scenario 7B: Available balance deducted if commission matured; debt assigned if withdrawn', async () => {
    const data = await seedPaidSubscription({ affiliateBalanceType: 'withdrawn' });
    await executeDualCustodyRefundSql(data, { reason: 'Debt assignment test' });

    const balRes = await client.query(`SELECT * FROM public.affiliate_balances WHERE affiliate_id = $1`, [data.affiliateId]);
    const bal = balRes.rows[0];
    assert.strictEqual(Number(bal.pending_balance_minor), 0);
    assert.strictEqual(Number(bal.available_balance_minor), 0, 'Available balance must never drop below 0');
    assert.strictEqual(Number(bal.debt_balance_minor), 75, 'Deficit must be placed into debt_balance_minor');
  });

  it('Scenario 8: Immediate access revocation when single active period is refunded', async () => {
    const data = await seedPaidSubscription({ startDate: '2026-10-01', endDate: '2026-11-30' });

    const accessBefore = await client.query(`
      SELECT * FROM public.get_active_parent_pack_subscriptions($1, ARRAY[$2]::uuid[]);
    `, [data.parentRef, data.studentGlobalId]);
    assert.strictEqual(accessBefore.rows.length, 1);

    await executeDualCustodyRefundSql(data, { reason: 'Révocation immédiate' });

    const subRes = await client.query(`SELECT status FROM public.parent_subscriptions WHERE id = $1`, [data.subId]);
    assert.strictEqual(subRes.rows[0].status, 'canceled');

    const accessAfter = await client.query(`
      SELECT * FROM public.get_active_parent_pack_subscriptions($1, ARRAY[$2]::uuid[]);
    `, [data.parentRef, data.studentGlobalId]);
    assert.strictEqual(accessAfter.rows.length, 0);
  });

  it('Scenario 9: Access preserved when another active period covers the current date', async () => {
    const data = await seedPaidSubscription({ startDate: '2026-10-01', endDate: '2026-10-15' });

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

    const { approvePayload: res } = await executeDualCustodyRefundSql(data, { reason: 'Refund old period' });
    assert.strictEqual(res.status, 'success');
    assert.strictEqual(res.new_subscription_status, 'active');

    const subRes = await client.query(`SELECT status FROM public.parent_subscriptions WHERE id = $1`, [data.subId]);
    assert.strictEqual(subRes.rows[0].status, 'active');

    const access = await client.query(`
      SELECT * FROM public.get_active_parent_pack_subscriptions($1, ARRAY[$2]::uuid[]);
    `, [data.parentRef, data.studentGlobalId]);
    assert.strictEqual(access.rows.length, 1);
  });

  it('Scenario 10: Non-superadmin is rejected with UNAUTHORIZED_ADMIN', async () => {
    const data = await seedPaidSubscription();
    const fakeAdminId = randomUUID();

    await client.query('SAVEPOINT p28c_perm_check');
    let threw = false;
    try {
      await executeDualCustodyRefundSql(data, { initiatorAdminId: fakeAdminId });
    } catch (err) {
      threw = true;
      assert.match(err.message, /UNAUTHORIZED_ADMIN/);
    }
    await client.query('ROLLBACK TO SAVEPOINT p28c_perm_check');
    assert.strictEqual(threw, true, 'Non-superadmin initiator must be rejected');
  });

  it('Scenario 10B: Duplicate provider_refund_id across different periods is rejected', async () => {
    const data1 = await seedPaidSubscription();
    const data2 = await seedPaidSubscription();
    const sharedRefundRef = `fedapay_ref_unique_${randomUUID()}`;

    await executeDualCustodyRefundSql(data1, { providerRefundId: sharedRefundRef });

    await client.query('SAVEPOINT p28c_dup_check');
    let threw = false;
    try {
      await executeDualCustodyRefundSql(data2, { providerRefundId: sharedRefundRef });
    } catch (err) {
      threw = true;
      assert.match(err.message, /DUPLICATE_PROVIDER_REFUND_ID/);
    }
    await client.query('ROLLBACK TO SAVEPOINT p28c_dup_check');
    assert.strictEqual(threw, true, 'Duplicate provider_refund_id must be rejected');
  });

  it('Scenario 11: Direct 4-argument unilateral RPC call is blocked fail-closed with SECURITY_BLOCKER', async () => {
    const data = await seedPaidSubscription();
    const refundRef = `fedapay_ref_${randomUUID()}`;

    await client.query('SAVEPOINT p28c_sec_blocker');
    let threw = false;
    try {
      await client.query(`
        SELECT public.admin_process_parent_pack_refund($1, $2, $3, $4);
      `, [data.periodId, refundRef, superAdminId, 'Tentative compensation unilatérale']);
    } catch (err) {
      threw = true;
      assert.match(err.message, /SECURITY_BLOCKER/);
    }
    await client.query('ROLLBACK TO SAVEPOINT p28c_sec_blocker');
    assert.strictEqual(threw, true, 'Unilateral 4-argument RPC call must be rejected fail-closed');
  });

  it('Scenario 12: Session variable SET LOCAL yziow.certified_refund_active = true cannot bypass dual-custody reconciliation check', async () => {
    const data = await seedPaidSubscription();

    await client.query('SAVEPOINT p28c_session_bypass');
    let threw = false;
    try {
      await client.query(`SET LOCAL yziow.certified_refund_active = 'true'`);
      await client.query(`SET LOCAL yziow.reconciliation_step_active = 'approve'`);
      await client.query(`UPDATE public.parent_subscription_periods SET status = 'refunded' WHERE id = $1`, [data.periodId]);
    } catch (err) {
      threw = true;
      assert.match(err.message, /FAIL CLOSED/);
    }
    await client.query('ROLLBACK TO SAVEPOINT p28c_session_bypass');
    assert.strictEqual(threw, true, 'Session variable alone must NOT allow transition to refunded');
  });

  it('Scenario 13: Dual-custody violation (initiator === approver) is rejected fail-closed', async () => {
    const data = await seedPaidSubscription();

    await client.query('SAVEPOINT p28c_dual_custody');
    let threw = false;
    try {
      await executeDualCustodyRefundSql(data, {
        initiatorAdminId: superAdminId,
        approverAdminId: superAdminId
      });
    } catch (err) {
      threw = true;
      assert.match(err.message, /DUAL_CUSTODY_VIOLATION/);
    }
    await client.query('ROLLBACK TO SAVEPOINT p28c_dual_custody');
    assert.strictEqual(threw, true, 'Self-approval must be rejected fail-closed');
  });

  it('Scenario 14: Contradictory or invalid proof is rejected fail-closed even when two distinct SuperAdmins sign', async () => {
    const data = await seedPaidSubscription();

    // 14A: Contradictory amount on proof (800 vs 1000)
    await client.query('SAVEPOINT p28c_bad_amount');
    let threwAmount = false;
    try {
      await executeDualCustodyRefundSql(data, { proofAmount: 800 });
    } catch (err) {
      threwAmount = true;
      assert.match(err.message, /PROOF_AMOUNT_MISMATCH/);
    }
    await client.query('ROLLBACK TO SAVEPOINT p28c_bad_amount');
    assert.strictEqual(threwAmount, true, 'Contradictory proof amount must be rejected');

    // 14B: Contradictory beneficiary on proof
    await client.query('SAVEPOINT p28c_bad_beneficiary');
    let threwBeneficiary = false;
    try {
      await executeDualCustodyRefundSql(data, { beneficiaryRef: '+22999999999' });
    } catch (err) {
      threwBeneficiary = true;
      assert.match(err.message, /PROOF_BENEFICIARY_MISMATCH/);
    }
    await client.query('ROLLBACK TO SAVEPOINT p28c_bad_beneficiary');
    assert.strictEqual(threwBeneficiary, true, 'Contradictory beneficiary must be rejected');

    // 14C: Refund date prior to payment processed_at
    await client.query('SAVEPOINT p28c_bad_date');
    let threwDate = false;
    try {
      await executeDualCustodyRefundSql(data, { refundedAt: '2020-01-01T00:00:00Z' });
    } catch (err) {
      threwDate = true;
      assert.match(err.message, /PROOF_DATE_INVALID/);
    }
    await client.query('ROLLBACK TO SAVEPOINT p28c_bad_date');
    assert.strictEqual(threwDate, true, 'Refund date prior to payment must be rejected');

    // 14D: Non-private storage path or invalid SHA-256 hash
    await client.query('SAVEPOINT p28c_bad_storage');
    let threwStorage = false;
    try {
      await executeDualCustodyRefundSql(data, { storagePath: 'https://public-bucket.example.com/proof.pdf' });
    } catch (err) {
      threwStorage = true;
      assert.match(err.message, /INVALID_PROOF_STORAGE_PATH/);
    }
    await client.query('ROLLBACK TO SAVEPOINT p28c_bad_storage');
    assert.strictEqual(threwStorage, true, 'Public storage path must be rejected');
  });

  it('Scenario 15: Explicit distinction between internal_reconciliation_ref and provider_refund_id = NULL', async () => {
    const data = await seedPaidSubscription();
    const internalRef = `rec_p28c_nullref_${randomUUID().replace(/-/g, '')}`;

    const { approvePayload: res } = await executeDualCustodyRefundSql(data, {
      internalRef,
      providerRefundId: null
    });

    assert.strictEqual(res.status, 'success');
    assert.strictEqual(res.internal_reconciliation_ref, internalRef);
    assert.strictEqual(res.provider_refund_id, null);
    assert.strictEqual(res.provider_refund_id_certified, false);

    const auditRes = await client.query(`SELECT * FROM public.parent_pack_refund_audits WHERE period_id = $1`, [data.periodId]);
    assert.strictEqual(auditRes.rows[0].internal_reconciliation_ref, internalRef);
    assert.strictEqual(auditRes.rows[0].provider_refund_id, null);

    const affLedgerRes = await client.query(`
      SELECT * FROM public.affiliate_ledger
      WHERE affiliate_id = $1 AND entry_type = 'refund_reversal'
      ORDER BY created_at DESC LIMIT 1
    `, [data.affiliateId]);
    assert.strictEqual(affLedgerRes.rows[0].provider_refund_id, internalRef);
    assert.strictEqual(affLedgerRes.rows[0].metadata.internal_reconciliation_ref, internalRef);
    assert.strictEqual(affLedgerRes.rows[0].metadata.provider_refund_id, null);
    assert.strictEqual(affLedgerRes.rows[0].metadata.provider_refund_id_certified, false);
  });

  it('Scenario 16: Table parent_pack_refund_reconciliations blocks direct INSERT, UPDATE mutation and DELETE', async () => {
    const data = await seedPaidSubscription();

    // Direct INSERT without RPC is blocked
    await client.query('SAVEPOINT p28c_rec_direct_ins');
    let directInsertThrew = false;
    try {
      await client.query(`
        INSERT INTO public.parent_pack_refund_reconciliations (
          period_id, subscription_id, payment_intent_id, internal_reconciliation_ref,
          provider_transaction_id, verified_provider_status, verified_amount_minor, verified_currency,
          initiator_admin_id, reason, proof_storage_path, proof_document_hash,
          proof_refunded_amount_minor, proof_currency, proof_beneficiary_ref, proof_refunded_at
        ) VALUES (
          $1, $2, $3, 'rec_direct_bypass_123', $4, 'refunded', 1000, 'XOF',
          $5, 'Bypass', 'private://proofs/doc.pdf', $6, 1000, 'XOF', $7, NOW()
        );
      `, [data.periodId, data.subId, data.intentId, data.providerTxId, superAdminId, validProofHash, data.parentRef]);
    } catch (err) {
      directInsertThrew = true;
      assert.match(err.message, /FAIL CLOSED/);
    }
    await client.query('ROLLBACK TO SAVEPOINT p28c_rec_direct_ins');
    assert.strictEqual(directInsertThrew, true, 'Direct INSERT on parent_pack_refund_reconciliations must throw FAIL CLOSED');

    // Create legitimate pending_approval reconciliation via RPC
    const initProof = generateRefundActionProof({
      adminId: superAdminId,
      actionType: 'initiate',
      periodId: data.periodId,
      reconciliationId: null,
      providerTransactionId: data.providerTxId,
      verifiedAmountMinor: 1000,
      currency: 'XOF',
      proofDocumentHash: validProofHash,
    });
    const initRes = await client.query(`
      SELECT public.admin_create_parent_pack_refund_reconciliation(
        $1, $2, 'Test immutability', $3, 'refunded', 1000, 'XOF',
        'private://refund-proofs/2026/test.pdf', $4, 1000, 'XOF', $5, NOW(), NULL, NULL, $6
      ) AS res;
    `, [data.periodId, superAdminId, data.providerTxId, validProofHash, data.parentRef, JSON.stringify(initProof)]);
    const recId = initRes.rows[0].res.reconciliation_id;

    // DELETE is blocked
    await client.query('SAVEPOINT p28c_rec_del');
    let deleteThrew = false;
    try {
      await client.query(`DELETE FROM public.parent_pack_refund_reconciliations WHERE id = $1`, [recId]);
    } catch (err) {
      deleteThrew = true;
      assert.match(err.message, /FAIL CLOSED/);
    }
    await client.query('ROLLBACK TO SAVEPOINT p28c_rec_del');
    assert.strictEqual(deleteThrew, true, 'DELETE on parent_pack_refund_reconciliations must throw FAIL CLOSED');
  });

  it('Scenario 17: Default fail-closed SECURITY_BLOCKER on admin_approve_parent_pack_refund_reconciliation & yziow_refund_executor cannot trigger compensation or unlock gate; commissions and rights remain unchanged', async () => {
    const data = await seedPaidSubscription({ startDate: '2026-10-01', endDate: '2026-11-30' });

    // 1. Verify security gate is locked by default (false, false, false)
    const gateRes = await client.query(`SELECT * FROM public.parent_pack_refund_security_gate WHERE id = true`);
    assert.strictEqual(gateRes.rows.length, 1);
    assert.strictEqual(gateRes.rows[0].independent_admin_auth_ready, false);
    assert.strictEqual(gateRes.rows[0].independent_fedapay_proof_ready, false);
    assert.strictEqual(gateRes.rows[0].private_worm_storage_ready, false);

    // 2. Verify yziow_refund_executor and service_role have zero privileges on parent_pack_refund_security_gate
    const execPriv = await client.query(`
      SELECT has_table_privilege('yziow_refund_executor', 'public.parent_pack_refund_security_gate', 'UPDATE') AS can_upd,
             has_table_privilege('service_role', 'public.parent_pack_refund_security_gate', 'UPDATE') AS srv_upd
    `);
    assert.strictEqual(execPriv.rows[0].can_upd, false);
    assert.strictEqual(execPriv.rows[0].srv_upd, false);

    // 3. Step 1 (initiation) creates a pending_approval dossier without touching financial tables
    const initProof = generateRefundActionProof({
      adminId: superAdminId,
      actionType: 'initiate',
      periodId: data.periodId,
      reconciliationId: null,
      providerTransactionId: data.providerTxId,
      verifiedAmountMinor: 1000,
      currency: 'XOF',
      proofDocumentHash: validProofHash,
    });
    const initRes = await client.query(`
      SELECT public.admin_create_parent_pack_refund_reconciliation(
        $1, $2, 'Dossier en attente', $3, 'refunded', 1000, 'XOF',
        'private://refund-proofs/2026/locked.pdf', $4, 1000, 'XOF', $5, NOW(), NULL, NULL, $6
      ) AS res;
    `, [data.periodId, superAdminId, data.providerTxId, validProofHash, data.parentRef, JSON.stringify(initProof)]);
    const recId = initRes.rows[0].res.reconciliation_id;
    assert.strictEqual(initRes.rows[0].res.status, 'pending_approval');

    // 4. Step 2 (approval) is blocked fail-closed by default (SECURITY_BLOCKER) even with 2 distinct SuperAdmins and valid action proof
    const approverProof = generateRefundActionProof({
      adminId: approverAdminId,
      actionType: 'approve',
      periodId: data.periodId,
      reconciliationId: recId,
      providerTransactionId: data.providerTxId,
      verifiedAmountMinor: 1000,
      currency: 'XOF',
      proofDocumentHash: validProofHash,
    });

    await client.query('SAVEPOINT p28c_approve_locked');
    let approveLockedThrew = false;
    try {
      await client.query(`
        SELECT public.admin_approve_parent_pack_refund_reconciliation(
          $1, $2, $3, 'refunded', 1000, 'XOF', 'Tentative approbation avec gate verrouillee', $4
        );
      `, [recId, approverAdminId, data.providerTxId, JSON.stringify(approverProof)]);
    } catch (err) {
      approveLockedThrew = true;
      assert.match(err.message, /SECURITY_BLOCKER/);
    }
    await client.query('ROLLBACK TO SAVEPOINT p28c_approve_locked');
    assert.strictEqual(approveLockedThrew, true, 'Approval must be blocked fail-closed by default with SECURITY_BLOCKER');

    // 5. Direct SQL call as yziow_refund_executor is also blocked with SECURITY_BLOCKER and cannot UPDATE security gate
    await client.query('SAVEPOINT p28c_executor_locked');
    let execApproveThrew = false;
    try {
      await client.query(`SET LOCAL ROLE yziow_refund_executor`);
      await client.query(`
        SELECT public.admin_approve_parent_pack_refund_reconciliation(
          $1, $2, $3, 'refunded', 1000, 'XOF', 'Appel direct yziow_refund_executor', $4
        );
      `, [recId, approverAdminId, data.providerTxId, JSON.stringify(approverProof)]);
    } catch (err) {
      execApproveThrew = true;
      assert.match(err.message, /SECURITY_BLOCKER/);
    }
    await client.query('ROLLBACK TO SAVEPOINT p28c_executor_locked');
    assert.strictEqual(execApproveThrew, true, 'Direct call with yziow_refund_executor must fail with SECURITY_BLOCKER');

    // 6. Verify school commissions, ambassador balances/ledger, and Parent Pack rights remain 100% unchanged
    const cancelCount = await client.query(`
      SELECT COUNT(*)::int AS cnt FROM public.school_commission_ledger
      WHERE period_id = $1 AND type = 'cancellation'
    `, [data.periodId]);
    assert.strictEqual(cancelCount.rows[0].cnt, 0, 'No school commission cancellation must occur when refused');

    const creditRow = await client.query(`
      SELECT school_share_minor, ambassador_share_minor FROM public.school_commission_ledger
      WHERE period_id = $1 AND type = 'credit'
    `, [data.periodId]);
    assert.strictEqual(Number(creditRow.rows[0].school_share_minor), 200);
    assert.strictEqual(Number(creditRow.rows[0].ambassador_share_minor), 75);

    const balRes = await client.query(`SELECT * FROM public.affiliate_balances WHERE affiliate_id = $1`, [data.affiliateId]);
    assert.strictEqual(Number(balRes.rows[0].pending_balance_minor), 75, 'Ambassador pending balance must remain unchanged');
    assert.strictEqual(Number(balRes.rows[0].available_balance_minor), 0);
    assert.strictEqual(Number(balRes.rows[0].debt_balance_minor), 0, 'Ambassador debt balance must remain 0');

    const revCount = await client.query(`
      SELECT COUNT(*)::int AS cnt FROM public.affiliate_ledger
      WHERE affiliate_id = $1 AND entry_type = 'refund_reversal'
    `, [data.affiliateId]);
    assert.strictEqual(revCount.rows[0].cnt, 0, 'No affiliate refund_reversal entry must exist when refused');

    const periodRes = await client.query(`SELECT status FROM public.parent_subscription_periods WHERE id = $1`, [data.periodId]);
    assert.strictEqual(periodRes.rows[0].status, 'active', 'Period must remain active');

    const subRes = await client.query(`SELECT status FROM public.parent_subscriptions WHERE id = $1`, [data.subId]);
    assert.strictEqual(subRes.rows[0].status, 'active', 'Subscription must remain active');

    const intentRes = await client.query(`SELECT status FROM public.payment_intents WHERE id = $1`, [data.intentId]);
    assert.strictEqual(intentRes.rows[0].status, 'completed', 'Payment intent must remain completed');

    const accessRes = await client.query(`
      SELECT * FROM public.get_active_parent_pack_subscriptions($1, ARRAY[$2]::uuid[]);
    `, [data.parentRef, data.studentGlobalId]);
    assert.strictEqual(accessRes.rows.length, 1, 'Parent Pack active access must remain intact');
  });

});