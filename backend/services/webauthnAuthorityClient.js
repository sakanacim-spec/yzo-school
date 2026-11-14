'use strict';

const fs = require('fs');

/**
 * Chantier D.2.3 / D.2.5b (P28c) — Client HTTP sans clé secrète du backend applicatif YZIOW
 * vers l'Autorité Indépendante WebAuthn SuperAdmin (hébergée sur Google Cloud Run privé).
 *
 * Garanties de séparation et de durcissement D.2.5b (DEP-1) :
 *   - Ce client ne détient ni YZIOW_WEBAUTHN_AUTHORITY_SECRET ni YZIOW_AUTH_AUTHORITY_DATABASE_URL,
 *     et n'embarque jamais de clé JSON statique de Service Account Google Cloud.
 *   - En mode Cloud Run privé (--no-allow-unauthenticated), il acquiert dynamiquement un jeton
 *     OIDC Vercel éphémère, l'échange via Google Cloud Workload Identity Federation (STS),
 *     puis appelle IAM Credentials (generateIdToken) pour obtenir un OIDC ID Token signé par Google
 *     pour l'audience exacte du service Cloud Run.
 *   - Il sépare strictement le jeton d'accès STS (utilisé uniquement vers iamcredentials.googleapis.com)
 *     et l'OIDC ID Token Google Cloud Run.
 *   - Il transmet les deux en-têtes d'authentification orthogonaux :
 *       1. X-Serverless-Authorization: Bearer <GOOGLE_CLOUD_RUN_OIDC_ID_TOKEN> (vérifié par Cloud Run IAM)
 *       2. Authorization: Bearer <YZIOW_BACKEND_TO_AUTHORITY_TOKEN> (vérifié par le processus Node.js de l'autorité)
 *   - Aucun secret ni jeton n'est jamais journalisé ni exposé dans les messages d'erreur.
 *   - En cas d'absence, d'expiration ou d'invalidité d'un jeton requis, tout appel échoue
 *     immédiatement en mode fail-closed (AUTHORITY_UNAVAILABLE) sans aucun fallback non sécurisé.
 */

const DEFAULT_TIMEOUT_MS = 5000;
const GOOGLE_STS_TOKEN_URL = 'https://sts.googleapis.com/v1/token';
const GOOGLE_IAM_CREDENTIALS_BASE_URL = 'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts';

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

function isCloudRunIamAuthRequired(options = {}) {
    if (options.requireCloudRunIamAuth !== undefined) {
        return Boolean(options.requireCloudRunIamAuth);
    }
    if (process.env.YZIOW_CLOUD_RUN_IAM_AUTH_REQUIRED === 'true') {
        return true;
    }
    if (process.env.YZIOW_CLOUD_RUN_IAM_AUTH_REQUIRED === 'false' && isDisposableTestEnvironment()) {
        return false;
    }
    const baseUrl = getAuthorityBaseUrl(options);
    if (baseUrl && /^https:\/\/[a-zA-Z0-9._-]+\.run\.app$/i.test(baseUrl)) {
        return true;
    }
    return false;
}

function decodeJwtUnverified(rawJwt) {
    if (!rawJwt || typeof rawJwt !== 'string') {
        return null;
    }
    const trimmed = rawJwt.trim();
    if (trimmed.startsWith('{') && trimmed.includes('private_key')) {
        const err = new Error('STATIC_SERVICE_ACCOUNT_KEY_FORBIDDEN: Les clés JSON statiques de compte de service Google Cloud sont strictement interdites.');
        err.code = 'STATIC_SERVICE_ACCOUNT_KEY_FORBIDDEN';
        throw err;
    }
    const parts = trimmed.split('.');
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
        return null;
    }
    try {
        const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        return { header, payload };
    } catch (_e) {
        return null;
    }
}

