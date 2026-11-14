'use strict';

const http = require('http');
const crypto = require('crypto');
const {
    resolveAuthoritativeRpConfig,
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

function sendJson(res, statusCode, payload, extraHeaders = {}) {
    const body = JSON.stringify(payload);
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Length': Buffer.byteLength(body, 'utf8'),
        ...extraHeaders
    });
    res.end(body);
}

/**
 * Chantier D.2.5b (DEP-1) : Vérifie l'en-tête X-Serverless-Authorization contenant un jeton
 * OIDC ID Token Google Cloud Run (sans jamais journaliser le jeton).
 *
 * Spécification Cloud Run IAM :
 *   1. Sur Google Cloud Run (--no-allow-unauthenticated), la passerelle Google Front End (GFE)
 *      valide la signature cryptographique du jeton OIDC en amont avant de router la requête.
 *   2. Conformément au comportement documenté de Cloud Run, GFE valide la signature puis retire
 *      la signature du jeton avant de transmettre la requête au conteneur (produisant un format
 *      `header.payload.` ou `header.payload`).
 *   3. En défense en profondeur, cette fonction vérifie la cohérence structurelle (header, payload),
 *      l'émetteur Google (`accounts.google.com`), l'expiration (`exp`), l'audience exacte (`aud`)
 *      et l'identité du compte de service appelant (`email`), sans exiger la présence d'une signature
 *      que Cloud Run a retirée.
 */
