'use strict';

/**
 * Chantier D.2.3 (P28c) — Client HTTP sans clé secrète du backend applicatif YZIOW
 * vers l'Autorité Indépendante WebAuthn SuperAdmin.
 *
 * Garanties de séparation :
 *   - Ce client ne détient ni YZIOW_WEBAUTHN_AUTHORITY_SECRET ni YZIOW_AUTH_AUTHORITY_DATABASE_URL.
 *   - Il authentifie les appels du backend via Authorization: Bearer <YZIOW_BACKEND_TO_AUTHORITY_TOKEN>.
 *   - Si l'autorité distante est exigée (YZIOW_WEBAUTHN_AUTHORITY_URL défini, YZIOW_ENFORCE_EXTERNAL_AUTHORITY=true
 *     ou NODE_ENV=production) et qu'elle est injoignable ou non configurée, tout appel échoue
 *     immédiatement en mode fail-closed (AUTHORITY_UNAVAILABLE) sans aucun fallback local.
 */

const DEFAULT_TIMEOUT_MS = 5000;

function isDisposableTestEnvironment() {
    return (
        process.env.NODE_ENV === 'test' &&
        (process.env.P28B_ALLOW_DISPOSABLE_DB === 'true' ||
            process.env.P28C_ALLOW_DISPOSABLE_DB === 'true')
    );
}

function isExternalAuthorityRequired(options = {}) {
    return Boolean(
        options.authorityUrl ||
        process.env.YZIOW_WEBAUTHN_AUTHORITY_URL ||
        process.env.YZIOW_ENFORCE_EXTERNAL_AUTHORITY === 'true' ||
        !isDisposableTestEnvironment()
    );
}

function getAuthorityBaseUrl(options = {}) {
    const raw = options.authorityUrl || process.env.YZIOW_WEBAUTHN_AUTHORITY_URL || '';
    return String(raw).trim().replace(/\/+$/, '');
}

function getBackendToAuthorityToken(options = {}) {
    if (options.backendToAuthorityToken !== undefined) {
        return options.backendToAuthorityToken;
    }
    return process.env.YZIOW_BACKEND_TO_AUTHORITY_TOKEN || '';
}

async function postToAuthority(endpointPath, payload, options = {}) {
    if (options.authorityAvailable === false || process.env.YZIOW_WEBAUTHN_AUTHORITY_UNAVAILABLE === 'true') {
        return {
            ok: false,
            status: 503,
            body: {
                success: false,
                valid: false,
                code: 'AUTHORITY_UNAVAILABLE',
                message: 'L\'autorité indépendante de confirmation WebAuthn est indisponible (rejet fail-closed).'
            }
        };
    }

    const baseUrl = getAuthorityBaseUrl(options);
    if (!baseUrl) {
        return {
            ok: false,
            status: 503,
            body: {
                success: false,
                valid: false,
                code: 'AUTHORITY_UNAVAILABLE',
                message: 'URL de l\'autorité indépendante WebAuthn (YZIOW_WEBAUTHN_AUTHORITY_URL) non configurée (rejet fail-closed).'
            }
        };
    }

    const token = getBackendToAuthorityToken(options);
    const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
        if (token && String(token).trim() !== '') {
            headers.Authorization = `Bearer ${String(token).trim()}`;
        }

        const res = await fetch(`${baseUrl}${endpointPath}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload || {}),
            signal: controller.signal
        });

        const parsed = await res.json().catch(() => ({}));
        return {
            ok: res.ok,
            status: res.status,
            body: parsed
        };
    } catch (err) {
        return {
            ok: false,
            status: 503,
            body: {
                success: false,
                valid: false,
                code: 'AUTHORITY_UNAVAILABLE',
                message: `Impossible de joindre l'autorité indépendante WebAuthn (${err.message || 'erreur réseau'}). Rejet fail-closed.`
            }
        };
    } finally {
        clearTimeout(timer);
    }
}

