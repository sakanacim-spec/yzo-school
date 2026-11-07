import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import pg from 'pg';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Ensure required environment variables to prevent utils/supabase.js from exiting
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test_service_role_key';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_for_multitenant_lot5b_security_min_32_chars';

const { supabase } = require('../../backend/utils/supabase.js');
const {
  refundParentPackSubscriptionAdmin,
  createParentPackRefundReconciliationRequest,
  approveAndExecuteParentPackRefundReconciliation,
  getAccessStatesForGlobalIds,
  ACCESS_STATES
} = require('../../backend/services/parentPackService.js');

const { Client } = pg;

function validateAndResolveDisposableDbConfig() {
  const connStr = process.env.DATABASE_URL;
  if (!connStr) {
    throw new Error('FAIL CLOSED: DATABASE_URL must be explicitly set to run disposable integration tests.');
  }

  if (connStr.toLowerCase().includes('supabase')) {
    throw new Error('FAIL CLOSED: Supabase connections are strictly forbidden in integration tests.');
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

  if (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') {
    throw new Error(`FAIL CLOSED: Refusing database host "${parsed.hostname}". Only local disposable test databases (127.0.0.1 or localhost) are permitted.`);
  }

  const dbName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  const forbiddenDatabases = new Set([
    '',
    'postgres',
    'template0',
    'template1',
    'yziow_production',
    'production',
    'yzo_production',
    'yziow_p28_restore_20261027',
    'yziow_p28b_restore_test'
  ]);

  if (
    forbiddenDatabases.has(dbName.toLowerCase()) ||
    dbName.toLowerCase().includes('prod') ||
    dbName.toLowerCase().includes('restore')
  ) {
    throw new Error(
      `FAIL CLOSED: Refusing to run tests against protected, reference or restore database "${dbName}". Use a dedicated disposable local test database.`
    );
  }

  console.log(
    `[P28c refundBackend] Target disposable DB -> Host=${parsed.hostname} Port=${parsed.port || '5432'} Database=${dbName} User=${decodeURIComponent(parsed.username || '')}`
  );

  return {
    adminUrl: connStr,
    host: parsed.hostname,
    port: parsed.port || '5432',
    dbName
  };
}

describe('P28c Backend Refund Integration & PostgreSQL Dedicated Role (Dual-Custody)', () => {
  let adminClient;
  let superAdminId;
  let approverAdminId;
  let globalPricingId;
  let executorUrl;
  const validRawProofContent = 'Justificatif officiel FedaPay P28c - Remboursement integral';
  const validProofHash = createHash('sha256').update(validRawProofContent, 'utf8').digest('hex');
  const originalFrom = supabase.from;
  const originalRpc = supabase.rpc;
  const testCreatedIds = {
    periodIds: [],
    subIds: [],
    intentIds: [],
    studentGlobalIds: []
  };

  before(async () => {
    const dbConfig = validateAndResolveDisposableDbConfig();
    adminClient = new Client({ connectionString: dbConfig.adminUrl });
    await adminClient.connect();

    // 1. Ensure SuperAdmins (initiator + approver)
    const adminRes = await adminClient.query(`SELECT id FROM public.superadmins WHERE username = 'superadmin' LIMIT 1`);
    if (adminRes.rows.length === 0) {
      throw new Error('Superadmin account not found in test database.');
    }
    superAdminId = adminRes.rows[0].id;

    const approverRes = await adminClient.query(`SELECT id FROM public.superadmins WHERE username = 'superadmin_approver' LIMIT 1`);
    if (approverRes.rows.length === 0) {
      throw new Error('Superadmin approver account not found in test database.');
    }
    approverAdminId = approverRes.rows[0].id;

    // 2. Ensure Pricing
    const pricingRes = await adminClient.query(`
      SELECT id FROM public.parent_pack_pricing
      WHERE active = true AND cycle_name = 'maternelle_primaire'
      LIMIT 1
    `);
    if (pricingRes.rows.length === 0) {
      throw new Error('Active parent_pack_pricing not found.');
    }
    globalPricingId = pricingRes.rows[0].id;

    // 3. Generate dedicated executor credentials in memory (never logged) and configure role
    const executorPwd = 'p28c_test_' + randomUUID().replace(/-/g, '');
    executorUrl = `postgresql://yziow_refund_executor:${encodeURIComponent(executorPwd)}@${dbConfig.host}:${dbConfig.port}/${dbConfig.dbName}`;

    await adminClient.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'yziow_refund_executor') THEN
          CREATE ROLE yziow_refund_executor LOGIN;
        END IF;
      END
      $$;
      ALTER ROLE yziow_refund_executor WITH PASSWORD '${executorPwd}';
      GRANT USAGE ON SCHEMA public TO yziow_refund_executor;

      GRANT EXECUTE ON FUNCTION public.admin_process_parent_pack_refund(UUID, TEXT, UUID, TEXT) TO yziow_refund_executor;
      REVOKE EXECUTE ON FUNCTION public.admin_process_parent_pack_refund(UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated, service_role;

      GRANT EXECUTE ON FUNCTION public.admin_create_parent_pack_refund_reconciliation(UUID, UUID, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT) TO yziow_refund_executor;
      REVOKE EXECUTE ON FUNCTION public.admin_create_parent_pack_refund_reconciliation(UUID, UUID, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT) FROM PUBLIC, anon, authenticated, service_role;

      GRANT EXECUTE ON FUNCTION public.admin_approve_parent_pack_refund_reconciliation(UUID, UUID, TEXT, TEXT, BIGINT, TEXT, TEXT) TO yziow_refund_executor;
      REVOKE EXECUTE ON FUNCTION public.admin_approve_parent_pack_refund_reconciliation(UUID, UUID, TEXT, TEXT, BIGINT, TEXT, TEXT) FROM PUBLIC, anon, authenticated, service_role;

      GRANT EXECUTE ON FUNCTION public.admin_get_parent_pack_refund_reconciliation(UUID) TO yziow_refund_executor;
      REVOKE EXECUTE ON FUNCTION public.admin_get_parent_pack_refund_reconciliation(UUID) FROM PUBLIC, anon, authenticated, service_role;

      REVOKE ALL ON public.parent_pack_refund_audits FROM PUBLIC, anon, authenticated, service_role, yziow_refund_executor;
      REVOKE ALL ON public.parent_pack_refund_reconciliations FROM PUBLIC, anon, authenticated, service_role, yziow_refund_executor;
      REVOKE ALL ON public.school_commission_ledger FROM yziow_refund_executor;
      REVOKE ALL ON public.affiliate_ledger FROM yziow_refund_executor;
      REVOKE ALL ON public.affiliate_balances FROM yziow_refund_executor;
      REVOKE ALL ON public.payment_intents FROM yziow_refund_executor;
      REVOKE ALL ON public.parent_subscription_periods FROM yziow_refund_executor;
      REVOKE ALL ON public.parent_subscriptions FROM yziow_refund_executor;
    `);

    process.env.YZIOW_REFUND_DATABASE_URL = executorUrl;
  });

  after(async () => {
    try {
      if (adminClient) {
        await adminClient.end();
      }
    } catch (_err) {
      // Ignore client closing errors
    } finally {
      supabase.from = originalFrom;
      supabase.rpc = originalRpc;
    }
  });

  function buildValidProof(fixture, overrides = {}) {
    return {
      storagePath: `private://refund-proofs/2026/${fixture.periodId}.pdf`,
      documentHash: validProofHash,
      rawContent: validRawProofContent,
      refundedAmountMinor: fixture.amount,
      currency: fixture.currency,
      beneficiaryRef: fixture.parentRef,
      refundedAt: new Date().toISOString(),
      ...overrides
    };
  }

  async function seedFixture(opts = {}) {
    const studentGlobalId = randomUUID();
    const parentRef = `+22997${Math.floor(100000 + Math.random() * 900000)}`;
    const schoolSlug = 'ecole_p28c_test';
    const providerTxId = opts.providerTxId || `feda_tx_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const amount = 1000;
    const currency = 'XOF';
    const processedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    testCreatedIds.studentGlobalIds.push(studentGlobalId);

    await adminClient.query(`
      INSERT INTO public.schools (slug, name, country)
      VALUES ($1, 'Ecole Test', 'BJ')
      ON CONFLICT (slug) DO NOTHING;
    `, [schoolSlug]);

    await adminClient.query(`
      INSERT INTO public.global_students (student_global_id)
      VALUES ($1) ON CONFLICT DO NOTHING;
    `, [studentGlobalId]);

    await adminClient.query(`
      INSERT INTO public.parent_child_links (parent_ref, student_global_id, current_link_active, first_linked_at)
      VALUES ($1, $2, true, NOW())
      ON CONFLICT (parent_ref, student_global_id) DO UPDATE SET current_link_active = true;
    `, [parentRef, studentGlobalId]);

    const subId = randomUUID();
    await adminClient.query(`
      INSERT INTO public.parent_subscriptions (
        id, student_global_id, parent_ref, school_slug, student_ref, pricing_id, status
      ) VALUES ($1, $2, $3, $4, 'STD_LOCAL_1', $5, 'active');
    `, [subId, studentGlobalId, parentRef, schoolSlug, globalPricingId]);
    testCreatedIds.subIds.push(subId);

    const intentId = randomUUID();
    await adminClient.query(`
      INSERT INTO public.payment_intents (
        id, target_id, school_slug, expected_amount, expected_currency,
        payment_type, provider, provider_transaction_id, status, metadata,
        expires_at, processed_at
      ) VALUES ($1, $2, $3, $4, $5, 'parent_pack', 'fedapay', $6, 'completed',
        jsonb_build_object('student_global_id', $7::text, 'parent_ref', $8::text),
        NOW() + INTERVAL '1 day', $9::timestamptz);
    `, [intentId, subId, schoolSlug, amount, currency, providerTxId, studentGlobalId, parentRef, processedAt]);
    testCreatedIds.intentIds.push(intentId);

    const periodId = randomUUID();
    await adminClient.query(`
      INSERT INTO public.parent_subscription_periods (
        id, subscription_id, payment_intent_id, start_date, end_date, status
      ) VALUES ($1, $2, $3, CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', 'active');
    `, [periodId, subId, intentId]);
    testCreatedIds.periodIds.push(periodId);

    const schoolLedgerId = randomUUID();
    await adminClient.query(`
      INSERT INTO public.school_commission_ledger (
        id, period_id, school_slug, ambassador_ref,
        gross_amount_minor, fedapay_fee_minor, school_share_minor,
        ambassador_share_minor, yziow_share_minor, currency, type
      ) VALUES ($1, $2, $3, null, 1000, 50, 200, 0, 750, 'XOF', 'credit');
    `, [schoolLedgerId, periodId, schoolSlug]);

    setupSupabaseMock({ periodId, subId, intentId, parentRef, schoolSlug, status: 'active', providerTxId, amount, currency, processedAt });

    return { periodId, subId, intentId, studentGlobalId, parentRef, schoolSlug, providerTxId, amount, currency, processedAt };
  }

  function setupSupabaseMock({ periodId, subId, intentId, parentRef, schoolSlug, status, providerTxId, amount, currency, processedAt }) {
    supabase.from = (table) => {
      if (table === 'parent_subscription_periods') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: periodId, subscription_id: subId, payment_intent_id: intentId, status },
                error: null
              })
            })
          })
        };
      }
      if (table === 'parent_subscriptions') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: subId, parent_ref: parentRef, school_slug: schoolSlug, status: 'active' },
                error: null
              })
            })
          })
        };
      }
      if (table === 'payment_intents') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: intentId,
                  status: 'completed',
                  provider_transaction_id: providerTxId,
                  expected_amount: amount,
                  expected_currency: currency,
                  processed_at: processedAt
                },
                error: null
              })
            })
          })
        };
      }
      if (table === 'parent_pack_refund_audits') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => {
                const res = await adminClient.query(`SELECT id, provider_refund_id, created_at FROM public.parent_pack_refund_audits WHERE period_id = $1 LIMIT 1`, [periodId]);
                return { data: res.rows[0] || null, error: null };
              }
            })
          })
        };
      }
      return originalFrom.call(supabase, table);
    };
  }

  // 1. Identifiant de transaction FedaPay absent
  it('1. Refus immédiat si provider_transaction_id est absent du payment_intent', async () => {
    const fixture = await seedFixture();
    setupSupabaseMock({ ...fixture, providerTxId: null });

    const res = await refundParentPackSubscriptionAdmin({
      periodId: fixture.periodId,
      providerRefundId: 'fedapay_ref_valid_123',
      adminActorId: superAdminId,
      approverAdminId,
      proof: buildValidProof(fixture)
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'NO_PROVIDER_TX_ID');
  });

  // 2. Transaction non remboursée
  it('2. Refus strict si la transaction FedaPay n\'est pas remboursée', async () => {
    const fixture = await seedFixture();
    const mockFedapay = {
      retrieveTransaction: async () => ({
        id: fixture.providerTxId,
        status: 'approved',
        amount: fixture.amount,
        currency: fixture.currency,
        wasRefunded: () => false
      })
    };

    const res = await refundParentPackSubscriptionAdmin({
      periodId: fixture.periodId,
      providerRefundId: 'fedapay_ref_valid_123',
      adminActorId: superAdminId,
      approverAdminId,
      proof: buildValidProof(fixture),
      fedapayClient: mockFedapay
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'TRANSACTION_NOT_REFUNDED_ON_PROVIDER');
  });

  // 3. Remboursement partiel
  it('3. Refus strict si le remboursement FedaPay est partiel', async () => {
    const fixture = await seedFixture();
    const mockFedapayPartial = {
      retrieveTransaction: async () => ({
        id: fixture.providerTxId,
        status: 'approved_partially_refunded',
        amount: fixture.amount,
        currency: fixture.currency,
        wasRefunded: () => true,
        wasPartiallyRefunded: () => true
      })
    };

    const res = await refundParentPackSubscriptionAdmin({
      periodId: fixture.periodId,
      providerRefundId: 'fedapay_ref_valid_123',
      adminActorId: superAdminId,
      approverAdminId,
      proof: buildValidProof(fixture),
      fedapayClient: mockFedapayPartial
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'PARTIAL_REFUND_NOT_SUPPORTED');
  });

  // 4. Montant ou devise manquant ou incorrect
  it('4A. Refus si le montant FedaPay est absent', async () => {
    const fixture = await seedFixture();
    const mockMissingAmount = {
      retrieveTransaction: async () => ({
        id: fixture.providerTxId,
        status: 'refunded',
        currency: fixture.currency,
        amount: null
      })
    };

    const res = await refundParentPackSubscriptionAdmin({
      periodId: fixture.periodId,
      providerRefundId: 'fedapay_ref_valid_123',
      adminActorId: superAdminId,
      approverAdminId,
      proof: buildValidProof(fixture),
      fedapayClient: mockMissingAmount
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'PROVIDER_AMOUNT_MISSING');
  });

  it('4B. Refus si le montant FedaPay ne correspond pas à l\'intention', async () => {
    const fixture = await seedFixture();
    const mockWrongAmount = {
      retrieveTransaction: async () => ({
        id: fixture.providerTxId,
        status: 'refunded',
        amount: 500,
        currency: fixture.currency
      })
    };

    const res = await refundParentPackSubscriptionAdmin({
      periodId: fixture.periodId,
      providerRefundId: 'fedapay_ref_valid_123',
      adminActorId: superAdminId,
      approverAdminId,
      proof: buildValidProof(fixture),
      fedapayClient: mockWrongAmount
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'PROVIDER_AMOUNT_MISMATCH');
  });

  it('4C. Refus si la devise FedaPay ne correspond pas à l\'intention', async () => {
    const fixture = await seedFixture();
    const mockWrongCurrency = {
      retrieveTransaction: async () => ({
        id: fixture.providerTxId,
        status: 'refunded',
        amount: fixture.amount,
        currency: 'USD'
      })
    };

    const res = await refundParentPackSubscriptionAdmin({
      periodId: fixture.periodId,
      providerRefundId: 'fedapay_ref_valid_123',
      adminActorId: superAdminId,
      approverAdminId,
      proof: buildValidProof(fixture),
      fedapayClient: mockWrongCurrency
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'PROVIDER_CURRENCY_MISMATCH');
  });

  // 5. Connexion PostgreSQL dédiée absente ou refusée
  it('5. Refus fail-closed si YZIOW_REFUND_DATABASE_URL est absente', async () => {
    const fixture = await seedFixture();
    const originalEnv = process.env.YZIOW_REFUND_DATABASE_URL;
    delete process.env.YZIOW_REFUND_DATABASE_URL;

    const mockFedapay = {
      retrieveTransaction: async () => ({
        id: fixture.providerTxId,
        status: 'refunded',
        amount: fixture.amount,
        currency: fixture.currency
      })
    };

    try {
      const res = await refundParentPackSubscriptionAdmin({
        periodId: fixture.periodId,
        providerRefundId: 'fedapay_ref_valid_123',
        adminActorId: superAdminId,
        approverAdminId,
        proof: buildValidProof(fixture),
        fedapayClient: mockFedapay
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.code, 'REFUND_RPC_ERROR');
      assert.ok(res.message.includes('missing') || res.message.includes('not configured'));
    } finally {
      process.env.YZIOW_REFUND_DATABASE_URL = originalEnv;
    }
  });

  // 6 & 7. Droits PostgreSQL : yziow_refund_executor autorise, service_role refuse
  it('6 & 7. Privilèges PostgreSQL : yziow_refund_executor a EXECUTE sur les RPC de rapprochement, service_role est strictement rejeté', async () => {
    const createSig = 'admin_create_parent_pack_refund_reconciliation(uuid, uuid, text, text, text, bigint, text, text, text, bigint, text, text, timestamp with time zone, text, text)';
    const approveSig = 'admin_approve_parent_pack_refund_reconciliation(uuid, uuid, text, text, bigint, text, text)';

    const execCreate = await adminClient.query(`SELECT has_function_privilege('yziow_refund_executor', '${createSig}', 'EXECUTE') AS ok`);
    assert.strictEqual(execCreate.rows[0].ok, true);

    const srvCreate = await adminClient.query(`SELECT has_function_privilege('service_role', '${createSig}', 'EXECUTE') AS ok`);
    assert.strictEqual(srvCreate.rows[0].ok, false);

    const execApprove = await adminClient.query(`SELECT has_function_privilege('yziow_refund_executor', '${approveSig}', 'EXECUTE') AS ok`);
    assert.strictEqual(execApprove.rows[0].ok, true);

    const srvApprove = await adminClient.query(`SELECT has_function_privilege('service_role', '${approveSig}', 'EXECUTE') AS ok`);
    assert.strictEqual(srvApprove.rows[0].ok, false);
  });

  // 7B. Rejet strict de toute écriture directe par yziow_refund_executor sur les tables
  it('7B. Sécurité fail-closed : yziow_refund_executor ne peut faire aucun INSERT direct sur parent_pack_refund_audits ni parent_pack_refund_reconciliations', async () => {
    const tableInsertPriv = await adminClient.query(`
      SELECT has_table_privilege('yziow_refund_executor', 'public.parent_pack_refund_audits', 'INSERT') AS ok;
    `);
    assert.strictEqual(tableInsertPriv.rows[0].ok, false);

    const recInsertPriv = await adminClient.query(`
      SELECT has_table_privilege('yziow_refund_executor', 'public.parent_pack_refund_reconciliations', 'INSERT') AS ok;
    `);
    assert.strictEqual(recInsertPriv.rows[0].ok, false);

    const executorClient = new Client({ connectionString: executorUrl });
    await executorClient.connect();
    try {
      await assert.rejects(
        async () => {
          await executorClient.query(`
            INSERT INTO public.parent_pack_refund_reconciliations (
              period_id, subscription_id, payment_intent_id, internal_reconciliation_ref,
              provider_transaction_id, verified_provider_status, verified_amount_minor, verified_currency,
              initiator_admin_id, reason, proof_storage_path, proof_document_hash,
              proof_refunded_amount_minor, proof_currency, proof_beneficiary_ref, proof_refunded_at
            ) VALUES (
              gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'rec_illegal_direct',
              'tx_123', 'refunded', 1000, 'XOF', gen_random_uuid(), 'illegal',
              'private://proofs/illegal.pdf', '${validProofHash}', 1000, 'XOF', '+22990000000', NOW()
            );
          `);
        },
        (err) => {
          assert.strictEqual(err.code, '42501', 'Must fail with 42501 (permission denied)');
          return true;
        }
      );
    } finally {
      await executorClient.end();
    }
  });

  // 8. Remboursement complet à double validation avec FedaPay simulé
  it('8. Remboursement complet nominal à double validation avec yziow_refund_executor', async () => {
    const fixture = await seedFixture();
    const refundRef = `fedapay_ref_${randomUUID()}`;

    const mockFedapay = {
      retrieveTransaction: async () => ({
        id: fixture.providerTxId,
        status: 'refunded',
        amount: fixture.amount,
        currency: fixture.currency
      })
    };

    const res = await refundParentPackSubscriptionAdmin({
      periodId: fixture.periodId,
      providerRefundId: refundRef,
      adminActorId: superAdminId,
      approverAdminId,
      proof: buildValidProof(fixture),
      reason: 'Test remboursement nominal à double validation',
      fedapayClient: mockFedapay
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.code, 'REFUND_COMPLETED');
    assert.strictEqual(res.data.status, 'success');
    assert.strictEqual(res.data.period_id, fixture.periodId);
    assert.strictEqual(res.data.initiator_admin_id, superAdminId);
    assert.strictEqual(res.data.approver_admin_id, approverAdminId);

    const periodDb = await adminClient.query(`SELECT status FROM public.parent_subscription_periods WHERE id = $1`, [fixture.periodId]);
    assert.strictEqual(periodDb.rows[0].status, 'refunded');

    const intentDb = await adminClient.query(`SELECT status FROM public.payment_intents WHERE id = $1`, [fixture.intentId]);
    assert.strictEqual(intentDb.rows[0].status, 'refunded');

    const auditDb = await adminClient.query(`SELECT * FROM public.parent_pack_refund_audits WHERE period_id = $1`, [fixture.periodId]);
    assert.strictEqual(auditDb.rows.length, 1);
    assert.strictEqual(auditDb.rows[0].provider_refund_id, refundRef);
    assert.strictEqual(auditDb.rows[0].initiator_admin_id, superAdminId);
    assert.strictEqual(auditDb.rows[0].approver_admin_id, approverAdminId);
  });

  // 9. Idempotence et absence de double compensation
  it('9. Idempotence : un second appel retourne ALREADY_REFUNDED sans double écriture', async () => {
    const fixture = await seedFixture();
    const refundRef = `fedapay_ref_${randomUUID()}`;
    const mockFedapay = {
      retrieveTransaction: async () => ({
        id: fixture.providerTxId,
        status: 'refunded',
        amount: fixture.amount,
        currency: fixture.currency
      })
    };

    const res1 = await refundParentPackSubscriptionAdmin({
      periodId: fixture.periodId,
      providerRefundId: refundRef,
      adminActorId: superAdminId,
      approverAdminId,
      proof: buildValidProof(fixture),
      fedapayClient: mockFedapay
    });
    assert.strictEqual(res1.success, true);

    setupSupabaseMock({ ...fixture, status: 'refunded' });

    const res2 = await refundParentPackSubscriptionAdmin({
      periodId: fixture.periodId,
      providerRefundId: refundRef,
      adminActorId: superAdminId,
      approverAdminId,
      proof: buildValidProof(fixture),
      fedapayClient: mockFedapay
    });
    assert.strictEqual(res2.success, true);
    assert.strictEqual(res2.code, 'ALREADY_REFUNDED');

    const auditCount = await adminClient.query(`SELECT count(*)::int AS cnt FROM public.parent_pack_refund_audits WHERE period_id = $1`, [fixture.periodId]);
    assert.strictEqual(auditCount.rows[0].cnt, 1);

    const cancelCount = await adminClient.query(`SELECT count(*)::int AS cnt FROM public.school_commission_ledger WHERE period_id = $1 AND type = 'cancellation'`, [fixture.periodId]);
    assert.strictEqual(cancelCount.rows[0].cnt, 1);
  });

  // 10. Révocation des accès payants
  it('10. Révocation des accès payants après remboursement', async () => {
    const fixture = await seedFixture();
    const refundRef = `fedapay_ref_${randomUUID()}`;
    const mockFedapay = {
      retrieveTransaction: async () => ({
        id: fixture.providerTxId,
        status: 'refunded',
        amount: fixture.amount,
        currency: fixture.currency
      })
    };

    await refundParentPackSubscriptionAdmin({
      periodId: fixture.periodId,
      providerRefundId: refundRef,
      adminActorId: superAdminId,
      approverAdminId,
      proof: buildValidProof(fixture),
      fedapayClient: mockFedapay
    });

    supabase.rpc = async (fn) => {
      if (fn === 'get_active_parent_pack_subscriptions') {
        return { data: [], error: null };
      }
      return originalRpc.call(supabase, fn);
    };

    supabase.from = (table) => {
      if (table === 'parent_child_links') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                in: async () => ({
                  data: [{ student_global_id: fixture.studentGlobalId, first_linked_at: '2026-01-01', current_link_active: true }],
                  error: null
                })
              })
            })
          })
        };
      }
      return originalFrom.call(supabase, table);
    };

    const states = await getAccessStatesForGlobalIds(fixture.parentRef, [fixture.studentGlobalId]);
    assert.strictEqual(states[fixture.studentGlobalId].accessAllowed, false);
    assert.strictEqual(states[fixture.studentGlobalId].state, ACCESS_STATES.PACK_SUSPENDED);
  });

  // 11. Piste d'audit vérifiable sur les enregistrements de test terminés
  it('11. Piste d\'audit vérifiable sur les enregistrements de test terminés', async () => {
    const auditRes = await adminClient.query(`
      SELECT period_id FROM public.parent_pack_refund_audits
      WHERE period_id = ANY($1::uuid[]);
    `, [testCreatedIds.periodIds]);

    assert.ok(auditRes.rows.length >= 2, 'Tracked test audits exist in database');
  });

  // 12. Blocage fail-closed (SECURITY_BLOCKER) de tout appel unilatéral sur simple référence déclarative
  it('12. SECURITY_BLOCKER : refus fail-closed de toute compensation automatique sur simple référence déclarative', async () => {
    const fixture = await seedFixture();
    const mockFedapay = {
      retrieveTransaction: async () => ({
        id: fixture.providerTxId,
        status: 'refunded',
        amount: fixture.amount,
        currency: fixture.currency
      })
    };

    const res = await refundParentPackSubscriptionAdmin({
      periodId: fixture.periodId,
      providerRefundId: 'fedapay_ref_valid_123',
      adminActorId: superAdminId,
      fedapayClient: mockFedapay
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'SECURITY_BLOCKER');

    // Aucune écriture financière ni révocation de droits ne doit avoir eu lieu
    const periodDb = await adminClient.query(`SELECT status FROM public.parent_subscription_periods WHERE id = $1`, [fixture.periodId]);
    assert.strictEqual(periodDb.rows[0].status, 'active');

    const subDb = await adminClient.query(`SELECT status FROM public.parent_subscriptions WHERE id = $1`, [fixture.subId]);
    assert.strictEqual(subDb.rows[0].status, 'active');

    const cancelCount = await adminClient.query(
      `SELECT count(*)::int AS cnt FROM public.school_commission_ledger WHERE period_id = $1 AND type = 'cancellation'`,
      [fixture.periodId]
    );
    assert.strictEqual(cancelCount.rows[0].cnt, 0);
  });

  // 13. Double validation stricte (DUAL_CUSTODY_VIOLATION si initiator === approver)
  it('13. Refus fail-closed si initiator et approver sont le même administrateur', async () => {
    const fixture = await seedFixture();
    const mockFedapay = {
      retrieveTransaction: async () => ({
        id: fixture.providerTxId,
        status: 'refunded',
        amount: fixture.amount,
        currency: fixture.currency
      })
    };

    const res = await refundParentPackSubscriptionAdmin({
      periodId: fixture.periodId,
      providerRefundId: 'fedapay_ref_valid_123',
      adminActorId: superAdminId,
      approverAdminId: superAdminId,
      proof: buildValidProof(fixture),
      fedapayClient: mockFedapay
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'DUAL_CUSTODY_VIOLATION');
  });

  // 14. Refus fail-closed si le justificatif est manquant, incomplet ou contradictoire même avec 2 SuperAdmins distincts
  it('14. Refus fail-closed si le justificatif est absent, incomplet ou contradictoire (même avec deux SuperAdmins distincts)', async () => {
    const fixture = await seedFixture();
    const mockFedapay = {
      retrieveTransaction: async () => ({
        id: fixture.providerTxId,
        status: 'refunded',
        amount: fixture.amount,
        currency: fixture.currency
      })
    };

    // 14A: Justificatif absent
    const resMissingProof = await refundParentPackSubscriptionAdmin({
      periodId: fixture.periodId,
      providerRefundId: 'fedapay_ref_valid_123',
      adminActorId: superAdminId,
      approverAdminId,
      proof: null,
      fedapayClient: mockFedapay
    });
    assert.strictEqual(resMissingProof.success, false);
    assert.strictEqual(resMissingProof.code, 'SECURITY_BLOCKER');

    // 14B: Empreinte SHA-256 ne correspondant pas au contenu binaire fourni
    const resBadContentHash = await refundParentPackSubscriptionAdmin({
      periodId: fixture.periodId,
      providerRefundId: 'fedapay_ref_valid_123',
      adminActorId: superAdminId,
      approverAdminId,
      proof: buildValidProof(fixture, { rawContent: 'Contenu altéré non conforme au hash' }),
      fedapayClient: mockFedapay
    });
    assert.strictEqual(resBadContentHash.success, false);
    assert.strictEqual(resBadContentHash.code, 'PROOF_HASH_CONTENT_MISMATCH');

    // 14C: Montant du justificatif contradictoire
    const resBadAmount = await refundParentPackSubscriptionAdmin({
      periodId: fixture.periodId,
      providerRefundId: 'fedapay_ref_valid_123',
      adminActorId: superAdminId,
      approverAdminId,
      proof: buildValidProof(fixture, { refundedAmountMinor: 750 }),
      fedapayClient: mockFedapay
    });
    assert.strictEqual(resBadAmount.success, false);
    assert.strictEqual(resBadAmount.code, 'PROOF_AMOUNT_MISMATCH');

    // 14D: Bénéficiaire du justificatif contradictoire
    const resBadBeneficiary = await refundParentPackSubscriptionAdmin({
      periodId: fixture.periodId,
      providerRefundId: 'fedapay_ref_valid_123',
      adminActorId: superAdminId,
      approverAdminId,
      proof: buildValidProof(fixture, { beneficiaryRef: '+22990000999' }),
      fedapayClient: mockFedapay
    });
    assert.strictEqual(resBadBeneficiary.success, false);
    assert.strictEqual(resBadBeneficiary.code, 'PROOF_BENEFICIARY_MISMATCH');

    // 14E: Date du remboursement antérieure au paiement initial
    const resBadDate = await refundParentPackSubscriptionAdmin({
      periodId: fixture.periodId,
      providerRefundId: 'fedapay_ref_valid_123',
      adminActorId: superAdminId,
      approverAdminId,
      proof: buildValidProof(fixture, { refundedAt: '2020-01-01T00:00:00.000Z' }),
      fedapayClient: mockFedapay
    });
    assert.strictEqual(resBadDate.success, false);
    assert.strictEqual(resBadDate.code, 'PROOF_DATE_INVALID');
  });

  // 15. Workflow explicite en 2 étapes avec provider_refund_id = null (distinction internal_reconciliation_ref)
  it('15. Workflow explicite en 2 étapes : création par SuperAdmin #1 puis approbation par SuperAdmin #2 (sans inventer de référence fournisseur)', async () => {
    const fixture = await seedFixture();
    const internalRef = `rec_p28c_step_${randomUUID().replace(/-/g, '')}`;

    const mockFedapay = {
      retrieveTransaction: async () => ({
        id: fixture.providerTxId,
        status: 'refunded',
        amount: fixture.amount,
        currency: fixture.currency
      })
    };

    // Étape 1 : SuperAdmin #1 crée la demande de rapprochement (providerRefundId = null car FedaPay n'en fournit pas)
    const initRes = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      reason: 'Demande de rapprochement avec justificatif archivé',
      proof: buildValidProof(fixture),
      internalReconciliationRef: internalRef,
      providerRefundId: null,
      fedapayClient: mockFedapay
    });

    assert.strictEqual(initRes.success, true);
    assert.strictEqual(initRes.code, 'RECONCILIATION_PENDING_APPROVAL');
    assert.strictEqual(initRes.data.status, 'pending_approval');
    assert.strictEqual(initRes.data.internal_reconciliation_ref, internalRef);
    assert.strictEqual(initRes.data.provider_refund_id, null);
    assert.strictEqual(initRes.data.initiator_admin_id, superAdminId);

    // À ce stade, la période est toujours 'active' (aucune compensation exécutée)
    const periodBeforeApprove = await adminClient.query(`SELECT status FROM public.parent_subscription_periods WHERE id = $1`, [fixture.periodId]);
    assert.strictEqual(periodBeforeApprove.rows[0].status, 'active');

    // Tentative d'auto-approbation par SuperAdmin #1 -> refusée
    const selfApproveRes = await approveAndExecuteParentPackRefundReconciliation({
      reconciliationId: initRes.data.reconciliation_id,
      approverAdminId: superAdminId,
      fedapayClient: mockFedapay
    });
    assert.strictEqual(selfApproveRes.success, false);
    assert.strictEqual(selfApproveRes.code, 'DUAL_CUSTODY_VIOLATION');

    // Étape 2 : Approbation par SuperAdmin #2 -> exécution atomique
    const approveRes = await approveAndExecuteParentPackRefundReconciliation({
      reconciliationId: initRes.data.reconciliation_id,
      approverAdminId,
      approvalNotes: 'Vérification conforme du justificatif et du montant FedaPay',
      fedapayClient: mockFedapay
    });

    assert.strictEqual(approveRes.success, true);
    assert.strictEqual(approveRes.code, 'REFUND_COMPLETED');
    assert.strictEqual(approveRes.data.status, 'success');
    assert.strictEqual(approveRes.data.internal_reconciliation_ref, internalRef);
    assert.strictEqual(approveRes.data.provider_refund_id, null);
    assert.strictEqual(approveRes.data.provider_refund_id_certified, false);
    assert.strictEqual(approveRes.data.initiator_admin_id, superAdminId);
    assert.strictEqual(approveRes.data.approver_admin_id, approverAdminId);

    const periodAfterApprove = await adminClient.query(`SELECT status FROM public.parent_subscription_periods WHERE id = $1`, [fixture.periodId]);
    assert.strictEqual(periodAfterApprove.rows[0].status, 'refunded');
  });
});