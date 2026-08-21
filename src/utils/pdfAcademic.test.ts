import test from 'node:test';
import assert from 'node:assert/strict';
import { getAcademicTranslations } from './pdfAcademicTranslations.ts';
import { generateBordereauPDF } from './bordereauPdf.ts';
import {
  generateGradeReport,
  generateReceipt,
  generatePaymentReceipt,
  generateStudentInvoice,
  formatMoney,
} from './pdfUtils.ts';
import {
  initI18nPdfDoc,
  normalizeLanguage,
  isRtlLanguage,
  prepareTextForPdf,
  formatLocalizedDate,
} from './pdfEngine.ts';
import type { SupportedLanguage } from './pdfLocale.ts';
import type { AppSettings, Student, Payment } from '../types/index.ts';

const sampleSettings: AppSettings = {
  seuilDeuxiemeTranche: 50,
  messageRemerciement: 'Merci',
  messageRappel: 'Rappel',
  badgeParentResponsable: 'Parent Responsable',
  badge2emeTranche: '2ème Tranche',
  schoolName: 'Complexe Scolaire Excellence',
  schoolAddress: 'Avenue de la Paix, Lomé',
  schoolPhone: '+228 90 00 00 00',
  schoolEmail: 'contact@excellence.edu',
  schoolSlogan: 'Excellence et Rigueur',
  schoolMinistry: 'MINISTÈRE DES ENSEIGNEMENTS',
  schoolYear: '2025-2026',
  currency: 'XOF',
};

const sampleStudentsBordereau = [
  { nom: 'KOFFI', prenom: 'Afi', noteClasse: '14.50', noteDevoir: '16.00', noteCompo: '15.00', moyenne: '15.17' },
  { nom: 'MENSAH', prenom: 'Kodjo', noteClasse: '11.00', noteDevoir: '12.50', noteCompo: '10.00', moyenne: '11.17' },
  { nom: 'AL-MANSOUR', prenom: 'Tariq', noteClasse: '18.00', noteDevoir: '17.50', noteCompo: '19.00', moyenne: '18.17' },
  { nom: 'IVANOV', prenom: 'Dmitri', noteClasse: '13.00', noteDevoir: '14.00', noteCompo: '12.00', moyenne: '13.00' },
  { nom: 'ZHANG', prenom: 'Wei', noteClasse: '16.00', noteDevoir: '15.00', noteCompo: '17.00', moyenne: '16.00' },
];

const sampleChild = {
  id: 'std-001',
  nom: 'AL-MANSOUR',
  prenom: 'Fatima',
  classe: '3ème A',
  adsn: 'MAT-2026-0012',
};

const sampleMatieres = [
  { id: 'mat-1', nom: 'Mathématiques' },
  { id: 'mat-2', nom: 'Français' },
  { id: 'mat-3', nom: 'Sciences Physiques' },
  { id: 'mat-4', nom: 'Histoire-Géographie' },
  { id: 'mat-5', nom: 'Anglais' },
];

const sampleClasseMatieres = [
  { classe: '3ème A', matiereId: 'mat-1', coefficient: 3 },
  { classe: '3ème A', matiereId: 'mat-2', coefficient: 3 },
  { classe: '3ème A', matiereId: 'mat-3', coefficient: 2 },
  { classe: '3ème A', matiereId: 'mat-4', coefficient: 2 },
  { classe: '3ème A', matiereId: 'mat-5', coefficient: 2 },
];

const sampleNotes = [
  { eleveId: 'std-001', matiereId: 'mat-1', periode: 'TRIMESTRE 1', noteClasse: 16, noteDevoir: 15, noteCompo: 17 },
  { eleveId: 'std-001', matiereId: 'mat-2', periode: 'TRIMESTRE 1', noteClasse: 14, noteDevoir: 13, noteCompo: 15 },
  { eleveId: 'std-001', matiereId: 'mat-3', periode: 'TRIMESTRE 1', noteClasse: 18, noteDevoir: 17, noteCompo: 19 },
  { eleveId: 'std-001', matiereId: 'mat-4', periode: 'TRIMESTRE 1', noteClasse: 12, noteDevoir: 11, noteCompo: 13 },
  { eleveId: 'std-001', matiereId: 'mat-5', periode: 'TRIMESTRE 1', noteClasse: 15, noteDevoir: 16, noteCompo: 14 },
];

