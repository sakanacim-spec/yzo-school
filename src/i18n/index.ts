import { fr } from './fr';
import { en } from './en';
import { es } from './es';
import { ar } from './ar';
import { it } from './it';
import { de } from './de';
import { pt } from './pt';
import { zh } from './zh';
import { ru } from './ru';

export type Language = 'fr' | 'en' | 'es' | 'ar' | 'it' | 'de' | 'pt' | 'zh' | 'ru';
export type Translations = typeof fr;

const translations: Record<string, Translations> = { fr, en, es, ar, it, de, pt, zh, ru };

// Récupère la langue sauvegardée ou détecte celle du navigateur
export function getStoredLanguage(): Language {
  try {
    const stored = localStorage.getItem('app_language') as Language;
    const validLanguages: Language[] = ['fr', 'en', 'es', 'ar', 'it', 'de', 'pt', 'zh', 'ru'];
    if (validLanguages.includes(stored)) return stored;

    // Détection automatique du navigateur
    const browserLang = navigator.language?.split('-')[0] as Language;
    if (validLanguages.includes(browserLang)) {
      return browserLang;
    }
  } catch {}
  return 'fr';
}

// Sauvegarde la langue choisie
export function saveLanguage(lang: Language): void {
  try {
    localStorage.setItem('app_language', lang);
  } catch {}
}

// Retourne les traductions statiques pour la langue donnée (ou français)
export function getTranslations(lang: Language): Translations {
  return translations[lang] || translations.fr;
}

// Remplace les variables dans une chaîne de caractères
function replaceVars(str: string, vars?: Record<string, string | number>): string {
  if (!vars) return str;
  return Object.entries(vars).reduce(
    (acc, [key, val]) => acc.replace(new RegExp(`\\{${key}\\}`, 'g'), String(val)),
    str
  );
}

// Traduction synchrone 100% statique
export function t(lang: Language, path: string, vars?: Record<string, string | number>): string {
  const parts = path.split('.');
  
  // 1. Tenter de lire dans la langue cible
  let staticVal: any = translations[lang] || translations.fr;
  for (const part of parts) {
    staticVal = staticVal?.[part];
    if (staticVal === undefined) break;
  }

  if (typeof staticVal === 'string') {
    return replaceVars(staticVal, vars);
  }

  // 2. Fallback vers le français si non trouvé
  let fallbackVal: any = translations.fr;
  for (const part of parts) {
    fallbackVal = fallbackVal?.[part];
    if (fallbackVal === undefined) break;
  }

  return typeof fallbackVal === 'string' ? replaceVars(fallbackVal, vars) : undefined as any;
}

export { fr, en, es, ar, it, de, pt, zh, ru };
