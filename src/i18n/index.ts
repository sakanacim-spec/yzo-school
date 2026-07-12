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

// File d'attente pour le batching
let batchTimer: any = null;
let batchQueue: Array<{ lang: Language, path: string, fallbackStr: string }> = [];

// Nettoyage des anciens caches (V1)
try {
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('app_translations_cache_')) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));
} catch {}

// Récupère ou initialise le cache d'une langue (V2)
function getCacheForLanguage(lang: string): Record<string, string> {
  if (!translationCache[lang]) {
    try {
      const stored = localStorage.getItem(`app_translations_v2_cache_${lang}`);
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
    localStorage.setItem(`app_translations_v2_cache_${lang}`, JSON.stringify(cache));
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

// Déclenche le re-render React de l'interface
function triggerUpdate() {
  import('../store/useStore')
    .then((storeModule) => {
      const store = storeModule.useStore.getState();
      if (store && typeof store.forceTranslationUpdate === 'function') {
        store.forceTranslationUpdate();
      }
    })
    .catch(console.error);
}

// Traitement par lots (Batching) des demandes de traduction
async function processBatch() {
  if (batchQueue.length === 0) return;
  const currentBatch = [...batchQueue];
  batchQueue = [];

  // Grouper par langue
  const byLang: Record<string, typeof currentBatch> = {};
  for (const item of currentBatch) {
    if (!byLang[item.lang]) byLang[item.lang] = [];
    // Déduplication stricte dans le même lot
    if (!byLang[item.lang].find(x => x.path === item.path)) {
      byLang[item.lang].push(item);
    }
  }

  for (const [lang, items] of Object.entries(byLang)) {
    const textsToTranslate = items.map(i => i.fallbackStr);
    
    try {
      const translatedArray = await translationApi.translate(textsToTranslate, lang, 'fr');
      let updated = false;
      const results = Array.isArray(translatedArray) ? translatedArray : [translatedArray];

      items.forEach((item, index) => {
        const translated = results[index];
        
        // VALIDATION STRICTE
        // On refuse de mettre en cache si la réponse commence par "[" ou est identique au texte source (signe d'erreur)
        if (
          typeof translated === 'string' &&
          translated !== item.fallbackStr &&
          !translated.startsWith('[')
        ) {
          setCacheValue(lang, item.path, translated);
          updated = true;
        }
        
        // Libérer le verrou pour un éventuel retry futur
        pendingTranslations.delete(`${lang}:${item.path}`);
      });

      if (updated) triggerUpdate();

    } catch (err) {
      console.error(`❌ Batch translation failed for ${lang}:`, err);
      // En cas d'erreur globale du lot, on libère les verrous pour ne pas bloquer l'interface indéfiniment
      items.forEach(item => pendingTranslations.delete(`${lang}:${item.path}`));
    }
  }
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

  // 2. Tenter de lire dans le cache dynamique V2
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
  
  const fallbackStr = typeof defaultVal === 'string' ? defaultVal : undefined;

  // 4. Si la langue n'est pas le français, lancer la traduction dynamique asynchrone (Batch)
  if (lang !== 'fr' && fallbackStr && !pendingTranslations.has(`${lang}:${path}`)) {
    pendingTranslations.add(`${lang}:${path}`);
    batchQueue.push({ lang, path, fallbackStr });

    if (!batchTimer) {
      batchTimer = setTimeout(() => {
        batchTimer = null;
        processBatch();
      }, 500); // 500ms d'accumulation
    }
  }

  // Si fallbackStr est undefined (clé introuvable partout), on retourne undefined as any 
  if (fallbackStr === undefined) return undefined as any;

  return replaceVars(fallbackStr, vars);
}

export { fr, en, es, ar };
