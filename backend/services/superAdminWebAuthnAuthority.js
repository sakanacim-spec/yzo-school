'use strict';

const crypto = require('crypto');
const { Pool } = require('pg');
const {
    verifyRegistrationResponse,
    verifyAuthenticationResponse
} = require('@simplewebauthn/server');
const {
    decodeAttestationObject,
    decodeCredentialPublicKey,
    parseAuthenticatorData,
    cose,
    COSEALG,
    isoBase64URL,
    isoCBOR
} = require('@simplewebauthn/server/helpers');
const { isValidUUID } = require('../utils/helpers');
const {
    buildCanonicalActionPayload,
    generateRefundActionProof,
    getActiveAuthoritySecretKey,
    MAX_PROOF_VALIDITY_SECONDS
} = require('./refundActionProofAuthority');

/**
 * Chantier D.2.1 & D.2.2 (P28c) — Autorité indépendante d'authentification forte
 * personnelle WebAuthn/FIDO2 pour la double validation SuperAdmin des remboursements.
 *
 * Garanties D.2.2 :
 *   - P1 : Séparation cryptographique de l'autorité (le backend applicatif ne détient pas
 *          la clé secrète de signature et PostgreSQL contre-vérifie que chaque preuve
 *          est adossée à un challenge WebAuthn réellement consommé dans yziow_refund_auth.webauthn_challenges).
 *   - P4 : Validation standardisée de l'enregistrement et des assertions via @simplewebauthn/server
 *          (décodage CBOR attestationObject, validation de clé publique COSE et d'algorithme,
 *          présence UP et vérification utilisateur UV obligatoires, et co-autorisation par un
 *          second SuperAdmin actif pour l'enrôlement en session ou le remplacement de clé).
 *   - P5 : Persistance PostgreSQL des challenges (yziow_refund_auth.webauthn_challenges) et
 *          des credentials (public.superadmin_webauthn_credentials) avec consommation atomique
 *          à usage unique par verrouillage de ligne (SELECT ... FOR UPDATE).
 */

const DEFAULT_RP_ID = process.env.WEBAUTHN_RP_ID || 'localhost';
const DEFAULT_ORIGIN = process.env.WEBAUTHN_ORIGIN || 'http://localhost:5173';
const CHALLENGE_VALIDITY_SECONDS = 300; // 5 minutes
const SUPPORTED_COSE_ALGORITHMS = [
    COSEALG.ES256, // -7 (ECDSA P-256 / SHA-256)
    COSEALG.EdDSA, // -8 (Ed25519)
    COSEALG.RS256  // -257 (RSASSA-PKCS1-v1_5 / SHA-256)
];

// Cache mémoire local (utilisé uniquement comme miroir ou fallback hors base ;
// resetInMemoryState() vide ce cache sans effacer PostgreSQL afin de prouver la persistance P5)
const inMemoryCredentials = new Map();
const inMemoryChallenges = new Map();
const consumedEnrollmentTokens = new Set();

let authorityPool = null;
let authorityPoolUrl = null;
let configuredAuthorityDatabaseUrl = null;
let configuredAuthoritySecretKey = null;
let configuredBootstrapSecretKey = null;

function setAuthorityRuntimeConfig({
    authorityDatabaseUrl = undefined,
    authoritySecretKey = undefined,
    bootstrapSecretKey = undefined
} = {}) {
    if (authorityDatabaseUrl !== undefined) {
        configuredAuthorityDatabaseUrl = authorityDatabaseUrl;
    }
    if (authoritySecretKey !== undefined) {
        configuredAuthoritySecretKey = authoritySecretKey;
    }
    if (bootstrapSecretKey !== undefined) {
        configuredBootstrapSecretKey = bootstrapSecretKey;
    }
}

function getEffectiveAuthoritySecret(explicitSecret = null) {
    return explicitSecret || configuredAuthoritySecretKey || null;
}

function getEffectiveBootstrapSecret(explicitBootstrapSecret = null) {
    return explicitBootstrapSecret || configuredBootstrapSecretKey || process.env.YZIOW_WEBAUTHN_BOOTSTRAP_SECRET || null;
}

function getAuthorityDbUrl() {
    if (configuredAuthorityDatabaseUrl) {
        return configuredAuthorityDatabaseUrl;
    }
    if (process.env.YZIOW_AUTH_AUTHORITY_DATABASE_URL) {
        return process.env.YZIOW_AUTH_AUTHORITY_DATABASE_URL;
    }
    const isDisposableTestMode =
        process.env.NODE_ENV === 'test' &&
        (process.env.P28B_ALLOW_DISPOSABLE_DB === 'true' || process.env.P28C_ALLOW_DISPOSABLE_DB === 'true');
    if (isDisposableTestMode && process.env.DATABASE_URL) {
        return process.env.DATABASE_URL;
    }
    return null;
}

function getAuthorityPool() {
    const dbUrl = getAuthorityDbUrl();
    if (!dbUrl) {
        return null;
    }
    if (!authorityPool || authorityPoolUrl !== dbUrl) {
        if (authorityPool) {
            authorityPool.end().catch(() => {});
        }
        authorityPool = new Pool({
            connectionString: dbUrl,
            max: 10,
            idleTimeoutMillis: 5000
        });
        authorityPoolUrl = dbUrl;
    }
    return authorityPool;
}

async function closeAuthorityDbPool() {
    if (authorityPool) {
        const poolToClose = authorityPool;
        authorityPool = null;
        authorityPoolUrl = null;
        await poolToClose.end().catch(() => {});
    }
}

/**
 * Normalise un buffer ou une chaîne en Buffer.
 */
function toBuffer(data, encoding = 'utf8') {
    if (Buffer.isBuffer(data)) return data;
    if (data instanceof Uint8Array) return Buffer.from(data);
    if (typeof data === 'string') {
        if (/^[a-zA-Z0-9_-]+$/.test(data) && data.length % 4 !== 1) {
            return Buffer.from(data, 'base64url');
        }
        return Buffer.from(data, encoding);
    }
    throw new Error('INVALID_DATA_TYPE: Attendu Buffer ou String.');
}

function toBase64UrlId(credentialId) {
    const clean = String(credentialId || '').trim();
    if (isoBase64URL.isBase64URL(clean)) {
        return clean;
    }
    return Buffer.from(clean, 'utf8').toString('base64url');
}

/**
 * Convertit une clé publique SPKI PEM (EC P-256) en clé publique COSE CBOR (Uint8Array).
 */
function spkiPemToCosePublicKeyBytes(publicKeySpki, coseAlg = COSEALG.ES256) {
    const keyObj = crypto.createPublicKey(publicKeySpki);
    const jwk = keyObj.export({ format: 'jwk' });
    if (jwk.kty === 'EC' && jwk.crv === 'P-256') {
        const coseMap = new Map([
            [cose.COSEKEYS.kty, cose.COSEKTY.EC2], // 1: 2 (EC2)
            [cose.COSEKEYS.alg, coseAlg],          // 3: -7 (ES256)
            [cose.COSEKEYS.crv, cose.COSECRV.P256],// -1: 1 (P-256)
            [cose.COSEKEYS.x, new Uint8Array(Buffer.from(jwk.x, 'base64url'))],
            [cose.COSEKEYS.y, new Uint8Array(Buffer.from(jwk.y, 'base64url'))]
        ]);
        return new Uint8Array(isoCBOR.encode(coseMap));
    }
    if (jwk.kty === 'RSA') {
        const coseMap = new Map([
            [cose.COSEKEYS.kty, cose.COSEKTY.RSA],
            [cose.COSEKEYS.alg, coseAlg === COSEALG.ES256 ? COSEALG.RS256 : coseAlg],
            [cose.COSEKEYS.n, new Uint8Array(Buffer.from(jwk.n, 'base64url'))],
            [cose.COSEKEYS.e, new Uint8Array(Buffer.from(jwk.e, 'base64url'))]
        ]);
        return new Uint8Array(isoCBOR.encode(coseMap));
    }
    throw new Error('UNSUPPORTED_PUBLIC_KEY_TYPE: Type de clé publique non supporté pour conversion COSE.');
}

/**
 * Convertit une clé publique COSE CBOR (Uint8Array) en clé publique SPKI PEM.
 */
function cosePublicKeyBytesToSpkiPem(cosePublicKeyBytes) {
    const decoded = decodeCredentialPublicKey(new Uint8Array(cosePublicKeyBytes));
    if (!(decoded instanceof Map)) {
        throw new Error('INVALID_COSE_PUBLIC_KEY: La clé publique COSE décodée n\'est pas une structure CBOR Map.');
    }
    const kty = decoded.get(cose.COSEKEYS.kty);
    const alg = decoded.get(cose.COSEKEYS.alg);
    if (typeof alg !== 'number') {
        throw new Error('INVALID_COSE_PUBLIC_KEY: Algorithme COSE (alg) manquant ou non numérique.');
    }
    if (!SUPPORTED_COSE_ALGORITHMS.includes(alg)) {
        throw new Error(`UNSUPPORTED_COSE_ALGORITHM: Algorithme COSE "${alg}" non autorisé (attendu ES256/-7, EdDSA/-8 ou RS256/-257).`);
    }

    if (kty === cose.COSEKTY.EC2) {
        const crv = decoded.get(cose.COSEKEYS.crv);
        const x = decoded.get(cose.COSEKEYS.x);
        const y = decoded.get(cose.COSEKEYS.y);
        if (crv !== cose.COSECRV.P256 || !x || !y || x.byteLength !== 32 || y.byteLength !== 32) {
            throw new Error('INVALID_COSE_PUBLIC_KEY: Paramètres EC2 P-256 (crv, x, y) invalides ou incomplets.');
        }
        const keyObj = crypto.createPublicKey({
            key: {
                kty: 'EC',
                crv: 'P-256',
                x: Buffer.from(x).toString('base64url'),
                y: Buffer.from(y).toString('base64url')
            },
            format: 'jwk'
        });
        return {
            publicKeySpki: keyObj.export({ type: 'spki', format: 'pem' }),
            coseAlg: alg
        };
    }

    if (kty === cose.COSEKTY.RSA) {
        const n = decoded.get(cose.COSEKEYS.n);
        const e = decoded.get(cose.COSEKEYS.e);
        if (!n || !e) {
            throw new Error('INVALID_COSE_PUBLIC_KEY: Paramètres RSA (n, e) invalides.');
        }
        const keyObj = crypto.createPublicKey({
            key: {
                kty: 'RSA',
                n: Buffer.from(n).toString('base64url'),
                e: Buffer.from(e).toString('base64url')
            },
            format: 'jwk'
        });
        return {
            publicKeySpki: keyObj.export({ type: 'spki', format: 'pem' }),
            coseAlg: alg
        };
    }

    throw new Error(`INVALID_COSE_PUBLIC_KEY: Type de clé COSE kty="${kty}" non supporté.`);
}