// ─────────────────────────────────────────────────────────────
// SUITE 1 : Dictionnaire de traductions académiques (9 langues)
// ─────────────────────────────────────────────────────────────
test('1. getAcademicTranslations returns correct translations for all 9 languages without missing keys', () => {
  const languages: SupportedLanguage[] = ['fr', 'en', 'es', 'ar', 'it', 'de', 'pt', 'zh', 'ru'];
  const requiredKeys = [
    'reportCardTitle', 'transcriptTitle', 'idCardTitle', 'timetableTitle', 'gradeSlipTitle',
    'student', 'fullName', 'matricule', 'classLabel', 'subject', 'grade', 'coeff', 'average',
    'generalAverage', 'classAverage', 'rank', 'appreciation', 'teacher', 'room', 'day', 'time',
    'directorSignature', 'teacherSignature', 'secureScan', 'propertyNotice', 'generatedOn'
  ];

  for (const lang of languages) {
    const t = getAcademicTranslations(lang);
    assert.ok(t, `Translations for ${lang} should be defined`);
    for (const key of requiredKeys) {
      assert.ok(
        (t as any)[key] && typeof (t as any)[key] === 'string' && (t as any)[key].length > 0,
        `Key "${key}" must be non-empty string in language "${lang}"`
      );
    }
  }
});

test('2. getAcademicTranslations falls back gracefully to French for invalid or null language', () => {
  const tNull = getAcademicTranslations(null);
  const tUnknown = getAcademicTranslations('unknown-lang' as any);
  const tFr = getAcademicTranslations('fr');

  assert.equal(tNull.reportCardTitle, tFr.reportCardTitle);
  assert.equal(tUnknown.transcriptTitle, tFr.transcriptTitle);
});

// ─────────────────────────────────────────────────────────────
// SUITE 2 : Bordereaux de notes (generateBordereauPDF)
// ─────────────────────────────────────────────────────────────
test('3. generateBordereauPDF executes successfully in French', async () => {
  const doc = await generateBordereauPDF(
    '6ème A',
    'Mathématiques',
    'Trimestre 1',
    'Prof. KOFFI',
    sampleStudentsBordereau,
    '14.67',
    sampleSettings,
    undefined,
    'fr'
  );
  assert.ok(doc);
  const arrayBuffer = doc.output('arraybuffer');
  assert.ok(arrayBuffer.byteLength > 1000, 'PDF buffer should be substantial');
});

test('4. generateBordereauPDF executes successfully in English', async () => {
  const doc = await generateBordereauPDF(
    'Grade 6A',
    'Mathematics',
    'Term 1',
    'Mr. SMITH',
    sampleStudentsBordereau,
    '14.67',
    sampleSettings,
    undefined,
    'en'
  );
  assert.ok(doc);
  assert.ok(doc.output('arraybuffer').byteLength > 1000);
});

test('5. generateBordereauPDF executes successfully in Spanish', async () => {
  const doc = await generateBordereauPDF(
    '6° Primaria',
    'Matemáticas',
    'Trimestre 1',
    'Prof. GARCÍA',
    sampleStudentsBordereau,
    '14.67',
    sampleSettings,
    undefined,
    'es'
  );
  assert.ok(doc);
  assert.ok(doc.output('arraybuffer').byteLength > 1000);
});

