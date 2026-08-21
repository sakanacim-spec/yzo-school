/**
 * Gestionnaire de polices Unicode, façonnage arabe (shaping) complet (ligatures Lam-Alef)
 * et algorithme bidirectionnel (BiDi) pour jsPDF.
 */

import type { SupportedLanguage } from './pdfLocale.ts';
import { normalizeLanguage, isRtlLanguage } from './pdfLocale.ts';

export interface FontDescriptor {
  fontName: string;
  fontFile: string;
  fallbackFont: string;
  isRtl: boolean;
  requiresShaping: boolean;
  script: 'latin' | 'cyrillic' | 'arabic' | 'cjk';
}

// Table de façonnage des caractères arabes vers les formes de présentation Unicode (Forms-B)
// [Code point, Isolé, Final, Médian, Initial]
const ARABIC_GLYPH_TABLE: Record<number, [number, number, number, number]> = {
  0x0621: [0xFE80, 0xFE80, 0xFE80, 0xFE80], // HAMZA
  0x0622: [0xFE81, 0xFE82, 0xFE82, 0xFE81], // ALEF WITH MADDA
  0x0623: [0xFE83, 0xFE84, 0xFE84, 0xFE83], // ALEF WITH HAMZA ABOVE
  0x0624: [0xFE85, 0xFE86, 0xFE86, 0xFE85], // WAW WITH HAMZA ABOVE
  0x0625: [0xFE87, 0xFE88, 0xFE88, 0xFE87], // ALEF WITH HAMZA BELOW
  0x0626: [0xFE89, 0xFE8A, 0xFE8C, 0xFE8B], // YEH WITH HAMZA ABOVE
  0x0627: [0xFE8D, 0xFE8E, 0xFE8E, 0xFE8D], // ALEF
  0x0628: [0xFE8F, 0xFE90, 0xFE92, 0xFE91], // BEH
  0x0629: [0xFE93, 0xFE94, 0xFE94, 0xFE93], // TEH MARBUTA
  0x062A: [0xFE95, 0xFE96, 0xFE98, 0xFE97], // TEH
  0x062B: [0xFE99, 0xFE9A, 0xFE9C, 0xFE9B], // THEH
  0x062C: [0xFE9D, 0xFE9E, 0xFEA0, 0xFE9F], // JEEM
  0x062D: [0xFEA1, 0xFEA2, 0xFEA4, 0xFEA3], // HAH
  0x062E: [0xFEA5, 0xFEA6, 0xFEA8, 0xFEA7], // KHAH
  0x062F: [0xFEA9, 0xFEAA, 0xFEAA, 0xFEA9], // DAL
  0x0630: [0xFEAB, 0xFEAC, 0xFEAC, 0xFEAB], // THAL
  0x0631: [0xFEAD, 0xFEAE, 0xFEAE, 0xFEAD], // REH
  0x0632: [0xFEAF, 0xFEB0, 0xFEB0, 0xFEAF], // ZAIN
  0x0633: [0xFEB1, 0xFEB2, 0xFEB4, 0xFEB3], // SEEN
  0x0634: [0xFEB5, 0xFEB6, 0xFEB8, 0xFEB7], // SHEEN
  0x0635: [0xFEB9, 0xFEBA, 0xFEBC, 0xFEBB], // SAD
  0x0636: [0xFEBD, 0xFEBE, 0xFEC0, 0xFEBF], // DAD
  0x0637: [0xFEC1, 0xFEC2, 0xFEC4, 0xFEC3], // TAH
  0x0638: [0xFEC5, 0xFEC6, 0xFEC8, 0xFEC7], // ZAH
  0x0639: [0xFEC9, 0xFECA, 0xFECC, 0xFECB], // AIN
  0x063A: [0xFECD, 0xFECE, 0xFED0, 0xFECF], // GHAIN
  0x0641: [0xFED1, 0xFED2, 0xFED4, 0xFED3], // FEH
  0x0642: [0xFED5, 0xFED6, 0xFED8, 0xFED7], // QAF
  0x0643: [0xFED9, 0xFEDA, 0xFEDC, 0xFEDB], // KAF
  0x0644: [0xFEDD, 0xFEDE, 0xFEE0, 0xFEDF], // LAM
  0x0645: [0xFEE1, 0xFEE2, 0xFEE4, 0xFEE3], // MEEM
  0x0646: [0xFEE5, 0xFEE6, 0xFEE8, 0xFEE7], // NOON
  0x0647: [0xFEE9, 0xFEEA, 0xFEEC, 0xFEEB], // HEH
  0x0648: [0xFEED, 0xFEEE, 0xFEEE, 0xFEED], // WAW
  0x0649: [0xFEEF, 0xFEF0, 0xFEF0, 0xFEEF], // ALEF MAKSURA
  0x064A: [0xFEF1, 0xFEF2, 0xFEF4, 0xFEF3], // YEH
};

