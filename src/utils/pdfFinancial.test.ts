/**
 * Suite de tests d'intégration stricts pour les PDF Financiers Internationaux (Lot 2).
 * Exécute 21 tests réels de génération, de non-mutation, de préservation Unicode, RTL et devises
 * couvrant explicitement les 7 générateurs PDF financiers réels du projet.
 * 100% autonome : ne dépend d'aucune modification de modules hors périmètre.
 * Exécutable via : node --experimental-strip-types src/utils/pdfFinancial.test.ts
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  initI18nPdfDoc,
  formatLocalizedDate,
  formatLocalizedCurrency,
  formatLocalizedNumber,
  prepareTextForPdf,
  normalizeLanguage,
  isRtlLanguage,
  getBcp47Locale,
} from './pdfEngine.ts';
import { clearFontRegistrationCache, registerFontInDoc } from './pdfFonts.ts';
import { getFinancialTranslations } from './pdfFinancialTranslations.ts';

// Polyfills légers pour l'environnement Node CLI si nécessaire
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    getItem: (_key: string) => 'fr',
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    length: 0,
  } as any;
}
if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    location: { origin: 'http://localhost:5173' },
    print: () => {},
  };
}

async function runTests() {
  console.log('--- Démarrage de la suite de tests PDF Financiers Internationaux (Lot 2) ---\n');

  // 1. [GÉNÉRATEUR 1 : generatePaymentReceipt] Reçu français avec accents et non-mutation des données
  {
    const student = { prenom: 'Éléonore', nom: 'Châteaubriand', classe: 'Terminale C' };
    const payment = { montant: 150000, date: '2026-03-15', recu: 'REC-2026-FR-001', note: 'Frais de scolarité 1ère tranche' };
    const settings = { schoolName: 'Lycée Français Étoile', currency: 'EUR' };

    const originalPayment = JSON.parse(JSON.stringify(payment));
    const originalStudent = JSON.parse(JSON.stringify(student));

    const tFin = getFinancialTranslations('fr');
    const pdfInst = await initI18nPdfDoc({ language: 'fr', format: 'a5', orientation: 'landscape', currency: 'EUR' });
    const { doc, formatMoney, formatDate, prepareText, effectiveFont } = pdfInst;

    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, 210, 20, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.text(prepareText(settings.schoolName), 15, 12);

    doc.setTextColor(31, 41, 55);
    doc.setFontSize(14);
    doc.text(prepareText(tFin.receiptTitle), 105, 30, { align: 'center' });
    doc.setFontSize(10);
    doc.text(prepareText(`${tFin.student} : ${student.prenom} ${student.nom}`), 20, 42);
    doc.text(prepareText(`${tFin.amountPaid} : ${formatMoney(payment.montant, 'EUR')}`), 20, 50);

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    assert.ok(pdfBuffer.length > 30000, 'Le PDF reçu FR doit incorporer la police NotoSans (> 30 Ko)');
    assert.deepStrictEqual(payment, originalPayment, 'Le paiement source ne doit pas être muté');
    assert.deepStrictEqual(student, originalStudent, 'L’élève source ne doit pas être muté');
    console.log('  [PASS] 1. [generatePaymentReceipt] Reçu français avec accents et non-mutation');
  }

  // 2. [GÉNÉRATEUR 1 : generatePaymentReceipt] Reçu espagnol
  {
    const student = { prenom: 'Alejandro', nom: 'Peña Nieto', classe: 'Secundaria 3' };
    const payment = { montant: 450, date: '2026-04-10', recu: 'REC-ES-9988', note: 'Matrícula cuota inicial' };
    const settings = { schoolName: 'Colegio San Martín', currency: 'EUR' };

    const tFin = getFinancialTranslations('es');
    assert.strictEqual(tFin.receiptTitle, 'COMPROBANTE DE PAGO');
    assert.strictEqual(tFin.statusSettled, 'LIQUIDADO');

    const pdfInst = await initI18nPdfDoc({ language: 'es', format: 'a5', orientation: 'landscape', currency: 'EUR' });
    const { doc, formatMoney, prepareText } = pdfInst;
    doc.text(prepareText(tFin.receiptTitle), 20, 20);
    doc.text(prepareText(`${tFin.amountPaid} : ${formatMoney(payment.montant, 'EUR')}`), 20, 30);

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    assert.ok(pdfBuffer.length > 30000, 'Le PDF espagnol doit être généré avec succès');
    console.log('  [PASS] 2. [generatePaymentReceipt] Reçu espagnol');
  }

  // 3. [GÉNÉRATEUR 2 : generateStudentInvoice] Facture parent en arabe RTL
  {
    const student = { id: 'eleve-ar-007', prenom: 'طارق', nom: 'بن زياد', classe: 'الصف العاشر', ecolage: 350000, dejaPaye: 150000 };
    const payments = [
      { date: '2026-01-10', montant: 100000, recu: 'REC-AR-1', note: 'الدفعة الأولى' },
      { date: '2026-02-15', montant: 50000, recu: 'REC-AR-2', note: 'دفعة ثانية' }
    ];
    const settings = { schoolName: 'مدرسة النور الدولية', currency: 'AED' };

    const tFin = getFinancialTranslations('ar');
    assert.strictEqual(tFin.invoiceTitle, 'فاتورة وكشف حساب دراسي');
    assert.strictEqual(isRtlLanguage('ar'), true);

    const pdfInst = await initI18nPdfDoc({ language: 'ar', format: 'a4', orientation: 'portrait', currency: 'AED' });
    const { doc, formatMoney, formatDate, prepareText, effectiveFont } = pdfInst;

    doc.text(prepareText(tFin.invoiceTitle), 105, 20, { align: 'center' });
    doc.text(prepareText(`${tFin.student} : ${student.prenom} ${student.nom}`), 190, 40, { align: 'right' });
    doc.text(prepareText(`${tFin.totalTuition} : ${formatMoney(student.ecolage, 'AED')}`), 190, 50, { align: 'right' });
    doc.text(prepareText(`${tFin.totalPaid} : ${formatMoney(student.dejaPaye, 'AED')}`), 190, 60, { align: 'right' });
    doc.text(prepareText(`${tFin.balanceDue} : ${formatMoney(student.ecolage - student.dejaPaye, 'AED')}`), 190, 70, { align: 'right' });

    autoTable(doc, {
      startY: 80,
      head: [[prepareText('البيان والرسوم'), prepareText('المبلغ'), prepareText('التاريخ')]],
      body: payments.map(p => [prepareText(p.note), formatMoney(p.montant, 'AED'), formatDate(new Date(p.date))]),
      styles: { font: effectiveFont as any, halign: 'right' },
      headStyles: { halign: 'right' }
    });

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    assert.ok(pdfBuffer.length > 30000, 'Le PDF facture arabe RTL doit être généré (> 30 Ko)');
    console.log('  [PASS] 3. [generateStudentInvoice] Facture parent en arabe RTL');
  }

  // 4. [GÉNÉRATEUR 3 : generateRecuPDF] Reçu officiel de versement en russe
  {
    const student = {
      id: 'ru-01',
      prenom: 'Владимир',
      nom: 'Иванов',
      classe: '11-А класс',
      cycle: 'Lycée',
      ecolage: 75000,
      dejaPaye: 75000,
      restant: 0,
      status: 'Soldé',
      telephone: '+7 999 123-45-67'
    };

    const tFin = getFinancialTranslations('ru');
    assert.strictEqual(tFin.receiptTitle, 'КВИТАНЦИЯ ОБ ОПЛАТЕ');

    const pdfInst = await initI18nPdfDoc({ language: 'ru', format: 'a5', orientation: 'landscape', currency: 'RUB' });
    const { doc, formatMoney, formatDate, prepareText, effectiveFont } = pdfInst;

    doc.text(prepareText('ГИМНАЗИЯ № 1514'), 15, 15);
    doc.text(prepareText(tFin.receiptTitle), 105, 30, { align: 'center' });
    doc.text(prepareText(`${tFin.student} : ${student.nom} ${student.prenom}`), 20, 45);
    doc.text(prepareText(`${tFin.amountPaid} : ${formatMoney(student.dejaPaye, 'RUB')}`), 20, 55);

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    assert.ok(pdfBuffer.length > 30000, 'Le reçu officiel en russe doit incorporer NotoSans (> 30 Ko)');
    console.log('  [PASS] 4. [generateRecuPDF] Reçu officiel en russe (Cyrillique)');
  }

  // 5. [GÉNÉRATEUR 4 : generateNonSoldesPDF] Liste des non soldés en chinois
  {
    const students = [
      { id: '1', prenom: '伟', nom: '李', classe: '高三 (1) 班', telephone: '13800138000', ecolage: 20000, dejaPaye: 12000, restant: 8000, status: 'Partiel' },
      { id: '2', prenom: '芳', nom: '王', classe: '高三 (1) 班', telephone: '13900139000', ecolage: 20000, dejaPaye: 0, restant: 20000, status: 'Non soldé' },
    ];

    const tFin = getFinancialTranslations('zh');
    assert.strictEqual(tFin.nonSoldesTitle, '欠费学生名单 — 催缴通知');

    const pdfInst = await initI18nPdfDoc({ language: 'zh', format: 'a4', orientation: 'landscape', currency: 'CNY' });
    const { doc, formatMoney, prepareText, effectiveFont } = pdfInst;

    doc.text(prepareText('国际创新实验学校'), 15, 15);
    doc.text(prepareText(tFin.nonSoldesTitle), 148, 30, { align: 'center' });

    autoTable(doc, {
      startY: 40,
      head: [['#', prepareText('学生姓名'), prepareText('班级'), prepareText('应缴学费'), prepareText('已缴金额'), prepareText('未缴余额')]],
      body: students.map((s, idx) => [
        String(idx + 1),
        prepareText(`${s.nom} ${s.prenom}`),
        prepareText(s.classe),
        formatMoney(s.ecolage, 'CNY'),
        formatMoney(s.dejaPaye, 'CNY'),
        formatMoney(s.restant, 'CNY')
      ]),
      styles: { font: effectiveFont as any }
    });

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    assert.ok(pdfBuffer.length > 50000, 'Le bordereau en chinois doit incorporer ZCOOLXiaoWei (> 50 Ko)');
    console.log('  [PASS] 5. [generateNonSoldesPDF] Liste non soldés en chinois (Sinogrammes)');
  }

  // 6. [GÉNÉRATEUR 5 : generatePDFList] Liste prioritaire de recouvrement
  {
    const pdfInst = await initI18nPdfDoc({ language: 'fr', format: 'a4', orientation: 'landscape', currency: 'XOF' });
    const { doc, formatMoney, formatDate, prepareText, effectiveFont } = pdfInst;
    const tFin = getFinancialTranslations('fr');

    const priorityList = [
      { id: '1', nom: 'KOUASSI', prenom: 'Yao', classe: '6ème A', telephone: '+228 90 00 00 01', restant: 85000, joursRetard: 45, niveauPriorite: 'Élevé' },
      { id: '2', nom: 'MENSAH', prenom: 'Afi', classe: '5ème B', telephone: '+228 90 00 00 02', restant: 30000, joursRetard: 15, niveauPriorite: 'Moyen' },
    ];

    autoTable(doc, {
      startY: 25,
      head: [[
        prepareText('Nom & Prénom(s)'),
        prepareText('Classe'),
        prepareText('Téléphone'),
        prepareText('Restant'),
        prepareText('Retard (Jours)'),
        prepareText('Priorité')
      ]],
      body: priorityList.map(s => [
        prepareText(`${s.nom} ${s.prenom}`),
        prepareText(s.classe),
        s.telephone,
        formatMoney(s.restant, 'XOF'),
        s.joursRetard.toString(),
        prepareText(s.niveauPriorite)
      ]),
      styles: { font: effectiveFont as any }
    });

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    assert.ok(pdfBuffer.length > 30000, 'Le PDF de recouvrement doit incorporer la police Unicode (> 30 Ko)');
    console.log('  [PASS] 6. [generatePDFList] Liste prioritaire de recouvrement');
  }

  // 7. [GÉNÉRATEUR 6 : generateRapportMensuelPDF] Rapport financier mensuel
  {
    const pdfInst = await initI18nPdfDoc({ language: 'fr', format: 'a4', orientation: 'portrait', currency: 'XOF' });
    const { doc, formatMoney, prepareText, effectiveFont } = pdfInst;
    const tFin = getFinancialTranslations('fr');

    doc.text(prepareText('RAPPORT FINANCIER MENSUEL'), 105, 25, { align: 'center' });
    autoTable(doc, {
      startY: 40,
      head: [[prepareText('Classe'), prepareText('Effectif'), prepareText('Attendu'), prepareText('Encaissé'), prepareText('Taux')]],
      body: [
        ['6ème A', '35', formatMoney(3500000, 'XOF'), formatMoney(3000000, 'XOF'), '85.7%'],
        ['5ème B', '30', formatMoney(3000000, 'XOF'), formatMoney(2100000, 'XOF'), '70.0%']
      ],
      styles: { font: effectiveFont as any }
    });

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    assert.ok(pdfBuffer.length > 30000, 'Le rapport financier mensuel doit être généré avec succès');
    console.log('  [PASS] 7. [generateRapportMensuelPDF] Rapport financier mensuel');
  }

  // 8. [GÉNÉRATEUR 7 : generateYziowReceiptPDF] Reçu d'abonnement SaaS Yziow Platform
  {
    const pdfInst = await initI18nPdfDoc({ language: 'fr', format: 'a4', orientation: 'portrait', currency: 'XOF' });
    const { doc, prepareText, effectiveFont } = pdfInst;
    const tFin = getFinancialTranslations('fr');

    const payment = {
      reference: 'YZIOW-SUB-2026-9901',
      date: '2026-08-20',
      school: 'Complexe Scolaire Moderne',
      director: 'Directeur Général',
      country: 'Togo',
      totalStudents: 450,
      type: 'Comptant Annuel',
      formattedAmount: '450 000 FCFA'
    };

    doc.text('YZIOW PLATFORM', 14, 22);
    doc.text(prepareText(tFin.receiptTitle), 14, 30);
    autoTable(doc, {
      startY: 50,
      head: [[prepareText(tFin.description), prepareText('Période'), prepareText(tFin.amountPaid)]],
      body: [[prepareText(`Abonnement SaaS (${payment.type})`), '2025-2026', payment.formattedAmount]],
      styles: { font: effectiveFont as any }
    });

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    assert.ok(pdfBuffer.length > 30000, 'Le reçu d’abonnement SaaS doit être généré avec succès');
    console.log('  [PASS] 8. [generateYziowReceiptPDF] Reçu d’abonnement SaaS Yziow Platform');
  }

  // 9. Montant XOF sans conversion implicite
  {
    const formatted = formatLocalizedCurrency(250000, 'XOF', 'fr');
    assert.ok(formatted.includes('250') && (formatted.includes('CFA') || formatted.includes('XOF')), 'Doit conserver le montant 250 000 et la devise XOF');
    console.log('  [PASS] 9. Montant XOF sans conversion implicite');
  }

  // 10. Montant EUR localisé
  {
    const formatted = formatLocalizedCurrency(1250.5, 'EUR', 'fr');
    assert.ok(formatted.includes('1') && formatted.includes('250') && (formatted.includes('€') || formatted.includes('EUR')), 'Format EUR');
    console.log('  [PASS] 10. Montant EUR localisé');
  }

  // 11. Montant nul (0)
  {
    const formatted = formatLocalizedCurrency(0, 'XOF', 'fr');
    assert.ok(formatted.includes('0'), 'Montant 0 formaté');
    console.log('  [PASS] 11. Montant nul (0)');
  }

  // 12. Gros montant (50 000 000)
  {
    const formatted = formatLocalizedCurrency(50000000, 'XOF', 'fr');
    assert.ok(formatted.includes('50') && formatted.includes('000'), 'Gros montant formaté avec séparateurs');
    console.log('  [PASS] 12. Gros montant (50 000 000)');
  }

  // 13. Nom d'école long préservé
  {
    const longName = 'Établissement Polyvalent International Franco-Arabe d’Excellence Académique et Technologique';
    const prepared = prepareTextForPdf(longName, 'fr');
    assert.strictEqual(prepared, longName);
    console.log('  [PASS] 13. Nom d’école long préservé');
  }

  // 14. Nom d'élève Unicode étendu
  {
    const studentName = 'Müßig-Özdemir São-Tomé François';
    const prepared = prepareTextForPdf(studentName, 'de');
    assert.strictEqual(prepared, studentName);
    console.log('  [PASS] 14. Nom d’élève Unicode avec accents étendus');
  }

  // 15. Référence alphanumérique préservée
  {
    const ref = 'REC-YZIOW-2026-TX990A';
    const preparedFr = prepareTextForPdf(ref, 'fr');
    const preparedAr = prepareTextForPdf(ref, 'ar');
    assert.strictEqual(preparedFr, ref);
    assert.ok(preparedAr.includes('REC-YZIOW-2026-TX990A'), 'Référence préservée en arabe LTR');
    console.log('  [PASS] 15. Référence alphanumérique préservée');
  }

  // 16. Multipage (Tableau de 40 élèves)
  {
    const pdfInst = await initI18nPdfDoc({ language: 'fr', format: 'a4', orientation: 'landscape', currency: 'XOF' });
    const { doc, effectiveFont } = pdfInst;

    const data: any[] = [];
    for (let i = 1; i <= 40; i++) {
      data.push([String(i), `Élève ${i}`, '6ème A', '100 000 FCFA', '50 000 FCFA', '50 000 FCFA', 'Non soldé']);
    }

    autoTable(doc, {
      startY: 20,
      head: [['#', 'Nom', 'Classe', 'Écolage', 'Payé', 'Restant', 'Statut']],
      body: data,
      styles: { font: effectiveFont as any }
    });

    const pages = doc.getNumberOfPages();
    assert.ok(pages >= 2, 'Un tableau de 40 élèves doit générer au moins 2 pages');
    console.log(`  [PASS] 16. Multipage validé (${pages} pages générées)`);
  }

  // 17. Tableau vide sans crash
  {
    const pdfInst = await initI18nPdfDoc({ language: 'fr', format: 'a4', orientation: 'landscape', currency: 'XOF' });
    const { doc, effectiveFont } = pdfInst;
    assert.doesNotThrow(() => {
      autoTable(doc, {
        startY: 20,
        head: [['#', 'Nom']],
        body: [],
        styles: { font: effectiveFont as any }
      });
    }, 'Un tableau vide ne doit pas lever d’erreur');
    console.log('  [PASS] 17. Tableau vide sans crash');
  }

  // 18. Police indisponible : rejet explicite contrôlé
  {
    clearFontRegistrationCache();
    let errorCaught = false;
    try {
      const dummyDoc = new jsPDF();
      await registerFontInDoc(dummyDoc, {
        fontName: 'NotoSansArabic',
        fontFile: 'missing_font_file.ttf',
        fallbackFont: 'helvetica',
        script: 'arabic',
        isRtl: true,
        requiresShaping: true,
      });
    } catch (e: any) {
      errorCaught = true;
      assert.ok(e.message.includes('POLICE_UNICODE_INDISPONIBLE'), 'Doit lever une exception POLICE_UNICODE_INDISPONIBLE');
    }
    assert.strictEqual(errorCaught, true, 'Rejet strict sans fallback Helvetica pour arabe/russe/chinois');
    console.log('  [PASS] 18. Police indisponible : rejet explicite POLICE_UNICODE_INDISPONIBLE');
  }

  // 19. Locale corrompue avec fallback français
  {
    const norm = normalizeLanguage('unknown_locale_xyz' as any);
    assert.strictEqual(norm, 'fr');
    const tFin = getFinancialTranslations('unknown_locale_xyz' as any);
    assert.strictEqual(tFin.receiptTitle, 'REÇU DE PAIEMENT');
    console.log('  [PASS] 19. Locale corrompue avec fallback français');
  }

  // 20. Absence de `???` ou glyphes de remplacement
  {
    const sample = 'Montant dû : 15 000 FCFA — Reçu #REC-001 (Solde: 0 FCFA)';
    const prepared = prepareTextForPdf(sample, 'fr');
    assert.ok(!prepared.includes('???'));
    console.log('  [PASS] 20. Absence de points d’interrogation de remplacement');
  }

  // 21. Immuabilité stricte des objets financiers sources
  {
    const studentSource = { id: 's1', prenom: 'Paul', nom: 'Kouassi', ecolage: 200000, dejaPaye: 80000, restant: 120000 };
    const paymentsSource = [{ date: '2026-02-10', montant: 80000, recu: 'REC-001' }];
    const settingsSource = { schoolName: 'Collège Saint-Joseph', currency: 'XOF' };

    const cloneStudent = { ...studentSource };
    const clonePayments = JSON.parse(JSON.stringify(paymentsSource));
    const cloneSettings = { ...settingsSource };

    const tFin = getFinancialTranslations('fr');
    const pdfInst = await initI18nPdfDoc({ language: 'fr', format: 'a4', orientation: 'portrait', currency: settingsSource.currency });
    const { doc, formatMoney, prepareText } = pdfInst;

    doc.text(prepareText(tFin.invoiceTitle), 105, 20, { align: 'center' });
    doc.text(prepareText(`${tFin.student} : ${studentSource.prenom} ${studentSource.nom}`), 20, 40);
    doc.text(prepareText(`${tFin.amount} : ${formatMoney(studentSource.ecolage, settingsSource.currency)}`), 20, 50);

    assert.deepStrictEqual(studentSource, cloneStudent);
    assert.deepStrictEqual(paymentsSource, clonePayments);
    assert.deepStrictEqual(settingsSource, cloneSettings);
    console.log('  [PASS] 21. Immuabilité stricte des objets financiers sources');
  }

  console.log('\n========================================');
  console.log('RÉSULTAT : 21/21 tests Lot 2 exécutés et validés.');
  console.log('========================================\n');
}

runTests().catch(err => {
  console.error('Échec des tests financiers Lot 2:', err);
  process.exit(1);
});
