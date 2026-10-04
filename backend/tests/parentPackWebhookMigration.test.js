const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

test('Lot 2: P21 traite parent_pack sans modifier les flux historiques', () => {
    const p21Path = path.join(__dirname, '../scripts/migration_p21_parent_pack_webhook.sql');
    const p18Path = path.join(__dirname, '../scripts/migration_p18_remove_saas_webhook_logic.sql');

    assert.ok(fs.existsSync(p21Path), 'La migration P21 doit exister');
    const raw = fs.readFileSync(p21Path, 'utf8');
    const content = raw.replace(/\s+/g, ' ');
    const p18 = fs.readFileSync(p18Path, 'utf8');

    assert.ok(raw.startsWith('-- Migration P21'), 'Le script est bien versionné P21');
    assert.ok(content.includes('BEGIN;') && content.trim().endsWith('COMMIT;'), 'P21 est transactionnelle');
    assert.ok(!content.includes('DROP FUNCTION'), 'Aucune suppression de fonction');
    assert.ok(!content.includes('DROP TABLE'), 'Aucune suppression de table');
    assert.ok(!content.includes('DELETE FROM'), 'Aucune suppression de données');

    // Préservation de P18 et séparation des routes.
    assert.ok(content.includes('RENAME TO process_fedapay_webhook_event_v2_legacy'), 'P18 est préservée sous un nom privé');
    assert.ok(content.includes("IF v_payment_type = 'parent_pack' THEN"), 'Le répartiteur cible seulement parent_pack');
    assert.ok(content.includes('RETURN public.process_fedapay_webhook_event_v2_legacy('), 'Les autres flux restent délégués à P18');
    assert.ok(p18.includes("IF v_intent.payment_type = 'saas_subscription' THEN"), 'P18 conserve la revue manuelle SaaS');

    // Idempotence webhook et liaison sûre intention -> période -> souscription.
    assert.ok(content.includes('ON CONFLICT (provider, provider_event_id) DO NOTHING'), 'Déduplication webhook obligatoire');
    assert.ok(content.includes('FROM public.payment_intents') && content.includes('FOR UPDATE'), 'Intention verrouillée');
    assert.ok(content.includes("v_intent.payment_type IS DISTINCT FROM 'parent_pack'"), 'Type parent_pack imposé');
    assert.ok(content.includes('WHERE p.payment_intent_id = p_intent_id') && content.includes('FOR UPDATE OF p, s'), 'Période et souscription verrouillées');
    assert.ok(content.includes('v_intent.target_id IS DISTINCT FROM v_period.subscription_id::text'), 'target_id doit correspondre à la souscription');
    assert.ok(content.includes('v_intent.school_slug IS DISTINCT FROM v_period.subscription_school_slug'), 'École de l’intention et de la souscription identiques');
    assert.ok(content.includes("v_period.status IS DISTINCT FROM 'pending_payment'"), 'Une période non payée ne devient pas active');
    assert.ok(content.includes("v_intent.status NOT IN ('initializing', 'pending')"), 'Une intention non payable est bloquée');
    assert.ok(content.includes('daterange(other_period.start_date, other_period.end_date'), 'Chevauchement actif interdit');

    // Tarif dérivé côté serveur et non du client.
    assert.ok(content.includes("INTERVAL '1 month - 1 day'"), 'Durée mensuelle contrôlée');
    assert.ok(content.includes('make_interval(months => v_period.annual_duration_months)'), 'Durée annuelle tarifaire contrôlée');
    assert.ok(content.includes('v_intent.payable_amount <> v_expected_amount'), 'Montant de l’intention vérifié contre le tarif');

    // Preuve FedaPay et répartition financière exacte.
    assert.ok(content.includes("p_remote_currency IS DISTINCT FROM 'XOF'"), 'XOF strict');
    assert.ok(content.includes("p_provider IS DISTINCT FROM 'fedapay'"), 'Prestataire FedaPay strict');
    assert.ok(content.includes("p_event_type IS DISTINCT FROM 'transaction.approved'"), 'Événement approuvé strict');
    assert.ok(content.includes("p_remote_status IS DISTINCT FROM 'approved'"), 'Paiement approuvé obligatoire');
    assert.ok(content.includes("p_provider_event_id LIKE 'uncertified_%'"), 'Événement certifié obligatoire');
    assert.ok(content.includes('v_fedapay_fee_minor := ROUND(p_fedapay_fee)::BIGINT + ROUND(p_tax_amount)::BIGINT'), 'Frais FedaPay et taxes supportés par YZIOW');
    assert.ok(content.includes('v_school_share_minor := FLOOR(v_gross_amount_minor::NUMERIC * 20 / 100)::BIGINT'), 'Part école fixe à 20 % du brut');
    assert.ok(content.includes('v_ambassador_share_minor := FLOOR(v_amount_after_fee_and_school_minor::NUMERIC * 10 / 100)::BIGINT'), 'Part ambassadeur fixe à 10 % du solde');
    assert.ok(content.includes("AND status = 'active'"), 'Ambassadeur obligatoirement actif');
    assert.ok(content.includes('v_yziow_share_minor := v_gross_amount_minor'), 'Part YZIOW calculée comme solde');
    assert.ok(content.includes('gross_amount_minor <> v_fedapay_fee_minor + v_school_share_minor + v_ambassador_share_minor + v_yziow_share_minor'), 'Identité comptable vérifiée');
    assert.ok(content.includes('INSERT INTO public.school_commission_ledger'), 'Ledger établissement écrit');
    assert.ok(content.includes("'source', 'parent_pack'"), 'Ledger ambassadeur identifié comme Pack Parent');
    assert.ok(content.includes('INSERT INTO public.affiliate_ledger') && content.includes('INSERT INTO public.affiliate_balances'), 'Part ambassadeur tracée et comptabilisée');

    // Activation atomique, sans période de grâce et sans toucher aux écoles SaaS.
    assert.ok(content.includes("SET status = 'active', updated_at = clock_timestamp()"), 'Période et souscription activées atomiquement');
    assert.ok(content.includes("SET status = 'completed',"), 'Intention finalisée après écritures comptables');
    assert.ok(!content.includes('grace_') && !content.includes('trial_ends_at'), 'Aucune grâce ou essai école ajouté');
    assert.ok(!content.includes('subscription_status'), 'Aucun statut SaaS école modifié');

    // Exposition minimale.
    assert.ok(content.includes('SECURITY DEFINER') && content.includes('SET search_path = public, pg_temp'), 'Fonctions sécurisées');
    assert.ok(content.includes('REVOKE ALL ON FUNCTION public.process_parent_pack_webhook_event') && content.includes('FROM PUBLIC, anon, authenticated'), 'Fonction Pack Parent non publique');
    assert.ok(content.includes('GRANT EXECUTE ON FUNCTION public.process_parent_pack_webhook_event') && content.includes('TO service_role, postgres'), 'Exécution limitée au service role');
});