/**
 * Construit un attestationObject CBOR conforme au standard WebAuthn (utilisé pour les tests
 * ou pour normaliser un enregistrement fournissant une clé publique en entrée).
 */
function buildWebAuthnAttestationObject({
    publicKeySpki,
    credentialId,
    rpId = DEFAULT_RP_ID,
    counter = 0,
    aaguid = '00000000-0000-0000-0000-000000000000',
    userPresent = true,
    userVerified = true,
    coseAlg = COSEALG.ES256,
    fmt = 'none',
    attStmt = new Map(),
    customCosePublicKeyBytes = null
}) {
    const rpIdHash = crypto.createHash('sha256').update(rpId).digest();
    let flags = 0x40; // AT (Attested Credential Data Present) = bit 6 (0x40)
    if (userPresent) flags |= 0x01; // UP = bit 0
    if (userVerified) flags |= 0x04; // UV = bit 2

    const counterBuf = Buffer.alloc(4);
    counterBuf.writeUInt32BE(counter, 0);

    const cleanAaguidHex = String(aaguid || '00000000-0000-0000-0000-000000000000').replace(/-/g, '');
    const aaguidBuf = Buffer.from(cleanAaguidHex.padEnd(32, '0').slice(0, 32), 'hex');

    const b64Id = toBase64UrlId(credentialId);
    const credIdBytes = Buffer.from(isoBase64URL.toBuffer(b64Id));
    const credIdLenBuf = Buffer.alloc(2);
    credIdLenBuf.writeUInt16BE(credIdBytes.length, 0);

    const coseKeyBytes = customCosePublicKeyBytes
        ? Buffer.from(customCosePublicKeyBytes)
        : Buffer.from(spkiPemToCosePublicKeyBytes(publicKeySpki, coseAlg));

    const authData = Buffer.concat([
        rpIdHash,
        Buffer.from([flags]),
        counterBuf,
        aaguidBuf,
        credIdLenBuf,
        credIdBytes,
        coseKeyBytes
    ]);

    const attObjMap = new Map([
        ['fmt', fmt],
        ['attStmt', attStmt],
        ['authData', new Uint8Array(authData)]
    ]);

    return Buffer.from(isoCBOR.encode(attObjMap)).toString('base64url');
}

/**
 * -----------------------------------------------------------------------------
 * 0. PROCÉDURE DE CONFIANCE RENFORCÉE POUR L'ENRÔLEMENT / REMPLACEMENT (P4)
 * -----------------------------------------------------------------------------
 * Empêche qu'une simple session SuperAdmin volée (JWT) suffise à enregistrer
 * un nouvel authentificateur ou à remplacer la clé d'un SuperAdmin existant.
 * Exige un jeton de co-autorisation signé par un second SuperAdmin actif distinct.
 */
function issueEnrollmentApprovalToken({
    targetAdminId,
    approverAdminId,
    purpose = 'credential_enrollment',
    validitySeconds = 300,
    secretKey = null,
    webauthnChallengeId = null,
    approverCredentialId = null
}) {
    if (!targetAdminId || !isValidUUID(targetAdminId)) {
        throw new Error('INVALID_ADMIN_ID: targetAdminId UUID valide requis.');
    }
    if (!approverAdminId || !isValidUUID(approverAdminId)) {
        throw new Error('INVALID_APPROVER_ADMIN_ID: approverAdminId UUID valide requis.');
    }
    if (String(targetAdminId).toLowerCase() === String(approverAdminId).toLowerCase()) {
        throw new Error('SELF_ENROLLMENT_APPROVAL_FORBIDDEN: Un SuperAdmin ne peut pas co-autoriser son propre enrôlement ou remplacement de clé WebAuthn.');
    }

    const nonce = crypto.randomUUID();
    const issuedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + validitySeconds * 1000).toISOString();
    const canonicalParts = [
        'v1-webauthn-enrollment-approval',
        String(targetAdminId).toLowerCase(),
        String(approverAdminId).toLowerCase(),
        String(purpose).trim(),
        issuedAt,
        expiresAt,
        nonce
    ];
    if (webauthnChallengeId && approverCredentialId) {
        canonicalParts.push(String(webauthnChallengeId).toLowerCase(), String(approverCredentialId));
    }
    const canonical = canonicalParts.join('|');

    const activeSecret = getActiveAuthoritySecretKey(getEffectiveAuthoritySecret(secretKey));
    const signature = crypto.createHmac('sha256', activeSecret).update(canonical, 'utf8').digest('hex').toLowerCase();

    const tokenObj = {
        version: '1.0',
        target_admin_id: String(targetAdminId).toLowerCase(),
        approver_admin_id: String(approverAdminId).toLowerCase(),
        purpose: String(purpose).trim(),
        issued_at: issuedAt,
        expires_at: expiresAt,
        nonce,
        signature
    };
    if (webauthnChallengeId && approverCredentialId) {
        tokenObj.auth_method = 'webauthn';
        tokenObj.webauthn_challenge_id = String(webauthnChallengeId).toLowerCase();
        tokenObj.approver_credential_id = String(approverCredentialId);
    }
    return tokenObj;
}

/**
 * Chantier D.2.3 : Crée un challenge WebAuthn matériel (action_type = 'enroll_approve')
 * pour qu'un second SuperAdmin distinct confirme physiquement l'enrôlement ou le remplacement
 * de l'authentificateur d'un SuperAdmin cible.
 */
async function createEnrollmentApprovalChallenge({
    targetAdminId,
    approverAdminId,
    purpose = 'credential_replacement',
    rpId = DEFAULT_RP_ID,
    origin = DEFAULT_ORIGIN,
    validitySeconds = CHALLENGE_VALIDITY_SECONDS
}) {
    if (!targetAdminId || !isValidUUID(targetAdminId)) {
        throw new Error('INVALID_ADMIN_ID: targetAdminId UUID valide requis.');
    }
    if (!approverAdminId || !isValidUUID(approverAdminId)) {
        throw new Error('INVALID_APPROVER_ADMIN_ID: approverAdminId UUID valide requis.');
    }
    if (String(targetAdminId).toLowerCase() === String(approverAdminId).toLowerCase()) {
        throw new Error('SELF_ENROLLMENT_APPROVAL_FORBIDDEN: Un SuperAdmin ne peut pas co-autoriser son propre enrôlement ou remplacement de clé WebAuthn.');
    }

    const challengeBytes = crypto.randomBytes(32).toString('base64url');
    const canonicalPayload = `v1-enroll-approve|${String(targetAdminId).toLowerCase()}|${String(purpose).trim()}`;
    const now = Date.now();
    const expiresAt = new Date(now + validitySeconds * 1000).toISOString();
    let challengeId = crypto.randomUUID();

    const pool = getAuthorityPool();
    if (pool) {
        const dbRes = await pool.query(
            `SELECT yziow_refund_auth.store_webauthn_challenge(
                $1::UUID, 'enroll_approve'::TEXT, $2::TEXT, $3::TEXT,
                NULL::UUID, NULL::UUID, NULL::TEXT, NULL::BIGINT, NULL::TEXT, NULL::TEXT,
                $4::TEXT, $5::TEXT, $6::INTEGER
            ) AS challenge_id`,
            [String(approverAdminId).toLowerCase(), challengeBytes, canonicalPayload, rpId, origin, validitySeconds]
        );
        challengeId = dbRes.rows[0].challenge_id;
    }

    inMemoryChallenges.set(challengeBytes, {
        challenge_id: challengeId,
        admin_id: String(approverAdminId).toLowerCase(),
        action_type: 'enroll_approve',
        challenge_bytes: challengeBytes,
        canonical_payload: canonicalPayload,
        rp_id: rpId,
        origin,
        created_at: new Date(now).toISOString(),
        expires_at: expiresAt,
        consumed_at: null
    });

    return {
        challengeId,
        challenge: challengeBytes,
        targetAdminId: String(targetAdminId).toLowerCase(),
        approverAdminId: String(approverAdminId).toLowerCase(),
        purpose: String(purpose).trim(),
        rpId,
        origin,
        timeout: validitySeconds * 1000
    };
}

/**
 * Chantier D.2.3 : Vérifie l'assertion matérielle WebAuthn (UP=1, UV=1) du second SuperAdmin
 * et émet un jeton de co-autorisation d'enrôlement/remplacement adossé au challenge consommé.
 */
async function issueConfirmedEnrollmentApprovalToken({
    targetAdminId,
    approverAdminId,
    purpose = 'credential_replacement',
    webauthnAssertion,
    rpId = DEFAULT_RP_ID,
    origin = DEFAULT_ORIGIN,
    secretKey = null
}) {
    if (!targetAdminId || !isValidUUID(targetAdminId) || !approverAdminId || !isValidUUID(approverAdminId)) {
        return { valid: false, code: 'INVALID_ADMIN_ID', message: 'Identifiants targetAdminId et approverAdminId valides requis.' };
    }
    if (String(targetAdminId).toLowerCase() === String(approverAdminId).toLowerCase()) {
        return { valid: false, code: 'SELF_ENROLLMENT_APPROVAL_FORBIDDEN', message: 'Auto-approbation interdite.' };
    }
    if (!webauthnAssertion || typeof webauthnAssertion !== 'object') {
        return { valid: false, code: 'HARDWARE_ENROLLMENT_CO_AUTH_REQUIRED', message: 'Assertion matérielle WebAuthn du second SuperAdmin requise.' };
    }

    let clientChallenge = null;
    try {
        const clientDataBuf = toBuffer(webauthnAssertion.clientDataJSON);
        const parsed = JSON.parse(clientDataBuf.toString('utf8'));
        clientChallenge = parsed.challenge;
    } catch (_e) {
        return { valid: false, code: 'INVALID_CLIENT_DATA_JSON', message: 'clientDataJSON malformé.' };
    }

    const assertionResult = await verifyWebAuthnAssertion({
        adminId: approverAdminId,
        credentialId: webauthnAssertion.credentialId,
        clientDataJSON: webauthnAssertion.clientDataJSON,
        authenticatorData: webauthnAssertion.authenticatorData,
        signature: webauthnAssertion.signature,
        expectedChallenge: clientChallenge,
        expectedRpId: rpId,
        expectedOrigin: origin,
        requireUserVerification: true,
        expectedEnrollmentApproval: {
            targetAdminId: String(targetAdminId).toLowerCase(),
            purpose: String(purpose).trim()
        }
    });

    if (!assertionResult.valid) {
        return { valid: false, code: assertionResult.code, message: assertionResult.message };
    }

    const token = issueEnrollmentApprovalToken({
        targetAdminId,
        approverAdminId,
        purpose,
        secretKey,
        webauthnChallengeId: assertionResult.challengeId,
        approverCredentialId: assertionResult.credentialId
    });

    return {
        valid: true,
        enrollmentApprovalToken: token
    };
}

