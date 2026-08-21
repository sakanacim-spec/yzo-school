/**
 * Utilitaires d'internationalisation et de localisation pour les documents PDF et impressions YZIOW.
 * Gestion standardisée des 9 langues supportées : fr, en, es, ar, it, de, pt, zh, ru.
 */

export type SupportedLanguage = 'fr' | 'en' | 'es' | 'ar' | 'it' | 'de' | 'pt' | 'zh' | 'ru';

export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = [
  'fr', 'en', 'es', 'ar', 'it', 'de', 'pt', 'zh', 'ru'
] as const;

export const DEFAULT_LANGUAGE: SupportedLanguage = 'fr';

export const BCP47_LOCALE_MAP: Record<SupportedLanguage, string> = {
  fr: 'fr-FR',
  en: 'en-US',
  es: 'es-ES',
  ar: 'ar-SA',
  it: 'it-IT',
  de: 'de-DE',
  pt: 'pt-PT',
  zh: 'zh-CN',
  ru: 'ru-RU',
};

/**
 * Normalise une chaîne de langue vers l'une des 9 langues supportées avec repli sécurisé sur 'fr'.
 */
export function normalizeLanguage(lang?: string | null): SupportedLanguage {
  if (!lang || typeof lang !== 'string') {
    return DEFAULT_LANGUAGE;
  }
  const clean = lang.trim().toLowerCase().slice(0, 2) as SupportedLanguage;
  if (SUPPORTED_LANGUAGES.includes(clean)) {
    return clean;
  }
  return DEFAULT_LANGUAGE;
}

/**
 * Détermine si la langue nécessite un rendu de droite à gauche (RTL).
 */
export function isRtlLanguage(lang?: string | null): boolean {
  const norm = normalizeLanguage(lang);
  return norm === 'ar';
}

/**
 * Retourne la direction textuelle ('ltr' ou 'rtl').
 */
export function getTextDirection(lang?: string | null): 'ltr' | 'rtl' {
  return isRtlLanguage(lang) ? 'rtl' : 'ltr';
}

/**
 * Retourne le tag BCP-47 correspondant à la langue.
 */
export function getBcp47Locale(lang?: string | null): string {
  const norm = normalizeLanguage(lang);
  return BCP47_LOCALE_MAP[norm] || 'fr-FR';
}

/**
 * Formate une date selon la locale spécifiée.
 */
export function formatLocalizedDate(
  date: string | Date | number,
  lang?: string | null,
  options?: Intl.DateTimeFormatOptions
): string {
  try {
    const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
    if (isNaN(d.getTime())) {
      return '';
    }
    const bcp47 = getBcp47Locale(lang);
    const defaultOptions: Intl.DateTimeFormatOptions = options || {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    };
    return new Intl.DateTimeFormat(bcp47, defaultOptions).format(d);
  } catch (_e) {
    // Fallback safe ISO
    const d = new Date(date);
    return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }
}

/**
 * Formate un nombre selon la locale spécifiée.
 */
export function formatLocalizedNumber(
  num: number,
  lang?: string | null,
  options?: Intl.NumberFormatOptions
): string {
  try {
    if (typeof num !== 'number' || isNaN(num)) {
      return '0';
    }
    const bcp47 = getBcp47Locale(lang);
    return new Intl.NumberFormat(bcp47, options).format(num);
  } catch (_e) {
    return String(num);
  }
}

/**
 * Formate un montant et une devise selon la locale et le code de devise fournis.
 * Si aucun code devise n'est fourni, 'FCFA' est utilisé par défaut.
 */
export function formatLocalizedCurrency(
  amount: number,
  currencyCode?: string | null,
  lang?: string | null
): string {
  try {
    const val = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
    const currency = (currencyCode || 'FCFA').trim();
    const norm = normalizeLanguage(lang);
    const bcp47 = getBcp47Locale(norm);

    // Si la devise est un code ISO 4217 standardisé (USD, EUR, GBP, XOF, etc.), tenter Intl currency
    const isIsoCode = /^[A-Z]{3}$/.test(currency);

    if (isIsoCode && currency !== 'FCFA') {
      try {
        return new Intl.NumberFormat(bcp47, {
          style: 'currency',
          currency,
          maximumFractionDigits: 2,
        }).format(val);
      } catch (_isoErr) {
        // Fallback standard si devise non supportée par le navigateur
      }
    }

    // Formatage numérique avec placement de symbole selon la direction
    const formattedNumber = new Intl.NumberFormat(bcp47, {
      maximumFractionDigits: 2,
    }).format(val);

    if (norm === 'ar') {
      return `${formattedNumber} ${currency}`;
    }
    if (norm === 'en') {
      return `${currency} ${formattedNumber}`;
    }
    return `${formattedNumber} ${currency}`;
  } catch (_e) {
    return `${amount} ${currencyCode || 'FCFA'}`;
  }
}

/**
 * Récupère la langue active stockée dans le navigateur (localStorage) avec repli 'fr'.
 */
export function getStoredLanguage(): SupportedLanguage {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const stored = localStorage.getItem('yziow_lang') || localStorage.getItem('lang');
      if (stored) return normalizeLanguage(stored);
    } catch {
      // ignore localStorage errors
    }
  }
  return DEFAULT_LANGUAGE;
}