async function requestRegistrationChallenge(adminId, options = {}) {
    if (isExternalAuthorityRequired(options)) {
        const res = await postToAuthority('/v1/credentials/register/challenge', {
            adminId,
            rpId: options.rpId,
            origin: options.origin,
            validitySeconds: options.validitySeconds
        }, options);
        if (!res.ok || !res.body || !res.body.success) {
            const code = (res.body && res.body.code) || 'AUTHORITY_UNAVAILABLE';
            const msg = (res.body && res.body.message) || 'Échec de création du challenge d\'enregistrement auprès de l\'autorité.';
            const err = new Error(`${code}: ${msg}`);
            err.code = code;
            throw err;
        }
        return res.body.data;
    }

    const localAuth = require('./superAdminWebAuthnAuthority');
    return localAuth.createRegistrationChallenge(adminId, options);
}

async function requestEnrollmentApprovalChallenge(params, options = {}) {
    if (isExternalAuthorityRequired(options)) {
        const res = await postToAuthority('/v1/credentials/enroll-approval/challenge', params, options);
        if (!res.ok || !res.body || !res.body.success) {
            const code = (res.body && res.body.code) || 'AUTHORITY_UNAVAILABLE';
            const msg = (res.body && res.body.message) || 'Échec de création du challenge de co-autorisation auprès de l\'autorité.';
            const err = new Error(`${code}: ${msg}`);
            err.code = code;
            throw err;
        }
        return res.body.data;
    }

    const localAuth = require('./superAdminWebAuthnAuthority');
    return localAuth.createEnrollmentApprovalChallenge(params);
}

async function requestConfirmedEnrollmentApprovalToken(params, options = {}) {
    if (isExternalAuthorityRequired(options)) {
        const res = await postToAuthority('/v1/credentials/enroll-approval/confirm', params, options);
        return res.body || {
            valid: false,
            code: 'AUTHORITY_UNAVAILABLE',
            message: 'Réponse invalide de l\'autorité indépendante.'
        };
    }

    const localAuth = require('./superAdminWebAuthnAuthority');
    return localAuth.issueConfirmedEnrollmentApprovalToken(params);
}

async function requestVerifyAndRegisterCredential(params, options = {}) {
    if (isExternalAuthorityRequired(options)) {
        const res = await postToAuthority('/v1/credentials/register/verify', params, options);
        return res.body || {
            valid: false,
            code: 'AUTHORITY_UNAVAILABLE',
            message: 'Réponse invalide de l\'autorité indépendante.'
        };
    }

    const localAuth = require('./superAdminWebAuthnAuthority');
    return localAuth.verifyAndRegisterCredential(params);
}

async function requestRevokeCredential(credentialId, adminId, options = {}) {
    if (isExternalAuthorityRequired(options)) {
        const res = await postToAuthority('/v1/credentials/revoke', { credentialId, adminId }, options);
        return res.body || {
            success: false,
            code: 'AUTHORITY_UNAVAILABLE',
            message: 'Réponse invalide de l\'autorité indépendante.'
        };
    }

    const localAuth = require('./superAdminWebAuthnAuthority');
    return localAuth.revokeCredential(credentialId, adminId);
}

async function requestActionConfirmationChallenge(params, options = {}) {
    if (isExternalAuthorityRequired(options)) {
        const res = await postToAuthority('/v1/actions/challenge', params, options);
        if (!res.ok || !res.body || !res.body.success) {
            const code = (res.body && res.body.code) || 'AUTHORITY_UNAVAILABLE';
            const msg = (res.body && res.body.message) || 'Échec de création du challenge d\'action auprès de l\'autorité.';
            const err = new Error(`${code}: ${msg}`);
            err.code = code;
            throw err;
        }
        return res.body.data;
    }

    const localAuth = require('./superAdminWebAuthnAuthority');
    return localAuth.createActionConfirmationChallenge(params);
}

async function requestConfirmedActionProof(params, options = {}) {
    if (isExternalAuthorityRequired(options)) {
        const res = await postToAuthority('/v1/actions/confirm', params, options);
        return res.body || {
            success: false,
            code: 'AUTHORITY_UNAVAILABLE',
            message: 'Réponse invalide de l\'autorité indépendante.'
        };
    }

    const localAuth = require('./superAdminWebAuthnAuthority');
    return localAuth.issueConfirmedActionProof(params);
}

module.exports = {
    isExternalAuthorityRequired,
    requestRegistrationChallenge,
    requestEnrollmentApprovalChallenge,
    requestConfirmedEnrollmentApprovalToken,
    requestVerifyAndRegisterCredential,
    requestRevokeCredential,
    requestActionConfirmationChallenge,
    requestConfirmedActionProof
};
