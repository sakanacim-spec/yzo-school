'use strict';

const crypto = require('crypto');
const { isValidUUID } = require('../utils/helpers');

/**
 * Chantier D.2 (P28c) — Autorité d'émission et de validation locale des preuves
 * d'action cryptographiques pour la double validation SuperAdmin des remboursements.
 *
 * Objectif de sécurité :
 *   Même si un attaquant obtient YZIOW_REFUND_DATABASE_URL, il ne peut pas approuver
 *   un remboursement en fournissant simplement deux UUID appartenant à des SuperAdmins.
 *   Chaque administrateur doit disposer d'une preuve d'action personnelle, indépendante,
 *   signée cryptographiquement (HMAC-SHA256), à durée de validité limitée (5 minutes),
 *   liée au dossier exact (période, transaction, montant, devise, hash de preuve)
 *   et consommée de manière atomique à usage unique (anti-rejeu).
 */

const DEFAULT_REFUND_ACTION_AUTH_KEY = 'yziow_refund_action_auth_secret_default_testing_key_2026';
const ACTION_PROOF_VERSION = '1.0';
const ACTION_PROOF_ISSUER = 'yziow-refund-auth-authority';
const MAX_PROOF_VALIDITY_SECONDS = 300; // 5 minutes max

function getActiveAuthoritySecretKey(customKey = null) {
    if (customKey && typeof customKey === 'string' && customKey.trim() !== '') {
        return customKey.trim();
    }
    const envKey = process.env.YZIOW_REFUND_AUTH_AUTHORITY_SECRET || process.env.YZIOW_REFUND_ACTION_AUTH_KEY;
    if (envKey && typeof envKey === 'string' && envKey.trim() !== '') {
        return envKey.trim();
    }
    const isTestExplicitlyAuthorized =
        process.env.NODE_ENV === 'test' &&
        (process.env.P28B_ALLOW_DISPOSABLE_DB === 'true' || process.env.P28C_ALLOW_DISPOSABLE_DB === 'true');

    if (isTestExplicitlyAuthorized) {
        return DEFAULT_REFUND_ACTION_AUTH_KEY;
    }

    throw new Error('AUTHORITY_SECRET_NOT_CONFIGURED: La variable d\'environnement YZIOW_REFUND_AUTH_AUTHORITY_SECRET doit être explicitement configurée (aucune clé par défaut autorisée hors tests unitaires/jetables explicites).');
}

/**
 * Construit la chaîne canonique normalisée pour la signature cryptographique.
 * Ordre strict : v1|action_type|admin_id|period_id|reconciliation_id|provider_transaction_id|verified_amount_minor|currency|proof_document_hash|issued_at|expires_at|jti
 */
function buildCanonicalActionPayload({
    actionType,
    adminId,
    periodId,
    reconciliationId = null,
    providerTransactionId,
    verifiedAmountMinor,
    currency,
    proofDocumentHash,
    issuedAt,
    expiresAt,
    jti
}) {
    const cleanActionType = String(actionType || '').trim();
    const cleanAdminId = String(adminId || '').trim().toLowerCase();
    const cleanPeriodId = String(periodId || '').trim().toLowerCase();
    const cleanRecId = reconciliationId ? String(reconciliationId).trim().toLowerCase() : '';
    const cleanTxId = String(providerTransactionId || '').trim();
    const cleanAmount = String(Number(verifiedAmountMinor));
    const cleanCurrency = String(currency || '').trim().toUpperCase();
    const cleanDocHash = String(proofDocumentHash || '').trim().toLowerCase();
    const cleanIssuedAt = String(issuedAt || '').trim();
    const cleanExpiresAt = String(expiresAt || '').trim();
    const cleanJti = String(jti || '').trim().toLowerCase();

    return [
        'v1',
        cleanActionType,
        cleanAdminId,
        cleanPeriodId,
        cleanRecId,
        cleanTxId,
        cleanAmount,
        cleanCurrency,
        cleanDocHash,
        cleanIssuedAt,
        cleanExpiresAt,
        cleanJti
    ].join('|');
}

/**
 * Génère une preuve d'action cryptographique signée pour un SuperAdmin authentifié.
 */
