const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

function stripSqlComments(sql) {
    return sql
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/--.*$/gm, '')
        .trim();
}

test('P27: Validation structurelle et de sécurité des scripts SQL P27', async (t) => {
    const preflightPath = path.join(__dirname, '../scripts/preflight_p27_reconciliation_audit.sql');
    const migrationPath = path.join(__dirname, '../scripts/migration_p27_parent_pack_reconciliation_defense.sql');

    await t.test('1. Audit préalable P27 est strictement en lecture seule et aligné sur target_id', () => {
        assert.ok(fs.existsSync(preflightPath), 'Le script preflight_p27_reconciliation_audit.sql doit exister');
        const content = fs.readFileSync(preflightPath, 'utf8');
        const codeOnly = stripSqlComments(content).toUpperCase();

        // Vérification de lecture seule absolue sur les instructions exécutables
        assert.ok(!codeOnly.includes('INSERT INTO'), 'Aucun INSERT autorisé dans le script d audit');
        assert.ok(!codeOnly.includes('UPDATE '), 'Aucun UPDATE autorisé dans le script d audit');
        assert.ok(!codeOnly.includes('DELETE FROM'), 'Aucun DELETE autorisé dans le script d audit');
        assert.ok(!codeOnly.includes('DROP '), 'Aucun DROP autorisé dans le script d audit');
        assert.ok(!codeOnly.includes('ALTER '), 'Aucun ALTER autorisé dans le script d audit');

        // Couverture des requêtes d'inspection alignées sur target_id
        assert.ok(content.includes('reconciliation_required'), 'Audit des intentions en réconciliation');
        assert.ok(content.includes('GROUP BY pi.target_id') && content.includes('HAVING COUNT(*) > 1'), 'Détection des doublons sur target_id');
        assert.ok(content.includes('provider_transaction_id'), 'Inspection de la présence du provider_transaction_id');
    });

    await t.test('2. Migration P27 est transactionnelle, non-destructive, Fail-Closed et protège les souscriptions actives', () => {
        assert.ok(fs.existsSync(migrationPath), 'La migration P27 doit exister');
        const content = fs.readFileSync(migrationPath, 'utf8');
        const codeOnly = stripSqlComments(content).toUpperCase();

        // Intégrité transactionnelle et non-destructive
        assert.ok(codeOnly.startsWith('BEGIN;') && codeOnly.endsWith('COMMIT;'), 'P27 doit être strictement transactionnelle (BEGIN ... COMMIT)');
        assert.ok(!codeOnly.includes('DROP TABLE'), 'Aucune suppression de table');
        assert.ok(!codeOnly.includes('DELETE FROM'), 'Aucune suppression de données');

        // Vérification du verrouillage et de l atomicité
        assert.ok(content.includes('SELECT id INTO v_subscription_id') && content.includes('FOR UPDATE'), 'Verrouillage FOR UPDATE sur parent_subscriptions');
        assert.ok(content.includes('FROM public.payment_intents') && content.includes('FOR UPDATE'), 'Verrouillage FOR UPDATE sur payment_intents');
        assert.ok(content.includes("'reconciliation_required'"), 'Statut reconciliation_required pris en compte');
        assert.ok(content.includes("'initializing'"), 'Statut initializing pris en compte');
        assert.ok(content.includes("'pending'"), 'Statut pending pris en compte');

        // Codes d'erreur Fail Closed applicatifs
        assert.ok(content.includes('FAIL CLOSED: RECONCILIATION_REQUIRED_PENDING'), 'Erreur Fail Closed réconciliation pendante');
        assert.ok(content.includes('FAIL CLOSED: ACTIVE_INTENT_ALREADY_EXISTS'), 'Erreur Fail Closed intention déjà active');

        // Protection contre la mutation prématurée de l'abonnement actif
        assert.ok(content.includes("parent_subscriptions.status = 'active'"), 'Non-mutation des champs school_slug/pricing_id si statut actif');
        assert.ok(content.includes('process_parent_pack_webhook_event'), 'Mise à jour du contexte différée dans le webhook');

        // Déploiement STRICTEMENT FAIL-CLOSED de l'index sur target_id
        assert.ok(content.includes('GROUP BY target_id') && content.includes('HAVING COUNT(*) > 1'), 'Contrôle des doublons historiques sur target_id');
        assert.ok(content.includes('RAISE EXCEPTION') && content.includes('FAIL CLOSED MIGRATION P27'), 'Interruption bloquante ROLLBACK si doublons');
        assert.ok(content.includes('CREATE UNIQUE INDEX uq_active_parent_pack_intent') && content.includes('(target_id)'), 'Index partiel unique sur target_id seul');

        // Préservation des privilèges
        assert.ok(content.includes('REVOKE EXECUTE ON FUNCTION public.prepare_parent_pack_checkout'), 'Révocation des droits publics sur checkout');
        assert.ok(content.includes('GRANT EXECUTE ON FUNCTION public.prepare_parent_pack_checkout') && content.includes('TO service_role'), 'Droits service_role sur checkout');
        assert.ok(content.includes('REVOKE EXECUTE ON FUNCTION public.process_parent_pack_webhook_event'), 'Révocation des droits publics sur webhook');
        assert.ok(content.includes('GRANT EXECUTE ON FUNCTION public.process_parent_pack_webhook_event') && content.includes('TO service_role'), 'Droits service_role sur webhook');
    });
});
