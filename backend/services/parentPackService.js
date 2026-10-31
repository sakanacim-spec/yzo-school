const { supabase } = require('../utils/supabase');

/**
 * Constantes d'accès P25
 */
const ACCESS_STATES = {
    PAID_ACTIVE: 'PAID_ACTIVE',
    GRACE_ACTIVE: 'GRACE_ACTIVE',
    LEGACY_UNDECIDED: 'LEGACY_UNDECIDED',
    PACK_SUSPENDED: 'PACK_SUSPENDED'
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROVIDER_REFUND_ID_REGEX = /^(ref_|fedapay_|feda_|tx_)[a-zA-Z0-9_-]{6,120}$/i;

/**
 * Détermine l'état d'accès pour une liste de student_global_id.
 * Retourne un dictionnaire: { [student_global_id]: { state, accessAllowed } }
 */
async function getAccessStatesForGlobalIds(parentRef, studentGlobalIds) {
    if (!studentGlobalIds || studentGlobalIds.length === 0) return {};

    const result = {};

    // Initialisation par défaut sécurisée
    for (const gid of studentGlobalIds) {
        result[gid] = {
            state: ACCESS_STATES.PACK_SUSPENDED,
            accessAllowed: false
        };
    }

    if (!parentRef || typeof parentRef !== 'string' || parentRef.trim() === '') {
        return result;
    }

    // 1. Récupérer les liens parent-enfant actifs (first_linked_at, current_link_active)
    const { data: links, error: linksErr } = await supabase
        .from('parent_child_links')
        .select('student_global_id, first_linked_at, current_link_active')
        .eq('parent_ref', parentRef)
        .eq('current_link_active', true)
        .in('student_global_id', studentGlobalIds);

    if (linksErr) throw linksErr;

    // 2. Récupérer les identifiants bénéficiant d'une couverture payée active
    // Utilise la RPC qui vérifie l'autorisation active dans parent_child_links et les dates de période
    const { data: paidData, error: rpcErr } = await supabase
        .rpc('get_active_parent_pack_subscriptions', {
            p_parent_ref: parentRef,
            p_student_global_ids: studentGlobalIds
        });

    if (rpcErr) throw rpcErr;

    // Le tableau renvoyé contient des objets { student_global_id: ... }
    const paidSet = new Set((paidData || []).map(row => row.student_global_id || row));

    const now = new Date();

    // Calcul des états (ordre de priorité P25 / P28b : lien actif exigé en amont)
    for (const gid of studentGlobalIds) {
        const link = links?.find(l => l.student_global_id === gid && l.current_link_active !== false);
        if (!link) {
            result[gid] = { state: ACCESS_STATES.PACK_SUSPENDED, accessAllowed: false };
            continue;
        }

        // A. Vérifier PAID_ACTIVE (uniquement pour un parent disposant d'un lien actif)
        if (paidSet.has(gid)) {
            result[gid] = { state: ACCESS_STATES.PAID_ACTIVE, accessAllowed: true };
            continue;
        }

        // B. Vérifier LEGACY_UNDECIDED
        if (link.first_linked_at === null) {
            result[gid] = { state: ACCESS_STATES.LEGACY_UNDECIDED, accessAllowed: true };
            continue;
        }

        const firstLinkedAt = new Date(link.first_linked_at);
        const expirationDate = new Date(firstLinkedAt.getTime() + 7 * 24 * 60 * 60 * 1000); // +7 days

        // C & D. Vérifier GRACE_ACTIVE / PACK_SUSPENDED
        if (now.getTime() < expirationDate.getTime()) {
            result[gid] = { state: ACCESS_STATES.GRACE_ACTIVE, accessAllowed: true };
        } else {
            result[gid] = { state: ACCESS_STATES.PACK_SUSPENDED, accessAllowed: false };
        }
    }

    return result;
}

/**
 * Utilitaire pour résoudre les identifiants locaux en identifiants globaux
 */
async function resolveGlobalIds(schoolSlug, studentLocalIds) {
    if (!studentLocalIds || studentLocalIds.length === 0) return {};

    const { data, error } = await supabase
        .from('student_global_mappings')
        .select('student_local_id, student_global_id')
        .eq('school_slug', schoolSlug)
        .in('student_local_id', studentLocalIds.map(String));

    if (error) throw error;

    const map = {};
    (data || []).forEach(row => {
        map[row.student_local_id] = row.student_global_id;
    });
    return map;
}

/**
 * Fonction combinée pour les contrôleurs
 */
async function getAccessStatesForLocalIds(parentRef, schoolSlug, studentLocalIds) {
    const globalIdsMap = await resolveGlobalIds(schoolSlug, studentLocalIds);
    const globalIds = Object.values(globalIdsMap);

    const states = await getAccessStatesForGlobalIds(parentRef, globalIds);

    const result = {};
    for (const localId of studentLocalIds) {
        const gid = globalIdsMap[String(localId)];
        if (gid && states[gid]) {
            result[localId] = states[gid];
        } else {
            result[localId] = { state: ACCESS_STATES.PACK_SUSPENDED, accessAllowed: false };
        }
    }

    return result;
}

/**
 * P28c: Vérifie le statut d'une transaction FedaPay associée à une période Parent Pack.
 * @param {string} periodId - UUID de la période
 * @param {Object} [fedapayClient] - Client mocké pour les tests (optionnel)
 */
async function verifyParentPackRefundStatus(periodId, fedapayClient = null) {
    if (!periodId || !UUID_REGEX.test(periodId)) {
        return { success: false, code: 'INVALID_PERIOD_ID', message: 'Identifiant de période invalide.' };
    }

    const { data: period, error: periodErr } = await supabase
        .from('parent_subscription_periods')
        .select('id, subscription_id, payment_intent_id, status')
        .eq('id', periodId)
        .maybeSingle();

    if (periodErr) throw periodErr;
    if (!period) {
        return { success: false, code: 'PERIOD_NOT_FOUND', message: 'Période d\'abonnement introuvable.' };
    }

    if (!period.payment_intent_id) {
        return { success: false, code: 'PAYMENT_INTENT_NOT_FOUND', message: 'Intention de paiement introuvable pour cette période.' };
    }

    const { data: intent, error: intentErr } = await supabase
        .from('payment_intents')
        .select('id, status, provider_transaction_id, expected_amount, expected_currency')
        .eq('id', period.payment_intent_id)
        .maybeSingle();

    if (intentErr) throw intentErr;
    if (!intent) {
        return { success: false, code: 'PAYMENT_INTENT_NOT_FOUND', message: 'Intention de paiement introuvable.' };
    }

    if (!intent.provider_transaction_id) {
        return { success: false, code: 'NO_PROVIDER_TX_ID', message: 'Aucun identifiant de transaction externe (FedaPay) associé.' };
    }

    let tx = null;
    if (fedapayClient && typeof fedapayClient.retrieveTransaction === 'function') {
        tx = await fedapayClient.retrieveTransaction(intent.provider_transaction_id);
    } else {
        const { configureFedaPay } = require('../controllers/paymentController');
        const config = await configureFedaPay();
        if (!config.isConfigured) {
            return {
                success: false,
                code: 'PROVIDER_NOT_CONFIGURED',
                message: 'La passerelle FedaPay n\'est pas configurée correctement.'
            };
        }
        const { Transaction } = require('fedapay');
        try {
            tx = await Transaction.retrieve(intent.provider_transaction_id);
        } catch (fedaErr) {
            return {
                success: false,
                code: 'PROVIDER_API_ERROR',
                message: `Impossible de contacter FedaPay : ${fedaErr.message || 'Erreur API'}`
            };
        }
    }

    const isPartiallyRefunded = tx && (
        (typeof tx.wasPartiallyRefunded === 'function' && tx.wasPartiallyRefunded()) ||
        (typeof tx.status === 'string' && tx.status.includes('partially_refunded'))
    );

    if (isPartiallyRefunded) {
        return {
            success: false,
            code: 'PARTIAL_REFUND_NOT_SUPPORTED',
            message: 'Les remboursements partiels ne sont pas supportés par le parcours de compensation intégrale P28c.',
            providerStatus: tx?.status || 'UNKNOWN'
        };
    }

    const isFullyRefunded = tx && (
        tx.status === 'refunded' ||
        tx.status === 'transferred_refunded' ||
        (typeof tx.wasRefunded === 'function' && tx.wasRefunded() && !tx.status.includes('partially'))
    );

    return {
        success: true,
        periodId,
        paymentIntentId: intent.id,
        providerTxId: intent.provider_transaction_id,
        providerStatus: tx?.status || 'UNKNOWN',
        isRefundedOnProvider: !!isFullyRefunded,
        amountMinor: intent.expected_amount,
        currency: intent.expected_currency
    };
}

/**
 * P28c: Remboursement administratif d'un abonnement Parent Pack.
 * Effectue les vérifications fail-closed côté FedaPay puis appelle l'audit et la RPC transactionnelle.
 *
 * @param {Object} params
 * @param {string} params.periodId - UUID de la période
 * @param {string} params.providerRefundId - Référence unique du remboursement FedaPay / provider
 * @param {string} params.adminActorId - UUID du superadmin exécutant
 * @param {string} [params.reason] - Motif du remboursement
 * @param {Object} [params.fedapayClient] - Client mocké pour les tests (optionnel)
 * @returns {Promise<Object>} Résultat du remboursement
 */
async function refundParentPackSubscriptionAdmin({
    periodId,
    providerRefundId,
    adminActorId,
    reason = 'Remboursement administratif Parent Pack',
    fedapayClient = null
}) {
    if (!periodId || !UUID_REGEX.test(periodId)) {
        return { success: false, code: 'INVALID_PERIOD_ID', message: 'Identifiant de période invalide.' };
    }
    if (!adminActorId || !UUID_REGEX.test(adminActorId)) {
        return { success: false, code: 'INVALID_ADMIN_ACTOR_ID', message: 'Identifiant d\'administrateur invalide.' };
    }
    if (!providerRefundId || typeof providerRefundId !== 'string' || !PROVIDER_REFUND_ID_REGEX.test(providerRefundId.trim())) {
        return {
            success: false,
            code: 'INVALID_PROVIDER_REFUND_ID_FORMAT',
            message: 'Référence du remboursement fournisseur invalide. Format attendu : préfixe ref_, fedapay_, feda_ ou tx_ suivi d\'au moins 6 caractères alphanumériques.'
        };
    }

    const cleanRefundId = providerRefundId.trim();

    // 1. Contrôle d'existence de la période et idempotence
    const { data: period, error: periodErr } = await supabase
        .from('parent_subscription_periods')
        .select('id, subscription_id, payment_intent_id, status, start_date, end_date')
        .eq('id', periodId)
        .maybeSingle();

    if (periodErr) throw periodErr;
    if (!period) {
        return { success: false, code: 'PERIOD_NOT_FOUND', message: 'Période d\'abonnement introuvable.' };
    }

    if (period.status === 'refunded') {
        const { data: existingAudit } = await supabase
            .from('parent_pack_refund_audits')
            .select('id, provider_refund_id, created_at')
            .eq('period_id', periodId)
            .maybeSingle();

        return {
            success: true,
            code: 'ALREADY_REFUNDED',
            message: 'Cette période d\'abonnement a déjà été remboursée.',
            audit: existingAudit || null,
            period_id: periodId
        };
    }

    // 2. Contrôle du payment intent
    if (!period.payment_intent_id) {
        return { success: false, code: 'PAYMENT_INTENT_NOT_FOUND', message: 'Intention de paiement introuvable pour cette période.' };
    }

    const { data: paymentIntent, error: piErr } = await supabase
        .from('payment_intents')
        .select('id, status, provider_transaction_id, expected_amount, expected_currency')
        .eq('id', period.payment_intent_id)
        .maybeSingle();

    if (piErr) throw piErr;
    if (!paymentIntent) {
        return { success: false, code: 'PAYMENT_INTENT_NOT_FOUND', message: 'Intention de paiement introuvable.' };
    }

    if (paymentIntent.status !== 'completed' && paymentIntent.status !== 'succeeded') {
        return {
            success: false,
            code: 'INVALID_INTENT_STATUS',
            message: `Impossible de rembourser une intention avec le statut ${paymentIntent.status}. Seuls les paiements confirmés (completed) peuvent être remboursés.`
        };
    }

    // 3. Contrôle FedaPay fail-closed
    if (paymentIntent.provider_transaction_id) {
        let fedaTx = null;
        if (fedapayClient && typeof fedapayClient.retrieveTransaction === 'function') {
            fedaTx = await fedapayClient.retrieveTransaction(paymentIntent.provider_transaction_id);
        } else {
            const { configureFedaPay } = require('../controllers/paymentController');
            const config = await configureFedaPay();
            if (!config.isConfigured) {
                return {
                    success: false,
                    code: 'PROVIDER_NOT_CONFIGURED',
                    message: 'La passerelle FedaPay n\'est pas configurée correctement.'
                };
            }
            const { Transaction } = require('fedapay');
            try {
                const tx = await Transaction.retrieve(paymentIntent.provider_transaction_id);
                fedaTx = tx;
            } catch (fedaErr) {
                return {
                    success: false,
                    code: 'PROVIDER_API_ERROR',
                    message: `Impossible de vérifier la transaction FedaPay : ${fedaErr.message || 'Erreur API'}`
                };
            }
        }

        // Refus strict des remboursements partiels
        const isPartiallyRefunded = fedaTx && (
            (typeof fedaTx.wasPartiallyRefunded === 'function' && fedaTx.wasPartiallyRefunded()) ||
            (typeof fedaTx.status === 'string' && fedaTx.status.includes('partially_refunded'))
        );

        if (isPartiallyRefunded) {
            return {
                success: false,
                code: 'PARTIAL_REFUND_NOT_SUPPORTED',
                message: 'Les remboursements partiels ne sont pas supportés par le parcours de compensation intégrale P28c.',
                providerStatus: fedaTx ? fedaTx.status : 'UNKNOWN'
            };
        }

        // Vérification du statut intégralement remboursé
        const isFullyRefunded = fedaTx && (
            fedaTx.status === 'refunded' ||
            fedaTx.status === 'transferred_refunded' ||
            (typeof fedaTx.wasRefunded === 'function' && fedaTx.wasRefunded() && !fedaTx.status.includes('partially'))
        );

        if (!isFullyRefunded) {
            return {
                success: false,
                code: 'TRANSACTION_NOT_REFUNDED_ON_PROVIDER',
                message: 'La transaction n\'est pas marquée comme intégralement remboursée auprès de FedaPay.',
                providerStatus: fedaTx ? fedaTx.status : 'UNKNOWN'
            };
        }

        // Concordance stricte de montant
        if (fedaTx.amount !== undefined && fedaTx.amount !== null) {
            const remoteAmount = Number(fedaTx.amount);
            const expectedAmount = Number(paymentIntent.expected_amount);
            if (Number.isFinite(remoteAmount) && remoteAmount !== expectedAmount) {
                return {
                    success: false,
                    code: 'PROVIDER_AMOUNT_MISMATCH',
                    message: `Incohérence de montant : la transaction FedaPay indique ${remoteAmount} alors que l'intention attendait ${expectedAmount}.`
                };
            }
        }

        // Concordance stricte de devise
        if (fedaTx.currency) {
            const remoteIso = typeof fedaTx.currency === 'object' && fedaTx.currency ? fedaTx.currency.iso : fedaTx.currency;
            if (remoteIso && paymentIntent.expected_currency && remoteIso.toUpperCase() !== paymentIntent.expected_currency.toUpperCase()) {
                return {
                    success: false,
                    code: 'PROVIDER_CURRENCY_MISMATCH',
                    message: `Incohérence de devise : la transaction FedaPay est en ${remoteIso} alors que l'intention est en ${paymentIntent.expected_currency}.`
                };
            }
        }
    }

    // 4. Appel de la RPC transactionnelle certifiée
    const { data: rpcResult, error: rpcErr } = await supabase.rpc('admin_process_parent_pack_refund', {
        p_period_id: periodId,
        p_provider_refund_id: cleanRefundId,
        p_admin_actor_id: adminActorId,
        p_reason: reason
    });

    if (rpcErr) {
        if (rpcErr.message && rpcErr.message.includes('ALREADY_REFUNDED')) {
            return {
                success: true,
                code: 'ALREADY_REFUNDED',
                message: 'Cette période d\'abonnement a déjà été remboursée.'
            };
        }
        if (rpcErr.message && rpcErr.message.includes('DUPLICATE_PROVIDER_REFUND_ID')) {
            return {
                success: false,
                code: 'DUPLICATE_PROVIDER_REFUND_ID',
                message: 'Cette référence de remboursement a déjà été utilisée pour un autre remboursement.'
            };
        }
        if (rpcErr.message && rpcErr.message.includes('FORBIDDEN_NOT_SUPERADMIN')) {
            return {
                success: false,
                code: 'FORBIDDEN_NOT_SUPERADMIN',
                message: 'Action réservée exclusivement aux administrateurs autorisés.'
            };
        }
        return {
            success: false,
            code: 'REFUND_RPC_ERROR',
            message: rpcErr.message
        };
    }

    return {
        success: true,
        code: 'REFUND_COMPLETED',
        data: rpcResult
    };
}

module.exports = {
    ACCESS_STATES,
    getAccessStatesForGlobalIds,
    resolveGlobalIds,
    getAccessStatesForLocalIds,
    verifyParentPackRefundStatus,
    refundParentPackSubscriptionAdmin
};
