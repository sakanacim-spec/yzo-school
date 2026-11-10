const crypto = require('crypto');
const { supabase } = require('../utils/supabase');
const {
    verifyRefundProofAuthorization,
    parsePrivateRefundProofUri,
    verifyRefundProofBytes,
    storeRefundProofDocument,
    readAndVerifyStoredRefundProof
} = require('./refundProofStorage');

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
const INTERNAL_RECONCILIATION_REF_REGEX = /^rec_[a-zA-Z0-9_-]{6,120}$/;
const PRIVATE_STORAGE_PATH_REGEX = /^private:\/\/[a-zA-Z0-9._/-]{8,}$/;
const SHA256_HEX_REGEX = /^[a-fA-F0-9]{64}$/;

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
 * Inspecte la période, la souscription, le payment_intent et vérifie auprès de FedaPay
 * que la transaction d'origine existe, est au statut 'refunded' (non partiel) et correspond
 * au montant et à la devise attendus.
 */
async function inspectAndVerifyFedaPayRefundContext(periodId, fedapayClient = null) {
    if (!periodId || !UUID_REGEX.test(periodId)) {
        return { success: false, code: 'INVALID_PERIOD_ID', message: 'Identifiant de période invalide.' };
    }

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
        return {
            success: true,
            alreadyRefunded: true,
            periodId,
            period
        };
    }

    if (!period.payment_intent_id) {
        return { success: false, code: 'PAYMENT_INTENT_NOT_FOUND', message: 'Intention de paiement introuvable pour cette période.' };
    }

    const { data: subscription, error: subErr } = await supabase
        .from('parent_subscriptions')
        .select('id, parent_ref, school_slug, status')
        .eq('id', period.subscription_id)
        .maybeSingle();

    if (subErr) throw subErr;
    if (!subscription) {
        return { success: false, code: 'SUBSCRIPTION_NOT_FOUND', message: 'Souscription introuvable.' };
    }

    const { data: paymentIntent, error: piErr } = await supabase
        .from('payment_intents')
        .select('id, status, provider_transaction_id, expected_amount, expected_currency, processed_at')
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

    if (!paymentIntent.provider_transaction_id || typeof paymentIntent.provider_transaction_id !== 'string' || paymentIntent.provider_transaction_id.trim() === '') {
        return {
            success: false,
            code: 'NO_PROVIDER_TX_ID',
            message: 'Aucun identifiant de transaction externe (FedaPay) associé à cette intention de paiement.'
        };
    }

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
            fedaTx = await Transaction.retrieve(paymentIntent.provider_transaction_id);
        } catch (fedaErr) {
            return {
                success: false,
                code: 'PROVIDER_API_ERROR',
                message: `Impossible de vérifier la transaction FedaPay : ${fedaErr.message || 'Erreur API'}`
            };
        }
    }

    if (!fedaTx) {
        return {
            success: false,
            code: 'PROVIDER_TRANSACTION_NOT_FOUND',
            message: 'Transaction FedaPay introuvable.'
        };
    }

    if (fedaTx.id !== undefined && fedaTx.id !== null && String(fedaTx.id).trim() !== String(paymentIntent.provider_transaction_id).trim()) {
        return {
            success: false,
            code: 'PROVIDER_TRANSACTION_MISMATCH',
            message: `L'identifiant de transaction retourné par FedaPay (${fedaTx.id}) ne correspond pas à la transaction d'origine (${paymentIntent.provider_transaction_id}).`
        };
    }

    const isPartiallyRefunded = (
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

    const isFullyRefunded = (
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

    if (fedaTx.amount === undefined || fedaTx.amount === null) {
        return {
            success: false,
            code: 'PROVIDER_AMOUNT_MISSING',
            message: 'Montant absent de la transaction FedaPay.'
        };
    }
    const remoteAmount = Number(fedaTx.amount);
    const expectedAmount = Number(paymentIntent.expected_amount);
    if (!Number.isFinite(remoteAmount) || remoteAmount !== expectedAmount) {
        return {
            success: false,
            code: 'PROVIDER_AMOUNT_MISMATCH',
            message: `Incohérence de montant : la transaction FedaPay indique ${remoteAmount} alors que l'intention attendait ${expectedAmount}.`
        };
    }

    if (!fedaTx.currency) {
        return {
            success: false,
            code: 'PROVIDER_CURRENCY_MISSING',
            message: 'Devise absente de la transaction FedaPay.'
        };
    }
    const remoteIso = typeof fedaTx.currency === 'object' && fedaTx.currency ? fedaTx.currency.iso : fedaTx.currency;
    if (!remoteIso || !paymentIntent.expected_currency || String(remoteIso).toUpperCase() !== String(paymentIntent.expected_currency).toUpperCase()) {
        return {
            success: false,
            code: 'PROVIDER_CURRENCY_MISMATCH',
            message: `Incohérence de devise : la transaction FedaPay est en ${remoteIso} alors que l'intention est en ${paymentIntent.expected_currency}.`
        };
    }

    return {
        success: true,
        alreadyRefunded: false,
        period,
        subscription,
        paymentIntent,
        verifiedTransactionId: String(paymentIntent.provider_transaction_id).trim(),
        verifiedProviderStatus: 'refunded',
        verifiedAmountMinor: expectedAmount,
        verifiedCurrency: String(paymentIntent.expected_currency).toUpperCase()
    };
}

/**
 * Valide de manière fail-closed le justificatif indépendant de remboursement.
 * Même si deux SuperAdmins distincts signent, toute absence, contradiction ou
 * incohérence du justificatif bloque immédiatement l'opération.
 *
 * Chantier D.1 :
 * - Calcul systématique du SHA-256 côté serveur sur les octets réels (`fileBuffer` / `rawContent`).
 * - Vérification stricte de la taille (16 octets à 5 Mo) et de la signature binaire réelle (PDF, PNG, JPEG, WEBP).
 * - Interdiction de faire confiance à un simple chemin `private://...` ou à un hash envoyé par l'administrateur
 *   sans vérification binaire côté serveur.
 */
function validateIndependentRefundProof({ proof, paymentIntent, subscription, options = {} }) {
    if (!proof || typeof proof !== 'object') {
        return {
            valid: false,
            code: 'SECURITY_BLOCKER',
            message: 'SECURITY_BLOCKER: Justificatif de remboursement absent. Aucune compensation financière automatique n\'est autorisée sans preuve vérifiée.'
        };
    }

    const rawBinaryContent = proof.fileBuffer !== undefined && proof.fileBuffer !== null
        ? proof.fileBuffer
        : proof.rawContent;
    const hasBinaryContent = rawBinaryContent !== undefined && rawBinaryContent !== null;

    const rawStoragePath = typeof (proof.storagePath ?? proof.proofStoragePath) === 'string'
        ? (proof.storagePath ?? proof.proofStoragePath).trim()
        : '';

    if (rawStoragePath !== '') {
        if (!PRIVATE_STORAGE_PATH_REGEX.test(rawStoragePath)) {
            return {
                valid: false,
                code: 'INVALID_PROOF_STORAGE_PATH',
                message: 'Le chemin de conservation du justificatif est absent ou invalide (format attendu : private://refund-proofs/...).'
            };
        }
        const parsedUri = parsePrivateRefundProofUri(rawStoragePath);
        if (!parsedUri.valid) {
            return {
                valid: false,
                code: parsedUri.code,
                message: parsedUri.message
            };
        }
    } else if (!hasBinaryContent) {
        return {
            valid: false,
            code: 'INVALID_PROOF_STORAGE_PATH',
            message: 'Le chemin de conservation du justificatif est absent ou invalide (format attendu : private://refund-proofs/...).'
        };
    }

    const declaredHash = typeof (proof.documentHash ?? proof.proofDocumentHash) === 'string'
        ? (proof.documentHash ?? proof.proofDocumentHash).trim().toLowerCase()
        : '';

    if (declaredHash !== '' && !SHA256_HEX_REGEX.test(declaredHash)) {
        return {
            valid: false,
            code: 'INVALID_PROOF_HASH',
            message: 'L\'empreinte cryptographique SHA-256 du justificatif est absente ou invalide.'
        };
    }

    let serverVerifiedHash = null;
    let byteCheck = null;
    let requiresStorageReadVerification = false;

    if (hasBinaryContent) {
        byteCheck = verifyRefundProofBytes(rawBinaryContent, {
            expectedDocumentHash: declaredHash || null,
            mimeType: proof.mimeType || null,
            originalFilename: proof.originalFilename || null,
            storagePath: rawStoragePath || null
        });
        if (!byteCheck.valid) {
            return {
                valid: false,
                code: byteCheck.code,
                message: byteCheck.message
            };
        }
        serverVerifiedHash = byteCheck.documentHash;
    } else {
        if (!declaredHash) {
            return {
                valid: false,
                code: 'INVALID_PROOF_HASH',
                message: 'L\'empreinte cryptographique SHA-256 du justificatif est absente ou invalide.'
            };
        }
        if (options.allowPreUploadedLookup !== true) {
            return {
                valid: false,
                code: 'PROOF_CONTENT_UNVERIFIED',
                message: 'SECURITY_BLOCKER: Le contenu binaire réel du justificatif est absent. Le serveur ne fait jamais confiance à un simple chemin private://... ou à un hash déclaré sans vérification binaire serveur.'
            };
        }
        serverVerifiedHash = declaredHash;
        requiresStorageReadVerification = true;
    }

    const rawAmount = proof.refundedAmountMinor ?? proof.proofRefundedAmountMinor;
    const refundedAmountMinor = Number(rawAmount);
    const expectedAmount = Number(paymentIntent.expected_amount);
    if (rawAmount === undefined || rawAmount === null || !Number.isInteger(refundedAmountMinor) || refundedAmountMinor <= 0 || refundedAmountMinor !== expectedAmount) {
        return {
            valid: false,
            code: 'PROOF_AMOUNT_MISMATCH',
            message: `Le montant remboursé sur le justificatif (${rawAmount}) ne correspond pas au montant de la transaction (${expectedAmount}).`
        };
    }

    const currency = typeof (proof.currency ?? proof.proofCurrency) === 'string'
        ? (proof.currency ?? proof.proofCurrency).trim().toUpperCase()
        : '';
    const expectedCurrency = String(paymentIntent.expected_currency || '').trim().toUpperCase();
    if (!currency || currency !== expectedCurrency || currency !== 'XOF') {
        return {
            valid: false,
            code: 'PROOF_CURRENCY_MISMATCH',
            message: `La devise du justificatif (${currency || 'ABSENTE'}) ne correspond pas à la devise attendue (${expectedCurrency}).`
        };
    }

    const beneficiaryRef = typeof (proof.beneficiaryRef ?? proof.proofBeneficiaryRef) === 'string'
        ? (proof.beneficiaryRef ?? proof.proofBeneficiaryRef).trim()
        : '';
    if (!beneficiaryRef || beneficiaryRef !== String(subscription.parent_ref || '').trim()) {
        return {
            valid: false,
            code: 'PROOF_BENEFICIARY_MISMATCH',
            message: `Le bénéficiaire du justificatif (${beneficiaryRef || 'ABSENT'}) ne correspond pas au parent titulaire (${subscription.parent_ref}).`
        };
    }

    const rawRefundedAt = proof.refundedAt ?? proof.proofRefundedAt;
    const parsedRefundedAt = rawRefundedAt ? new Date(rawRefundedAt) : null;
    const parsedProcessedAt = paymentIntent.processed_at ? new Date(paymentIntent.processed_at) : null;
    if (
        !parsedRefundedAt ||
        Number.isNaN(parsedRefundedAt.getTime()) ||
        (parsedProcessedAt && parsedRefundedAt.getTime() < parsedProcessedAt.getTime()) ||
        parsedRefundedAt.getTime() > Date.now() + 5 * 60 * 1000
    ) {
        return {
            valid: false,
            code: 'PROOF_DATE_INVALID',
            message: 'La date du remboursement attestée sur le justificatif est absente, antérieure au paiement initial ou dans le futur.'
        };
    }

    return {
        valid: true,
        requiresStorageWrite: hasBinaryContent,
        requiresStorageReadVerification,
        detectedFormat: byteCheck ? byteCheck.format : null,
        detectedMimeType: byteCheck ? byteCheck.mimeType : null,
        byteLength: byteCheck ? byteCheck.byteLength : null,
        normalizedProof: {
            proofStoragePath: rawStoragePath || null,
            proofDocumentHash: serverVerifiedHash,
            proofRefundedAmountMinor: refundedAmountMinor,
            proofCurrency: currency,
            proofBeneficiaryRef: beneficiaryRef,
            proofRefundedAt: parsedRefundedAt.toISOString()
        }
    };
}

function mapReconciliationRpcError(rpcErr) {
    const msg = rpcErr?.message || 'Erreur RPC inconnue';
    const knownCodes = [
        'SECURITY_BLOCKER',
        'DUAL_CUSTODY_VIOLATION',
        'UNAUTHORIZED_ADMIN',
        'PERIOD_NOT_FOUND',
        'RECONCILIATION_NOT_FOUND',
        'RECONCILIATION_ALREADY_PENDING',
        'INVALID_RECONCILIATION_STATUS',
        'INVALID_PERIOD_STATUS',
        'INTENT_NOT_COMPLETED',
        'PROOF_TRANSACTION_MISMATCH',
        'PROVIDER_STATUS_NOT_REFUNDED',
        'PROOF_AMOUNT_MISMATCH',
        'PROOF_CURRENCY_MISMATCH',
        'PROOF_BENEFICIARY_MISMATCH',
        'PROOF_DATE_INVALID',
        'INVALID_PROOF_STORAGE_PATH',
        'INVALID_PROOF_HASH',
        'INVALID_PROOF_ARTIFACT',
        'INVALID_INTERNAL_RECONCILIATION_REF',
        'INVALID_PROVIDER_REFUND_ID',
        'DUPLICATE_PROVIDER_REFUND_ID'
    ];
    for (const code of knownCodes) {
        if (msg.includes(code)) {
            return {
                success: false,
                code: code === 'UNAUTHORIZED_ADMIN' ? 'FORBIDDEN_NOT_SUPERADMIN' : code,
                message: msg
            };
        }
    }
    return {
        success: false,
        code: 'REFUND_RPC_ERROR',
        message: msg
    };
}

/**
 * Étape 1 du rapprochement à double validation :
 * Crée un dossier de rapprochement (status = 'pending_approval') par un premier SuperAdmin authentifié.
 * Chantier D.1 : Stocke le justificatif dans un emplacement privé (`refund-proofs`, `upsert: false`)
 * après validation binaire stricte et calcul serveur du SHA-256, ou vérifie l'intégrité du fichier
 * réellement stocké avant toute écriture en base.
 */
async function createParentPackRefundReconciliationRequest({
    periodId,
    initiatorAdminId,
    actorRole = 'superadmin',
    reason = 'Remboursement administratif Parent Pack',
    proof,
    internalReconciliationRef = null,
    providerRefundId = null,
    fedapayClient = null,
    storageClient = null
}) {
    if (!periodId || !UUID_REGEX.test(periodId)) {
        return { success: false, code: 'INVALID_PERIOD_ID', message: 'Identifiant de période invalide.' };
    }
    if (!initiatorAdminId || !UUID_REGEX.test(initiatorAdminId)) {
        return { success: false, code: 'INVALID_ADMIN_ACTOR_ID', message: 'Identifiant du SuperAdmin initiateur invalide.' };
    }
    if (!reason || typeof reason !== 'string' || reason.trim() === '') {
        return { success: false, code: 'INVALID_REASON', message: 'Le motif du remboursement est obligatoire.' };
    }

    // Protection contre l'usurpation déclarative :
    // Le rôle de l'administrateur provient EXCLUSIVEMENT du contexte serveur authentifié (actorRole),
    // JAMAIS d'un attribut déclaratif dans l'objet proof ou req.body.
    if (proof && typeof proof === 'object' && proof.actorRole !== undefined && proof.actorRole !== actorRole) {
        return {
            success: false,
            code: 'UNAUTHORIZED_PROOF_STORAGE_ACCESS',
            message: 'Accès refusé au stockage des justificatifs : tentative d\'usurpation du rôle déclaratif dans les données du justificatif.'
        };
    }

    const authCheck = verifyRefundProofAuthorization({
        actorAdminId: initiatorAdminId,
        actorRole
    });
    if (!authCheck.authorized) {
        return {
            success: false,
            code: authCheck.code,
            message: authCheck.message
        };
    }

    let cleanProviderRefundId = null;
    if (providerRefundId !== null && providerRefundId !== undefined && String(providerRefundId).trim() !== '') {
        cleanProviderRefundId = String(providerRefundId).trim();
        if (!PROVIDER_REFUND_ID_REGEX.test(cleanProviderRefundId)) {
            return {
                success: false,
                code: 'INVALID_PROVIDER_REFUND_ID_FORMAT',
                message: 'Référence fournisseur de remboursement invalide.'
            };
        }
    }

    let cleanInternalRef = null;
    if (internalReconciliationRef !== null && internalReconciliationRef !== undefined && String(internalReconciliationRef).trim() !== '') {
        cleanInternalRef = String(internalReconciliationRef).trim();
        if (!INTERNAL_RECONCILIATION_REF_REGEX.test(cleanInternalRef)) {
            return {
                success: false,
                code: 'INVALID_INTERNAL_RECONCILIATION_REF',
                message: 'Identifiant interne de rapprochement invalide (format attendu : rec_...).'
            };
        }
    }

    const context = await inspectAndVerifyFedaPayRefundContext(periodId, fedapayClient);
    if (!context.success) {
        return context;
    }
    if (context.alreadyRefunded) {
        return {
            success: true,
            code: 'ALREADY_REFUNDED',
            message: 'Cette période d\'abonnement a déjà été remboursée.',
            period_id: periodId
        };
    }

    const proofValidation = validateIndependentRefundProof({
        proof,
        paymentIntent: context.paymentIntent,
        subscription: context.subscription,
        options: { allowPreUploadedLookup: true }
    });
    if (!proofValidation.valid) {
        return {
            success: false,
            code: proofValidation.code,
            message: proofValidation.message
        };
    }

    let finalStoragePath = proofValidation.normalizedProof.proofStoragePath;
    let finalDocumentHash = proofValidation.normalizedProof.proofDocumentHash;

    if (proofValidation.requiresStorageWrite) {
        const rawBinaryContent = proof.fileBuffer !== undefined && proof.fileBuffer !== null
            ? proof.fileBuffer
            : proof.rawContent;
        const storeRes = await storeRefundProofDocument({
            periodId,
            actorAdminId: initiatorAdminId,
            actorRole,
            fileBuffer: rawBinaryContent,
            claimedDocumentHash: proof.documentHash ?? proof.proofDocumentHash ?? null,
            storagePath: finalStoragePath,
            mimeType: proof.mimeType ?? null,
            originalFilename: proof.originalFilename ?? null,
            storageClient
        });
        if (!storeRes.success) {
            return {
                success: false,
                code: storeRes.code,
                message: storeRes.message
            };
        }
        finalStoragePath = storeRes.storagePath;
        finalDocumentHash = storeRes.documentHash;
    } else if (proofValidation.requiresStorageReadVerification) {
        const readRes = await readAndVerifyStoredRefundProof({
            storagePath: finalStoragePath,
            expectedDocumentHash: finalDocumentHash,
            periodId,
            actorAdminId: initiatorAdminId,
            actorRole,
            phase: 'init',
            storageClient
        });
        if (!readRes.valid) {
            return {
                success: false,
                code: readRes.code,
                message: readRes.message
            };
        }
        finalStoragePath = readRes.storagePath;
        finalDocumentHash = readRes.documentHash;
    }

    const { executeCreateRefundReconciliationRpc } = require('./refundRpc.cjs');
    const { result, error } = await executeCreateRefundReconciliationRpc({
        periodId,
        initiatorAdminId,
        reason: reason.trim(),
        verifiedTransactionId: context.verifiedTransactionId,
        verifiedProviderStatus: context.verifiedProviderStatus,
        verifiedAmountMinor: context.verifiedAmountMinor,
        verifiedCurrency: context.verifiedCurrency,
        proofStoragePath: finalStoragePath,
        proofDocumentHash: finalDocumentHash,
        proofRefundedAmountMinor: proofValidation.normalizedProof.proofRefundedAmountMinor,
        proofCurrency: proofValidation.normalizedProof.proofCurrency,
        proofBeneficiaryRef: proofValidation.normalizedProof.proofBeneficiaryRef,
        proofRefundedAt: proofValidation.normalizedProof.proofRefundedAt,
        internalReconciliationRef: cleanInternalRef,
        providerRefundId: cleanProviderRefundId
    });

    if (error) {
        return mapReconciliationRpcError(error);
    }

    if (result && result.status === 'already_refunded') {
        return {
            success: true,
            code: 'ALREADY_REFUNDED',
            message: 'Cette période d\'abonnement a déjà été remboursée.',
            data: result
        };
    }

    return {
        success: true,
        code: 'RECONCILIATION_PENDING_APPROVAL',
        data: result
    };
}

/**
 * Étape 2 du rapprochement à double validation :
 * Approuve un dossier de rapprochement existant par un second SuperAdmin distinct
 * après contre-vérification FedaPay, relecture du fichier réellement stocké et
 * recalcul serveur du SHA-256 (Chantier D.1), puis tente la compensation financière.
 */
async function approveAndExecuteParentPackRefundReconciliation({
    reconciliationId,
    periodId = null,
    approverAdminId,
    actorRole = 'superadmin',
    approvalNotes = null,
    fedapayClient = null,
    storageClient = null
}) {
    if (!reconciliationId || !UUID_REGEX.test(reconciliationId)) {
        return { success: false, code: 'INVALID_RECONCILIATION_ID', message: 'Identifiant de dossier de rapprochement invalide.' };
    }
    if (!approverAdminId || !UUID_REGEX.test(approverAdminId)) {
        return { success: false, code: 'INVALID_APPROVER_ADMIN_ID', message: 'Identifiant du second SuperAdmin approbateur invalide.' };
    }

    const authCheck = verifyRefundProofAuthorization({
        actorAdminId: approverAdminId,
        actorRole
    });
    if (!authCheck.authorized) {
        return {
            success: false,
            code: authCheck.code,
            message: authCheck.message
        };
    }

    const {
        executeGetRefundReconciliationRpc,
        executeApproveRefundReconciliationRpc
    } = require('./refundRpc.cjs');

    const { result: dossier, error: getErr } = await executeGetRefundReconciliationRpc({ reconciliationId });
    if (getErr) {
        return mapReconciliationRpcError(getErr);
    }
    if (!dossier) {
        return {
            success: false,
            code: 'RECONCILIATION_NOT_FOUND',
            message: 'Dossier de rapprochement introuvable.'
        };
    }

    if (periodId && dossier.period_id !== periodId) {
        return {
            success: false,
            code: 'RECONCILIATION_PERIOD_MISMATCH',
            message: 'Le dossier de rapprochement ne correspond pas à la période indiquée.'
        };
    }

    if (String(dossier.initiator_admin_id).toLowerCase() === String(approverAdminId).toLowerCase()) {
        return {
            success: false,
            code: 'DUAL_CUSTODY_VIOLATION',
            message: 'Séparation des tâches violée : le second SuperAdmin approbateur doit être strictement distinct du SuperAdmin initiateur.'
        };
    }

    const context = await inspectAndVerifyFedaPayRefundContext(dossier.period_id, fedapayClient);
    if (!context.success) {
        return context;
    }

    // Chantier D.1 : Relecture du fichier réellement stocké et recalcul serveur du SHA-256 avant toute approbation
    const storedProofCheck = await readAndVerifyStoredRefundProof({
        storagePath: dossier.proof_storage_path,
        expectedDocumentHash: dossier.proof_document_hash,
        periodId: dossier.period_id,
        reconciliationId,
        actorAdminId: approverAdminId,
        actorRole,
        phase: 'approve',
        storageClient
    });
    if (!storedProofCheck.valid) {
        return {
            success: false,
            code: storedProofCheck.code,
            message: storedProofCheck.message
        };
    }

    // Si la période est déjà remboursée, on laisse la RPC SQL retourner l'état idempotent après ses contrôles
    const verifiedTransactionId = context.alreadyRefunded
        ? dossier.provider_transaction_id
        : context.verifiedTransactionId;
    const verifiedProviderStatus = context.alreadyRefunded
        ? 'refunded'
        : context.verifiedProviderStatus;
    const verifiedAmountMinor = context.alreadyRefunded
        ? Number(dossier.verified_amount_minor)
        : context.verifiedAmountMinor;
    const verifiedCurrency = context.alreadyRefunded
        ? dossier.verified_currency
        : context.verifiedCurrency;

    const { result, error } = await executeApproveRefundReconciliationRpc({
        reconciliationId,
        approverAdminId,
        verifiedTransactionId,
        verifiedProviderStatus,
        verifiedAmountMinor,
        verifiedCurrency,
        approvalNotes
    });

    if (error) {
        return mapReconciliationRpcError(error);
    }

    if (result && result.status === 'already_refunded') {
        return {
            success: true,
            code: 'ALREADY_REFUNDED',
            message: 'Cette période d\'abonnement a déjà été remboursée.',
            data: result
        };
    }

    return {
        success: true,
        code: 'REFUND_COMPLETED',
        data: result
    };
}

/**
 * P28c: Point d'entrée de remboursement administratif Parent Pack.
 * - Effectue d'abord tous les contrôles fail-closed sur la période, l'intention et FedaPay.
 * - Verrouillé définitivement en mode fail-closed (SECURITY_BLOCKER) :
 *   aucune compensation financière automatique ne peut être déclenchée par cet appel,
 *   et aucun enchaînement interne entre initiation et approbation n'est autorisé
 *   (même si approverAdminId, reconciliationId ou un justificatif sont fournis).
 */
async function refundParentPackSubscriptionAdmin({
    periodId,
    providerRefundId = null,
    adminActorId,
    reconciliationId = null,
    proof = null,
    fedapayClient = null
}) {
    if (!periodId || !UUID_REGEX.test(periodId)) {
        return { success: false, code: 'INVALID_PERIOD_ID', message: 'Identifiant de période invalide.' };
    }
    if (!adminActorId || !UUID_REGEX.test(adminActorId)) {
        return { success: false, code: 'INVALID_ADMIN_ACTOR_ID', message: 'Identifiant d\'administrateur invalide.' };
    }

    // Si providerRefundId est transmis (ou si l'appel est un appel déclaratif classique), valider son format
    if (providerRefundId !== null && providerRefundId !== undefined) {
        if (typeof providerRefundId !== 'string' || !PROVIDER_REFUND_ID_REGEX.test(providerRefundId.trim())) {
            return {
                success: false,
                code: 'INVALID_PROVIDER_REFUND_ID_FORMAT',
                message: 'Référence du remboursement fournisseur invalide. Format attendu : préfixe ref_, fedapay_, feda_ ou tx_ suivi d\'au moins 6 caractères alphanumériques.'
            };
        }
    } else if (!reconciliationId && !proof) {
        return {
            success: false,
            code: 'INVALID_PROVIDER_REFUND_ID_FORMAT',
            message: 'Référence du remboursement fournisseur ou dossier de rapprochement obligatoire.'
        };
    }

    // 1–3. Contrôles d'existence, d'intention et vérification FedaPay fail-closed
    const context = await inspectAndVerifyFedaPayRefundContext(periodId, fedapayClient);
    if (!context.success) {
        return context;
    }

    if (context.alreadyRefunded) {
        return {
            success: true,
            code: 'ALREADY_REFUNDED',
            message: 'Cette période d\'abonnement a déjà été remboursée.',
            period_id: periodId
        };
    }

    // 4. Protection FAIL-CLOSED définitive (Mission 1) :
    // Suppression de toute possibilité d'enchaîner l'initiation et l'approbation dans un même appel interne.
    return {
        success: false,
        code: 'SECURITY_BLOCKER',
        message: 'SECURITY_BLOCKER: La compensation financière via refundParentPackSubscriptionAdmin est désactivée (fail-closed). Il est strictement interdit d\'enchaîner l\'initiation et l\'approbation dans un même appel interne.'
    };
}

module.exports = {
    ACCESS_STATES,
    getAccessStatesForGlobalIds,
    resolveGlobalIds,
    getAccessStatesForLocalIds,
    verifyParentPackRefundStatus,
    validateIndependentRefundProof,
    createParentPackRefundReconciliationRequest,
    approveAndExecuteParentPackRefundReconciliation,
    refundParentPackSubscriptionAdmin
};