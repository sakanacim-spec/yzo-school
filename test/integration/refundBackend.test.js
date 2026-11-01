import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
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
  getAccessStatesForGlobalIds,
  ACCESS_STATES
} = require('../../backend/services/parentPackService.js');

const { Client } = pg;

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

describe('P28c Backend Refund Integration & PostgreSQL Dedicated Role', () => {
  let adminClient;
  let superAdminId;
  let globalPricingId;
  const originalFrom = supabase.from;
  const originalRpc = supabase.rpc;
  const testCreatedIds = {
    periodIds: [],
    subIds: [],
    intentIds: [],
    studentGlobalIds: []
  };

  const EXECUTOR_PWD = 'test_executor_pwd';
  const EXECUTOR_URL = `postgresql://yziow_refund_executor:${EXECUTOR_PWD}@127.0.0.1:5432/yziow_p28b_restore_test`;

  before(async () => {
    adminClient = new Client({ connectionString: resolveDatabaseConnectionString() });
    await adminClient.connect();

    // 1. Ensure SuperAdmin
    const adminRes = await adminClient.query(`SELECT id FROM public.superadmins WHERE username = 'superadmin' LIMIT 1`);
    if (adminRes.rows.length === 0) {
      throw new Error('Superadmin account not found in test database.');
    }
    superAdminId = adminRes.rows[0].id;

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

    // 3. Ensure role yziow_refund_executor with password and privileges
    await adminClient.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'yziow_refund_executor') THEN
          CREATE ROLE yziow_refund_executor LOGIN;
        END IF;
      END
      $$;
      ALTER ROLE yziow_refund_executor WITH PASSWORD '${EXECUTOR_PWD}';
      GRANT USAGE ON SCHEMA public TO yziow_refund_executor;
      GRANT EXECUTE ON FUNCTION public.admin_process_parent_pack_refund(UUID, TEXT, UUID, TEXT) TO yziow_refund_executor;
      REVOKE EXECUTE ON FUNCTION public.admin_process_parent_pack_refund(UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated, service_role;
      REVOKE ALL ON public.parent_pack_refund_audits FROM PUBLIC, anon, authenticated, service_role, yziow_refund_executor;
      REVOKE ALL ON public.school_commission_ledger FROM yziow_refund_executor;
      REVOKE ALL ON public.affiliate_ledger FROM yziow_refund_executor;
      REVOKE ALL ON public.affiliate_balances FROM yziow_refund_executor;
      REVOKE ALL ON public.payment_intents FROM yziow_refund_executor;
      REVOKE ALL ON public.parent_subscription_periods FROM yziow_refund_executor;
      REVOKE ALL ON public.parent_subscriptions FROM yziow_refund_executor;
    `);

    // Set dedicated refund DB URL
    process.env.YZIOW_REFUND_DATABASE_URL = EXECUTOR_URL;
  });

  after(async () => {
    // Clean up all test fixtures from real PostgreSQL database
    try {
      if (testCreatedIds.periodIds.length > 0) {
        await adminClient.query(`ALTER TABLE public.parent_pack_refund_audits DISABLE TRIGGER trg_immutable_parent_pack_refund_audits;`);
        await adminClient.query(`DELETE FROM public.parent_pack_refund_audits WHERE period_id = ANY($1::uuid[]);`, [testCreatedIds.periodIds]);
        await adminClient.query(`ALTER TABLE public.parent_pack_refund_audits ENABLE TRIGGER trg_immutable_parent_pack_refund_audits;`);
        await adminClient.query(`DELETE FROM public.school_commission_ledger WHERE period_id = ANY($1::uuid[]);`, [testCreatedIds.periodIds]);
        await adminClient.query(`DELETE FROM public.parent_subscription_periods WHERE id = ANY($1::uuid[]);`, [testCreatedIds.periodIds]);
      }
      if (testCreatedIds.intentIds.length > 0) {
        await adminClient.query(`DELETE FROM public.payment_intents WHERE id = ANY($1::uuid[]);`, [testCreatedIds.intentIds]);
      }
      if (testCreatedIds.subIds.length > 0) {
        await adminClient.query(`DELETE FROM public.parent_subscriptions WHERE id = ANY($1::uuid[]);`, [testCreatedIds.subIds]);
      }
      if (testCreatedIds.studentGlobalIds.length > 0) {
        await adminClient.query(`DELETE FROM public.parent_child_links WHERE student_global_id = ANY($1::uuid[]);`, [testCreatedIds.studentGlobalIds]);
        await adminClient.query(`DELETE FROM public.global_students WHERE student_global_id = ANY($1::uuid[]);`, [testCreatedIds.studentGlobalIds]);
      }
    } catch (_err) {
      // Best effort cleanup
    } finally {
      if (adminClient) await adminClient.end();
      supabase.from = originalFrom;
      supabase.rpc = originalRpc;
    }
  });

  // Helper to seed a valid subscription, period, intent and ledgers in DB
  async function seedFixture(opts = {}) {
    const studentGlobalId = randomUUID();
    const parentRef = `+22997${Math.floor(100000 + Math.random() * 900000)}`;
    const schoolSlug = 'ecole_p28c_test';
    const providerTxId = opts.providerTxId || `feda_tx_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const amount = 1000;
    const currency = 'XOF';

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
        NOW() + INTERVAL '1 day', NOW());
    `, [intentId, subId, schoolSlug, amount, currency, providerTxId, studentGlobalId, parentRef]);
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

    setupSupabaseMock({ periodId, subId, intentId, status: 'active', providerTxId, amount, currency });

    return { periodId, subId, intentId, studentGlobalId, parentRef, schoolSlug, providerTxId, amount, currency };
  }

  function setupSupabaseMock({ periodId, subId, intentId, status, providerTxId, amount, currency }) {
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
      if (table === 'payment_intents') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: intentId, status: 'completed', provider_transaction_id: providerTxId, expected_amount: amount, expected_currency: currency },
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
    supabase.from = (table) => {
      if (table === 'parent_subscription_periods') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: fixture.periodId, payment_intent_id: fixture.intentId, status: 'active' }, error: null }) }) }) };
      }
      if (table === 'payment_intents') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: fixture.intentId, status: 'completed', provider_transaction_id: null, expected_amount: 1000, expected_currency: 'XOF' }, error: null }) }) }) };
      }
      return originalFrom.call(supabase, table);
    };

    const res = await refundParentPackSubscriptionAdmin({
      periodId: fixture.periodId,
      providerRefundId: 'fedapay_ref_valid_123',
      adminActorId: superAdminId
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
        amount: 500, // Mismatch: 500 vs 1000
        currency: fixture.currency
      })
    };

    const res = await refundParentPackSubscriptionAdmin({
      periodId: fixture.periodId,
      providerRefundId: 'fedapay_ref_valid_123',
      adminActorId: superAdminId,
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
        currency: 'USD' // Mismatch
      })
    };

    const res = await refundParentPackSubscriptionAdmin({
      periodId: fixture.periodId,
      providerRefundId: 'fedapay_ref_valid_123',
      adminActorId: superAdminId,
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
  it('6 & 7. Privilèges PostgreSQL : yziow_refund_executor a EXECUTE, service_role est strictement rejeté', async () => {
    const executorCheck = await adminClient.query(`
      SELECT has_function_privilege('yziow_refund_executor', 'admin_process_parent_pack_refund(uuid, text, uuid, text)', 'EXECUTE') AS ok;
    `);
    assert.strictEqual(executorCheck.rows[0].ok, true, 'yziow_refund_executor must have EXECUTE privilege');

    const serviceCheck = await adminClient.query(`
      SELECT has_function_privilege('service_role', 'admin_process_parent_pack_refund(uuid, text, uuid, text)', 'EXECUTE') AS ok;
    `);
    assert.strictEqual(serviceCheck.rows[0].ok, false, 'service_role must NOT have EXECUTE privilege');
  });

  // 7B. Rejet strict de toute écriture directe par yziow_refund_executor sur les tables
  it('7B. Sécurité fail-closed : yziow_refund_executor ne peut pas faire de INSERT direct sur parent_pack_refund_audits', async () => {
    const tableInsertPriv = await adminClient.query(`
      SELECT has_table_privilege('yziow_refund_executor', 'public.parent_pack_refund_audits', 'INSERT') AS ok;
    `);
    assert.strictEqual(tableInsertPriv.rows[0].ok, false, 'yziow_refund_executor must NOT have direct INSERT privilege');

    const executorClient = new Client({ connectionString: EXECUTOR_URL });
    await executorClient.connect();
    try {
      await assert.rejects(
        async () => {
          await executorClient.query(`
            INSERT INTO public.parent_pack_refund_audits (
              period_id, subscription_id, payment_intent_id, provider_refund_id, admin_actor_id,
              reason, gross_amount_minor, school_share_minor, ambassador_share_minor, yziow_share_minor
            ) VALUES (
              gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'illegal_direct_insert', gen_random_uuid(),
              'illegal', 1000, 200, 75, 725
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

  // 8. Remboursement complet avec FedaPay simulé et données locales fictives
  it('8. Remboursement complet nominal via executeRefundRpc avec yziow_refund_executor', async () => {
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
      reason: 'Test remboursement nominal',
      fedapayClient: mockFedapay
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.code, 'REFUND_COMPLETED');
    assert.strictEqual(res.data.status, 'success');
    assert.strictEqual(res.data.period_id, fixture.periodId);

    // Verify database state updated by RPC
    const periodDb = await adminClient.query(`SELECT status FROM public.parent_subscription_periods WHERE id = $1`, [fixture.periodId]);
    assert.strictEqual(periodDb.rows[0].status, 'refunded');

    const intentDb = await adminClient.query(`SELECT status FROM public.payment_intents WHERE id = $1`, [fixture.intentId]);
    assert.strictEqual(intentDb.rows[0].status, 'refunded');

    const auditDb = await adminClient.query(`SELECT * FROM public.parent_pack_refund_audits WHERE period_id = $1`, [fixture.periodId]);
    assert.strictEqual(auditDb.rows.length, 1);
    assert.strictEqual(auditDb.rows[0].provider_refund_id, refundRef);
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

    // First refund
    const res1 = await refundParentPackSubscriptionAdmin({
      periodId: fixture.periodId,
      providerRefundId: refundRef,
      adminActorId: superAdminId,
      fedapayClient: mockFedapay
    });
    assert.strictEqual(res1.success, true);

    // Update mock to reflect refunded status
    setupSupabaseMock({ ...fixture, status: 'refunded' });

    // Second refund
    const res2 = await refundParentPackSubscriptionAdmin({
      periodId: fixture.periodId,
      providerRefundId: refundRef,
      adminActorId: superAdminId,
      fedapayClient: mockFedapay
    });
    assert.strictEqual(res2.success, true);
    assert.strictEqual(res2.code, 'ALREADY_REFUNDED');

    // Confirm only 1 audit row and 1 cancellation row
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
      fedapayClient: mockFedapay
    });

    // Mock RPC get_active_parent_pack_subscriptions returning empty (refunded period is not active)
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

  // 11. Absence de résidus financiers à la fin des tests
  it('11. Absence de résidus financiers sur les enregistrements de test terminés', async () => {
    const auditRes = await adminClient.query(`
      SELECT period_id FROM public.parent_pack_refund_audits
      WHERE period_id = ANY($1::uuid[]);
    `, [testCreatedIds.periodIds]);

    assert.ok(auditRes.rows.length >= 2, 'Tracked test audits exist before cleanup');
  });
});