function generateRefundActionProof({
    adminId,
    actionType, // 'initiate' ou 'approve'
    periodId,
    reconciliationId = null,
    providerTransactionId,
    verifiedAmountMinor,
    currency = 'XOF',
    proofDocumentHash,
    secretKey = null,
    expiresInSeconds = MAX_PROOF_VALIDITY_SECONDS,
    jti = null,
    issuedAt = null,
    expiresAt = null,
    issuer = ACTION_PROOF_ISSUER,
    version = ACTION_PROOF_VERSION
}) {
    if (!adminId || !isValidUUID(adminId)) {
        throw new Error('INVALID_ACTION_PROOF_ADMIN_ID: UUID adminId valide requis');
    }
    if (actionType !== 'initiate' && actionType !== 'approve') {
        throw new Error('INVALID_ACTION_TYPE: actionType doit valoir "initiate" ou "approve"');
    }
    if (!periodId || !isValidUUID(periodId)) {
        throw new Error('INVALID_ACTION_PROOF_PERIOD_ID: UUID periodId valide requis');
    }
    if (actionType === 'approve' && (!reconciliationId || !isValidUUID(reconciliationId))) {
        throw new Error('INVALID_ACTION_PROOF_RECONCILIATION_ID: UUID reconciliationId valide requis pour approbation');
    }
    if (!providerTransactionId || typeof providerTransactionId !== 'string') {
        throw new Error('INVALID_ACTION_PROOF_TRANSACTION_ID: providerTransactionId requis');
    }
    const amountMinor = Number(verifiedAmountMinor);
    if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
        throw new Error('INVALID_ACTION_PROOF_AMOUNT: verifiedAmountMinor entier positif requis');
    }
    if (!currency || typeof currency !== 'string') {
        throw new Error('INVALID_ACTION_PROOF_CURRENCY: currency requis');
    }
    if (!proofDocumentHash || !/^[a-fA-F0-9]{64}$/.test(proofDocumentHash.trim())) {
        throw new Error('INVALID_ACTION_PROOF_DOC_HASH: proofDocumentHash SHA-256 valide requis');
    }

    const effectiveJti = jti ? String(jti).trim().toLowerCase() : crypto.randomUUID();
    if (!isValidUUID(effectiveJti)) {
        throw new Error('INVALID_ACTION_PROOF_JTI: jti UUID valide requis');
    }

    const now = new Date();
    const effectiveIssuedAt = issuedAt ? new Date(issuedAt).toISOString() : now.toISOString();
    const effectiveExpiresAt = expiresAt
        ? new Date(expiresAt).toISOString()
        : new Date(new Date(effectiveIssuedAt).getTime() + expiresInSeconds * 1000).toISOString();

    const canonical = buildCanonicalActionPayload({
        actionType,
        adminId,
        periodId,
        reconciliationId,
        providerTransactionId,
        verifiedAmountMinor: amountMinor,
        currency: currency.trim().toUpperCase(),
        proofDocumentHash: proofDocumentHash.trim().toLowerCase(),
        issuedAt: effectiveIssuedAt,
        expiresAt: effectiveExpiresAt,
        jti: effectiveJti
    });

    const activeSecret = getActiveAuthoritySecretKey(secretKey);
    const signature = crypto.createHmac('sha256', activeSecret).update(canonical, 'utf8').digest('hex').toLowerCase();

    return {
        version,
        issuer,
        action_type: actionType,
        admin_id: String(adminId).toLowerCase(),
        period_id: String(periodId).toLowerCase(),
        reconciliation_id: reconciliationId ? String(reconciliationId).toLowerCase() : null,
        provider_transaction_id: String(providerTransactionId).trim(),
        verified_amount_minor: amountMinor,
        currency: currency.trim().toUpperCase(),
        proof_document_hash: String(proofDocumentHash).trim().toLowerCase(),
        issued_at: effectiveIssuedAt,
        expires_at: effectiveExpiresAt,
        jti: effectiveJti,
        signature
    };
}

/**
 * Vérifie localement côté Node.js la validité formelle et la signature d'une preuve d'action.
 */
