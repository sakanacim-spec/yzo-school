const crypto = require('crypto');
const { parsePhoneNumberFromString } = require('libphonenumber-js/max');

/**
 * Normalise un numéro de téléphone pour le stockage et la recherche E.164.
 * @param {string} phone
 * @param {string} [countryCode] - Code ISO à 2 lettres (ex: BJ, FR). Obligatoire si le numéro n'est pas au format international.
 * @returns {string} numéro au format E.164 (ex: +2290197000000)
 * @throws {Error} 'INVALID_PHONE' ou 'COUNTRY_REQUIRED'
 */
function normalizePhone(phone, countryCode) {
    const raw = String(phone ?? '').trim();

    if (!raw) {
        throw new Error('INVALID_PHONE');
    }

    // Convertir '00' international en '+'
    const normalizedInput = raw.startsWith('00')
        ? `+${raw.slice(2)}`
        : raw;

    let defaultCountry = undefined;
    if (!normalizedInput.startsWith('+')) {
        if (!countryCode || typeof countryCode !== 'string' || !countryCode.trim()) {
            throw new Error('COUNTRY_REQUIRED');
        }
        defaultCountry = countryCode.trim().toUpperCase();
    } else if (countryCode && typeof countryCode === 'string' && countryCode.trim()) {
        defaultCountry = countryCode.trim().toUpperCase();
    }

    const parsed = parsePhoneNumberFromString(normalizedInput, {
        defaultCountry,
        extract: false
    });

    if (!parsed || !parsed.isValid()) {
        throw new Error('INVALID_PHONE');
    }

    return parsed.number;
}

/**
 * Construit un identifiant email synthétique déterministe et sécurisé pour Supabase Auth via SHA-256.
 * @param {string} schoolSlug - Le slug de l'école (ex: ecole_demo).
 * @param {string} phoneNormalized - Le numéro au format E.164 (ex: +2290197000000).
 * @returns {string} Email synthétique de longueur fixe sans donnée personnelle visible.
 * @throws {Error} 'INVALID_AUTH_IDENTIFIER'
 */
function buildAuthEmail(schoolSlug, phoneNormalized) {
    const slug = String(schoolSlug ?? '').trim().toLowerCase();
    const phone = String(phoneNormalized ?? '').trim();

    if (!/^[a-z0-9_]{1,50}$/.test(slug) || !/^\+[1-9][0-9]{7,14}$/.test(phone)) {
        throw new Error('INVALID_AUTH_IDENTIFIER');
    }

    const hash = crypto.createHash('sha256').update(`${slug}:${phone}`).digest('hex').slice(0, 32);
    return `u_${hash}@auth.yziow.internal`;
}

/**
 * Calcule l'empreinte HMAC-SHA256 sécurisée d'un OTP pour stockage en base.
 * @param {string} phoneNormalized - Numéro normalisé E.164
 * @param {string} schoolSlug - Slug de l'école ou 'global'
 * @param {string} rawOtp - Code OTP à 6 chiffres
 * @returns {string} Empreinte HMAC hexadécimale de 64 caractères
 */
function hashOtp(phoneNormalized, schoolSlug, rawOtp) {
    const secret = process.env.PASSWORD_RESET_OTP_SECRET;
    if (!secret || typeof secret !== 'string' || secret.trim().length < 32) {
        throw new Error('CONFIGURATION_INVALIDE: PASSWORD_RESET_OTP_SECRET manquant ou insuffisant (min 32 caractères).');
    }
    const phone = String(phoneNormalized ?? '').trim();
    const slug = String(schoolSlug ?? '').trim().toLowerCase();
    const otp = String(rawOtp ?? '').trim();

    return crypto.createHmac('sha256', secret.trim())
        .update(`${slug}:${phone}:${otp}`)
        .digest('hex');
}

/**
 * Valide et normalise un slug d'établissement (1 à 50 caractères alphanumériques et underscores).
 * @param {string} slug
 * @returns {string} slug normalisé en minuscules
 * @throws {Error} 'INVALID_SLUG'
 */
function validateSlug(slug) {
    const raw = String(slug ?? '').trim().toLowerCase();
    if (!/^[a-z0-9_]{1,50}$/.test(raw)) {
        throw new Error('INVALID_SLUG');
    }
    return raw;
}