/**
 * Récupère de manière sécurisée le jeton sujet OIDC Vercel éphémère sans jamais le journaliser.
 * Exécuté dynamiquement au moment de chaque requête vers l'autorité (et jamais à l'initialisation du module).
 *
 * Ordre de résolution compatible Vercel Serverless / CommonJS :
 *   1. Fournisseur explicite options.vercelOidcTokenProvider() ou options.vercelOidcToken
 *   2. En-tête de requête entrante Vercel (options.req?.headers?.['x-vercel-oidc-token'] ou options.headers?.['x-vercel-oidc-token'])
 *   3. Méthode officielle getVercelOidcToken() de @vercel/oidc (si le module est disponible à l'exécution)
 *   4. Contexte de requête runtime Vercel (Symbol.for('@vercel/request-context'))
 *   5. Fichier de jeton temporaire (process.env.VERCEL_OIDC_TOKEN_FILE)
 *   6. Variable d'environnement éphémère (process.env.VERCEL_OIDC_TOKEN)
 */
async function resolveVercelOidcSubjectToken(options = {}) {
    if (typeof options.vercelOidcTokenProvider === 'function') {
        const provided = await options.vercelOidcTokenProvider();
        if (provided && typeof provided === 'string' && provided.trim() !== '') {
            return provided.trim();
        }
    }
    if (options.vercelOidcToken && typeof options.vercelOidcToken === 'string' && options.vercelOidcToken.trim() !== '') {
        return options.vercelOidcToken.trim();
    }

    // En-tête injecté par Vercel sur la requête Serverless entrante
    const requestHeaders = (options.req && options.req.headers) || options.headers || null;
    if (requestHeaders && typeof requestHeaders === 'object') {
        const headerToken = requestHeaders['x-vercel-oidc-token'];
        if (headerToken && typeof headerToken === 'string' && headerToken.trim() !== '') {
            return headerToken.trim();
        }
    }

    // Méthode officielle @vercel/oidc getVercelOidcToken() si disponible dans l'environnement d'exécution
    try {
        const vercelOidcModule = require('@vercel/oidc');
        if (vercelOidcModule && typeof vercelOidcModule.getVercelOidcToken === 'function') {
            const token = await vercelOidcModule.getVercelOidcToken();
            if (token && typeof token === 'string' && token.trim() !== '') {
                return token.trim();
            }
        }
    } catch (_e) {
        // Ignorer silencieusement si @vercel/oidc n'est pas installé ou hors runtime Vercel
    }

    // Contexte runtime officiel @vercel/functions (Symbol.for('@vercel/request-context'))
    try {
        const ctxSymbol = Symbol.for('@vercel/request-context');
        const vercelCtx = globalThis[ctxSymbol];
        if (vercelCtx && typeof vercelCtx.get === 'function') {
            const ctxData = vercelCtx.get();
            const headerToken = ctxData && ctxData.headers && ctxData.headers['x-vercel-oidc-token'];
            if (headerToken && typeof headerToken === 'string' && headerToken.trim() !== '') {
                return headerToken.trim();
            }
        }
    } catch (_e) {
        // Ignorer silencieusement si hors runtime Vercel
    }

    if (process.env.VERCEL_OIDC_TOKEN_FILE && process.env.VERCEL_OIDC_TOKEN_FILE.trim() !== '') {
        const fileToken = fs.readFileSync(process.env.VERCEL_OIDC_TOKEN_FILE.trim(), 'utf8');
        if (fileToken && fileToken.trim() !== '') {
            return fileToken.trim();
        }
    }

    if (process.env.VERCEL_OIDC_TOKEN && process.env.VERCEL_OIDC_TOKEN.trim() !== '') {
        return process.env.VERCEL_OIDC_TOKEN.trim();
    }

    return null;
}

/**
 * Valide la structure et les claims de sécurité du jeton OIDC Vercel avant échange STS.
 */