/**
 * Chantier D.2.3 (Sécurité du premier enrôlement / Bootstrap TOFU hors bande) :
 * Génère un jeton d'amorçage hors bande (oob_bootstrap) à usage unique, lié à un credentialId précis
 * et signé avec YZIOW_WEBAUTHN_BOOTSTRAP_SECRET (secret détenu exclusivement par l'opérateur
 * de sécurité / CLI d'autorité hors bande, jamais présent dans le backend applicatif).
 */
function issueOutOfBandBootstrapToken({
    targetAdminId,
    approverAdminId,
    credentialId,
    purpose = 'initial_oob_bootstrap',
    validitySeconds = 300,
    bootstrapSecretKey = null
}) {
    if (!targetAdminId || !isValidUUID(targetAdminId)) {
        throw new Error('INVALID_ADMIN_ID: targetAdminId UUID valide requis.');
    }
    if (!approverAdminId || !isValidUUID(approverAdminId)) {
        throw new Error('INVALID_APPROVER_ADMIN_ID: approverAdminId UUID valide requis.');
    }
    if (String(targetAdminId).toLowerCase() === String(approverAdminId).toLowerCase()) {
        throw new Error('SELF_ENROLLMENT_APPROVAL_FORBIDDEN: Auto-approbation d\'amorçage hors bande interdite.');
    }
    if (!credentialId || typeof credentialId !== 'string' || credentialId.trim() === '') {
        throw new Error('INVALID_CREDENTIAL_ID: credentialId requis pour lier le jeton d\'amorçage hors bande.');
    }

    const activeBootstrapSecret = getEffectiveBootstrapSecret(bootstrapSecretKey);
    if (!activeBootstrapSecret || typeof activeBootstrapSecret !== 'string' || activeBootstrapSecret.trim() === '') {
        throw new Error('BOOTSTRAP_SECRET_NOT_CONFIGURED: Secret hors bande YZIOW_WEBAUTHN_BOOTSTRAP_SECRET requis pour émettre un jeton d\'amorçage.');
    }

    const nonce = crypto.randomUUID();
    const issuedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + validitySeconds * 1000).toISOString();
    const cleanCredId = String(credentialId).trim();
    const canonical = [
        'v1-webauthn-oob-bootstrap',
        String(targetAdminId).toLowerCase(),
        String(approverAdminId).toLowerCase(),
        cleanCredId,
        String(purpose).trim(),
        issuedAt,
        expiresAt,
        nonce
    ].join('|');

    const signature = crypto
        .createHmac('sha256', activeBootstrapSecret.trim())
        .update(canonical, 'utf8')
        .digest('hex')
        .toLowerCase();

    return {
        version: '1.0',
        auth_method: 'oob_bootstrap',
        target_admin_id: String(targetAdminId).toLowerCase(),
        approver_admin_id: String(approverAdminId).toLowerCase(),
        credential_id: cleanCredId,
        purpose: String(purpose).trim(),
        issued_at: issuedAt,
        expires_at: expiresAt,
        nonce,
        signature
    };
}

async function verifyEnrollmentApprovalToken(token, expectedTargetAdminId, dbClient = null, secretKey = null, options = {}) {
    if (!token || typeof token !== 'object') {
        return {
            valid: false,
            code: 'ENROLLMENT_CO_AUTHORIZATION_REQUIRED',
            message: 'Jeton de co-autorisation d\'un second SuperAdmin obligatoire pour enregistrer ou remplacer une clé WebAuthn (protection contre session volée).'
        };
    }

    const targetId = String(token.target_admin_id || '').toLowerCase();
    const approverId = String(token.approver_admin_id || '').toLowerCase();
    if (!isValidUUID(targetId) || !isValidUUID(approverId)) {
        return { valid: false, code: 'INVALID_ENROLLMENT_APPROVAL_TOKEN', message: 'Identifiants du jeton de co-autorisation invalides.' };
    }
    if (targetId !== String(expectedTargetAdminId).toLowerCase()) {
        return { valid: false, code: 'INVALID_ENROLLMENT_APPROVAL_TOKEN', message: 'Le jeton de co-autorisation cible un autre administrateur.' };
    }
    if (targetId === approverId) {
        return { valid: false, code: 'SELF_ENROLLMENT_APPROVAL_FORBIDDEN', message: 'Auto-approbation d\'enrôlement WebAuthn interdite.' };
    }

    const expiresAtMs = new Date(token.expires_at).getTime();
    if (Number.isNaN(expiresAtMs) || expiresAtMs < Date.now()) {
        return { valid: false, code: 'INVALID_ENROLLMENT_APPROVAL_TOKEN', message: 'Jeton de co-autorisation d\'enrôlement expiré.' };
    }
    if (!token.nonce || consumedEnrollmentTokens.has(token.nonce)) {
        return { valid: false, code: 'INVALID_ENROLLMENT_APPROVAL_TOKEN', message: 'Jeton de co-autorisation déjà consommé ou sans nonce.' };
    }

    // Cas 1 : Jeton d'amorçage initial hors bande (oob_bootstrap) signé avec YZIOW_WEBAUTHN_BOOTSTRAP_SECRET
    if (token.auth_method === 'oob_bootstrap') {
        const activeBootstrapSecret = getEffectiveBootstrapSecret(options.bootstrapSecretKey);
        if (!activeBootstrapSecret || typeof activeBootstrapSecret !== 'string' || activeBootstrapSecret.trim() === '') {
            return {
                valid: false,
                code: 'BOOTSTRAP_OUT_OF_BAND_AUTHORIZATION_REQUIRED',
                message: 'Secret d\'amorçage hors bande non configuré sur l\'autorité.'
            };
        }
        if (options.expectedCredentialId && String(token.credential_id || '').trim() !== String(options.expectedCredentialId).trim()) {
            return {
                valid: false,
                code: 'INVALID_ENROLLMENT_APPROVAL_TOKEN',
                message: 'Le jeton d\'amorçage hors bande est lié à un autre credentialId.'
            };
        }
        const oobCanonical = [
            'v1-webauthn-oob-bootstrap',
            targetId,
            approverId,
            String(token.credential_id || '').trim(),
            String(token.purpose || '').trim(),
            String(token.issued_at || '').trim(),
            String(token.expires_at || '').trim(),
            String(token.nonce || '').trim()
        ].join('|');
        const expectedOobSig = crypto
            .createHmac('sha256', activeBootstrapSecret.trim())
            .update(oobCanonical, 'utf8')
            .digest('hex')
            .toLowerCase();
        const actualOobSig = String(token.signature || '').trim().toLowerCase();
        if (!/^[a-f0-9]{64}$/.test(actualOobSig) || !crypto.timingSafeEqual(Buffer.from(actualOobSig, 'hex'), Buffer.from(expectedOobSig, 'hex'))) {
            return {
                valid: false,
                code: 'BOOTSTRAP_OUT_OF_BAND_AUTHORIZATION_REQUIRED',
                message: 'Signature du jeton d\'amorçage hors bande invalide.'
            };
        }
        if (dbClient) {
            const approverRes = await dbClient.query(
                `SELECT yziow_refund_auth.check_superadmin_active($1::UUID) AS is_active`,
                [approverId]
            );
            if (approverRes.rowCount === 0 || approverRes.rows[0].is_active !== true) {
                return { valid: false, code: 'UNAUTHORIZED_ADMIN', message: 'Le second SuperAdmin co-autorisateur est introuvable ou inactif.' };
            }
        }
        consumedEnrollmentTokens.add(token.nonce);
        return { valid: true, approverAdminId: approverId };
    }

    const canonicalParts = [
        'v1-webauthn-enrollment-approval',
        targetId,
        approverId,
        String(token.purpose || '').trim(),
        String(token.issued_at || '').trim(),
        String(token.expires_at || '').trim(),
        String(token.nonce || '').trim()
    ];
    if (token.webauthn_challenge_id && token.approver_credential_id) {
        canonicalParts.push(String(token.webauthn_challenge_id).toLowerCase(), String(token.approver_credential_id));
    }
    const canonical = canonicalParts.join('|');

    let activeSecret;
    try {
        activeSecret = getActiveAuthoritySecretKey(getEffectiveAuthoritySecret(secretKey));
    } catch (err) {
        return { valid: false, code: 'AUTHORITY_SECRET_NOT_CONFIGURED', message: err.message };
    }

    const expectedSig = crypto.createHmac('sha256', activeSecret).update(canonical, 'utf8').digest('hex').toLowerCase();
    const actualSig = String(token.signature || '').trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(actualSig) || !crypto.timingSafeEqual(Buffer.from(actualSig, 'hex'), Buffer.from(expectedSig, 'hex'))) {
        return { valid: false, code: 'INVALID_ENROLLMENT_APPROVAL_TOKEN', message: 'Signature du jeton de co-autorisation invalide.' };
    }

    if (dbClient) {
        const approverRes = await dbClient.query(
            `SELECT yziow_refund_auth.check_superadmin_active($1::UUID) AS is_active`,
            [approverId]
        );
        if (approverRes.rowCount === 0 || approverRes.rows[0].is_active !== true) {
            return { valid: false, code: 'UNAUTHORIZED_ADMIN', message: 'Le second SuperAdmin co-autorisateur est introuvable ou inactif.' };
        }

        // Chantier D.2.3 : Si le second SuperAdmin possède un authentificateur WebAuthn actif
        // (ou si requireHardwareCoAuth / requireBootstrapOrHardwareCoAuth est activé), la co-autorisation
        // doit obligatoirement être adossée soit à un challenge matériel 'enroll_approve' consommé dans PostgreSQL,
        // soit (pour le tout premier enrôlement) à un jeton d'amorçage hors bande oob_bootstrap.
        const approverCredRes = await dbClient.query(
            `SELECT credential_id FROM public.superadmin_webauthn_credentials
             WHERE admin_id = $1 AND is_active = true AND revoked_at IS NULL`,
            [approverId]
        );
        const approverHasActiveWebAuthn = approverCredRes.rowCount > 0;

        if (options.requireBootstrapOrHardwareCoAuth === true && !approverHasActiveWebAuthn) {
            return {
                valid: false,
                code: 'BOOTSTRAP_OUT_OF_BAND_AUTHORIZATION_REQUIRED',
                message: 'Aucun authentificateur matériel actif de référence n\'existe pour co-autoriser cet enrôlement : un jeton d\'amorçage hors bande (oob_bootstrap) indépendant du backend est obligatoire.'
            };
        }

        const requireHardware =
            options.requireHardwareCoAuth === true ||
            options.requireBootstrapOrHardwareCoAuth === true ||
            approverHasActiveWebAuthn;

        if (requireHardware) {
            if (!token.webauthn_challenge_id || !isValidUUID(token.webauthn_challenge_id) || !token.approver_credential_id) {
                return {
                    valid: false,
                    code: 'HARDWARE_ENROLLMENT_CO_AUTH_REQUIRED',
                    message: 'Le remplacement ou l\'enrôlement d\'un authentificateur exige une confirmation matérielle WebAuthn (UP=1, UV=1) du second SuperAdmin.'
                };
            }
            const chalCheck = await dbClient.query(
                `SELECT * FROM yziow_refund_auth.webauthn_challenges
                 WHERE challenge_id = $1::UUID`,
                [token.webauthn_challenge_id]
            );
            if (chalCheck.rowCount === 0) {
                return {
                    valid: false,
                    code: 'HARDWARE_ENROLLMENT_CO_AUTH_REQUIRED',
                    message: 'Challenge matériel de co-autorisation d\'enrôlement introuvable dans PostgreSQL.'
                };
            }
            const cRow = chalCheck.rows[0];
            const expectedCanon = `v1-enroll-approve|${targetId}|${String(token.purpose || '').trim()}`;
            if (
                !cRow.consumed_at ||
                cRow.action_type !== 'enroll_approve' ||
                String(cRow.admin_id).toLowerCase() !== approverId ||
                cRow.consumed_by_credential_id !== String(token.approver_credential_id) ||
                cRow.canonical_payload !== expectedCanon
            ) {
                return {
                    valid: false,
                    code: 'HARDWARE_ENROLLMENT_CO_AUTH_REQUIRED',
                    message: 'Le challenge matériel de co-autorisation d\'enrôlement n\'est pas consommé ou ne correspond pas au SuperAdmin cible.'
                };
            }
        }
    }

    consumedEnrollmentTokens.add(token.nonce);
    return { valid: true, approverAdminId: approverId };
}