function verifyServerlessAuthorizationHeader(serverlessAuthHeader, options = {}) {
    if (!serverlessAuthHeader || typeof serverlessAuthHeader !== 'string' || !serverlessAuthHeader.startsWith('Bearer ')) {
        return {
            valid: false,
            code: 'CLOUD_RUN_IAM_TOKEN_MISSING',
            message: 'En-tête X-Serverless-Authorization: Bearer <GOOGLE_ID_TOKEN> absent ou malformé.'
        };
    }

    const rawToken = serverlessAuthHeader.slice('Bearer '.length).trim();
    const parts = rawToken.split('.');
    // Accepte un JWT à 3 segments (standard) ou un jeton dont la signature a été retirée par Cloud Run GFE (2 segments ou 3e segment vide)
    if ((parts.length !== 2 && parts.length !== 3) || !parts[0] || !parts[1]) {
        return {
            valid: false,
            code: 'CLOUD_RUN_IAM_TOKEN_INVALID',
            message: 'Jeton X-Serverless-Authorization invalide : un OIDC ID Token JWT (au moins header et payload) est requis (les jetons d\'accès STS opaques sont interdits).'
        };
    }

    let headerObj;
    let payloadObj;
    try {
        headerObj = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
        payloadObj = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    } catch (_err) {
        return {
            valid: false,
            code: 'CLOUD_RUN_IAM_TOKEN_INVALID',
            message: 'Impossible de décoder les segments JWT du jeton OIDC Cloud Run.'
        };
    }

    if (!headerObj || typeof headerObj.alg !== 'string' || headerObj.alg === 'none') {
        return {
            valid: false,
            code: 'CLOUD_RUN_IAM_TOKEN_INVALID',
            message: 'Algorithme JWT OIDC Cloud Run manquant ou non sécurisé.'
        };
    }

    const validIssuers = ['https://accounts.google.com', 'accounts.google.com'];
    if (!payloadObj || !validIssuers.includes(String(payloadObj.iss || '').trim())) {
        return {
            valid: false,
            code: 'CLOUD_RUN_IAM_TOKEN_INVALID',
            message: 'Émetteur (iss) du jeton OIDC Cloud Run non reconnu (attendu https://accounts.google.com).'
        };
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (typeof payloadObj.exp !== 'number' || payloadObj.exp <= nowSec) {
        return {
            valid: false,
            code: 'CLOUD_RUN_IAM_TOKEN_EXPIRED',
            message: 'Le jeton OIDC ID Token Cloud Run est expiré.'
        };
    }

    const expectedAudience = options.expectedCloudRunAudience || process.env.YZIOW_CLOUD_RUN_AUDIENCE || null;
    if (expectedAudience && String(payloadObj.aud || '').trim() !== String(expectedAudience).trim()) {
        return {
            valid: false,
            code: 'CLOUD_RUN_IAM_AUDIENCE_MISMATCH',
            message: 'L\'audience (aud) du jeton OIDC Cloud Run ne correspond pas à l\'URL canonique du service d\'autorité.'
        };
    }

    const expectedInvokerEmail = options.expectedInvokerServiceAccountEmail || process.env.YZIOW_CLOUD_RUN_EXPECTED_INVOKER_SA || null;
    if (expectedInvokerEmail && String(payloadObj.email || '').trim().toLowerCase() !== String(expectedInvokerEmail).trim().toLowerCase()) {
        return {
            valid: false,
            code: 'CLOUD_RUN_IAM_INVOKER_MISMATCH',
            message: 'Le compte de service appelant (email) du jeton OIDC Cloud Run n\'est pas autorisé.'
        };
    }

    return {
        valid: true,
        claims: {
            iss: payloadObj.iss,
            aud: payloadObj.aud,
            sub: payloadObj.sub,
            email: payloadObj.email || null,
            exp: payloadObj.exp
        }
    };
}

function resolveAuthorityPort(options = {}) {
    if (options.port !== undefined && options.port !== null && options.port !== '') {
        return Number(options.port);
    }
    if (process.env.YZIOW_WEBAUTHN_AUTHORITY_PORT !== undefined && process.env.YZIOW_WEBAUTHN_AUTHORITY_PORT !== '') {
        return Number(process.env.YZIOW_WEBAUTHN_AUTHORITY_PORT);
    }
    if (process.env.PORT !== undefined && process.env.PORT !== '') {
        return Number(process.env.PORT);
    }
    return 0;
}

function resolveAuthorityHost(options = {}) {
    if (options.host && typeof options.host === 'string' && options.host.trim() !== '') {
        return options.host.trim();
    }
    if (process.env.YZIOW_WEBAUTHN_AUTHORITY_HOST && process.env.YZIOW_WEBAUTHN_AUTHORITY_HOST.trim() !== '') {
        return process.env.YZIOW_WEBAUTHN_AUTHORITY_HOST.trim();
    }
    const isContainerOrCloudRun = Boolean(
        process.env.K_SERVICE ||
        process.env.YZIOW_CONTAINER_MODE === 'true' ||
        process.env.PORT ||
        process.env.NODE_ENV === 'production' ||
        process.env.NODE_ENV === 'staging'
    );
    return isContainerOrCloudRun ? '0.0.0.0' : '127.0.0.1';
}

/**
 * Démarre une instance du serveur HTTP de l'Autorité WebAuthn indépendante.
 */
async function startWebAuthnAuthorityServer(options = {}) {
    const port = resolveAuthorityPort(options);
    const host = resolveAuthorityHost(options);
    const authoritySecretKey = options.authoritySecretKey || process.env.YZIOW_WEBAUTHN_AUTHORITY_SECRET || null;
    const authorityDatabaseUrl = options.authorityDatabaseUrl || process.env.YZIOW_AUTH_AUTHORITY_DATABASE_URL || null;
    const backendToAuthorityToken = options.backendToAuthorityToken || process.env.YZIOW_BACKEND_TO_AUTHORITY_TOKEN || null;
    const bootstrapSecretKey = options.bootstrapSecretKey || process.env.YZIOW_WEBAUTHN_BOOTSTRAP_SECRET || null;
    const authorityRpId = options.authorityRpId !== undefined ? options.authorityRpId : options.rpId;
    const authorityOrigin = options.authorityOrigin !== undefined ? options.authorityOrigin : options.origin;
    const requireServerlessAuthorization =
        options.requireServerlessAuthorization === true ||
        process.env.YZIOW_AUTHORITY_REQUIRE_SERVERLESS_AUTH === 'true';
    const expectedCloudRunAudience = options.expectedCloudRunAudience || process.env.YZIOW_CLOUD_RUN_AUDIENCE || null;
    const expectedInvokerServiceAccountEmail =
        options.expectedInvokerServiceAccountEmail || process.env.YZIOW_CLOUD_RUN_EXPECTED_INVOKER_SA || null;
    const shutdownTimeoutMs = Number(options.shutdownTimeoutMs || process.env.YZIOW_AUTHORITY_SHUTDOWN_TIMEOUT_MS || 8000);

    if (!authoritySecretKey || typeof authoritySecretKey !== 'string' || authoritySecretKey.trim() === '') {
        throw new Error('AUTHORITY_SECRET_NOT_CONFIGURED: YZIOW_WEBAUTHN_AUTHORITY_SECRET requis pour démarrer le serveur d\'autorité.');
    }
    if (!backendToAuthorityToken || typeof backendToAuthorityToken !== 'string' || backendToAuthorityToken.trim() === '') {
        throw new Error('AUTHORITY_TOKEN_NOT_CONFIGURED: YZIOW_BACKEND_TO_AUTHORITY_TOKEN requis pour démarrer le serveur d\'autorité.');
    }

    setAuthorityRuntimeConfig({
        authorityDatabaseUrl,
        authoritySecretKey,
        bootstrapSecretKey,
        authorityRpId,
        authorityOrigin
    });

    // Chantier D.2.5b (DEP-2) : Vérification immédiate fail-closed de WEBAUTHN_RP_ID et WEBAUTHN_ORIGIN au démarrage
    const startupRpCheck = resolveAuthoritativeRpConfig();
    if (!startupRpCheck.valid) {
        setAuthorityRuntimeConfig({
            authorityDatabaseUrl: null,
            authoritySecretKey: null,
            bootstrapSecretKey: null,
            authorityRpId: null,
            authorityOrigin: null
        });
        const err = new Error(startupRpCheck.message);
        err.code = startupRpCheck.code;
        throw err;
    }

    let isShuttingDown = false;
    let shutdownPromise = null;
    let lastShutdownSignal = null;
    let shutdownCompletedAt = null;
    const activeSockets = new Set();

    const server = http.createServer(async (req, res) => {
        if (isShuttingDown) {
            return sendJson(
                res,
                503,
                {
                    success: false,
                    valid: false,
                    status: 'shutting_down',
                    code: 'AUTHORITY_SHUTTING_DOWN',
                    message: 'Le serveur d\'autorité WebAuthn est en cours d\'arrêt propre (SIGTERM) et n\'accepte plus de nouvelles requêtes.'
                },
                { Connection: 'close' }
            );
        }

        try {
            const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
            const pathname = urlObj.pathname;

            if (req.method === 'GET' && pathname === '/v1/health') {
                return sendJson(res, 200, {
                    status: 'ok',
                    authority: 'yziow-refund-auth-authority',
                    rpId: startupRpCheck.rpId,
                    origin: startupRpCheck.origin
                });
            }

            if (requireServerlessAuthorization) {
                const iamCheck = verifyServerlessAuthorizationHeader(req.headers['x-serverless-authorization'], {
                    expectedCloudRunAudience,
                    expectedInvokerServiceAccountEmail
                });
                if (!iamCheck.valid) {
                    return sendJson(res, 401, {
                        success: false,
                        valid: false,
                        code: iamCheck.code,
                        message: iamCheck.message
                    });
                }
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
                    const code = err.code || (err.message || '').split(':')[0] || 'CHALLENGE_CREATION_FAILED';
                    const statusCode = (code === 'INVALID_RP_ID' || code === 'INVALID_ORIGIN' || code === 'WEBAUTHN_RP_CONFIG_MISSING') ? 403 : 400;
                    return sendJson(res, statusCode, { success: false, code, message: err.message });
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
                    const code = err.code || (err.message || '').split(':')[0] || 'CHALLENGE_CREATION_FAILED';
                    const statusCode = (code === 'INVALID_RP_ID' || code === 'INVALID_ORIGIN' || code === 'WEBAUTHN_RP_CONFIG_MISSING') ? 403 : 400;
                    return sendJson(res, statusCode, { success: false, code, message: err.message });
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
                // Chantier D.2.5b (DEP-3) — Révocation verrouillée :
                // L'autorité impose inconditionnellement requireRevocationAuthorization: true et ignore
                // tout paramètre body.requireRevocationAuthorization envoyé par le backend appelant.
                const revRes = await revokeCredential(body.credentialId, body.adminId, {
                    requireRevocationAuthorization: true,
                    revocationApprovalToken: body.revocationApprovalToken || body.enrollmentApprovalToken || null,
                    rpId: body.rpId,
                    origin: body.origin,
                    secretKey: authoritySecretKey,
                    bootstrapSecretKey
                });
                return sendJson(res, revRes.success ? 200 : 403, revRes);
            }

            if (pathname === '/v1/actions/challenge') {
                // Chantier D.2.4 — L'autorité impose inconditionnellement la contre-vérification indépendante
                // du dossier dans PostgreSQL (inspect_authoritative_refund_dossier) et ignore tout paramètre
                // body.enforceAuthoritativeDossierCheck envoyé par le backend appelant.
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
                        enforceAuthoritativeDossierCheck: true
                    });
                    return sendJson(res, 200, { success: true, data: challengeData });
                } catch (err) {
                    const code = err.code || (err.message || '').split(':')[0] || 'CHALLENGE_CREATION_FAILED';
                    return sendJson(res, 403, { success: false, code, message: err.message });
                }
            }

            if (pathname === '/v1/actions/confirm') {
                // Chantier D.2.4 — L'autorité impose inconditionnellement enforceAuthoritativeDossierCheck: true.
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
                    enforceAuthoritativeDossierCheck: true
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

    server.on('connection', (socket) => {
        activeSockets.add(socket);
        socket.on('close', () => {
            activeSockets.delete(socket);
        });
    });

    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, resolve);
    });

    const address = server.address();
    const effectivePort = address && typeof address === 'object' ? address.port : port;
    const clientHost = (host === '0.0.0.0' || host === '::') ? '127.0.0.1' : host;
    const url = `http://${clientHost}:${effectivePort}`;

    let sigtermHandler = null;

    const gracefulShutdown = async (signal = 'SIGTERM') => {
        if (shutdownPromise) {
            return shutdownPromise;
        }
        isShuttingDown = true;
        lastShutdownSignal = signal;

        shutdownPromise = (async () => {
            if (sigtermHandler) {
                process.removeListener('SIGTERM', sigtermHandler);
                sigtermHandler = null;
            }

            await new Promise((resolve) => {
                const forceTimer = setTimeout(() => {
                    for (const socket of activeSockets) {
                        socket.destroy();
                    }
                    resolve();
                }, shutdownTimeoutMs);
                if (typeof forceTimer.unref === 'function') {
                    forceTimer.unref();
                }

                if (typeof server.closeIdleConnections === 'function') {
                    server.closeIdleConnections();
                }

                server.close(() => {
                    clearTimeout(forceTimer);
                    resolve();
                });
            });

            setAuthorityRuntimeConfig({
                authorityDatabaseUrl: null,
                authoritySecretKey: null,
                bootstrapSecretKey: null,
                authorityRpId: null,
                authorityOrigin: null
            });
            await closeAuthorityDbPool();
            shutdownCompletedAt = new Date().toISOString();
            return {
                shutDown: true,
                signal: lastShutdownSignal,
                completedAt: shutdownCompletedAt
            };
        })();

        return shutdownPromise;
    };

    if (options.registerSigtermHandler !== false) {
        sigtermHandler = () => {
            gracefulShutdown('SIGTERM').catch(() => {});
        };
        process.once('SIGTERM', sigtermHandler);
    }

    return {
        server,
        url,
        port: effectivePort,
        listenHost: host,
        get isShuttingDown() {
            return isShuttingDown;
        },
        get lastShutdownSignal() {
            return lastShutdownSignal;
        },
        get shutdownCompletedAt() {
            return shutdownCompletedAt;
        },
        shutdown: gracefulShutdown,
        close: () => gracefulShutdown('CLOSE')
    };
}

if (require.main === module) {
    const standalonePort = process.env.YZIOW_WEBAUTHN_AUTHORITY_PORT || process.env.PORT || 8080;
    const standaloneHost = process.env.YZIOW_WEBAUTHN_AUTHORITY_HOST || '0.0.0.0';
    startWebAuthnAuthorityServer({ port: Number(standalonePort), host: standaloneHost }).then((instance) => {
        console.log(`[YZIOW WebAuthn Authority] Listening on http://${instance.listenHost}:${instance.port}`);
    }).catch((err) => {
        console.error('[YZIOW WebAuthn Authority] Startup failed:', err.message);
        process.exit(1);
    });
}

module.exports = {
    startWebAuthnAuthorityServer,
    verifyBearerToken,
    verifyServerlessAuthorizationHeader,
    resolveAuthorityPort,
    resolveAuthorityHost
};
