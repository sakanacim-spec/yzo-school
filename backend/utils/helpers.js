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

module.exports = {
    normalizePhone,
    buildAuthEmail,
    hashOtp
};
