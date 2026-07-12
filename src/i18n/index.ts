// ============================================================
// SYSTÈME I18N DYNAMIQUE — Support des traductions statiques et Google Translation API
// ============================================================
import { fr } from './fr';
import { en } from './en';
import { es } from './es';
import { ar } from './ar';
import { translationApi } from '../services/translationApi';

export type Language = 'fr' | 'en' | 'es' | 'ar' | 'it' | 'de' | 'pt' | 'zh' | 'ru';
export type Translations = typeof fr;

const translations: Record<string, Translations> = { fr, en, es, ar };

// Cache local en mémoire
const translationCache: Record<string, Record<string, string>> = {};
const pendingTranslations = new Set<string>();

// Récupère ou initialise le cache d'une langue
function getCacheForLanguage(lang: string): Record<string, string> {
  if (!translationCache[lang]) {
    try {
      const stored = localStorage.getItem(`app_translations_cache_${lang}`);
      translationCache[lang] = stored ? JSON.parse(stored) : {};
    } catch {
      translationCache[lang] = {};
    }
  }
  return translationCache[lang];
}

// Enregistre une valeur dans le cache
function setCacheValue(lang: string, key: string, val: string): void {
  const cache = getCacheForLanguage(lang);
  cache[key] = val;
  try {
    localStorage.setItem(`app_translations_cache_${lang}`, JSON.stringify(cache));
  } catch {}
}

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
    (acc, [key, val]) => acc.replace(new RegExp(`{${key}}`, 'g'), String(val)),
    str
  );
}

// Traduction synchrone réactive avec fallback et cache
export function t(lang: Language, path: string, vars?: Record<string, string | number>): string {
  const parts = path.split('.');
  
  // 1. Tenter de lire dans les traductions statiques
  let staticVal: any = translations[lang];
  if (staticVal) {
    for (const part of parts) {
      staticVal = staticVal?.[part];
      if (staticVal === undefined) break;
    }
  }

  if (typeof staticVal === 'string') {
    return replaceVars(staticVal, vars);
  }

  // 2. Tenter de lire dans le cache dynamique
  const cache = getCacheForLanguage(lang);
  if (cache[path]) {
    return replaceVars(cache[path], vars);
  }

  // 3. Récupérer la valeur française par défaut
  let defaultVal: any = translations.fr;
  for (const part of parts) {
    defaultVal = defaultVal?.[part];
    if (defaultVal === undefined) break;
  }
  
  // Le système ne doit plus jamais afficher de clés brutes à l'utilisateur (ex: 'settings.system')
  // Si la valeur par défaut est absente de fr.ts, on utilise undefined (laisse l'UI utiliser le fallback `||`)
  const fallbackStr = typeof defaultVal === 'string' ? defaultVal : undefined;

  // 4. Si la langue n'est pas le français, lancer la traduction dynamique asynchrone
  if (lang !== 'fr' && fallbackStr && !pendingTranslations.has(`${lang}:${path}`)) {
    pendingTranslations.add(`${lang}:${path}`);

    translationApi.translate(fallbackStr, lang, 'fr')
      .then((translated) => {
        if (typeof translated === 'string' && translated !== fallbackStr) {
          setCacheValue(lang, path, translated);
          
          // Déclencher le re-render en évitant les imports circulaires
          import('../store/useStore')
            .then((storeModule) => {
              const store = storeModule.useStore.getState();
              if (store && typeof store.forceTranslationUpdate === 'function') {
                store.forceTranslationUpdate();
              }
            })
            .catch(console.error);
        }
      })
      .catch(console.error)
      .finally(() => {
        pendingTranslations.delete(`${lang}:${path}`);
      });
  }

  // Si fallbackStr est undefined (clé introuvable partout), on retourne undefined as any 
  // pour que le fallback React `t('..') || 'Texte'` prenne le relais.
  if (fallbackStr === undefined) return undefined as any;

  return replaceVars(fallbackStr, vars);
}

export { fr, en, es, ar };
