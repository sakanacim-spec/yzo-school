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

module.exports = {
    normalizePhone,
    buildAuthEmail
};