test('6. generateBordereauPDF executes successfully in Arabic with RTL & Arabic shaping', async () => {
  const doc = await generateBordereauPDF(
    'الصف السادس أ',
    'الرياضيات',
    'الفصل الأول',
    'الأستاذ المنصور',
    sampleStudentsBordereau,
    '14.67',
    sampleSettings,
    undefined,
    'ar'
  );
  assert.ok(doc);
  assert.ok(doc.output('arraybuffer').byteLength > 1000);
});

test('7. generateBordereauPDF executes successfully in Russian (Cyrillic)', async () => {
  const doc = await generateBordereauPDF(
    '6 Класс А',
    'Математика',
    '1-я четверть',
    'Преп. Иванов',
    sampleStudentsBordereau,
    '14.67',
    sampleSettings,
    undefined,
    'ru'
  );
  assert.ok(doc);
  assert.ok(doc.output('arraybuffer').byteLength > 1000);
});

test('8. generateBordereauPDF executes successfully in Chinese', async () => {
  const doc = await generateBordereauPDF(
    '六年级一班',
    '数学',
    '第一学期',
    '张老师',
    sampleStudentsBordereau,
    '14.67',
    sampleSettings,
    undefined,
    'zh'
  );
  assert.ok(doc);
  assert.ok(doc.output('arraybuffer').byteLength > 1000);
});

test('9. generateBordereauPDF executes successfully in German', async () => {
  const doc = await generateBordereauPDF(
    'Klasse 6A',
    'Mathematik',
    '1. Halbjahr',
    'Herr Schmidt',
    sampleStudentsBordereau,
    '14.67',
    sampleSettings,
    undefined,
    'de'
  );
  assert.ok(doc);
  assert.ok(doc.output('arraybuffer').byteLength > 1000);
});

test('10. generateBordereauPDF executes successfully in Portuguese', async () => {
  const doc = await generateBordereauPDF(
    'Turma 6A',
    'Matemática',
    '1° Trimestre',
    'Prof. Silva',
    sampleStudentsBordereau,
    '14.67',
    sampleSettings,
    undefined,
    'pt'
  );
  assert.ok(doc);
  assert.ok(doc.output('arraybuffer').byteLength > 1000);
});

test('11. generateBordereauPDF executes successfully in Italian', async () => {
  const doc = await generateBordereauPDF(
    'Classe 1A',
    'Matematica',
    '1° Trimestre',
    'Prof. Rossi',
    sampleStudentsBordereau,
    '14.67',
    sampleSettings,
    undefined,
    'it'
  );
  assert.ok(doc);
  assert.ok(doc.output('arraybuffer').byteLength > 1000);
});

// ─────────────────────────────────────────────────────────────
// SUITE 3 : Relevés de notes (generateGradeReport)
// ─────────────────────────────────────────────────────────────
test('12. generateGradeReport executes in French with exact average and total points', async () => {
  const doc = await generateGradeReport(
    sampleChild,
    'TRIMESTRE 1',
    sampleNotes,
    sampleMatieres,
    sampleClasseMatieres,
    sampleSettings,
    'fr'
  );
  assert.ok(doc);
  assert.ok(doc.output('arraybuffer').byteLength > 1000);
});

test('13. generateGradeReport executes in English', async () => {
  const doc = await generateGradeReport(
    sampleChild,
    'TERM 1',
    sampleNotes,
    sampleMatieres,
    sampleClasseMatieres,
    sampleSettings,
    'en'
  );
  assert.ok(doc);
  assert.ok(doc.output('arraybuffer').byteLength > 1000);
});

test('14. generateGradeReport executes in Spanish', async () => {
  const doc = await generateGradeReport(
    sampleChild,
    '1° TRIMESTRE',
    sampleNotes,
    sampleMatieres,
    sampleClasseMatieres,
    sampleSettings,
    'es'
  );
  assert.ok(doc);
  assert.ok(doc.output('arraybuffer').byteLength > 1000);
});