function verifyRefundActionProofLocally(proof, expectedFields = {}, secretKey = null) {
    if (!proof || typeof proof !== 'object') {
        return { valid: false, code: 'ACTION_PROOF_REQUIRED', message: 'Preuve d\'action absente ou invalide.' };
    }
    if (proof.version !== ACTION_PROOF_VERSION) {
        return { valid: false, code: 'INVALID_ACTION_PROOF_VERSION', message: `Version de preuve non supportée (${proof.version}).` };
    }
    if (proof.issuer !== ACTION_PROOF_ISSUER) {
        return { valid: false, code: 'UNRECOGNIZED_ACTION_PROOF_AUTHORITY', message: `Autorité émettrice non reconnue (${proof.issuer}).` };
    }

    if (expectedFields.actionType && proof.action_type !== expectedFields.actionType) {
        return { valid: false, code: 'ACTION_PROOF_TYPE_MISMATCH', message: 'Type d\'action discordant dans la preuve.' };
    }
    if (expectedFields.adminId && String(proof.admin_id).toLowerCase() !== String(expectedFields.adminId).toLowerCase()) {
        return { valid: false, code: 'ACTION_PROOF_ADMIN_MISMATCH', message: 'Signataire discordant avec l\'administrateur déclaré.' };
    }
    if (expectedFields.periodId && String(proof.period_id).toLowerCase() !== String(expectedFields.periodId).toLowerCase()) {
        return { valid: false, code: 'ACTION_PROOF_PERIOD_MISMATCH', message: 'Période discordante avec le dossier.' };
    }
    if (expectedFields.reconciliationId && String(proof.reconciliation_id).toLowerCase() !== String(expectedFields.reconciliationId).toLowerCase()) {
        return { valid: false, code: 'ACTION_PROOF_DOSSIER_MISMATCH', message: 'Dossier discordant avec la preuve d\'approbation.' };
    }
    if (expectedFields.providerTransactionId && String(proof.provider_transaction_id).trim() !== String(expectedFields.providerTransactionId).trim()) {
        return { valid: false, code: 'ACTION_PROOF_TRANSACTION_MISMATCH', message: 'Transaction fournisseur discordante.' };
    }
    if (expectedFields.verifiedAmountMinor && Number(proof.verified_amount_minor) !== Number(expectedFields.verifiedAmountMinor)) {
        return { valid: false, code: 'ACTION_PROOF_AMOUNT_MISMATCH', message: 'Montant discordant dans la preuve.' };
    }
    if (expectedFields.currency && String(proof.currency).trim().toUpperCase() !== String(expectedFields.currency).trim().toUpperCase()) {
        return { valid: false, code: 'ACTION_PROOF_CURRENCY_MISMATCH', message: 'Devise discordante dans la preuve.' };
    }
    if (expectedFields.proofDocumentHash && String(proof.proof_document_hash).trim().toLowerCase() !== String(expectedFields.proofDocumentHash).trim().toLowerCase()) {
        return { valid: false, code: 'ACTION_PROOF_DOCUMENT_HASH_MISMATCH', message: 'Empreinte de justificatif discordante.' };
    }

    const issuedAtTime = new Date(proof.issued_at).getTime();
    const expiresAtTime = new Date(proof.expires_at).getTime();
    const nowTime = Date.now();

    if (Number.isNaN(issuedAtTime) || Number.isNaN(expiresAtTime)) {
        return { valid: false, code: 'INVALID_ACTION_PROOF_TIMESTAMPS', message: 'Horodatages de preuve invalides.' };
    }
    if (issuedAtTime > nowTime + 30000) {
        return { valid: false, code: 'ACTION_PROOF_FUTURE', message: 'Preuve émise dans le futur.' };
    }
    if (expiresAtTime < nowTime) {
        return { valid: false, code: 'ACTION_PROOF_EXPIRED', message: 'Preuve d\'action expirée.' };
    }

    const canonical = buildCanonicalActionPayload({
        actionType: proof.action_type,
        adminId: proof.admin_id,
        periodId: proof.period_id,
        reconciliationId: proof.reconciliation_id,
        providerTransactionId: proof.provider_transaction_id,
        verifiedAmountMinor: proof.verified_amount_minor,
        currency: proof.currency,
        proofDocumentHash: proof.proof_document_hash,
        issuedAt: proof.issued_at,
        expiresAt: proof.expires_at,
        jti: proof.jti
    });

    const activeSecret = getActiveAuthoritySecretKey(secretKey);
    const expectedSig = crypto.createHmac('sha256', activeSecret).update(canonical, 'utf8').digest('hex').toLowerCase();

    const actualSig = String(proof.signature || '').trim().toLowerCase();
    if (!/^[a-fA-F0-9]{64}$/.test(actualSig)) {
        return { valid: false, code: 'INVALID_ACTION_PROOF_SIGNATURE', message: 'Format de signature de preuve invalide.' };
    }

    const bufActual = Buffer.from(actualSig, 'hex');
    const bufExpected = Buffer.from(expectedSig, 'hex');
    if (bufActual.length !== bufExpected.length || !crypto.timingSafeEqual(bufActual, bufExpected)) {
        return { valid: false, code: 'INVALID_ACTION_PROOF_SIGNATURE', message: 'Signature cryptographique invalide.' };
    }

    return { valid: true };
}

module.exports = {
    DEFAULT_REFUND_ACTION_AUTH_KEY,
    ACTION_PROOF_VERSION,
    ACTION_PROOF_ISSUER,
    MAX_PROOF_VALIDITY_SECONDS,
    getActiveAuthoritySecretKey,
    buildCanonicalActionPayload,
    generateRefundActionProof,
    verifyRefundActionProofLocally
};
