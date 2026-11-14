'use strict';

const http = require('http');
const crypto = require('crypto');
const {
    setAuthorityRuntimeConfig,
    createRegistrationChallenge,
    createEnrollmentApprovalChallenge,
    issueConfirmedEnrollmentApprovalToken,
    verifyAndRegisterCredential,
    revokeCredential,
    createActionConfirmationChallenge,
    issueConfirmedActionProof,
    closeAuthorityDbPool
} = require('../services/superAdminWebAuthnAuthority');

/**
 * Chantier D.2.3 (P28c) — Serveur HTTP autonome de l'Autorité Indépendante WebAuthn SuperAdmin.
 *
 * Modèle de sécurité (compromission totale du backend applicatif YZIOW) :
 *   1. Ce service détient exclusivement :
 *      - YZIOW_WEBAUTHN_AUTHORITY_SECRET (clé de signature des preuves d'action acceptées par PostgreSQL)
 *      - YZIOW_AUTH_AUTHORITY_DATABASE_URL (connexion PostgreSQL sous le rôle dédié à privilèges minimaux
 *        yziow_webauthn_authority, sans aucun accès aux RPC de remboursement ni aux tables financières).
 *   2. Le backend applicatif YZIOW ne détient ni YZIOW_WEBAUTHN_AUTHORITY_SECRET ni
 *      YZIOW_AUTH_AUTHORITY_DATABASE_URL. Il communique uniquement via HTTP authentifié
 *      (Authorization: Bearer <YZIOW_BACKEND_TO_AUTHORITY_TOKEN>).
 *   3. Même si un attaquant compromet totalement le backend applicatif et utilise son jeton
 *      YZIOW_BACKEND_TO_AUTHORITY_TOKEN :
 *      - Il ne peut obtenir aucune preuve sans une assertion matérielle WebAuthn (UP=1, UV=1)
 *        signée par la clé privée physique du SuperAdmin.
 *      - L'autorité contre-vérifie directement dans PostgreSQL (inspect_authoritative_refund_dossier)
 *        la concordance du dossier (période, transaction, montant, devise, hash, séparation des pouvoirs)
 *        et ne fait pas confiance aux paramètres déclarés par le backend.
 *      - Tout remplacement d'authentificateur exige une co-autorisation matérielle WebAuthn (UP=1, UV=1)
 *        d'un second SuperAdmin distinct lorsque celui-ci dispose d'un authentificateur actif.
 */

function verifyBearerToken(authHeader, expectedToken) {
    if (!expectedToken || typeof expectedToken !== 'string' || expectedToken.trim() === '') {
        return false;
    }
    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
        return false;
    }
    const provided = authHeader.slice('Bearer '.length).trim();
    const bufProvided = Buffer.from(provided, 'utf8');
    const bufExpected = Buffer.from(expectedToken.trim(), 'utf8');
    if (bufProvided.length !== bufExpected.length) {
        return false;
    }
    return crypto.timingSafeEqual(bufProvided, bufExpected);
}

function readJsonBody(req, maxBytes = 65536) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', (chunk) => {
            data += chunk.toString('utf8');
            if (Buffer.byteLength(data, 'utf8') > maxBytes) {
                reject(new Error('PAYLOAD_TOO_LARGE'));
            }
        });
        req.on('end', () => {
            if (!data || data.trim() === '') {
                resolve({});
                return;
            }
            try {
                resolve(JSON.parse(data));
            } catch (_err) {
                reject(new Error('INVALID_JSON_BODY'));
            }
        });
        req.on('error', reject);
    });
}

function sendJson(res, statusCode, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Length': Buffer.byteLength(body, 'utf8')
    });
    res.end(body);
}

/**
 * Démarre une instance du serveur HTTP de l'Autorité WebAuthn indépendante.
 */