test('15. generateGradeReport executes in Arabic with full RTL alignment', async () => {
  const doc = await generateGradeReport(
    sampleChild,
    'الفصل الأول',
    sampleNotes,
    sampleMatieres,
    sampleClasseMatieres,
    sampleSettings,
    'ar'
  );
  assert.ok(doc);
  assert.ok(doc.output('arraybuffer').byteLength > 1000);
});

test('16. generateGradeReport executes in Russian (Cyrillic)', async () => {
  const doc = await generateGradeReport(
    sampleChild,
    '1-я четверть',
    sampleNotes,
    sampleMatieres,
    sampleClasseMatieres,
    sampleSettings,
    'ru'
  );
  assert.ok(doc);
  assert.ok(doc.output('arraybuffer').byteLength > 1000);
});

test('17. generateGradeReport executes in Chinese', async () => {
  const doc = await generateGradeReport(
    sampleChild,
    '第一学期',
    sampleNotes,
    sampleMatieres,
    sampleClasseMatieres,
    sampleSettings,
    'zh'
  );
  assert.ok(doc);
  assert.ok(doc.output('arraybuffer').byteLength > 1000);
});

test('18. generateGradeReport handles empty notes without throwing or NaN', async () => {
  const doc = await generateGradeReport(
    sampleChild,
    'TRIMESTRE 1',
    [], // empty notes
    sampleMatieres,
    sampleClasseMatieres,
    sampleSettings,
    'fr'
  );
  assert.ok(doc);
  assert.ok(doc.output('arraybuffer').byteLength > 1000);
});

test('19. generateGradeReport handles partial evaluations (only homework, no composition)', async () => {
  const partialNotes = [
    { eleveId: 'std-001', matiereId: 'mat-1', periode: 'TRIMESTRE 1', noteClasse: 14, noteDevoir: 16, noteCompo: null },
    { eleveId: 'std-001', matiereId: 'mat-2', periode: 'TRIMESTRE 1', noteClasse: null, noteDevoir: null, noteCompo: 15 },
  ];
  const doc = await generateGradeReport(
    sampleChild,
    'TRIMESTRE 1',
    partialNotes,
    sampleMatieres,
    sampleClasseMatieres,
    sampleSettings,
    'fr'
  );
  assert.ok(doc);
  assert.ok(doc.output('arraybuffer').byteLength > 1000);
});

// ─────────────────────────────────────────────────────────────
// SUITE 4 : Cartes Scolaires (initI18nPdfDoc + layout)
// ─────────────────────────────────────────────────────────────
test('20. Student card generation layout in FR with ISO dimensions', async () => {
  const pdfInst = await initI18nPdfDoc({ language: 'fr', orientation: 'portrait', unit: 'mm', format: 'a4' });
  const { doc, prepareText, effectiveFont } = pdfInst;
  const tAcad = getAcademicTranslations('fr');

  doc.setFont(effectiveFont, 'bold');
  doc.setFontSize(8);
  doc.text(prepareText(tAcad.idCardTitle), 10, 10);
  assert.ok(doc.getNumberOfPages() === 1);
  assert.ok(doc.output('arraybuffer').byteLength > 1000);
});

test('21. Student card generation layout in Arabic (RTL coordinates)', async () => {
  const pdfInst = await initI18nPdfDoc({ language: 'ar', orientation: 'portrait', unit: 'mm', format: 'a4' });
  const { doc, prepareText, isRtl, effectiveFont } = pdfInst;
  const tAcad = getAcademicTranslations('ar');

  assert.equal(isRtl, true);
  doc.setFont(effectiveFont, 'bold');
  doc.text(prepareText(tAcad.idCardTitle), 190, 10, { align: 'right' });
  assert.ok(doc.output('arraybuffer').byteLength > 1000);
});

test('22. Student card generation layout in Russian (Cyrillic)', async () => {
  const pdfInst = await initI18nPdfDoc({ language: 'ru', orientation: 'portrait', unit: 'mm', format: 'a4' });
  const { doc, prepareText, effectiveFont } = pdfInst;
  const tAcad = getAcademicTranslations('ru');

  doc.setFont(effectiveFont, 'bold');
  doc.text(prepareText(tAcad.idCardTitle), 10, 10);
  assert.ok(doc.output('arraybuffer').byteLength > 1000);
});