// Table des ligatures Lam-Alef (Isolé, Final)
const LAM_ALEF_MAP: Record<number, [number, number]> = {
  0x0622: [0xFEF3, 0xFEF4], // LAM + ALEF WITH MADDA (لآ)
  0x0623: [0xFEF5, 0xFEF6], // LAM + ALEF WITH HAMZA ABOVE (لأ)
  0x0625: [0xFEF7, 0xFEF8], // LAM + ALEF WITH HAMZA BELOW (لإ)
  0x0627: [0xFEFB, 0xFEFC], // LAM + ALEF (لا)
};

// Lettres qui ne se lient pas à gauche (lettres non joignantes à gauche)
const RIGHT_JOINING_ONLY = new Set([
  0x0622, 0x0623, 0x0624, 0x0625, 0x0627, 0x062F, 0x0630, 0x0631, 0x0632, 0x0648, 0x0649,
  0xFE81, 0xFE82, 0xFE83, 0xFE84, 0xFE85, 0xFE86, 0xFE87, 0xFE88, 0xFE8D, 0xFE8E, 0xFEA9, 0xFEAA,
  0xFEAB, 0xFEAC, 0xFEAD, 0xFEAE, 0xFEAF, 0xFEB0, 0xFEED, 0xFEEE, 0xFEEF, 0xFEF0, 0xFEF3, 0xFEF4,
  0xFEF5, 0xFEF6, 0xFEF7, 0xFEF8, 0xFEFB, 0xFEFC
]);

// Cache global en mémoire des polices chargées en base64
const inMemoryFontDataCache = new Map<string, string>();
// Map des promesses en cours pour éliminer les requêtes concurrentes dupliquées
const pendingFontLoads = new Map<string, Promise<string>>();

/**
 * Retourne le descripteur de police pour la langue demandée.
 */
export function getFontDescriptorForLanguage(lang?: string | null): FontDescriptor {
  const norm = normalizeLanguage(lang);

  switch (norm) {
    case 'ar':
      return {
        fontName: 'NotoSansArabic',
        fontFile: 'NotoSansArabic-Regular.ttf',
        fallbackFont: 'helvetica',
        isRtl: true,
        requiresShaping: true,
        script: 'arabic',
      };
    case 'ru':
      return {
        fontName: 'NotoSans',
        fontFile: 'NotoSans-Regular.ttf',
        fallbackFont: 'helvetica',
        isRtl: false,
        requiresShaping: false,
        script: 'cyrillic',
      };
    case 'zh':
      return {
        fontName: 'ZCOOLXiaoWei',
        fontFile: 'ZCOOLXiaoWei-Regular.ttf',
        fallbackFont: 'helvetica',
        isRtl: false,
        requiresShaping: false,
        script: 'cjk',
      };
    default:
      return {
        fontName: 'NotoSans',
        fontFile: 'NotoSans-Regular.ttf',
        fallbackFont: 'helvetica',
        isRtl: false,
        requiresShaping: false,
        script: 'latin',
      };
  }
}

/**
 * Vérifie si un code caractère correspond à une lettre arabe.
 */
function isArabicChar(code: number): boolean {
  return (code >= 0x0621 && code <= 0x064A) || (code >= 0xFE70 && code <= 0xFEFF);
}

/**
 * Applique le façonnage arabe (shaping) contextuel et les ligatures Lam-Alef.
 */
