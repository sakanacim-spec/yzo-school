/**
 * Moteur centralisé de génération documentaire internationalisée pour YZIOW (jsPDF).
 * Fournit une instance préconfigurée de jsPDF avec police Unicode, sens de lecture LTR/RTL,
 * et utilitaires de formatage localisés.
 */

import { jsPDF } from 'jspdf';
import type { SupportedLanguage } from './pdfLocale.ts';
import {
  normalizeLanguage,
  isRtlLanguage,
  getTextDirection,
  getBcp47Locale,
  formatLocalizedDate,
  formatLocalizedNumber,
  formatLocalizedCurrency,
} from './pdfLocale.ts';
import type { FontDescriptor } from './pdfFonts.ts';
import {
  getFontDescriptorForLanguage,
  ensureFontRegistered,
  registerFontInDoc,
  prepareTextForPdf,
} from './pdfFonts.ts';

export interface I18nPdfOptions {
  language?: string | null;
  orientation?: 'portrait' | 'landscape' | 'p' | 'l';
  unit?: 'mm' | 'pt' | 'cm' | 'in';
  format?: string | [number, number];
  currency?: string | null;
}

export interface I18nPdfInstance {
  doc: jsPDF;
  language: SupportedLanguage;
  bcp47Locale: string;
  isRtl: boolean;
  direction: 'ltr' | 'rtl';
  fontDescriptor: FontDescriptor;
  effectiveFont: string;
  formatDate: (date: string | Date | number, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (num: number, options?: Intl.NumberFormatOptions) => string;
  formatMoney: (amount: number, customCurrency?: string | null) => string;
  prepareText: (text: string) => string;
  writeText: (text: string, x: number, y: number, options?: any) => void;
}

/**
 * Crée et initialise de manière asynchrone un document jsPDF avec incorporation réelle de la police Unicode.
 */
export async function initI18nPdfDoc(options: I18nPdfOptions = {}): Promise<I18nPdfInstance> {
  const normLang = normalizeLanguage(options.language);
  const isRtl = isRtlLanguage(normLang);
  const direction = getTextDirection(normLang);
  const bcp47 = getBcp47Locale(normLang);
  const fontDescriptor = getFontDescriptorForLanguage(normLang);

  const doc = new jsPDF({
    orientation: options.orientation || 'portrait',
    unit: options.unit || 'mm',
    format: options.format || 'a4',
  });

  const effectiveFont = await registerFontInDoc(doc, fontDescriptor);
  doc.setFont(effectiveFont);

  const currency = options.currency || 'FCFA';

  const instance: I18nPdfInstance = {
    doc,
    language: normLang,
    bcp47Locale: bcp47,
    isRtl,
    direction,
    fontDescriptor,
    effectiveFont,
    formatDate: (d, opts) => formatLocalizedDate(d, normLang, opts),
    formatNumber: (n, opts) => formatLocalizedNumber(n, normLang, opts),
    formatMoney: (amt, customCurr) => formatLocalizedCurrency(amt, customCurr || currency, normLang),
    prepareText: (txt) => prepareTextForPdf(txt, normLang),
    writeText: (txt, x, y, opts) => {
      const prepared = prepareTextForPdf(txt, normLang);
      const textOptions = opts || {};
      if (isRtl && !textOptions.align) {
        textOptions.align = 'right';
      }
      doc.text(prepared, x, y, textOptions);
    },
  };

  return instance;
}

/**
 * Crée et initialise un document jsPDF de manière synchrone (avec les polices disponibles en cache).
 */
export function createI18nPdfDoc(options: I18nPdfOptions = {}): I18nPdfInstance {
  const normLang = normalizeLanguage(options.language);
  const isRtl = isRtlLanguage(normLang);
  const direction = getTextDirection(normLang);
  const bcp47 = getBcp47Locale(normLang);
  const fontDescriptor = getFontDescriptorForLanguage(normLang);

  const doc = new jsPDF({
    orientation: options.orientation || 'portrait',
    unit: options.unit || 'mm',
    format: options.format || 'a4',
  });

  const effectiveFont = ensureFontRegistered(doc, fontDescriptor);
  doc.setFont(effectiveFont);

  const currency = options.currency || 'FCFA';

  const instance: I18nPdfInstance = {
    doc,
    language: normLang,
    bcp47Locale: bcp47,
    isRtl,
    direction,
    fontDescriptor,
    effectiveFont,
    formatDate: (d, opts) => formatLocalizedDate(d, normLang, opts),
    formatNumber: (n, opts) => formatLocalizedNumber(n, normLang, opts),
    formatMoney: (amt, customCurr) => formatLocalizedCurrency(amt, customCurr || currency, normLang),
    prepareText: (txt) => prepareTextForPdf(txt, normLang),
    writeText: (txt, x, y, opts) => {
      const prepared = prepareTextForPdf(txt, normLang);
      const textOptions = opts || {};
      if (isRtl && !textOptions.align) {
        textOptions.align = 'right';
      }
      doc.text(prepared, x, y, textOptions);
    },
  };

  return instance;
}

export * from './pdfLocale.ts';
export * from './pdfFonts.ts';
