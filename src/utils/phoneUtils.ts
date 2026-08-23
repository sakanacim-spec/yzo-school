import { parsePhoneNumberFromString, CountryCode } from 'libphonenumber-js/max';

export interface PhoneValidationResult {
  valid: boolean;
  e164: string;
  nationalNumber: string;
  countryCallingCode?: string;
  country?: CountryCode;
  error?: string;
}

/**
 * Normalise et valide un numéro de téléphone avec indicatif pays
 * Accepte les formats locaux valides pour le pays donné, les formats internationaux avec +, et avec 00.
 */
export function normalizePhoneNumber(
  rawPhone: string,
  countryCode: string = 'BJ'
): PhoneValidationResult {
  const input = String(rawPhone || '').trim();

  if (!input) {
    return {
      valid: false,
      e164: '',
      nationalNumber: '',
      error: 'PHONE_EMPTY'
    };
  }

  // Convertir '00' international en '+'
  const normalizedInput = input.startsWith('00')
    ? `+${input.slice(2)}`
    : input;

  const defaultCountry = (countryCode || 'BJ').toUpperCase() as CountryCode;

  try {
    const parsed = parsePhoneNumberFromString(normalizedInput, {
      defaultCountry,
      extract: false
    });

    if (parsed && parsed.isValid()) {
      return {
        valid: true,
        e164: parsed.number,
        nationalNumber: parsed.nationalNumber,
        countryCallingCode: parsed.countryCallingCode,
        country: parsed.country
      };
    }

    return {
      valid: false,
      e164: '',
      nationalNumber: input,
      error: 'INVALID_PHONE_FORMAT'
    };
  } catch (err) {
    return {
      valid: false,
      e164: '',
      nationalNumber: input,
      error: 'PHONE_PARSE_ERROR'
    };
  }
}

/**
 * Décompose un numéro de téléphone stocké (ex: +2290141222222 ou 0141222222)
 * en pays (ex: 'BJ') et numéro local/national propre (ex: '0141222222').
 */
export function extractCountryAndLocalPhone(
  rawPhone: string,
  fallbackCountry: string = 'BJ'
): { countryCode: string; localNumber: string } {
  if (!rawPhone || !rawPhone.trim()) {
    return { countryCode: (fallbackCountry || 'BJ').toUpperCase(), localNumber: '' };
  }

  const trimmed = rawPhone.trim();
  const normalized = trimmed.startsWith('00') ? `+${trimmed.slice(2)}` : trimmed;

  if (normalized.startsWith('+')) {
    try {
      const parsed = parsePhoneNumberFromString(normalized);
      if (parsed && parsed.country) {
        const callingCode = parsed.countryCallingCode;
        const local = normalized.slice(callingCode.length + 1); // retire +<codeCalling>
        return {
          countryCode: parsed.country,
          localNumber: local
        };
      }
    } catch {
      // ignore
    }
  }

  return {
    countryCode: (fallbackCountry || 'BJ').toUpperCase(),
    localNumber: trimmed
  };
}

/**
 * Reconstruit un numéro E.164 depuis une saisie locale et un code pays sélectionné.
 */
export function buildE164PhoneNumber(
  localPhone: string,
  countryCode: string = 'BJ'
): PhoneValidationResult {
  return normalizePhoneNumber(localPhone, countryCode);
}