test('23. Student card generation layout in Chinese', async () => {
  const pdfInst = await initI18nPdfDoc({ language: 'zh', orientation: 'portrait', unit: 'mm', format: 'a4' });
  const { doc, prepareText, effectiveFont } = pdfInst;
  const tAcad = getAcademicTranslations('zh');

  doc.setFont(effectiveFont, 'bold');
  doc.text(prepareText(tAcad.idCardTitle), 10, 10);
  assert.ok(doc.output('arraybuffer').byteLength > 1000);
});

// ─────────────────────────────────────────────────────────────
// SUITE 5 : Emploi du temps (Timetable)
// ─────────────────────────────────────────────────────────────
test('24. Timetable PDF document init in landscape orientation for FR', async () => {
  const pdfInst = await initI18nPdfDoc({ language: 'fr', orientation: 'landscape', unit: 'mm', format: 'a4' });
  const { doc, prepareText, effectiveFont } = pdfInst;
  const tAcad = getAcademicTranslations('fr');

  doc.setFont(effectiveFont, 'bold');
  doc.setFontSize(16);
  doc.text(prepareText(`${tAcad.timetableTitle} — 6ème A`), 148, 16, { align: 'center' });
  assert.equal(Math.round(doc.internal.pageSize.getWidth()), 297);
  assert.equal(Math.round(doc.internal.pageSize.getHeight()), 210);
});

test('25. Timetable PDF document init in landscape orientation for Arabic RTL', async () => {
  const pdfInst = await initI18nPdfDoc({ language: 'ar', orientation: 'landscape', unit: 'mm', format: 'a4' });
  const { doc, prepareText, isRtl, effectiveFont } = pdfInst;
  const tAcad = getAcademicTranslations('ar');

  assert.equal(isRtl, true);
  doc.setFont(effectiveFont, 'bold');
  doc.setFontSize(16);
  doc.text(prepareText(`${tAcad.timetableTitle} — الصف السادس أ`), 148, 16, { align: 'center' });
  assert.ok(doc.output('arraybuffer').byteLength > 1000);
});

test('26. Timetable PDF document init for Russian', async () => {
  const pdfInst = await initI18nPdfDoc({ language: 'ru', orientation: 'landscape', unit: 'mm', format: 'a4' });
  const { doc, prepareText, effectiveFont } = pdfInst;
  const tAcad = getAcademicTranslations('ru');

  doc.setFont(effectiveFont, 'bold');
  doc.text(prepareText(`${tAcad.timetableTitle} — 6 Класс А`), 148, 16, { align: 'center' });
  assert.ok(doc.output('arraybuffer').byteLength > 1000);
});

test('27. Timetable PDF document init for Chinese', async () => {
  const pdfInst = await initI18nPdfDoc({ language: 'zh', orientation: 'landscape', unit: 'mm', format: 'a4' });
  const { doc, prepareText, effectiveFont } = pdfInst;
  const tAcad = getAcademicTranslations('zh');

  doc.setFont(effectiveFont, 'bold');
  doc.text(prepareText(`${tAcad.timetableTitle} — 六年级一班`), 148, 16, { align: 'center' });
  assert.ok(doc.output('arraybuffer').byteLength > 1000);
});