function validateVercelOidcTokenClaims(rawToken, options = {}) {
    if (!rawToken || typeof rawToken !== 'string' || rawToken.trim() === '') {
        return {
            valid: false,
            code: 'VERCEL_OIDC_TOKEN_MISSING',
            message: 'Jeton OIDC Vercel absent : impossible d\'initier la fédération d\'identité vers Google Cloud Run.'
        };
    }

    let decoded;
    try {
        decoded = decodeJwtUnverified(rawToken);
    } catch (err) {
        return {
            valid: false,
            code: err.code || 'STATIC_SERVICE_ACCOUNT_KEY_FORBIDDEN',
            message: err.message
        };
    }

    if (!decoded || !decoded.header || !decoded.payload) {
        return {
            valid: false,
            code: 'VERCEL_OIDC_TOKEN_MALFORMED',
            message: 'Jeton OIDC Vercel malformé (JWT à 3 segments requis).'
        };
    }

    const { payload } = decoded;
    const nowSec = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number' || payload.exp <= nowSec) {
        return {
            valid: false,
            code: 'VERCEL_OIDC_TOKEN_EXPIRED',
            message: 'Jeton OIDC Vercel expiré.'
        };
    }

    const issuerMode = String(options.vercelOidcIssuerMode || process.env.YZIOW_VERCEL_OIDC_ISSUER_MODE || 'team').trim().toLowerCase();
    const expectedTeamSlug = options.vercelTeamSlug || process.env.YZIOW_VERCEL_TEAM_SLUG || null;
    const actualIss = String(payload.iss || '').trim();

    if (issuerMode === 'team') {
        if (expectedTeamSlug) {
            const expectedIss = `https://oidc.vercel.com/${String(expectedTeamSlug).trim()}`;
            if (actualIss !== expectedIss) {
                return {
                    valid: false,
                    code: 'VERCEL_OIDC_ISSUER_MISMATCH',
                    message: 'Émetteur (iss) du jeton OIDC Vercel non conforme au Team Issuer attendu.'
                };
            }
        } else if (!/^https:\/\/oidc\.vercel\.com\/[a-zA-Z0-9_-]+$/.test(actualIss)) {
            return {
                valid: false,
                code: 'VERCEL_OIDC_ISSUER_MISMATCH',
                message: 'Émetteur (iss) du jeton OIDC Vercel invalide pour le mode Team (attendu https://oidc.vercel.com/<team>).'
            };
        }
    } else if (issuerMode === 'global') {
        if (actualIss !== 'https://oidc.vercel.com') {
            return {
                valid: false,
                code: 'VERCEL_OIDC_ISSUER_MISMATCH',
                message: 'Émetteur (iss) du jeton OIDC Vercel invalide pour le mode Global (attendu https://oidc.vercel.com).'
            };
        }
    } else {
        return {
            valid: false,
            code: 'VERCEL_OIDC_ISSUER_MODE_INVALID',
            message: 'Mode d\'émetteur OIDC Vercel non reconnu (attendu "team" ou "global").'
        };
    }

    const actualSub = String(payload.sub || '').trim();
    const subMatch = /^owner:([a-zA-Z0-9_-]+):project:([a-zA-Z0-9_-]+):environment:([a-zA-Z0-9_-]+)$/.exec(actualSub);
    if (!subMatch) {
        return {
            valid: false,
            code: 'VERCEL_OIDC_SUBJECT_MISMATCH',
            message: 'Sujet (sub) du jeton OIDC Vercel non conforme au format owner:<team>:project:<project>:environment:<env>.'
        };
    }

    const [, subOwner, subProject, subEnv] = subMatch;
    if (expectedTeamSlug && subOwner !== String(expectedTeamSlug).trim()) {
        return {
            valid: false,
            code: 'VERCEL_OIDC_SUBJECT_MISMATCH',
            message: 'Le propriétaire (owner) du sujet OIDC Vercel ne correspond pas à l\'équipe autorisée.'
        };
    }

    const expectedProjectSlug = options.vercelProjectSlug || process.env.YZIOW_VERCEL_PROJECT_SLUG || null;
    if (expectedProjectSlug && subProject !== String(expectedProjectSlug).trim()) {
        return {
            valid: false,
            code: 'VERCEL_OIDC_SUBJECT_MISMATCH',
            message: 'Le projet (project) du sujet OIDC Vercel ne correspond pas au projet YZIOW autorisé.'
        };
    }

    const rawAllowedEnvs = options.vercelAllowedEnvironments || process.env.YZIOW_VERCEL_ALLOWED_ENVIRONMENTS || null;
    if (rawAllowedEnvs) {
        const allowedList = Array.isArray(rawAllowedEnvs)
            ? rawAllowedEnvs.map((e) => String(e).trim().toLowerCase())
            : String(rawAllowedEnvs).split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
        if (allowedList.length > 0 && !allowedList.includes(subEnv.toLowerCase())) {
            return {
                valid: false,
                code: 'VERCEL_OIDC_ENVIRONMENT_FORBIDDEN',
                message: 'L\'environnement Vercel du jeton OIDC n\'est pas autorisé à invoquer l\'autorité Cloud Run.'
            };
        }
    }

    return {
        valid: true,
        claims: {
            iss: actualIss,
            sub: actualSub,
            owner: subOwner,
            project: subProject,
            environment: subEnv,
            exp: payload.exp
        }
    };
}