export function shapeArabicText(text: string): string {
  if (!text || typeof text !== 'string') return '';

  const chars = Array.from(text);
  const shapedChars: string[] = [];

  for (let i = 0; i < chars.length; i++) {
    const code = chars[i].charCodeAt(0);

    // 1. Détection de la ligature Lam-Alef (0x0644 + 0x0622/0623/0625/0627)
    if (code === 0x0644 && i < chars.length - 1) {
      const nextCode = chars[i + 1].charCodeAt(0);
      const ligature = LAM_ALEF_MAP[nextCode];
      if (ligature) {
        const prevCode = i > 0 ? chars[i - 1].charCodeAt(0) : 0;
        const prevCanJoin = isArabicChar(prevCode) && !RIGHT_JOINING_ONLY.has(prevCode) && ARABIC_GLYPH_TABLE[prevCode] !== undefined;
        // Si la lettre précédente peut se lier, forme finale (1), sinon isolée (0)
        const ligatureCode = prevCanJoin ? ligature[1] : ligature[0];
        shapedChars.push(String.fromCharCode(ligatureCode));
        i++; // Sauter le Alef consommé par la ligature
        continue;
      }
    }

    const glyphInfo = ARABIC_GLYPH_TABLE[code];
    if (!glyphInfo) {
      shapedChars.push(chars[i]);
      continue;
    }

    const prevCode = i > 0 ? chars[i - 1].charCodeAt(0) : 0;
    const nextCode = i < chars.length - 1 ? chars[i + 1].charCodeAt(0) : 0;

    const prevCanJoin = isArabicChar(prevCode) && !RIGHT_JOINING_ONLY.has(prevCode) && ARABIC_GLYPH_TABLE[prevCode] !== undefined;
    const nextCanJoin = isArabicChar(nextCode) && ARABIC_GLYPH_TABLE[nextCode] !== undefined;

    let formIndex = 0; // 0: Isolé, 1: Final, 2: Médian, 3: Initial

    if (prevCanJoin && nextCanJoin && !RIGHT_JOINING_ONLY.has(code)) {
      formIndex = 2; // Médian
    } else if (prevCanJoin) {
      formIndex = 1; // Final
    } else if (nextCanJoin && !RIGHT_JOINING_ONLY.has(code)) {
      formIndex = 3; // Initial
    } else {
      formIndex = 0; // Isolé
    }

    shapedChars.push(String.fromCharCode(glyphInfo[formIndex]));
  }

  return shapedChars.join('');
}

// Table d'inversion des caractères miroirs en mode RTL
const MIRRORED_PAIRS: Record<string, string> = {
  '(': ')',
  ')': '(',
  '[': ']',
  ']': '[',
  '{': '}',
  '}': '{',
  '<': '>',
  '>': '<',
  '«': '»',
  '»': '«',
};

/**
 * Traitement bidirectionnel (BiDi) pour texte arabe mixte (arabe + chiffres + mots latins).
 */
