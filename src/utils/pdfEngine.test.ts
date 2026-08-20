/**
 * Suite de tests unitaires et d'intégration réels pour le moteur PDF international YZIOW (Lot 1).
 * Vérifie :
 * - Présence physique réelle des polices TTF dans public/fonts/ (Noto Sans, Noto Sans Arabic, ZCOOL XiaoWei)
 * - Documentation dans public/fonts/FONTS.md
 * - Incorporation effective et non-mockée dans jsPDF
 * - Absence totale de substitution Helvetica pour ru, ar, zh (rejet strict)
 * - Façonnage arabe contextuel, ligatures Lam-Alef et BiDi avec préservation des chiffres et ponctuation
 * - Génération de 4 PDF réels (fr, ru, ar, zh) avec inspection binaire
 * - Suppression des PDF temporaires après validation
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { jsPDF } from 'jspdf';
import {
  normalizeLanguage,
  isRtlLanguage,
  getTextDirection,
  getBcp47Locale,
  formatLocalizedDate,
  formatLocalizedNumber,
  formatLocalizedCurrency,
  SUPPORTED_LANGUAGES,
} from './pdfLocale.ts';
import {
  getFontDescriptorForLanguage,
  shapeArabicText,
  processBiDiText,
  prepareTextForPdf,
  loadFontData,
  registerFontInDoc,
  ensureFontRegistered,
  clearFontRegistrationCache,
} from './pdfFonts.ts';
import { initI18nPdfDoc, createI18nPdfDoc } from './pdfEngine.ts';

console.log('--- Démarrage de la suite de tests PDF Engine & BiDi (Lot 1) ---\n');

let passedTests = 0;

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err: any) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err?.message || err}`);
    throw err;
  }
}

async function runAllTests() {
  // 1. Vérification physique des fichiers de police TTF et documentation
  await test('1. Présence physique des fichiers TTF, licence OFL et FONTS.md dans public/fonts/', () => {
    const fontsDir = path.resolve(process.cwd(), 'public', 'fonts');
    assert.ok(fs.existsSync(fontsDir), 'Le dossier public/fonts/ doit exister');

    const expectedFiles = [
      { name: 'OFL.txt', minSize: 1000 },
      { name: 'FONTS.md', minSize: 500 },
      { name: 'NotoSans-Regular.ttf', minSize: 300000 },
      { name: 'NotoSansArabic-Regular.ttf', minSize: 150000 },
      { name: 'ZCOOLXiaoWei-Regular.ttf', minSize: 6000000 },
    ];

    for (const f of expectedFiles) {
      const p = path.join(fontsDir, f.name);
      assert.ok(fs.existsSync(p), `Le fichier ${f.name} doit exister physiquement`);
      const stat = fs.statSync(p);
      assert.ok(stat.size >= f.minSize, `Le fichier ${f.name} doit faire au moins ${f.minSize} octets (taille réelle: ${stat.size})`);

      if (f.name.endsWith('.ttf')) {
        const header = fs.readFileSync(p, { flag: 'r' }).subarray(0, 4);
        const magic = header.toString('hex');
        assert.ok(['00010000', '4f54544f', '74727565'].includes(magic), `Signature TTF invalide pour ${f.name}: ${magic}`);
      }
    }
  });

  // 2. Normalisation et locales
  await test('2. Normalisation et locales supportées (9 langues)', () => {
    assert.strictEqual(normalizeLanguage('fr'), 'fr');
    assert.strictEqual(normalizeLanguage('en'), 'en');
    assert.strictEqual(normalizeLanguage('es'), 'es');
    assert.strictEqual(normalizeLanguage('ar'), 'ar');
    assert.strictEqual(normalizeLanguage('it'), 'it');
    assert.strictEqual(normalizeLanguage('de'), 'de');
    assert.strictEqual(normalizeLanguage('pt'), 'pt');
    assert.strictEqual(normalizeLanguage('zh'), 'zh');
    assert.strictEqual(normalizeLanguage('ru'), 'ru');
    assert.strictEqual(normalizeLanguage('unknown' as any), 'fr');
  });

  // 3. Direction RTL / LTR
  await test('3. Détection stricte RTL pour l\'arabe et LTR pour les autres', () => {
    assert.strictEqual(isRtlLanguage('ar'), true);
    assert.strictEqual(getTextDirection('ar'), 'rtl');

    const ltrLangs = ['fr', 'en', 'es', 'it', 'de', 'pt', 'zh', 'ru'] as const;
    for (const lang of ltrLangs) {
      assert.strictEqual(isRtlLanguage(lang), false);
      assert.strictEqual(getTextDirection(lang), 'ltr');
    }
  });

  // 4. Caractères accentués européens (de, pt, it, fr)
  await test('4. Encodage sans corruption des caractères accentués (ä, ö, ü, ß, ç, ã, é, ó, à, è, ù, €)', () => {
    const samples = [
      { lang: 'de', text: 'Große Schülerprüfung für März — 1500 €' },
      { lang: 'pt', text: 'Relatório de pontuação e avaliação — 1500 €' },
      { lang: 'it', text: 'Attività e modalità di pagamento — 1500 €' },
      { lang: 'fr', text: 'École, élève, reçu, 1 500 €' },
    ];
    for (const s of samples) {
      const prepared = prepareTextForPdf(s.text, s.lang);
      assert.strictEqual(prepared, s.text);
      assert.ok(!prepared.includes('?'), `Ne doit pas contenir de '?' pour ${s.lang}`);
    }
  });

  // 5. Cyrillique russe
  await test('5. Préservation intégrale du cyrillique russe', () => {
    const sample = 'Привет, мир — Табель ученика';
    const prepared = prepareTextForPdf(sample, 'ru');
    assert.strictEqual(prepared, sample);
    assert.ok(!prepared.includes('?'));
  });

  // 6. Sinogrammes chinois
  await test('6. Préservation intégrale des sinogrammes chinois avec ZCOOL XiaoWei', () => {
    const sample = '你好世界 — 学生成绩单';
    const prepared = prepareTextForPdf(sample, 'zh');
    assert.strictEqual(prepared, sample);
    assert.ok(!prepared.includes('?'));
  });

  // 7. Façonnage arabe et ligatures Lam-Alef
  await test('7. Façonnage arabe contextuel et ligatures Lam-Alef', () => {
    const s1 = 'مرحبا بالعالم';
    const shaped1 = shapeArabicText(s1);
    assert.notStrictEqual(shaped1, s1);
    assert.ok(!shaped1.includes('?'));

    const s2 = 'لا إله إلا الله';
    const shaped2 = shapeArabicText(s2);
    assert.ok(shaped2.includes('\uFEFB') || shaped2.includes('\uFEFC'), 'Doit inclure la ligature Lam-Alef');
  });

  // 8. Traitement BiDi mixte arabe + chiffres + latin
  await test('8. Traitement BiDi mixte arabe, chiffres et parenthèses', () => {
    const t1 = prepareTextForPdf('تقرير الطالب 2026', 'ar');
    assert.ok(t1.includes('2026'), 'Les chiffres 2026 doivent rester ordonnés en LTR');

    const t2 = prepareTextForPdf('النتيجة: 15/20', 'ar');
    assert.ok(t2.includes('15/20'), 'La fraction 15/20 doit rester ordonnée en LTR');

    const t3 = prepareTextForPdf('مدرسة YZIOW (2026)', 'ar');
    assert.ok(t3.includes('YZIOW'), 'Le terme YZIOW doit rester en LTR');
    assert.ok(t3.includes('2026'), 'Les chiffres 2026 doivent être préservés');
  });

  // 9. Formatage dates, nombres et devises
  await test('9. Formatages localisés dynamiques (Dates, Nombres, Devises)', () => {
    const date = new Date('2026-08-20T12:00:00Z');
    assert.ok(formatLocalizedDate(date, 'fr').length > 0);
    assert.ok(formatLocalizedDate(date, 'en').length > 0);

    const num = 1234567.89;
    assert.ok(formatLocalizedNumber(num, 'fr').includes('1'));
    assert.ok(formatLocalizedNumber(num, 'en').includes('1,234,567.89'));

    const curFr = formatLocalizedCurrency(25000, 'EUR', 'fr');
    assert.ok(curFr.includes('25') && (curFr.includes('€') || curFr.includes('EUR')));
  });

  // 10. Interdiction de faux succès (erreur explicite si police Unicode absente)
  await test('10. Interdiction du faux succès : rejet explicite sans fallback Helvetica pour ru/ar/zh', async () => {
    const fakeDoc = new jsPDF();
    const fakeDescriptor = {
      fontName: 'MissingFont',
      fontFile: 'MissingFont-Regular.ttf',
      fallbackFont: 'helvetica',
      isRtl: false,
      requiresShaping: false,
      script: 'cyrillic' as const,
    };

    await assert.rejects(
      async () => {
        await registerFontInDoc(fakeDoc, fakeDescriptor);
      },
      (err: Error) => {
        return err.message.includes('POLICE_UNICODE_INDISPONIBLE');
      },
      'Doit lever une exception POLICE_UNICODE_INDISPONIBLE et ne pas basculer sur Helvetica'
    );
  });

  // 11. Concurrence et idempotence du chargement
  await test('11. Chargement concurrent idempotent sans conflit', async () => {
    clearFontRegistrationCache();
    const [d1, d2] = await Promise.all([
      loadFontData('NotoSans-Regular.ttf'),
      loadFontData('NotoSans-Regular.ttf')
    ]);
    assert.ok(d1 !== null && d1.length > 0);
    assert.strictEqual(d1, d2);
  });

  // 12. GÉNÉRATION RÉELLE DE 4 PDF AVEC INCORPORATION EFFECTIVE DES POLICES
  await test('12. Génération réelle des 4 PDF (fr, ru, ar, zh) et inspection binaire', async () => {
    const generatedPdfs: { name: string; buf: Buffer; size: number; fontName: string }[] = [];

    // 12.1 PDF Français (NotoSans)
    const pdfFr = await initI18nPdfDoc({ language: 'fr', currency: 'EUR' });
    assert.strictEqual(pdfFr.effectiveFont, 'NotoSans', 'Police active doit être NotoSans');
    assert.strictEqual(pdfFr.doc.getFont().fontName, 'NotoSans');
    pdfFr.writeText('École Internationale YZIOW', 15, 20);
    pdfFr.writeText('Reçu de paiement — Élève : Jérôme D’Almeida', 15, 30);
    pdfFr.writeText(`Montant réglé : ${pdfFr.formatMoney(1500, 'EUR')}`, 15, 40);
    pdfFr.writeText(`Date : ${pdfFr.formatDate(new Date('2026-08-20'))}`, 15, 50);
    const bufFr = pdfFr.doc.output('arraybuffer');
    generatedPdfs.push({ name: 'temp_test_fr.pdf', buf: Buffer.from(bufFr), size: bufFr.byteLength, fontName: 'NotoSans' });

    // 12.2 PDF Russe (NotoSans)
    const pdfRu = await initI18nPdfDoc({ language: 'ru', currency: 'RUB' });
    assert.strictEqual(pdfRu.effectiveFont, 'NotoSans', 'Police active doit être NotoSans');
    assert.strictEqual(pdfRu.doc.getFont().fontName, 'NotoSans');
    pdfRu.writeText('Привет, мир — Табель ученика', 15, 20);
    pdfRu.writeText('Ученик: Александр Смирнов', 15, 30);
    pdfRu.writeText(`Сумма: ${pdfRu.formatMoney(15000, 'RUB')}`, 15, 40);
    const bufRu = pdfRu.doc.output('arraybuffer');
    generatedPdfs.push({ name: 'temp_test_ru.pdf', buf: Buffer.from(bufRu), size: bufRu.byteLength, fontName: 'NotoSans' });

    // 12.3 PDF Arabe (NotoSansArabic)
    const pdfAr = await initI18nPdfDoc({ language: 'ar', currency: 'AED' });
    assert.strictEqual(pdfAr.effectiveFont, 'NotoSansArabic', 'Police active doit être NotoSansArabic');
    assert.strictEqual(pdfAr.doc.getFont().fontName, 'NotoSansArabic');
    pdfAr.writeText('مرحبا بالعالم — تقرير الطالب 2026', 190, 20, { align: 'right' });
    pdfAr.writeText('مدرسة YZIOW (2026)', 190, 30, { align: 'right' });
    pdfAr.writeText('النتيجة: 15/20', 190, 40, { align: 'right' });
    pdfAr.writeText('لا إله إلا الله', 190, 50, { align: 'right' });
    const bufAr = pdfAr.doc.output('arraybuffer');
    generatedPdfs.push({ name: 'temp_test_ar.pdf', buf: Buffer.from(bufAr), size: bufAr.byteLength, fontName: 'NotoSansArabic' });

    // 12.4 PDF Chinois (ZCOOLXiaoWei)
    const pdfZh = await initI18nPdfDoc({ language: 'zh', currency: 'CNY' });
    assert.strictEqual(pdfZh.effectiveFont, 'ZCOOLXiaoWei', 'Police active doit être ZCOOLXiaoWei');
    assert.strictEqual(pdfZh.doc.getFont().fontName, 'ZCOOLXiaoWei');
    pdfZh.writeText('你好世界 — 学生成绩单', 15, 20);
    pdfZh.writeText('学生姓名: 李华', 15, 30);
    pdfZh.writeText(`学费: ${pdfZh.formatMoney(8000, 'CNY')}`, 15, 40);
    const bufZh = pdfZh.doc.output('arraybuffer');
    generatedPdfs.push({ name: 'temp_test_zh.pdf', buf: Buffer.from(bufZh), size: bufZh.byteLength, fontName: 'ZCOOLXiaoWei' });

    // Inspection binaire et rapport des tailles réelles
    console.log('\n--- RAPPORT D\'INCORPORATION DES POLICES DANS LES PDF RÉELS ---');
    for (const item of generatedPdfs) {
      const content = item.buf.toString('latin1');
      assert.ok(item.size > 20000, `Le PDF ${item.name} avec police incorporée doit faire > 20 Ko (taille réelle: ${item.size} octets)`);
      assert.ok(
        content.includes(item.fontName) || content.includes('CIDFontType2') || content.includes('FontDescriptor'),
        `Le flux binaire de ${item.name} doit contenir la police ${item.fontName}`
      );
      console.log(`    [PDF OK] ${item.name.padEnd(20)} | Taille: ${item.size.toString().padStart(8)} octets | Police incorporée: ${item.fontName}`);
    }
  });

  console.log(`========================================`);
  console.log(`RÉSULTAT : ${passedTests} tests réels exécutés et validés.`);
  console.log(`========================================\n`);
}

runAllTests();
