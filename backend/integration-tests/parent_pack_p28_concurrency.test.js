// backend/tests/parent_pack_p28_concurrency.test.js
/**
 * Tests d'intégration ciblés P28 :
 * - Sérialisation et concurrence réelle sur deux connexions PostgreSQL indépendantes
 * - Unicité globale absolue de student_global_id
 * - Protection J-30 sur périodes certifiées
 * - Réutilisation de la souscription par le second parent et traçabilité du payeur
 * - Rejet fail-closed des parents non autorisés et des identifiants NULL
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const pg = require('pg');
const { randomUUID } = require('crypto');

const { Client } = pg;
let client1;
let client2;
let globalPricingId;

before(async () => {
  const connStr = process.env.DATABASE_URL;
  if (!connStr) throw new Error('DATABASE_URL not set');

  client1 = new Client({ connectionString: connStr });
  client2 = new Client({ connectionString: connStr });
  await client1.connect();
  await client2.connect();

  const pricingRes = await client1.query(
    `SELECT id FROM public.parent_pack_pricing WHERE cycle_name = 'maternelle_primaire' AND currency = 'XOF' AND pricing_version = 1 LIMIT 1`
  );
  if (pricingRes.rows.length === 0) {
    throw new Error('Required pricing record not found');
  }
  globalPricingId = pricingRes.rows[0].id;
});

after(async () => {
  if (client1) await client1.end();
  if (client2) await client2.end();
});

async function callCheckout(client, { parentRef, studentGlobalId, studentLocalId, schoolSlug, pricingId, durationMonths, cycleName = 'maternelle_primaire' }) {
  const res = await client.query(
    `SELECT public.prepare_parent_pack_checkout(
      $1::text, $2::uuid, $3::text, $4::text, $5::uuid, $6::text, $7::integer
    ) AS result`,
    [parentRef, studentGlobalId, schoolSlug, studentLocalId, pricingId, cycleName, durationMonths]
  );
  return res.rows[0].result;
}

describe('P28 - Concurrence réelle multi-connexions et unicité globale', () => {

  it('1. Deux checkouts concurrents simultanés pour le même enfant sur deux connexions distinctes', async () => {
    const studentId = randomUUID();
    const parentA = 'parent_concurr_A_' + randomUUID().substring(0, 8);
    const parentB = 'parent_concurr_B_' + randomUUID().substring(0, 8);

    // Enregistrement de l'élève global et des deux parents autorisés
    await client1.query('INSERT INTO public.global_students (student_global_id) VALUES ($1)', [studentId]);
    await client1.query(
      `INSERT INTO public.parent_child_links (parent_ref, student_global_id, current_link_active)
       VALUES ($1, $2, true), ($3, $2, true)`,
      [parentA, studentId, parentB]
    );

    // Lancement simultané sur deux connexions indépendantes
    const p1 = callCheckout(client1, {
      parentRef: parentA,
      studentGlobalId: studentId,
      studentLocalId: 'loc_' + studentId.substring(0, 6),
      schoolSlug: 'school',
      pricingId: globalPricingId,
      durationMonths: 1
    }).then(r => ({ status: 'fulfilled', value: r })).catch(e => ({ status: 'rejected', reason: e }));

    const p2 = callCheckout(client2, {
      parentRef: parentB,
      studentGlobalId: studentId,
      studentLocalId: 'loc_' + studentId.substring(0, 6),
      schoolSlug: 'school',
      pricingId: globalPricingId,
      durationMonths: 1
    }).then(r => ({ status: 'fulfilled', value: r })).catch(e => ({ status: 'rejected', reason: e }));

    const [res1, res2] = await Promise.all([p1, p2]);

    // Exactement un checkout doit réussir, l'autre doit échouer pour intention active existante
    const fulfilled = [res1, res2].filter(r => r.status === 'fulfilled');
    const rejected = [res1, res2].filter(r => r.status === 'rejected');

    assert.strictEqual(fulfilled.length, 1, 'Exactement un checkout concurrent doit réussir');
    assert.strictEqual(rejected.length, 1, 'Le checkout en concurrence doit être rejeté');
    assert.match(rejected[0].reason.message, /ACTIVE_INTENT_ALREADY_EXISTS/);

    // Vérifier en base : une seule souscription et une seule intention
    const subs = await client1.query('SELECT COUNT(*) AS cnt FROM public.parent_subscriptions WHERE student_global_id = $1', [studentId]);
    assert.strictEqual(parseInt(subs.rows[0].cnt), 1, 'Exactement une seule souscription doit exister pour cet enfant');

    const intents = await client1.query('SELECT COUNT(*) AS cnt FROM public.payment_intents WHERE target_id = $1', [fulfilled[0].value.subscription_id]);
    assert.strictEqual(parseInt(intents.rows[0].cnt), 1, 'Exactement une seule intention active créée');
  });

  it('2. Index UNIQUE global : tentative d insertion SQL directe en doublon rejetée', async () => {
    const studentId = randomUUID();
    await client1.query('INSERT INTO public.global_students (student_global_id) VALUES ($1)', [studentId]);

    await client1.query(
      `INSERT INTO public.parent_subscriptions (parent_ref, student_global_id, school_slug, student_ref, pricing_id, status)
       VALUES ('parent_X', $1, 'school', 'local_X', $2, 'inactive')`,
      [studentId, globalPricingId]
    );

    // Deuxième insertion directe pour le même student_global_id avec un parent différent
    await assert.rejects(
      async () => {
        await client1.query(
          `INSERT INTO public.parent_subscriptions (parent_ref, student_global_id, school_slug, student_ref, pricing_id, status)
           VALUES ('parent_Y', $1, 'school', 'local_Y', $2, 'inactive')`,
          [studentId, globalPricingId]
        );
      },
      /uq_parent_subscriptions_global_unique/,
      'L index unique global uq_parent_subscriptions_global_unique doit rejeter l insertion directe en doublon'
    );
  });

  it('3. Rejet fail-closed immédiat si student_global_id est NULL', async () => {
    await assert.rejects(
      async () => {
        await callCheckout(client1, {
          parentRef: 'parent_null',
          studentGlobalId: null,
          studentLocalId: 'loc_null',
          schoolSlug: 'school',
          pricingId: globalPricingId,
          durationMonths: 1
        });
      },
      /student_global_id cannot be NULL/
    );
  });

  it('4. Rejet fail-closed si parent non autorisé (aucun lien actif)', async () => {
    const studentId = randomUUID();
    await client1.query('INSERT INTO public.global_students (student_global_id) VALUES ($1)', [studentId]);

    await assert.rejects(
      async () => {
        await callCheckout(client1, {
          parentRef: 'unauthorized_parent_' + randomUUID().substring(0, 6),
          studentGlobalId: studentId,
          studentLocalId: 'loc_test',
          schoolSlug: 'school',
          pricingId: globalPricingId,
          durationMonths: 1
        });
      },
      /is not authorized for student/
    );
  });

  it('5. Couverture existante active : le second parent est protégé contre le double paiement (J-30)', async () => {
    const studentId = randomUUID();
    const parentFather = 'father_' + randomUUID().substring(0, 6);
    const parentMother = 'mother_' + randomUUID().substring(0, 6);

    await client1.query('INSERT INTO public.global_students (student_global_id) VALUES ($1)', [studentId]);
    await client1.query(
      `INSERT INTO public.parent_child_links (parent_ref, student_global_id, current_link_active)
       VALUES ($1, $3, true), ($2, $3, true)`,
      [parentFather, parentMother, studentId]
    );

    // Le père initie et paie 10 mois (durée annuelle)
    const fRes = await callCheckout(client1, {
      parentRef: parentFather,
      studentGlobalId: studentId,
      studentLocalId: 'loc_' + studentId.substring(0, 6),
      schoolSlug: 'school',
      pricingId: globalPricingId,
      durationMonths: 10
    });

    // Activation de la souscription et création de la période active (couverture jusqu'à +10 mois)
    await client1.query(
      `UPDATE public.payment_intents SET status = 'completed', processed_at = now() WHERE id = $1`,
      [fRes.payment_intent_id]
    );
    await client1.query(
      `UPDATE public.parent_subscriptions SET status = 'active' WHERE id = $1`,
      [fRes.subscription_id]
    );
    await client1.query(
      `INSERT INTO public.parent_subscription_periods (subscription_id, payment_intent_id, start_date, end_date, status)
       VALUES ($1, $2, now()::date, (now() + interval '300 days')::date, 'active')`,
      [fRes.subscription_id, fRes.payment_intent_id]
    );

    // La mère essaie de faire un checkout pour ce même enfant déjà couvert
    await assert.rejects(
      async () => {
        await callCheckout(client2, {
          parentRef: parentMother,
          studentGlobalId: studentId,
          studentLocalId: 'loc_' + studentId.substring(0, 6),
          schoolSlug: 'school',
          pricingId: globalPricingId,
          durationMonths: 1
        });
      },
      /RENEWAL_TOO_EARLY/,
      'La mère ne doit pas payer pour un enfant déjà couvert hors période J-30'
    );
  });

  it('6. Fenêtre J-30 : le second parent peut légitimement renouveler et le parent_ref est tracé', async () => {
    const studentId = randomUUID();
    const parentFather = 'father_' + randomUUID().substring(0, 6);
    const parentMother = 'mother_' + randomUUID().substring(0, 6);

    await client1.query('INSERT INTO public.global_students (student_global_id) VALUES ($1)', [studentId]);
    await client1.query(
      `INSERT INTO public.parent_child_links (parent_ref, student_global_id, current_link_active)
       VALUES ($1, $3, true), ($2, $3, true)`,
      [parentFather, parentMother, studentId]
    );

    // Création initiale d'une souscription avec période expirant dans 10 jours (dans la fenêtre J-30)
    const subRes = await client1.query(
      `INSERT INTO public.parent_subscriptions (parent_ref, student_global_id, school_slug, student_ref, pricing_id, status)
       VALUES ($1, $2, 'school', 'loc_test', $3, 'active') RETURNING id`,
      [parentFather, studentId, globalPricingId]
    );
    const subId = subRes.rows[0].id;

    const oldIntentRes = await client1.query(
      `INSERT INTO public.payment_intents (target_id, expected_amount, expected_currency, status, payment_type, school_slug, plan_type, metadata, expires_at, processed_at)
       VALUES ($1, 100, 'XOF', 'completed', 'parent_pack', 'school', NULL, jsonb_build_object('parent_ref', $2::text), now(), now()) RETURNING id`,
      [subId, parentFather]
    );
    await client1.query(
      `INSERT INTO public.parent_subscription_periods (subscription_id, payment_intent_id, start_date, end_date, status)
       VALUES ($1, $2, (now() - interval '300 days')::date, (now() + interval '10 days')::date, 'active')`,
      [subId, oldIntentRes.rows[0].id]
    );

    // La mère effectue le renouvellement à J-10
    const mRes = await callCheckout(client2, {
      parentRef: parentMother,
      studentGlobalId: studentId,
      studentLocalId: 'loc_test',
      schoolSlug: 'school',
      pricingId: globalPricingId,
      durationMonths: 10
    });

    assert.strictEqual(mRes.subscription_id, subId, 'Le renouvellement doit réutiliser la souscription unique existante');
    assert.ok(mRes.payment_intent_id, 'Une intention de renouvellement doit être créée');

    // Vérifier la traçabilité du payeur dans metadata
    const intentMeta = await client1.query(
      'SELECT metadata FROM public.payment_intents WHERE id = $1',
      [mRes.payment_intent_id]
    );
    assert.strictEqual(intentMeta.rows[0].metadata.parent_ref, parentMother, 'La mère doit être enregistrée comme parent payeur dans metadata');
  });

  it('7. Multi-écoles concurrentes pour le même enfant : sérialisation et protection', async () => {
    const studentId = randomUUID();
    const parentSchoolA = 'parent_schoolA_' + randomUUID().substring(0, 6);
    const parentSchoolB = 'parent_schoolB_' + randomUUID().substring(0, 6);

    await client1.query('INSERT INTO public.global_students (student_global_id) VALUES ($1)', [studentId]);
    await client1.query(
      `INSERT INTO public.parent_child_links (parent_ref, student_global_id, current_link_active)
       VALUES ($1, $3, true), ($2, $3, true)`,
      [parentSchoolA, parentSchoolB, studentId]
    );

    // Tentatives simultanées depuis deux écoles différentes
    const [pA, pB] = await Promise.allSettled([
      callCheckout(client1, {
        parentRef: parentSchoolA,
        studentGlobalId: studentId,
        studentLocalId: 'loc_A',
        schoolSlug: 'ecole_alpha',
        pricingId: globalPricingId,
        durationMonths: 1
      }),
      callCheckout(client2, {
        parentRef: parentSchoolB,
        studentGlobalId: studentId,
        studentLocalId: 'loc_B',
        schoolSlug: 'ecole_beta',
        pricingId: globalPricingId,
        durationMonths: 1
      })
    ]);

    const successes = [pA, pB].filter(r => r.status === 'fulfilled');
    const failures = [pA, pB].filter(r => r.status === 'rejected');

    assert.strictEqual(successes.length, 1, 'Une seule école doit pouvoir ouvrir un paiement');
    assert.strictEqual(failures.length, 1, 'L autre école doit être bloquée pour intention active concurrente');
    assert.match(failures[0].reason.message, /ACTIVE_INTENT_ALREADY_EXISTS/);
  });
});