/**
 * Chantier D.2.3 : Contre-vérification indépendante du dossier de remboursement dans PostgreSQL
 * par l'autorité WebAuthn (via yziow_refund_auth.inspect_authoritative_refund_dossier).
 * Empêche un backend compromis de présenter de fausses métadonnées (montant, transaction, hash,
 * ou même administrateur initiateur/approbateur) à l'autorité WebAuthn.
 */
async function inspectAuthoritativeRefundDossier({
    adminId,
    actionType,
    periodId,
    reconciliationId = null,
    providerTransactionId,
    verifiedAmountMinor,
    currency = 'XOF',
    proofDocumentHash
}) {
    const pool = getAuthorityPool();
    if (!pool) {
        return { valid: false, code: 'AUTHORITY_DB_NOT_CONFIGURED', message: 'Connexion PostgreSQL de l\'autorité indépendante non configurée.' };
    }

    let d;
    try {
        const res = await pool.query(
            `SELECT yziow_refund_auth.inspect_authoritative_refund_dossier($1::UUID, $2::TEXT, $3::UUID, $4::UUID) AS dossier`,
            [
                String(adminId).toLowerCase(),
                String(actionType).trim(),
                String(periodId).toLowerCase(),
                reconciliationId ? String(reconciliationId).toLowerCase() : null
            ]
        );
        d = res.rows[0] && res.rows[0].dossier;
    } catch (err) {
        const msg = err.message || String(err);
        if (msg.includes('DUAL_CUSTODY_VIOLATION')) {
            return { valid: false, code: 'DUAL_CUSTODY_VIOLATION', message: msg };
        }
        if (msg.includes('UNAUTHORIZED_ADMIN') || msg.includes('REVOKED_ADMIN')) {
            return { valid: false, code: 'UNAUTHORIZED_ADMIN', message: msg };
        }
        return { valid: false, code: 'AUTHORITATIVE_DOSSIER_MISMATCH', message: msg };
    }

    if (!d) {
        return { valid: false, code: 'AUTHORITATIVE_DOSSIER_MISMATCH', message: 'Impossible d\'inspecter le dossier de référence dans PostgreSQL.' };
    }
    if (
        String(d.provider_transaction_id || '').trim() !== String(providerTransactionId || '').trim() ||
        Number(d.verified_amount_minor) !== Number(verifiedAmountMinor) ||
        String(d.currency || '').trim().toUpperCase() !== String(currency || '').trim().toUpperCase()
    ) {
        return {
            valid: false,
            code: 'AUTHORITATIVE_DOSSIER_MISMATCH',
            message: 'Les paramètres déclarés par le backend (transaction, montant ou devise) divergent de l\'état de référence PostgreSQL.'
        };
    }

    if (actionType === 'approve') {
        if (d.reconciliation_status !== 'pending_approval') {
            return {
                valid: false,
                code: 'AUTHORITATIVE_DOSSIER_MISMATCH',
                message: 'Dossier de rapprochement non en attente d\'approbation dans PostgreSQL.'
            };
        }
        if (String(d.initiator_admin_id || '').toLowerCase() === String(adminId).toLowerCase()) {
            return {
                valid: false,
                code: 'DUAL_CUSTODY_VIOLATION',
                message: 'Violation de la séparation des pouvoirs détectée par l\'autorité : l\'approbateur est identique à l\'initiateur.'
            };
        }
        if (
            String(d.period_id || '').toLowerCase() !== String(periodId).toLowerCase() ||
            String(d.proof_document_hash || '').trim().toLowerCase() !== String(proofDocumentHash || '').trim().toLowerCase()
        ) {
            return {
                valid: false,
                code: 'AUTHORITATIVE_DOSSIER_MISMATCH',
                message: 'Les paramètres d\'approbation déclarés par le backend divergent du dossier enregistré dans PostgreSQL.'
            };
        }
    }

    return { valid: true, dossier: d };
}

/**
 * -----------------------------------------------------------------------------
 * 1. ENREGISTREMENT SÉCURISÉ D'UN AUTHENTIFICATEUR WEBAUTHN (P4 & P5)
 * -----------------------------------------------------------------------------
 */

/**
 * Crée et persiste dans PostgreSQL un challenge d'enregistrement WebAuthn à usage unique.
 */
async function createRegistrationChallenge(adminId, options = {}) {
    if (!adminId || !isValidUUID(adminId)) {
        throw new Error('INVALID_ADMIN_ID: UUID adminId valide requis pour l\'enregistrement WebAuthn.');
    }

    const rpId = options.rpId || DEFAULT_RP_ID;
    const origin = options.origin || DEFAULT_ORIGIN;
    const validitySeconds = options.validitySeconds || CHALLENGE_VALIDITY_SECONDS;
    const challengeBytes = options.customChallenge || crypto.randomBytes(32).toString('base64url');
    const now = Date.now();
    const expiresAt = new Date(now + validitySeconds * 1000).toISOString();

    let challengeId = crypto.randomUUID();
    const pool = getAuthorityPool();
    if (pool) {
        const dbRes = await pool.query(
            `SELECT yziow_refund_auth.store_webauthn_challenge(
                $1::UUID, 'register'::TEXT, $2::TEXT, NULL::TEXT,
                NULL::UUID, NULL::UUID, NULL::TEXT, NULL::BIGINT, NULL::TEXT, NULL::TEXT,
                $3::TEXT, $4::TEXT, $5::INTEGER
            ) AS challenge_id`,
            [String(adminId).toLowerCase(), challengeBytes, rpId, origin, validitySeconds]
        );
        challengeId = dbRes.rows[0].challenge_id;
    }

    const record = {
        challenge_id: challengeId,
        admin_id: String(adminId).toLowerCase(),
        action_type: 'register',
        challenge_bytes: challengeBytes,
        rp_id: rpId,
        origin,
        created_at: new Date(now).toISOString(),
        expires_at: expiresAt,
        consumed_at: null
    };

    inMemoryChallenges.set(challengeBytes, record);

    return {
        challengeId,
        challenge: challengeBytes,
        rp: {
            name: 'YZIOW Platform SuperAdmin Authority',
            id: rpId
        },
        user: {
            id: String(adminId).toLowerCase()
        },
        origin,
        timeout: validitySeconds * 1000
    };
}

/**
 * Vérifie via @simplewebauthn/server et enregistre dans PostgreSQL un authentificateur WebAuthn.
 */
