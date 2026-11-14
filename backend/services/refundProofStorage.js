'use strict';

const crypto = require('crypto');
const { supabase } = require('../utils/supabase');
const { verifyFileMagicBytes, isValidUUID } = require('../utils/helpers');

/**
 * Chantier D.1 (P28c) — Module de stockage privé et de vérification d'intégrité
 * des justificatifs de remboursement Parent Pack.
 *
 * Garanties implémentées par ce module :
 *   1. Réception sécurisée d'un fichier binaire (PDF ou image PNG/JPEG/WEBP).
 *   2. Limitation stricte de la taille (min 16 octets, max 5 Mo).
 *   3. Inspection des octets réels (magic bytes + structure PDF + rejet de contenu actif)
 *      et cohérence avec le type MIME et l'extension.
 *   4. Calcul systématique de l'empreinte SHA-256 côté serveur sur les octets réels
 *      (aucune confiance dans un chemin déclaratif ou un hash fourni par l'administrateur).
 *   5. Enregistrement dans le bucket privé dédié ('refund-proofs') avec interdiction
 *      stricte d'écrasement (upsert: false) et sans jamais générer d'URL publique permanente.
 *   6. Relecture immédiate post-écriture et nouvelle lecture + recalcul SHA-256
 *      lors de l'étape d'approbation par le second SuperAdmin.
 *   7. Blocage fail-closed si le fichier est absent, altéré, remplacé ou inaccessible.
 *
 * Note d'architecture (Sécurité P28c — Section 3) :
 *   Un bucket privé Supabase Storage avec `upsert: false` et vérification SHA-256
 *   détecte toute altération ou suppression par rapport à la table immuable PostgreSQL
 *   `parent_pack_refund_reconciliations`, mais ne constitue PAS à lui seul une garantie
 *   WORM matérielle/réglementaire (un administrateur disposant de `service_role` sur
 *   Supabase pouvant supprimer un objet du bucket). Une conservation WORM certifiée
 *   requiert un stockage objet externe avec Object Lock en mode Compliance.
 *   Par conséquent, `parent_pack_refund_security_gate` reste intégralement à `false`.
 */

const REFUND_PROOFS_BUCKET = 'refund-proofs';
const MIN_PROOF_FILE_SIZE_BYTES = 16;
const MAX_PROOF_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB max

const ALLOWED_PROOF_DETECTED_TYPES = Object.freeze(['pdf', 'png', 'jpeg', 'webp']);

const DETECTED_TYPE_TO_MIME = Object.freeze({
    pdf: 'application/pdf',
    png: 'image/png',
    jpeg: 'image/jpeg',
    webp: 'image/webp'
});

const DETECTED_TYPE_TO_EXT = Object.freeze({
    pdf: 'pdf',
    png: 'png',
    jpeg: 'jpg',
    webp: 'webp'
});

const EXT_TO_DETECTED_TYPE = Object.freeze({
    '.pdf': 'pdf',
    '.png': 'png',
    '.jpg': 'jpeg',
    '.jpeg': 'jpeg',
    '.webp': 'webp'
});

const MIME_TO_DETECTED_TYPE = Object.freeze({
    'application/pdf': 'pdf',
    'image/png': 'png',
    'image/jpeg': 'jpeg',
    'image/jpg': 'jpeg',
    'image/webp': 'webp'
});

const SHA256_HEX_REGEX = /^[a-fA-F0-9]{64}$/;
const PRIVATE_REFUND_PROOF_URI_REGEX = /^private:\/\/refund-proofs\/([a-zA-Z0-9._/-]{8,200})$/;

/**
 * Journalisation sécurisée sans fuite de contenu binaire, d'URL signée, de chemin sensible ou de PII.
 */
function logRefundProofStorageEvent(level, eventCode, details = {}) {
    const safePayload = {
        event: eventCode,
        periodId: details.periodId || null,
        reconciliationId: details.reconciliationId || null,
        detectedType: details.detectedType || null,
        byteLength: typeof details.byteLength === 'number' ? details.byteLength : null,
        errorCode: details.errorCode || null
    };
    if (level === 'error') {
        console.error(`[REFUND_PROOF_STORAGE] ${eventCode}:`, JSON.stringify(safePayload));
    }
}

/**
 * Calcule l'empreinte SHA-256 hexadécimale (minuscules) sur un Buffer côté serveur.
 */
function computeServerSha256Hex(buffer) {
    if (!Buffer.isBuffer(buffer)) {
        throw new Error('INVALID_BUFFER_FOR_SHA256');
    }
    return crypto.createHash('sha256').update(buffer).digest('hex').toLowerCase();
}