/**
 * Valide strictement qu'un jeton destiné à Cloud Run est bien un OIDC ID Token signé par Google
 * pour l'audience exacte du service Cloud Run, et non un jeton d'accès STS opaque ou un jeton expiré.
 */
function validateGoogleCloudRunIdTokenClaims(rawIdToken, expectedAudience) {
    if (!rawIdToken || typeof rawIdToken !== 'string' || rawIdToken.trim() === '') {
        return {
            valid: false,
            code: 'CLOUD_RUN_ID_TOKEN_MISSING',
            message: 'Jeton OIDC ID Token Google Cloud Run absent.'
        };
    }

    const trimmed = rawIdToken.trim();
    if (trimmed.startsWith('ya29.') || trimmed.split('.').length !== 3) {
        return {
            valid: false,
            code: 'STS_ACCESS_TOKEN_NOT_ALLOWED_AS_ID_TOKEN',
            message: 'Confusion de jeton détectée : un jeton d\'accès STS opaque ne peut pas être utilisé comme OIDC ID Token Cloud Run.'
        };
    }

    let decoded;
    try {
        decoded = decodeJwtUnverified(trimmed);
    } catch (err) {
        return {
            valid: false,
            code: err.code || 'CLOUD_RUN_ID_TOKEN_INVALID',
            message: err.message
        };
    }

    if (!decoded || !decoded.header || !decoded.payload) {
        return {
            valid: false,
            code: 'CLOUD_RUN_ID_TOKEN_INVALID',
            message: 'Jeton OIDC ID Token Google Cloud Run malformé.'
        };
    }

    const { header, payload } = decoded;
    if (!header.alg || header.alg === 'none') {
        return {
            valid: false,
            code: 'CLOUD_RUN_ID_TOKEN_INVALID',
            message: 'Algorithme de signature du jeton OIDC ID Token Google Cloud Run invalide.'
        };
    }

    if (payload.token_use === 'access' || payload.scope) {
        return {
            valid: false,
            code: 'STS_ACCESS_TOKEN_NOT_ALLOWED_AS_ID_TOKEN',
            message: 'Confusion de jeton détectée : le jeton fourni est un jeton d\'accès STS/OAuth2 et non un OIDC ID Token Cloud Run.'
        };
    }

    const validIssuers = ['https://accounts.google.com', 'accounts.google.com'];
    if (!validIssuers.includes(String(payload.iss || '').trim())) {
        return {
            valid: false,
            code: 'CLOUD_RUN_ID_TOKEN_ISSUER_INVALID',
            message: 'Émetteur (iss) du jeton OIDC ID Token Google Cloud Run invalide (attendu https://accounts.google.com).'
        };
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number' || payload.exp <= nowSec) {
        return {
            valid: false,
            code: 'CLOUD_RUN_ID_TOKEN_EXPIRED',
            message: 'Le jeton OIDC ID Token Google Cloud Run est expiré.'
        };
    }

    const cleanExpectedAud = String(expectedAudience || '').trim().replace(/\/+$/, '');
    const cleanActualAud = String(payload.aud || '').trim().replace(/\/+$/, '');
    if (!cleanExpectedAud || cleanActualAud !== cleanExpectedAud) {
        return {
            valid: false,
            code: 'CLOUD_RUN_ID_TOKEN_AUDIENCE_MISMATCH',
            message: 'L\'audience (aud) du jeton OIDC ID Token Google Cloud Run ne correspond pas à l\'URL cible du service d\'autorité.'
        };
    }

    return {
        valid: true,
        claims: {
            iss: payload.iss,
            aud: cleanActualAud,
            sub: payload.sub,
            email: payload.email || null,
            exp: payload.exp
        }
    };
}

/**
 * Échange le jeton OIDC Vercel contre un jeton d'accès fédéré STS Google Cloud à courte durée de vie.
 */