async function verifyAndRegisterCredential({
    adminId,
    credentialId,
    publicKeySpki = null,
    attestationObject = null,
    clientDataJSON,
    authenticatorData = null,
    expectedChallenge,
    enrollmentApprovalToken = null,
    requireEnrollmentApproval = false,
    requireHardwareCoAuth = false,
    requireBootstrapOrHardwareCoAuth = false,
    bootstrapSecretKey = null,
    rpId = DEFAULT_RP_ID,
    origin = DEFAULT_ORIGIN,
    aaguid = null,
    transports = ['internal', 'usb', 'nfc'],
    secretKey = null
}) {
    if (!adminId || !isValidUUID(adminId)) {
        return { valid: false, code: 'INVALID_ADMIN_ID', message: 'UUID adminId invalide.' };
    }
    if (!credentialId || typeof credentialId !== 'string' || credentialId.trim() === '') {
        return { valid: false, code: 'INVALID_CREDENTIAL_ID', message: 'credentialId non vide requis.' };
    }
    if (!attestationObject && (!publicKeySpki || typeof publicKeySpki !== 'string' || publicKeySpki.trim() === '')) {
        return { valid: false, code: 'INVALID_PUBLIC_KEY', message: 'attestationObject ou clé publique SPKI requis.' };
    }

    if (publicKeySpki && !attestationObject) {
        try {
            crypto.createPublicKey(publicKeySpki);
        } catch (err) {
            return { valid: false, code: 'INVALID_PUBLIC_KEY_FORMAT', message: `Format de clé publique invalide : ${err.message}` };
        }
    }

    const pool = getAuthorityPool();
    const client = pool ? await pool.connect() : null;

    try {
        if (client) {
            await client.query('BEGIN');
        }

        // 1. Lecture verrouillée (FOR UPDATE via SECURITY DEFINER) du challenge d'enregistrement dans PostgreSQL
        let challengeRecord = null;
        if (client) {
            const chalRes = await client.query(
                `SELECT * FROM yziow_refund_auth.get_webauthn_challenge_for_update($1::TEXT)`,
                [expectedChallenge]
            );
            if (chalRes.rowCount > 0) {
                challengeRecord = chalRes.rows[0];
            }
        } else {
            challengeRecord = inMemoryChallenges.get(expectedChallenge) || null;
        }

        if (!challengeRecord) {
            if (client) await client.query('ROLLBACK');
            return { valid: false, code: 'CHALLENGE_NOT_FOUND', message: 'Challenge d\'enregistrement introuvable ou déjà supprimé.' };
        }
        if (challengeRecord.consumed_at) {
            if (client) await client.query('ROLLBACK');
            return { valid: false, code: 'CHALLENGE_ALREADY_CONSUMED', message: 'Ce challenge a déjà été utilisé (anti-rejeu).' };
        }
        const isExpired = challengeRecord.is_expired !== undefined
            ? challengeRecord.is_expired
            : (new Date(challengeRecord.expires_at).getTime() < Date.now());
        if (isExpired) {
            if (client) await client.query('ROLLBACK');
            return { valid: false, code: 'CHALLENGE_EXPIRED', message: 'Challenge d\'enregistrement expiré.' };
        }
        if (String(challengeRecord.admin_id).toLowerCase() !== String(adminId).toLowerCase()) {
            if (client) await client.query('ROLLBACK');
            return { valid: false, code: 'UNAUTHORIZED_ADMIN_REGISTRATION', message: 'Tentative d\'enregistrement pour un administrateur non concordant.' };
        }

        // 2. Vérification de l'existence d'un authentificateur actif et procédure de confiance renforcée (P4 & D.2.3)
        let hasExistingActiveCredential = false;
        if (client) {
            const existingRes = await client.query(
                `SELECT id FROM public.superadmin_webauthn_credentials
                 WHERE admin_id = $1 AND is_active = true AND revoked_at IS NULL`,
                [String(adminId).toLowerCase()]
            );
            hasExistingActiveCredential = existingRes.rowCount > 0;
        } else {
            for (const cred of inMemoryCredentials.values()) {
                if (cred.admin_id === String(adminId).toLowerCase() && cred.is_active && !cred.revoked_at) {
                    hasExistingActiveCredential = true;
                    break;
                }
            }
        }

        let approverAdminId = null;
        if (requireEnrollmentApproval || requireBootstrapOrHardwareCoAuth || hasExistingActiveCredential || enrollmentApprovalToken !== null) {
            const approvalCheck = await verifyEnrollmentApprovalToken(
                enrollmentApprovalToken,
                adminId,
                client,
                secretKey,
                {
                    requireHardwareCoAuth,
                    requireBootstrapOrHardwareCoAuth,
                    expectedCredentialId: credentialId,
                    bootstrapSecretKey
                }
            );
            if (!approvalCheck.valid) {
                if (client) await client.query('ROLLBACK');
                return approvalCheck;
            }
            approverAdminId = approvalCheck.approverAdminId;
        }

        // 3. Décodage et pré-vérification de clientDataJSON
        let parsedClientData;
        let clientDataB64Url;
        try {
            const clientDataBuf = toBuffer(clientDataJSON);
            parsedClientData = JSON.parse(clientDataBuf.toString('utf8'));
            clientDataB64Url = clientDataBuf.toString('base64url');
        } catch (_e) {
            if (client) await client.query('ROLLBACK');
            return { valid: false, code: 'INVALID_CLIENT_DATA_JSON', message: 'clientDataJSON malformé.' };
        }

        if (parsedClientData.type !== 'webauthn.create') {
            if (client) await client.query('ROLLBACK');
            return { valid: false, code: 'INVALID_WEBAUTHN_TYPE', message: `Type clientData attendu "webauthn.create", reçu "${parsedClientData.type}".` };
        }
        if (parsedClientData.challenge !== expectedChallenge) {
            if (client) await client.query('ROLLBACK');
            return { valid: false, code: 'CHALLENGE_MISMATCH', message: 'Le challenge de la réponse ne correspond pas au challenge émis.' };
        }
        if (parsedClientData.origin !== origin) {
            if (client) await client.query('ROLLBACK');
            return { valid: false, code: 'INVALID_ORIGIN', message: `Origine non autorisée (${parsedClientData.origin} vs ${origin}).` };
        }

        // Vérification d'authenticatorData explicite si fourni séparément
        if (authenticatorData) {
            const authDataBuf = toBuffer(authenticatorData);
            if (authDataBuf.length < 37) {
                if (client) await client.query('ROLLBACK');
                return { valid: false, code: 'INVALID_AUTHENTICATOR_DATA', message: 'authenticatorData trop court (< 37 octets).' };
            }
            const expectedRpIdHash = crypto.createHash('sha256').update(rpId).digest();
            const actualRpIdHash = authDataBuf.subarray(0, 32);
            if (!crypto.timingSafeEqual(expectedRpIdHash, actualRpIdHash)) {
                if (client) await client.query('ROLLBACK');
                return { valid: false, code: 'INVALID_RP_ID', message: 'Le hash de RP ID ne correspond pas au domaine attendu.' };
            }
            const flags = authDataBuf[32];
            if ((flags & 0x01) === 0) {
                if (client) await client.query('ROLLBACK');
                return { valid: false, code: 'USER_PRESENCE_REQUIRED', message: 'Présence utilisateur (UP) requise mais absente.' };
            }
        }

        // 4. Construction ou validation directe de l'attestationObject CBOR & COSE via @simplewebauthn/server (P4)
        let effectiveAttestationB64Url = null;
        if (attestationObject !== null && attestationObject !== undefined) {
            if (typeof attestationObject !== 'string' && !Buffer.isBuffer(attestationObject) && !(attestationObject instanceof Uint8Array)) {
                if (client) await client.query('ROLLBACK');
                return { valid: false, code: 'INVALID_ATTESTATION_OBJECT', message: 'Format attestationObject invalide.' };
            }
            effectiveAttestationB64Url = Buffer.isBuffer(attestationObject) || (attestationObject instanceof Uint8Array)
                ? Buffer.from(attestationObject).toString('base64url')
                : String(attestationObject).trim();
        } else {
            effectiveAttestationB64Url = buildWebAuthnAttestationObject({
                publicKeySpki,
                credentialId,
                rpId,
                aaguid: aaguid || '00000000-0000-0000-0000-000000000000',
                userPresent: true,
                userVerified: true
            });
        }

        // Inspection CBOR et COSE stricte avant et pendant verifyRegistrationResponse
        let resolvedSpki = publicKeySpki;
        let resolvedCoseB64Url = null;
        let resolvedCoseAlg = COSEALG.ES256;
        let registrationInfo = null;

        try {
            const attBuf = isoBase64URL.toBuffer(effectiveAttestationB64Url);
            const decodedAtt = decodeAttestationObject(attBuf);
            if (!(decodedAtt instanceof Map)) {
                throw new Error('INVALID_ATTESTATION_OBJECT: CBOR attestationObject n\'est pas une Map.');
            }
            const fmt = decodedAtt.get('fmt');
            const authDataBytes = decodedAtt.get('authData');
            const attStmt = decodedAtt.get('attStmt');
            if (typeof fmt !== 'string' || !authDataBytes || !(attStmt instanceof Map)) {
                throw new Error('INVALID_ATTESTATION_OBJECT: Champs CBOR obligatoires (fmt, authData, attStmt) manquants ou invalides.');
            }

            const parsedAuth = parseAuthenticatorData(authDataBytes);
            if (!parsedAuth.flags.at || !parsedAuth.credentialPublicKey || !parsedAuth.credentialID) {
                throw new Error('INVALID_ATTESTATION_OBJECT: Données de clé attestée (attestedCredentialData / credentialPublicKey) absentes de authData.');
            }

            // Décodage et validation de la clé publique COSE
            const coseConversion = cosePublicKeyBytesToSpkiPem(parsedAuth.credentialPublicKey);
            resolvedSpki = coseConversion.publicKeySpki;
            resolvedCoseAlg = coseConversion.coseAlg;
            resolvedCoseB64Url = Buffer.from(parsedAuth.credentialPublicKey).toString('base64url');

            // Appel officiel @simplewebauthn/server verifyRegistrationResponse
            const b64CredId = toBase64UrlId(credentialId);
            const verification = await verifyRegistrationResponse({
                response: {
                    id: b64CredId,
                    rawId: b64CredId,
                    type: 'public-key',
                    response: {
                        clientDataJSON: clientDataB64Url,
                        attestationObject: effectiveAttestationB64Url,
                        transports
                    }
                },
                expectedChallenge,
                expectedOrigin: origin,
                expectedRPID: rpId,
                requireUserPresence: true,
                requireUserVerification: true,
                supportedAlgorithmIDs: SUPPORTED_COSE_ALGORITHMS
            });

            if (!verification.verified || !verification.registrationInfo) {
                throw new Error('INVALID_ATTESTATION_OBJECT: La vérification @simplewebauthn/server a rejeté l\'enregistrement.');
            }
            registrationInfo = verification.registrationInfo;
        } catch (verifErr) {
            if (client) await client.query('ROLLBACK');
            const msg = verifErr.message || String(verifErr);
            if (msg.includes('UNSUPPORTED_COSE_ALGORITHM') || msg.includes('Unexpected public key alg')) {
                return { valid: false, code: 'UNSUPPORTED_COSE_ALGORITHM', message: msg };
            }
            if (msg.includes('INVALID_COSE_PUBLIC_KEY') || msg.includes('missing numeric alg') || msg.includes('COSE public key')) {
                return { valid: false, code: 'INVALID_COSE_PUBLIC_KEY', message: msg };
            }
            if (msg.includes('User presence')) {
                return { valid: false, code: 'USER_PRESENCE_REQUIRED', message: msg };
            }
            if (msg.includes('User verification')) {
                return { valid: false, code: 'USER_VERIFICATION_REQUIRED', message: msg };
            }
            if (msg.includes('RP ID')) {
                return { valid: false, code: 'INVALID_RP_ID', message: msg };
            }
            if (msg.includes('origin')) {
                return { valid: false, code: 'INVALID_ORIGIN', message: msg };
            }
            return {
                valid: false,
                code: 'INVALID_ATTESTATION_OBJECT',
                message: `Validation @simplewebauthn/server échouée : ${msg}`
            };
        }

        // 5. Consommation atomique du challenge et persistance du credential dans PostgreSQL (P5)
        if (client) {
            await client.query(
                `SELECT yziow_refund_auth.consume_webauthn_challenge($1::TEXT, $2::UUID, 'register'::TEXT, $3::TEXT)`,
                [expectedChallenge, String(adminId).toLowerCase(), credentialId]
            );

            if (hasExistingActiveCredential) {
                await client.query(
                    `UPDATE public.superadmin_webauthn_credentials
                     SET is_active = false, revoked_at = clock_timestamp()
                     WHERE admin_id = $1 AND is_active = true`,
                    [String(adminId).toLowerCase()]
                );
            }

            const insertRes = await client.query(
                `INSERT INTO public.superadmin_webauthn_credentials (
                    admin_id, credential_id, public_key_spki, public_key_cose, cose_alg,
                    counter, aaguid, attestation_format, credential_device_type,
                    credential_backed_up, transports, registered_by_approver_id, is_active
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true)
                RETURNING *`,
                [
                    String(adminId).toLowerCase(),
                    credentialId,
                    resolvedSpki,
                    resolvedCoseB64Url,
                    resolvedCoseAlg,
                    registrationInfo.credential.counter || 0,
                    aaguid || registrationInfo.aaguid || null,
                    registrationInfo.fmt || 'none',
                    registrationInfo.credentialDeviceType || 'singleDevice',
                    Boolean(registrationInfo.credentialBackedUp),
                    transports || [],
                    approverAdminId
                ]
            );

            await client.query('COMMIT');

            const dbRow = insertRes.rows[0];
            const credentialRecord = {
                id: dbRow.id,
                admin_id: String(dbRow.admin_id).toLowerCase(),
                credential_id: dbRow.credential_id,
                public_key_spki: dbRow.public_key_spki,
                public_key_cose: dbRow.public_key_cose,
                cose_alg: dbRow.cose_alg,
                counter: Number(dbRow.counter || 0),
                aaguid: dbRow.aaguid,
                attestation_format: dbRow.attestation_format,
                credential_device_type: dbRow.credential_device_type,
                credential_backed_up: dbRow.credential_backed_up,
                transports: dbRow.transports || [],
                registered_by_approver_id: dbRow.registered_by_approver_id
                    ? String(dbRow.registered_by_approver_id).toLowerCase()
                    : null,
                is_active: dbRow.is_active,
                created_at: new Date(dbRow.created_at).toISOString(),
                revoked_at: null,
                last_used_at: null
            };
            inMemoryCredentials.set(credentialId, credentialRecord);

            return {
                valid: true,
                credential: credentialRecord
            };
        }

        // Fallback hors base
        challengeRecord.consumed_at = new Date().toISOString();
        challengeRecord.consumed_by_credential_id = credentialId;

        if (hasExistingActiveCredential) {
            for (const cred of inMemoryCredentials.values()) {
                if (cred.admin_id === String(adminId).toLowerCase() && cred.is_active) {
                    cred.is_active = false;
                    cred.revoked_at = new Date().toISOString();
                }
            }
        }

        const credentialRecord = {
            id: crypto.randomUUID(),
            admin_id: String(adminId).toLowerCase(),
            credential_id: credentialId,
            public_key_spki: resolvedSpki,
            public_key_cose: resolvedCoseB64Url,
            cose_alg: resolvedCoseAlg,
            counter: registrationInfo.credential.counter || 0,
            aaguid: aaguid || registrationInfo.aaguid || null,
            attestation_format: registrationInfo.fmt || 'none',
            credential_device_type: registrationInfo.credentialDeviceType || 'singleDevice',
            credential_backed_up: Boolean(registrationInfo.credentialBackedUp),
            transports: transports || [],
            registered_by_approver_id: approverAdminId,
            is_active: true,
            created_at: new Date().toISOString(),
            revoked_at: null,
            last_used_at: null
        };
        inMemoryCredentials.set(credentialId, credentialRecord);

        return {
            valid: true,
            credential: credentialRecord
        };
    } catch (err) {
        if (client) {
            await client.query('ROLLBACK').catch(() => {});
        }
        return {
            valid: false,
            code: 'REGISTRATION_FAILED',
            message: err.message
        };
    } finally {
        if (client) client.release();
    }
}

