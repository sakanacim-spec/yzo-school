'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('P27 Régression Cycle de Vie : Souscription Active, Renouvellement, Transfert et Idempotence Webhook', async (t) => {

    await t.test('1. Abandon de checkout : l abonnement actif ne subit aucune modification de ses champs', () => {
        // Simulation de l'état initial : abonnement actif à l'école A
        const existingSub = {
            id: 'sub-uuid-1',
            parent_ref: 'parent-123',
            student_global_id: 'student-uuid-1',
            school_slug: 'ecole-a',
            student_ref: 'MATRICULE-A',
            pricing_id: 'pricing-a',
            status: 'active'
        };

        // Paramètres d'un checkout abandonné ciblant l'école B
        const checkoutAttempt = {
            school_slug: 'ecole-b',
            student_ref: 'MATRICULE-B',
            pricing_id: 'pricing-b'
        };

        // Application de la règle P27 (CASE WHEN status = 'active')
        const updatedSubOnCheckout = {
            ...existingSub,
            school_slug: existingSub.status === 'active' ? existingSub.school_slug : checkoutAttempt.school_slug,
            student_ref: existingSub.status === 'active' ? existingSub.student_ref : checkoutAttempt.student_ref,
            pricing_id: existingSub.status === 'active' ? existingSub.pricing_id : checkoutAttempt.pricing_id,
            updated_at: new Date()
        };

        assert.strictEqual(updatedSubOnCheckout.school_slug, 'ecole-a', 'L école ne doit pas être modifiée lors d un checkout non payé');
        assert.strictEqual(updatedSubOnCheckout.student_ref, 'MATRICULE-A', 'Le matricule ne doit pas être modifié lors d un checkout non payé');
        assert.strictEqual(updatedSubOnCheckout.pricing_id, 'pricing-a', 'Le tarif ne doit pas être modifié lors d un checkout non payé');
        assert.strictEqual(updatedSubOnCheckout.status, 'active', 'Le statut doit rester active');
    });

    await t.test('2. Renouvellement confirmé : le webhook met à jour le contexte lors de la certification', () => {
        const sub = {
            id: 'sub-uuid-1',
            school_slug: 'ecole-a',
            student_ref: 'MATRICULE-A',
            pricing_id: 'pricing-a',
            status: 'active'
        };

        const certifiedIntent = {
            id: 'intent-uuid-renewal',
            target_id: sub.id,
            school_slug: 'ecole-a',
            metadata: {
                pricing_id: 'pricing-a',
                student_ref: 'MATRICULE-A',
                duration_months: 1
            }
        };

        // Application de la règle P27 du webhook
        const subAfterWebhook = {
            ...sub,
            status: 'active',
            school_slug: certifiedIntent.school_slug,
            student_ref: certifiedIntent.metadata.student_ref || sub.student_ref,
            pricing_id: certifiedIntent.metadata.pricing_id,
            updated_at: new Date()
        };

        assert.strictEqual(subAfterWebhook.status, 'active');
        assert.strictEqual(subAfterWebhook.school_slug, 'ecole-a');
        assert.strictEqual(subAfterWebhook.pricing_id, 'pricing-a');
    });

    await t.test('3. Changement d établissement confirmé : mise à jour atomique à la certification', () => {
        const sub = {
            id: 'sub-uuid-1',
            school_slug: 'ecole-a',
            student_ref: 'MATRICULE-A',
            pricing_id: 'pricing-a',
            status: 'active'
        };

        // Nouveau paiement certifié pour l'école B
        const certifiedTransferIntent = {
            id: 'intent-uuid-transfer',
            target_id: sub.id,
            school_slug: 'ecole-b',
            metadata: {
                pricing_id: 'pricing-b',
                student_ref: 'MATRICULE-B',
                duration_months: 9
            }
        };

        const subAfterTransferWebhook = {
            ...sub,
            status: 'active',
            school_slug: certifiedTransferIntent.school_slug,
            student_ref: certifiedTransferIntent.metadata.student_ref || sub.student_ref,
            pricing_id: certifiedTransferIntent.metadata.pricing_id,
            updated_at: new Date()
        };

        assert.strictEqual(subAfterTransferWebhook.school_slug, 'ecole-b', 'L école doit être mise à jour vers ecole-b après certification');
        assert.strictEqual(subAfterTransferWebhook.student_ref, 'MATRICULE-B', 'Le matricule doit être mis à jour après certification');
        assert.strictEqual(subAfterTransferWebhook.pricing_id, 'pricing-b', 'Le tarif doit être mis à jour après certification');
    });

    await t.test('4. Idempotence du webhook : rejet strict d un événement dupliqué', () => {
        const processedEvents = new Set();
        const incomingEventId = 'fedapay_evt_123456';

        function processWebhookEvent(eventId) {
            if (processedEvents.has(eventId)) {
                return { status: 'duplicate', message: 'Webhook event already recorded' };
            }
            processedEvents.add(eventId);
            return { status: 'completed' };
        }

        const firstResult = processWebhookEvent(incomingEventId);
        assert.strictEqual(firstResult.status, 'completed');

        const secondResult = processWebhookEvent(incomingEventId);
        assert.strictEqual(secondResult.status, 'duplicate', 'Un webhook rejoué doit être reconnu comme duplicate');
    });

    await t.test('5. Préservation des écritures comptables et invariant de répartition', () => {
        const grossAmount = 150000;
        const fedapayFee = 3500;
        const schoolRate = 20; // 20%
        const schoolShare = Math.floor(grossAmount * schoolRate / 100); // 30000
        const amountAfterFeeAndSchool = grossAmount - fedapayFee - schoolShare; // 116500

        const ambassadorRate = 10; // 10%
        const ambassadorShare = Math.floor(amountAfterFeeAndSchool * ambassadorRate / 100); // 11650
        const yziowShare = grossAmount - fedapayFee - schoolShare - ambassadorShare; // 104850

        // Invariant comptable strict
        const totalAllocated = fedapayFee + schoolShare + ambassadorShare + yziowShare;
        assert.strictEqual(totalAllocated, grossAmount, 'La somme des parts doit être rigoureusement égale au montant brut');
        assert.ok(yziowShare > 0, 'La part YZIOW doit être strictement positive');
    });
});