/**
 * Compare deux empreintes SHA-256 hexadécimales en temps constant.
 */
function constantTimeHashEquals(hashA, hashB) {
    if (typeof hashA !== 'string' || typeof hashB !== 'string') {
        return false;
    }
    const cleanA = hashA.trim().toLowerCase();
    const cleanB = hashB.trim().toLowerCase();
    if (!SHA256_HEX_REGEX.test(cleanA) || !SHA256_HEX_REGEX.test(cleanB)) {
        return false;
    }
    const bufA = Buffer.from(cleanA, 'hex');
    const bufB = Buffer.from(cleanB, 'hex');
    if (bufA.length !== bufB.length) {
        return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Vérifie que l'acteur demandant l'accès au stockage privé des justificatifs
 * est un SuperAdmin identifié par un UUID valide et un rôle serveur strictement égal à 'superadmin'.
 * Verrouillage fail-closed : aucun rôle par défaut implicite, rejet strict si le rôle est absent ou non-superadmin.
 */
function verifyRefundProofAuthorization({ actorAdminId, actorRole } = {}) {
    if (!actorAdminId || !isValidUUID(actorAdminId)) {
        return {
            authorized: false,
            code: 'UNAUTHORIZED_PROOF_STORAGE_ACCESS',
            message: 'Accès refusé au stockage des justificatifs : identifiant SuperAdmin absent ou invalide.'
        };
    }
    if (!actorRole || typeof actorRole !== 'string' || actorRole.trim().toLowerCase() !== 'superadmin') {
        return {
            authorized: false,
            code: 'UNAUTHORIZED_PROOF_STORAGE_ACCESS',
            message: 'Accès refusé au stockage des justificatifs : rôle SuperAdmin requis.'
        };
    }
    return { authorized: true };
}

/**
 * Analyse et valide de manière stricte une URI de stockage privé `private://refund-proofs/<objectKey>`.
 * Interdit toute traversée de répertoire (`..`), double slash (`//`), backslash (`\`) ou bucket externe.
 */
function parsePrivateRefundProofUri(storagePath) {
    if (!storagePath || typeof storagePath !== 'string') {
        return {
            valid: false,
            code: 'INVALID_PROOF_STORAGE_PATH',
            message: 'Le chemin de conservation du justificatif est absent ou invalide (attendu : private://refund-proofs/...).'
        };
    }

    const trimmed = storagePath.trim();
    const match = trimmed.match(PRIVATE_REFUND_PROOF_URI_REGEX);
    if (!match) {
        return {
            valid: false,
            code: 'INVALID_PROOF_STORAGE_PATH',
            message: 'Le chemin du justificatif doit obligatoirement cibler le bucket privé dédié (private://refund-proofs/...).'
        };
    }

    const objectKey = match[1];
    if (
        objectKey.includes('..') ||
        objectKey.includes('//') ||
        objectKey.includes('\\') ||
        objectKey.startsWith('/') ||
        objectKey.endsWith('/') ||
        objectKey.startsWith('.')
    ) {
        return {
            valid: false,
            code: 'INVALID_PROOF_STORAGE_PATH',
            message: 'Chemin de stockage privé invalide (séquence de traversée ou séparateur interdit).'
        };
    }

    const segments = objectKey.split('/');
    for (const seg of segments) {
        if (!seg || seg === '.' || seg === '..') {
            return {
                valid: false,
                code: 'INVALID_PROOF_STORAGE_PATH',
                message: 'Segment de chemin de stockage privé invalide.'
            };
        }
    }

    const fileName = segments[segments.length - 1].toLowerCase();
    const dotIndex = fileName.lastIndexOf('.');
    if (dotIndex <= 0) {
        return {
            valid: false,
            code: 'INVALID_PROOF_STORAGE_PATH',
            message: 'Le chemin de stockage privé doit comporter une extension de fichier autorisée (.pdf, .png, .jpg, .jpeg, .webp).'
        };
    }

    // Rejet des doubles extensions dangereuses (ex: justificatif.php.pdf)
    const nameParts = fileName.split('.');
    if (nameParts.length > 2) {
        const forbiddenExts = new Set(['php', 'exe', 'sh', 'bat', 'cmd', 'js', 'html', 'htm', 'svg', 'py', 'phtml', 'phar', 'vbs', 'jar']);
        for (let i = 1; i < nameParts.length - 1; i++) {
            if (forbiddenExts.has(nameParts[i])) {
                return {
                    valid: false,
                    code: 'INVALID_PROOF_STORAGE_PATH',
                    message: 'Nom de fichier du justificatif invalide (double extension exécutable ou script détectée).'
                };
            }
        }
    }

    const ext = fileName.slice(dotIndex);
    const expectedTypeFromExt = EXT_TO_DETECTED_TYPE[ext];
    if (!expectedTypeFromExt) {
        return {
            valid: false,
            code: 'INVALID_PROOF_STORAGE_PATH',
            message: `Extension de justificatif non autorisée (${ext}). Seuls PDF, PNG, JPEG et WEBP sont acceptés.`
        };
    }

    return {
        valid: true,
        bucket: REFUND_PROOFS_BUCKET,
        objectKey,
        normalizedUri: `private://${REFUND_PROOFS_BUCKET}/${objectKey}`,
        extension: ext,
        expectedTypeFromExt
    };
}

/**
 * Convertit une entrée binaire en Buffer Node.js sans jamais accepter d'objet arbitraire.
 */
function normalizeToBuffer(input) {
    if (Buffer.isBuffer(input)) {
        return input;
    }
    if (input instanceof Uint8Array) {
        return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
    }
    if (input instanceof ArrayBuffer) {
        return Buffer.from(input);
    }
    if (typeof input === 'string') {
        return Buffer.from(input, 'utf8');
    }
    return null;
}

/**
 * Vérifie de manière fail-closed les octets réels d'un justificatif (taille, magic bytes,
 * structure PDF/image, absence de scripts embarqués, cohérence MIME/extension et SHA-256 serveur).
 */
function verifyRefundProofBytes(rawInput, options = {}) {
    const {
        expectedDocumentHash = null,
        mimeType = null,
        originalFilename = null,
        storagePath = null
    } = options;

    const buffer = normalizeToBuffer(rawInput);
    if (!buffer || buffer.length === 0) {
        return {
            valid: false,
            code: 'INVALID_PROOF_FILE_FORMAT',
            message: 'Le fichier justificatif est absent ou vide.'
        };
    }

    if (buffer.length > MAX_PROOF_FILE_SIZE_BYTES) {
        return {
            valid: false,
            code: 'PROOF_FILE_TOO_LARGE',
            message: `Le fichier justificatif dépasse la taille maximale autorisée (${MAX_PROOF_FILE_SIZE_BYTES} octets).`
        };
    }

    // 1. Calcul systématique du SHA-256 côté serveur sur les octets reçus
    const serverDocumentHash = computeServerSha256Hex(buffer);

    // Si l'appelant a déclaré un hash, vérifier son format puis sa concordance exacte avec le hash calculé par le serveur
    if (expectedDocumentHash !== null && expectedDocumentHash !== undefined && String(expectedDocumentHash).trim() !== '') {
        const cleanExpected = String(expectedDocumentHash).trim().toLowerCase();
        if (!SHA256_HEX_REGEX.test(cleanExpected)) {
            return {
                valid: false,
                code: 'INVALID_PROOF_HASH',
                message: 'L\'empreinte cryptographique SHA-256 déclarée est invalide.'
            };
        }
        if (!constantTimeHashEquals(serverDocumentHash, cleanExpected)) {
            return {
                valid: false,
                code: 'PROOF_HASH_CONTENT_MISMATCH',
                message: 'L\'empreinte SHA-256 déclarée ne correspond pas à l\'empreinte calculée par le serveur sur le contenu binaire du justificatif.'
            };
        }
    }

    if (buffer.length < MIN_PROOF_FILE_SIZE_BYTES) {
        return {
            valid: false,
            code: 'INVALID_PROOF_FILE_FORMAT',
            message: 'Le fichier justificatif est tronqué ou trop court pour constituer un document valide.'
        };
    }

    // 2. Vérification de la signature binaire réelle (magic bytes) via helpers.verifyFileMagicBytes
    const magicCheck = verifyFileMagicBytes(buffer, ['pdf', 'image']);
    if (!magicCheck.valid || !magicCheck.detectedType || !ALLOWED_PROOF_DETECTED_TYPES.includes(magicCheck.detectedType)) {
        return {
            valid: false,
            code: 'INVALID_PROOF_FILE_FORMAT',
            message: 'Format binaire du justificatif invalide ou falsifié (seuls PDF, PNG, JPEG et WEBP authentiques sont autorisés).'
        };
    }

    const detectedType = magicCheck.detectedType;

    // 3. Inspection approfondie spécifique au format PDF (en-tête %PDF-x.y, absence d'actions JS/Launch, marqueur %%EOF)
    if (detectedType === 'pdf') {
        const headAscii = buffer.subarray(0, Math.min(buffer.length, 16)).toString('ascii');
        if (!/^%PDF-[12]\.[0-9]/.test(headAscii)) {
            return {
                valid: false,
                code: 'INVALID_PROOF_FILE_FORMAT',
                message: 'En-tête de version PDF invalide ou falsifié.'
            };
        }

        const fullLatin1Lower = buffer.toString('latin1').toLowerCase();
        if (
            fullLatin1Lower.includes('/javascript') ||
            fullLatin1Lower.includes('/js ') ||
            fullLatin1Lower.includes('/js(') ||
            fullLatin1Lower.includes('/js<') ||
            fullLatin1Lower.includes('/launch') ||
            fullLatin1Lower.includes('<script') ||
            fullLatin1Lower.includes('<?php')
        ) {
            return {
                valid: false,
                code: 'INVALID_PROOF_FILE_FORMAT',
                message: 'Le document PDF contient des directives actives ou scripts interdits.'
            };
        }

        const tailAscii = buffer.subarray(Math.max(0, buffer.length - 1024)).toString('ascii');
        if (!tailAscii.includes('%%EOF')) {
            return {
                valid: false,
                code: 'INVALID_PROOF_FILE_FORMAT',
                message: 'Document PDF incomplet ou corrompu (marqueur de fin %%EOF absent).'
            };
        }
    }

    // 4. Cohérence avec le type MIME éventuellement déclaré
    if (mimeType !== null && mimeType !== undefined && String(mimeType).trim() !== '') {
        const cleanMime = String(mimeType).trim().toLowerCase().split(';')[0].trim();
        const expectedTypeForMime = MIME_TO_DETECTED_TYPE[cleanMime];
        if (!expectedTypeForMime || expectedTypeForMime !== detectedType) {
            return {
                valid: false,
                code: 'INVALID_PROOF_FILE_FORMAT',
                message: `Incohérence entre le type MIME déclaré (${cleanMime}) et la signature binaire réelle (${detectedType}).`
            };
        }
    }

    // 5. Cohérence avec le nom de fichier d'origine éventuellement fourni
    if (originalFilename !== null && originalFilename !== undefined && String(originalFilename).trim() !== '') {
        const cleanName = String(originalFilename).trim().toLowerCase();
        const dotIdx = cleanName.lastIndexOf('.');
        if (dotIdx <= 0) {
            return {
                valid: false,
                code: 'INVALID_PROOF_FILE_FORMAT',
                message: 'Le nom de fichier du justificatif ne comporte pas d\'extension valide.'
            };
        }
        const ext = cleanName.slice(dotIdx);
        const typeFromName = EXT_TO_DETECTED_TYPE[ext];
        if (!typeFromName || typeFromName !== detectedType) {
            return {
                valid: false,
                code: 'INVALID_PROOF_FILE_FORMAT',
                message: `Incohérence entre l'extension du fichier (${ext}) et sa signature binaire réelle (${detectedType}).`
            };
        }
    }

    // 6. Cohérence avec l'extension du chemin de stockage privé s'il est fourni
    if (storagePath !== null && storagePath !== undefined && String(storagePath).trim() !== '') {
        const parsedUri = parsePrivateRefundProofUri(storagePath);
        if (!parsedUri.valid) {
            return parsedUri;
        }
        if (parsedUri.expectedTypeFromExt !== detectedType) {
            return {
                valid: false,
                code: 'INVALID_PROOF_FILE_FORMAT',
                message: `Incohérence entre l'extension du chemin de stockage (${parsedUri.extension}) et la signature binaire réelle (${detectedType}).`
            };
        }
    }

    return {
        valid: true,
        buffer,
        byteLength: buffer.length,
        detectedType,
        contentType: DETECTED_TYPE_TO_MIME[detectedType],
        canonicalExtension: DETECTED_TYPE_TO_EXT[detectedType],
        documentHash: serverDocumentHash
    };
}

/**
 * Extrait un Buffer Node.js à partir de la réponse `download()` de Supabase Storage
 * (qui peut retourner un Blob, un ArrayBuffer, un Uint8Array ou un Buffer).
 */
async function extractBufferFromStorageDownload(downloadData) {
    if (!downloadData) return null;
    if (Buffer.isBuffer(downloadData)) {
        return downloadData;
    }
    if (downloadData instanceof Uint8Array) {
        return Buffer.from(downloadData.buffer, downloadData.byteOffset, downloadData.byteLength);
    }
    if (downloadData instanceof ArrayBuffer) {
        return Buffer.from(downloadData);
    }
    if (typeof downloadData.arrayBuffer === 'function') {
        const ab = await downloadData.arrayBuffer();
        return Buffer.from(ab);
    }
    return null;
}

/**
 * Lit le fichier réellement enregistré dans le bucket privé `refund-proofs`,
 * vérifie sa signature binaire et sa taille, et recalcule son empreinte SHA-256 côté serveur.
 *
 * Bloquant (fail-closed) si :
 *   - l'acteur n'est pas autorisé (UNAUTHORIZED_PROOF_STORAGE_ACCESS)
 *   - le chemin est invalide (INVALID_PROOF_STORAGE_PATH)
 *   - le fichier est absent du stockage privé (PROOF_FILE_NOT_FOUND)
 *   - le stockage est inaccessible (PROOF_STORAGE_READ_FAILED)
 *   - le fichier a été remplacé ou altéré (PROOF_STORED_FILE_TAMPERED / PROOF_HASH_CONTENT_MISMATCH)
 *   - les octets stockés ont un format invalide (INVALID_PROOF_FILE_FORMAT)
 */
async function readAndVerifyStoredRefundProof({
    storagePath,
    expectedDocumentHash,
    periodId = null,
    reconciliationId = null,
    actorAdminId = null,
    actorRole = 'superadmin',
    phase = 'approve',
    storageClient = null
}) {
    const auth = verifyRefundProofAuthorization({ actorAdminId, actorRole });
    if (!auth.authorized) {
        logRefundProofStorageEvent('error', 'READ_UNAUTHORIZED', {
            periodId,
            reconciliationId,
            errorCode: auth.code
        });
        return {
            valid: false,
            code: auth.code,
            message: auth.message
        };
    }

    const parsedUri = parsePrivateRefundProofUri(storagePath);
    if (!parsedUri.valid) {
        return parsedUri;
    }

    if (!expectedDocumentHash || typeof expectedDocumentHash !== 'string' || !SHA256_HEX_REGEX.test(expectedDocumentHash.trim())) {
        return {
            valid: false,
            code: 'INVALID_PROOF_HASH',
            message: 'L\'empreinte SHA-256 de référence du justificatif est absente ou invalide.'
        };
    }
    const cleanExpectedHash = expectedDocumentHash.trim().toLowerCase();

    const activeStorage = storageClient || (supabase && supabase.storage);
    if (!activeStorage || typeof activeStorage.from !== 'function') {
        return {
            valid: false,
            code: 'PROOF_STORAGE_UNAVAILABLE',
            message: 'Le service de stockage privé des justificatifs n\'est pas disponible.'
        };
    }

    let downloadData = null;
    let downloadError = null;
    try {
        const res = await activeStorage
            .from(REFUND_PROOFS_BUCKET)
            .download(parsedUri.objectKey);
        downloadData = res ? res.data : null;
        downloadError = res ? res.error : null;
    } catch (err) {
        downloadError = err;
    }

    if (downloadError || !downloadData) {
        const status = Number(downloadError?.statusCode || downloadError?.status || 0);
        const errMsg = String(downloadError?.message || downloadError?.error || '');

        if (status === 401 || status === 403 || /unauthorized|forbidden|permission denied|not authorized/i.test(errMsg)) {
            logRefundProofStorageEvent('error', 'READ_FORBIDDEN', {
                periodId,
                reconciliationId,
                errorCode: 'UNAUTHORIZED_PROOF_STORAGE_ACCESS'
            });
            return {
                valid: false,
                code: 'UNAUTHORIZED_PROOF_STORAGE_ACCESS',
                message: 'Accès non autorisé lors de la lecture du justificatif dans le stockage privé.'
            };
        }

        if (status === 404 || status === 400 || /not found|nosuchkey|does not exist|introuvable/i.test(errMsg) || (!downloadError && !downloadData)) {
            logRefundProofStorageEvent('error', 'READ_NOT_FOUND', {
                periodId,
                reconciliationId,
                errorCode: 'PROOF_FILE_NOT_FOUND'
            });
            return {
                valid: false,
                code: 'PROOF_FILE_NOT_FOUND',
                message: 'Le fichier justificatif référencé est introuvable dans le stockage privé.'
            };
        }

        logRefundProofStorageEvent('error', 'READ_FAILED', {
            periodId,
            reconciliationId,
            errorCode: 'PROOF_STORAGE_READ_FAILED'
        });
        return {
            valid: false,
            code: 'PROOF_STORAGE_READ_FAILED',
            message: 'Échec de lecture du justificatif depuis le stockage privé.'
        };
    }

    let storedBuffer = null;
    try {
        storedBuffer = await extractBufferFromStorageDownload(downloadData);
    } catch (_extractErr) {
        storedBuffer = null;
    }

    if (!storedBuffer || storedBuffer.length === 0) {
        return {
            valid: false,
            code: 'PROOF_STORED_FILE_TAMPERED',
            message: 'Le justificatif lu depuis le stockage privé est vide ou illisible.'
        };
    }

    if (storedBuffer.length > MAX_PROOF_FILE_SIZE_BYTES) {
        return {
            valid: false,
            code: 'PROOF_FILE_TOO_LARGE',
            message: 'Le justificatif lu depuis le stockage privé dépasse la taille maximale autorisée.'
        };
    }

    // Recalcul systématique du SHA-256 sur les octets réellement stockés
    const recomputedHash = computeServerSha256Hex(storedBuffer);
    if (!constantTimeHashEquals(recomputedHash, cleanExpectedHash)) {
        const mismatchCode = phase === 'init' ? 'PROOF_HASH_CONTENT_MISMATCH' : 'PROOF_STORED_FILE_TAMPERED';
        logRefundProofStorageEvent('error', 'HASH_MISMATCH_ON_STORED_FILE', {
            periodId,
            reconciliationId,
            byteLength: storedBuffer.length,
            errorCode: mismatchCode
        });
        return {
            valid: false,
            code: mismatchCode,
            message: phase === 'init'
                ? 'L\'empreinte SHA-256 déclarée ne correspond pas au fichier réellement stocké.'
                : 'Alerte de sécurité : le fichier justificatif dans le stockage privé a été modifié ou remplacé depuis l\'initiation (SHA-256 discordant).'
        };
    }

    // Vérification du format binaire réel et de sa cohérence avec l'extension du chemin stocké
    const byteCheck = verifyRefundProofBytes(storedBuffer, {
        expectedDocumentHash: cleanExpectedHash,
        storagePath: parsedUri.normalizedUri
    });
    if (!byteCheck.valid) {
        logRefundProofStorageEvent('error', 'INVALID_STORED_FILE_FORMAT', {
            periodId,
            reconciliationId,
            byteLength: storedBuffer.length,
            errorCode: byteCheck.code
        });
        return {
            valid: false,
            code: byteCheck.code,
            message: byteCheck.message
        };
    }

    return {
        valid: true,
        bucket: REFUND_PROOFS_BUCKET,
        objectKey: parsedUri.objectKey,
        storagePath: parsedUri.normalizedUri,
        proofStoragePath: parsedUri.normalizedUri,
        documentHash: recomputedHash,
        proofDocumentHash: recomputedHash,
        detectedType: byteCheck.detectedType,
        contentType: byteCheck.contentType,
        byteLength: storedBuffer.length
    };
}

/**
 * Reçoit un fichier justificatif (PDF ou image), vérifie ses octets réels et sa taille,
 * calcule son SHA-256 côté serveur, l'enregistre dans le bucket privé `refund-proofs`
 * sans autoriser l'écrasement (`upsert: false`), puis relit immédiatement le fichier stocké
 * pour attester de sa disponibilité et de son intégrité.
 */
async function storeRefundProofDocument({
    periodId,
    actorAdminId,
    actorRole = 'superadmin',
    fileBuffer,
    claimedDocumentHash = null,
    storagePath = null,
    mimeType = null,
    originalFilename = null,
    storageClient = null
}) {
    const auth = verifyRefundProofAuthorization({ actorAdminId, actorRole });
    if (!auth.authorized) {
        logRefundProofStorageEvent('error', 'UPLOAD_UNAUTHORIZED', {
            periodId,
            errorCode: auth.code
        });
        return {
            success: false,
            code: auth.code,
            message: auth.message
        };
    }

    if (!periodId || !isValidUUID(periodId)) {
        return {
            success: false,
            code: 'INVALID_PERIOD_ID',
            message: 'Identifiant de période invalide pour l\'enregistrement du justificatif.'
        };
    }

    const byteCheck = verifyRefundProofBytes(fileBuffer, {
        expectedDocumentHash: claimedDocumentHash,
        mimeType,
        originalFilename,
        storagePath
    });
    if (!byteCheck.valid) {
        logRefundProofStorageEvent('error', 'UPLOAD_BYTE_VALIDATION_FAILED', {
            periodId,
            errorCode: byteCheck.code
        });
        return {
            success: false,
            code: byteCheck.code,
            message: byteCheck.message
        };
    }

    let objectKey;
    let normalizedUri;
    if (storagePath !== null && storagePath !== undefined && String(storagePath).trim() !== '') {
        const parsedUri = parsePrivateRefundProofUri(storagePath);
        if (!parsedUri.valid) {
            return {
                success: false,
                code: parsedUri.code,
                message: parsedUri.message
            };
        }
        objectKey = parsedUri.objectKey;
        normalizedUri = parsedUri.normalizedUri;
    } else {
        const randomSuffix = crypto.randomBytes(8).toString('hex');
        objectKey = `${periodId}/${byteCheck.documentHash.slice(0, 16)}_${randomSuffix}.${byteCheck.canonicalExtension}`;
        normalizedUri = `private://${REFUND_PROOFS_BUCKET}/${objectKey}`;
    }

    const activeStorage = storageClient || (supabase && supabase.storage);
    if (!activeStorage || typeof activeStorage.from !== 'function') {
        return {
            success: false,
            code: 'PROOF_STORAGE_UNAVAILABLE',
            message: 'Le service de stockage privé des justificatifs n\'est pas disponible.'
        };
    }

    let uploadError = null;
    try {
        const res = await activeStorage
            .from(REFUND_PROOFS_BUCKET)
            .upload(objectKey, byteCheck.buffer, {
                contentType: byteCheck.contentType,
                upsert: false,
                cacheControl: 'no-store'
            });
        uploadError = res ? res.error : null;
    } catch (err) {
        uploadError = err;
    }

    if (uploadError) {
        const status = Number(uploadError?.statusCode || uploadError?.status || 0);
        const errMsg = String(uploadError?.message || uploadError?.error || '');

        if (status === 409 || /already exists|duplicate|overwrite|resource already exists/i.test(errMsg)) {
            logRefundProofStorageEvent('error', 'UPLOAD_OVERWRITE_DENIED', {
                periodId,
                detectedType: byteCheck.detectedType,
                byteLength: byteCheck.byteLength,
                errorCode: 'PROOF_STORAGE_OVERWRITE_FORBIDDEN'
            });
            return {
                success: false,
                code: 'PROOF_STORAGE_OVERWRITE_FORBIDDEN',
                message: 'Écrasement refusé : un justificatif existe déjà à cet emplacement privé (upsert: false).'
            };
        }

        if (status === 401 || status === 403 || /unauthorized|forbidden|permission denied|not authorized/i.test(errMsg)) {
            logRefundProofStorageEvent('error', 'UPLOAD_FORBIDDEN', {
                periodId,
                errorCode: 'UNAUTHORIZED_PROOF_STORAGE_ACCESS'
            });
            return {
                success: false,
                code: 'UNAUTHORIZED_PROOF_STORAGE_ACCESS',
                message: 'Accès non autorisé lors de l\'écriture dans le stockage privé des justificatifs.'
            };
        }

        logRefundProofStorageEvent('error', 'UPLOAD_FAILED', {
            periodId,
            detectedType: byteCheck.detectedType,
            byteLength: byteCheck.byteLength,
            errorCode: 'PROOF_STORAGE_WRITE_FAILED'
        });
        return {
            success: false,
            code: 'PROOF_STORAGE_WRITE_FAILED',
            message: 'Échec de l\'enregistrement du justificatif dans le stockage privé.'
        };
    }

    // Relecture immédiate post-écriture pour vérifier que l'objet est bien stocké et intègre
    const readBack = await readAndVerifyStoredRefundProof({
        storagePath: normalizedUri,
        expectedDocumentHash: byteCheck.documentHash,
        periodId,
        actorAdminId,
        actorRole,
        phase: 'init',
        storageClient: activeStorage
    });

    if (!readBack.valid) {
        return {
            success: false,
            code: readBack.code,
            message: readBack.message
        };
    }

    return {
        success: true,
        bucket: REFUND_PROOFS_BUCKET,
        objectKey,
        storagePath: readBack.proofStoragePath,
        proofStoragePath: readBack.proofStoragePath,
        documentHash: readBack.proofDocumentHash,
        proofDocumentHash: readBack.proofDocumentHash,
        detectedType: readBack.detectedType,
        contentType: readBack.contentType,
        byteLength: readBack.byteLength
    };
}

/**
 * Fabrique un adaptateur de stockage privé en mémoire strictement destiné aux tests
 * unitaires et d'intégration jetables (ne jamais activer en production).
 */
function createInMemoryProofStorageMock(initialOptions = {}) {
    const buckets = new Map();
    const state = {
        failUploadWith: initialOptions.failUploadWith || null,
        failDownloadWith: initialOptions.failDownloadWith || null,
        unauthorizedAccess: Boolean(initialOptions.unauthorizedAccess)
    };

    function getBucketMap(bucketName) {
        if (!buckets.has(bucketName)) {
            buckets.set(bucketName, new Map());
        }
        return buckets.get(bucketName);
    }

    return {
        state,
        from(bucketName) {
            return {
                getPublicUrl() {
                    throw new Error('PUBLIC_URL_FORBIDDEN_ON_PRIVATE_PROOF_BUCKET');
                },

                async upload(objectKey, fileBody, options = {}) {
                    if (state.unauthorizedAccess) {
                        return { data: null, error: { message: 'Forbidden: unauthorized storage access', statusCode: 403 } };
                    }
                    if (state.failUploadWith) {
                        return { data: null, error: state.failUploadWith };
                    }
                    if (bucketName !== REFUND_PROOFS_BUCKET) {
                        return { data: null, error: { message: 'Bucket not allowed', statusCode: 403 } };
                    }
                    const bMap = getBucketMap(bucketName);
                    if (bMap.has(objectKey) && options.upsert !== true) {
                        return {
                            data: null,
                            error: {
                                message: 'The resource already exists',
                                error: 'Duplicate',
                                statusCode: 409
                            }
                        };
                    }
                    const buf = normalizeToBuffer(fileBody);
                    if (!buf) {
                        return { data: null, error: { message: 'Invalid body buffer', statusCode: 400 } };
                    }
                    bMap.set(objectKey, {
                        buffer: Buffer.from(buf),
                        contentType: options.contentType || 'application/octet-stream',
                        createdAt: new Date().toISOString()
                    });
                    return { data: { path: objectKey }, error: null };
                },

                async download(objectKey) {
                    if (state.unauthorizedAccess) {
                        return { data: null, error: { message: 'Forbidden: unauthorized storage access', statusCode: 403 } };
                    }
                    if (state.failDownloadWith) {
                        return { data: null, error: state.failDownloadWith };
                    }
                    const bMap = getBucketMap(bucketName);
                    if (!bMap.has(objectKey)) {
                        return { data: null, error: { message: 'Object not found', statusCode: 404 } };
                    }
                    const entry = bMap.get(objectKey);
                    return { data: Buffer.from(entry.buffer), error: null };
                }
            };
        },

        // Helpers réservés aux tests de sécurité pour simuler une altération, suppression ou panne externe
        _setFailureMode({ failUpload = false, failDownload = false } = {}) {
            state.failUploadWith = failUpload
                ? { message: 'Simulated storage write failure', statusCode: 500 }
                : null;
            state.failDownloadWith = failDownload
                ? { message: 'Simulated storage read failure', statusCode: 500 }
                : null;
        },

        _tamperObject(bucketName, objectKey, newContent) {
            const bMap = getBucketMap(bucketName || REFUND_PROOFS_BUCKET);
            const buf = normalizeToBuffer(newContent);
            bMap.set(objectKey, {
                buffer: Buffer.from(buf),
                contentType: 'application/octet-stream',
                createdAt: new Date().toISOString()
            });
        },

        _deleteObject(bucketName, objectKey) {
            const bMap = getBucketMap(bucketName || REFUND_PROOFS_BUCKET);
            bMap.delete(objectKey);
        },

        putObjectForTest(objectKey, rawContent, contentType = 'application/pdf') {
            const bMap = getBucketMap(REFUND_PROOFS_BUCKET);
            const buf = normalizeToBuffer(rawContent);
            bMap.set(objectKey, {
                buffer: Buffer.from(buf),
                contentType,
                createdAt: new Date().toISOString()
            });
        },

        tamperObjectForTest(objectKey, newContent) {
            const bMap = getBucketMap(REFUND_PROOFS_BUCKET);
            const buf = normalizeToBuffer(newContent);
            bMap.set(objectKey, {
                buffer: Buffer.from(buf),
                contentType: 'application/octet-stream',
                createdAt: new Date().toISOString()
            });
        },

        deleteObjectForTest(objectKey) {
            const bMap = getBucketMap(REFUND_PROOFS_BUCKET);
            bMap.delete(objectKey);
        },

        hasObjectForTest(objectKey) {
            const bMap = getBucketMap(REFUND_PROOFS_BUCKET);
            return bMap.has(objectKey);
        },

        clearForTest() {
            buckets.clear();
        }
    };
}

module.exports = {
    REFUND_PROOFS_BUCKET,
    MIN_PROOF_FILE_SIZE_BYTES,
    MAX_PROOF_FILE_SIZE_BYTES,
    ALLOWED_PROOF_DETECTED_TYPES,
    computeServerSha256Hex,
    constantTimeHashEquals,
    verifyRefundProofAuthorization,
    parsePrivateRefundProofUri,
    verifyRefundProofBytes,
    storeRefundProofDocument,
    readAndVerifyStoredRefundProof,
    createInMemoryProofStorageMock
};