/**
 * Révoque un authentificateur SuperAdmin dans PostgreSQL et en mémoire.
 */
async function revokeCredential(credentialId, adminId) {
    const pool = getAuthorityPool();
    if (pool) {
        const res = await pool.query(
            `SELECT * FROM public.superadmin_webauthn_credentials WHERE credential_id = $1`,
            [credentialId]
        );
        if (res.rowCount === 0) {
            return { success: false, code: 'CREDENTIAL_NOT_FOUND', message: 'Authentificateur introuvable.' };
        }
        const cred = res.rows[0];
        if (String(cred.admin_id).toLowerCase() !== String(adminId).toLowerCase()) {
            return { success: false, code: 'UNAUTHORIZED_ADMIN', message: 'Cet authentificateur n\'appartient pas à cet administrateur.' };
        }
        const upd = await pool.query(
            `UPDATE public.superadmin_webauthn_credentials
             SET is_active = false, revoked_at = clock_timestamp()
             WHERE credential_id = $1
             RETURNING *`,
            [credentialId]
        );
        const mem = inMemoryCredentials.get(credentialId);
        if (mem) {
            mem.is_active = false;
            mem.revoked_at = new Date(upd.rows[0].revoked_at).toISOString();
        }
        return { success: true, credential: upd.rows[0] };
    }

    const cred = inMemoryCredentials.get(credentialId);
    if (!cred) {
        return { success: false, code: 'CREDENTIAL_NOT_FOUND', message: 'Authentificateur introuvable.' };
    }
    if (cred.admin_id !== String(adminId).toLowerCase()) {
        return { success: false, code: 'UNAUTHORIZED_ADMIN', message: 'Cet authentificateur n\'appartient pas à cet administrateur.' };
    }
    cred.is_active = false;
    cred.revoked_at = new Date().toISOString();
    return { success: true, credential: cred };
}

/**
 * -----------------------------------------------------------------------------
 * 2. CONFIRMATION PERSONNELLE D'UNE OPÉRATION (INITIATION OU APPROBATION)
 * -----------------------------------------------------------------------------
 */

function computeActionConfirmationChallengeBytes({
    adminId,
    actionType,
    periodId,
    reconciliationId = null,
    providerTransactionId,
    verifiedAmountMinor,
    currency,
    proofDocumentHash
}) {
    const baseCanonical = [
        'v1-webauthn-challenge',
        String(actionType).trim().toLowerCase(),
        String(adminId).trim().toLowerCase(),
        String(periodId).trim().toLowerCase(),
        reconciliationId ? String(reconciliationId).trim().toLowerCase() : '',
        String(providerTransactionId).trim(),
        String(Number(verifiedAmountMinor)),
        String(currency).trim().toUpperCase(),
        String(proofDocumentHash).trim().toLowerCase()
    ].join('|');

    return crypto.createHash('sha256').update(baseCanonical, 'utf8').digest('base64url');
}

/**
 * Crée et persiste dans PostgreSQL (yziow_refund_auth.webauthn_challenges) un challenge
 * d'autorisation d'action WebAuthn lié au dossier exact.
 */
async function createActionConfirmationChallenge({
    adminId,
    actionType, // 'initiate' ou 'approve'
    periodId,
    reconciliationId = null,
    providerTransactionId,
    verifiedAmountMinor,
    currency = 'XOF',
    proofDocumentHash,
    rpId = DEFAULT_RP_ID,
    origin = DEFAULT_ORIGIN,
    validitySeconds = CHALLENGE_VALIDITY_SECONDS,
    customChallenge = null,
    enforceAuthoritativeDossierCheck = false
}) {
    if (!adminId || !isValidUUID(adminId)) {
        throw new Error('INVALID_ADMIN_ID: UUID adminId valide requis.');
    }
    if (actionType !== 'initiate' && actionType !== 'approve') {
        throw new Error('INVALID_ACTION_TYPE: actionType doit valoir "initiate" ou "approve".');
    }
    if (!periodId || !isValidUUID(periodId)) {
        throw new Error('INVALID_PERIOD_ID: UUID periodId valide requis.');
    }
    if (actionType === 'approve' && (!reconciliationId || !isValidUUID(reconciliationId))) {
        throw new Error('INVALID_RECONCILIATION_ID: UUID reconciliationId valide requis pour approbation.');
    }
    if (!providerTransactionId || typeof providerTransactionId !== 'string') {
        throw new Error('INVALID_TRANSACTION_ID: providerTransactionId requis.');
    }
    const amountMinor = Number(verifiedAmountMinor);
    if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
        throw new Error('INVALID_AMOUNT: verifiedAmountMinor entier positif requis.');
    }
    if (!currency) {
        throw new Error('INVALID_CURRENCY: currency requis.');
    }
    if (!proofDocumentHash || !/^[a-fA-F0-9]{64}$/.test(proofDocumentHash.trim())) {
        throw new Error('INVALID_DOCUMENT_HASH: proofDocumentHash SHA-256 valide requis.');
    }

    if (enforceAuthoritativeDossierCheck) {
        const dossierCheck = await inspectAuthoritativeRefundDossier({
            adminId,
            actionType,
            periodId,
            reconciliationId,
            providerTransactionId,
            verifiedAmountMinor: amountMinor,
            currency,
            proofDocumentHash
        });
        if (!dossierCheck.valid) {
            const err = new Error(`${dossierCheck.code}: ${dossierCheck.message}`);
            err.code = dossierCheck.code;
            throw err;
        }
    }

    const challengeBytes = customChallenge || crypto.randomBytes(32).toString('base64url');
    const canonicalPayload = computeActionConfirmationChallengeBytes({
        adminId,
        actionType,
        periodId,
        reconciliationId,
        providerTransactionId,
        verifiedAmountMinor: amountMinor,
        currency,
        proofDocumentHash
    });

    let challengeId = crypto.randomUUID();
    const now = Date.now();
    const expiresAt = new Date(now + validitySeconds * 1000).toISOString();

    const pool = getAuthorityPool();
    if (pool) {
        const dbRes = await pool.query(
            `SELECT yziow_refund_auth.store_webauthn_challenge(
                $1::UUID, $2::TEXT, $3::TEXT, $4::TEXT,
                $5::UUID, $6::UUID, $7::TEXT, $8::BIGINT, $9::TEXT, $10::TEXT,
                $11::TEXT, $12::TEXT, $13::INTEGER
            ) AS challenge_id`,
            [
                String(adminId).toLowerCase(),
                actionType,
                challengeBytes,
                canonicalPayload,
                String(periodId).toLowerCase(),
                reconciliationId ? String(reconciliationId).toLowerCase() : null,
                String(providerTransactionId).trim(),
                amountMinor,
                currency.trim().toUpperCase(),
                String(proofDocumentHash).trim().toLowerCase(),
                rpId,
                origin,
                validitySeconds
            ]
        );
        challengeId = dbRes.rows[0].challenge_id;
    }

    const record = {
        challenge_id: challengeId,
        admin_id: String(adminId).toLowerCase(),
        action_type: actionType,
        challenge_bytes: challengeBytes,
        canonical_payload: canonicalPayload,
        period_id: String(periodId).toLowerCase(),
        reconciliation_id: reconciliationId ? String(reconciliationId).toLowerCase() : null,
        provider_transaction_id: String(providerTransactionId).trim(),
        verified_amount_minor: amountMinor,
        currency: currency.trim().toUpperCase(),
        proof_document_hash: String(proofDocumentHash).trim().toLowerCase(),
        rp_id: rpId,
        origin,
        created_at: new Date(now).toISOString(),
        expires_at: expiresAt,
        consumed_at: null
    };

    inMemoryChallenges.set(challengeBytes, record);

    return {
        challengeId,
        challenge: challengeBytes,
        rpId,
        origin,
        timeout: validitySeconds * 1000,
        expectedDossier: {
            adminId: String(adminId).toLowerCase(),
            actionType,
            periodId: String(periodId).toLowerCase(),
            reconciliationId: reconciliationId ? String(reconciliationId).toLowerCase() : null,
            amountMinor,
            currency: currency.trim().toUpperCase()
        }
    };
}