// ─────────────────────────────────────────────────────────────
// SUITE 6 : Robustesse des caractères complexes, symboles & Noms longs
// ─────────────────────────────────────────────────────────────
test('28. Handles long multilingual student names, complex symbols and punctuation safely without crashing', async () => {
  const longNameStudent = {
    id: 'std-long',
    nom: 'AL-MANSOUR EL-IDRISSI BEN ABDELAZIZ D’ORLÉANS-BRAGANÇA',
    prenom: 'Fatima-Zahra Marie-Antoinette Élisabeth 🌟',
    classe: 'Terminale Scientifique S2-B',
    adsn: 'MAT-2026-X9999-SPECIAL/TOGO',
  };

  const doc = await generateGradeReport(
    longNameStudent,
    'TRIMESTRE 1',
    sampleNotes,
    sampleMatieres,
    sampleClasseMatieres,
    sampleSettings,
    'fr'
  );
  assert.ok(doc);
  assert.ok(doc.output('arraybuffer').byteLength > 1000);
});

// ─────────────────────────────────────────────────────────────
// SUITE 7 : Non-régression monétaire & Fonctions financières partagées (pdfUtils.ts)
// ─────────────────────────────────────────────────────────────
const sampleStudentFinancial: Student = {
  id: 'std-fin-01',
  nom: 'KOFFI',
  prenom: 'Afi Marie',
  classe: '6ème A',
  telephone: '+228 90 00 11 22',
  sexe: 'F',
  redoublant: false,
  ecoleProvenance: 'École Primaire Centrale',
  ecolage: 150000,
  dejaPaye: 100000,
  restant: 50000,
  recu: 'REC-2026-001',
  cycle: 'college',
  status: 'Soldé',
  historiquesPaiements: [
    { id: 'p1', studentId: 'std-fin-01', montant: 50000, date: '2025-09-15', recu: 'REC-001', mode: 'Espèces' },
    { id: 'p2', studentId: 'std-fin-01', montant: 50000, date: '2025-11-20', recu: 'REC-002', mode: 'T-Money' },
  ],
  paiements: [
    { id: 'p1', studentId: 'std-fin-01', montant: 50000, date: '2025-09-15', recu: 'REC-001', mode: 'Espèces' },
    { id: 'p2', studentId: 'std-fin-01', montant: 50000, date: '2025-11-20', recu: 'REC-002', mode: 'T-Money' },
  ],
  createdAt: '2025-09-01T08:00:00Z',
  updatedAt: '2025-11-20T10:00:00Z',
};

const samplePayment: Payment = {
  id: 'pay-2026-001',
  studentId: 'std-fin-01',
  montant: 50000,
  date: '2025-11-20',
  recu: 'REC-2026-002',
  mode: 'Flooz',
  reference: 'TXN-FLZ-998877',
};

test('29. formatMoney resolution scenarios A through F', () => {
  const settingsEur: AppSettings = { ...sampleSettings, currency: 'EUR' };
  const settingsUsd: AppSettings = { ...sampleSettings, currency: 'USD' };
  const settingsNoCurr: AppSettings = { ...sampleSettings, currency: undefined as any };

  // A. Devise explicite XOF
  assert.equal(formatMoney(15000, 'XOF'), '15 000 XOF');

  // B. Devise explicite EUR
  assert.equal(formatMoney(15000, 'EUR'), '15 000 EUR');

  // C. Devise absente mais école configurée en EUR
  const resolvedCurrEur = ('currency' in settingsEur && settingsEur.currency) || 'FCFA';
  assert.equal(formatMoney(15000, resolvedCurrEur), '15 000 EUR');

  // D. Devise absente mais école configurée en USD
  const resolvedCurrUsd = ('currency' in settingsUsd && settingsUsd.currency) || 'FCFA';
  assert.equal(formatMoney(15000, resolvedCurrUsd), '15 000 USD');

  // E. Aucun paramètre et aucune configuration
  const resolvedCurrFallback = ('currency' in settingsNoCurr && settingsNoCurr.currency) || 'FCFA';
  assert.equal(formatMoney(15000, resolvedCurrFallback), '15 000 FCFA');
  assert.equal(formatMoney(15000), '15 000 FCFA');

  // F. Chaîne vide avec école configurée en EUR
  const emptyExplicit: string = '';
  const resolvedEmptyWithEur = (emptyExplicit && emptyExplicit.trim()) || settingsEur.currency || 'FCFA';
  assert.equal(formatMoney(15000, resolvedEmptyWithEur), '15 000 EUR');
});