export function processBiDiText(text: string, isRtl: boolean): string {
  if (!text || typeof text !== 'string') return '';
  if (!isRtl) return text;

  // Si le texte contient des retours à la ligne, traiter chaque ligne séparément
  if (text.includes('\n')) {
    return text
      .split('\n')
      .map((line) => processBiDiText(line, isRtl))
      .join('\n');
  }

  // 1. Façonner d'abord les caractères arabes
  const shaped = shapeArabicText(text);

  // 2. Découper en segments selon le type d'écriture (Arabe vs LTR / Chiffres / Ponctuation)
  // Tokenize en blocs
  const tokens: { text: string; isRtl: boolean; isNeutral: boolean }[] = [];
  const regex = /([\u0600-\u06FF\uFE70-\uFEFF]+|[A-Za-z0-9_#$€£¥\/\-+*.:%]+|[\s()\[\]{}«»,\-!?]+|[^\s\w])/g;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(shaped)) !== null) {
    const token = match[0];
    const isArabic = /[\u0600-\u06FF\uFE70-\uFEFF]/.test(token);
    const isLtr = /[A-Za-z0-9]/.test(token);
    const isNeutral = !isArabic && !isLtr;

    tokens.push({
      text: token,
      isRtl: isArabic,
      isNeutral,
    });
  }

  // 3. Inverser chaque mot arabe en interne pour le canvas LTR de jsPDF
  const processedTokens = tokens.map((t) => {
    if (t.isRtl) {
      return Array.from(t.text).reverse().join('');
    }
    if (t.isNeutral) {
      // Inverser les parenthèses et guillemets miroirs
      return Array.from(t.text)
        .map((c) => MIRRORED_PAIRS[c] || c)
        .join('');
    }
    // Les chiffres et mots latins (ex: "YZIOW", "2026", "15/20") restent tels quels en LTR
    return t.text;
  });

  // 4. Inverser l'ordre global des segments dans la ligne
  return processedTokens.reverse().join('');
}

/**
 * Prépare une chaîne de caractères pour l'impression jsPDF selon la langue.
 */
export function prepareTextForPdf(text: string, lang?: string | null): string {
  if (!text || typeof text !== 'string') return '';
  const isRtl = isRtlLanguage(lang);
  if (isRtl) {
    return processBiDiText(text, true);
  }
  return text;
}

/**
 * Charge les données binaires d'une police en base64 de manière sécurisée et concurrente.
 */
export async function loadFontData(fontFile: string): Promise<string | null> {
  if (inMemoryFontDataCache.has(fontFile)) {
    return inMemoryFontDataCache.get(fontFile)!;
  }

  if (pendingFontLoads.has(fontFile)) {
    return pendingFontLoads.get(fontFile)!;
  }

  const loadPromise = (async () => {
    try {
      // Environnement navigateur
      if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
        const fontUrl = `/fonts/${fontFile}`;
        const response = await fetch(fontUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} chargement police ${fontFile}`);
        }
        const buffer = await response.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);
        inMemoryFontDataCache.set(fontFile, base64);
        return base64;
      }

      // Environnement Node.js (Tests unitaires)
      if (typeof process !== 'undefined' && process.versions && process.versions.node) {
        try {
          const fs = await import('fs');
          const path = await import('path');
          const localPath = path.resolve(process.cwd(), 'public', 'fonts', fontFile);
          if (fs.existsSync(localPath)) {
            const fontBuf = fs.readFileSync(localPath);
            const base64 = fontBuf.toString('base64');
            inMemoryFontDataCache.set(fontFile, base64);
            return base64;
          }
        } catch (_nodeErr) {
          // Erreur d'import Node fs/path ignorée
        }
      }

      return null;
    } catch (_err) {
      return null;
    } finally {
      pendingFontLoads.delete(fontFile);
    }
  })();

  pendingFontLoads.set(fontFile, loadPromise as Promise<string>);
  return loadPromise;
}

/**
 * Enregistre de manière asynchrone et multi-instance une police Unicode dans une instance jsPDF.
 * En cas d'échec pour du cyrillique, arabe ou CJK, lève une exception explicite (interdiction de faux succès).
 */
export async function registerFontInDoc(doc: any, fontDescriptor: FontDescriptor): Promise<string> {
  if (!doc) return 'helvetica';

  const { fontName, fontFile, fallbackFont, script } = fontDescriptor;

  // Si la police est standard jsPDF (uniquement pour du pur ASCII/Latin)
  if (fontName === 'helvetica' || fontName === 'times' || fontName === 'courier') {
    return fontName;
  }

  // Vérifier si le document possède déjà la police
  if (doc.getFontList && doc.getFontList()[fontName]) {
    return fontName;
  }

  // Charger les données binaires
  const fontBase64 = await loadFontData(fontFile);
  if (!fontBase64) {
    if (script === 'arabic' || script === 'cyrillic' || script === 'cjk') {
      throw new Error(`POLICE_UNICODE_INDISPONIBLE: Impossible de charger la police obligatoire ${fontFile} (${fontName}) pour le script ${script}. Bascule Helvetica interdite.`);
    }
    return fallbackFont || 'helvetica';
  }

  // Enregistrer dans le VFS du document jsPDF
  // Note: Seules les fontes Regular sont physiquement présentes (NotoSans, NotoSansArabic, ZCOOLXiaoWei).
  // On déclare les variantes de style (bold, italic, bolditalic) vers le fichier Regular existant comme
  // alias technique pour permettre à autoTable et jsPDF de résoudre les styles sans avertissement ni crash.
  if (typeof doc.addFileToVFS === 'function' && typeof doc.addFont === 'function') {
    doc.addFileToVFS(fontFile, fontBase64);
    doc.addFont(fontFile, fontName, 'normal');
    doc.addFont(fontFile, fontName, 'bold');
    doc.addFont(fontFile, fontName, 'italic');
    doc.addFont(fontFile, fontName, 'bolditalic');
    return fontName;
  }

  if (script === 'arabic' || script === 'cyrillic' || script === 'cjk') {
    throw new Error(`POLICE_UNICODE_INDISPONIBLE: L'instance jsPDF ne supporte pas l'injection de police VFS pour ${fontName}.`);
  }

  return fallbackFont || 'helvetica';
}

/**
 * Enregistrement synchrone (fallback sécurisé)
 */
export function ensureFontRegistered(doc: any, fontDescriptor: FontDescriptor): string {
  if (!doc) return 'helvetica';

  try {
    const { fontName, fontFile, fallbackFont } = fontDescriptor;

    if (fontName === 'helvetica' || fontName === 'times' || fontName === 'courier') {
      return fontName;
    }

    if (doc.getFontList && doc.getFontList()[fontName]) {
      return fontName;
    }

    if (inMemoryFontDataCache.has(fontFile)) {
      const fontBase64 = inMemoryFontDataCache.get(fontFile)!;
      doc.addFileToVFS(fontFile, fontBase64);
      doc.addFont(fontFile, fontName, 'normal');
      doc.addFont(fontFile, fontName, 'bold');
      doc.addFont(fontFile, fontName, 'italic');
      doc.addFont(fontFile, fontName, 'bolditalic');
      return fontName;
    }

    return fallbackFont || 'helvetica';
  } catch (_err) {
    return fontDescriptor.fallbackFont || 'helvetica';
  }
}

/**
 * Réinitialise tous les caches (pour tests unitaires).
 */
export function clearFontRegistrationCache(): void {
  inMemoryFontDataCache.clear();
  pendingFontLoads.clear();
}