/**
 * -----------------------------------------------------------------------------
 * 3. VÉRIFICATION CRYPTOGRAPHIQUE WEBAUTHN & CONSOMMATION ATOMIQUE (P4 & P5)
 * -----------------------------------------------------------------------------
 */

/**
 * Vérifie une assertion WebAuthn via @simplewebauthn/server et consomme atomiquement
 * le challenge dans PostgreSQL avec verrouillage FOR UPDATE.
 */
async function verifyWebAuthnAssertion({
    adminId,
    credentialId,
    clientDataJSON,
    authenticatorData,
    signature,
    expectedChallenge,
    expectedRpId = DEFAULT_RP_ID,
    expectedOrigin = DEFAULT_ORIGIN,
    requireUserVerification = false,
    credentialRecord = null,
    expectedDossier = null,
    expectedEnrollmentApproval = null,
    existingDbClient = null
}) {
    if (!adminId || !isValidUUID(adminId)) {
        return { valid: false, code: 'INVALID_ADMIN_ID', message: 'UUID adminId invalide.' };
    }
    if (!credentialId || typeof credentialId !== 'string') {
        return { valid: false, code: 'INVALID_CREDENTIAL_ID', message: 'credentialId requis.' };
    }

    const pool = existingDbClient ? null : getAuthorityPool();
    const client = existingDbClient || (pool ? await pool.connect() : null);
    const ownsTransaction = !existingDbClient && Boolean(client);

    try {
        if (ownsTransaction) {
            await client.query('BEGIN');
        }

        // 1. Verrouillage pessimiste FOR UPDATE (via SECURITY DEFINER) du challenge dans PostgreSQL
        let challengeRecord = null;
        if (client) {
            const chalRes = await client.query(
                `SELECT * FROM yziow_refund_auth.get_webauthn_challenge_for_update($1::TEXT)`,
                [expectedChallenge]
            );
            if (chalRes.rowCount > 0) {
                challengeRecord = chalRes.rows[0];
            }
        } else {
            challengeRecord = inMemoryChallenges.get(expectedChallenge) || null;
        }

        if (!challengeRecord) {
            if (ownsTransaction) await client.query('ROLLBACK');
            return { valid: false, code: 'CHALLENGE_NOT_FOUND', message: 'Challenge d\'action introuvable.' };
        }
        if (challengeRecord.consumed_at) {
            if (ownsTransaction) await client.query('ROLLBACK');
            return { valid: false, code: 'CHALLENGE_ALREADY_CONSUMED', message: 'Challenge déjà consommé (tentative de rejeu interdite).' };
        }
        const isExpired = challengeRecord.is_expired !== undefined
            ? challengeRecord.is_expired
            : (new Date(challengeRecord.expires_at).getTime() < Date.now());
        if (isExpired) {
            if (ownsTransaction) await client.query('ROLLBACK');
            return { valid: false, code: 'CHALLENGE_EXPIRED', message: 'Challenge d\'action expiré.' };
        }
        if (String(challengeRecord.admin_id).toLowerCase() !== String(adminId).toLowerCase()) {
            if (ownsTransaction) await client.query('ROLLBACK');
            return { valid: false, code: 'CHALLENGE_ADMIN_MISMATCH', message: 'Le challenge n\'a pas été émis pour cet administrateur.' };
        }

        if (expectedEnrollmentApproval) {
            const expectedCanon = `v1-enroll-approve|${String(expectedEnrollmentApproval.targetAdminId).toLowerCase()}|${String(expectedEnrollmentApproval.purpose).trim()}`;
            if (
                challengeRecord.action_type !== 'enroll_approve' ||
                challengeRecord.canonical_payload !== expectedCanon
            ) {
                if (ownsTransaction) await client.query('ROLLBACK');
                return {
                    valid: false,
                    code: 'CHALLENGE_MISMATCH',
                    message: 'Le challenge ne correspond pas à la demande de co-autorisation d\'enrôlement.'
                };
            }
        }

        if (expectedDossier) {
            if (
                challengeRecord.action_type !== expectedDossier.actionType ||
                String(challengeRecord.period_id).toLowerCase() !== String(expectedDossier.periodId).toLowerCase() ||
                (expectedDossier.reconciliationId && String(challengeRecord.reconciliation_id).toLowerCase() !== String(expectedDossier.reconciliationId).toLowerCase()) ||
                String(challengeRecord.provider_transaction_id).trim() !== String(expectedDossier.providerTransactionId).trim() ||
                Number(challengeRecord.verified_amount_minor) !== Number(expectedDossier.verifiedAmountMinor) ||
                String(challengeRecord.currency).trim().toUpperCase() !== String(expectedDossier.currency).trim().toUpperCase() ||
                String(challengeRecord.proof_document_hash).trim().toLowerCase() !== String(expectedDossier.proofDocumentHash).trim().toLowerCase()
            ) {
                if (ownsTransaction) await client.query('ROLLBACK');
                return {
                    valid: false,
                    code: 'CHALLENGE_DOSSIER_MISMATCH',
                    message: 'Le challenge d\'action a été émis pour un autre dossier ou des paramètres discordants (cross-dossier ou modification interdite).'
                };
            }
        }

        // 2. Lecture verrouillée du credential dans PostgreSQL
        let cred = credentialRecord;
        if (!cred && client) {
            const credRes = await client.query(
                `SELECT * FROM public.superadmin_webauthn_credentials
                 WHERE credential_id = $1
                 FOR UPDATE`,
                [credentialId]
            );
            if (credRes.rowCount > 0) {
                cred = credRes.rows[0];
            }
        }
        if (!cred) {
            cred = inMemoryCredentials.get(credentialId) || null;
        }
        if (!cred) {
            if (ownsTransaction) await client.query('ROLLBACK');
            return { valid: false, code: 'CREDENTIAL_NOT_FOUND', message: 'Authentificateur personnel non trouvé pour cet administrateur.' };
        }
        if (String(cred.admin_id).toLowerCase() !== String(adminId).toLowerCase()) {
            if (ownsTransaction) await client.query('ROLLBACK');
            return { valid: false, code: 'CREDENTIAL_ADMIN_MISMATCH', message: 'Cet authentificateur n\'appartient pas à l\'administrateur connecté.' };
        }
        if (cred.is_active === false || cred.revoked_at) {
            if (ownsTransaction) await client.query('ROLLBACK');
            return { valid: false, code: 'CREDENTIAL_REVOKED', message: 'Cet authentificateur a été révoqué ou désactivé.' };
        }

        // 3. Décodage et contrôles protocolaires de clientDataJSON et authenticatorData
        let parsedClientData;
        let clientDataBuf;
        try {
            clientDataBuf = toBuffer(clientDataJSON);
            parsedClientData = JSON.parse(clientDataBuf.toString('utf8'));
        } catch (_e) {
            if (ownsTransaction) await client.query('ROLLBACK');
            return { valid: false, code: 'INVALID_CLIENT_DATA_JSON', message: 'clientDataJSON malformé.' };
        }

        if (parsedClientData.type !== 'webauthn.get') {
            if (ownsTransaction) await client.query('ROLLBACK');
            return { valid: false, code: 'INVALID_WEBAUTHN_TYPE', message: `Type clientData attendu "webauthn.get", reçu "${parsedClientData.type}".` };
        }
        if (parsedClientData.challenge !== expectedChallenge) {
            if (ownsTransaction) await client.query('ROLLBACK');
            return { valid: false, code: 'CHALLENGE_MISMATCH', message: 'Le challenge signé ne correspond pas au challenge attendu pour cette opération.' };
        }
        if (parsedClientData.origin !== expectedOrigin) {
            if (ownsTransaction) await client.query('ROLLBACK');
            return { valid: false, code: 'INVALID_ORIGIN', message: `Origine non autorisée (${parsedClientData.origin} vs ${expectedOrigin}).` };
        }

        let authDataBuf;
        try {
            authDataBuf = toBuffer(authenticatorData);
        } catch (_e) {
            if (ownsTransaction) await client.query('ROLLBACK');
            return { valid: false, code: 'INVALID_AUTHENTICATOR_DATA', message: 'authenticatorData invalide.' };
        }
        if (authDataBuf.length < 37) {
            if (ownsTransaction) await client.query('ROLLBACK');
            return { valid: false, code: 'INVALID_AUTHENTICATOR_DATA_LENGTH', message: 'authenticatorData trop court (< 37 octets).' };
        }

        const expectedRpIdHash = crypto.createHash('sha256').update(expectedRpId).digest();
        const actualRpIdHash = authDataBuf.subarray(0, 32);
        if (!crypto.timingSafeEqual(expectedRpIdHash, actualRpIdHash)) {
            if (ownsTransaction) await client.query('ROLLBACK');
            return { valid: false, code: 'INVALID_RP_ID', message: 'RP ID non reconnu dans authenticatorData.' };
        }

        const flags = authDataBuf[32];
        const userPresent = (flags & 0x01) !== 0;
        const userVerified = (flags & 0x04) !== 0;
        if (!userPresent) {
            if (ownsTransaction) await client.query('ROLLBACK');
            return { valid: false, code: 'USER_PRESENCE_REQUIRED', message: 'Présence utilisateur physique (UP) requise mais absente.' };
        }
        if (requireUserVerification && !userVerified) {
            if (ownsTransaction) await client.query('ROLLBACK');
            return { valid: false, code: 'USER_VERIFICATION_REQUIRED', message: 'Vérification biométrique ou code PIN utilisateur (UV) requise mais absente.' };
        }

        const signCount = authDataBuf.readUInt32BE(33);
        const storedCounter = Number(cred.counter || 0);
        if (signCount > 0 && storedCounter > 0 && signCount <= storedCounter) {
            if (ownsTransaction) await client.query('ROLLBACK');
            return { valid: false, code: 'SIGNATURE_COUNTER_REGRESSED', message: 'Compteur de signature non strictement incrémenté (clonage suspect).' };
        }

        let sigBuf;
        try {
            sigBuf = toBuffer(signature);
        } catch (_e) {
            if (ownsTransaction) await client.query('ROLLBACK');
            return { valid: false, code: 'INVALID_SIGNATURE_FORMAT', message: 'Signature invalide.' };
        }

        // 4. Vérification cryptographique via @simplewebauthn/server (verifyAuthenticationResponse)
        const coseKeyBytes = cred.public_key_cose
            ? new Uint8Array(Buffer.from(cred.public_key_cose, 'base64url'))
            : spkiPemToCosePublicKeyBytes(cred.public_key_spki, cred.cose_alg || COSEALG.ES256);

        const b64CredId = toBase64UrlId(credentialId);
        let isSignatureValid = false;
        try {
            const authVerif = await verifyAuthenticationResponse({
                response: {
                    id: b64CredId,
                    rawId: b64CredId,
                    type: 'public-key',
                    response: {
                        clientDataJSON: clientDataBuf.toString('base64url'),
                        authenticatorData: authDataBuf.toString('base64url'),
                        signature: sigBuf.toString('base64url')
                    }
                },
                expectedChallenge,
                expectedOrigin,
                expectedRPID: expectedRpId,
                credential: {
                    id: b64CredId,
                    publicKey: coseKeyBytes,
                    counter: storedCounter,
                    transports: cred.transports || ['internal', 'usb', 'nfc']
                },
                requireUserVerification
            });
            isSignatureValid = Boolean(authVerif && authVerif.verified);
        } catch (_verifErr) {
            isSignatureValid = false;
        }

        if (!isSignatureValid) {
            if (ownsTransaction) await client.query('ROLLBACK');
            return { valid: false, code: 'INVALID_WEBAUTHN_SIGNATURE', message: 'Signature cryptographique WebAuthn rejetée (invalide pour cette clé).' };
        }

        // 5. Consommation atomique du challenge dans PostgreSQL et mise à jour du compteur
        const newCounter = signCount > 0 ? signCount : (storedCounter + 1);
        if (client) {
            await client.query(
                `SELECT yziow_refund_auth.consume_webauthn_challenge($1::TEXT, $2::UUID, $3::TEXT, $4::TEXT)`,
                [expectedChallenge, String(adminId).toLowerCase(), challengeRecord.action_type, credentialId]
            );
            await client.query(
                `UPDATE public.superadmin_webauthn_credentials
                 SET counter = $1, last_used_at = clock_timestamp()
                 WHERE credential_id = $2`,
                [newCounter, credentialId]
            );
            if (ownsTransaction) {
                await client.query('COMMIT');
            }
        }

        const memCred = inMemoryCredentials.get(credentialId);
        if (memCred) {
            memCred.counter = newCounter;
            memCred.last_used_at = new Date().toISOString();
        }
        const memChal = inMemoryChallenges.get(expectedChallenge);
        if (memChal) {
            memChal.consumed_at = new Date().toISOString();
            memChal.consumed_by_credential_id = credentialId;
        }

        return {
            valid: true,
            challengeId: challengeRecord.challenge_id,
            adminId: String(cred.admin_id).toLowerCase(),
            credentialId: cred.credential_id,
            signCount: newCounter,
            verifiedAt: new Date().toISOString()
        };
    } catch (err) {
        if (ownsTransaction && client) {
            await client.query('ROLLBACK').catch(() => {});
        }
        const msg = err.message || String(err);
        if (msg.includes('CHALLENGE_ALREADY_CONSUMED')) {
            return { valid: false, code: 'CHALLENGE_ALREADY_CONSUMED', message: msg };
        }
        if (msg.includes('CHALLENGE_EXPIRED')) {
            return { valid: false, code: 'CHALLENGE_EXPIRED', message: msg };
        }
        if (msg.includes('CHALLENGE_NOT_FOUND')) {
            return { valid: false, code: 'CHALLENGE_NOT_FOUND', message: msg };
        }
        return { valid: false, code: 'WEBAUTHN_VERIFICATION_ERROR', message: msg };
    } finally {
        if (ownsTransaction && client) {
            client.release();
        }
    }
}

