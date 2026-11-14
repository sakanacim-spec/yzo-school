// backend/integration-tests/parent_pack_p29_pilot_financial.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Client } = require('pg');

const databaseUrl = process.env.DATABASE_URL || 'postgres://postgres@127.0.0.1:55428/yziow_p28b_disposable_test';

test('P29 : Validation Financière & Double Verrou Pilote Mensuel', async (t) => {
  if (!process.env.SUPABASE_URL) process.env.SUPABASE_URL = 'http://localhost:54321';
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) process.env.SUPABASE_SERVICE_ROLE_KEY = 'dummy_test_key';
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'dummy_test_jwt_secret_32_characters_minimum';

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {

  const suffix = crypto.randomBytes(4).toString('hex');
  const schoolSlug = `sch_p29_ci_${suffix}`;
  const affId = crypto.randomUUID();
  const parentRef = `+22997${Math.floor(100000 + Math.random() * 900000)}`;
  const studentGlobalId = crypto.randomUUID();
  const studentRef = `STU_${suffix}`;

  // 1. Ambassadeur actif
  await client.query(`
    INSERT INTO public.affiliates (id, nom, telephone, password_hash, referral_code, status)
    VALUES ($1, $2, $3, 'hash123', $4, 'active')
  `, [affId, `Ambassadeur CI ${suffix}`, `+22996${Math.floor(100000 + Math.random() * 900000)}`, `REF_${suffix}`]);

  // 2. Établissement rattaché à l'ambassadeur
  await client.query(`
    INSERT INTO public.schools (slug, name, status, affiliate_id)
    VALUES ($1, $2, 'active', $3)
  `, [schoolSlug, `École CI ${suffix}`, affId]);

  // 3. Tarifs officiels
  const pricingMat = (await client.query(`SELECT id FROM public.parent_pack_pricing WHERE cycle_name = 'maternelle_primaire' AND active = true`)).rows[0].id;
  const pricingCol = (await client.query(`SELECT id FROM public.parent_pack_pricing WHERE cycle_name = 'college_secondaire' AND active = true`)).rows[0].id;
  const pricingSup = (await client.query(`SELECT id FROM public.parent_pack_pricing WHERE cycle_name = 'superieur_formation' AND active = true`)).rows[0].id;

  // 4. Élève et lien parent
  await client.query(`INSERT INTO public.global_students (student_global_id) VALUES ($1) ON CONFLICT DO NOTHING`, [studentGlobalId]);
  await client.query(`
    INSERT INTO public.parent_child_links (parent_ref, student_global_id, current_link_active, first_linked_at)
    VALUES ($1, $2, true, now())
    ON CONFLICT (parent_ref, student_global_id) DO UPDATE SET current_link_active = true
  `, [parentRef, studentGlobalId]);

  // 5. Souscription
  const subRes = await client.query(`
    INSERT INTO public.parent_subscriptions (parent_ref, student_global_id, school_slug, student_ref, pricing_id, status)
    VALUES ($1, $2, $3, $4, $5, 'active')
    RETURNING id
  `, [parentRef, studentGlobalId, schoolSlug, studentRef, pricingMat]);
  const subId = subRes.rows[0].id;

  await t.test('1. Commission ambassadeur 10% brut & école 20% brut (Invariant 1000 FCFA)', async () => {
    const intentId1 = crypto.randomUUID();
    const eventId1 = `evt_ci_1_${suffix}`;
    const txId1 = `tx_ci_1_${suffix}`;

    await client.query(`
      INSERT INTO public.payment_intents (
        id, target_id, school_slug, expected_amount, expected_currency,
        payment_type, provider, status, expires_at, metadata
      ) VALUES (
        $1, $2, $3, 1000, 'XOF',
        'parent_pack', 'fedapay', 'pending', now() + interval '1 day', $4::jsonb
      )
    `, [intentId1, subId, schoolSlug, JSON.stringify({
      parent_ref: parentRef,
      student_global_id: studentGlobalId,
      student_ref: studentRef,
      pricing_id: pricingMat,
      cycle_name: 'maternelle_primaire',
      duration_months: 10
    })]);

    const res = await client.query(`
      SELECT public.process_parent_pack_webhook_event(
        'fedapay', $1, 'transaction.approved', $2, $3, 1000, 'XOF', 'approved', now(), 50, 0, true
      ) AS result
    `, [eventId1, intentId1, txId1]);

    const out = res.rows[0].result;
    assert.strictEqual(out.status, 'completed');
    assert.strictEqual(Number(out.school_share_minor), 200, 'École = 20% brut = 200 FCFA');
    assert.strictEqual(Number(out.ambassador_share_minor), 100, 'Ambassadeur = 10% brut = 100 FCFA');
    assert.strictEqual(Number(out.yziow_share_minor), 650, 'YZIOW = 1000 - 50 - 200 - 100 = 650 FCFA');
    assert.strictEqual(50 + 200 + 100 + 650, 1000, 'Invariant vérifié');

    const affBal = (await client.query(`SELECT pending_balance_minor FROM public.affiliate_balances WHERE affiliate_id = $1`, [affId])).rows[0];
    assert.strictEqual(Number(affBal.pending_balance_minor), 100);
  });

  await t.test('2. Absence d ambassadeur (École 20% brut, YZIOW 750 FCFA)', async () => {
    const schoolSlugNoAff = `sch_noaff_ci_${suffix}`;
    await client.query(`INSERT INTO public.schools (slug, name, status, affiliate_id) VALUES ($1, $2, 'active', NULL)`, [schoolSlugNoAff, `École Sans Aff ${suffix}`]);

    const stuNoAff = crypto.randomUUID();
    const parNoAff = `+22998${Math.floor(100000 + Math.random() * 900000)}`;
    await client.query(`INSERT INTO public.global_students (student_global_id) VALUES ($1)`, [stuNoAff]);
    await client.query(`INSERT INTO public.parent_child_links (parent_ref, student_global_id, current_link_active) VALUES ($1, $2, true)`, [parNoAff, stuNoAff]);

    const subNoAff = (await client.query(`
      INSERT INTO public.parent_subscriptions (parent_ref, student_global_id, school_slug, student_ref, pricing_id, status)
      VALUES ($1, $2, $3, 'STU_NOAFF', $4, 'active') RETURNING id
    `, [parNoAff, stuNoAff, schoolSlugNoAff, pricingMat])).rows[0].id;

    const intentId2 = crypto.randomUUID();
    const eventId2 = `evt_ci_2_${suffix}`;
    const txId2 = `tx_ci_2_${suffix}`;

    await client.query(`
      INSERT INTO public.payment_intents (
        id, target_id, school_slug, expected_amount, expected_currency, payment_type, provider, status, expires_at, metadata
      ) VALUES ($1, $2, $3, 1000, 'XOF', 'parent_pack', 'fedapay', 'pending', now() + interval '1 day', $4::jsonb)
    `, [intentId2, subNoAff, schoolSlugNoAff, JSON.stringify({
      parent_ref: parNoAff,
      student_global_id: stuNoAff,
      student_ref: 'STU_NOAFF',
      pricing_id: pricingMat,
      cycle_name: 'maternelle_primaire',
      duration_months: 10
    })]);

    const res2 = await client.query(`
      SELECT public.process_parent_pack_webhook_event(
        'fedapay', $1, 'transaction.approved', $2, $3, 1000, 'XOF', 'approved', now(), 50, 0, true
      ) AS result
    `, [eventId2, intentId2, txId2]);

    const out2 = res2.rows[0].result;
    assert.strictEqual(out2.status, 'completed');
    assert.strictEqual(Number(out2.school_share_minor), 200);
    assert.strictEqual(Number(out2.ambassador_share_minor), 0);
    assert.strictEqual(Number(out2.yziow_share_minor), 750);
    assert.strictEqual(50 + 200 + 0 + 750, 1000);
  });

  await t.test('3. Webhook rejoué sans double crédit (Idempotence stricte)', async () => {
    const resDup = await client.query(`
      SELECT public.process_parent_pack_webhook_event(
        'fedapay', $1, 'transaction.approved', $2, $3, 1000, 'XOF', 'approved', now(), 50, 0, true
      ) AS result
    `, [`evt_ci_1_${suffix}`, crypto.randomUUID(), `tx_ci_1_${suffix}`]);

    assert.strictEqual(resDup.rows[0].result.status, 'duplicate');
    const affBal = (await client.query(`SELECT pending_balance_minor FROM public.affiliate_balances WHERE affiliate_id = $1`, [affId])).rows[0];
    assert.strictEqual(Number(affBal.pending_balance_minor), 100, 'Le solde ambassadeur n a pas été doublé');
  });

  await t.test('4. Conservation des protections P28b (fail-closed, devise, unicité élève)', async () => {
    // 1. Récupération d'une intention de paiement existante ('completed' suite au sous-test 1)
    const existingIntent = (await client.query(
      `SELECT id, status, expected_amount FROM public.payment_intents WHERE school_slug = $1 ORDER BY created_at ASC LIMIT 1`,
      [schoolSlug]
    )).rows[0];
    assert.ok(existingIntent, 'Une intention de paiement existante doit être trouvée');
    const targetIntentId = existingIntent.id;
    const initialStatus = existingIntent.status;
    const initialAmount = existingIntent.expected_amount;

    let updateStatusError = null;
    try {
      await client.query(
        `UPDATE public.payment_intents SET status = 'refunded' WHERE id = $1`,
        [targetIntentId]
      );
    } catch (err) {
      updateStatusError = err;
    }
    assert.ok(updateStatusError, 'UPDATE direct vers refunded doit être rejeté');
    assert.match(
      updateStatusError.message,
      /FAIL CLOSED: Retrogradation ou changement de statut interdit/,
      'Le rejet provient de la protection financière attendue (protect_parent_pack_intent)'
    );

    // Vérification qu'aucune altération financière ou de statut n'a eu lieu
    const intentAfterStatusCheck = (await client.query(
      `SELECT status, expected_amount FROM public.payment_intents WHERE id = $1`,
      [targetIntentId]
    )).rows[0];
    assert.strictEqual(intentAfterStatusCheck.status, initialStatus, 'Le statut de l intention ne doit pas être altéré');
    assert.strictEqual(intentAfterStatusCheck.expected_amount, initialAmount, 'Le montant de l intention ne doit pas être altéré');

    // 2. Tentative d'altération financière directe (montant attendu)
    let updateAmountError = null;
    try {
      await client.query(
        `UPDATE public.payment_intents SET expected_amount = 500 WHERE id = $1`,
        [targetIntentId]
      );
    } catch (err) {
      updateAmountError = err;
    }
    assert.ok(updateAmountError, 'UPDATE direct de expected_amount doit être rejeté');
    assert.match(
      updateAmountError.message,
      /FAIL CLOSED: Modification des champs financiers ou de rattachement/,
      'Le rejet provient du verrou d intégrité financière (protect_parent_pack_intent)'
    );

    const intentAfterAmountCheck = (await client.query(
      `SELECT status, expected_amount FROM public.payment_intents WHERE id = $1`,
      [targetIntentId]
    )).rows[0];
    assert.strictEqual(intentAfterAmountCheck.expected_amount, initialAmount, 'Le montant financier reste inchangé');

    // 3. Unicité de souscription élève
    let dupSubFailed = false;
    try {
      await client.query(`
        INSERT INTO public.parent_subscriptions (parent_ref, student_global_id, school_slug, student_ref, pricing_id, status)
        VALUES ('other_p', $1, 'other_s', 'STU_DUP', $2, 'active')
      `, [studentGlobalId, pricingMat]);
    } catch (e) {
      dupSubFailed = true;
    }
    assert.strictEqual(dupSubFailed, true, 'Unicité de souscription élève préservée');
  });

  await t.test('5. Checkouts mensuels autorisés pour les 3 cycles officiels (100, 150, 200 FCFA)', async () => {
    // Maternelle (100 FCFA)
    const stuM = crypto.randomUUID();
    const parM = `+22995${Math.floor(100000 + Math.random() * 900000)}`;
    await client.query(`INSERT INTO public.global_students (student_global_id) VALUES ($1)`, [stuM]);
    await client.query(`INSERT INTO public.parent_child_links (parent_ref, student_global_id, current_link_active) VALUES ($1, $2, true)`, [parM, stuM]);
    const resM = (await client.query(`SELECT public.prepare_parent_pack_checkout($1, $2, $3, 'LOC', $4, 'maternelle_primaire', 1) AS res`, [parM, stuM, schoolSlug, pricingMat])).rows[0].res;
    const intM = (await client.query(`SELECT expected_amount FROM public.payment_intents WHERE id = $1`, [resM.payment_intent_id])).rows[0];
    assert.strictEqual(Number(intM.expected_amount), 100);

    // Collège (150 FCFA)
    const stuC = crypto.randomUUID();
    const parC = `+22995${Math.floor(100000 + Math.random() * 900000)}`;
    await client.query(`INSERT INTO public.global_students (student_global_id) VALUES ($1)`, [stuC]);
    await client.query(`INSERT INTO public.parent_child_links (parent_ref, student_global_id, current_link_active) VALUES ($1, $2, true)`, [parC, stuC]);
    const resC = (await client.query(`SELECT public.prepare_parent_pack_checkout($1, $2, $3, 'LOC', $4, 'college_secondaire', 1) AS res`, [parC, stuC, schoolSlug, pricingCol])).rows[0].res;
    const intC = (await client.query(`SELECT expected_amount FROM public.payment_intents WHERE id = $1`, [resC.payment_intent_id])).rows[0];
    assert.strictEqual(Number(intC.expected_amount), 150);

    // Supérieur (200 FCFA)
    const stuS = crypto.randomUUID();
    const parS = `+22995${Math.floor(100000 + Math.random() * 900000)}`;
    await client.query(`INSERT INTO public.global_students (student_global_id) VALUES ($1)`, [stuS]);
    await client.query(`INSERT INTO public.parent_child_links (parent_ref, student_global_id, current_link_active) VALUES ($1, $2, true)`, [parS, stuS]);
    const resS = (await client.query(`SELECT public.prepare_parent_pack_checkout($1, $2, $3, 'LOC', $4, 'superieur_formation', 1) AS res`, [parS, stuS, schoolSlug, pricingSup])).rows[0].res;
    const intS = (await client.query(`SELECT expected_amount FROM public.payment_intents WHERE id = $1`, [resS.payment_intent_id])).rows[0];
    assert.strictEqual(Number(intS.expected_amount), 200);
  });

  await t.test('6. Verrou SQL annuel réversible & sécurité des permissions sur global_settings', async () => {
    // 6a. Activation du verrou SQL
    await client.query(`UPDATE public.global_settings SET value = 'true'::jsonb WHERE key = 'parent_pack_restrict_annual_pilot'`);

    const stuAnn = crypto.randomUUID();
    const parAnn = `+22995${Math.floor(100000 + Math.random() * 900000)}`;
    await client.query(`INSERT INTO public.global_students (student_global_id) VALUES ($1)`, [stuAnn]);
    await client.query(`INSERT INTO public.parent_child_links (parent_ref, student_global_id, current_link_active) VALUES ($1, $2, true)`, [parAnn, stuAnn]);

    let annualBlocked = false;
    try {
      await client.query(`SELECT public.prepare_parent_pack_checkout($1, $2, $3, 'LOC', $4, 'maternelle_primaire', 10)`, [parAnn, stuAnn, schoolSlug, pricingMat]);
    } catch (err) {
      annualBlocked = true;
      assert.ok(err.message.includes('PILOT_MONTHLY_ONLY'));
    }
    assert.strictEqual(annualBlocked, true, 'Le paiement annuel est bloqué quand global_settings = true');

    // 6b. Le paiement mensuel reste fonctionnel
    const resM = (await client.query(`SELECT public.prepare_parent_pack_checkout($1, $2, $3, 'LOC', $4, 'maternelle_primaire', 1) AS res`, [parAnn, stuAnn, schoolSlug, pricingMat])).rows[0].res;
    assert.ok(resM.payment_intent_id);

    // 6c. Réversibilité : remise à false débloque immédiatement l annuel
    await client.query(`UPDATE public.global_settings SET value = 'false'::jsonb WHERE key = 'parent_pack_restrict_annual_pilot'`);
    const stuAnn2 = crypto.randomUUID();
    const parAnn2 = `+22995${Math.floor(100000 + Math.random() * 900000)}`;
    await client.query(`INSERT INTO public.global_students (student_global_id) VALUES ($1)`, [stuAnn2]);
    await client.query(`INSERT INTO public.parent_child_links (parent_ref, student_global_id, current_link_active) VALUES ($1, $2, true)`, [parAnn2, stuAnn2]);
    const resAnnUnblocked = (await client.query(`SELECT public.prepare_parent_pack_checkout($1, $2, $3, 'LOC', $4, 'maternelle_primaire', 10) AS res`, [parAnn2, stuAnn2, schoolSlug, pricingMat])).rows[0].res;
    assert.ok(resAnnUnblocked.payment_intent_id, 'Annuel réactivé proprement');

    // 6d. Vérification RLS sur global_settings
    const rls = (await client.query(`SELECT relrowsecurity FROM pg_class WHERE relname = 'global_settings'`)).rows[0];
    assert.strictEqual(rls.relrowsecurity, true, 'RLS doit être actif sur global_settings');
  });

  await t.test('7. Verrou API Node.js côté paymentController', async () => {
    // Tester que le contrôleur rejette avec 403 / PILOT_MONTHLY_ONLY quand PARENT_PACK_RESTRICT_ANNUAL_PILOT = 'true'
    const paymentController = require('../controllers/paymentController');

    process.env.PARENT_PACK_RESTRICT_ANNUAL_PILOT = 'true';
    let status = 200;
    let resBody = null;
    const mockRes = {
      status: (s) => { status = s; return mockRes; },
      json: (b) => { resBody = b; return b; }
    };
    const mockReqAnnual = {
      body: { schoolSlug: 'dummy_slug', studentId: 'stu_1', planType: 'annual' },
      user: { id: 'parent-123' }
    };

    await paymentController.createParentPackTransaction(mockReqAnnual, mockRes);
    assert.strictEqual(status, 403);
    assert.strictEqual(resBody.code, 'PILOT_MONTHLY_ONLY');

    // Nettoyage de l'env
    delete process.env.PARENT_PACK_RESTRICT_ANNUAL_PILOT;
  });

  await t.test('8. Petits montants (100 FCFA) et absorption frais FedaPay', async () => {
    const stuSm = crypto.randomUUID();
    const parSm = `+22995${Math.floor(100000 + Math.random() * 900000)}`;
    await client.query(`INSERT INTO public.global_students (student_global_id) VALUES ($1)`, [stuSm]);
    await client.query(`INSERT INTO public.parent_child_links (parent_ref, student_global_id, current_link_active) VALUES ($1, $2, true)`, [parSm, stuSm]);

    const subSm = (await client.query(`
      INSERT INTO public.parent_subscriptions (parent_ref, student_global_id, school_slug, student_ref, pricing_id, status)
      VALUES ($1, $2, $3, 'STU_SM', $4, 'active') RETURNING id
    `, [parSm, stuSm, schoolSlug, pricingMat])).rows[0].id;

    const intentSm = crypto.randomUUID();
    const eventIdSm = `evt_sm_${crypto.randomBytes(4).toString('hex')}`;
    const txIdSm = `tx_sm_${crypto.randomBytes(4).toString('hex')}`;

    await client.query(`
      INSERT INTO public.payment_intents (
        id, target_id, school_slug, expected_amount, expected_currency, payment_type, provider, status, expires_at, metadata
      ) VALUES ($1, $2, $3, 100, 'XOF', 'parent_pack', 'fedapay', 'pending', now() + interval '1 day', $4::jsonb)
    `, [intentSm, subSm, schoolSlug, JSON.stringify({
      parent_ref: parSm, student_global_id: stuSm, student_ref: 'STU_SM', pricing_id: pricingMat, cycle_name: 'maternelle_primaire', duration_months: 1
    })]);

    const resSm = (await client.query(`
      SELECT public.process_parent_pack_webhook_event(
        'fedapay', $1, 'transaction.approved', $2, $3, 100, 'XOF', 'approved', now(), 5, 0, true
      ) AS res
    `, [eventIdSm, intentSm, txIdSm])).rows[0].res;

    assert.strictEqual(resSm.status, 'completed');
    assert.strictEqual(Number(resSm.school_share_minor), 20);
    assert.strictEqual(Number(resSm.ambassador_share_minor), 10);
    assert.strictEqual(Number(resSm.yziow_share_minor), 65);
    assert.strictEqual(5 + 20 + 10 + 65, 100);

    // Frais excessifs (> reliquat) -> fail-closed vers reconciliation_required
    const intentExcess = crypto.randomUUID();
    const eventIdExcess = `evt_excess_${crypto.randomBytes(4).toString('hex')}`;
    const txIdExcess = `tx_excess_${crypto.randomBytes(4).toString('hex')}`;

    await client.query(`
      INSERT INTO public.payment_intents (
        id, target_id, school_slug, expected_amount, expected_currency, payment_type, provider, status, expires_at, metadata
      ) VALUES ($1, $2, $3, 100, 'XOF', 'parent_pack', 'fedapay', 'pending', now() + interval '1 day', $4::jsonb)
    `, [intentExcess, subSm, schoolSlug, JSON.stringify({
      parent_ref: parSm, student_global_id: stuSm, student_ref: 'STU_SM', pricing_id: pricingMat, cycle_name: 'maternelle_primaire', duration_months: 1
    })]);

    const resExcess = (await client.query(`
      SELECT public.process_parent_pack_webhook_event(
        'fedapay', $1, 'transaction.approved', $2, $3, 100, 'XOF', 'approved', now(), 75, 0, true
      ) AS res
    `, [eventIdExcess, intentExcess, txIdExcess])).rows[0].res;

    assert.strictEqual(resExcess.status, 'reconciliation_required');
    assert.strictEqual(resExcess.error_code, 'PARENT_PACK_FEES_AND_COMMISSIONS_EXCEED_GROSS');
  });

  } catch (err) {
    console.error('FATAL P29 TEST ERROR:', err);
    throw err;
  } finally {
    await client.end();
  }
});