/**
 * Valide un identifiant UUID v4 standard.
 * @param {string} id
 * @returns {boolean}
 */
function isValidUUID(id) {
    if (!id || typeof id !== 'string') return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id.trim());
}

/**
 * Valide qu'une valeur est une chaîne de caractères non vide bornée en taille.
 * @param {any} val
 * @param {number} minLen
 * @param {number} maxLen
 * @returns {string} chaîne nettoyée
 * @throws {Error} 'INVALID_STRING'
 */
function validateBoundedString(val, minLen = 1, maxLen = 1000) {
    if (typeof val !== 'string') {
        throw new Error('INVALID_STRING');
    }
    const trimmed = val.trim();
    if (trimmed.length < minLen || trimmed.length > maxLen) {
        throw new Error('INVALID_STRING');
    }
    return trimmed;
}

/**
 * Valide un montant positif fini.
 * @param {any} val
 * @returns {number}
 * @throws {Error} 'INVALID_AMOUNT'
 */
function validatePositiveNumber(val) {
    const num = Number(val);
    if (isNaN(num) || !isFinite(num) || num <= 0 || !Number.isSafeInteger(Math.floor(num))) {
        throw new Error('INVALID_AMOUNT');
    }
    return num;
}

/**
 * Vérifie la signature binaire réelle (magic bytes) d'un buffer de fichier pour empêcher l'usurpation d'extension.
 * @param {Buffer} buffer - Contenu binaire du fichier
 * @param {string[]} allowedCategories - Catégories autorisées: ['image', 'pdf', 'docx']
 * @returns {{ valid: boolean, detectedType: string|null, error?: string }}
 */
function verifyFileMagicBytes(buffer, allowedCategories = ['image', 'pdf']) {
    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 4) {
        return { valid: false, detectedType: null, error: 'FICHIER_VIDE_OU_INVALIDE' };
    }

    // JPEG : FF D8 FF
    const isJpeg = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;

    // PNG : 89 50 4E 47 0D 0A 1A 0A
    const isPng = buffer.length >= 8 &&
        buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47 &&
        buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A;

    // GIF : 47 49 46 38 ('GIF8')
    const isGif = buffer.length >= 6 &&
        buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38;

    // WEBP : 'RIFF' + 4 bytes + 'WEBP'
    const isWebp = buffer.length >= 12 &&
        buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;

    // PDF : 25 50 44 46 ('%PDF-')
    const isPdf = buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;

    // ZIP / DOCX / OpenXML : 50 4B 03 04 ou 50 4B 05 06 ('PK..')
    const isZip = buffer[0] === 0x50 && buffer[1] === 0x4B &&
        ((buffer[2] === 0x03 && buffer[3] === 0x04) || (buffer[2] === 0x05 && buffer[3] === 0x06));

    // Détection de contenus textuels ou scripts malveillants déguisés (PHP, HTML, SVG, JS)
    const headerString = buffer.slice(0, Math.min(buffer.length, 256)).toString('utf8').toLowerCase();
    if (headerString.includes('<?php') || headerString.includes('<html') || headerString.includes('<script') || headerString.includes('<svg') || headerString.includes('eval(')) {
        return { valid: false, detectedType: 'script_or_html', error: 'CONTENU_SCRIPT_OU_HTML_INTERDIT' };
    }

    if (isJpeg) return { valid: allowedCategories.includes('image'), detectedType: 'jpeg' };
    if (isPng) return { valid: allowedCategories.includes('image'), detectedType: 'png' };
    if (isWebp) return { valid: allowedCategories.includes('image'), detectedType: 'webp' };
    if (isGif) return { valid: allowedCategories.includes('image'), detectedType: 'gif' };
    if (isPdf) return { valid: allowedCategories.includes('pdf'), detectedType: 'pdf' };
    if (isZip) return { valid: allowedCategories.includes('docx'), detectedType: 'docx' };

    return { valid: false, detectedType: null, error: 'SIGNATURE_BINAIRE_NON_RECONNUE' };
}

module.exports = {
    normalizePhone,
    buildAuthEmail,
    hashOtp,
    validateSlug,
    isValidUUID,
    validateBoundedString,
    validatePositiveNumber,
    verifyFileMagicBytes
};
