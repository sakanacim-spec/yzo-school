// ============================================================
// SYSTÈME I18N — Gestion des traductions FR / EN
// ============================================================
import { fr } from './fr';
import { en } from './en';

export type Language = 'fr' | 'en';
export type Translations = typeof fr;

const translations: Record<Language, Translations> = { fr, en };

// Récupère la langue sauvegardée ou le français par défaut
export function getStoredLanguage(): Language {
  try {
    const stored = localStorage.getItem('app_language');
    if (stored === 'en' || stored === 'fr') return stored;
  } catch {}
  return 'fr';
}

// Sauvegarde la langue choisie
export function saveLanguage(lang: Language): void {
  try {
    localStorage.setItem('app_language', lang);
  } catch {}
}

// Retourne les traductions pour la langue donnée
export function getTranslations(lang: Language): Translations {
  return translations[lang] || translations.fr;
}

// Hook React léger (sans context) — importe useStore dans les composants
export function t(lang: Language, path: string, vars?: Record<string, string | number>): string {
  const parts = path.split('.');
  let value: any = translations[lang] || translations.fr;
  
  for (const part of parts) {
    value = value?.[part];
    if (value === undefined) break;
  }
  
  if (typeof value !== 'string') return path;
  
  // Remplacement des variables ex: {count}
  if (vars) {
    return Object.entries(vars).reduce(
      (str, [key, val]) => str.replace(`{${key}}`, String(val)),
      value
    );
  }
  
  return value;
}

export { fr, en };