async function exchangeVercelTokenForStsAccessToken(vercelOidcToken, options = {}) {
    const wifAudience = options.gcpWorkloadIdentityAudience || process.env.YZIOW_GCP_WIF_AUDIENCE || '';
    if (!wifAudience || typeof wifAudience !== 'string' || !wifAudience.trim().startsWith('//iam.googleapis.com/projects/')) {
        return {
            ok: false,
            code: 'GCP_WIF_AUDIENCE_NOT_CONFIGURED',
            message: 'Audience Workload Identity Federation (YZIOW_GCP_WIF_AUDIENCE) absente ou invalide.'
        };
    }

    const fetchImpl = typeof options.iamFetch === 'function' ? options.iamFetch : fetch;
    const stsRes = await fetchImpl(GOOGLE_STS_TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({
            audience: wifAudience.trim(),
            grantType: 'urn:ietf:params:oauth:grant-type:token-exchange',
            requestedTokenType: 'urn:ietf:params:oauth:token-type:access_token',
            scope: 'https://www.googleapis.com/auth/cloud-platform',
            subjectTokenType: 'urn:ietf:params:oauth:token-type:jwt',
            subjectToken: vercelOidcToken
        })
    });

    const stsBody = await stsRes.json().catch(() => ({}));
    if (!stsRes.ok || !stsBody || typeof stsBody.access_token !== 'string' || stsBody.access_token.trim() === '') {
        return {
            ok: false,
            code: 'GCP_STS_TOKEN_EXCHANGE_FAILED',
            message: 'Échec de l\'échange du jeton OIDC Vercel auprès de Google Cloud STS.'
        };
    }

    return {
        ok: true,
        stsAccessToken: stsBody.access_token.trim(),
        expiresIn: Number(stsBody.expires_in || 3600)
    };
}

/**
 * Échange le jeton d'accès STS contre un OIDC ID Token signé par Google pour l'audience exacte de Cloud Run.
 */