async function startWebAuthnAuthorityServer(options = {}) {
    const port = options.port !== undefined ? Number(options.port) : Number(process.env.YZIOW_WEBAUTHN_AUTHORITY_PORT || 0);
    const host = options.host || '127.0.0.1';
    const authoritySecretKey = options.authoritySecretKey || process.env.YZIOW_WEBAUTHN_AUTHORITY_SECRET || null;
    const authorityDatabaseUrl = options.authorityDatabaseUrl || process.env.YZIOW_AUTH_AUTHORITY_DATABASE_URL || null;
    const backendToAuthorityToken = options.backendToAuthorityToken || process.env.YZIOW_BACKEND_TO_AUTHORITY_TOKEN || null;
    const bootstrapSecretKey = options.bootstrapSecretKey || process.env.YZIOW_WEBAUTHN_BOOTSTRAP_SECRET || null;
    const enforceAuthoritativeDossierCheck = options.enforceAuthoritativeDossierCheck !== false;

    if (!authoritySecretKey || typeof authoritySecretKey !== 'string' || authoritySecretKey.trim() === '') {
        throw new Error('AUTHORITY_SECRET_NOT_CONFIGURED: YZIOW_WEBAUTHN_AUTHORITY_SECRET requis pour démarrer le serveur d\'autorité.');
    }
    if (!backendToAuthorityToken || typeof backendToAuthorityToken !== 'string' || backendToAuthorityToken.trim() === '') {
        throw new Error('AUTHORITY_TOKEN_NOT_CONFIGURED: YZIOW_BACKEND_TO_AUTHORITY_TOKEN requis pour démarrer le serveur d\'autorité.');
    }

    setAuthorityRuntimeConfig({
        authorityDatabaseUrl,
        authoritySecretKey,
        bootstrapSecretKey
    });

    const server = http.createServer(async (req, res) => {
        try {
            const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
            const pathname = urlObj.pathname;

            if (req.method === 'GET' && pathname === '/v1/health') {
                return sendJson(res, 200, { status: 'ok', authority: 'yziow-refund-auth-authority' });
            }

            if (!verifyBearerToken(req.headers.authorization, backendToAuthorityToken)) {
                return sendJson(res, 401, {
                    success: false,
                    valid: false,
                    code: 'UNAUTHORIZED_BACKEND_CALLER',
                    message: 'Authentification inter-service invalide ou absente vers l\'autorité WebAuthn.'
                });
            }

            if (req.method !== 'POST') {
                return sendJson(res, 405, {
                    success: false,
                    code: 'METHOD_NOT_ALLOWED',
                    message: 'Seule la méthode POST est acceptée sur les endpoints d\'autorité.'
                });
            }

            let body;
            try {
                body = await readJsonBody(req);
            } catch (parseErr) {
                return sendJson(res, 400, {
                    success: false,
                    valid: false,
                    code: parseErr.message || 'INVALID_JSON_BODY',
                    message: 'Corps de requête JSON invalide.'
                });
            }

            if (pathname === '/v1/credentials/register/challenge') {
                try {
                    const challengeData = await createRegistrationChallenge(body.adminId, {
                        rpId: body.rpId,
                        origin: body.origin,
                        validitySeconds: body.validitySeconds
                    });
                    return sendJson(res, 200, { success: true, data: challengeData });
                } catch (err) {
                    const code = (err.message || '').split(':')[0] || 'CHALLENGE_CREATION_FAILED';
                    return sendJson(res, 400, { success: false, code, message: err.message });
                }
            }

            if (pathname === '/v1/credentials/enroll-approval/challenge') {
                try {
                    const challengeData = await createEnrollmentApprovalChallenge({
                        targetAdminId: body.targetAdminId,
                        approverAdminId: body.approverAdminId,
                        purpose: body.purpose,
                        rpId: body.rpId,
                        origin: body.origin,
                        validitySeconds: body.validitySeconds
                    });
                    return sendJson(res, 200, { success: true, data: challengeData });
                } catch (err) {
                    const code = (err.message || '').split(':')[0] || 'CHALLENGE_CREATION_FAILED';
                    return sendJson(res, 400, { success: false, code, message: err.message });
                }
            }

            if (pathname === '/v1/credentials/enroll-approval/confirm') {
                const tokenRes = await issueConfirmedEnrollmentApprovalToken({
                    targetAdminId: body.targetAdminId,
                    approverAdminId: body.approverAdminId,
                    purpose: body.purpose,
                    webauthnAssertion: body.webauthnAssertion,
                    rpId: body.rpId,
                    origin: body.origin,
                    secretKey: authoritySecretKey
                });
                return sendJson(res, tokenRes.valid ? 200 : 403, tokenRes);
            }

            if (pathname === '/v1/credentials/register/verify') {
                // Chantier D.2.3 — Sécurité de l'enrôlement initial (0 authentificateur actif) et du remplacement :
                // L'autorité indépendante n'accepte JAMAIS que le backend appelant désactive requireEnrollmentApproval.
                // Si aucun SuperAdmin approbateur ne possède encore d'authentificateur actif (bootstrap initial),
                // un jeton hors bande à usage unique signé par YZIOW_WEBAUTHN_BOOTSTRAP_SECRET et lié au credentialId est exigé.
                // Si un SuperAdmin approbateur possède déjà un authentificateur actif, une co-autorisation matérielle WebAuthn (UP=1, UV=1) est exigée.
                const regRes = await verifyAndRegisterCredential({
                    adminId: body.adminId,
                    credentialId: body.credentialId,
                    publicKeySpki: body.publicKeySpki,
                    attestationObject: body.attestationObject,
                    clientDataJSON: body.clientDataJSON,
                    authenticatorData: body.authenticatorData,
                    expectedChallenge: body.expectedChallenge,
                    enrollmentApprovalToken: body.enrollmentApprovalToken || null,
                    requireEnrollmentApproval: true,
                    requireHardwareCoAuth: Boolean(body.requireHardwareCoAuth),
                    requireBootstrapOrHardwareCoAuth: true,
                    rpId: body.rpId,
                    origin: body.origin,
                    aaguid: body.aaguid,
                    transports: body.transports,
                    secretKey: authoritySecretKey,
                    bootstrapSecretKey
                });
                return sendJson(res, regRes.valid ? 200 : 403, regRes);
            }

            if (pathname === '/v1/credentials/revoke') {
                const revRes = await revokeCredential(body.credentialId, body.adminId);
                return sendJson(res, revRes.success ? 200 : 403, revRes);
            }

            if (pathname === '/v1/actions/challenge') {
                try {
                    const challengeData = await createActionConfirmationChallenge({
                        adminId: body.adminId,
                        actionType: body.actionType,
                        periodId: body.periodId,
                        reconciliationId: body.reconciliationId || null,
                        providerTransactionId: body.providerTransactionId,
                        verifiedAmountMinor: body.verifiedAmountMinor,
                        currency: body.currency || 'XOF',
                        proofDocumentHash: body.proofDocumentHash,
                        rpId: body.rpId,
                        origin: body.origin,
                        validitySeconds: body.validitySeconds,
                        enforceAuthoritativeDossierCheck:
                            body.enforceAuthoritativeDossierCheck !== undefined
                                ? Boolean(body.enforceAuthoritativeDossierCheck)
                                : enforceAuthoritativeDossierCheck
                    });
                    return sendJson(res, 200, { success: true, data: challengeData });
                } catch (err) {
                    const code = err.code || (err.message || '').split(':')[0] || 'CHALLENGE_CREATION_FAILED';
                    return sendJson(res, 403, { success: false, code, message: err.message });
                }
            }

            if (pathname === '/v1/actions/confirm') {
                const proofRes = await issueConfirmedActionProof({
                    adminId: body.adminId,
                    actionType: body.actionType,
                    periodId: body.periodId,
                    reconciliationId: body.reconciliationId || null,
                    providerTransactionId: body.providerTransactionId,
                    verifiedAmountMinor: body.verifiedAmountMinor,
                    currency: body.currency || 'XOF',
                    proofDocumentHash: body.proofDocumentHash,
                    webauthnAssertion: body.webauthnAssertion,
                    rpId: body.rpId,
                    origin: body.origin,
                    secretKey: authoritySecretKey,
                    enforceAuthoritativeDossierCheck:
                        body.enforceAuthoritativeDossierCheck !== undefined
                            ? Boolean(body.enforceAuthoritativeDossierCheck)
                            : enforceAuthoritativeDossierCheck
                });
                return sendJson(res, proofRes.success ? 200 : 403, proofRes);
            }

            return sendJson(res, 404, {
                success: false,
                code: 'NOT_FOUND',
                message: `Endpoint d'autorité inconnu : ${pathname}`
            });
        } catch (err) {
            return sendJson(res, 500, {
                success: false,
                valid: false,
                code: 'AUTHORITY_INTERNAL_ERROR',
                message: err.message || 'Erreur interne du serveur d\'autorité WebAuthn.'
            });
        }
    });

    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, resolve);
    });

    const address = server.address();
    const effectivePort = address && typeof address === 'object' ? address.port : port;
    const url = `http://${host}:${effectivePort}`;

    return {
        server,
        url,
        port: effectivePort,
        close: async () => {
            await new Promise((resolve) => server.close(() => resolve()));
            setAuthorityRuntimeConfig({
                authorityDatabaseUrl: null,
                authoritySecretKey: null,
                bootstrapSecretKey: null
            });
            await closeAuthorityDbPool();
        }
    };
}

if (require.main === module) {
    startWebAuthnAuthorityServer().then((instance) => {
        console.log(`[YZIOW WebAuthn Authority] Listening on ${instance.url}`);
    }).catch((err) => {
        console.error('[YZIOW WebAuthn Authority] Startup failed:', err.message);
        process.exit(1);
    });
}

module.exports = {
    startWebAuthnAuthorityServer,
    verifyBearerToken
};
