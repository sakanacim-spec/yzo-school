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
