/**
 * Module de gestion de la locale et de la direction pour les Assistants Yziow (Frontend)
 */

export const SUPPORTED_ASSISTANT_LANGUAGES = [
    'fr', 'en', 'es', 'de', 'it', 'pt', 'ru', 'ar', 'zh'
] as const;

export type AssistantLanguage = typeof SUPPORTED_ASSISTANT_LANGUAGES[number];

/**
 * Normalise une langue vers l'une des 9 langues supportées par Yziow.
 * Applique un fallback déterministe vers 'fr' en cas de langue inconnue, vide ou corrompue.
 */
export function normalizeAssistantLanguage(rawLang?: string | null): AssistantLanguage {
    if (!rawLang || typeof rawLang !== 'string') {
        return 'fr';
    }
    const clean = rawLang.trim().toLowerCase().split(/[-_]/)[0];
    if ((SUPPORTED_ASSISTANT_LANGUAGES as readonly string[]).includes(clean)) {
        return clean as AssistantLanguage;
    }
    return 'fr';
}

/**
 * Détermine si la langue nécessite une disposition de droite à gauche (RTL).
 */
export function isRtlAssistantLanguage(lang?: string | null): boolean {
    return normalizeAssistantLanguage(lang) === 'ar';
}

/**
 * Retourne la direction CSS ('rtl' | 'ltr') pour la langue donnée.
 */
export function getAssistantDirection(lang?: string | null): 'rtl' | 'ltr' {
    return isRtlAssistantLanguage(lang) ? 'rtl' : 'ltr';
}
