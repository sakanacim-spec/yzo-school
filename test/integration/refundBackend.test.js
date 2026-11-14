import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto, { randomUUID, createHash } from 'node:crypto';
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
const {
  DEFAULT_REFUND_ACTION_AUTH_KEY,
  ACTION_PROOF_VERSION,
  ACTION_PROOF_ISSUER,
  generateRefundActionProof,
  verifyRefundActionProofLocally
} = require('../../backend/services/refundActionProofAuthority.js');
const {
  resolveAuthoritativeRpConfig,
  buildWebAuthnAttestationObject,
  issueEnrollmentApprovalToken,
  issueOutOfBandBootstrapToken,
  createEnrollmentApprovalChallenge,
  issueConfirmedEnrollmentApprovalToken,
  inspectAuthoritativeRefundDossier,
  setAuthorityRuntimeConfig,
  createRegistrationChallenge,
  verifyAndRegisterCredential,
  revokeCredential,
  createActionConfirmationChallenge,
  verifyWebAuthnAssertion,
  issueConfirmedActionProof,
  resetInMemoryState,
  clearPersistedWebAuthnStateForTests,
  closeAuthorityDbPool
} = require('../../backend/services/superAdminWebAuthnAuthority.js');
const {
  startWebAuthnAuthorityServer,
  verifyServerlessAuthorizationHeader,
  resolveAuthorityPort,
  resolveAuthorityHost
} = require('../../backend/authority/webauthnAuthorityServer.js');
const {
  isExternalAuthorityRequired,
  isCloudRunIamAuthRequired,
  validateVercelOidcTokenClaims,
  validateGoogleCloudRunIdTokenClaims,
  requestGoogleCloudRunIdToken,
  requestRegistrationChallenge,
  requestEnrollmentApprovalChallenge,
  requestConfirmedEnrollmentApprovalToken,
  requestVerifyAndRegisterCredential,
  requestRevokeCredential,
  requestActionConfirmationChallenge,
  requestConfirmedActionProof
} = require('../../backend/services/webauthnAuthorityClient.js');

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
  let authorityRoleUrl;
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

    // 3. Generate dedicated executor and WebAuthn authority credentials in memory (never logged) and configure roles
    const executorPwd = 'p28c_test_' + randomUUID().replace(/-/g, '');
    executorUrl = `postgresql://yziow_refund_executor:${encodeURIComponent(executorPwd)}@${dbConfig.host}:${dbConfig.port}/${dbConfig.dbName}`;

    const authorityPwd = 'p28c_auth_' + randomUUID().replace(/-/g, '');
    authorityRoleUrl = `postgresql://yziow_webauthn_authority:${encodeURIComponent(authorityPwd)}@${dbConfig.host}:${dbConfig.port}/${dbConfig.dbName}`;

    await adminClient.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'yziow_refund_executor') THEN
          CREATE ROLE yziow_refund_executor LOGIN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'yziow_webauthn_authority') THEN
          CREATE ROLE yziow_webauthn_authority LOGIN;
        END IF;
      END
      $$;
      ALTER ROLE yziow_refund_executor WITH PASSWORD '${executorPwd}';
      ALTER ROLE yziow_webauthn_authority WITH PASSWORD '${authorityPwd}';
      GRANT USAGE ON SCHEMA public TO yziow_refund_executor, yziow_webauthn_authority;

      GRANT EXECUTE ON FUNCTION public.admin_process_parent_pack_refund(UUID, TEXT, UUID, TEXT) TO yziow_refund_executor;
      REVOKE EXECUTE ON FUNCTION public.admin_process_parent_pack_refund(UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated, service_role, yziow_webauthn_authority;

      GRANT EXECUTE ON FUNCTION public.admin_create_parent_pack_refund_reconciliation(UUID, UUID, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, JSONB) TO yziow_refund_executor;
      REVOKE EXECUTE ON FUNCTION public.admin_create_parent_pack_refund_reconciliation(UUID, UUID, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated, service_role, yziow_webauthn_authority;

      GRANT EXECUTE ON FUNCTION public.admin_approve_parent_pack_refund_reconciliation(UUID, UUID, TEXT, TEXT, BIGINT, TEXT, TEXT, JSONB) TO yziow_refund_executor;
      REVOKE EXECUTE ON FUNCTION public.admin_approve_parent_pack_refund_reconciliation(UUID, UUID, TEXT, TEXT, BIGINT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated, service_role, yziow_webauthn_authority;

      GRANT EXECUTE ON FUNCTION public.admin_get_parent_pack_refund_reconciliation(UUID) TO yziow_refund_executor;
      REVOKE EXECUTE ON FUNCTION public.admin_get_parent_pack_refund_reconciliation(UUID) FROM PUBLIC, anon, authenticated, service_role, yziow_webauthn_authority;

      REVOKE ALL ON SCHEMA yziow_refund_auth FROM PUBLIC, anon, authenticated, service_role, yziow_refund_executor, yziow_webauthn_authority;
      REVOKE ALL ON ALL TABLES IN SCHEMA yziow_refund_auth FROM PUBLIC, anon, authenticated, service_role, yziow_refund_executor, yziow_webauthn_authority;
      GRANT USAGE ON SCHEMA yziow_refund_auth TO yziow_webauthn_authority;
      GRANT SELECT ON TABLE yziow_refund_auth.webauthn_challenges TO yziow_webauthn_authority;

      REVOKE ALL ON TABLE public.superadmin_webauthn_credentials FROM PUBLIC, anon, authenticated, service_role, yziow_refund_executor, yziow_webauthn_authority;
      GRANT SELECT, INSERT, UPDATE ON TABLE public.superadmin_webauthn_credentials TO yziow_webauthn_authority;

      GRANT EXECUTE ON FUNCTION yziow_refund_auth.store_webauthn_challenge(UUID, TEXT, TEXT, TEXT, UUID, UUID, TEXT, BIGINT, TEXT, TEXT, TEXT, TEXT, INTEGER) TO yziow_webauthn_authority;
      GRANT EXECUTE ON FUNCTION yziow_refund_auth.get_webauthn_challenge_for_update(TEXT) TO yziow_webauthn_authority;
      GRANT EXECUTE ON FUNCTION yziow_refund_auth.consume_webauthn_challenge(TEXT, UUID, TEXT, TEXT) TO yziow_webauthn_authority;
      GRANT EXECUTE ON FUNCTION yziow_refund_auth.check_superadmin_active(UUID) TO yziow_webauthn_authority;
      GRANT EXECUTE ON FUNCTION yziow_refund_auth.inspect_authoritative_refund_dossier(UUID, TEXT, UUID, UUID) TO yziow_webauthn_authority;

      REVOKE ALL ON public.parent_pack_refund_audits FROM PUBLIC, anon, authenticated, service_role, yziow_refund_executor, yziow_webauthn_authority;
      REVOKE ALL ON public.parent_pack_refund_reconciliations FROM PUBLIC, anon, authenticated, service_role, yziow_refund_executor, yziow_webauthn_authority;
      REVOKE ALL ON public.parent_pack_refund_security_gate FROM PUBLIC, anon, authenticated, service_role, yziow_refund_executor, yziow_webauthn_authority;
      REVOKE ALL ON public.superadmins FROM yziow_refund_executor, yziow_webauthn_authority;
      REVOKE ALL ON public.school_commission_ledger FROM yziow_refund_executor, yziow_webauthn_authority;
      REVOKE ALL ON public.affiliate_ledger FROM yziow_refund_executor, yziow_webauthn_authority;
      REVOKE ALL ON public.affiliate_balances FROM yziow_refund_executor, yziow_webauthn_authority;
      REVOKE ALL ON public.payment_intents FROM yziow_refund_executor, yziow_webauthn_authority;
      REVOKE ALL ON public.parent_subscription_periods FROM yziow_refund_executor, yziow_webauthn_authority;
      REVOKE ALL ON public.parent_subscriptions FROM yziow_refund_executor, yziow_webauthn_authority;
    `);

    process.env.YZIOW_REFUND_DATABASE_URL = executorUrl;
    supabase.storage = proofStorageMock;
  });

  after(async () => {
    try {
      await closeAuthorityDbPool();
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

  function buildValidInitiatorProof(fixture, overrides = {}) {
    const docHash = overrides.proofDocumentHash || overrides.documentHash || validProofHash;
    return generateRefundActionProof({
      adminId: overrides.initiatorAdminId || overrides.adminId || superAdminId,
      actionType: 'initiate',
      periodId: overrides.periodId || fixture.periodId,
      providerTransactionId: overrides.providerRefundId || overrides.providerTransactionId || fixture.providerTxId,
      verifiedAmountMinor: overrides.amount !== undefined ? overrides.amount : fixture.amount,
      currency: overrides.currency || fixture.currency,
      proofDocumentHash: docHash,
      secretKey: overrides.secretKey || null
    });
  }

  function buildValidApproverProof(fixture, reconciliationId, overrides = {}) {
    const docHash = overrides.proofDocumentHash || overrides.documentHash || validProofHash;
    return generateRefundActionProof({
      adminId: overrides.approverAdminId || overrides.adminId || approverAdminId,
      actionType: 'approve',
      periodId: overrides.periodId || fixture.periodId,
      reconciliationId,
      providerTransactionId: overrides.providerRefundId || overrides.providerTransactionId || fixture.providerTxId,
      verifiedAmountMinor: overrides.amount !== undefined ? overrides.amount : fixture.amount,
      currency: overrides.currency || fixture.currency,
      proofDocumentHash: docHash,
      secretKey: overrides.secretKey || null
    });
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
        initiatorActionProof: buildValidInitiatorProof(fixture),
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
    const createSig = 'admin_create_parent_pack_refund_reconciliation(uuid, uuid, text, text, text, bigint, text, text, text, bigint, text, text, timestamp with time zone, text, text, jsonb)';
    const approveSig = 'admin_approve_parent_pack_refund_reconciliation(uuid, uuid, text, text, bigint, text, text, jsonb)';

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
      initiatorActionProof: buildValidInitiatorProof(fixture),
      fedapayClient: mockFedapay
    });
    assert.strictEqual(initRes.success, true);
    assert.strictEqual(initRes.code, 'RECONCILIATION_PENDING_APPROVAL');

    const res = await withUnlockedSecurityGate(() =>
      approveAndExecuteParentPackRefundReconciliation({
        reconciliationId: initRes.data.reconciliation_id,
        approverAdminId,
        approvalNotes: 'Seconde validation conforme',
        approverActionProof: buildValidApproverProof(fixture, initRes.data.reconciliation_id),
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
      initiatorActionProof: buildValidInitiatorProof(fixture),
      fedapayClient: mockFedapay
    });
    assert.strictEqual(initRes.success, true);

    const res1 = await withUnlockedSecurityGate(() =>
      approveAndExecuteParentPackRefundReconciliation({
        reconciliationId: initRes.data.reconciliation_id,
        approverAdminId,
        approverActionProof: buildValidApproverProof(fixture, initRes.data.reconciliation_id),
        fedapayClient: mockFedapay
      })
    );
    assert.strictEqual(res1.success, true);

    setupSupabaseMock({ ...fixture, status: 'refunded' });

    const res2 = await approveAndExecuteParentPackRefundReconciliation({
      reconciliationId: initRes.data.reconciliation_id,
      approverAdminId,
      approverActionProof: buildValidApproverProof(fixture, initRes.data.reconciliation_id),
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
      initiatorActionProof: buildValidInitiatorProof(fixture),
      fedapayClient: mockFedapay
    });
    assert.strictEqual(initRes.success, true);

    const approveRes = await withUnlockedSecurityGate(() =>
      approveAndExecuteParentPackRefundReconciliation({
        reconciliationId: initRes.data.reconciliation_id,
        approverAdminId,
        approverActionProof: buildValidApproverProof(fixture, initRes.data.reconciliation_id),
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
      initiatorActionProof: buildValidInitiatorProof(fixture),
      fedapayClient: mockFedapay
    });
    assert.strictEqual(initRes.success, true);
    assert.strictEqual(initRes.code, 'RECONCILIATION_PENDING_APPROVAL');

    const approveLockedRes = await approveAndExecuteParentPackRefundReconciliation({
      reconciliationId: initRes.data.reconciliation_id,
      approverAdminId,
      approvalNotes: 'Tentative approbation avec gate par défaut',
      approverActionProof: buildValidApproverProof(fixture, initRes.data.reconciliation_id),
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

      const approverProof = generateRefundActionProof({
        adminId: approverAdminId,
        actionType: 'approve',
        periodId: fixture.periodId,
        reconciliationId: initRes.data.reconciliation_id,
        providerTransactionId: fixture.providerTxId,
        verifiedAmountMinor: fixture.amount,
        currency: fixture.currency,
        proofDocumentHash: validProofHash
      });

      await assert.rejects(
        async () => {
          await executorClient.query(
            `SELECT public.admin_approve_parent_pack_refund_reconciliation($1, $2, $3, 'refunded', $4, $5, 'Direct SQL approve', $6);`,
            [initRes.data.reconciliation_id, approverAdminId, fixture.providerTxId, fixture.amount, fixture.currency, JSON.stringify(approverProof)]
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
      initiatorActionProof: buildValidInitiatorProof(fixture),
      fedapayClient: mockFedapay
    });
    assert.strictEqual(initRes.success, true);

    const res = await approveAndExecuteParentPackRefundReconciliation({
      reconciliationId: initRes.data.reconciliation_id,
      approverAdminId: superAdminId,
      approverActionProof: buildValidApproverProof(fixture, initRes.data.reconciliation_id, { adminId: superAdminId }),
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
      initiatorActionProof: buildValidInitiatorProof(fixture),
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
      approverActionProof: buildValidApproverProof(fixture, initRes.data.reconciliation_id, { adminId: superAdminId }),
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
        approverActionProof: buildValidApproverProof(fixture, initRes.data.reconciliation_id),
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
      initiatorActionProof: buildValidInitiatorProof(fixturePdf, { proofDocumentHash: expectedServerPdfHash }),
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
      initiatorActionProof: buildValidInitiatorProof(fixturePng, { proofDocumentHash: expectedPngHash }),
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
      initiatorActionProof: buildValidInitiatorProof(fixture),
      fedapayClient: mockFedapay
    });
    assert.strictEqual(initRes.success, true);

    const objectPath = `2026/${fixture.periodId}.pdf`;
    proofStorageMock._deleteObject('refund-proofs', objectPath);

    const approveMissingFileRes = await withUnlockedSecurityGate(() =>
      approveAndExecuteParentPackRefundReconciliation({
        reconciliationId: initRes.data.reconciliation_id,
        approverAdminId,
        approverActionProof: buildValidApproverProof(fixture, initRes.data.reconciliation_id),
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
      initiatorActionProof: buildValidInitiatorProof(fixture),
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
        approverActionProof: buildValidApproverProof(fixture, initRes.data.reconciliation_id),
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
        approverActionProof: buildValidApproverProof(fixture, initRes.data.reconciliation_id),
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
      initiatorActionProof: buildValidInitiatorProof(fixture),
      fedapayClient: mockFedapay
    });
    assert.strictEqual(initRes.success, true);

    proofStorageMock._setFailureMode({ failDownload: true });
    try {
      const readFailApproveRes = await withUnlockedSecurityGate(() =>
        approveAndExecuteParentPackRefundReconciliation({
          reconciliationId: initRes.data.reconciliation_id,
          approverAdminId,
          approverActionProof: buildValidApproverProof(fixture, initRes.data.reconciliation_id),
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
      initiatorActionProof: buildValidInitiatorProof(fixture),
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
        approverActionProof: buildValidApproverProof(fixture, initRes.data.reconciliation_id),
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

  // ============================================================================
  // Chantier D.2 — Authentification cryptographique indépendante des SuperAdmins
  // ============================================================================

  it('24. Chantier D.2 — Deux SuperAdmins distincts avec preuves valides : transition et compensation réussies', async () => {
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
    const proofDoc = buildValidProof(fixture);

    const initProof = generateRefundActionProof({
      adminId: superAdminId,
      actionType: 'initiate',
      periodId: fixture.periodId,
      reconciliationId: null,
      providerTransactionId: fixture.providerTxId,
      verifiedAmountMinor: fixture.amount,
      currency: fixture.currency,
      proofDocumentHash: proofDoc.documentHash
    });

    const initRes = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      reason: 'D.2 nominal double authorization',
      proof: proofDoc,
      providerRefundId: refundRef,
      initiatorActionProof: initProof,
      fedapayClient: mockFedapay
    });
    assert.strictEqual(initRes.success, true);
    assert.strictEqual(initRes.code, 'RECONCILIATION_PENDING_APPROVAL');

    const approverProof = generateRefundActionProof({
      adminId: approverAdminId,
      actionType: 'approve',
      periodId: fixture.periodId,
      reconciliationId: initRes.data.reconciliation_id,
      providerTransactionId: fixture.providerTxId,
      verifiedAmountMinor: fixture.amount,
      currency: fixture.currency,
      proofDocumentHash: proofDoc.documentHash
    });

    const res = await withUnlockedSecurityGate(() =>
      approveAndExecuteParentPackRefundReconciliation({
        reconciliationId: initRes.data.reconciliation_id,
        approverAdminId,
        approvalNotes: 'Approbation D.2 avec preuve valide',
        approverActionProof: approverProof,
        fedapayClient: mockFedapay
      })
    );
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.code, 'REFUND_COMPLETED');
    assert.strictEqual(res.data.status, 'success');

    // Vérification de la persistance des preuves dans reconciliation et audit
    const recDb = await adminClient.query(
      `SELECT initiator_action_proof, approver_action_proof FROM public.parent_pack_refund_reconciliations WHERE id = $1`,
      [initRes.data.reconciliation_id]
    );
    assert.ok(recDb.rows[0].initiator_action_proof);
    assert.strictEqual(recDb.rows[0].initiator_action_proof.jti, initProof.jti);
    assert.ok(recDb.rows[0].approver_action_proof);
    assert.strictEqual(recDb.rows[0].approver_action_proof.jti, approverProof.jti);

    const auditDb = await adminClient.query(
      `SELECT initiator_action_proof, approver_action_proof FROM public.parent_pack_refund_audits WHERE period_id = $1`,
      [fixture.periodId]
    );
    assert.ok(auditDb.rows[0].initiator_action_proof);
    assert.ok(auditDb.rows[0].approver_action_proof);
  });

  it('25. Chantier D.2 — Même SuperAdmin utilisé deux fois : rejet avec DUAL_CUSTODY_VIOLATION', async () => {
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
      reason: 'Dual custody test',
      proof: buildValidProof(fixture),
      initiatorActionProof: buildValidInitiatorProof(fixture),
      fedapayClient: mockFedapay
    });
    assert.strictEqual(initRes.success, true);

    const approveRes = await withUnlockedSecurityGate(() =>
      approveAndExecuteParentPackRefundReconciliation({
        reconciliationId: initRes.data.reconciliation_id,
        approverAdminId: superAdminId, // Même SuperAdmin !
        approverActionProof: buildValidApproverProof(fixture, initRes.data.reconciliation_id, { adminId: superAdminId }),
        fedapayClient: mockFedapay
      })
    );
    assert.strictEqual(approveRes.success, false);
    assert.strictEqual(approveRes.code, 'DUAL_CUSTODY_VIOLATION');
  });

  it('26. Chantier D.2 — UUID SuperAdmin arbitraire sans preuve : rejet avec ACTION_PROOF_REQUIRED', async () => {
    const fixture = await seedFixture();
    const client = new Client({ connectionString: process.env.YZIOW_REFUND_DATABASE_URL });
    await client.connect();
    try {
      await assert.rejects(
        async () => {
          await client.query(`
            SELECT public.admin_create_parent_pack_refund_reconciliation(
              $1, $2, 'Tentative sans preuve', $3, 'refunded', 1000, 'XOF',
              'private://refund-proofs/2026/test.pdf', $4, 1000, 'XOF', $5, NOW(), NULL, NULL, NULL
            );
          `, [fixture.periodId, superAdminId, fixture.providerTxId, validProofHash, fixture.parentRef]);
        },
        (err) => {
          assert.match(err.message, /ACTION_PROOF_REQUIRED/);
          return true;
        }
      );
    } finally {
      await client.end();
    }
  });

  it('27. Chantier D.2 — Signature invalide : rejet fail-closed (INVALID_ACTION_PROOF_SIGNATURE)', async () => {
    const fixture = await seedFixture();
    const forgedProof = generateRefundActionProof({
      adminId: superAdminId,
      actionType: 'initiate',
      periodId: fixture.periodId,
      providerTransactionId: fixture.providerTxId,
      verifiedAmountMinor: fixture.amount,
      currency: fixture.currency,
      proofDocumentHash: validProofHash
    });
    forgedProof.signature = 'a'.repeat(64); // Signature falsifiée

    const res = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      reason: 'Bad signature test',
      proof: buildValidProof(fixture),
      initiatorActionProof: forgedProof,
      fedapayClient: {
        retrieveTransaction: async () => ({ id: fixture.providerTxId, status: 'refunded', amount: fixture.amount, currency: fixture.currency })
      }
    });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'INVALID_ACTION_PROOF_SIGNATURE');
  });

  it('28. Chantier D.2 — Preuve émise par une autorité non reconnue : rejet immédiat', async () => {
    const fixture = await seedFixture();
    const rogueProof = generateRefundActionProof({
      adminId: superAdminId,
      actionType: 'initiate',
      periodId: fixture.periodId,
      providerTransactionId: fixture.providerTxId,
      verifiedAmountMinor: fixture.amount,
      currency: fixture.currency,
      proofDocumentHash: validProofHash,
      issuer: 'rogue-authority-fake'
    });

    const res = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      reason: 'Rogue authority test',
      proof: buildValidProof(fixture),
      initiatorActionProof: rogueProof,
      fedapayClient: {
        retrieveTransaction: async () => ({ id: fixture.providerTxId, status: 'refunded', amount: fixture.amount, currency: fixture.currency })
      }
    });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'UNRECOGNIZED_ACTION_PROOF_AUTHORITY');
  });

  it('29. Chantier D.2 — Preuve signée pour un autre administrateur : rejet avec ACTION_PROOF_ADMIN_MISMATCH', async () => {
    const fixture = await seedFixture();
    const mismatchedProof = generateRefundActionProof({
      adminId: approverAdminId,
      actionType: 'initiate',
      periodId: fixture.periodId,
      providerTransactionId: fixture.providerTxId,
      verifiedAmountMinor: fixture.amount,
      currency: fixture.currency,
      proofDocumentHash: validProofHash
    });

    const res = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      reason: 'Admin mismatch test',
      proof: buildValidProof(fixture),
      initiatorActionProof: mismatchedProof,
      fedapayClient: {
        retrieveTransaction: async () => ({ id: fixture.providerTxId, status: 'refunded', amount: fixture.amount, currency: fixture.currency })
      }
    });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'ACTION_PROOF_ADMIN_MISMATCH');
  });

  it('30. Chantier D.2 — Preuve expirée : rejet fail-closed (ACTION_PROOF_EXPIRED)', async () => {
    const fixture = await seedFixture();
    const expiredProof = generateRefundActionProof({
      adminId: superAdminId,
      actionType: 'initiate',
      periodId: fixture.periodId,
      providerTransactionId: fixture.providerTxId,
      verifiedAmountMinor: fixture.amount,
      currency: fixture.currency,
      proofDocumentHash: validProofHash,
      issuedAt: new Date(Date.now() - 400000).toISOString(),
      expiresAt: new Date(Date.now() - 100000).toISOString()
    });

    const res = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      reason: 'Expired proof test',
      proof: buildValidProof(fixture),
      initiatorActionProof: expiredProof,
      fedapayClient: {
        retrieveTransaction: async () => ({ id: fixture.providerTxId, status: 'refunded', amount: fixture.amount, currency: fixture.currency })
      }
    });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'ACTION_PROOF_EXPIRED');
  });

  it('31. Chantier D.2 — Preuve émise pour une autre période ou un autre dossier : rejet', async () => {
    const fixture = await seedFixture();
    const wrongPeriodId = randomUUID();
    const wrongPeriodProof = generateRefundActionProof({
      adminId: superAdminId,
      actionType: 'initiate',
      periodId: wrongPeriodId,
      providerTransactionId: fixture.providerTxId,
      verifiedAmountMinor: fixture.amount,
      currency: fixture.currency,
      proofDocumentHash: validProofHash
    });

    const res = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      reason: 'Wrong period test',
      proof: buildValidProof(fixture),
      initiatorActionProof: wrongPeriodProof,
      fedapayClient: {
        retrieveTransaction: async () => ({ id: fixture.providerTxId, status: 'refunded', amount: fixture.amount, currency: fixture.currency })
      }
    });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'ACTION_PROOF_PERIOD_MISMATCH');
  });

  it('32. Chantier D.2 — Altération du montant, devise ou hash après signature : rejet fail-closed', async () => {
    const fixture = await seedFixture();
    const tamperedProof = generateRefundActionProof({
      adminId: superAdminId,
      actionType: 'initiate',
      periodId: fixture.periodId,
      providerTransactionId: fixture.providerTxId,
      verifiedAmountMinor: fixture.amount,
      currency: fixture.currency,
      proofDocumentHash: validProofHash
    });
    tamperedProof.verified_amount_minor = fixture.amount + 500;

    const res = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      reason: 'Tampered payload test',
      proof: buildValidProof(fixture),
      initiatorActionProof: tamperedProof,
      fedapayClient: {
        retrieveTransaction: async () => ({ id: fixture.providerTxId, status: 'refunded', amount: fixture.amount, currency: fixture.currency })
      }
    });
    assert.strictEqual(res.success, false);
    assert.ok(res.code === 'ACTION_PROOF_AMOUNT_MISMATCH' || res.code === 'INVALID_ACTION_PROOF_SIGNATURE');
  });

  it('33. Chantier D.2 — Administrateur désactivé ou révoqué (is_active = false) : rejet fail-closed', async () => {
    const fixture = await seedFixture();
    const revokedAdminId = randomUUID();
    await adminClient.query(`
      INSERT INTO public.superadmins (id, username, password, is_active)
      VALUES ($1, 'revoked_admin_d2', 'hash', false)
      ON CONFLICT (id) DO UPDATE SET is_active = false;
    `, [revokedAdminId]);

    const revokedProof = generateRefundActionProof({
      adminId: revokedAdminId,
      actionType: 'initiate',
      periodId: fixture.periodId,
      providerTransactionId: fixture.providerTxId,
      verifiedAmountMinor: fixture.amount,
      currency: fixture.currency,
      proofDocumentHash: validProofHash
    });

    const client = new Client({ connectionString: process.env.YZIOW_REFUND_DATABASE_URL });
    await client.connect();
    try {
      await assert.rejects(
        async () => {
          await client.query(`
            SELECT public.admin_create_parent_pack_refund_reconciliation(
              $1, $2, 'Revoked admin test', $3, 'refunded', 1000, 'XOF',
              'private://refund-proofs/2026/test.pdf', $4, 1000, 'XOF', $5, NOW(), NULL, NULL, $6
            );
          `, [fixture.periodId, revokedAdminId, fixture.providerTxId, validProofHash, fixture.parentRef, JSON.stringify(revokedProof)]);
        },
        (err) => {
          assert.match(err.message, /UNAUTHORIZED_ADMIN|REVOKED_ADMIN/);
          return true;
        }
      );
    } finally {
      await client.end();
    }
  });

  it('34. Chantier D.2 — Réutilisation d\'une preuve déjà consommée (jti) : rejet avec ACTION_PROOF_ALREADY_CONSUMED', async () => {
    const fixture1 = await seedFixture();

    const reusedProof = generateRefundActionProof({
      adminId: superAdminId,
      actionType: 'initiate',
      periodId: fixture1.periodId,
      providerTransactionId: fixture1.providerTxId,
      verifiedAmountMinor: fixture1.amount,
      currency: fixture1.currency,
      proofDocumentHash: validProofHash
    });

    // Premier appel : consomme le nonce jti
    const res1 = await createParentPackRefundReconciliationRequest({
      periodId: fixture1.periodId,
      initiatorAdminId: superAdminId,
      reason: 'First call consumes nonce',
      proof: buildValidProof(fixture1),
      initiatorActionProof: reusedProof,
      fedapayClient: {
        retrieveTransaction: async () => ({ id: fixture1.providerTxId, status: 'refunded', amount: fixture1.amount, currency: fixture1.currency })
      }
    });
    assert.strictEqual(res1.success, true);

    // Deuxième appel avec la MEME preuve / MEME jti
    const client = new Client({ connectionString: process.env.YZIOW_REFUND_DATABASE_URL });
    await client.connect();
    try {
      await assert.rejects(
        async () => {
          await client.query(`
            SELECT public.admin_create_parent_pack_refund_reconciliation(
              $1, $2, 'Replay test', $3, 'refunded', 1000, 'XOF',
              'private://refund-proofs/2026/test.pdf', $4, 1000, 'XOF', $5, NOW(), NULL, NULL, $6
            );
          `, [fixture1.periodId, superAdminId, fixture1.providerTxId, validProofHash, fixture1.parentRef, JSON.stringify(reusedProof)]);
        },
        (err) => {
          assert.match(err.message, /ACTION_PROOF_ALREADY_CONSUMED/);
          return true;
        }
      );
    } finally {
      await client.end();
    }
  });

  it('35. Chantier D.2 — Deux tentatives concurrentes avec la même preuve : atomicité stricte', async () => {
    const fixture = await seedFixture();
    const sharedProof = generateRefundActionProof({
      adminId: superAdminId,
      actionType: 'initiate',
      periodId: fixture.periodId,
      providerTransactionId: fixture.providerTxId,
      verifiedAmountMinor: fixture.amount,
      currency: fixture.currency,
      proofDocumentHash: validProofHash
    });

    const client1 = new Client({ connectionString: process.env.YZIOW_REFUND_DATABASE_URL });
    const client2 = new Client({ connectionString: process.env.YZIOW_REFUND_DATABASE_URL });
    await client1.connect();
    await client2.connect();

    try {
      const callRpc = (c) =>
        c.query(`
          SELECT public.admin_create_parent_pack_refund_reconciliation(
            $1, $2, 'Concurrent test', $3, 'refunded', 1000, 'XOF',
            'private://refund-proofs/2026/test.pdf', $4, 1000, 'XOF', $5, NOW(), NULL, NULL, $6
          );
        `, [fixture.periodId, superAdminId, fixture.providerTxId, validProofHash, fixture.parentRef, JSON.stringify(sharedProof)]);

      const results = await Promise.allSettled([callRpc(client1), callRpc(client2)]);
      const fulfilled = results.filter(r => r.status === 'fulfilled');
      const rejected = results.filter(r => r.status === 'rejected');

      assert.strictEqual(fulfilled.length, 1, 'Exactly one concurrent call must succeed');
      assert.strictEqual(rejected.length, 1, 'Exactly one concurrent call must be rejected');
      assert.match(rejected[0].reason.message, /ACTION_PROOF_ALREADY_CONSUMED|RECONCILIATION_ALREADY_PENDING/);
    } finally {
      await client1.end();
      await client2.end();
    }
  });

  it('36. Chantier D.2 — Utilisation d\'une preuve "initiate" pour approuver : rejet ACTION_PROOF_TYPE_MISMATCH', async () => {
    const fixture = await seedFixture();
    const initProof = generateRefundActionProof({
      adminId: superAdminId,
      actionType: 'initiate',
      periodId: fixture.periodId,
      providerTransactionId: fixture.providerTxId,
      verifiedAmountMinor: fixture.amount,
      currency: fixture.currency,
      proofDocumentHash: validProofHash
    });

    const initRes = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      reason: 'Type mismatch test',
      proof: buildValidProof(fixture),
      initiatorActionProof: initProof,
      fedapayClient: {
        retrieveTransaction: async () => ({ id: fixture.providerTxId, status: 'refunded', amount: fixture.amount, currency: fixture.currency })
      }
    });

    const approveRes = await withUnlockedSecurityGate(() =>
      approveAndExecuteParentPackRefundReconciliation({
        reconciliationId: initRes.data.reconciliation_id,
        approverAdminId,
        approverActionProof: initProof, // mauvais type !
        fedapayClient: {
          retrieveTransaction: async () => ({ id: fixture.providerTxId, status: 'refunded', amount: fixture.amount, currency: fixture.currency })
        }
      })
    );
    assert.strictEqual(approveRes.success, false);
    assert.strictEqual(approveRes.code, 'ACTION_PROOF_TYPE_MISMATCH');
  });

  it('37. Chantier D.2 — Utilisation d\'une preuve "approve" pour initier : rejet ACTION_PROOF_TYPE_MISMATCH', async () => {
    const fixture = await seedFixture();
    const approveProof = generateRefundActionProof({
      adminId: superAdminId,
      actionType: 'approve',
      periodId: fixture.periodId,
      reconciliationId: randomUUID(),
      providerTransactionId: fixture.providerTxId,
      verifiedAmountMinor: fixture.amount,
      currency: fixture.currency,
      proofDocumentHash: validProofHash
    });

    const initRes = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      reason: 'Type mismatch init test',
      proof: buildValidProof(fixture),
      initiatorActionProof: approveProof, // mauvais type !
      fedapayClient: {
        retrieveTransaction: async () => ({ id: fixture.providerTxId, status: 'refunded', amount: fixture.amount, currency: fixture.currency })
      }
    });
    assert.strictEqual(initRes.success, false);
    assert.strictEqual(initRes.code, 'ACTION_PROOF_TYPE_MISMATCH');
  });

  it('38. Chantier D.2 — Appel direct d\'approbation via YZIOW_REFUND_DATABASE_URL sans preuve : rejet ACTION_PROOF_REQUIRED', async () => {
    const fixture = await seedFixture();
    const client = new Client({ connectionString: process.env.YZIOW_REFUND_DATABASE_URL });
    await client.connect();

    try {
      const initProof = generateRefundActionProof({
        adminId: superAdminId,
        actionType: 'initiate',
        periodId: fixture.periodId,
        providerTransactionId: fixture.providerTxId,
        verifiedAmountMinor: fixture.amount,
        currency: fixture.currency,
        proofDocumentHash: validProofHash
      });
      const initRes = await client.query(`
        SELECT public.admin_create_parent_pack_refund_reconciliation(
          $1, $2, 'Pending rec', $3, 'refunded', 1000, 'XOF',
          'private://refund-proofs/2026/test.pdf', $4, 1000, 'XOF', $5, NOW(), NULL, NULL, $6
        ) AS res;
      `, [fixture.periodId, superAdminId, fixture.providerTxId, validProofHash, fixture.parentRef, JSON.stringify(initProof)]);
      const recId = initRes.rows[0].res.reconciliation_id;

      // Appel direct sans preuve par un attaquant possédant YZIOW_REFUND_DATABASE_URL
      await assert.rejects(
        async () => {
          await client.query(`
            SELECT public.admin_approve_parent_pack_refund_reconciliation(
              $1, $2, $3, 'refunded', 1000, 'XOF', 'Direct attack without proof', NULL
            );
          `, [recId, approverAdminId, fixture.providerTxId]);
        },
        (err) => {
          assert.match(err.message, /ACTION_PROOF_REQUIRED/);
          return true;
        }
      );
    } finally {
      await client.end();
    }
  });

  it('39. Chantier D.2 — Tentative de lecture de yziow_refund_auth.authority_config par yziow_refund_executor : permission denied', async () => {
    const client = new Client({ connectionString: process.env.YZIOW_REFUND_DATABASE_URL });
    await client.connect();
    try {
      await assert.rejects(
        async () => {
          await client.query(`SELECT * FROM yziow_refund_auth.authority_config`);
        },
        (err) => {
          assert.strictEqual(err.code, '42501', 'Must fail with 42501 (permission denied on schema/table)');
          return true;
        }
      );
    } finally {
      await client.end();
    }
  });

  it('40. Chantier D.2 — Tentative de manipulation de yziow_refund_auth.consumed_action_proofs : permission denied', async () => {
    const client = new Client({ connectionString: process.env.YZIOW_REFUND_DATABASE_URL });
    await client.connect();
    try {
      await assert.rejects(
        async () => {
          await client.query(`DELETE FROM yziow_refund_auth.consumed_action_proofs`);
        },
        (err) => {
          assert.strictEqual(err.code, '42501', 'Must fail with 42501 (permission denied)');
          return true;
        }
      );
      await assert.rejects(
        async () => {
          await client.query(
            `INSERT INTO yziow_refund_auth.consumed_action_proofs (jti, admin_id, action_type, period_id, provider_transaction_id, verified_amount_minor, currency, proof_document_hash, issued_at, expires_at) VALUES ($1, $2, 'initiate', $3, 'tx', 1000, 'XOF', 'hash', NOW(), NOW())`,
            [randomUUID(), superAdminId, randomUUID()]
          );
        },
        (err) => {
          assert.strictEqual(err.code, '42501', 'Must fail with 42501 (permission denied)');
          return true;
        }
      );
    } finally {
      await client.end();
    }
  });

  it('41. Chantier D.2 — Tentative d\'appel direct à yziow_refund_auth.verify_and_consume_action_proof : permission denied', async () => {
    const client = new Client({ connectionString: process.env.YZIOW_REFUND_DATABASE_URL });
    await client.connect();
    try {
      await assert.rejects(
        async () => {
          await client.query(`
            SELECT yziow_refund_auth.verify_and_consume_action_proof(
              '{}'::jsonb, 'initiate', $1, $2, NULL, 'tx', 1000, 'XOF', 'doc'
            );
          `, [superAdminId, randomUUID()]);
        },
        (err) => {
          assert.strictEqual(err.code, '42501', 'Direct call to verify function must fail with permission denied (42501)');
          return true;
        }
      );
    } finally {
      await client.end();
    }
  });

  it('42. Chantier D.2 — Appel direct de admin_process_parent_pack_refund reste verrouillé (SECURITY_BLOCKER)', async () => {
    const fixture = await seedFixture();
    const client = new Client({ connectionString: process.env.YZIOW_REFUND_DATABASE_URL });
    await client.connect();
    try {
      await assert.rejects(
        async () => {
          await client.query(`
            SELECT public.admin_process_parent_pack_refund($1, 'fedapay_bypass_123', $2, 'Tentative de bypass');
          `, [fixture.periodId, superAdminId]);
        },
        (err) => {
          assert.match(err.message, /SECURITY_BLOCKER/);
          return true;
        }
      );
    } finally {
      await client.end();
    }
  });

  it('43. Chantier D.2 — Absence totale d\'écriture financière si la preuve d\'action échoue', async () => {
    const fixture = await seedFixture();
    const badProof = generateRefundActionProof({
      adminId: superAdminId,
      actionType: 'initiate',
      periodId: fixture.periodId,
      providerTransactionId: fixture.providerTxId,
      verifiedAmountMinor: fixture.amount,
      currency: fixture.currency,
      proofDocumentHash: validProofHash
    });
    badProof.signature = 'bad'.repeat(21) + 'a';

    const res = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      reason: 'Failed proof audit check',
      proof: buildValidProof(fixture),
      initiatorActionProof: badProof,
      fedapayClient: {
        retrieveTransaction: async () => ({ id: fixture.providerTxId, status: 'refunded', amount: fixture.amount, currency: fixture.currency })
      }
    });
    assert.strictEqual(res.success, false);

    // Contrôle d'intégrité financière absolue
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

    const gateRes = await adminClient.query(
      `SELECT independent_admin_auth_ready, independent_fedapay_proof_ready, private_worm_storage_ready
       FROM public.parent_pack_refund_security_gate WHERE id = true`
    );
    assert.strictEqual(gateRes.rows[0].independent_admin_auth_ready, false);
    assert.strictEqual(gateRes.rows[0].independent_fedapay_proof_ready, false);
    assert.strictEqual(gateRes.rows[0].private_worm_storage_ready, false);
  });

  // =========================================================================
  // CHANTIER D.2 (SÉCURISATION FINALE DE L'ÉMISSION DES PREUVES)
  // =========================================================================

  it('44. Chantier D.2 — Tentative d\'initiation sans preuve personnelle (createParentPackRefundReconciliationRequest sans initiatorActionProof) : rejet immédiat ACTION_PROOF_REQUIRED (génération automatique interdite)', async () => {
    const fixture = await seedFixture();
    const res = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      reason: 'Tentative sans preuve d\'initiation',
      proof: buildValidProof(fixture),
      initiatorActionProof: null, // Preuve absente
      fedapayClient: {
        retrieveTransaction: async () => ({ id: fixture.providerTxId, status: 'refunded', amount: fixture.amount, currency: fixture.currency })
      }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'ACTION_PROOF_REQUIRED');
    assert.match(res.message, /génération automatique interdite|obligatoire/);
  });

  it('45. Chantier D.2 — Tentative d\'approbation sans preuve personnelle (approveAndExecuteParentPackRefundReconciliation sans approverActionProof) : rejet immédiat ACTION_PROOF_REQUIRED (génération automatique interdite)', async () => {
    const fixture = await seedFixture();
    const mockFedapay = {
      retrieveTransaction: async () => ({ id: fixture.providerTxId, status: 'refunded', amount: fixture.amount, currency: fixture.currency })
    };

    const initRes = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      reason: 'Initiation valide avec preuve',
      proof: buildValidProof(fixture),
      initiatorActionProof: buildValidInitiatorProof(fixture),
      fedapayClient: mockFedapay
    });
    assert.strictEqual(initRes.success, true);

    const approveRes = await withUnlockedSecurityGate(() =>
      approveAndExecuteParentPackRefundReconciliation({
        reconciliationId: initRes.data.reconciliation_id,
        approverAdminId,
        approverActionProof: null, // Preuve d'approbation absente !
        fedapayClient: mockFedapay
      })
    );

    assert.strictEqual(approveRes.success, false);
    assert.strictEqual(approveRes.code, 'ACTION_PROOF_REQUIRED');
    assert.match(approveRes.message, /génération automatique interdite|obligatoire/);
  });

  it('46. Chantier D.2 — Élimination stricte de toute clé par défaut hors environnement de test explicitement autorisé', () => {
    const { getActiveAuthoritySecretKey } = require('../../backend/services/refundActionProofAuthority.js');
    const oldNodeEnv = process.env.NODE_ENV;
    const oldP28b = process.env.P28B_ALLOW_DISPOSABLE_DB;
    const oldP28c = process.env.P28C_ALLOW_DISPOSABLE_DB;
    const oldKey = process.env.YZIOW_REFUND_AUTH_AUTHORITY_SECRET;
    const oldLegacyKey = process.env.YZIOW_REFUND_ACTION_AUTH_KEY;

    try {
      delete process.env.YZIOW_REFUND_AUTH_AUTHORITY_SECRET;
      delete process.env.YZIOW_REFUND_ACTION_AUTH_KEY;

      // Hors test explicitement autorisé (ex: staging ou production ou dev)
      process.env.NODE_ENV = 'staging';
      delete process.env.P28B_ALLOW_DISPOSABLE_DB;
      delete process.env.P28C_ALLOW_DISPOSABLE_DB;

      assert.throws(
        () => getActiveAuthoritySecretKey(),
        (err) => {
          assert.match(err.message, /AUTHORITY_SECRET_NOT_CONFIGURED/);
          return true;
        }
      );

      // En production
      process.env.NODE_ENV = 'production';
      assert.throws(
        () => getActiveAuthoritySecretKey(),
        (err) => {
          assert.match(err.message, /AUTHORITY_SECRET_NOT_CONFIGURED/);
          return true;
        }
      );
    } finally {
      process.env.NODE_ENV = oldNodeEnv;
      if (oldP28b) process.env.P28B_ALLOW_DISPOSABLE_DB = oldP28b;
      if (oldP28c) process.env.P28C_ALLOW_DISPOSABLE_DB = oldP28c;
      if (oldKey) process.env.YZIOW_REFUND_AUTH_AUTHORITY_SECRET = oldKey;
      if (oldLegacyKey) process.env.YZIOW_REFUND_ACTION_AUTH_KEY = oldLegacyKey;
    }
  });

  it('47. Chantier D.2 — Divergence de secret HMAC entre backend et PostgreSQL : rejet fail-closed (INVALID_ACTION_PROOF_SIGNATURE)', async () => {
    const fixture = await seedFixture();
    // Signature générée avec une fausse clé divergente
    const divergentProof = generateRefundActionProof({
      adminId: superAdminId,
      actionType: 'initiate',
      periodId: fixture.periodId,
      providerTransactionId: fixture.providerTxId,
      verifiedAmountMinor: fixture.amount,
      currency: fixture.currency,
      proofDocumentHash: validProofHash,
      secretKey: 'divergent_secret_key_testing_mismatch_123456789'
    });

    const res = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      reason: 'Divergent secret test',
      proof: buildValidProof(fixture),
      initiatorActionProof: divergentProof,
      actionAuthSecretKey: 'divergent_secret_key_testing_mismatch_123456789', // backend accepte localement avec la même clé
      fedapayClient: {
        retrieveTransaction: async () => ({ id: fixture.providerTxId, status: 'refunded', amount: fixture.amount, currency: fixture.currency })
      }
    });

    // Mais PostgreSQL possède la clé officielle -> rejet fail-closed
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'INVALID_ACTION_PROOF_SIGNATURE');
  });

  it('48. Chantier D.2 — Préservation du blocage financier SECURITY_BLOCKER même avec deux preuves valides distinctes et non rejouées', async () => {
    const fixture = await seedFixture();
    const mockFedapay = {
      retrieveTransaction: async () => ({ id: fixture.providerTxId, status: 'refunded', amount: fixture.amount, currency: fixture.currency })
    };

    const initProof = buildValidInitiatorProof(fixture);
    const initRes = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      reason: 'Gate blocker preservation test',
      proof: buildValidProof(fixture),
      initiatorActionProof: initProof,
      fedapayClient: mockFedapay
    });
    assert.strictEqual(initRes.success, true);

    const approverProof = buildValidApproverProof(fixture, initRes.data.reconciliation_id);

    // Appel avec gate par défaut (verrouillée)
    const approveRes = await approveAndExecuteParentPackRefundReconciliation({
      reconciliationId: initRes.data.reconciliation_id,
      approverAdminId,
      approvalNotes: 'Approbation bloquée par gate',
      approverActionProof: approverProof,
      fedapayClient: mockFedapay
    });

    assert.strictEqual(approveRes.success, false);
    assert.strictEqual(approveRes.code, 'SECURITY_BLOCKER');

    // Vérification que les ledgers de commission école et ambassadeur ne sont PAS impactés
    const schoolLedger = await adminClient.query(`SELECT count(*)::int AS cnt FROM public.school_commission_ledger WHERE period_id = $1 AND type = 'cancellation'`, [fixture.periodId]);
    assert.strictEqual(schoolLedger.rows[0].cnt, 0);

    const periodDb = await adminClient.query(`SELECT status FROM public.parent_subscription_periods WHERE id = $1`, [fixture.periodId]);
    assert.strictEqual(periodDb.rows[0].status, 'active');
  });

  // =========================================================================
  // CHANTIER D.2.1 (AUTHENTIFICATION FORTE PERSONNELLE DES DEUX SUPERADMINS)
  // =========================================================================

  function generateWebAuthnKeypair() {
    return crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  }

  function signWebAuthnAssertion({
    keypair,
    challenge,
    origin = 'http://localhost:5173',
    rpId = 'localhost',
    userPresent = true,
    userVerified = true,
    counter = 1
  }) {
    const clientDataObj = {
      type: 'webauthn.get',
      challenge: challenge,
      origin: origin
    };
    const clientDataJSON = Buffer.from(JSON.stringify(clientDataObj), 'utf8');
    const clientDataHash = crypto.createHash('sha256').update(clientDataJSON).digest();

    const rpIdHash = crypto.createHash('sha256').update(rpId).digest();
    let flags = 0;
    if (userPresent) flags |= 0x01;
    if (userVerified) flags |= 0x04;

    const signCount = Buffer.alloc(4);
    signCount.writeUInt32BE(counter, 0);

    const authenticatorData = Buffer.concat([rpIdHash, Buffer.from([flags]), signCount]);
    const signedData = Buffer.concat([authenticatorData, clientDataHash]);

    const signature = crypto.sign('sha256', signedData, keypair.privateKey);

    return {
      clientDataJSON: clientDataJSON.toString('base64url'),
      authenticatorData: authenticatorData.toString('base64url'),
      signature: signature.toString('base64url')
    };
  }

  it('49. Chantier D.2.1 — Scénario 1 : Enregistrement WebAuthn valide d\'un authentificateur pour un SuperAdmin', async () => {
    await clearPersistedWebAuthnStateForTests();
    const challengeData = await createRegistrationChallenge(superAdminId);
    assert.strictEqual(typeof challengeData.challenge, 'string');
    assert.strictEqual(challengeData.rp.id, 'localhost');

    const keypair = generateWebAuthnKeypair();
    const pubSpki = keypair.publicKey.export({ type: 'spki', format: 'pem' });
    const credId = 'cred_sa1_' + randomUUID();

    const clientDataObj = {
      type: 'webauthn.create',
      challenge: challengeData.challenge,
      origin: challengeData.origin
    };
    const clientDataJSON = Buffer.from(JSON.stringify(clientDataObj), 'utf8').toString('base64url');

    const regResult = await verifyAndRegisterCredential({
      adminId: superAdminId,
      credentialId: credId,
      publicKeySpki: pubSpki,
      clientDataJSON,
      expectedChallenge: challengeData.challenge
    });

    assert.strictEqual(regResult.valid, true);
    assert.strictEqual(regResult.credential.credential_id, credId);
    assert.strictEqual(regResult.credential.admin_id, superAdminId.toLowerCase());
    assert.strictEqual(regResult.credential.is_active, true);
  });

  it('50. Chantier D.2.1 — Scénario 2 : Tentative d\'enregistrement WebAuthn pour un autre SuperAdmin (rejet UNAUTHORIZED_ADMIN_REGISTRATION)', async () => {
    await clearPersistedWebAuthnStateForTests();
    const challengeData = await createRegistrationChallenge(superAdminId);
    const keypair = generateWebAuthnKeypair();
    const pubSpki = keypair.publicKey.export({ type: 'spki', format: 'pem' });
    const credId = 'cred_spoofed_' + randomUUID();

    const clientDataObj = {
      type: 'webauthn.create',
      challenge: challengeData.challenge,
      origin: challengeData.origin
    };
    const clientDataJSON = Buffer.from(JSON.stringify(clientDataObj), 'utf8').toString('base64url');

    const regResult = await verifyAndRegisterCredential({
      adminId: approverAdminId,
      credentialId: credId,
      publicKeySpki: pubSpki,
      clientDataJSON,
      expectedChallenge: challengeData.challenge
    });

    assert.strictEqual(regResult.valid, false);
    assert.strictEqual(regResult.code, 'UNAUTHORIZED_ADMIN_REGISTRATION');
  });

  it('51. Chantier D.2.1 — Scénario 3 : Challenge inexistant ou expiré (rejet CHALLENGE_NOT_FOUND)', async () => {
    await clearPersistedWebAuthnStateForTests();
    const keypair = generateWebAuthnKeypair();
    const pubSpki = keypair.publicKey.export({ type: 'spki', format: 'pem' });
    const credId = 'cred_' + randomUUID();

    const clientDataObj = {
      type: 'webauthn.create',
      challenge: 'non_existent_challenge_bytes_1234567890',
      origin: 'http://localhost:5173'
    };
    const clientDataJSON = Buffer.from(JSON.stringify(clientDataObj), 'utf8').toString('base64url');

    const regResult = await verifyAndRegisterCredential({
      adminId: superAdminId,
      credentialId: credId,
      publicKeySpki: pubSpki,
      clientDataJSON,
      expectedChallenge: 'non_existent_challenge_bytes_1234567890'
    });

    assert.strictEqual(regResult.valid, false);
    assert.strictEqual(regResult.code, 'CHALLENGE_NOT_FOUND');
  });

  it('52. Chantier D.2.1 — Scénario 4 : Signature cryptographique WebAuthn invalide (rejet INVALID_WEBAUTHN_SIGNATURE)', async () => {
    await clearPersistedWebAuthnStateForTests();
    const keypair1 = generateWebAuthnKeypair();
    const keypair2 = generateWebAuthnKeypair();
    const pubSpki = keypair1.publicKey.export({ type: 'spki', format: 'pem' });
    const credId = 'cred_' + randomUUID();

    const regChal = await createRegistrationChallenge(superAdminId);
    await verifyAndRegisterCredential({
      adminId: superAdminId,
      credentialId: credId,
      publicKeySpki: pubSpki,
      clientDataJSON: Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: regChal.challenge, origin: regChal.origin })).toString('base64url'),
      expectedChallenge: regChal.challenge
    });

    const fixture = await seedFixture();
    const actionChal = await createActionConfirmationChallenge({
      adminId: superAdminId,
      actionType: 'initiate',
      periodId: fixture.periodId,
      providerTransactionId: fixture.providerTxId,
      verifiedAmountMinor: fixture.amount,
      currency: fixture.currency,
      proofDocumentHash: validProofHash
    });

    const forgedAssertion = signWebAuthnAssertion({
      keypair: keypair2,
      challenge: actionChal.challenge
    });

    const res = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      reason: 'Invalid signature test',
      proof: buildValidProof(fixture),
      initiatorWebAuthnConfirmation: {
        credentialId: credId,
        ...forgedAssertion
      },
      fedapayClient: {
        retrieveTransaction: async () => ({ id: fixture.providerTxId, status: 'refunded', amount: fixture.amount, currency: fixture.currency })
      }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'INVALID_WEBAUTHN_SIGNATURE');
  });

  it('53. Chantier D.2.1 — Scénario 5 : Origine non autorisée dans clientDataJSON (rejet INVALID_ORIGIN)', async () => {
    await clearPersistedWebAuthnStateForTests();
    const keypair = generateWebAuthnKeypair();
    const pubSpki = keypair.publicKey.export({ type: 'spki', format: 'pem' });
    const credId = 'cred_' + randomUUID();

    const regChal = await createRegistrationChallenge(superAdminId);
    await verifyAndRegisterCredential({
      adminId: superAdminId,
      credentialId: credId,
      publicKeySpki: pubSpki,
      clientDataJSON: Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: regChal.challenge, origin: regChal.origin })).toString('base64url'),
      expectedChallenge: regChal.challenge
    });

    const fixture = await seedFixture();
    const actionChal = await createActionConfirmationChallenge({
      adminId: superAdminId,
      actionType: 'initiate',
      periodId: fixture.periodId,
      providerTransactionId: fixture.providerTxId,
      verifiedAmountMinor: fixture.amount,
      currency: fixture.currency,
      proofDocumentHash: validProofHash
    });

    const phishingAssertion = signWebAuthnAssertion({
      keypair,
      challenge: actionChal.challenge,
      origin: 'https://evil-phishing-platform.com'
    });

    const res = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      reason: 'Invalid origin test',
      proof: buildValidProof(fixture),
      initiatorWebAuthnConfirmation: {
        credentialId: credId,
        ...phishingAssertion
      },
      fedapayClient: {
        retrieveTransaction: async () => ({ id: fixture.providerTxId, status: 'refunded', amount: fixture.amount, currency: fixture.currency })
      }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'INVALID_ORIGIN');
  });

  it('54. Chantier D.2.1 — Scénario 6 : RP ID incorrect dans authenticatorData (rejet INVALID_RP_ID)', async () => {
    await clearPersistedWebAuthnStateForTests();
    const keypair = generateWebAuthnKeypair();
    const pubSpki = keypair.publicKey.export({ type: 'spki', format: 'pem' });
    const credId = 'cred_' + randomUUID();

    const regChal = await createRegistrationChallenge(superAdminId);
    await verifyAndRegisterCredential({
      adminId: superAdminId,
      credentialId: credId,
      publicKeySpki: pubSpki,
      clientDataJSON: Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: regChal.challenge, origin: regChal.origin })).toString('base64url'),
      expectedChallenge: regChal.challenge
    });

    const fixture = await seedFixture();
    const actionChal = await createActionConfirmationChallenge({
      adminId: superAdminId,
      actionType: 'initiate',
      periodId: fixture.periodId,
      providerTransactionId: fixture.providerTxId,
      verifiedAmountMinor: fixture.amount,
      currency: fixture.currency,
      proofDocumentHash: validProofHash
    });

    const badRpAssertion = signWebAuthnAssertion({
      keypair,
      challenge: actionChal.challenge,
      rpId: 'rogue-server.org'
    });

    const res = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      reason: 'Bad RP ID test',
      proof: buildValidProof(fixture),
      initiatorWebAuthnConfirmation: {
        credentialId: credId,
        ...badRpAssertion
      },
      fedapayClient: {
        retrieveTransaction: async () => ({ id: fixture.providerTxId, status: 'refunded', amount: fixture.amount, currency: fixture.currency })
      }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'INVALID_RP_ID');
  });

  it('55. Chantier D.2.1 — Scénario 7 : Absence de présence utilisateur physique / UP à 0 (rejet USER_PRESENCE_REQUIRED)', async () => {
    await clearPersistedWebAuthnStateForTests();
    const keypair = generateWebAuthnKeypair();
    const pubSpki = keypair.publicKey.export({ type: 'spki', format: 'pem' });
    const credId = 'cred_' + randomUUID();

    const regChal = await createRegistrationChallenge(superAdminId);
    await verifyAndRegisterCredential({
      adminId: superAdminId,
      credentialId: credId,
      publicKeySpki: pubSpki,
      clientDataJSON: Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: regChal.challenge, origin: regChal.origin })).toString('base64url'),
      expectedChallenge: regChal.challenge
    });

    const fixture = await seedFixture();
    const actionChal = await createActionConfirmationChallenge({
      adminId: superAdminId,
      actionType: 'initiate',
      periodId: fixture.periodId,
      providerTransactionId: fixture.providerTxId,
      verifiedAmountMinor: fixture.amount,
      currency: fixture.currency,
      proofDocumentHash: validProofHash
    });

    const noUpAssertion = signWebAuthnAssertion({
      keypair,
      challenge: actionChal.challenge,
      userPresent: false
    });

    const res = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      reason: 'No UP flag test',
      proof: buildValidProof(fixture),
      initiatorWebAuthnConfirmation: {
        credentialId: credId,
        ...noUpAssertion
      },
      fedapayClient: {
        retrieveTransaction: async () => ({ id: fixture.providerTxId, status: 'refunded', amount: fixture.amount, currency: fixture.currency })
      }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'USER_PRESENCE_REQUIRED');
  });

  it('55b. Chantier D.2.1 — Scénario 7b : Absence de vérification biométrique/PIN (UV à 0) sur opération financière (rejet USER_VERIFICATION_REQUIRED)', async () => {
    await clearPersistedWebAuthnStateForTests();
    const keypair = generateWebAuthnKeypair();
    const pubSpki = keypair.publicKey.export({ type: 'spki', format: 'pem' });
    const credId = 'cred_' + randomUUID();

    const regChal = await createRegistrationChallenge(superAdminId);
    await verifyAndRegisterCredential({
      adminId: superAdminId,
      credentialId: credId,
      publicKeySpki: pubSpki,
      clientDataJSON: Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: regChal.challenge, origin: regChal.origin })).toString('base64url'),
      expectedChallenge: regChal.challenge
    });

    const fixture = await seedFixture();
    const actionChal = await createActionConfirmationChallenge({
      adminId: superAdminId,
      actionType: 'initiate',
      periodId: fixture.periodId,
      providerTransactionId: fixture.providerTxId,
      verifiedAmountMinor: fixture.amount,
      currency: fixture.currency,
      proofDocumentHash: validProofHash
    });

    // Assertion avec UP=1 mais sans UV (userVerified: false)
    const noUvAssertion = signWebAuthnAssertion({
      keypair,
      challenge: actionChal.challenge,
      userPresent: true,
      userVerified: false
    });

    const res = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      reason: 'No UV flag financial test',
      proof: buildValidProof(fixture),
      initiatorWebAuthnConfirmation: {
        credentialId: credId,
        ...noUvAssertion
      },
      fedapayClient: {
        retrieveTransaction: async () => ({ id: fixture.providerTxId, status: 'refunded', amount: fixture.amount, currency: fixture.currency })
      }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'USER_VERIFICATION_REQUIRED');
  });

  it('56. Chantier D.2.1 — Scénario 8 : Authentificateur révoqué (rejet CREDENTIAL_REVOKED)', async () => {
    await clearPersistedWebAuthnStateForTests();
    const keypair = generateWebAuthnKeypair();
    const pubSpki = keypair.publicKey.export({ type: 'spki', format: 'pem' });
    const credId = 'cred_revoked_' + randomUUID();

    const regChal = await createRegistrationChallenge(superAdminId);
    await verifyAndRegisterCredential({
      adminId: superAdminId,
      credentialId: credId,
      publicKeySpki: pubSpki,
      clientDataJSON: Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: regChal.challenge, origin: regChal.origin })).toString('base64url'),
      expectedChallenge: regChal.challenge
    });

    await revokeCredential(credId, superAdminId);

    const fixture = await seedFixture();
    const actionChal = await createActionConfirmationChallenge({
      adminId: superAdminId,
      actionType: 'initiate',
      periodId: fixture.periodId,
      providerTransactionId: fixture.providerTxId,
      verifiedAmountMinor: fixture.amount,
      currency: fixture.currency,
      proofDocumentHash: validProofHash
    });

    const assertion = signWebAuthnAssertion({
      keypair,
      challenge: actionChal.challenge
    });

    const res = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      reason: 'Revoked credential test',
      proof: buildValidProof(fixture),
      initiatorWebAuthnConfirmation: {
        credentialId: credId,
        ...assertion
      },
      fedapayClient: {
        retrieveTransaction: async () => ({ id: fixture.providerTxId, status: 'refunded', amount: fixture.amount, currency: fixture.currency })
      }
    });

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, 'CREDENTIAL_REVOKED');
  });

  it('57. Chantier D.2.1 — Scénario 9 : Signature WebAuthn pour un autre dossier / cross-dossier (rejet CHALLENGE_MISMATCH)', async () => {
    await clearPersistedWebAuthnStateForTests();
    const keypair = generateWebAuthnKeypair();
    const pubSpki = keypair.publicKey.export({ type: 'spki', format: 'pem' });
    const credId = 'cred_' + randomUUID();

    const regChal = await createRegistrationChallenge(superAdminId);
    await verifyAndRegisterCredential({
      adminId: superAdminId,
      credentialId: credId,
      publicKeySpki: pubSpki,
      clientDataJSON: Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: regChal.challenge, origin: regChal.origin })).toString('base64url'),
      expectedChallenge: regChal.challenge
    });

    const fixtureA = await seedFixture();
    const fixtureB = await seedFixture();

    const actionChalA = await createActionConfirmationChallenge({
      adminId: superAdminId,
      actionType: 'initiate',
      periodId: fixtureA.periodId,
      providerTransactionId: fixtureA.providerTxId,
      verifiedAmountMinor: fixtureA.amount,
      currency: fixtureA.currency,
      proofDocumentHash: validProofHash
    });

    const assertionA = signWebAuthnAssertion({
      keypair,
      challenge: actionChalA.challenge
    });

    const res = await createParentPackRefundReconciliationRequest({
      periodId: fixtureB.periodId,
      initiatorAdminId: superAdminId,
      reason: 'Cross dossier attack test',
      proof: buildValidProof(fixtureB),
      initiatorWebAuthnConfirmation: {
        credentialId: credId,
        ...assertionA
      },
      fedapayClient: {
        retrieveTransaction: async () => ({ id: fixtureB.providerTxId, status: 'refunded', amount: fixtureB.amount, currency: fixtureB.currency })
      }
    });

    assert.strictEqual(res.success, false);
    assert.match(res.code, /(CHALLENGE_DOSSIER_MISMATCH|CHALLENGE_NOT_FOUND|CHALLENGE_MISMATCH)/);
  });

  it('58. Chantier D.2.1 — Scénario 10 : Modification du montant après confirmation WebAuthn (rejet fail-closed)', async () => {
    await clearPersistedWebAuthnStateForTests();
    const keypair = generateWebAuthnKeypair();
    const pubSpki = keypair.publicKey.export({ type: 'spki', format: 'pem' });
    const credId = 'cred_' + randomUUID();

    const regChal = await createRegistrationChallenge(superAdminId);
    await verifyAndRegisterCredential({
      adminId: superAdminId,
      credentialId: credId,
      publicKeySpki: pubSpki,
      clientDataJSON: Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: regChal.challenge, origin: regChal.origin })).toString('base64url'),
      expectedChallenge: regChal.challenge
    });

    const fixture = await seedFixture();
    const actionChal = await createActionConfirmationChallenge({
      adminId: superAdminId,
      actionType: 'initiate',
      periodId: fixture.periodId,
      providerTransactionId: fixture.providerTxId,
      verifiedAmountMinor: fixture.amount,
      currency: fixture.currency,
      proofDocumentHash: validProofHash
    });

    const assertion = signWebAuthnAssertion({
      keypair,
      challenge: actionChal.challenge
    });

    const tamperedProof = buildValidProof(fixture);
    tamperedProof.refundedAmountMinor = 20000;

    const res = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      reason: 'Tampered amount test',
      proof: tamperedProof,
      initiatorWebAuthnConfirmation: {
        credentialId: credId,
        ...assertion
      },
      fedapayClient: {
        retrieveTransaction: async () => ({ id: fixture.providerTxId, status: 'refunded', amount: fixture.amount, currency: fixture.currency })
      }
    });

    assert.strictEqual(res.success, false);
    assert.match(res.code, /(CHALLENGE_DOSSIER_MISMATCH|PROOF_AMOUNT_MISMATCH|CHALLENGE_MISMATCH)/);
  });

  it('59. Chantier D.2.1 — Scénario 11 : Réutilisation d\'un challenge d\'action WebAuthn / anti-rejeu (rejet CHALLENGE_ALREADY_CONSUMED)', async () => {
    await clearPersistedWebAuthnStateForTests();
    const keypair = generateWebAuthnKeypair();
    const pubSpki = keypair.publicKey.export({ type: 'spki', format: 'pem' });
    const credId = 'cred_' + randomUUID();

    const regChal = await createRegistrationChallenge(superAdminId);
    await verifyAndRegisterCredential({
      adminId: superAdminId,
      credentialId: credId,
      publicKeySpki: pubSpki,
      clientDataJSON: Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: regChal.challenge, origin: regChal.origin })).toString('base64url'),
      expectedChallenge: regChal.challenge
    });

    const fixture1 = await seedFixture();
    const actionChal = await createActionConfirmationChallenge({
      adminId: superAdminId,
      actionType: 'initiate',
      periodId: fixture1.periodId,
      providerTransactionId: fixture1.providerTxId,
      verifiedAmountMinor: fixture1.amount,
      currency: fixture1.currency,
      proofDocumentHash: validProofHash
    });

    const assertion = signWebAuthnAssertion({
      keypair,
      challenge: actionChal.challenge,
      counter: 1
    });

    // Première utilisation : valide
    const issue1 = await issueConfirmedActionProof({
      adminId: superAdminId,
      actionType: 'initiate',
      periodId: fixture1.periodId,
      providerTransactionId: fixture1.providerTxId,
      verifiedAmountMinor: fixture1.amount,
      currency: fixture1.currency,
      proofDocumentHash: validProofHash,
      webauthnAssertion: {
        credentialId: credId,
        ...assertion
      }
    });
    assert.strictEqual(issue1.success, true);
    assert.strictEqual(typeof issue1.actionProof.signature, 'string');

    // Seconde tentative avec le même challenge et assertion déjà consommés (rejet anti-rejeu)
    const issue2 = await issueConfirmedActionProof({
      adminId: superAdminId,
      actionType: 'initiate',
      periodId: fixture1.periodId,
      providerTransactionId: fixture1.providerTxId,
      verifiedAmountMinor: fixture1.amount,
      currency: fixture1.currency,
      proofDocumentHash: validProofHash,
      webauthnAssertion: {
        credentialId: credId,
        ...assertion
      }
    });

    assert.strictEqual(issue2.success, false);
    assert.strictEqual(issue2.code, 'CHALLENGE_ALREADY_CONSUMED');
  });

  it('60. Chantier D.2.1 — Scénario 12 : Approbation par le même SuperAdmin (rejet DUAL_CUSTODY_VIOLATION)', async () => {
    await clearPersistedWebAuthnStateForTests();
    const keypair = generateWebAuthnKeypair();
    const pubSpki = keypair.publicKey.export({ type: 'spki', format: 'pem' });
    const credId = 'cred_single_' + randomUUID();

    const regChal = await createRegistrationChallenge(superAdminId);
    await verifyAndRegisterCredential({
      adminId: superAdminId,
      credentialId: credId,
      publicKeySpki: pubSpki,
      clientDataJSON: Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: regChal.challenge, origin: regChal.origin })).toString('base64url'),
      expectedChallenge: regChal.challenge
    });

    const fixture = await seedFixture();
    const initChal = await createActionConfirmationChallenge({
      adminId: superAdminId,
      actionType: 'initiate',
      periodId: fixture.periodId,
      providerTransactionId: fixture.providerTxId,
      verifiedAmountMinor: fixture.amount,
      currency: fixture.currency,
      proofDocumentHash: validProofHash
    });

    const initAssertion = signWebAuthnAssertion({
      keypair,
      challenge: initChal.challenge,
      counter: 1
    });

    const initRes = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      reason: 'Dual custody test',
      proof: buildValidProof(fixture),
      initiatorWebAuthnConfirmation: {
        credentialId: credId,
        ...initAssertion
      },
      fedapayClient: {
        retrieveTransaction: async () => ({ id: fixture.providerTxId, status: 'refunded', amount: fixture.amount, currency: fixture.currency })
      }
    });
    assert.strictEqual(initRes.success, true);

    const approveChal = await createActionConfirmationChallenge({
      adminId: superAdminId,
      actionType: 'approve',
      periodId: fixture.periodId,
      reconciliationId: initRes.data.reconciliation_id,
      providerTransactionId: fixture.providerTxId,
      verifiedAmountMinor: fixture.amount,
      currency: fixture.currency,
      proofDocumentHash: validProofHash
    });

    const approveAssertion = signWebAuthnAssertion({
      keypair,
      challenge: approveChal.challenge,
      counter: 2
    });

    const approveRes = await approveAndExecuteParentPackRefundReconciliation({
      reconciliationId: initRes.data.reconciliation_id,
      approverAdminId: superAdminId,
      approvalNotes: 'Self approval attempt',
      approverWebAuthnConfirmation: {
        credentialId: credId,
        ...approveAssertion
      },
      fedapayClient: {
        retrieveTransaction: async () => ({ id: fixture.providerTxId, status: 'refunded', amount: fixture.amount, currency: fixture.currency })
      }
    });

    assert.strictEqual(approveRes.success, false);
    assert.strictEqual(approveRes.code, 'DUAL_CUSTODY_VIOLATION');
  });

  it('61. Chantier D.2.1 — Scénario 13 : Deux SuperAdmins distincts avec confirmations matérielles WebAuthn valides', async () => {
    await clearPersistedWebAuthnStateForTests();
    const keypair1 = generateWebAuthnKeypair();
    const pubSpki1 = keypair1.publicKey.export({ type: 'spki', format: 'pem' });
    const credId1 = 'cred_sa1_' + randomUUID();
    const regChal1 = await createRegistrationChallenge(superAdminId);
    await verifyAndRegisterCredential({
      adminId: superAdminId,
      credentialId: credId1,
      publicKeySpki: pubSpki1,
      clientDataJSON: Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: regChal1.challenge, origin: regChal1.origin })).toString('base64url'),
      expectedChallenge: regChal1.challenge
    });

    const keypair2 = generateWebAuthnKeypair();
    const pubSpki2 = keypair2.publicKey.export({ type: 'spki', format: 'pem' });
    const credId2 = 'cred_sa2_' + randomUUID();
    const regChal2 = await createRegistrationChallenge(approverAdminId);
    await verifyAndRegisterCredential({
      adminId: approverAdminId,
      credentialId: credId2,
      publicKeySpki: pubSpki2,
      clientDataJSON: Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: regChal2.challenge, origin: regChal2.origin })).toString('base64url'),
      expectedChallenge: regChal2.challenge
    });

    const fixture = await seedFixture();
    const mockFedapay = {
      retrieveTransaction: async () => ({ id: fixture.providerTxId, status: 'refunded', amount: fixture.amount, currency: fixture.currency })
    };

    const initChal = await createActionConfirmationChallenge({
      adminId: superAdminId,
      actionType: 'initiate',
      periodId: fixture.periodId,
      providerTransactionId: fixture.providerTxId,
      verifiedAmountMinor: fixture.amount,
      currency: fixture.currency,
      proofDocumentHash: validProofHash
    });

    const initAssertion = signWebAuthnAssertion({
      keypair: keypair1,
      challenge: initChal.challenge,
      counter: 1
    });

    const initRes = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      reason: 'Two distinct admins valid WebAuthn flow',
      proof: buildValidProof(fixture),
      initiatorWebAuthnConfirmation: {
        credentialId: credId1,
        ...initAssertion
      },
      fedapayClient: mockFedapay
    });

    assert.strictEqual(initRes.success, true);
    assert.strictEqual(initRes.code, 'RECONCILIATION_PENDING_APPROVAL');
    const recId = initRes.data.reconciliation_id;

    const approveChal = await createActionConfirmationChallenge({
      adminId: approverAdminId,
      actionType: 'approve',
      periodId: fixture.periodId,
      reconciliationId: recId,
      providerTransactionId: fixture.providerTxId,
      verifiedAmountMinor: fixture.amount,
      currency: fixture.currency,
      proofDocumentHash: validProofHash
    });

    const approveAssertion = signWebAuthnAssertion({
      keypair: keypair2,
      challenge: approveChal.challenge,
      counter: 1
    });

    const approveRes = await approveAndExecuteParentPackRefundReconciliation({
      reconciliationId: recId,
      approverAdminId,
      approvalNotes: 'Valid approval by distinct second SuperAdmin',
      approverWebAuthnConfirmation: {
        credentialId: credId2,
        ...approveAssertion
      },
      fedapayClient: mockFedapay
    });

    assert.strictEqual(approveRes.code, 'SECURITY_BLOCKER');
  });

  it('62. Chantier D.2.1 — Scénario 14 : Appel SQL direct sans attestation indépendante (rejet immédiat ACTION_PROOF_REQUIRED / fail-closed)', async () => {
    const fixture = await seedFixture();
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    try {
      await assert.rejects(
        async () => {
          await client.query(`
            SELECT admin_create_parent_pack_refund_reconciliation(
              $1, $2, 'Direct SQL attack', $3, 'refunded', $4, $5,
              'private://refund-proofs/test.pdf', $6, $4, $5, $7,
              NOW(), NULL, NULL, NULL
            )
          `, [fixture.periodId, superAdminId, fixture.providerTxId, fixture.amount, fixture.currency, validProofHash, fixture.parentRef]);
        },
        (err) => {
          assert.match(err.message, /ACTION_PROOF_REQUIRED/);
          return true;
        }
      );
    } finally {
      await client.end();
    }
  });

  it('63. Chantier D.2.1 — Scénario 15 : Tentative du backend simulé comme compromis de fabriquer les autorisations sans signatures WebAuthn matérielles', async () => {
    await clearPersistedWebAuthnStateForTests();
    const fixture = await seedFixture();

    const compromisedBackendAttempt = await issueConfirmedActionProof({
      adminId: superAdminId,
      actionType: 'initiate',
      periodId: fixture.periodId,
      providerTransactionId: fixture.providerTxId,
      verifiedAmountMinor: fixture.amount,
      currency: fixture.currency,
      proofDocumentHash: validProofHash,
      webauthnAssertion: null
    });

    assert.strictEqual(compromisedBackendAttempt.success, false);
    assert.strictEqual(compromisedBackendAttempt.code, 'WEBAUTHN_CONFIRMATION_REQUIRED');
  });

  it('64. Chantier D.2.1 — Scénario 16 : Indisponibilité de l\'autorité indépendante (rejet fail-closed immédiat AUTHORITY_UNAVAILABLE)', async () => {
    await clearPersistedWebAuthnStateForTests();
    const fixture = await seedFixture();

    const unavailableAttempt = await issueConfirmedActionProof({
      adminId: superAdminId,
      actionType: 'initiate',
      periodId: fixture.periodId,
      providerTransactionId: fixture.providerTxId,
      verifiedAmountMinor: fixture.amount,
      currency: fixture.currency,
      proofDocumentHash: validProofHash,
      webauthnAssertion: { credentialId: 'dummy', clientDataJSON: 'dGVzdA', authenticatorData: 'dGVzdA', signature: 'dGVzdA' },
      authorityAvailable: false
    });

    assert.strictEqual(unavailableAttempt.success, false);
    assert.strictEqual(unavailableAttempt.code, 'AUTHORITY_UNAVAILABLE');
  });

  it('65. Chantier D.2.1 — Scénario 17 : Maintien du blocage financier même avec deux preuves WebAuthn valides (parent_pack_refund_security_gate = false)', async () => {
    const fixture = await seedFixture();
    const gateRes = await adminClient.query(
      `SELECT independent_admin_auth_ready, independent_fedapay_proof_ready, private_worm_storage_ready
       FROM public.parent_pack_refund_security_gate WHERE id = true`
    );
    assert.strictEqual(gateRes.rows[0].independent_admin_auth_ready, false);
    assert.strictEqual(gateRes.rows[0].independent_fedapay_proof_ready, false);
    assert.strictEqual(gateRes.rows[0].private_worm_storage_ready, false);

    const fakeRecId = randomUUID();
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    try {
      await assert.rejects(
        async () => {
          await client.query(`
            SELECT admin_approve_parent_pack_refund_reconciliation(
              $1, $2, 'tx_123', 'refunded', 10000, 'XOF', 'Approval notes', NULL
            )
          `, [fakeRecId, approverAdminId]);
        },
        (err) => {
          assert.match(err.message, /(ACTION_PROOF_REQUIRED|SECURITY_BLOCKER|RECONCILIATION_NOT_FOUND)/);
          return true;
        }
      );
    } finally {
      await client.end();
    }
  });

  // =========================================================================
  // CHANTIER D.2.2 (RÉSOLUTION DES BLOCAGES P1, P4, P5 : AUTORITÉ ISOLÉE,
  //                 @SIMPLEWEBAUTHN/SERVER, PERSISTANCE & ATOMICITÉ POSTGRESQL)
  // =========================================================================

  it('66. Chantier D.2.2 (P1) — Attaque backend compromis : rejet fail-closed par PostgreSQL d\'une preuve HMAC forgée sans challenge WebAuthn consommé lorsqu\'un authentificateur est enregistré', async () => {
    await clearPersistedWebAuthnStateForTests();
    const keypair = generateWebAuthnKeypair();
    const pubSpki = keypair.publicKey.export({ type: 'spki', format: 'pem' });
    const credId = 'cred_p1_' + randomUUID();

    const regChal = await createRegistrationChallenge(superAdminId);
    const attObj = buildWebAuthnAttestationObject({ publicKeySpki: pubSpki, credentialId: credId });
    const regRes = await verifyAndRegisterCredential({
      adminId: superAdminId,
      credentialId: credId,
      attestationObject: attObj,
      clientDataJSON: Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: regChal.challenge, origin: regChal.origin })).toString('base64url'),
      expectedChallenge: regChal.challenge
    });
    assert.strictEqual(regRes.valid, true);

    const fixture = await seedFixture();

    // Cas 1A : Backend compromis sans clé secrète d'autorité tente de générer une preuve
    process.env.YZIOW_SIMULATE_COMPROMISED_BACKEND_NO_KEY = 'true';
    try {
      assert.throws(
        () => generateRefundActionProof({
          adminId: superAdminId,
          actionType: 'initiate',
          periodId: fixture.periodId,
          providerTransactionId: fixture.providerTxId,
          verifiedAmountMinor: fixture.amount,
          currency: fixture.currency,
          proofDocumentHash: validProofHash
        }),
        /AUTHORITY_SECRET_NOT_CONFIGURED/
      );
    } finally {
      delete process.env.YZIOW_SIMULATE_COMPROMISED_BACKEND_NO_KEY;
    }

    // Cas 1B : Même si un attaquant fabriquait une preuve HMAC brute sans passer par
    // la consommation d'un challenge WebAuthn réel dans yziow_refund_auth.webauthn_challenges,
    // PostgreSQL (yziow_refund_auth.verify_and_consume_action_proof) la rejette avec WEBAUTHN_CONFIRMATION_REQUIRED !
    const rawHmacProofWithoutWebAuthn = generateRefundActionProof({
      adminId: superAdminId,
      actionType: 'initiate',
      periodId: fixture.periodId,
      providerTransactionId: fixture.providerTxId,
      verifiedAmountMinor: fixture.amount,
      currency: fixture.currency,
      proofDocumentHash: validProofHash
    });

    const bypassRes = await createParentPackRefundReconciliationRequest({
      periodId: fixture.periodId,
      initiatorAdminId: superAdminId,
      reason: 'Compromised backend HMAC-only bypass attempt',
      proof: buildValidProof(fixture),
      initiatorActionProof: rawHmacProofWithoutWebAuthn,
      fedapayClient: {
        retrieveTransaction: async () => ({ id: fixture.providerTxId, status: 'refunded', amount: fixture.amount, currency: fixture.currency })
      }
    });

    assert.strictEqual(bypassRes.success, false);
    assert.strictEqual(bypassRes.code, 'WEBAUTHN_CONFIRMATION_REQUIRED');
  });

  it('67. Chantier D.2.2 (P1) — Tentative d\'émission d\'une preuve sans authentificateur personnel enregistré (rejet CREDENTIAL_NOT_FOUND)', async () => {
    await clearPersistedWebAuthnStateForTests();
    const fixture = await seedFixture();
    const keypair = generateWebAuthnKeypair();

    const actionChal = await createActionConfirmationChallenge({
      adminId: superAdminId,
      actionType: 'initiate',
      periodId: fixture.periodId,
      providerTransactionId: fixture.providerTxId,
      verifiedAmountMinor: fixture.amount,
      currency: fixture.currency,
      proofDocumentHash: validProofHash
    });

    const assertion = signWebAuthnAssertion({
      keypair,
      challenge: actionChal.challenge
    });

    const issueRes = await issueConfirmedActionProof({
      adminId: superAdminId,
      actionType: 'initiate',
      periodId: fixture.periodId,
      providerTransactionId: fixture.providerTxId,
      verifiedAmountMinor: fixture.amount,
      currency: fixture.currency,
      proofDocumentHash: validProofHash,
      webauthnAssertion: {
        credentialId: 'unregistered_cred_' + randomUUID(),
        ...assertion
      }
    });

    assert.strictEqual(issueRes.success, false);
    assert.strictEqual(issueRes.code, 'CREDENTIAL_NOT_FOUND');
  });

  it('68. Chantier D.2.2 (P4) — Enregistrement avec attestationObject CBOR falsifié ou corrompu : rejet par @simplewebauthn/server (INVALID_ATTESTATION_OBJECT)', async () => {
    await clearPersistedWebAuthnStateForTests();
    const regChal = await createRegistrationChallenge(superAdminId);
    const credId = 'cred_forged_att_' + randomUUID();
    const clientDataJSON = Buffer.from(JSON.stringify({
      type: 'webauthn.create',
      challenge: regChal.challenge,
      origin: regChal.origin
    })).toString('base64url');

    // Tentative 1 : octets CBOR corrompus / non valides
    const badCborRes = await verifyAndRegisterCredential({
      adminId: superAdminId,
      credentialId: credId,
      attestationObject: Buffer.from('not_a_valid_cbor_attestation_object_payload').toString('base64url'),
      clientDataJSON,
      expectedChallenge: regChal.challenge
    });
    assert.strictEqual(badCborRes.valid, false);
    assert.strictEqual(badCborRes.code, 'INVALID_ATTESTATION_OBJECT');

    // Tentative 2 : attestationObject avec fmt inconnu ("rogue-fmt")
    const keypair = generateWebAuthnKeypair();
    const pubSpki = keypair.publicKey.export({ type: 'spki', format: 'pem' });
    const rogueFmtAttObj = buildWebAuthnAttestationObject({
      publicKeySpki: pubSpki,
      credentialId: credId,
      fmt: 'rogue-attestation-format'
    });
    const rogueFmtRes = await verifyAndRegisterCredential({
      adminId: superAdminId,
      credentialId: credId,
      attestationObject: rogueFmtAttObj,
      clientDataJSON,
      expectedChallenge: regChal.challenge
    });
    assert.strictEqual(rogueFmtRes.valid, false);
    assert.strictEqual(rogueFmtRes.code, 'INVALID_ATTESTATION_OBJECT');
  });

  it('69. Chantier D.2.2 (P4) — Enregistrement avec clé COSE invalide ou algorithme non autorisé (ex: RS1 / -65535 ou algorithme inconnu) : rejet UNSUPPORTED_COSE_ALGORITHM', async () => {
    await clearPersistedWebAuthnStateForTests();
    const regChal = await createRegistrationChallenge(superAdminId);
    const credId = 'cred_bad_alg_' + randomUUID();
    const keypair = generateWebAuthnKeypair();
    const pubSpki = keypair.publicKey.export({ type: 'spki', format: 'pem' });

    // Clé COSE avec alg = -65535 (RS1 SHA-1 interdit)
    const weakAlgAttObj = buildWebAuthnAttestationObject({
      publicKeySpki: pubSpki,
      credentialId: credId,
      coseAlg: -65535
    });

    const clientDataJSON = Buffer.from(JSON.stringify({
      type: 'webauthn.create',
      challenge: regChal.challenge,
      origin: regChal.origin
    })).toString('base64url');

    const res = await verifyAndRegisterCredential({
      adminId: superAdminId,
      credentialId: credId,
      attestationObject: weakAlgAttObj,
      clientDataJSON,
      expectedChallenge: regChal.challenge
    });

    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.code, 'UNSUPPORTED_COSE_ALGORITHM');
  });

  it('70. Chantier D.2.2 (P4) — Session SuperAdmin volée tentant un enregistrement ou un remplacement de clé sans co-autorisation d\'un second SuperAdmin : rejet ENROLLMENT_CO_AUTHORIZATION_REQUIRED', async () => {
    await clearPersistedWebAuthnStateForTests();
    const keypair1 = generateWebAuthnKeypair();
    const pubSpki1 = keypair1.publicKey.export({ type: 'spki', format: 'pem' });
    const credId1 = 'cred_initial_' + randomUUID();

    // 1. Tentative d'enrôlement en mode session HTTP (requireEnrollmentApproval: true) sans jeton de co-autorisation
    const regChal1 = await createRegistrationChallenge(superAdminId);
    const attObj1 = buildWebAuthnAttestationObject({ publicKeySpki: pubSpki1, credentialId: credId1 });
    const clientData1 = Buffer.from(JSON.stringify({
      type: 'webauthn.create',
      challenge: regChal1.challenge,
      origin: regChal1.origin
    })).toString('base64url');

    const stolenSessionInitialAttempt = await verifyAndRegisterCredential({
      adminId: superAdminId,
      credentialId: credId1,
      attestationObject: attObj1,
      clientDataJSON: clientData1,
      expectedChallenge: regChal1.challenge,
      requireEnrollmentApproval: true,
      enrollmentApprovalToken: null
    });
    assert.strictEqual(stolenSessionInitialAttempt.valid, false);
    assert.strictEqual(stolenSessionInitialAttempt.code, 'ENROLLMENT_CO_AUTHORIZATION_REQUIRED');

    // 2. Tentative d'auto-approbation par le même SuperAdmin -> rejet SELF_ENROLLMENT_APPROVAL_FORBIDDEN
    assert.throws(
      () => issueEnrollmentApprovalToken({
        targetAdminId: superAdminId,
        approverAdminId: superAdminId
      }),
      /SELF_ENROLLMENT_APPROVAL_FORBIDDEN/
    );

    // 3. Co-autorisation valide par le second SuperAdmin (approverAdminId) -> succès
    const validApprovalToken1 = issueEnrollmentApprovalToken({
      targetAdminId: superAdminId,
      approverAdminId: approverAdminId,
      purpose: 'initial_enrollment'
    });
    const authorizedInitialRes = await verifyAndRegisterCredential({
      adminId: superAdminId,
      credentialId: credId1,
      attestationObject: attObj1,
      clientDataJSON: clientData1,
      expectedChallenge: regChal1.challenge,
      requireEnrollmentApproval: true,
      enrollmentApprovalToken: validApprovalToken1
    });
    assert.strictEqual(authorizedInitialRes.valid, true);
    assert.strictEqual(authorizedInitialRes.credential.registered_by_approver_id, approverAdminId.toLowerCase());

    // 4. Tentative de remplacement de la clé existante sans co-autorisation (même si requireEnrollmentApproval=false)
    const keypair2 = generateWebAuthnKeypair();
    const pubSpki2 = keypair2.publicKey.export({ type: 'spki', format: 'pem' });
    const credId2 = 'cred_rogue_replace_' + randomUUID();
    const regChal2 = await createRegistrationChallenge(superAdminId);
    const attObj2 = buildWebAuthnAttestationObject({ publicKeySpki: pubSpki2, credentialId: credId2 });
    const clientData2 = Buffer.from(JSON.stringify({
      type: 'webauthn.create',
      challenge: regChal2.challenge,
      origin: regChal2.origin
    })).toString('base64url');

    const unauthorizedReplaceRes = await verifyAndRegisterCredential({
      adminId: superAdminId,
      credentialId: credId2,
      attestationObject: attObj2,
      clientDataJSON: clientData2,
      expectedChallenge: regChal2.challenge
    });
    assert.strictEqual(unauthorizedReplaceRes.valid, false);
    assert.strictEqual(unauthorizedReplaceRes.code, 'ENROLLMENT_CO_AUTHORIZATION_REQUIRED');

    // 5. Remplacement légitime avec nouvelle co-autorisation du second SuperAdmin : révoque l'ancienne clé et active la nouvelle
    const validApprovalToken2 = issueEnrollmentApprovalToken({
      targetAdminId: superAdminId,
      approverAdminId: approverAdminId,
      purpose: 'credential_replacement'
    });
    const authorizedReplaceRes = await verifyAndRegisterCredential({
      adminId: superAdminId,
      credentialId: credId2,
      attestationObject: attObj2,
      clientDataJSON: clientData2,
      expectedChallenge: regChal2.challenge,
      enrollmentApprovalToken: validApprovalToken2
    });
    assert.strictEqual(authorizedReplaceRes.valid, true);

    const oldCredDb = await adminClient.query(
      `SELECT is_active, revoked_at FROM public.superadmin_webauthn_credentials WHERE credential_id = $1`,
      [credId1]
    );
    assert.strictEqual(oldCredDb.rows[0].is_active, false);
    assert.ok(oldCredDb.rows[0].revoked_at !== null);
  });

  it('71. Chantier D.2.2 (P5) — Persistance PostgreSQL après redémarrage simulé du service : le credential survit et le challenge consommé reste rejeté (CHALLENGE_ALREADY_CONSUMED)', async () => {
    await clearPersistedWebAuthnStateForTests();
    const keypair = generateWebAuthnKeypair();
    const pubSpki = keypair.publicKey.export({ type: 'spki', format: 'pem' });
    const credId = 'cred_persist_' + randomUUID();

    const regChal = await createRegistrationChallenge(superAdminId);
    const attObj = buildWebAuthnAttestationObject({ publicKeySpki: pubSpki, credentialId: credId });
    const regRes = await verifyAndRegisterCredential({
      adminId: superAdminId,
      credentialId: credId,
      attestationObject: attObj,
      clientDataJSON: Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: regChal.challenge, origin: regChal.origin })).toString('base64url'),
      expectedChallenge: regChal.challenge
    });
    assert.strictEqual(regRes.valid, true);

    const fixture = await seedFixture();
    const actionChal = await createActionConfirmationChallenge({
      adminId: superAdminId,
      actionType: 'initiate',
      periodId: fixture.periodId,
      providerTransactionId: fixture.providerTxId,
      verifiedAmountMinor: fixture.amount,
      currency: fixture.currency,
      proofDocumentHash: validProofHash
    });

    // Simulation d'un redémarrage complet du processus Node.js / changement d'instance serverless
    // AVANT même la confirmation de l'action : la mémoire RAM est vidée, mais PostgreSQL conserve tout !
    resetInMemoryState();

    const assertion = signWebAuthnAssertion({
      keypair,
      challenge: actionChal.challenge,
      counter: 1
    });

    // La première confirmation réussit grâce à la lecture depuis PostgreSQL
    const issue1 = await issueConfirmedActionProof({
      adminId: superAdminId,
      actionType: 'initiate',
      periodId: fixture.periodId,
      providerTransactionId: fixture.providerTxId,
      verifiedAmountMinor: fixture.amount,
      currency: fixture.currency,
      proofDocumentHash: validProofHash,
      webauthnAssertion: {
        credentialId: credId,
        ...assertion
      }
    });
    assert.strictEqual(issue1.success, true);

    // Nouveau redémarrage simulé APRÈS consommation du challenge
    resetInMemoryState();

    // Tentative de rejeu du même challenge après redémarrage : PostgreSQL bloque avec CHALLENGE_ALREADY_CONSUMED
    const replayAfterRestart = await issueConfirmedActionProof({
      adminId: superAdminId,
      actionType: 'initiate',
      periodId: fixture.periodId,
      providerTransactionId: fixture.providerTxId,
      verifiedAmountMinor: fixture.amount,
      currency: fixture.currency,
      proofDocumentHash: validProofHash,
      webauthnAssertion: {
        credentialId: credId,
        ...assertion
      }
    });
    assert.strictEqual(replayAfterRestart.success, false);
    assert.strictEqual(replayAfterRestart.code, 'CHALLENGE_ALREADY_CONSUMED');
  });

  it('72. Chantier D.2.2 (P5) — Concurrence stricte (Promise.all) sur un même challenge WebAuthn : verrouillage FOR UPDATE PostgreSQL (1 seul succès, 1 rejet CHALLENGE_ALREADY_CONSUMED)', async () => {
    await clearPersistedWebAuthnStateForTests();
    const keypair = generateWebAuthnKeypair();
    const pubSpki = keypair.publicKey.export({ type: 'spki', format: 'pem' });
    const credId = 'cred_concurrent_' + randomUUID();

    const regChal = await createRegistrationChallenge(superAdminId);
    const attObj = buildWebAuthnAttestationObject({ publicKeySpki: pubSpki, credentialId: credId });
    await verifyAndRegisterCredential({
      adminId: superAdminId,
      credentialId: credId,
      attestationObject: attObj,
      clientDataJSON: Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: regChal.challenge, origin: regChal.origin })).toString('base64url'),
      expectedChallenge: regChal.challenge
    });

    const fixture = await seedFixture();
    const actionChal = await createActionConfirmationChallenge({
      adminId: superAdminId,
      actionType: 'initiate',
      periodId: fixture.periodId,
      providerTransactionId: fixture.providerTxId,
      verifiedAmountMinor: fixture.amount,
      currency: fixture.currency,
      proofDocumentHash: validProofHash
    });

    const assertion = signWebAuthnAssertion({
      keypair,
      challenge: actionChal.challenge,
      counter: 1
    });

    const callConfirm = () => issueConfirmedActionProof({
      adminId: superAdminId,
      actionType: 'initiate',
      periodId: fixture.periodId,
      providerTransactionId: fixture.providerTxId,
      verifiedAmountMinor: fixture.amount,
      currency: fixture.currency,
      proofDocumentHash: validProofHash,
      webauthnAssertion: {
        credentialId: credId,
        ...assertion
      }
    });

    const [resA, resB] = await Promise.all([callConfirm(), callConfirm()]);
    const successes = [resA, resB].filter(r => r.success === true);
    const failures = [resA, resB].filter(r => r.success === false);

    assert.strictEqual(successes.length, 1, 'Exactement un appel concurrent doit réussir');
    assert.strictEqual(failures.length, 1, 'Exactement un appel concurrent doit être rejeté');
    assert.strictEqual(failures[0].code, 'CHALLENGE_ALREADY_CONSUMED');
  });

  it('73. Chantier D.2.2 (P5) — Isolation SQL stricte : yziow_refund_executor ne peut ni lire ni modifier webauthn_challenges ou superadmin_webauthn_credentials (42501)', async () => {
    const client = new Client({ connectionString: process.env.YZIOW_REFUND_DATABASE_URL });
    await client.connect();
    try {
      await assert.rejects(
        () => client.query(`SELECT * FROM yziow_refund_auth.webauthn_challenges`),
        (err) => {
          assert.strictEqual(err.code, '42501');
          return true;
        }
      );
      await assert.rejects(
        () => client.query(`SELECT * FROM public.superadmin_webauthn_credentials`),
        (err) => {
          assert.strictEqual(err.code, '42501');
          return true;
        }
      );
      await assert.rejects(
        () => client.query(
          `SELECT yziow_refund_auth.store_webauthn_challenge($1, 'initiate', 'chal_123', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'localhost', 'http://localhost:5173', 300)`,
          [superAdminId]
        ),
        (err) => {
          assert.strictEqual(err.code, '42501');
          return true;
        }
      );
      await assert.rejects(
        () => client.query(
          `SELECT yziow_refund_auth.consume_webauthn_challenge('chal_123', $1, 'initiate', 'cred_123')`,
          [superAdminId]
        ),
        (err) => {
          assert.strictEqual(err.code, '42501');
          return true;
        }
      );
    } finally {
      await client.end();
    }
  });

  it('74. Chantier D.2.2 — Nettoyage de l\'état de test et vérification finale du maintien de SECURITY_BLOCKER (les 3 flags parent_pack_refund_security_gate = false)', async () => {
    await clearPersistedWebAuthnStateForTests();
    const gateRes = await adminClient.query(
      `SELECT independent_admin_auth_ready, independent_fedapay_proof_ready, private_worm_storage_ready
       FROM public.parent_pack_refund_security_gate WHERE id = true`
    );
    assert.strictEqual(gateRes.rows[0].independent_admin_auth_ready, false);
    assert.strictEqual(gateRes.rows[0].private_worm_storage_ready, false);
    assert.strictEqual(gateRes.rows[0].independent_fedapay_proof_ready, false);
  });

  // =========================================================================
  // CHANTIER D.2.3 (ISOLATION RÉELLE DE L'AUTORITÉ WEBAUTHN DES DEUX SUPERADMINS)
  // =========================================================================

  const D2_3_AUTHORITY_ONLY_SECRET = 'd2_3_isolated_webauthn_authority_secret_key_never_in_backend_2026';
  const D2_3_BACKEND_TO_AUTHORITY_TOKEN = 'd2_3_backend_to_authority_interservice_bearer_token_2026';
  const D2_3_OOB_BOOTSTRAP_SECRET = 'd2_3_oob_bootstrap_ceremony_secret_never_in_backend_2026';

  async function withIsolatedAuthorityServer(fn) {
    // Configurer la clé secrète isolée dans PostgreSQL (yziow_refund_auth.authority_config)
    await adminClient.query(
      `UPDATE yziow_refund_auth.authority_config SET secret_key = $1, require_webauthn_confirmation = true, updated_at = clock_timestamp() WHERE id = true`,
      [D2_3_AUTHORITY_ONLY_SECRET]
    );

    const authorityServer = await startWebAuthnAuthorityServer({
      port: 0,
      host: '127.0.0.1',
      authoritySecretKey: D2_3_AUTHORITY_ONLY_SECRET,
      authorityDatabaseUrl: authorityRoleUrl,
      backendToAuthorityToken: D2_3_BACKEND_TO_AUTHORITY_TOKEN,
      bootstrapSecretKey: D2_3_OOB_BOOTSTRAP_SECRET,
      enforceAuthoritativeDossierCheck: true
    });

    const prevAuthorityUrl = process.env.YZIOW_WEBAUTHN_AUTHORITY_URL;
    const prevBackendToken = process.env.YZIOW_BACKEND_TO_AUTHORITY_TOKEN;
    const prevSimulateNoKey = process.env.YZIOW_SIMULATE_COMPROMISED_BACKEND_NO_KEY;
    const prevRequireWebAuthn = process.env.YZIOW_REQUIRE_WEBAUTHN_CONFIRMATION;

    // Le backend applicatif reçoit UNIQUEMENT l'URL et le jeton inter-service,
    // mais NE DÉTIENT AUCUNE clé secrète de signature d'autorité.
    process.env.YZIOW_WEBAUTHN_AUTHORITY_URL = authorityServer.url;
    process.env.YZIOW_BACKEND_TO_AUTHORITY_TOKEN = D2_3_BACKEND_TO_AUTHORITY_TOKEN;
    process.env.YZIOW_SIMULATE_COMPROMISED_BACKEND_NO_KEY = 'true';
    process.env.YZIOW_REQUIRE_WEBAUTHN_CONFIRMATION = 'true';

    try {
      return await fn(authorityServer);
    } finally {
      if (prevAuthorityUrl === undefined) delete process.env.YZIOW_WEBAUTHN_AUTHORITY_URL;
      else process.env.YZIOW_WEBAUTHN_AUTHORITY_URL = prevAuthorityUrl;

      if (prevBackendToken === undefined) delete process.env.YZIOW_BACKEND_TO_AUTHORITY_TOKEN;
      else process.env.YZIOW_BACKEND_TO_AUTHORITY_TOKEN = prevBackendToken;

      if (prevSimulateNoKey === undefined) delete process.env.YZIOW_SIMULATE_COMPROMISED_BACKEND_NO_KEY;
      else process.env.YZIOW_SIMULATE_COMPROMISED_BACKEND_NO_KEY = prevSimulateNoKey;

      if (prevRequireWebAuthn === undefined) delete process.env.YZIOW_REQUIRE_WEBAUTHN_CONFIRMATION;
      else process.env.YZIOW_REQUIRE_WEBAUTHN_CONFIRMATION = prevRequireWebAuthn;

      await authorityServer.close();
      await adminClient.query(
        `UPDATE yziow_refund_auth.authority_config SET secret_key = $1, require_webauthn_confirmation = false, updated_at = clock_timestamp() WHERE id = true`,
        [DEFAULT_REFUND_ACTION_AUTH_KEY]
      );
    }
  }

  async function enrollSuperAdminViaAuthority(adminId, approvalToken = null) {
    const keypair = generateWebAuthnKeypair();
    const pubSpki = keypair.publicKey.export({ type: 'spki', format: 'pem' });
    const credId = 'cred_d23_' + randomUUID();
    const regChal = await requestRegistrationChallenge(adminId);
    const attObj = buildWebAuthnAttestationObject({ publicKeySpki: pubSpki, credentialId: credId });
    const clientDataJSON = Buffer.from(JSON.stringify({
      type: 'webauthn.create',
      challenge: regChal.challenge,
      origin: regChal.origin
    })).toString('base64url');

    const otherAdminId = String(adminId).toLowerCase() === String(superAdminId).toLowerCase()
      ? approverAdminId
      : superAdminId;

    const effectiveApprovalToken = approvalToken || issueOutOfBandBootstrapToken({
      targetAdminId: adminId,
      approverAdminId: otherAdminId,
      credentialId: credId,
      purpose: 'initial_oob_bootstrap',
      bootstrapSecretKey: D2_3_OOB_BOOTSTRAP_SECRET
    });

    const regRes = await requestVerifyAndRegisterCredential({
      adminId,
      credentialId: credId,
      attestationObject: attObj,
      clientDataJSON,
      expectedChallenge: regChal.challenge,
      enrollmentApprovalToken: effectiveApprovalToken,
      requireEnrollmentApproval: true
    });
    assert.strictEqual(regRes.valid, true, `Enrôlement échoué: ${regRes.code} - ${regRes.message}`);
    return { keypair, credId };
  }

  it('75. Chantier D.2.3 — Scénario 1 : Backend compromis avec tous ses secrets (YZIOW_REFUND_DATABASE_URL, SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET, YZIOW_BACKEND_TO_AUTHORITY_TOKEN) mais sans authentificateur WebAuthn : échec total', async () => {
    await clearPersistedWebAuthnStateForTests(adminClient);
    await withIsolatedAuthorityServer(async () => {
      await enrollSuperAdminViaAuthority(superAdminId);
      const fixture = await seedFixture();

      // 1. Le backend compromis ne possède pas la clé de signature de l'autorité
      assert.throws(
        () => generateRefundActionProof({
          adminId: superAdminId,
          actionType: 'initiate',
          periodId: fixture.periodId,
          providerTransactionId: fixture.providerTxId,
          verifiedAmountMinor: fixture.amount,
          currency: fixture.currency,
          proofDocumentHash: validProofHash
        }),
        /AUTHORITY_SECRET_NOT_CONFIGURED/
      );

      // 2. Le backend compromis appelle l'autorité HTTP avec son jeton inter-service mais sans assertion matérielle valide
      const chal = await requestActionConfirmationChallenge({
        adminId: superAdminId,
        actionType: 'initiate',
        periodId: fixture.periodId,
        providerTransactionId: fixture.providerTxId,
        verifiedAmountMinor: fixture.amount,
        currency: fixture.currency,
        proofDocumentHash: validProofHash
      });

      const rogueKeypair = generateWebAuthnKeypair();
      const forgedAssertion = signWebAuthnAssertion({
        keypair: rogueKeypair,
        challenge: chal.challenge
      });

      const confirmRes = await requestConfirmedActionProof({
        adminId: superAdminId,
        actionType: 'initiate',
        periodId: fixture.periodId,
        providerTransactionId: fixture.providerTxId,
        verifiedAmountMinor: fixture.amount,
        currency: fixture.currency,
        proofDocumentHash: validProofHash,
        webauthnAssertion: {
          credentialId: 'cred_non_existent',
          ...forgedAssertion
        }
      });
      assert.strictEqual(confirmRes.success, false);
      assert.strictEqual(confirmRes.code, 'CREDENTIAL_NOT_FOUND');

      // 3. Le backend compromis forge une fausse structure de preuve avec une clé devinée et appelle directement PostgreSQL (yziow_refund_executor)
      const guessedProof = generateRefundActionProof({
        adminId: superAdminId,
        actionType: 'initiate',
        periodId: fixture.periodId,
        providerTransactionId: fixture.providerTxId,
        verifiedAmountMinor: fixture.amount,
        currency: fixture.currency,
        proofDocumentHash: validProofHash,
        secretKey: 'wrong_guessed_key_by_compromised_backend',
        webauthnChallengeId: chal.challengeId,
        credentialId: 'cred_forged'
      });

      const execClient = new Client({ connectionString: executorUrl });
      await execClient.connect();
      try {
        await assert.rejects(
          () => execClient.query(
            `SELECT public.admin_create_parent_pack_refund_reconciliation(
              $1, $2, 'Compromised backend direct RPC call', $3, 'refunded', $4, $5,
              'private://refund-proofs/test.pdf', $6, $4, $5, $7, NOW(), NULL, NULL, $8::jsonb
            )`,
            [fixture.periodId, superAdminId, fixture.providerTxId, fixture.amount, fixture.currency, validProofHash, fixture.parentRef, JSON.stringify(guessedProof)]
          ),
          (err) => {
            assert.match(err.message, /INVALID_ACTION_PROOF_SIGNATURE/);
            return true;
          }
        );
      } finally {
        await execClient.end();
      }
    });
  });

  it('76. Chantier D.2.3 — Scénario 2 : Backend compromis tentant d\'appeler l\'autorité WebAuthn sans jeton ou avec un faux jeton : rejet 401 UNAUTHORIZED_BACKEND_CALLER', async () => {
    await clearPersistedWebAuthnStateForTests(adminClient);
    await withIsolatedAuthorityServer(async (authorityServer) => {
      // 1. Appel sans jeton
      const noTokenRes = await fetch(`${authorityServer.url}/v1/credentials/register/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId: superAdminId })
      });
      assert.strictEqual(noTokenRes.status, 401);
      const noTokenBody = await noTokenRes.json();
      assert.strictEqual(noTokenBody.code, 'UNAUTHORIZED_BACKEND_CALLER');

      // 2. Appel avec un faux jeton
      const badTokenRes = await fetch(`${authorityServer.url}/v1/actions/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer forged_token_123456789'
        },
        body: JSON.stringify({ adminId: superAdminId })
      });
      assert.strictEqual(badTokenRes.status, 401);
      const badTokenBody = await badTokenRes.json();
      assert.strictEqual(badTokenBody.code, 'UNAUTHORIZED_BACKEND_CALLER');
    });
  });

  it('77. Chantier D.2.3 — Scénario 3 : Backend compromis tentant d\'écrire directement dans yziow_refund_auth.webauthn_challenges (via yziow_refund_executor et service_role) : rejet 42501', async () => {
    const execClient = new Client({ connectionString: executorUrl });
    await execClient.connect();
    try {
      await assert.rejects(
        () => execClient.query(`INSERT INTO yziow_refund_auth.webauthn_challenges (admin_id, action_type, challenge_bytes, rp_id, origin, expires_at) VALUES ($1, 'initiate', 'forged_chal', 'localhost', 'http://localhost:5173', NOW() + interval '5 minutes')`, [superAdminId]),
        (err) => {
          assert.strictEqual(err.code, '42501');
          return true;
        }
      );
      await assert.rejects(
        () => execClient.query(`SELECT * FROM yziow_refund_auth.get_webauthn_challenge_for_update('forged_chal')`),
        (err) => {
          assert.strictEqual(err.code, '42501');
          return true;
        }
      );
    } finally {
      await execClient.end();
    }

    // Test sous le rôle service_role (SUPABASE_SERVICE_ROLE_KEY)
    await adminClient.query('BEGIN');
    try {
      await adminClient.query('SET LOCAL ROLE service_role');
      await assert.rejects(
        () => adminClient.query(`SELECT * FROM yziow_refund_auth.webauthn_challenges`),
        (err) => {
          assert.strictEqual(err.code, '42501');
          return true;
        }
      );
    } finally {
      await adminClient.query('ROLLBACK');
    }

    await adminClient.query('BEGIN');
    try {
      await adminClient.query('SET LOCAL ROLE service_role');
      await assert.rejects(
        () => adminClient.query(`SELECT yziow_refund_auth.store_webauthn_challenge($1, 'initiate', 'chal_srv', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'localhost', 'http://localhost:5173', 300)`, [superAdminId]),
        (err) => {
          assert.strictEqual(err.code, '42501');
          return true;
        }
      );
    } finally {
      await adminClient.query('ROLLBACK');
    }
  });

  it('78. Chantier D.2.3 — Scénario 4 : Backend compromis tentant de modifier public.superadmin_webauthn_credentials (via yziow_refund_executor et service_role) : rejet 42501 et cloisonnement inverse de yziow_webauthn_authority', async () => {
    const execClient = new Client({ connectionString: executorUrl });
    await execClient.connect();
    try {
      await assert.rejects(
        () => execClient.query(`INSERT INTO public.superadmin_webauthn_credentials (admin_id, credential_id, public_key_spki) VALUES ($1, 'rogue_cred', 'pem')`, [superAdminId]),
        (err) => {
          assert.strictEqual(err.code, '42501');
          return true;
        }
      );
    } finally {
      await execClient.end();
    }

    // Même service_role (SUPABASE_SERVICE_ROLE_KEY) a désormais REVOKE ALL sur public.superadmin_webauthn_credentials
    await adminClient.query('BEGIN');
    try {
      await adminClient.query('SET LOCAL ROLE service_role');
      await assert.rejects(
        () => adminClient.query(`SELECT * FROM public.superadmin_webauthn_credentials`),
        (err) => {
          assert.strictEqual(err.code, '42501');
          return true;
        }
      );
    } finally {
      await adminClient.query('ROLLBACK');
    }

    await adminClient.query('BEGIN');
    try {
      await adminClient.query('SET LOCAL ROLE service_role');
      await assert.rejects(
        () => adminClient.query(`INSERT INTO public.superadmin_webauthn_credentials (admin_id, credential_id, public_key_spki) VALUES ($1, 'rogue_srv_cred', 'pem')`, [superAdminId]),
        (err) => {
          assert.strictEqual(err.code, '42501');
          return true;
        }
      );
    } finally {
      await adminClient.query('ROLLBACK');
    }

    // Et inversement, yziow_webauthn_authority ne peut ni DELETE un credential, ni appeler les RPC de remboursement, ni lire/modifier la gate
    const authDbClient = new Client({ connectionString: authorityRoleUrl });
    await authDbClient.connect();
    try {
      await assert.rejects(
        () => authDbClient.query(`DELETE FROM public.superadmin_webauthn_credentials`),
        (err) => {
          assert.strictEqual(err.code, '42501');
          return true;
        }
      );
      await assert.rejects(
        () => authDbClient.query(`SELECT * FROM public.parent_pack_refund_security_gate`),
        (err) => {
          assert.strictEqual(err.code, '42501');
          return true;
        }
      );
      await assert.rejects(
        () => authDbClient.query(`SELECT public.admin_get_parent_pack_refund_reconciliation($1)`, [randomUUID()]),
        (err) => {
          assert.strictEqual(err.code, '42501');
          return true;
        }
      );
    } finally {
      await authDbClient.end();
    }
  });

  it('79. Chantier D.2.3 — Scénario 5 : Assertion WebAuthn valide pour le dossier A réutilisée pour le dossier B : rejet par l\'autorité HTTP et par PostgreSQL', async () => {
    await clearPersistedWebAuthnStateForTests(adminClient);
    await withIsolatedAuthorityServer(async () => {
      const { keypair, credId } = await enrollSuperAdminViaAuthority(superAdminId);
      const fixtureA = await seedFixture();
      const fixtureB = await seedFixture();

      const chalA = await requestActionConfirmationChallenge({
        adminId: superAdminId,
        actionType: 'initiate',
        periodId: fixtureA.periodId,
        providerTransactionId: fixtureA.providerTxId,
        verifiedAmountMinor: fixtureA.amount,
        currency: fixtureA.currency,
        proofDocumentHash: validProofHash
      });

      const assertionA = signWebAuthnAssertion({
        keypair,
        challenge: chalA.challenge
      });

      // Tentative d'utiliser l'assertion du dossier A pour obtenir une preuve sur le dossier B auprès de l'autorité indépendante
      const crossConfirm = await requestConfirmedActionProof({
        adminId: superAdminId,
        actionType: 'initiate',
        periodId: fixtureB.periodId,
        providerTransactionId: fixtureB.providerTxId,
        verifiedAmountMinor: fixtureB.amount,
        currency: fixtureB.currency,
        proofDocumentHash: validProofHash,
        webauthnAssertion: {
          credentialId: credId,
          ...assertionA
        }
      });
      assert.strictEqual(crossConfirm.success, false);
      assert.strictEqual(crossConfirm.code, 'CHALLENGE_DOSSIER_MISMATCH');
    });
  });

  it('80. Chantier D.2.3 — Scénario 6 : Modification du montant, de la transaction ou du hash par le backend compromis : rejet AUTHORITATIVE_DOSSIER_MISMATCH par l\'autorité indépendante et par PostgreSQL', async () => {
    await clearPersistedWebAuthnStateForTests(adminClient);
    await withIsolatedAuthorityServer(async () => {
      const { keypair, credId } = await enrollSuperAdminViaAuthority(superAdminId);
      const fixture = await seedFixture();

      // 1. Le backend compromis tente de demander un challenge à l'autorité avec un montant falsifié (99999 au lieu de fixture.amount)
      await assert.rejects(
        () => requestActionConfirmationChallenge({
          adminId: superAdminId,
          actionType: 'initiate',
          periodId: fixture.periodId,
          providerTransactionId: fixture.providerTxId,
          verifiedAmountMinor: 99999,
          currency: fixture.currency,
          proofDocumentHash: validProofHash
        }),
        (err) => {
          assert.strictEqual(err.code, 'AUTHORITATIVE_DOSSIER_MISMATCH');
          return true;
        }
      );

      // 2. Le backend compromis tente de demander un challenge avec un providerTransactionId falsifié
      await assert.rejects(
        () => requestActionConfirmationChallenge({
          adminId: superAdminId,
          actionType: 'initiate',
          periodId: fixture.periodId,
          providerTransactionId: 'tx_falsified_by_compromised_backend',
          verifiedAmountMinor: fixture.amount,
          currency: fixture.currency,
          proofDocumentHash: validProofHash
        }),
        (err) => {
          assert.strictEqual(err.code, 'AUTHORITATIVE_DOSSIER_MISMATCH');
          return true;
        }
      );

      // 3. Même après émission d'une preuve légitime, toute altération d'un champ (hash ou montant ou webauthn_challenge_id) est rejetée par PostgreSQL
      const validChal = await requestActionConfirmationChallenge({
        adminId: superAdminId,
        actionType: 'initiate',
        periodId: fixture.periodId,
        providerTransactionId: fixture.providerTxId,
        verifiedAmountMinor: fixture.amount,
        currency: fixture.currency,
        proofDocumentHash: validProofHash
      });
      const assertion = signWebAuthnAssertion({ keypair, challenge: validChal.challenge });
      const issued = await requestConfirmedActionProof({
        adminId: superAdminId,
        actionType: 'initiate',
        periodId: fixture.periodId,
        providerTransactionId: fixture.providerTxId,
        verifiedAmountMinor: fixture.amount,
        currency: fixture.currency,
        proofDocumentHash: validProofHash,
        webauthnAssertion: { credentialId: credId, ...assertion }
      });
      assert.strictEqual(issued.success, true);

      const tamperedProof = { ...issued.actionProof, credential_id: 'cred_tampered_after_signature' };
      const execClient = new Client({ connectionString: executorUrl });
      await execClient.connect();
      try {
        await assert.rejects(
          () => execClient.query(
            `SELECT public.admin_create_parent_pack_refund_reconciliation(
              $1, $2, 'Tampered credential_id in proof', $3, 'refunded', $4, $5,
              'private://refund-proofs/test.pdf', $6, $4, $5, $7, NOW(), NULL, NULL, $8::jsonb
            )`,
            [fixture.periodId, superAdminId, fixture.providerTxId, fixture.amount, fixture.currency, validProofHash, fixture.parentRef, JSON.stringify(tamperedProof)]
          ),
          (err) => {
            assert.match(err.message, /INVALID_ACTION_PROOF_SIGNATURE/);
            return true;
          }
        );
      } finally {
        await execClient.end();
      }
    });
  });

  it('81. Chantier D.2.3 — Scénario 7 : Rejeu de challenge ou d\'attestation (Promise.all sur l\'autorité HTTP et rejeu SQL) : 1 seul succès, rejet CHALLENGE_ALREADY_CONSUMED / ACTION_PROOF_ALREADY_CONSUMED', async () => {
    await clearPersistedWebAuthnStateForTests(adminClient);
    await withIsolatedAuthorityServer(async () => {
      const { keypair, credId } = await enrollSuperAdminViaAuthority(superAdminId);
      const fixture = await seedFixture();

      const chal = await requestActionConfirmationChallenge({
        adminId: superAdminId,
        actionType: 'initiate',
        periodId: fixture.periodId,
        providerTransactionId: fixture.providerTxId,
        verifiedAmountMinor: fixture.amount,
        currency: fixture.currency,
        proofDocumentHash: validProofHash
      });

      const assertion = signWebAuthnAssertion({ keypair, challenge: chal.challenge, counter: 1 });

      const sendConfirm = () => requestConfirmedActionProof({
        adminId: superAdminId,
        actionType: 'initiate',
        periodId: fixture.periodId,
        providerTransactionId: fixture.providerTxId,
        verifiedAmountMinor: fixture.amount,
        currency: fixture.currency,
        proofDocumentHash: validProofHash,
        webauthnAssertion: { credentialId: credId, ...assertion }
      });

      const [r1, r2] = await Promise.all([sendConfirm(), sendConfirm()]);
      const okList = [r1, r2].filter((r) => r.success === true);
      const failList = [r1, r2].filter((r) => r.success === false);
      assert.strictEqual(okList.length, 1);
      assert.strictEqual(failList.length, 1);
      assert.strictEqual(failList[0].code, 'CHALLENGE_ALREADY_CONSUMED');
    });
  });

  it('82. Chantier D.2.3 — Scénario 8 : Confirmation avec UP = 0 ou UV = 0 auprès de l\'autorité HTTP : rejet USER_PRESENCE_REQUIRED et USER_VERIFICATION_REQUIRED', async () => {
    await clearPersistedWebAuthnStateForTests(adminClient);
    await withIsolatedAuthorityServer(async () => {
      const { keypair, credId } = await enrollSuperAdminViaAuthority(superAdminId);
      const fixture = await seedFixture();

      const chal1 = await requestActionConfirmationChallenge({
        adminId: superAdminId,
        actionType: 'initiate',
        periodId: fixture.periodId,
        providerTransactionId: fixture.providerTxId,
        verifiedAmountMinor: fixture.amount,
        currency: fixture.currency,
        proofDocumentHash: validProofHash
      });

      const noUpAssertion = signWebAuthnAssertion({
        keypair,
        challenge: chal1.challenge,
        userPresent: false,
        userVerified: true
      });
      const resNoUp = await requestConfirmedActionProof({
        adminId: superAdminId,
        actionType: 'initiate',
        periodId: fixture.periodId,
        providerTransactionId: fixture.providerTxId,
        verifiedAmountMinor: fixture.amount,
        currency: fixture.currency,
        proofDocumentHash: validProofHash,
        webauthnAssertion: { credentialId: credId, ...noUpAssertion }
      });
      assert.strictEqual(resNoUp.success, false);
      assert.strictEqual(resNoUp.code, 'USER_PRESENCE_REQUIRED');

      const noUvAssertion = signWebAuthnAssertion({
        keypair,
        challenge: chal1.challenge,
        userPresent: true,
        userVerified: false
      });
      const resNoUv = await requestConfirmedActionProof({
        adminId: superAdminId,
        actionType: 'initiate',
        periodId: fixture.periodId,
        providerTransactionId: fixture.providerTxId,
        verifiedAmountMinor: fixture.amount,
        currency: fixture.currency,
        proofDocumentHash: validProofHash,
        webauthnAssertion: { credentialId: credId, ...noUvAssertion }
      });
      assert.strictEqual(resNoUv.success, false);
      assert.strictEqual(resNoUv.code, 'USER_VERIFICATION_REQUIRED');
    });
  });

  it('83. Chantier D.2.3 — Scénario 9 : Tentative de remplacement d\'authentificateur sans co-autorisation matérielle WebAuthn d\'un second SuperAdmin : rejet HARDWARE_ENROLLMENT_CO_AUTH_REQUIRED puis succès avec assertion matérielle du second SuperAdmin', async () => {
    await clearPersistedWebAuthnStateForTests(adminClient);
    await withIsolatedAuthorityServer(async () => {
      // Enrôlement initial des deux SuperAdmins
      const sa1 = await enrollSuperAdminViaAuthority(superAdminId);
      const sa2 = await enrollSuperAdminViaAuthority(approverAdminId);

      // Le backend compromis tente de remplacer l'authentificateur de SuperAdmin #1
      const newKeypair = generateWebAuthnKeypair();
      const newPubSpki = newKeypair.publicKey.export({ type: 'spki', format: 'pem' });
      const newCredId = 'cred_replace_d23_' + randomUUID();
      const regChal = await requestRegistrationChallenge(superAdminId);
      const attObj = buildWebAuthnAttestationObject({ publicKeySpki: newPubSpki, credentialId: newCredId });
      const clientDataJSON = Buffer.from(JSON.stringify({
        type: 'webauthn.create',
        challenge: regChal.challenge,
        origin: regChal.origin
      })).toString('base64url');

      // 1. Sans jeton de co-autorisation -> rejet ENROLLMENT_CO_AUTHORIZATION_REQUIRED
      const noTokenAttempt = await requestVerifyAndRegisterCredential({
        adminId: superAdminId,
        credentialId: newCredId,
        attestationObject: attObj,
        clientDataJSON,
        expectedChallenge: regChal.challenge
      });
      assert.strictEqual(noTokenAttempt.valid, false);
      assert.strictEqual(noTokenAttempt.code, 'ENROLLMENT_CO_AUTHORIZATION_REQUIRED');

      // 2. Avec un jeton déclaratif/HMAC sans assertion matérielle WebAuthn de SuperAdmin #2 -> rejet HARDWARE_ENROLLMENT_CO_AUTH_REQUIRED
      const nonHardwareToken = issueEnrollmentApprovalToken({
        targetAdminId: superAdminId,
        approverAdminId: approverAdminId,
        purpose: 'credential_replacement',
        secretKey: D2_3_AUTHORITY_ONLY_SECRET
      });
      const softwareTokenAttempt = await requestVerifyAndRegisterCredential({
        adminId: superAdminId,
        credentialId: newCredId,
        attestationObject: attObj,
        clientDataJSON,
        expectedChallenge: regChal.challenge,
        enrollmentApprovalToken: nonHardwareToken
      });
      assert.strictEqual(softwareTokenAttempt.valid, false);
      assert.strictEqual(softwareTokenAttempt.code, 'HARDWARE_ENROLLMENT_CO_AUTH_REQUIRED');

      // 3. Co-autorisation matérielle WebAuthn (UP=1, UV=1) signée par la clé physique de SuperAdmin #2
      const enrollChal = await requestEnrollmentApprovalChallenge({
        targetAdminId: superAdminId,
        approverAdminId: approverAdminId,
        purpose: 'credential_replacement'
      });
      const sa2Assertion = signWebAuthnAssertion({
        keypair: sa2.keypair,
        challenge: enrollChal.challenge,
        userPresent: true,
        userVerified: true,
        counter: 1
      });
      const confirmedApproval = await requestConfirmedEnrollmentApprovalToken({
        targetAdminId: superAdminId,
        approverAdminId: approverAdminId,
        purpose: 'credential_replacement',
        webauthnAssertion: {
          credentialId: sa2.credId,
          ...sa2Assertion
        }
      });
      assert.strictEqual(confirmedApproval.valid, true);

      const validReplaceRes = await requestVerifyAndRegisterCredential({
        adminId: superAdminId,
        credentialId: newCredId,
        attestationObject: attObj,
        clientDataJSON,
        expectedChallenge: regChal.challenge,
        enrollmentApprovalToken: confirmedApproval.enrollmentApprovalToken
      });
      assert.strictEqual(validReplaceRes.valid, true);
      assert.strictEqual(validReplaceRes.credential.credential_id, newCredId);

      // L'ancien credential de SuperAdmin #1 est désormais révoqué dans PostgreSQL
      const oldCredCheck = await adminClient.query(
        `SELECT is_active, revoked_at FROM public.superadmin_webauthn_credentials WHERE credential_id = $1`,
        [sa1.credId]
      );
      assert.strictEqual(oldCredCheck.rows[0].is_active, false);
      assert.ok(oldCredCheck.rows[0].revoked_at !== null);
    });
  });

  it('84. Chantier D.2.3 — Scénario 10 : Même SuperAdmin tentant d\'initier puis d\'approuver : rejet DUAL_CUSTODY_VIOLATION dès l\'autorité indépendante et par PostgreSQL', async () => {
    await clearPersistedWebAuthnStateForTests(adminClient);
    await withIsolatedAuthorityServer(async () => {
      const sa1 = await enrollSuperAdminViaAuthority(superAdminId);
      const fixture = await seedFixture();
      const mockFedapay = {
        retrieveTransaction: async () => ({ id: fixture.providerTxId, status: 'refunded', amount: fixture.amount, currency: fixture.currency })
      };

      const initChal = await requestActionConfirmationChallenge({
        adminId: superAdminId,
        actionType: 'initiate',
        periodId: fixture.periodId,
        providerTransactionId: fixture.providerTxId,
        verifiedAmountMinor: fixture.amount,
        currency: fixture.currency,
        proofDocumentHash: validProofHash
      });
      const initAssertion = signWebAuthnAssertion({ keypair: sa1.keypair, challenge: initChal.challenge, counter: 1 });

      const initRes = await createParentPackRefundReconciliationRequest({
        periodId: fixture.periodId,
        initiatorAdminId: superAdminId,
        reason: 'D.2.3 self-approval block test',
        proof: buildValidProof(fixture),
        initiatorWebAuthnConfirmation: { credentialId: sa1.credId, ...initAssertion },
        fedapayClient: mockFedapay
      });
      assert.strictEqual(initRes.success, true);
      const recId = initRes.data.reconciliation_id;

      // L'autorité indépendante inspecte le dossier dans PostgreSQL et refuse d'émettre un challenge d'approbation pour l'initiateur
      await assert.rejects(
        () => requestActionConfirmationChallenge({
          adminId: superAdminId,
          actionType: 'approve',
          periodId: fixture.periodId,
          reconciliationId: recId,
          providerTransactionId: fixture.providerTxId,
          verifiedAmountMinor: fixture.amount,
          currency: fixture.currency,
          proofDocumentHash: validProofHash
        }),
        (err) => {
          assert.strictEqual(err.code, 'DUAL_CUSTODY_VIOLATION');
          return true;
        }
      );
    });
  });

  it('85. Chantier D.2.3 — Scénario 11 : Autorité WebAuthn indisponible : rejet fail-closed AUTHORITY_UNAVAILABLE sans fallback local', async () => {
    await clearPersistedWebAuthnStateForTests(adminClient);
    const fixture = await seedFixture();
    const prevUrl = process.env.YZIOW_WEBAUTHN_AUTHORITY_URL;
    const prevEnforce = process.env.YZIOW_ENFORCE_EXTERNAL_AUTHORITY;

    try {
      // Pointage vers un port fermé avec exigence d'autorité externe
      process.env.YZIOW_WEBAUTHN_AUTHORITY_URL = 'http://127.0.0.1:1';
      process.env.YZIOW_ENFORCE_EXTERNAL_AUTHORITY = 'true';

      const res = await createParentPackRefundReconciliationRequest({
        periodId: fixture.periodId,
        initiatorAdminId: superAdminId,
        reason: 'Authority unreachable test',
        proof: buildValidProof(fixture),
        initiatorWebAuthnConfirmation: {
          credentialId: 'cred_any',
          clientDataJSON: 'dGVzdA',
          authenticatorData: 'dGVzdA',
          signature: 'dGVzdA'
        },
        fedapayClient: {
          retrieveTransaction: async () => ({ id: fixture.providerTxId, status: 'refunded', amount: fixture.amount, currency: fixture.currency })
        }
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.code, 'AUTHORITY_UNAVAILABLE');
    } finally {
      if (prevUrl === undefined) delete process.env.YZIOW_WEBAUTHN_AUTHORITY_URL;
      else process.env.YZIOW_WEBAUTHN_AUTHORITY_URL = prevUrl;

      if (prevEnforce === undefined) delete process.env.YZIOW_ENFORCE_EXTERNAL_AUTHORITY;
      else process.env.YZIOW_ENFORCE_EXTERNAL_AUTHORITY = prevEnforce;
    }
  });

  it('86. Chantier D.2.3 — Scénario 12 : Deux SuperAdmins distincts avec authentificateurs valides via l\'Autorité HTTP isolée, mais compensation financière toujours bloquée par parent_pack_refund_security_gate (SECURITY_BLOCKER)', async () => {
    await clearPersistedWebAuthnStateForTests(adminClient);
    await withIsolatedAuthorityServer(async () => {
      const sa1 = await enrollSuperAdminViaAuthority(superAdminId);
      const sa2 = await enrollSuperAdminViaAuthority(approverAdminId);

      const fixture = await seedFixture();
      const mockFedapay = {
        retrieveTransaction: async () => ({ id: fixture.providerTxId, status: 'refunded', amount: fixture.amount, currency: fixture.currency })
      };

      // Étape 1 : Initiation par SuperAdmin #1 via l'Autorité HTTP isolée
      const initChal = await requestActionConfirmationChallenge({
        adminId: superAdminId,
        actionType: 'initiate',
        periodId: fixture.periodId,
        providerTransactionId: fixture.providerTxId,
        verifiedAmountMinor: fixture.amount,
        currency: fixture.currency,
        proofDocumentHash: validProofHash
      });
      const initAssertion = signWebAuthnAssertion({ keypair: sa1.keypair, challenge: initChal.challenge, counter: 1 });

      const initRes = await createParentPackRefundReconciliationRequest({
        periodId: fixture.periodId,
        initiatorAdminId: superAdminId,
        reason: 'D.2.3 full dual-admin isolated authority test',
        proof: buildValidProof(fixture),
        initiatorWebAuthnConfirmation: { credentialId: sa1.credId, ...initAssertion },
        fedapayClient: mockFedapay
      });
      assert.strictEqual(initRes.success, true);
      assert.strictEqual(initRes.code, 'RECONCILIATION_PENDING_APPROVAL');
      const recId = initRes.data.reconciliation_id;

      // Étape 2 : Approbation par SuperAdmin #2 via l'Autorité HTTP isolée
      const approveChal = await requestActionConfirmationChallenge({
        adminId: approverAdminId,
        actionType: 'approve',
        periodId: fixture.periodId,
        reconciliationId: recId,
        providerTransactionId: fixture.providerTxId,
        verifiedAmountMinor: fixture.amount,
        currency: fixture.currency,
        proofDocumentHash: validProofHash
      });
      const approveAssertion = signWebAuthnAssertion({ keypair: sa2.keypair, challenge: approveChal.challenge, counter: 1 });

      const approveRes = await approveAndExecuteParentPackRefundReconciliation({
        reconciliationId: recId,
        approverAdminId,
        approvalNotes: 'D.2.3 second admin approval with hardware key',
        approverWebAuthnConfirmation: { credentialId: sa2.credId, ...approveAssertion },
        fedapayClient: mockFedapay
      });

      assert.strictEqual(approveRes.success, false);
      assert.strictEqual(approveRes.code, 'SECURITY_BLOCKER');
    });

    // Nettoyage final et vérification des 3 flags de parent_pack_refund_security_gate = false
    await clearPersistedWebAuthnStateForTests(adminClient);
    const gateRes = await adminClient.query(
      `SELECT independent_admin_auth_ready, independent_fedapay_proof_ready, private_worm_storage_ready
       FROM public.parent_pack_refund_security_gate WHERE id = true`
    );
    assert.strictEqual(gateRes.rows[0].independent_admin_auth_ready, false);
    assert.strictEqual(gateRes.rows[0].independent_fedapay_proof_ready, false);
    assert.strictEqual(gateRes.rows[0].private_worm_storage_ready, false);
  });

  it('87. Chantier D.2.3 — Scénario 13 : Sécurité du premier enrôlement WebAuthn (0 authentificateur actif) face à un backend totalement compromis et absence de fallback hors mode test', async () => {
    await clearPersistedWebAuthnStateForTests(adminClient);

    // Vérifier qu'aucun SuperAdmin ne possède d'authentificateur actif (état initial 0 credential)
    const zeroCreds = await adminClient.query(
      `SELECT COUNT(*)::int AS cnt FROM public.superadmin_webauthn_credentials WHERE is_active = true`
    );
    assert.strictEqual(zeroCreds.rows[0].cnt, 0);

    await withIsolatedAuthorityServer(async () => {
      const attackerKeypair1 = generateWebAuthnKeypair();
      const attackerSpki1 = attackerKeypair1.publicKey.export({ type: 'spki', format: 'pem' });
      const attackerCredId1 = 'cred_attacker_bootstrap_' + randomUUID();
      const regChal1 = await requestRegistrationChallenge(superAdminId);
      const attObj1 = buildWebAuthnAttestationObject({ publicKeySpki: attackerSpki1, credentialId: attackerCredId1 });
      const clientDataJSON1 = Buffer.from(JSON.stringify({
        type: 'webauthn.create',
        challenge: regChal1.challenge,
        origin: regChal1.origin
      })).toString('base64url');

      // 1. Le backend totalement compromis tente d'enregistrer un premier authentificateur en forçant requireEnrollmentApproval: false
      const bypassAttempt = await requestVerifyAndRegisterCredential({
        adminId: superAdminId,
        credentialId: attackerCredId1,
        attestationObject: attObj1,
        clientDataJSON: clientDataJSON1,
        expectedChallenge: regChal1.challenge,
        enrollmentApprovalToken: null,
        requireEnrollmentApproval: false
      });
      assert.strictEqual(bypassAttempt.valid, false);
      assert.strictEqual(bypassAttempt.code, 'ENROLLMENT_CO_AUTHORIZATION_REQUIRED');

      // 2. Le backend compromis tente d'utiliser un jeton logiciel sans oob_bootstrap alors qu'aucun authentificateur matériel de référence n'existe
      const softwareTokenZeroCreds = issueEnrollmentApprovalToken({
        targetAdminId: superAdminId,
        approverAdminId: approverAdminId,
        purpose: 'initial_enrollment',
        secretKey: D2_3_AUTHORITY_ONLY_SECRET
      });
      const softwareAttempt = await requestVerifyAndRegisterCredential({
        adminId: superAdminId,
        credentialId: attackerCredId1,
        attestationObject: attObj1,
        clientDataJSON: clientDataJSON1,
        expectedChallenge: regChal1.challenge,
        enrollmentApprovalToken: softwareTokenZeroCreds
      });
      assert.strictEqual(softwareAttempt.valid, false);
      assert.strictEqual(softwareAttempt.code, 'BOOTSTRAP_OUT_OF_BAND_AUTHORIZATION_REQUIRED');

      // 3. Le backend compromis tente de forger un jeton oob_bootstrap sans posséder YZIOW_WEBAUTHN_BOOTSTRAP_SECRET
      const forgedBootstrapToken = issueOutOfBandBootstrapToken({
        targetAdminId: superAdminId,
        approverAdminId: approverAdminId,
        credentialId: attackerCredId1,
        bootstrapSecretKey: 'wrong_backend_guessed_bootstrap_secret_key'
      });
      const forgedBootstrapAttempt = await requestVerifyAndRegisterCredential({
        adminId: superAdminId,
        credentialId: attackerCredId1,
        attestationObject: attObj1,
        clientDataJSON: clientDataJSON1,
        expectedChallenge: regChal1.challenge,
        enrollmentApprovalToken: forgedBootstrapToken
      });
      assert.strictEqual(forgedBootstrapAttempt.valid, false);
      assert.strictEqual(forgedBootstrapAttempt.code, 'BOOTSTRAP_OUT_OF_BAND_AUTHORIZATION_REQUIRED');

      // 4. Cérémonie légitime hors bande : émission d'un jeton oob_bootstrap lié au credentialId exact de SuperAdmin #1
      const sa1Keypair = generateWebAuthnKeypair();
      const sa1Spki = sa1Keypair.publicKey.export({ type: 'spki', format: 'pem' });
      const sa1CredId = 'cred_legit_sa1_' + randomUUID();
      const validOobToken = issueOutOfBandBootstrapToken({
        targetAdminId: superAdminId,
        approverAdminId: approverAdminId,
        credentialId: sa1CredId,
        bootstrapSecretKey: D2_3_OOB_BOOTSTRAP_SECRET
      });

      // Tentative par le backend compromis de détourner ce jeton oob_bootstrap pour enregistrer sa propre clé (attackerCredId1 != sa1CredId)
      const hijackBootstrapAttempt = await requestVerifyAndRegisterCredential({
        adminId: superAdminId,
        credentialId: attackerCredId1,
        attestationObject: attObj1,
        clientDataJSON: clientDataJSON1,
        expectedChallenge: regChal1.challenge,
        enrollmentApprovalToken: validOobToken
      });
      assert.strictEqual(hijackBootstrapAttempt.valid, false);
      assert.strictEqual(hijackBootstrapAttempt.code, 'INVALID_ENROLLMENT_APPROVAL_TOKEN');

      // Enregistrement légitime de SuperAdmin #1 avec sa1CredId et son jeton oob_bootstrap
      const regChalLegit1 = await requestRegistrationChallenge(superAdminId);
      const attObjLegit1 = buildWebAuthnAttestationObject({ publicKeySpki: sa1Spki, credentialId: sa1CredId });
      const clientDataLegit1 = Buffer.from(JSON.stringify({
        type: 'webauthn.create',
        challenge: regChalLegit1.challenge,
        origin: regChalLegit1.origin
      })).toString('base64url');

      const legitSa1Res = await requestVerifyAndRegisterCredential({
        adminId: superAdminId,
        credentialId: sa1CredId,
        attestationObject: attObjLegit1,
        clientDataJSON: clientDataLegit1,
        expectedChallenge: regChalLegit1.challenge,
        enrollmentApprovalToken: validOobToken
      });
      assert.strictEqual(legitSa1Res.valid, true);

      // Tentative de rejouer le même jeton oob_bootstrap -> rejet INVALID_ENROLLMENT_APPROVAL_TOKEN (déjà consommé)
      const regChalReplay = await requestRegistrationChallenge(superAdminId);
      const clientDataReplay = Buffer.from(JSON.stringify({
        type: 'webauthn.create',
        challenge: regChalReplay.challenge,
        origin: regChalReplay.origin
      })).toString('base64url');
      const replayOobRes = await requestVerifyAndRegisterCredential({
        adminId: superAdminId,
        credentialId: sa1CredId,
        attestationObject: attObjLegit1,
        clientDataJSON: clientDataReplay,
        expectedChallenge: regChalReplay.challenge,
        enrollmentApprovalToken: validOobToken
      });
      assert.strictEqual(replayOobRes.valid, false);
      assert.strictEqual(replayOobRes.code, 'INVALID_ENROLLMENT_APPROVAL_TOKEN');
      assert.match(replayOobRes.message, /déjà consommé/);

      // 5. Enrôlement de SuperAdmin #2 co-autorisé matériellement (UP=1, UV=1) par la clé physique de SuperAdmin #1
      const sa2Keypair = generateWebAuthnKeypair();
      const sa2Spki = sa2Keypair.publicKey.export({ type: 'spki', format: 'pem' });
      const sa2CredId = 'cred_legit_sa2_' + randomUUID();
      const regChalSa2 = await requestRegistrationChallenge(approverAdminId);
      const attObjSa2 = buildWebAuthnAttestationObject({ publicKeySpki: sa2Spki, credentialId: sa2CredId });
      const clientDataSa2 = Buffer.from(JSON.stringify({
        type: 'webauthn.create',
        challenge: regChalSa2.challenge,
        origin: regChalSa2.origin
      })).toString('base64url');

      const approveChalSa1 = await requestEnrollmentApprovalChallenge({
        targetAdminId: approverAdminId,
        approverAdminId: superAdminId,
        purpose: 'initial_enrollment'
      });
      const sa1CoAuthAssertion = signWebAuthnAssertion({
        keypair: sa1Keypair,
        challenge: approveChalSa1.challenge,
        userPresent: true,
        userVerified: true,
        counter: 1
      });
      const confirmedCoAuthToken = await requestConfirmedEnrollmentApprovalToken({
        targetAdminId: approverAdminId,
        approverAdminId: superAdminId,
        purpose: 'initial_enrollment',
        webauthnAssertion: {
          credentialId: sa1CredId,
          ...sa1CoAuthAssertion
        }
      });
      assert.strictEqual(confirmedCoAuthToken.valid, true);

      const legitSa2Res = await requestVerifyAndRegisterCredential({
        adminId: approverAdminId,
        credentialId: sa2CredId,
        attestationObject: attObjSa2,
        clientDataJSON: clientDataSa2,
        expectedChallenge: regChalSa2.challenge,
        enrollmentApprovalToken: confirmedCoAuthToken.enrollmentApprovalToken
      });
      assert.strictEqual(legitSa2Res.valid, true);
    });

    // 6. Vérification de l'absence de fallback hors mode test jetable (staging / development / production)
    const prevNodeEnv = process.env.NODE_ENV;
    const prevAuthUrl = process.env.YZIOW_WEBAUTHN_AUTHORITY_URL;
    const prevEnforce = process.env.YZIOW_ENFORCE_EXTERNAL_AUTHORITY;
    try {
      delete process.env.YZIOW_WEBAUTHN_AUTHORITY_URL;
      delete process.env.YZIOW_ENFORCE_EXTERNAL_AUTHORITY;
      process.env.NODE_ENV = 'staging';
      assert.strictEqual(isExternalAuthorityRequired(), true);
      process.env.NODE_ENV = 'development';
      assert.strictEqual(isExternalAuthorityRequired(), true);
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
      if (prevAuthUrl !== undefined) process.env.YZIOW_WEBAUTHN_AUTHORITY_URL = prevAuthUrl;
      if (prevEnforce !== undefined) process.env.YZIOW_ENFORCE_EXTERNAL_AUTHORITY = prevEnforce;
    }

    // 7. Vérification du durcissement SECURITY DEFINER de store_webauthn_challenge (rejet d'un UUID non-SuperAdmin)
    const authDbClient = new Client({ connectionString: authorityRoleUrl });
    await authDbClient.connect();
    try {
      await assert.rejects(
        () => authDbClient.query(
          `SELECT yziow_refund_auth.store_webauthn_challenge($1, 'initiate', 'chal_non_admin', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'localhost', 'http://localhost:5173', 300)`,
          [randomUUID()]
        ),
        (err) => {
          assert.match(err.message, /UNAUTHORIZED_ADMIN/);
          return true;
        }
      );
    } finally {
      await authDbClient.end();
    }

    // Nettoyage final et vérification des 3 flags de parent_pack_refund_security_gate = false
    await clearPersistedWebAuthnStateForTests(adminClient);
    const gateRes = await adminClient.query(
      `SELECT independent_admin_auth_ready, independent_fedapay_proof_ready, private_worm_storage_ready
       FROM public.parent_pack_refund_security_gate WHERE id = true`
    );
    assert.strictEqual(gateRes.rows[0].independent_admin_auth_ready, false);
    assert.strictEqual(gateRes.rows[0].independent_fedapay_proof_ready, false);
    assert.strictEqual(gateRes.rows[0].private_worm_storage_ready, false);
  });

  // =========================================================================
  // CHANTIER D.2.4 (CORRECTIONS PRÉALABLES À L'HÉBERGEMENT INDÉPENDANT)
  // =========================================================================

  it('88. Chantier D.2.4 — Problème 1 : Un backend compromis envoyant enforceAuthoritativeDossierCheck: false sur /v1/actions/challenge et /v1/actions/confirm ne peut jamais désactiver la contre-vérification PostgreSQL du dossier', async () => {
    await clearPersistedWebAuthnStateForTests(adminClient);
    await withIsolatedAuthorityServer(async (authorityServer) => {
      const { keypair, credId } = await enrollSuperAdminViaAuthority(superAdminId);
      const fixture = await seedFixture();

      // 1. Tentative sur /v1/actions/challenge avec enforceAuthoritativeDossierCheck: false et montant falsifié (999999)
      const challengeBypassRes = await fetch(`${authorityServer.url}/v1/actions/challenge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${D2_3_BACKEND_TO_AUTHORITY_TOKEN}`
        },
        body: JSON.stringify({
          adminId: superAdminId,
          actionType: 'initiate',
          periodId: fixture.periodId,
          providerTransactionId: fixture.providerTxId,
          verifiedAmountMinor: 999999,
          currency: fixture.currency,
          proofDocumentHash: validProofHash,
          enforceAuthoritativeDossierCheck: false
        })
      });
      assert.strictEqual(challengeBypassRes.status, 403);
      const challengeBypassBody = await challengeBypassRes.json();
      assert.strictEqual(challengeBypassBody.success, false);
      assert.strictEqual(challengeBypassBody.code, 'AUTHORITATIVE_DOSSIER_MISMATCH');

      // 2. Tentative sur /v1/actions/confirm avec enforceAuthoritativeDossierCheck: false et transaction falsifiée
      const validChal = await requestActionConfirmationChallenge({
        adminId: superAdminId,
        actionType: 'initiate',
        periodId: fixture.periodId,
        providerTransactionId: fixture.providerTxId,
        verifiedAmountMinor: fixture.amount,
        currency: fixture.currency,
        proofDocumentHash: validProofHash
      });
      const assertion = signWebAuthnAssertion({ keypair, challenge: validChal.challenge, counter: 1 });

      const confirmBypassRes = await fetch(`${authorityServer.url}/v1/actions/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${D2_3_BACKEND_TO_AUTHORITY_TOKEN}`
        },
        body: JSON.stringify({
          adminId: superAdminId,
          actionType: 'initiate',
          periodId: fixture.periodId,
          providerTransactionId: 'tx_falsified_with_bypass_false',
          verifiedAmountMinor: fixture.amount,
          currency: fixture.currency,
          proofDocumentHash: validProofHash,
          webauthnAssertion: { credentialId: credId, ...assertion },
          enforceAuthoritativeDossierCheck: false
        })
      });
      assert.strictEqual(confirmBypassRes.status, 403);
      const confirmBypassBody = await confirmBypassRes.json();
      assert.strictEqual(confirmBypassBody.success, false);
      assert.strictEqual(confirmBypassBody.code, 'AUTHORITATIVE_DOSSIER_MISMATCH');
    });
  });

  it('89. Chantier D.2.4 — Problème 2 : Anti-rejeu persistant et atomique PostgreSQL des jetons d\'amorçage et de co-autorisation (concurrence, redémarrage de l\'autorité, expiration, cloisonnement des rôles)', async () => {
    await clearPersistedWebAuthnStateForTests(adminClient);

    // 1. Vérification de l'absence totale de droits directs pour le backend applicatif (yziow_refund_executor et service_role)
    const execClient = new Client({ connectionString: executorUrl });
    await execClient.connect();
    try {
      await assert.rejects(
        () => execClient.query(`SELECT * FROM yziow_refund_auth.consumed_enrollment_tokens`),
        (err) => {
          assert.strictEqual(err.code, '42501');
          return true;
        }
      );
      await assert.rejects(
        () => execClient.query(
          `SELECT yziow_refund_auth.consume_enrollment_approval_token('nonce_forged_12345', 'oob_bootstrap', $1, $2, 'cred_x', 'initial_oob_bootstrap', NOW(), NOW() + interval '5 minutes')`,
          [superAdminId, approverAdminId]
        ),
        (err) => {
          assert.strictEqual(err.code, '42501');
          return true;
        }
      );
    } finally {
      await execClient.end();
    }

    await adminClient.query('BEGIN');
    try {
      await adminClient.query('SET LOCAL ROLE service_role');
      await assert.rejects(
        () => adminClient.query(`SELECT * FROM yziow_refund_auth.consumed_enrollment_tokens`),
        (err) => {
          assert.strictEqual(err.code, '42501');
          return true;
        }
      );
    } finally {
      await adminClient.query('ROLLBACK');
    }

    await adminClient.query('BEGIN');
    try {
      await adminClient.query('SET LOCAL ROLE service_role');
      await assert.rejects(
        () => adminClient.query(
          `SELECT yziow_refund_auth.consume_enrollment_approval_token('nonce_srv_12345', 'oob_bootstrap', $1, $2, 'cred_x', 'initial_oob_bootstrap', NOW(), NOW() + interval '5 minutes')`,
          [superAdminId, approverAdminId]
        ),
        (err) => {
          assert.strictEqual(err.code, '42501');
          return true;
        }
      );
    } finally {
      await adminClient.query('ROLLBACK');
    }

    // Même yziow_webauthn_authority ne peut pas supprimer (DELETE) ni insérer directement sans passer par la RPC SECURITY DEFINER
    const authDbClient = new Client({ connectionString: authorityRoleUrl });
    await authDbClient.connect();
    try {
      await assert.rejects(
        () => authDbClient.query(`DELETE FROM yziow_refund_auth.consumed_enrollment_tokens`),
        (err) => {
          assert.strictEqual(err.code, '42501');
          return true;
        }
      );
    } finally {
      await authDbClient.end();
    }

    // 2. Expiration du jeton (rejeté par l'autorité et par PostgreSQL)
    await withIsolatedAuthorityServer(async () => {
      const expKeypair = generateWebAuthnKeypair();
      const expSpki = expKeypair.publicKey.export({ type: 'spki', format: 'pem' });
      const expCredId = 'cred_exp_d24_' + randomUUID();
      const expChal = await requestRegistrationChallenge(superAdminId);
      const expAttObj = buildWebAuthnAttestationObject({ publicKeySpki: expSpki, credentialId: expCredId });
      const expClientData = Buffer.from(JSON.stringify({
        type: 'webauthn.create',
        challenge: expChal.challenge,
        origin: expChal.origin
      })).toString('base64url');

      const expiredOobToken = issueOutOfBandBootstrapToken({
        targetAdminId: superAdminId,
        approverAdminId: approverAdminId,
        credentialId: expCredId,
        validitySeconds: -10,
        bootstrapSecretKey: D2_3_OOB_BOOTSTRAP_SECRET
      });

      const expRes = await requestVerifyAndRegisterCredential({
        adminId: superAdminId,
        credentialId: expCredId,
        attestationObject: expAttObj,
        clientDataJSON: expClientData,
        expectedChallenge: expChal.challenge,
        enrollmentApprovalToken: expiredOobToken
      });
      assert.strictEqual(expRes.valid, false);
      assert.strictEqual(expRes.code, 'INVALID_ENROLLMENT_APPROVAL_TOKEN');

      // 3. Deux consommations concurrentes (Promise.all) du même jeton oob_bootstrap avec deux challenges distincts
      const concKeypair = generateWebAuthnKeypair();
      const concSpki = concKeypair.publicKey.export({ type: 'spki', format: 'pem' });
      const concCredId = 'cred_conc_d24_' + randomUUID();
      const [chalA, chalB] = await Promise.all([
        requestRegistrationChallenge(superAdminId),
        requestRegistrationChallenge(superAdminId)
      ]);
      const concAttObj = buildWebAuthnAttestationObject({ publicKeySpki: concSpki, credentialId: concCredId });
      const clientDataA = Buffer.from(JSON.stringify({
        type: 'webauthn.create',
        challenge: chalA.challenge,
        origin: chalA.origin
      })).toString('base64url');
      const clientDataB = Buffer.from(JSON.stringify({
        type: 'webauthn.create',
        challenge: chalB.challenge,
        origin: chalB.origin
      })).toString('base64url');

      const sharedOobToken = issueOutOfBandBootstrapToken({
        targetAdminId: superAdminId,
        approverAdminId: approverAdminId,
        credentialId: concCredId,
        bootstrapSecretKey: D2_3_OOB_BOOTSTRAP_SECRET
      });

      const [resA, resB] = await Promise.all([
        requestVerifyAndRegisterCredential({
          adminId: superAdminId,
          credentialId: concCredId,
          attestationObject: concAttObj,
          clientDataJSON: clientDataA,
          expectedChallenge: chalA.challenge,
          enrollmentApprovalToken: sharedOobToken
        }),
        requestVerifyAndRegisterCredential({
          adminId: superAdminId,
          credentialId: concCredId,
          attestationObject: concAttObj,
          clientDataJSON: clientDataB,
          expectedChallenge: chalB.challenge,
          enrollmentApprovalToken: sharedOobToken
        })
      ]);

      const successes = [resA, resB].filter((r) => r.valid === true);
      const failures = [resA, resB].filter((r) => r.valid === false);
      assert.strictEqual(successes.length, 1);
      assert.strictEqual(failures.length, 1);
      assert.strictEqual(failures[0].code, 'INVALID_ENROLLMENT_APPROVAL_TOKEN');

      // Vérifier que le nonce est bien persisté dans yziow_refund_auth.consumed_enrollment_tokens
      const dbTokenRow = await adminClient.query(
        `SELECT token_nonce, token_type, target_admin_id, approver_admin_id, credential_id
         FROM yziow_refund_auth.consumed_enrollment_tokens WHERE token_nonce = $1`,
        [sharedOobToken.nonce]
      );
      assert.strictEqual(dbTokenRow.rowCount, 1);
      assert.strictEqual(dbTokenRow.rows[0].token_type, 'oob_bootstrap');
      assert.strictEqual(dbTokenRow.rows[0].credential_id, concCredId);

      // 4. Redémarrage complet du processus d'autorité (fermeture HTTP + vidage RAM resetInMemoryState + nouvelle instance)
      //    et tentative de rejeu après redémarrage : rejeté par PostgreSQL !
      resetInMemoryState();
      const secondAuthorityInstance = await startWebAuthnAuthorityServer({
        port: 0,
        host: '127.0.0.1',
        authoritySecretKey: D2_3_AUTHORITY_ONLY_SECRET,
        authorityDatabaseUrl: authorityRoleUrl,
        backendToAuthorityToken: D2_3_BACKEND_TO_AUTHORITY_TOKEN,
        bootstrapSecretKey: D2_3_OOB_BOOTSTRAP_SECRET
      });

      const prevUrl = process.env.YZIOW_WEBAUTHN_AUTHORITY_URL;
      process.env.YZIOW_WEBAUTHN_AUTHORITY_URL = secondAuthorityInstance.url;
      try {
        // Pour tester le rejeu du jeton oob_bootstrap après redémarrage dans un état où 0 clé active n'existe pour l'approbateur,
        // révoquons temporairement le credential créé afin de présenter exactement le même jeton sur la nouvelle instance
        await adminClient.query(`DELETE FROM public.superadmin_webauthn_credentials WHERE credential_id = $1`, [concCredId]);
        resetInMemoryState();

        const chalAfterRestart = await requestRegistrationChallenge(superAdminId);
        const clientDataAfterRestart = Buffer.from(JSON.stringify({
          type: 'webauthn.create',
          challenge: chalAfterRestart.challenge,
          origin: chalAfterRestart.origin
        })).toString('base64url');

        const replayAfterRestart = await requestVerifyAndRegisterCredential({
          adminId: superAdminId,
          credentialId: concCredId,
          attestationObject: concAttObj,
          clientDataJSON: clientDataAfterRestart,
          expectedChallenge: chalAfterRestart.challenge,
          enrollmentApprovalToken: sharedOobToken
        });
        assert.strictEqual(replayAfterRestart.valid, false);
        assert.strictEqual(replayAfterRestart.code, 'INVALID_ENROLLMENT_APPROVAL_TOKEN');
        assert.match(replayAfterRestart.message, /déjà consommé/);
      } finally {
        process.env.YZIOW_WEBAUTHN_AUTHORITY_URL = prevUrl;
        await secondAuthorityInstance.close();
      }
    });
  });

  it('90. Chantier D.2.4 — Problème 3 : Compatibilité Cloud Run du démarrage HTTP (écoute 0.0.0.0, process.env.PORT) et présence de pg + @simplewebauthn/server dans les dépendances de production', async () => {
    const fs = require('node:fs');
    const path = require('node:path');

    // 1. Vérification des dépendances de production dans package.json, backend/package.json et package-lock.json
    const rootPkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));
    const backendPkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'backend/package.json'), 'utf8'));
    const lockPkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package-lock.json'), 'utf8'));

    assert.ok(rootPkg.dependencies['@simplewebauthn/server'], '@simplewebauthn/server doit être dans dependencies de package.json');
    assert.ok(rootPkg.dependencies['pg'], 'pg doit être dans dependencies de package.json');
    assert.strictEqual(rootPkg.devDependencies['pg'], undefined, 'pg ne doit plus être uniquement dans devDependencies');

    assert.ok(backendPkg.dependencies['@simplewebauthn/server'], '@simplewebauthn/server doit être dans dependencies de backend/package.json');
    assert.ok(backendPkg.dependencies['pg'], 'pg doit être dans dependencies de backend/package.json');

    assert.ok(lockPkg.packages[''].dependencies['pg'], 'package-lock.json doit référencer pg dans dependencies');
    assert.strictEqual(lockPkg.packages['node_modules/pg'].dev, undefined, 'node_modules/pg ne doit pas avoir dev: true dans package-lock.json');

    // 2. Vérification de la résolution d'hôte (0.0.0.0) et de port (process.env.PORT) pour Cloud Run
    const prevPort = process.env.PORT;
    const prevKService = process.env.K_SERVICE;
    try {
      process.env.PORT = '0';
      process.env.K_SERVICE = 'yziow-webauthn-authority';
      assert.strictEqual(resolveAuthorityHost({}), '0.0.0.0');
      assert.strictEqual(resolveAuthorityPort({}), 0);

      const cloudRunInstance = await startWebAuthnAuthorityServer({
        authoritySecretKey: D2_3_AUTHORITY_ONLY_SECRET,
        authorityDatabaseUrl: authorityRoleUrl,
        backendToAuthorityToken: D2_3_BACKEND_TO_AUTHORITY_TOKEN
      });
      try {
        assert.strictEqual(cloudRunInstance.listenHost, '0.0.0.0');
        assert.ok(cloudRunInstance.port > 0);
        const healthRes = await fetch(`${cloudRunInstance.url}/v1/health`);
        assert.strictEqual(healthRes.status, 200);
        const healthBody = await healthRes.json();
        assert.strictEqual(healthBody.status, 'ok');
      } finally {
        await cloudRunInstance.close();
      }
    } finally {
      if (prevPort === undefined) delete process.env.PORT;
      else process.env.PORT = prevPort;

      if (prevKService === undefined) delete process.env.K_SERVICE;
      else process.env.K_SERVICE = prevKService;
    }

    // Nettoyage final et vérification des 3 flags de parent_pack_refund_security_gate = false
    await clearPersistedWebAuthnStateForTests(adminClient);
    const gateRes = await adminClient.query(
      `SELECT independent_admin_auth_ready, independent_fedapay_proof_ready, private_worm_storage_ready
       FROM public.parent_pack_refund_security_gate WHERE id = true`
    );
    assert.strictEqual(gateRes.rows[0].independent_admin_auth_ready, false);
    assert.strictEqual(gateRes.rows[0].independent_fedapay_proof_ready, false);
    assert.strictEqual(gateRes.rows[0].private_worm_storage_ready, false);
  });

  it('91. Chantier D.2.5b — DEP-1 : Authentification privée Cloud Run (jeton OIDC absent/expiré/mauvaise audience, séparation STS vs ID Token, refus de fallback non sécurisé et double en-tête X-Serverless-Authorization + Authorization)', async () => {
    const buildUnsignedTestJwt = (payload, header = { alg: 'RS256', typ: 'JWT', kid: 'kid_test_1' }) => {
      const h = Buffer.from(JSON.stringify(header)).toString('base64url');
      const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const s = Buffer.from('simulated_signature_bytes_d25b').toString('base64url');
      return `${h}.${p}.${s}`;
    };

    const nowSec = Math.floor(Date.now() / 1000);
    const iamAuthorityServer = await startWebAuthnAuthorityServer({
      port: 0,
      host: '127.0.0.1',
      authoritySecretKey: D2_3_AUTHORITY_ONLY_SECRET,
      authorityDatabaseUrl: authorityRoleUrl,
      backendToAuthorityToken: D2_3_BACKEND_TO_AUTHORITY_TOKEN,
      bootstrapSecretKey: D2_3_OOB_BOOTSTRAP_SECRET,
      requireServerlessAuthorization: true,
      expectedInvokerServiceAccountEmail: 'sa-vercel-authority-invoker@yziow-sec-auth-staging.iam.gserviceaccount.com'
    });
    const canonicalCloudRunAud = iamAuthorityServer.url;

    try {
      // 1. Validation des claims OIDC Vercel (mode Team vs Global, sujet et environnement)
      const validVercelTeamJwt = buildUnsignedTestJwt({
        iss: 'https://oidc.vercel.com/sakanacim-6028s-projects',
        sub: 'owner:sakanacim-6028s-projects:project:yzo-school:environment:preview',
        aud: 'https://vercel.com/sakanacim-6028s-projects',
        exp: nowSec + 3600
      });
      const teamCheck = validateVercelOidcTokenClaims(validVercelTeamJwt, {
        vercelOidcIssuerMode: 'team',
        vercelTeamSlug: 'sakanacim-6028s-projects',
        vercelProjectSlug: 'yzo-school',
        vercelAllowedEnvironments: ['preview']
      });
      assert.strictEqual(teamCheck.valid, true);

      // Rejet si l'émetteur est Global alors que le mode Team est exigé
      const globalIssuerJwt = buildUnsignedTestJwt({
        iss: 'https://oidc.vercel.com',
        sub: 'owner:sakanacim-6028s-projects:project:yzo-school:environment:preview',
        exp: nowSec + 3600
      });
      const globalMismatchCheck = validateVercelOidcTokenClaims(globalIssuerJwt, {
        vercelOidcIssuerMode: 'team',
        vercelTeamSlug: 'sakanacim-6028s-projects'
      });
      assert.strictEqual(globalMismatchCheck.valid, false);
      assert.strictEqual(globalMismatchCheck.code, 'VERCEL_OIDC_ISSUER_MISMATCH');

      // Rejet d'une clé JSON statique de Service Account Google Cloud
      const fakeStaticSaKey = JSON.stringify({
        type: 'service_account',
        project_id: 'yziow-sec-auth-staging',
        private_key: '-----BEGIN PRIVATE KEY-----\nMIIEv...\n-----END PRIVATE KEY-----\n'
      });
      const staticKeyCheck = validateVercelOidcTokenClaims(fakeStaticSaKey);
      assert.strictEqual(staticKeyCheck.valid, false);
      assert.strictEqual(staticKeyCheck.code, 'STATIC_SERVICE_ACCOUNT_KEY_FORBIDDEN');

      // 2. Séparation stricte entre jeton STS d'accès opaque et Google OIDC ID Token
      const stsOpaqueCheck = validateGoogleCloudRunIdTokenClaims('ya29.a0AfB_byC_opaque_sts_access_token', canonicalCloudRunAud);
      assert.strictEqual(stsOpaqueCheck.valid, false);
      assert.strictEqual(stsOpaqueCheck.code, 'STS_ACCESS_TOKEN_NOT_ALLOWED_AS_ID_TOKEN');

      const stsJwtAccessCheck = validateGoogleCloudRunIdTokenClaims(
        buildUnsignedTestJwt({
          iss: 'https://accounts.google.com',
          aud: canonicalCloudRunAud,
          token_use: 'access',
          scope: 'https://www.googleapis.com/auth/cloud-platform',
          exp: nowSec + 3600
        }),
        canonicalCloudRunAud
      );
      assert.strictEqual(stsJwtAccessCheck.valid, false);
      assert.strictEqual(stsJwtAccessCheck.code, 'STS_ACCESS_TOKEN_NOT_ALLOWED_AS_ID_TOKEN');

      // 3. Jeton Google absent -> échec fail-closed (AUTHORITY_UNAVAILABLE) et refus de tout fallback non sécurisé
      await assert.rejects(
        async () => {
          await requestRegistrationChallenge(superAdminId, {
            authorityUrl: iamAuthorityServer.url,
            backendToAuthorityToken: D2_3_BACKEND_TO_AUTHORITY_TOKEN,
            requireCloudRunIamAuth: true,
            cloudRunAudience: canonicalCloudRunAud,
            gcpInvokerServiceAccountEmail: 'sa-vercel-authority-invoker@yziow-sec-auth-staging.iam.gserviceaccount.com',
            vercelOidcTokenProvider: async () => null
          });
        },
        (err) => err.code === 'AUTHORITY_UNAVAILABLE' && err.reasonCode === 'VERCEL_OIDC_TOKEN_MISSING'
      );

      // 4. Jeton Google OIDC expiré -> échec fail-closed (CLOUD_RUN_ID_TOKEN_EXPIRED)
      const expiredGoogleIdToken = buildUnsignedTestJwt({
        iss: 'https://accounts.google.com',
        aud: canonicalCloudRunAud,
        sub: '109876543210',
        email: 'sa-vercel-authority-invoker@yziow-sec-auth-staging.iam.gserviceaccount.com',
        exp: nowSec - 60
      });
      await assert.rejects(
        async () => {
          await requestRegistrationChallenge(superAdminId, {
            authorityUrl: iamAuthorityServer.url,
            backendToAuthorityToken: D2_3_BACKEND_TO_AUTHORITY_TOKEN,
            requireCloudRunIamAuth: true,
            cloudRunAudience: canonicalCloudRunAud,
            cloudRunIdToken: expiredGoogleIdToken
          });
        },
        (err) => err.code === 'AUTHORITY_UNAVAILABLE' && err.reasonCode === 'CLOUD_RUN_ID_TOKEN_EXPIRED'
      );

      // 5. Jeton Google OIDC avec mauvaise audience -> échec fail-closed (CLOUD_RUN_ID_TOKEN_AUDIENCE_MISMATCH)
      const wrongAudGoogleIdToken = buildUnsignedTestJwt({
        iss: 'https://accounts.google.com',
        aud: 'https://other-service-xyz-ew.a.run.app',
        sub: '109876543210',
        email: 'sa-vercel-authority-invoker@yziow-sec-auth-staging.iam.gserviceaccount.com',
        exp: nowSec + 3600
      });
      await assert.rejects(
        async () => {
          await requestRegistrationChallenge(superAdminId, {
            authorityUrl: iamAuthorityServer.url,
            backendToAuthorityToken: D2_3_BACKEND_TO_AUTHORITY_TOKEN,
            requireCloudRunIamAuth: true,
            cloudRunAudience: canonicalCloudRunAud,
            cloudRunIdToken: wrongAudGoogleIdToken
          });
        },
        (err) => err.code === 'AUTHORITY_UNAVAILABLE' && err.reasonCode === 'CLOUD_RUN_ID_TOKEN_AUDIENCE_MISMATCH'
      );

      // 6. Refus côté serveur d'autorité si un appel direct omet X-Serverless-Authorization
      const directNoIamRes = await fetch(`${iamAuthorityServer.url}/v1/credentials/register/challenge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${D2_3_BACKEND_TO_AUTHORITY_TOKEN}`
        },
        body: JSON.stringify({ adminId: superAdminId })
      });
      assert.strictEqual(directNoIamRes.status, 401);
      const directNoIamBody = await directNoIamRes.json();
      assert.strictEqual(directNoIamBody.code, 'CLOUD_RUN_IAM_TOKEN_MISSING');

      // 7. Flux complet WIF simulé (Vercel OIDC -> STS -> IAM generateIdToken -> Cloud Run avec double en-tête)
      const validGoogleIdToken = buildUnsignedTestJwt({
        iss: 'https://accounts.google.com',
        aud: canonicalCloudRunAud,
        sub: '109876543210',
        email: 'sa-vercel-authority-invoker@yziow-sec-auth-staging.iam.gserviceaccount.com',
        exp: nowSec + 3600
      });

      const stsAndIamCalls = [];
      const mockIamFetch = async (url, init) => {
        stsAndIamCalls.push({ url, method: init.method, headers: init.headers, body: JSON.parse(init.body) });
        if (url === 'https://sts.googleapis.com/v1/token') {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              access_token: 'ya29.simulated_ephemeral_sts_access_token',
              issued_token_type: 'urn:ietf:params:oauth:token-type:access_token',
              token_type: 'Bearer',
              expires_in: 3600
            })
          };
        }
        if (url.includes(':generateIdToken')) {
          assert.strictEqual(init.headers.Authorization, 'Bearer ya29.simulated_ephemeral_sts_access_token');
          return {
            ok: true,
            status: 200,
            json: async () => ({
              token: validGoogleIdToken
            })
          };
        }
        throw new Error(`Unexpected IAM URL: ${url}`);
      };

      const chalOk = await requestRegistrationChallenge(superAdminId, {
        authorityUrl: iamAuthorityServer.url,
        backendToAuthorityToken: D2_3_BACKEND_TO_AUTHORITY_TOKEN,
        requireCloudRunIamAuth: true,
        cloudRunAudience: canonicalCloudRunAud,
        gcpWorkloadIdentityAudience: '//iam.googleapis.com/projects/123456789012/locations/global/workloadIdentityPools/vercel-yziow-pool/providers/vercel-oidc-stg',
        gcpInvokerServiceAccountEmail: 'sa-vercel-authority-invoker@yziow-sec-auth-staging.iam.gserviceaccount.com',
        vercelOidcIssuerMode: 'team',
        vercelTeamSlug: 'sakanacim-6028s-projects',
        vercelProjectSlug: 'yzo-school',
        vercelAllowedEnvironments: ['preview'],
        vercelOidcToken: validVercelTeamJwt,
        iamFetch: mockIamFetch
      });

      assert.ok(chalOk && chalOk.challenge);
      assert.strictEqual(stsAndIamCalls.length, 2);
      assert.strictEqual(stsAndIamCalls[0].url, 'https://sts.googleapis.com/v1/token');
      assert.ok(stsAndIamCalls[1].url.endsWith(':generateIdToken'));
      assert.strictEqual(stsAndIamCalls[1].body.audience, canonicalCloudRunAud);

      // 8. Acceptation côté serveur d'autorité d'un jeton légitime dont la signature a été retirée par Cloud Run GFE
      //    (comportement officiel Cloud Run : formats header.payload. et header.payload acceptés)
      const idParts = validGoogleIdToken.split('.');
      const strippedWithDot = `${idParts[0]}.${idParts[1]}.`;
      const strippedWithoutDot = `${idParts[0]}.${idParts[1]}`;

      const directStrippedDotRes = await fetch(`${iamAuthorityServer.url}/v1/credentials/register/challenge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${D2_3_BACKEND_TO_AUTHORITY_TOKEN}`,
          'X-Serverless-Authorization': `Bearer ${strippedWithDot}`
        },
        body: JSON.stringify({ adminId: superAdminId })
      });
      assert.strictEqual(directStrippedDotRes.status, 200);
      const directStrippedDotBody = await directStrippedDotRes.json();
      assert.strictEqual(directStrippedDotBody.success, true);

      const directStrippedNoDotRes = await fetch(`${iamAuthorityServer.url}/v1/credentials/register/challenge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${D2_3_BACKEND_TO_AUTHORITY_TOKEN}`,
          'X-Serverless-Authorization': `Bearer ${strippedWithoutDot}`
        },
        body: JSON.stringify({ adminId: superAdminId })
      });
      assert.strictEqual(directStrippedNoDotRes.status, 200);
      const directStrippedNoDotBody = await directStrippedNoDotRes.json();
      assert.strictEqual(directStrippedNoDotBody.success, true);
    } finally {
      await iamAuthorityServer.close();
    }
  });

  it('92. Chantier D.2.5b — DEP-2 : Verrouillage indépendant de WebAuthn RP ID et Origin côté autorité et rejet de toute falsification par le backend', async () => {
    await clearPersistedWebAuthnStateForTests(adminClient);

    // 1. Hors mode test jetable, l'absence de WEBAUTHN_RP_ID ou WEBAUTHN_ORIGIN est rejetée en mode fail-closed
    const prevNodeEnv = process.env.NODE_ENV;
    const prevRpId = process.env.WEBAUTHN_RP_ID;
    const prevOrigin = process.env.WEBAUTHN_ORIGIN;
    try {
      process.env.NODE_ENV = 'staging';
      delete process.env.WEBAUTHN_RP_ID;
      delete process.env.WEBAUTHN_ORIGIN;
      setAuthorityRuntimeConfig({ authorityRpId: null, authorityOrigin: null });

      const missingCheck = resolveAuthoritativeRpConfig();
      assert.strictEqual(missingCheck.valid, false);
      assert.strictEqual(missingCheck.code, 'WEBAUTHN_RP_CONFIG_MISSING');

      await assert.rejects(
        async () => {
          await startWebAuthnAuthorityServer({
            port: 0,
            host: '127.0.0.1',
            authoritySecretKey: D2_3_AUTHORITY_ONLY_SECRET,
            authorityDatabaseUrl: authorityRoleUrl,
            backendToAuthorityToken: D2_3_BACKEND_TO_AUTHORITY_TOKEN
          });
        },
        (err) => err.code === 'WEBAUTHN_RP_CONFIG_MISSING'
      );
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
      if (prevRpId === undefined) delete process.env.WEBAUTHN_RP_ID;
      else process.env.WEBAUTHN_RP_ID = prevRpId;
      if (prevOrigin === undefined) delete process.env.WEBAUTHN_ORIGIN;
      else process.env.WEBAUTHN_ORIGIN = prevOrigin;
    }

    // 2. Serveur d'autorité démarré avec sa propre configuration verrouillée : staging.yziow.com / https://staging.yziow.com
    const lockedRpServer = await startWebAuthnAuthorityServer({
      port: 0,
      host: '127.0.0.1',
      authoritySecretKey: D2_3_AUTHORITY_ONLY_SECRET,
      authorityDatabaseUrl: authorityRoleUrl,
      backendToAuthorityToken: D2_3_BACKEND_TO_AUTHORITY_TOKEN,
      bootstrapSecretKey: D2_3_OOB_BOOTSTRAP_SECRET,
      authorityRpId: 'staging.yziow.com',
      authorityOrigin: 'https://staging.yziow.com'
    });

    try {
      const clientOpts = {
        authorityUrl: lockedRpServer.url,
        backendToAuthorityToken: D2_3_BACKEND_TO_AUTHORITY_TOKEN
      };

      // 2a. Le backend omet rpId et origin -> l'autorité impose staging.yziow.com et https://staging.yziow.com
      const legitChal = await requestRegistrationChallenge(superAdminId, clientOpts);
      assert.strictEqual(legitChal.rpId, 'staging.yziow.com');
      assert.strictEqual(legitChal.origin, 'https://staging.yziow.com');

      // 2b. Le backend tente d'imposer un rpId falsifié sur /v1/credentials/register/challenge -> rejet 403 INVALID_RP_ID
      await assert.rejects(
        async () => {
          await requestRegistrationChallenge(superAdminId, {
            ...clientOpts,
            rpId: 'evil.attacker.com',
            origin: 'https://staging.yziow.com'
          });
        },
        (err) => err.code === 'INVALID_RP_ID'
      );

      // 2c. Le backend tente d'imposer une origin falsifiée sur /v1/credentials/register/challenge -> rejet 403 INVALID_ORIGIN
      await assert.rejects(
        async () => {
          await requestRegistrationChallenge(superAdminId, {
            ...clientOpts,
            rpId: 'staging.yziow.com',
            origin: 'https://evil.attacker.com'
          });
        },
        (err) => err.code === 'INVALID_ORIGIN'
      );

      // 2d. Le backend tente d'imposer un rpId ou origin falsifiés lors de /v1/credentials/register/verify -> rejet INVALID_RP_ID / INVALID_ORIGIN
      const kp = generateWebAuthnKeypair();
      const spki = kp.publicKey.export({ type: 'spki', format: 'pem' });
      const credId = 'cred_dep2_' + randomUUID();
      const attObj = buildWebAuthnAttestationObject({
        publicKeySpki: spki,
        credentialId: credId,
        rpId: 'staging.yziow.com'
      });
      const clientDataB64 = Buffer.from(JSON.stringify({
        type: 'webauthn.create',
        challenge: legitChal.challenge,
        origin: 'https://staging.yziow.com'
      })).toString('base64url');
      const oobToken = issueOutOfBandBootstrapToken({
        targetAdminId: superAdminId,
        approverAdminId: approverAdminId,
        credentialId: credId,
        bootstrapSecretKey: D2_3_OOB_BOOTSTRAP_SECRET
      });

      const spoofedVerifyRp = await requestVerifyAndRegisterCredential({
        adminId: superAdminId,
        credentialId: credId,
        attestationObject: attObj,
        clientDataJSON: clientDataB64,
        expectedChallenge: legitChal.challenge,
        enrollmentApprovalToken: oobToken,
        rpId: 'evil.attacker.com',
        origin: 'https://staging.yziow.com'
      }, clientOpts);
      assert.strictEqual(spoofedVerifyRp.valid, false);
      assert.strictEqual(spoofedVerifyRp.code, 'INVALID_RP_ID');

      const spoofedVerifyOrigin = await requestVerifyAndRegisterCredential({
        adminId: superAdminId,
        credentialId: credId,
        attestationObject: attObj,
        clientDataJSON: clientDataB64,
        expectedChallenge: legitChal.challenge,
        enrollmentApprovalToken: oobToken,
        rpId: 'staging.yziow.com',
        origin: 'https://evil.attacker.com'
      }, clientOpts);
      assert.strictEqual(spoofedVerifyOrigin.valid, false);
      assert.strictEqual(spoofedVerifyOrigin.code, 'INVALID_ORIGIN');

      // Enregistrement légitime avec le rpId et l'origin de l'autorité
      const validVerify = await requestVerifyAndRegisterCredential({
        adminId: superAdminId,
        credentialId: credId,
        attestationObject: attObj,
        clientDataJSON: clientDataB64,
        expectedChallenge: legitChal.challenge,
        enrollmentApprovalToken: oobToken
      }, clientOpts);
      assert.strictEqual(validVerify.valid, true);

      // 2e. Falsification de rpId ou origin sur /v1/credentials/enroll-approval/challenge -> rejet INVALID_RP_ID / INVALID_ORIGIN
      await assert.rejects(
        async () => {
          await requestEnrollmentApprovalChallenge({
            targetAdminId: approverAdminId,
            approverAdminId: superAdminId,
            purpose: 'credential_enrollment',
            rpId: 'evil.attacker.com'
          }, clientOpts);
        },
        (err) => err.code === 'INVALID_RP_ID'
      );

      // 2f. Falsification de rpId ou origin sur /v1/actions/challenge -> rejet INVALID_RP_ID / INVALID_ORIGIN
      const docHash = createHash('sha256').update('dep2-proof-doc').digest('hex');
      await assert.rejects(
        async () => {
          await requestActionConfirmationChallenge({
            adminId: superAdminId,
            actionType: 'initiate',
            periodId: randomUUID(),
            providerTransactionId: 'tx_dep2_test',
            verifiedAmountMinor: 1000,
            currency: 'XOF',
            proofDocumentHash: docHash,
            origin: 'https://evil.attacker.com'
          }, clientOpts);
        },
        (err) => err.code === 'INVALID_ORIGIN'
      );
    } finally {
      await lockedRpServer.close();
      await clearPersistedWebAuthnStateForTests(adminClient);
    }
  });

  it('93. Chantier D.2.5b — DEP-3 : Sécurisation de /v1/credentials/revoke (rejet sans autorisation indépendante, révocation autorisée avec trace d\'audit et récupération) et arrêt propre SIGTERM', async () => {
    await clearPersistedWebAuthnStateForTests(adminClient);

    const dep3Server = await startWebAuthnAuthorityServer({
      port: 0,
      host: '127.0.0.1',
      authoritySecretKey: D2_3_AUTHORITY_ONLY_SECRET,
      authorityDatabaseUrl: authorityRoleUrl,
      backendToAuthorityToken: D2_3_BACKEND_TO_AUTHORITY_TOKEN,
      bootstrapSecretKey: D2_3_OOB_BOOTSTRAP_SECRET
    });

    const clientOpts = {
      authorityUrl: dep3Server.url,
      backendToAuthorityToken: D2_3_BACKEND_TO_AUTHORITY_TOKEN
    };

    try {
      // Enrôler les deux SuperAdmins (Admin 1 par oob_bootstrap, Admin 2 par co-autorisation matérielle d'Admin 1)
      const kp1 = generateWebAuthnKeypair();
      const spki1 = kp1.publicKey.export({ type: 'spki', format: 'pem' });
      const credId1 = 'cred_dep3_admin1_' + randomUUID();
      const chal1 = await requestRegistrationChallenge(superAdminId, clientOpts);
      const att1 = buildWebAuthnAttestationObject({ publicKeySpki: spki1, credentialId: credId1, rpId: chal1.rpId });
      const cd1 = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: chal1.challenge, origin: chal1.origin })).toString('base64url');
      const oob1 = issueOutOfBandBootstrapToken({
        targetAdminId: superAdminId,
        approverAdminId: approverAdminId,
        credentialId: credId1,
        bootstrapSecretKey: D2_3_OOB_BOOTSTRAP_SECRET
      });
      const reg1 = await requestVerifyAndRegisterCredential({
        adminId: superAdminId,
        credentialId: credId1,
        attestationObject: att1,
        clientDataJSON: cd1,
        expectedChallenge: chal1.challenge,
        enrollmentApprovalToken: oob1
      }, clientOpts);
      assert.strictEqual(reg1.valid, true);

      const kp2 = generateWebAuthnKeypair();
      const spki2 = kp2.publicKey.export({ type: 'spki', format: 'pem' });
      const credId2 = 'cred_dep3_admin2_' + randomUUID();
      const approveChal2 = await requestEnrollmentApprovalChallenge({
        targetAdminId: approverAdminId,
        approverAdminId: superAdminId,
        purpose: 'credential_enrollment'
      }, clientOpts);
      const approveAss2 = {
        credentialId: credId1,
        ...signWebAuthnAssertion({
          keypair: kp1,
          challenge: approveChal2.challenge,
          rpId: approveChal2.rpId,
          origin: approveChal2.origin,
          counter: 1
        })
      };
      const approveTok2 = await requestConfirmedEnrollmentApprovalToken({
        targetAdminId: approverAdminId,
        approverAdminId: superAdminId,
        purpose: 'credential_enrollment',
        webauthnAssertion: approveAss2
      }, clientOpts);
      assert.strictEqual(approveTok2.valid, true);

      const chal2 = await requestRegistrationChallenge(approverAdminId, clientOpts);
      const att2 = buildWebAuthnAttestationObject({ publicKeySpki: spki2, credentialId: credId2, rpId: chal2.rpId });
      const cd2 = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: chal2.challenge, origin: chal2.origin })).toString('base64url');
      const reg2 = await requestVerifyAndRegisterCredential({
        adminId: approverAdminId,
        credentialId: credId2,
        attestationObject: att2,
        clientDataJSON: cd2,
        expectedChallenge: chal2.challenge,
        enrollmentApprovalToken: approveTok2.enrollmentApprovalToken
      }, clientOpts);
      assert.strictEqual(reg2.valid, true);

      // 1. Tentative de révocation arbitraire par un backend compromis disposant seulement de YZIOW_BACKEND_TO_AUTHORITY_TOKEN
      //    (même en envoyant requireRevocationAuthorization: false dans le corps JSON) -> REJET 403 !
      const rawUnauthRevoke = await fetch(`${dep3Server.url}/v1/credentials/revoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${D2_3_BACKEND_TO_AUTHORITY_TOKEN}`
        },
        body: JSON.stringify({
          credentialId: credId1,
          adminId: superAdminId,
          requireRevocationAuthorization: false
        })
      });
      assert.strictEqual(rawUnauthRevoke.status, 403);
      const unauthRevokeBody = await rawUnauthRevoke.json();
      assert.strictEqual(unauthRevokeBody.success, false);
      assert.strictEqual(unauthRevokeBody.code, 'REVOCATION_AUTHORIZATION_REQUIRED');

      // Tentative de détourner un jeton d'enrôlement (purpose = 'credential_replacement') pour révoquer -> REJET 403 !
      const wrongPurposeChal = await requestEnrollmentApprovalChallenge({
        targetAdminId: superAdminId,
        approverAdminId: approverAdminId,
        purpose: 'credential_replacement'
      }, clientOpts);
      const wrongPurposeAss = {
        credentialId: credId2,
        ...signWebAuthnAssertion({
          keypair: kp2,
          challenge: wrongPurposeChal.challenge,
          rpId: wrongPurposeChal.rpId,
          origin: wrongPurposeChal.origin,
          counter: 1
        })
      };
      const wrongPurposeTok = await requestConfirmedEnrollmentApprovalToken({
        targetAdminId: superAdminId,
        approverAdminId: approverAdminId,
        purpose: 'credential_replacement',
        webauthnAssertion: wrongPurposeAss
      }, clientOpts);
      assert.strictEqual(wrongPurposeTok.valid, true);

      const wrongPurposeRevoke = await requestRevokeCredential(credId1, superAdminId, {
        ...clientOpts,
        revocationApprovalToken: wrongPurposeTok.enrollmentApprovalToken
      });
      assert.strictEqual(wrongPurposeRevoke.success, false);
      assert.strictEqual(wrongPurposeRevoke.code, 'INVALID_REVOCATION_AUTHORIZATION_PURPOSE');

      // Vérifier en base que credId1 est toujours actif
      const checkActive1 = await adminClient.query(
        `SELECT is_active, revoked_at FROM public.superadmin_webauthn_credentials WHERE credential_id = $1`,
        [credId1]
      );
      assert.strictEqual(checkActive1.rows[0].is_active, true);
      assert.strictEqual(checkActive1.rows[0].revoked_at, null);

      // 2. Révocation légitime autorisée via co-autorisation matérielle du second SuperAdmin (purpose = 'credential_revocation')
      const revApprovalChal = await requestEnrollmentApprovalChallenge({
        targetAdminId: superAdminId,
        approverAdminId: approverAdminId,
        purpose: 'credential_revocation'
      }, clientOpts);
      const revApprovalAss = {
        credentialId: credId2,
        ...signWebAuthnAssertion({
          keypair: kp2,
          challenge: revApprovalChal.challenge,
          rpId: revApprovalChal.rpId,
          origin: revApprovalChal.origin,
          counter: 2
        })
      };
      const revApprovalTok = await requestConfirmedEnrollmentApprovalToken({
        targetAdminId: superAdminId,
        approverAdminId: approverAdminId,
        purpose: 'credential_revocation',
        webauthnAssertion: revApprovalAss
      }, clientOpts);
      assert.strictEqual(revApprovalTok.valid, true);

      const authRevokeRes = await requestRevokeCredential(credId1, superAdminId, {
        ...clientOpts,
        revocationApprovalToken: revApprovalTok.enrollmentApprovalToken
      });
      assert.strictEqual(authRevokeRes.success, true);
      assert.strictEqual(authRevokeRes.credential.is_active, false);
      assert.ok(authRevokeRes.revocationAudit);
      assert.strictEqual(authRevokeRes.revocationAudit.authMethod, 'hardware_co_auth');
      assert.strictEqual(authRevokeRes.revocationAudit.purpose, 'credential_revocation');

      // Vérifier la trace d'audit persistée dans yziow_refund_auth.consumed_enrollment_tokens
      const auditRow = await adminClient.query(
        `SELECT token_nonce, token_type, target_admin_id, approver_admin_id, credential_id, purpose
         FROM yziow_refund_auth.consumed_enrollment_tokens WHERE token_nonce = $1`,
        [revApprovalTok.enrollmentApprovalToken.nonce]
      );
      assert.strictEqual(auditRow.rowCount, 1);
      assert.strictEqual(auditRow.rows[0].token_type, 'hardware_co_auth');
      assert.strictEqual(auditRow.rows[0].credential_id, credId1);
      assert.strictEqual(auditRow.rows[0].purpose, 'credential_revocation');

      // 3. Procédure de récupération : Admin 1 peut ré-enrôler un nouvel authentificateur co-autorisé matériellement par Admin 2
      const kp1Recovery = generateWebAuthnKeypair();
      const spki1Recovery = kp1Recovery.publicKey.export({ type: 'spki', format: 'pem' });
      const credId1Recovery = 'cred_dep3_admin1_recovered_' + randomUUID();
      const recovApproveChal = await requestEnrollmentApprovalChallenge({
        targetAdminId: superAdminId,
        approverAdminId: approverAdminId,
        purpose: 'credential_replacement'
      }, clientOpts);
      const recovApproveAss = {
        credentialId: credId2,
        ...signWebAuthnAssertion({
          keypair: kp2,
          challenge: recovApproveChal.challenge,
          rpId: recovApproveChal.rpId,
          origin: recovApproveChal.origin,
          counter: 3
        })
      };
      const recovApproveTok = await requestConfirmedEnrollmentApprovalToken({
        targetAdminId: superAdminId,
        approverAdminId: approverAdminId,
        purpose: 'credential_replacement',
        webauthnAssertion: recovApproveAss
      }, clientOpts);
      assert.strictEqual(recovApproveTok.valid, true);

      const recovRegChal = await requestRegistrationChallenge(superAdminId, clientOpts);
      const recovAtt = buildWebAuthnAttestationObject({ publicKeySpki: spki1Recovery, credentialId: credId1Recovery, rpId: recovRegChal.rpId });
      const recovCd = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: recovRegChal.challenge, origin: recovRegChal.origin })).toString('base64url');
      const recovRegRes = await requestVerifyAndRegisterCredential({
        adminId: superAdminId,
        credentialId: credId1Recovery,
        attestationObject: recovAtt,
        clientDataJSON: recovCd,
        expectedChallenge: recovRegChal.challenge,
        enrollmentApprovalToken: recovApproveTok.enrollmentApprovalToken
      }, clientOpts);
      assert.strictEqual(recovRegRes.valid, true);

      // 4. Révocation d'urgence hors bande via oob_bootstrap (purpose = 'emergency_revocation', lié au credentialId exact)
      const emergencyOobRevokeToken = issueOutOfBandBootstrapToken({
        targetAdminId: approverAdminId,
        approverAdminId: superAdminId,
        credentialId: credId2,
        purpose: 'emergency_revocation',
        bootstrapSecretKey: D2_3_OOB_BOOTSTRAP_SECRET
      });
      const oobRevokeRes = await requestRevokeCredential(credId2, approverAdminId, {
        ...clientOpts,
        revocationApprovalToken: emergencyOobRevokeToken
      });
      assert.strictEqual(oobRevokeRes.success, true);
      assert.strictEqual(oobRevokeRes.revocationAudit.authMethod, 'oob_bootstrap');
      assert.strictEqual(oobRevokeRes.revocationAudit.purpose, 'emergency_revocation');

      // Rejeu du même jeton oob_bootstrap de révocation -> REJET !
      const replayOobRevoke = await requestRevokeCredential(credId1Recovery, superAdminId, {
        ...clientOpts,
        revocationApprovalToken: emergencyOobRevokeToken
      });
      assert.strictEqual(replayOobRevoke.success, false);

      // 5. Arrêt propre SIGTERM du serveur d'autorité
      assert.strictEqual(dep3Server.isShuttingDown, false);
      const shutdownResult = await dep3Server.shutdown('SIGTERM');
      assert.strictEqual(shutdownResult.shutDown, true);
      assert.strictEqual(shutdownResult.signal, 'SIGTERM');
      assert.strictEqual(dep3Server.isShuttingDown, true);
      assert.strictEqual(dep3Server.lastShutdownSignal, 'SIGTERM');
      assert.ok(dep3Server.shutdownCompletedAt);

      // Une fois arrêté, tout appel échoue en mode fail-closed (AUTHORITY_UNAVAILABLE)
      await assert.rejects(
        async () => {
          await requestRegistrationChallenge(superAdminId, clientOpts);
        },
        (err) => err.code === 'AUTHORITY_UNAVAILABLE'
      );
    } finally {
      await dep3Server.close();
      await clearPersistedWebAuthnStateForTests(adminClient);
    }
  });
});