/**
 * -----------------------------------------------------------------------------
 * 4. ÉMISSION SÉCURISÉE DE L'ATTESTATION D'AUTORITÉ POUR POSTGRESQL (P1 & P5)
 * -----------------------------------------------------------------------------
 */
async function issueConfirmedActionProof({
    adminId,
    actionType,
    periodId,
    reconciliationId = null,
    providerTransactionId,
    verifiedAmountMinor,
    currency = 'XOF',
    proofDocumentHash,
    webauthnAssertion, // { credentialId, clientDataJSON, authenticatorData, signature }
    credentialRecord = null,
    rpId = DEFAULT_RP_ID,
    origin = DEFAULT_ORIGIN,
    secretKey = null,
    authorityAvailable = true,
    enforceAuthoritativeDossierCheck = false
}) {
    if (!authorityAvailable || process.env.YZIOW_WEBAUTHN_AUTHORITY_UNAVAILABLE === 'true') {
        return {
            success: false,
            code: 'AUTHORITY_UNAVAILABLE',
            message: 'L\'autorité indépendante de confirmation WebAuthn est temporairement indisponible (rejet fail-closed).'
        };
    }

    if (!webauthnAssertion || typeof webauthnAssertion !== 'object') {
        return {
            success: false,
            code: 'WEBAUTHN_CONFIRMATION_REQUIRED',
            message: 'Confirmation matérielle WebAuthn requise pour émettre une preuve d\'action.'
        };
    }

    if (enforceAuthoritativeDossierCheck) {
        const dossierCheck = await inspectAuthoritativeRefundDossier({
            adminId,
            actionType,
            periodId,
            reconciliationId,
            providerTransactionId,
            verifiedAmountMinor,
            currency,
            proofDocumentHash
        });
        if (!dossierCheck.valid) {
            return {
                success: false,
                code: dossierCheck.code,
                message: dossierCheck.message
            };
        }
    }

    let clientChallenge = null;
    try {
        const clientDataBuf = toBuffer(webauthnAssertion.clientDataJSON);
        const parsed = JSON.parse(clientDataBuf.toString('utf8'));
        clientChallenge = parsed.challenge;
    } catch (_e) {
        return { success: false, code: 'INVALID_CLIENT_DATA_JSON', message: 'clientDataJSON malformé.' };
    }

    if (!clientChallenge) {
        return { success: false, code: 'CHALLENGE_REQUIRED', message: 'Challenge absent de la réponse WebAuthn.' };
    }

    const assertionResult = await verifyWebAuthnAssertion({
        adminId,
        credentialId: webauthnAssertion.credentialId,
        clientDataJSON: webauthnAssertion.clientDataJSON,
        authenticatorData: webauthnAssertion.authenticatorData,
        signature: webauthnAssertion.signature,
        expectedChallenge: clientChallenge,
        expectedRpId: rpId,
        expectedOrigin: origin,
        requireUserVerification: true,
        credentialRecord,
        expectedDossier: {
            actionType,
            periodId,
            reconciliationId,
            providerTransactionId,
            verifiedAmountMinor,
            currency,
            proofDocumentHash
        }
    });

    if (!assertionResult.valid) {
        return {
            success: false,
            code: assertionResult.code,
            message: assertionResult.message
        };
    }

    try {
        const actionProof = generateRefundActionProof({
            adminId,
            actionType,
            periodId,
            reconciliationId,
            providerTransactionId,
            verifiedAmountMinor,
            currency,
            proofDocumentHash,
            secretKey: getEffectiveAuthoritySecret(secretKey),
            webauthnChallengeId: assertionResult.challengeId,
            credentialId: assertionResult.credentialId
        });

        return {
            success: true,
            actionProof,
            confirmation: {
                adminId: assertionResult.adminId,
                credentialId: assertionResult.credentialId,
                challengeId: assertionResult.challengeId,
                verifiedAt: assertionResult.verifiedAt,
                signCount: assertionResult.signCount
            }
        };
    } catch (err) {
        const code = err.message && err.message.includes('AUTHORITY_SECRET_NOT_CONFIGURED')
            ? 'AUTHORITY_SECRET_NOT_CONFIGURED'
            : 'ACTION_PROOF_GENERATION_FAILED';
        return {
            success: false,
            code,
            message: err.message
        };
    }
}

/**
 * Réinitialise uniquement l'état en mémoire locale du processus Node.js.
 * Les challenges et credentials stockés dans PostgreSQL sont conservés (permet de tester
 * la persistance après redémarrage ou changement d'instance - P5).
 */
function resetInMemoryState() {
    inMemoryCredentials.clear();
    inMemoryChallenges.clear();
    consumedEnrollmentTokens.clear();
}

/**
 * Nettoie l'état WebAuthn en mémoire et dans PostgreSQL entre deux tests isolés.
 */
async function clearPersistedWebAuthnStateForTests(customAdminClient = null) {
    resetInMemoryState();
    if (customAdminClient) {
        await customAdminClient.query(`DELETE FROM yziow_refund_auth.consumed_action_proofs WHERE webauthn_challenge_id IS NOT NULL`).catch(() => {});
        await customAdminClient.query(`DELETE FROM yziow_refund_auth.webauthn_challenges`).catch(() => {});
        await customAdminClient.query(`DELETE FROM public.superadmin_webauthn_credentials`).catch(() => {});
        return;
    }
    const adminDbUrl = process.env.DATABASE_URL || getAuthorityDbUrl();
    if (adminDbUrl) {
        const cleanupPool = new Pool({ connectionString: adminDbUrl, max: 1, idleTimeoutMillis: 1000 });
        try {
            await cleanupPool.query(`DELETE FROM yziow_refund_auth.consumed_action_proofs WHERE webauthn_challenge_id IS NOT NULL`).catch(() => {});
            await cleanupPool.query(`DELETE FROM yziow_refund_auth.webauthn_challenges`).catch(() => {});
            await cleanupPool.query(`DELETE FROM public.superadmin_webauthn_credentials`).catch(() => {});
        } finally {
            await cleanupPool.end().catch(() => {});
        }
    }
}

module.exports = {
    DEFAULT_RP_ID,
    DEFAULT_ORIGIN,
    CHALLENGE_VALIDITY_SECONDS,
    SUPPORTED_COSE_ALGORITHMS,
    setAuthorityRuntimeConfig,
    getEffectiveAuthoritySecret,
    getEffectiveBootstrapSecret,
    spkiPemToCosePublicKeyBytes,
    cosePublicKeyBytesToSpkiPem,
    buildWebAuthnAttestationObject,
    issueEnrollmentApprovalToken,
    issueOutOfBandBootstrapToken,
    createEnrollmentApprovalChallenge,
    issueConfirmedEnrollmentApprovalToken,
    verifyEnrollmentApprovalToken,
    inspectAuthoritativeRefundDossier,
    createRegistrationChallenge,
    verifyAndRegisterCredential,
    revokeCredential,
    computeActionConfirmationChallengeBytes,
    createActionConfirmationChallenge,
    verifyWebAuthnAssertion,
    issueConfirmedActionProof,
    resetInMemoryState,
    clearPersistedWebAuthnStateForTests,
    closeAuthorityDbPool,
    inMemoryCredentials,
    inMemoryChallenges
};