async function requestGoogleCloudRunIdToken(options = {}) {
    const baseUrl = getAuthorityBaseUrl(options);
    const expectedAudience = String(options.cloudRunAudience || process.env.YZIOW_CLOUD_RUN_AUDIENCE || baseUrl).trim().replace(/\/+$/, '');
    if (!expectedAudience) {
        return {
            ok: false,
            code: 'CLOUD_RUN_AUDIENCE_NOT_CONFIGURED',
            message: 'Audience cible Cloud Run (YZIOW_CLOUD_RUN_AUDIENCE) non configurée.'
        };
    }

    // Support d'un fournisseur direct de jeton ID Token (ex: simulation de test), toujours validé strictement
    if (typeof options.cloudRunIdTokenProvider === 'function' || options.cloudRunIdToken !== undefined) {
        const directToken = typeof options.cloudRunIdTokenProvider === 'function'
            ? await options.cloudRunIdTokenProvider({ expectedAudience })
            : options.cloudRunIdToken;
        const idCheck = validateGoogleCloudRunIdTokenClaims(directToken, expectedAudience);
        if (!idCheck.valid) {
            return {
                ok: false,
                code: idCheck.code,
                message: idCheck.message
            };
        }
        return {
            ok: true,
            idToken: String(directToken).trim(),
            claims: idCheck.claims
        };
    }

    const invokerSaEmail =
        options.gcpInvokerServiceAccountEmail ||
        process.env.YZIOW_GCP_INVOKER_SA_EMAIL ||
        '';
    if (!invokerSaEmail || typeof invokerSaEmail !== 'string' || !invokerSaEmail.includes('@')) {
        return {
            ok: false,
            code: 'GCP_INVOKER_SA_NOT_CONFIGURED',
            message: 'Compte de service invoker Google Cloud (YZIOW_GCP_INVOKER_SA_EMAIL) non configuré.'
        };
    }

    const vercelSubjectToken = await resolveVercelOidcSubjectToken(options);
    const subjectCheck = validateVercelOidcTokenClaims(vercelSubjectToken, options);
    if (!subjectCheck.valid) {
        return {
            ok: false,
            code: subjectCheck.code,
            message: subjectCheck.message
        };
    }

    const stsResult = await exchangeVercelTokenForStsAccessToken(vercelSubjectToken, options);
    if (!stsResult.ok) {
        return stsResult;
    }

    const fetchImpl = typeof options.iamFetch === 'function' ? options.iamFetch : fetch;
    const iamUrl = `${GOOGLE_IAM_CREDENTIALS_BASE_URL}/${encodeURIComponent(invokerSaEmail.trim())}:generateIdToken`;
    const iamRes = await fetchImpl(iamUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${stsResult.stsAccessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({
            audience: expectedAudience,
            includeEmail: true
        })
    });

    const iamBody = await iamRes.json().catch(() => ({}));
    if (!iamRes.ok || !iamBody || typeof iamBody.token !== 'string' || iamBody.token.trim() === '') {
        return {
            ok: false,
            code: 'GCP_GENERATE_ID_TOKEN_FAILED',
            message: 'Échec de génération de l\'OIDC ID Token Google Cloud Run via IAM Credentials.'
        };
    }

    const idCheck = validateGoogleCloudRunIdTokenClaims(iamBody.token, expectedAudience);
    if (!idCheck.valid) {
        return {
            ok: false,
            code: idCheck.code,
            message: idCheck.message
        };
    }

    return {
        ok: true,
        idToken: iamBody.token.trim(),
        claims: idCheck.claims
    };
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

        // Chantier D.2.5b (DEP-1) : Authentification privée Cloud Run via X-Serverless-Authorization
        // Si l'authentification IAM Cloud Run est requise, l'acquisition et la validation de l'ID Token
        // Google sont obligatoires avant tout appel réseau : aucun fallback non authentifié n'est autorisé.
        if (isCloudRunIamAuthRequired(options)) {
            const idTokenRes = await requestGoogleCloudRunIdToken(options);
            if (!idTokenRes.ok || !idTokenRes.idToken) {
                return {
                    ok: false,
                    status: 503,
                    body: {
                        success: false,
                        valid: false,
                        code: 'AUTHORITY_UNAVAILABLE',
                        reasonCode: idTokenRes.code || 'CLOUD_RUN_IAM_AUTH_FAILED',
                        message: `Authentification privée Cloud Run impossible (${idTokenRes.code || 'CLOUD_RUN_IAM_AUTH_FAILED'}) : ${idTokenRes.message || 'Jeton OIDC indisponible'}. Rejet fail-closed sans fallback.`
                    }
                };
            }
            headers['X-Serverless-Authorization'] = `Bearer ${idTokenRes.idToken}`;
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
            err.reasonCode = (res.body && res.body.reasonCode) || null;
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
            err.reasonCode = (res.body && res.body.reasonCode) || null;
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
        const res = await postToAuthority('/v1/credentials/revoke', {
            credentialId,
            adminId,
            revocationApprovalToken: options.revocationApprovalToken || options.enrollmentApprovalToken || null,
            rpId: options.rpId,
            origin: options.origin
        }, options);
        return res.body || {
            success: false,
            code: 'AUTHORITY_UNAVAILABLE',
            message: 'Réponse invalide de l\'autorité indépendante.'
        };
    }

    const localAuth = require('./superAdminWebAuthnAuthority');
    return localAuth.revokeCredential(credentialId, adminId, options);
}

async function requestActionConfirmationChallenge(params, options = {}) {
    if (isExternalAuthorityRequired(options)) {
        const res = await postToAuthority('/v1/actions/challenge', params, options);
        if (!res.ok || !res.body || !res.body.success) {
            const code = (res.body && res.body.code) || 'AUTHORITY_UNAVAILABLE';
            const msg = (res.body && res.body.message) || 'Échec de création du challenge d\'action auprès de l\'autorité.';
            const err = new Error(`${code}: ${msg}`);
            err.code = code;
            err.reasonCode = (res.body && res.body.reasonCode) || null;
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
    isCloudRunIamAuthRequired,
    resolveVercelOidcSubjectToken,
    validateVercelOidcTokenClaims,
    validateGoogleCloudRunIdTokenClaims,
    exchangeVercelTokenForStsAccessToken,
    requestGoogleCloudRunIdToken,
    requestRegistrationChallenge,
    requestEnrollmentApprovalChallenge,
    requestConfirmedEnrollmentApprovalToken,
    requestVerifyAndRegisterCredential,
    requestRevokeCredential,
    requestActionConfirmationChallenge,
    requestConfirmedActionProof
};
