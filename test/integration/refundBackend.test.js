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
  validateIndependentRefundProof,
  createParentPackRefundReconciliationRequest,
  approveAndExecuteParentPackRefundReconciliation,
  getAccessStatesForGlobalIds,
  ACCESS_STATES
} = require('../../backend/services/parentPackService.js');
const {
  createInMemoryProofStorageMock,
  verifyRefundProofAuthorization,
  storeRefundProofDocument,
  readAndVerifyStoredRefundProof,
  verifyRefundProofBytes,
  MAX_PROOF_FILE_SIZE_BYTES
} = require('../../backend/services/refundProofStorage.js');

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
  const validRawProofContent = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n% Justificatif officiel FedaPay P28c - Remboursement integral\n%%EOF\n',
    'utf8'
  );
  const validProofHash = createHash('sha256').update(validRawProofContent).digest('hex');
  const originalFrom = supabase.from;
  const originalRpc = supabase.rpc;
  const originalStorage = supabase.storage;
  const proofStorageMock = createInMemoryProofStorageMock();
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
      REVOKE ALL ON public.parent_pack_refund_security_gate FROM PUBLIC, anon, authenticated, service_role, yziow_refund_executor;
      REVOKE ALL ON public.superadmins FROM yziow_refund_executor;
      REVOKE ALL ON public.school_commission_ledger FROM yziow_refund_executor;
      REVOKE ALL ON public.affiliate_ledger FROM yziow_refund_executor;
      REVOKE ALL ON public.affiliate_balances FROM yziow_refund_executor;
      REVOKE ALL ON public.payment_intents FROM yziow_refund_executor;
      REVOKE ALL ON public.parent_subscription_periods FROM yziow_refund_executor;
      REVOKE ALL ON public.parent_subscriptions FROM yziow_refund_executor;
    `);

    process.env.YZIOW_REFUND_DATABASE_URL = executorUrl;
    supabase.storage = proofStorageMock;
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
      supabase.storage = originalStorage;
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

  async function withUnlockedSecurityGate(fn) {
    await adminClient.query(`
      UPDATE public.parent_pack_refund_security_gate
      SET independent_admin_auth_ready = true,
          independent_fedapay_proof_ready = true,
          private_worm_storage_ready = true
      WHERE id = true
    `);
    try {
      return await fn();
    } finally {
      await adminClient.query(`
        UPDATE public.parent_pack_refund_security_gate
        SET independent_admin_auth_ready = false,
            independent_fedapay_proof_ready = false,
            private_worm_storage_ready = false
        WHERE id = true
      `);
    }
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
      const res = await createParentPackRefundReconciliationRequest({
        periodId: fixture.periodId,
        initiatorAdminId: superAdminId,
        reason: 'Test connexion PostgreSQL dédiée absente',
        proof: buildValidProof(fixture),
        providerRefundId: 'fedapay_ref_valid_123',
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
  it('7B. Sécurité fail-closed : yziow_refund_executor ne peut faire aucun INSERT/UPDATE direct sur parent_pack_refund_audits, parent_pack_refund_reconciliations ni parent_pack_refund_security_gate', async () => {
    const tableInsertPriv = await adminClient.query(`
      SELECT has_table_privilege('yziow_refund_executor', 'public.parent_pack_refund_audits', 'INSERT') AS ok;
    `);
    assert.strictEqual(tableInsertPriv.rows[0].ok, false);

    const recInsertPriv = await adminClient.query(`
      SELECT has_table_privilege('yziow_refund_executor', 'public.parent_pack_refund_reconciliations', 'INSERT') AS ok;
    `);
    assert.strictEqual(recInsertPriv.rows[0].ok, false);

    const gateUpdatePriv = await adminClient.query(`
      SELECT has_table_privilege('yziow_refund_executor', 'public.parent_pack_refund_security_gate', 'UPDATE') AS exec_ok,
             has_table_privilege('service_role', 'public.parent_pack_refund_security_gate', 'UPDATE') AS srv_ok;
    `);
    assert.strictEqual(gateUpdatePriv.rows[0].exec_ok, false);
    assert.strictEqual(gateUpdatePriv.rows[0].srv_ok, false);

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

      await assert.rejects(
        async () => {
          await executorClient.query(`
            UPDATE public.parent_pack_refund_security_gate
            SET independent_admin_auth_ready = true,
                independent_fedapay_proof_ready = true,
                private_worm_storage_ready = true;
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

  // 8. Remboursement complet à double validation en 2 étapes explicites (lorsque la porte de sécurité est déverrouillée par superuser)
  it('8. Remboursement complet nominal en 2 étapes explicites (initiation + approbation) avec yziow_refund_executor', async () => {
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

    const initRes = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      reason: 'Test remboursement nominal à double validation',
      proof: buildValidProof(fixture),
      providerRefundId: refundRef,
      fedapayClient: mockFedapay
    });
    assert.strictEqual(initRes.success, true);
    assert.strictEqual(initRes.code, 'RECONCILIATION_PENDING_APPROVAL');

    const res = await withUnlockedSecurityGate(() =>
      approveAndExecuteParentPackRefundReconciliation({
        reconciliationId: initRes.data.reconciliation_id,
        approverAdminId,
        approvalNotes: 'Seconde validation conforme',
        fedapayClient: mockFedapay
      })
    );

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

    const initRes = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      reason: 'Premier remboursement idempotent',
      proof: buildValidProof(fixture),
      providerRefundId: refundRef,
      fedapayClient: mockFedapay
    });
    assert.strictEqual(initRes.success, true);

    const res1 = await withUnlockedSecurityGate(() =>
      approveAndExecuteParentPackRefundReconciliation({
        reconciliationId: initRes.data.reconciliation_id,
        approverAdminId,
        fedapayClient: mockFedapay
      })
    );
    assert.strictEqual(res1.success, true);

    setupSupabaseMock({ ...fixture, status: 'refunded' });

    const res2 = await approveAndExecuteParentPackRefundReconciliation({
      reconciliationId: initRes.data.reconciliation_id,
      approverAdminId,
      fedapayClient: mockFedapay
    });
    assert.strictEqual(res2.success, true);
    assert.strictEqual(res2.code, 'ALREADY_REFUNDED');

    const resLegacyIdempotent = await refundParentPackSubscriptionAdmin({
      periodId: fixture.periodId,
      providerRefundId: refundRef,
      adminActorId: superAdminId,
      fedapayClient: mockFedapay
    });
    assert.strictEqual(resLegacyIdempotent.success, true);
    assert.strictEqual(resLegacyIdempotent.code, 'ALREADY_REFUNDED');

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

    const initRes = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      reason: 'Révocation droits accès',
      proof: buildValidProof(fixture),
      providerRefundId: refundRef,
      fedapayClient: mockFedapay
    });
    assert.strictEqual(initRes.success, true);

    const approveRes = await withUnlockedSecurityGate(() =>
      approveAndExecuteParentPackRefundReconciliation({
        reconciliationId: initRes.data.reconciliation_id,
        approverAdminId,
        fedapayClient: mockFedapay
      })
    );
    assert.strictEqual(approveRes.success, true);

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

  // 12. Verrouillage fail-closed par défaut (SECURITY_BLOCKER) sur tous les chemins de compensation
  it('12. SECURITY_BLOCKER : blocage fail-closed de refundParentPackSubscriptionAdmin (même avec 2 admins + preuve), de approveAndExecuteParentPackRefundReconciliation par défaut, et des appels directs yziow_refund_executor', async () => {
    const fixture = await seedFixture();
    const mockFedapay = {
      retrieveTransaction: async () => ({
        id: fixture.providerTxId,
        status: 'refunded',
        amount: fixture.amount,
        currency: fixture.currency
      })
    };

    // 12A: Appel déclaratif classique à refundParentPackSubscriptionAdmin -> SECURITY_BLOCKER
    const resUnilateral = await refundParentPackSubscriptionAdmin({
      periodId: fixture.periodId,
      providerRefundId: 'fedapay_ref_valid_123',
      adminActorId: superAdminId,
      fedapayClient: mockFedapay
    });
    assert.strictEqual(resUnilateral.success, false);
    assert.strictEqual(resUnilateral.code, 'SECURITY_BLOCKER');

    // 12B: Tentative d'enchaîner initiation + approbation dans un seul appel à refundParentPackSubscriptionAdmin
    //      (même en fournissant 2 SuperAdmins distincts + justificatif valide) -> SECURITY_BLOCKER (aucun dossier créé)
    const resChainedAttempt = await refundParentPackSubscriptionAdmin({
      periodId: fixture.periodId,
      providerRefundId: 'fedapay_ref_valid_123',
      adminActorId: superAdminId,
      approverAdminId,
      proof: buildValidProof(fixture),
      fedapayClient: mockFedapay
    });
    assert.strictEqual(resChainedAttempt.success, false);
    assert.strictEqual(resChainedAttempt.code, 'SECURITY_BLOCKER');

    const recCountAfterChained = await adminClient.query(
      `SELECT count(*)::int AS cnt FROM public.parent_pack_refund_reconciliations WHERE period_id = $1`,
      [fixture.periodId]
    );
    assert.strictEqual(recCountAfterChained.rows[0].cnt, 0, 'refundParentPackSubscriptionAdmin must never create or chain a reconciliation');

    // 12C: Création légitime d'un dossier pending_approval (Étape 1), puis tentative d'approbation (Étape 2)
    //      avec la porte de sécurité dans son état par défaut (verrouillée) -> SECURITY_BLOCKER
    const initRes = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      reason: 'Dossier en attente de garanties externes',
      proof: buildValidProof(fixture),
      providerRefundId: `fedapay_ref_locked_${randomUUID()}`,
      fedapayClient: mockFedapay
    });
    assert.strictEqual(initRes.success, true);
    assert.strictEqual(initRes.code, 'RECONCILIATION_PENDING_APPROVAL');

    const approveLockedRes = await approveAndExecuteParentPackRefundReconciliation({
      reconciliationId: initRes.data.reconciliation_id,
      approverAdminId,
      approvalNotes: 'Tentative approbation avec gate par défaut',
      fedapayClient: mockFedapay
    });
    assert.strictEqual(approveLockedRes.success, false);
    assert.strictEqual(approveLockedRes.code, 'SECURITY_BLOCKER');

    // 12D: Appel SQL direct via la connexion dédiée yziow_refund_executor (contournant le backend Node.js)
    const executorClient = new Client({ connectionString: executorUrl });
    await executorClient.connect();
    try {
      await assert.rejects(
        async () => {
          await executorClient.query(
            `SELECT public.admin_process_parent_pack_refund($1, 'fedapay_ref_direct', $2, 'Direct legacy RPC');`,
            [fixture.periodId, superAdminId]
          );
        },
        (err) => {
          assert.match(err.message, /SECURITY_BLOCKER/);
          return true;
        }
      );

      await assert.rejects(
        async () => {
          await executorClient.query(
            `SELECT public.admin_approve_parent_pack_refund_reconciliation($1, $2, $3, 'refunded', $4, $5, 'Direct SQL approve');`,
            [initRes.data.reconciliation_id, approverAdminId, fixture.providerTxId, fixture.amount, fixture.currency]
          );
        },
        (err) => {
          assert.match(err.message, /SECURITY_BLOCKER/);
          return true;
        }
      );
    } finally {
      await executorClient.end();
    }

    // 12E: Vérifier qu'aucune écriture financière ni révocation de droits n'a eu lieu après tous ces refus
    const periodDb = await adminClient.query(`SELECT status FROM public.parent_subscription_periods WHERE id = $1`, [fixture.periodId]);
    assert.strictEqual(periodDb.rows[0].status, 'active');

    const subDb = await adminClient.query(`SELECT status FROM public.parent_subscriptions WHERE id = $1`, [fixture.subId]);
    assert.strictEqual(subDb.rows[0].status, 'active');

    const intentDb = await adminClient.query(`SELECT status FROM public.payment_intents WHERE id = $1`, [fixture.intentId]);
    assert.strictEqual(intentDb.rows[0].status, 'completed');

    const cancelCount = await adminClient.query(
      `SELECT count(*)::int AS cnt FROM public.school_commission_ledger WHERE period_id = $1 AND type = 'cancellation'`,
      [fixture.periodId]
    );
    assert.strictEqual(cancelCount.rows[0].cnt, 0);

    const auditCount = await adminClient.query(
      `SELECT count(*)::int AS cnt FROM public.parent_pack_refund_audits WHERE period_id = $1`,
      [fixture.periodId]
    );
    assert.strictEqual(auditCount.rows[0].cnt, 0);
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

    const initRes = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      reason: 'Initiation pour test dual custody',
      proof: buildValidProof(fixture),
      providerRefundId: `fedapay_ref_dc_${randomUUID()}`,
      fedapayClient: mockFedapay
    });
    assert.strictEqual(initRes.success, true);

    const res = await approveAndExecuteParentPackRefundReconciliation({
      reconciliationId: initRes.data.reconciliation_id,
      approverAdminId: superAdminId,
      fedapayClient: mockFedapay
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'DUAL_CUSTODY_VIOLATION');
  });

  // 14. Refus fail-closed si le justificatif est manquant, incomplet ou contradictoire
  it('14. Refus fail-closed si le justificatif est absent, incomplet ou contradictoire', async () => {
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
    const resMissingProof = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      reason: 'Motif test',
      proof: null,
      providerRefundId: 'fedapay_ref_valid_123',
      fedapayClient: mockFedapay
    });
    assert.strictEqual(resMissingProof.success, false);
    assert.strictEqual(resMissingProof.code, 'SECURITY_BLOCKER');

    // 14B: Empreinte SHA-256 ne correspondant pas au contenu binaire fourni
    const resBadContentHash = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      reason: 'Motif test',
      proof: buildValidProof(fixture, { rawContent: 'Contenu altéré non conforme au hash' }),
      providerRefundId: 'fedapay_ref_valid_123',
      fedapayClient: mockFedapay
    });
    assert.strictEqual(resBadContentHash.success, false);
    assert.strictEqual(resBadContentHash.code, 'PROOF_HASH_CONTENT_MISMATCH');

    // 14C: Montant du justificatif contradictoire
    const resBadAmount = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      reason: 'Motif test',
      proof: buildValidProof(fixture, { refundedAmountMinor: 750 }),
      providerRefundId: 'fedapay_ref_valid_123',
      fedapayClient: mockFedapay
    });
    assert.strictEqual(resBadAmount.success, false);
    assert.strictEqual(resBadAmount.code, 'PROOF_AMOUNT_MISMATCH');

    // 14D: Bénéficiaire du justificatif contradictoire
    const resBadBeneficiary = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      reason: 'Motif test',
      proof: buildValidProof(fixture, { beneficiaryRef: '+22990000999' }),
      providerRefundId: 'fedapay_ref_valid_123',
      fedapayClient: mockFedapay
    });
    assert.strictEqual(resBadBeneficiary.success, false);
    assert.strictEqual(resBadBeneficiary.code, 'PROOF_BENEFICIARY_MISMATCH');

    // 14E: Date du remboursement antérieure au paiement initial
    const resBadDate = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      reason: 'Motif test',
      proof: buildValidProof(fixture, { refundedAt: '2020-01-01T00:00:00.000Z' }),
      providerRefundId: 'fedapay_ref_valid_123',
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

    // Étape 2 : Approbation par SuperAdmin #2 (avec porte de sécurité déverrouillée par superuser pour vérifier l'audit)
    const approveRes = await withUnlockedSecurityGate(() =>
      approveAndExecuteParentPackRefundReconciliation({
        reconciliationId: initRes.data.reconciliation_id,
        approverAdminId,
        approvalNotes: 'Vérification conforme du justificatif et du montant FedaPay',
        fedapayClient: mockFedapay
      })
    );

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

  // =========================================================================
  // CHANTIER D.1 — STOCKAGE PRIVÉ ET VÉRIFICATION D'INTÉGRITÉ DES JUSTIFICATIFS
  // =========================================================================

  // 16. Fichier valide (PDF et image PNG) : calcul serveur SHA-256, stockage privé sans URL publique, et relecture à l'approbation
  it('16. Chantier D.1 — Fichier valide (PDF et PNG) : calcul SHA-256 serveur sur octets réels, stockage privé et relecture à l\'approbation', async () => {
    const fixturePdf = await seedFixture();
    const mockFedapay = {
      retrieveTransaction: async () => ({
        id: fixturePdf.providerTxId,
        status: 'refunded',
        amount: fixturePdf.amount,
        currency: fixturePdf.currency
      })
    };

    // 16A: Justificatif PDF valide sans chemin ni hash pré-déclarés : le serveur calcule le SHA-256 et génère le chemin privé
    const pdfBuffer = Buffer.from(
      '%PDF-1.5\n1 0 obj\n<< /Type /Catalog >>\nendobj\n% Attestation remboursement FedaPay D.1\n%%EOF\n',
      'utf8'
    );
    const expectedServerPdfHash = createHash('sha256').update(pdfBuffer).digest('hex');

    const initPdfRes = await createParentPackRefundReconciliationRequest({
      periodId: fixturePdf.periodId,
      initiatorAdminId: superAdminId,
      reason: 'Chantier D.1 — PDF valide calculé par le serveur',
      proof: {
        fileBuffer: pdfBuffer,
        mimeType: 'application/pdf',
        originalFilename: 'attestation_fedapay.pdf',
        refundedAmountMinor: fixturePdf.amount,
        currency: fixturePdf.currency,
        beneficiaryRef: fixturePdf.parentRef,
        refundedAt: new Date().toISOString()
      },
      fedapayClient: mockFedapay
    });

    assert.strictEqual(initPdfRes.success, true);
    assert.strictEqual(initPdfRes.code, 'RECONCILIATION_PENDING_APPROVAL');

    const recRow = await adminClient.query(
      `SELECT proof_storage_path, proof_document_hash FROM public.parent_pack_refund_reconciliations WHERE id = $1`,
      [initPdfRes.data.reconciliation_id]
    );
    assert.strictEqual(recRow.rows[0].proof_document_hash, expectedServerPdfHash);
    assert.match(recRow.rows[0].proof_storage_path, /^private:\/\/refund-proofs\//);

    // 16B: Justificatif image PNG valide (signature binaire \x89PNG\r\n\x1a\n)
    const fixturePng = await seedFixture();
    const mockFedapayPng = {
      retrieveTransaction: async () => ({
        id: fixturePng.providerTxId,
        status: 'refunded',
        amount: fixturePng.amount,
        currency: fixturePng.currency
      })
    };
    const pngBuffer = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
      Buffer.from('IHDR_FAKE_PNG_BODY_FOR_P28C_D1_VALIDATION_TEST_0123456789', 'utf8')
    ]);
    const expectedPngHash = createHash('sha256').update(pngBuffer).digest('hex');

    const initPngRes = await createParentPackRefundReconciliationRequest({
      periodId: fixturePng.periodId,
      initiatorAdminId: superAdminId,
      reason: 'Chantier D.1 — Capture PNG valide',
      proof: {
        fileBuffer: pngBuffer,
        mimeType: 'image/png',
        originalFilename: 'capture_remboursement.png',
        refundedAmountMinor: fixturePng.amount,
        currency: fixturePng.currency,
        beneficiaryRef: fixturePng.parentRef,
        refundedAt: new Date().toISOString()
      },
      fedapayClient: mockFedapayPng
    });
    assert.strictEqual(initPngRes.success, true);

    const pngRecRow = await adminClient.query(
      `SELECT proof_storage_path, proof_document_hash FROM public.parent_pack_refund_reconciliations WHERE id = $1`,
      [initPngRes.data.reconciliation_id]
    );
    assert.strictEqual(pngRecRow.rows[0].proof_document_hash, expectedPngHash);
    assert.match(pngRecRow.rows[0].proof_storage_path, /\.png$/);

    // Vérifier que les URL publiques permanentes sont interdites sur le bucket privé
    assert.throws(
      () => proofStorageMock.from('refund-proofs').getPublicUrl('any.pdf'),
      /PUBLIC_URL_FORBIDDEN_ON_PRIVATE_PROOF_BUCKET/
    );
  });

  // 17. Format falsifié et limites de taille
  it('17. Chantier D.1 — Refus fail-closed d\'un format falsifié, d\'un PDF piégé ou d\'une taille hors limites', async () => {
    const fixture = await seedFixture();
    const mockFedapay = {
      retrieveTransaction: async () => ({
        id: fixture.providerTxId,
        status: 'refunded',
        amount: fixture.amount,
        currency: fixture.currency
      })
    };

    // 17A: Fichier HTML/JS renommé en .pdf
    const fakeHtmlPdf = Buffer.from('<!DOCTYPE html><html><script>alert(1)</script></html>', 'utf8');
    const fakeHtmlHash = createHash('sha256').update(fakeHtmlPdf).digest('hex');
    const resHtmlDisguised = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      reason: 'Format falsifié HTML',
      proof: buildValidProof(fixture, {
        rawContent: fakeHtmlPdf,
        documentHash: fakeHtmlHash,
        mimeType: 'application/pdf',
        originalFilename: 'faux_recu.pdf'
      }),
      fedapayClient: mockFedapay
    });
    assert.strictEqual(resHtmlDisguised.success, false);
    assert.strictEqual(resHtmlDisguised.code, 'INVALID_PROOF_FILE_FORMAT');

    // 17B: Image PNG déguisée avec extension .pdf
    const pngBytes = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
      Buffer.from('PNG_DISGUISED_AS_PDF_CONTENT_0123456789', 'utf8')
    ]);
    const pngHash = createHash('sha256').update(pngBytes).digest('hex');
    const resPngAsPdf = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      reason: 'PNG déguisé en PDF',
      proof: buildValidProof(fixture, {
        storagePath: `private://refund-proofs/2026/${fixture.periodId}_fake.pdf`,
        rawContent: pngBytes,
        documentHash: pngHash
      }),
      fedapayClient: mockFedapay
    });
    assert.strictEqual(resPngAsPdf.success, false);
    assert.strictEqual(resPngAsPdf.code, 'INVALID_PROOF_FILE_FORMAT');

    // 17C: PDF contenant du code actif (/JavaScript)
    const maliciousPdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>\nendobj\n%%EOF\n', 'utf8');
    const maliciousPdfHash = createHash('sha256').update(maliciousPdf).digest('hex');
    const resMaliciousPdf = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      reason: 'PDF avec JavaScript actif',
      proof: buildValidProof(fixture, {
        rawContent: maliciousPdf,
        documentHash: maliciousPdfHash
      }),
      fedapayClient: mockFedapay
    });
    assert.strictEqual(resMaliciousPdf.success, false);
    assert.strictEqual(resMaliciousPdf.code, 'INVALID_PROOF_FILE_FORMAT');

    // 17D: PDF tronqué sans marqueur %%EOF
    const truncatedPdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\nTRUNCATED_NO_EOF', 'utf8');
    const truncatedPdfHash = createHash('sha256').update(truncatedPdf).digest('hex');
    const resTruncatedPdf = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      reason: 'PDF tronqué sans EOF',
      proof: buildValidProof(fixture, {
        rawContent: truncatedPdf,
        documentHash: truncatedPdfHash
      }),
      fedapayClient: mockFedapay
    });
    assert.strictEqual(resTruncatedPdf.success, false);
    assert.strictEqual(resTruncatedPdf.code, 'INVALID_PROOF_FILE_FORMAT');

    // 17E: Fichier trop petit (< 16 octets) et fichier dépassant 5 Mo
    const tooSmallCheck = verifyRefundProofBytes(Buffer.from('%PDF-1.4'));
    assert.strictEqual(tooSmallCheck.valid, false);
    assert.strictEqual(tooSmallCheck.code, 'INVALID_PROOF_FILE_FORMAT');

    const oversizedBuffer = Buffer.alloc(MAX_PROOF_FILE_SIZE_BYTES + 1, 0x41);
    const tooLargeCheck = verifyRefundProofBytes(oversizedBuffer);
    assert.strictEqual(tooLargeCheck.valid, false);
    assert.strictEqual(tooLargeCheck.code, 'PROOF_FILE_TOO_LARGE');
  });

  // 18. Fichier inexistant (à l'initiation et avant l'approbation)
  it('18. Chantier D.1 — Refus fail-closed si le fichier justificatif est inexistant ou non vérifié binairement', async () => {
    const fixture = await seedFixture();
    const mockFedapay = {
      retrieveTransaction: async () => ({
        id: fixture.providerTxId,
        status: 'refunded',
        amount: fixture.amount,
        currency: fixture.currency
      })
    };

    // 18A: Appel direct à validateIndependentRefundProof avec uniquement un chemin private://... et un hash admin (sans octets) -> PROOF_CONTENT_UNVERIFIED
    const directValidation = validateIndependentRefundProof({
      proof: {
        storagePath: `private://refund-proofs/2026/${fixture.periodId}_ghost.pdf`,
        documentHash: validProofHash,
        refundedAmountMinor: fixture.amount,
        currency: fixture.currency,
        beneficiaryRef: fixture.parentRef,
        refundedAt: new Date().toISOString()
      },
      paymentIntent: {
        expected_amount: fixture.amount,
        expected_currency: fixture.currency,
        processed_at: fixture.processedAt
      },
      subscription: {
        parent_ref: fixture.parentRef
      }
    });
    assert.strictEqual(directValidation.valid, false);
    assert.strictEqual(directValidation.code, 'PROOF_CONTENT_UNVERIFIED');

    // 18B: Initiation avec un chemin private://refund-proofs/... dont le fichier n'existe pas dans le stockage -> PROOF_FILE_NOT_FOUND
    const resGhostInit = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      reason: 'Justificatif fantôme non déposé',
      proof: {
        storagePath: `private://refund-proofs/2026/${fixture.periodId}_missing.pdf`,
        documentHash: validProofHash,
        refundedAmountMinor: fixture.amount,
        currency: fixture.currency,
        beneficiaryRef: fixture.parentRef,
        refundedAt: new Date().toISOString()
      },
      fedapayClient: mockFedapay
    });
    assert.strictEqual(resGhostInit.success, false);
    assert.strictEqual(resGhostInit.code, 'PROOF_FILE_NOT_FOUND');

    // 18C: Initiation valide (fichier stocké), puis suppression du fichier dans le stockage avant l'approbation -> PROOF_FILE_NOT_FOUND
    const initRes = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      reason: 'Dossier dont le fichier sera supprimé avant approbation',
      proof: buildValidProof(fixture),
      fedapayClient: mockFedapay
    });
    assert.strictEqual(initRes.success, true);

    const objectPath = `2026/${fixture.periodId}.pdf`;
    proofStorageMock._deleteObject('refund-proofs', objectPath);

    const approveMissingFileRes = await withUnlockedSecurityGate(() =>
      approveAndExecuteParentPackRefundReconciliation({
        reconciliationId: initRes.data.reconciliation_id,
        approverAdminId,
        fedapayClient: mockFedapay
      })
    );
    assert.strictEqual(approveMissingFileRes.success, false);
    assert.strictEqual(approveMissingFileRes.code, 'PROOF_FILE_NOT_FOUND');
  });

  // 19. Fichier remplacé ou altéré dans le stockage entre l'initiation et l'approbation
  it('19. Chantier D.1 — Refus fail-closed à l\'approbation si le fichier stocké a été remplacé ou altéré (recalcul SHA-256)', async () => {
    const fixture = await seedFixture();
    const mockFedapay = {
      retrieveTransaction: async () => ({
        id: fixture.providerTxId,
        status: 'refunded',
        amount: fixture.amount,
        currency: fixture.currency
      })
    };

    const initRes = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      reason: 'Dossier pour test altération post-stockage',
      proof: buildValidProof(fixture),
      fedapayClient: mockFedapay
    });
    assert.strictEqual(initRes.success, true);

    // Altération d'un octet dans le PDF stocké (toujours un PDF valide syntaxiquement, mais contenu modifié)
    const objectPath = `2026/${fixture.periodId}.pdf`;
    const tamperedPdf = Buffer.from(
      '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n% Justificatif ALTERE APRES DEPOT - Montant falsifie\n%%EOF\n',
      'utf8'
    );
    proofStorageMock._tamperObject('refund-proofs', objectPath, tamperedPdf);

    // Même avec la porte SQL déverrouillée, la revérification binaire avant approbation bloque immédiatement
    const approveTamperedRes = await withUnlockedSecurityGate(() =>
      approveAndExecuteParentPackRefundReconciliation({
        reconciliationId: initRes.data.reconciliation_id,
        approverAdminId,
        fedapayClient: mockFedapay
      })
    );
    assert.strictEqual(approveTamperedRes.success, false);
    assert.strictEqual(approveTamperedRes.code, 'PROOF_STORED_FILE_TAMPERED');

    // Remplacement par un fichier non-PDF corrompu dans le stockage :
    // 1) Lors de l'approbation, le SHA-256 recalculé diffère du hash initial -> PROOF_STORED_FILE_TAMPERED
    const corruptedBuf = Buffer.from('CORRUPTED_BINARY_CONTENT_AFTER_UPLOAD_12345', 'utf8');
    proofStorageMock._tamperObject('refund-proofs', objectPath, corruptedBuf);
    const approveCorruptedRes = await withUnlockedSecurityGate(() =>
      approveAndExecuteParentPackRefundReconciliation({
        reconciliationId: initRes.data.reconciliation_id,
        approverAdminId,
        fedapayClient: mockFedapay
      })
    );
    assert.strictEqual(approveCorruptedRes.success, false);
    assert.strictEqual(approveCorruptedRes.code, 'PROOF_STORED_FILE_TAMPERED');

    // 2) Même si le hash correspondait aux octets corrompus, la ré-inspection binaire rejette le format -> INVALID_PROOF_FILE_FORMAT
    const corruptedHash = createHash('sha256').update(corruptedBuf).digest('hex');
    const directReadCorrupted = await readAndVerifyStoredRefundProof({
      storagePath: `private://refund-proofs/${objectPath}`,
      expectedDocumentHash: corruptedHash,
      actorAdminId: approverAdminId,
      actorRole: 'superadmin',
      phase: 'approve',
      storageClient: proofStorageMock
    });
    assert.strictEqual(directReadCorrupted.valid, false);
    assert.strictEqual(directReadCorrupted.code, 'INVALID_PROOF_FILE_FORMAT');
  });

  // 20. Hash incorrect et chemin de stockage illégitime
  it('20. Chantier D.1 — Refus fail-closed si le hash SHA-256 est incorrect ou si le chemin vise un bucket non autorisé', async () => {
    const fixture = await seedFixture();
    const mockFedapay = {
      retrieveTransaction: async () => ({
        id: fixture.providerTxId,
        status: 'refunded',
        amount: fixture.amount,
        currency: fixture.currency
      })
    };

    // 20A: Hash syntaxiquement invalide
    const resInvalidHashFormat = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      reason: 'Hash invalide',
      proof: buildValidProof(fixture, { documentHash: 'not_a_sha256_hash' }),
      fedapayClient: mockFedapay
    });
    assert.strictEqual(resInvalidHashFormat.success, false);
    assert.strictEqual(resInvalidHashFormat.code, 'INVALID_PROOF_HASH');

    // 20B: Hash SHA-256 syntaxiquement valide (64 hex) mais différent du SHA-256 réel du PDF
    const wrongSha256 = 'a'.repeat(64);
    const resMismatchHash = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      reason: 'Hash différent du PDF',
      proof: buildValidProof(fixture, { documentHash: wrongSha256 }),
      fedapayClient: mockFedapay
    });
    assert.strictEqual(resMismatchHash.success, false);
    assert.strictEqual(resMismatchHash.code, 'PROOF_HASH_CONTENT_MISMATCH');

    // 20C: Chemin visant un bucket public ou contenant une traversée de répertoire
    const resWrongBucket = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      reason: 'Bucket public interdit',
      proof: buildValidProof(fixture, { storagePath: `private://chat-media/2026/${fixture.periodId}.pdf` }),
      fedapayClient: mockFedapay
    });
    assert.strictEqual(resWrongBucket.success, false);
    assert.strictEqual(resWrongBucket.code, 'INVALID_PROOF_STORAGE_PATH');
  });

  // 21. Accès non autorisé et refus d'écrasement (upsert: false)
  it('21. Chantier D.1 — Refus fail-closed en cas d\'accès non autorisé ou de tentative d\'écrasement (upsert: false)', async () => {
    const fixture = await seedFixture();
    const mockFedapay = {
      retrieveTransaction: async () => ({
        id: fixture.providerTxId,
        status: 'refunded',
        amount: fixture.amount,
        currency: fixture.currency
      })
    };

    // 21A: Rôle non-superadmin à l'initiation -> UNAUTHORIZED_PROOF_STORAGE_ACCESS
    const resForbiddenInit = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      actorRole: 'school_admin',
      reason: 'Tentative par school_admin',
      proof: buildValidProof(fixture),
      fedapayClient: mockFedapay
    });
    assert.strictEqual(resForbiddenInit.success, false);
    assert.strictEqual(resForbiddenInit.code, 'UNAUTHORIZED_PROOF_STORAGE_ACCESS');

    // 21B: Appel direct à storeRefundProofDocument et readAndVerifyStoredRefundProof avec un rôle non autorisé
    const directStoreForbidden = await storeRefundProofDocument({
      periodId: fixture.periodId,
      actorAdminId: superAdminId,
      actorRole: 'parent',
      fileBuffer: validRawProofContent,
      storageClient: proofStorageMock
    });
    assert.strictEqual(directStoreForbidden.success, false);
    assert.strictEqual(directStoreForbidden.code, 'UNAUTHORIZED_PROOF_STORAGE_ACCESS');

    const directReadForbidden = await readAndVerifyStoredRefundProof({
      storagePath: `private://refund-proofs/2026/${fixture.periodId}.pdf`,
      expectedDocumentHash: validProofHash,
      actorAdminId: superAdminId,
      actorRole: 'admin',
      storageClient: proofStorageMock
    });
    assert.strictEqual(directReadForbidden.valid, false);
    assert.strictEqual(directReadForbidden.code, 'UNAUTHORIZED_PROOF_STORAGE_ACCESS');

    // 21C: Premier dépôt légitime, puis tentative de réécriture sur le même chemin (upsert: false) -> PROOF_STORAGE_OVERWRITE_FORBIDDEN
    const firstStore = await storeRefundProofDocument({
      periodId: fixture.periodId,
      actorAdminId: superAdminId,
      actorRole: 'superadmin',
      fileBuffer: validRawProofContent,
      storagePath: `private://refund-proofs/2026/${fixture.periodId}_immutable.pdf`,
      storageClient: proofStorageMock
    });
    assert.strictEqual(firstStore.success, true);

    const overwriteAttempt = await storeRefundProofDocument({
      periodId: fixture.periodId,
      actorAdminId: superAdminId,
      actorRole: 'superadmin',
      fileBuffer: validRawProofContent,
      storagePath: `private://refund-proofs/2026/${fixture.periodId}_immutable.pdf`,
      storageClient: proofStorageMock
    });
    assert.strictEqual(overwriteAttempt.success, false);
    assert.strictEqual(overwriteAttempt.code, 'PROOF_STORAGE_OVERWRITE_FORBIDDEN');

    // 21D: Usurpation déclarative : tentative de fournir proof.actorRole = 'superadmin' avec actorRole = 'parent' -> UNAUTHORIZED_PROOF_STORAGE_ACCESS
    const spoofedProofRes = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      actorRole: 'parent',
      reason: 'Tentative usurpation de rôle via objet proof',
      proof: buildValidProof(fixture, { actorRole: 'superadmin' }),
      fedapayClient: mockFedapay
    });
    assert.strictEqual(spoofedProofRes.success, false);
    assert.strictEqual(spoofedProofRes.code, 'UNAUTHORIZED_PROOF_STORAGE_ACCESS');

    // 21E: Rôle absent (null ou undefined) ou non-superadmin lors de l'appel direct -> UNAUTHORIZED_PROOF_STORAGE_ACCESS
    const authNullRole = verifyRefundProofAuthorization({ actorAdminId: superAdminId, actorRole: null });
    assert.strictEqual(authNullRole.authorized, false);
    assert.strictEqual(authNullRole.code, 'UNAUTHORIZED_PROOF_STORAGE_ACCESS');

    const authUndefRole = verifyRefundProofAuthorization({ actorAdminId: superAdminId, actorRole: undefined });
    assert.strictEqual(authUndefRole.authorized, false);
    assert.strictEqual(authUndefRole.code, 'UNAUTHORIZED_PROOF_STORAGE_ACCESS');

    const authInvalidRole = verifyRefundProofAuthorization({ actorAdminId: superAdminId, actorRole: 'super_user' });
    assert.strictEqual(authInvalidRole.authorized, false);
    assert.strictEqual(authInvalidRole.code, 'UNAUTHORIZED_PROOF_STORAGE_ACCESS');

    // 21F: Identifiant administrateur absent, malformé ou non-UUID -> UNAUTHORIZED_PROOF_STORAGE_ACCESS
    const authMissingId = verifyRefundProofAuthorization({ actorAdminId: null, actorRole: 'superadmin' });
    assert.strictEqual(authMissingId.authorized, false);
    assert.strictEqual(authMissingId.code, 'UNAUTHORIZED_PROOF_STORAGE_ACCESS');

    const authBadId = verifyRefundProofAuthorization({ actorAdminId: 'not-a-valid-uuid', actorRole: 'superadmin' });
    assert.strictEqual(authBadId.authorized, false);
    assert.strictEqual(authBadId.code, 'UNAUTHORIZED_PROOF_STORAGE_ACCESS');

    const readMissingId = await readAndVerifyStoredRefundProof({
      storagePath: `private://refund-proofs/2026/${fixture.periodId}_immutable.pdf`,
      expectedDocumentHash: validProofHash,
      actorAdminId: null,
      actorRole: 'superadmin',
      storageClient: proofStorageMock
    });
    assert.strictEqual(readMissingId.valid, false);
    assert.strictEqual(readMissingId.code, 'UNAUTHORIZED_PROOF_STORAGE_ACCESS');
  });

  // 22. Échec de stockage (panne à l'écriture et panne à la lecture)
  it('22. Chantier D.1 — Blocage fail-closed en cas d\'échec du stockage privé à l\'écriture ou à la lecture', async () => {
    const fixture = await seedFixture();
    const mockFedapay = {
      retrieveTransaction: async () => ({
        id: fixture.providerTxId,
        status: 'refunded',
        amount: fixture.amount,
        currency: fixture.currency
      })
    };

    // 22A: Panne d'écriture Supabase Storage lors de l'initiation -> PROOF_STORAGE_WRITE_FAILED
    proofStorageMock._setFailureMode({ failUpload: true });
    try {
      const writeFailRes = await createParentPackRefundReconciliationRequest({
        periodId: fixture.periodId,
        initiatorAdminId: superAdminId,
        reason: 'Test panne écriture storage',
        proof: buildValidProof(fixture),
        fedapayClient: mockFedapay
      });
      assert.strictEqual(writeFailRes.success, false);
      assert.strictEqual(writeFailRes.code, 'PROOF_STORAGE_WRITE_FAILED');
    } finally {
      proofStorageMock._setFailureMode({ failUpload: false });
    }

    // Aucun dossier de rapprochement ne doit avoir été créé en base après l'échec d'écriture
    const recAfterWriteFail = await adminClient.query(
      `SELECT count(*)::int AS cnt FROM public.parent_pack_refund_reconciliations WHERE period_id = $1`,
      [fixture.periodId]
    );
    assert.strictEqual(recAfterWriteFail.rows[0].cnt, 0);

    // 22B: Initiation réussie, puis panne de lecture Supabase Storage lors de l'approbation -> PROOF_STORAGE_READ_FAILED
    const initRes = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      reason: 'Test panne lecture storage à l\'approbation',
      proof: buildValidProof(fixture),
      fedapayClient: mockFedapay
    });
    assert.strictEqual(initRes.success, true);

    proofStorageMock._setFailureMode({ failDownload: true });
    try {
      const readFailApproveRes = await withUnlockedSecurityGate(() =>
        approveAndExecuteParentPackRefundReconciliation({
          reconciliationId: initRes.data.reconciliation_id,
          approverAdminId,
          fedapayClient: mockFedapay
        })
      );
      assert.strictEqual(readFailApproveRes.success, false);
      assert.strictEqual(readFailApproveRes.code, 'PROOF_STORAGE_READ_FAILED');
    } finally {
      proofStorageMock._setFailureMode({ failDownload: false });
    }
  });

  // 23. Absence totale d'écriture financière après refus (intégrité des ledgers, périodes et audits)
  it('23. Chantier D.1 — Absence totale d\'écriture financière après l\'ensemble des refus de stockage et d\'intégrité', async () => {
    const fixture = await seedFixture();
    const mockFedapay = {
      retrieveTransaction: async () => ({
        id: fixture.providerTxId,
        status: 'refunded',
        amount: fixture.amount,
        currency: fixture.currency
      })
    };

    // Étape 1 valide
    const initRes = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      reason: 'Vérification zéro écriture financière après refus D.1',
      proof: buildValidProof(fixture),
      fedapayClient: mockFedapay
    });
    assert.strictEqual(initRes.success, true);

    // Altération du fichier stocké avant l'approbation
    const objectPath = `2026/${fixture.periodId}.pdf`;
    proofStorageMock._tamperObject(
      'refund-proofs',
      objectPath,
      Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n% ALTÉRATION MALVEILLANTE\n%%EOF\n', 'utf8')
    );

    // Tentative d'approbation par le second SuperAdmin (même avec porte SQL ouverte) -> refusée par la revérification D.1
    const approveRes = await withUnlockedSecurityGate(() =>
      approveAndExecuteParentPackRefundReconciliation({
        reconciliationId: initRes.data.reconciliation_id,
        approverAdminId,
        fedapayClient: mockFedapay
      })
    );
    assert.strictEqual(approveRes.success, false);
    assert.strictEqual(approveRes.code, 'PROOF_STORED_FILE_TAMPERED');

    // Vérifier qu'aucune écriture financière ni révocation n'a eu lieu
    const periodDb = await adminClient.query(`SELECT status FROM public.parent_subscription_periods WHERE id = $1`, [fixture.periodId]);
    assert.strictEqual(periodDb.rows[0].status, 'active');

    const subDb = await adminClient.query(`SELECT status FROM public.parent_subscriptions WHERE id = $1`, [fixture.subId]);
    assert.strictEqual(subDb.rows[0].status, 'active');

    const intentDb = await adminClient.query(`SELECT status FROM public.payment_intents WHERE id = $1`, [fixture.intentId]);
    assert.strictEqual(intentDb.rows[0].status, 'completed');

    const schoolCancelCount = await adminClient.query(
      `SELECT count(*)::int AS cnt FROM public.school_commission_ledger WHERE period_id = $1 AND type = 'cancellation'`,
      [fixture.periodId]
    );
    assert.strictEqual(schoolCancelCount.rows[0].cnt, 0);

    const affiliateReversalCount = await adminClient.query(
      `SELECT count(*)::int AS cnt FROM public.affiliate_ledger WHERE entry_type = 'refund_reversal' AND (metadata->>'period_id') = $1`,
      [fixture.periodId]
    );
    assert.strictEqual(affiliateReversalCount.rows[0].cnt, 0);

    const auditCount = await adminClient.query(
      `SELECT count(*)::int AS cnt FROM public.parent_pack_refund_audits WHERE period_id = $1`,
      [fixture.periodId]
    );
    assert.strictEqual(auditCount.rows[0].cnt, 0);

    // Et vérifier que la porte de sécurité SQL est toujours verrouillée (false / false / false)
    const gateRes = await adminClient.query(
      `SELECT independent_admin_auth_ready, independent_fedapay_proof_ready, private_worm_storage_ready
       FROM public.parent_pack_refund_security_gate WHERE id = true`
    );
    assert.strictEqual(gateRes.rows[0].independent_admin_auth_ready, false);
    assert.strictEqual(gateRes.rows[0].independent_fedapay_proof_ready, false);
    assert.strictEqual(gateRes.rows[0].private_worm_storage_ready, false);
  });
});