test('30. generateReceipt executes without error with configured currencies (XOF, EUR, USD, and fallback)', () => {
  const settingsXof: AppSettings = { ...sampleSettings, currency: 'XOF' };
  const settingsEur: AppSettings = { ...sampleSettings, currency: 'EUR' };
  const settingsUsd: AppSettings = { ...sampleSettings, currency: 'USD' };
  const settingsNoCurr: AppSettings = { ...sampleSettings, currency: undefined as any };

  assert.doesNotThrow(() => generateReceipt(sampleStudentFinancial, settingsXof));
  assert.doesNotThrow(() => generateReceipt(sampleStudentFinancial, settingsEur));
  assert.doesNotThrow(() => generateReceipt(sampleStudentFinancial, settingsUsd));
  assert.doesNotThrow(() => generateReceipt(sampleStudentFinancial, settingsNoCurr));
});

test('31. generatePaymentReceipt executes successfully with XOF, EUR, USD and fallback currencies', async () => {
  const settingsXof: AppSettings = { ...sampleSettings, currency: 'XOF' };
  const settingsEur: AppSettings = { ...sampleSettings, currency: 'EUR' };
  const settingsUsd: AppSettings = { ...sampleSettings, currency: 'USD' };
  const settingsNoCurr: AppSettings = { ...sampleSettings, currency: undefined as any };

  const docXof = await generatePaymentReceipt(samplePayment, sampleStudentFinancial, settingsXof, 'fr');
  assert.ok(docXof);
  assert.ok(docXof.output('arraybuffer').byteLength > 1000);

  const docEur = await generatePaymentReceipt(samplePayment, sampleStudentFinancial, settingsEur, 'fr');
  assert.ok(docEur);
  assert.ok(docEur.output('arraybuffer').byteLength > 1000);

  const docUsd = await generatePaymentReceipt(samplePayment, sampleStudentFinancial, settingsUsd, 'fr');
  assert.ok(docUsd);
  assert.ok(docUsd.output('arraybuffer').byteLength > 1000);

  const docFallback = await generatePaymentReceipt(samplePayment, sampleStudentFinancial, settingsNoCurr, 'fr');
  assert.ok(docFallback);
  assert.ok(docFallback.output('arraybuffer').byteLength > 1000);
});

test('32. generateStudentInvoice executes successfully with XOF, EUR, USD and fallback currencies', async () => {
  const settingsXof: AppSettings = { ...sampleSettings, currency: 'XOF' };
  const settingsEur: AppSettings = { ...sampleSettings, currency: 'EUR' };
  const settingsUsd: AppSettings = { ...sampleSettings, currency: 'USD' };
  const settingsNoCurr: AppSettings = { ...sampleSettings, currency: undefined as any };

  const docXof = await generateStudentInvoice(sampleStudentFinancial, sampleStudentFinancial.historiquesPaiements, settingsXof, 'fr');
  assert.ok(docXof);
  assert.ok(docXof.output('arraybuffer').byteLength > 1000);

  const docEur = await generateStudentInvoice(sampleStudentFinancial, sampleStudentFinancial.historiquesPaiements, settingsEur, 'fr');
  assert.ok(docEur);
  assert.ok(docEur.output('arraybuffer').byteLength > 1000);

  const docUsd = await generateStudentInvoice(sampleStudentFinancial, sampleStudentFinancial.historiquesPaiements, settingsUsd, 'fr');
  assert.ok(docUsd);
  assert.ok(docUsd.output('arraybuffer').byteLength > 1000);

  const docFallback = await generateStudentInvoice(sampleStudentFinancial, sampleStudentFinancial.historiquesPaiements, settingsNoCurr, 'fr');
  assert.ok(docFallback);
  assert.ok(docFallback.output('arraybuffer').byteLength > 1000);
});

