// ============================================================
// REPORT GENERATOR — Rapport Financier Mensuel International
// ============================================================
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Student } from '../types';
import { ClassFinanceRow, computeMonthlyEvolution, computeRecouvrement } from '../services/analyticsService';
import { useStore } from '../store/useStore';
import {
  initI18nPdfDoc,
  formatLocalizedDate,
  formatLocalizedCurrency,
  formatLocalizedNumber,
  prepareTextForPdf,
  normalizeLanguage,
  isRtlLanguage,
  getBcp47Locale,
} from './pdfEngine';
import { getFinancialTranslations } from './pdfFinancialTranslations';
import { getStoredLanguage } from '../i18n';

export const generateRapportMensuelPDF = async (
  students: Student[],
  classComp: ClassFinanceRow[],
  schoolInfo: { name: string; logo: string | null; stamp: string | null },
  targetLang?: string
): Promise<void> => {
  const lang = targetLang || getStoredLanguage();
  const normLang = normalizeLanguage(lang);
  const isRtl = isRtlLanguage(normLang);
  const tFin = getFinancialTranslations(normLang);
  const currency = useStore.getState().currency;

  const pdfInst = await initI18nPdfDoc({
    language: normLang,
    format: 'a4',
    orientation: 'portrait',
    currency,
  });
  const { doc, formatMoney, formatDate, formatNumber, prepareText, effectiveFont } = pdfInst;

  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const margin = 20;

  // -- Données calculées
  const now = new Date();
  const bcp47 = getBcp47Locale(normLang);
  const currentMonthName = new Intl.DateTimeFormat(bcp47, { month: 'long', year: 'numeric' }).format(now);
  const recou = computeRecouvrement(students);
  const evolution = computeMonthlyEvolution(students);
  const allClassStats = [...classComp].sort((a, b) => a.classe.localeCompare(b.classe));

  const setPrimary = () => doc.setTextColor(0, 0, 0);

  // --- 0. BRANDING & HEADER ---
  let y = 15;
  doc.setTextColor(0, 0, 0);
  doc.setFont(effectiveFont, 'bold');

  const centerX = w / 2;
  const state = useStore.getState();
  const address = state.schoolAddress || tFin.noData;
  const phone = state.schoolPhone || tFin.noData;

  // Bloc Ministère (Centre-Gauche)
  doc.setFontSize(10);
  doc.setFont(effectiveFont, 'bold');

  if (state.schoolMinistry) {
    const ministryLines = state.schoolMinistry.split('\n');
    let ministryY = y;
    ministryLines.forEach(line => {
      doc.text(prepareText(line.trim().toUpperCase()), centerX - 35, ministryY, { align: 'center' });
      ministryY += 5;
    });
  } else {
    doc.text(prepareText("MINISTERE DE L'EDUCATION NATIONALE"), centerX - 35, y, { align: 'center' });
    doc.setFontSize(9.5);
    doc.text(prepareText("DIRECTION RÉGIONALE DE L'ÉDUCATION"), centerX - 35, y + 5, { align: 'center' });
    doc.text(prepareText("INSPECTION DE L'ENSEIGNEMENT GENERAL"), centerX - 35, y + 10, { align: 'center' });
  }

  // Bloc Établissement (Centre-Droite)
  doc.setFontSize(10);
  doc.setFont(effectiveFont, 'bold');
  doc.text(prepareText(schoolInfo.name.toUpperCase()), centerX + 35, y, { align: 'center' });
  doc.setFontSize(11);
  doc.setFont(effectiveFont, 'italic');
  doc.text(prepareText('Travail-Rigueur-Succès'), centerX + 35, y + 7, { align: 'center' });
  doc.setFont(effectiveFont, 'bold');
  doc.setFontSize(10);
  doc.text(prepareText(`${tFin.phone}: ${phone}`), centerX + 35, y + 14, { align: 'center' });
  doc.text(prepareText(address), centerX + 35, y + 19, { align: 'center' });

  // LOGO
  if (schoolInfo.logo) {
    try {
      doc.addImage(schoolInfo.logo, 'PNG', w - margin - 8, y, 18, 18);
    } catch(e) {}
  }

  y = y + 32;

  // --- TITRE DU DOCUMENT ---
  doc.setLineWidth(0.8);
  doc.line(margin, y, w - margin, y);
  y += 10;
  doc.setFontSize(22);
  doc.setFont(effectiveFont, 'bold');
  doc.text(prepareText(tFin.monthlyReportTitle), w / 2, y, { align: 'center' });

  y += 10;
  doc.setFontSize(12);
  doc.setFont(effectiveFont, 'bold');
  doc.text(prepareText(`${tFin.description.toUpperCase()} : ${currentMonthName.toUpperCase()}`), w / 2, y, { align: 'center' });

  y += 7;
  doc.setFontSize(9.5);
  doc.setFont(effectiveFont, 'normal');
  doc.text(prepareText(`${tFin.generatedOn} : ${formatDate(now)}`), w / 2, y, { align: 'center' });

  y += 6;
  doc.setLineWidth(0.2);
  doc.line(margin, y, w - margin, y);

  y += 15;

  // --- 1. RÉSUMÉ STRATÉGIQUE ---
  doc.setFontSize(13);
  doc.setFont(effectiveFont, 'bold');
  setPrimary();
  doc.text(prepareText(`1. ${tFin.statementTitle}`), margin, y);

  y += 8;
  autoTable(doc, {
    startY: y,
    head: [[prepareText('INDICATEUR'), prepareText('VALEUR')]],
    body: [
      [prepareText(tFin.totalExpected), formatMoney(recou.totalTheorique, currency)],
      [prepareText(tFin.amountPaid), formatMoney(recou.totalEncaisse, currency)],
      [prepareText(tFin.balanceDue), formatMoney(recou.totalRestant, currency)],
      [prepareText('TAUX DE RECOUVREMENT'), `${formatNumber(recou.taux)}%`],
    ],
    theme: 'plain',
    styles: {
      fontSize: 10,
      cellPadding: 5,
      font: effectiveFont as any,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.1
    },
    headStyles: {
      fontStyle: 'bold',
      fillColor: [0, 0, 0],
      textColor: [255, 255, 255]
    },
    columnStyles: {
      1: { halign: 'right', fontStyle: 'bold', fontSize: 11 }
    },
    margin: { left: margin, right: margin },
  });

  y = (doc as any).lastAutoTable.finalY + 15;

  // --- 2. DÉTAILS DES ÉCRITURES PAR CLASSE ---
  if (y > h - 40) { doc.addPage(); y = 20; }

  doc.setFontSize(13);
  doc.setFont(effectiveFont, 'bold');
  setPrimary();
  doc.text(prepareText(`2. ${tFin.classLabel.toUpperCase()}`), margin, y);

  y += 8;
  autoTable(doc, {
    startY: y,
    head: [[
      prepareText(tFin.classLabel),
      prepareText('EFFECTIF'),
      prepareText(tFin.totalExpected),
      prepareText(tFin.amountPaid),
      prepareText(tFin.balanceDue),
      'TAUX'
    ]],
    body: allClassStats.map(c => [
      prepareText(c.classe.toUpperCase()),
      c.effectif,
      formatMoney(c.totalTheorique, currency),
      formatMoney(c.totalEncaisse, currency),
      formatMoney(c.totalRestant, currency),
      `${formatNumber(c.taux)}%`
    ]),
    styles: {
      fontSize: 9,
      cellPadding: 4,
      font: effectiveFont as any,
      lineColor: [0, 0, 0],
      lineWidth: 0.1
    },
    headStyles: {
      fillColor: [0, 0, 0],
      textColor: [255, 255, 255],
      fontStyle: 'bold'
    },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    margin: { left: margin, right: margin },
  });

  y = (doc as any).lastAutoTable.finalY + 15;

  // --- 3. ÉVOLUTION MENSUELLE ---
  if (y > h - 60) { doc.addPage(); y = 20; }

  doc.setFontSize(13);
  doc.setFont(effectiveFont, 'bold');
  setPrimary();
  doc.text(prepareText('3. FLUX MENSUELS ENCAISSÉS'), margin, y);

  y += 8;
  const chartW = w - (margin * 2);
  const chartH = 30;
  const barSpacing = chartW / 12;
  const barW = barSpacing * 0.7;
  const maxVal = Math.max(...evolution.map(m => m.montant), 1);

  doc.setLineWidth(0.5);
  doc.setDrawColor(0, 0, 0);
  doc.line(margin, y + chartH, margin + chartW, y + chartH);

  evolution.forEach((m, i) => {
    const barH = (m.montant / maxVal) * chartH;
    const xPos = margin + (i * barSpacing);

    if (barH > 0) {
      doc.setFillColor(0, 0, 0);
      doc.rect(xPos, y + chartH - barH, barW, barH, 'F');
    }

    doc.setFontSize(7);
    doc.setFont(effectiveFont, 'bold');
    doc.text(prepareText(m.mois), xPos + (barW / 2), y + chartH + 5, { align: 'center' });
  });

  y += chartH + 20;

  // --- 4. CONCLUSION ---
  if (y > h - 50) { doc.addPage(); y = 20; }

  doc.setFontSize(12);
  doc.setFont(effectiveFont, 'bold');
  setPrimary();
  doc.text(prepareText('OBSERVATIONS ET VALIDATION'), margin, y);

  y += 8;
  doc.setFontSize(10);
  doc.setFont(effectiveFont, 'normal');
  const conclusion = `Le présent rapport certifie qu'au ${formatDate(now)}, le taux de recouvrement global est de ${formatNumber(recou.taux)}%. ` +
    `Un montant total de ${formatMoney(recou.totalRestant, currency)} reste à percevoir pour clôturer l'exercice.`;

  doc.text(doc.splitTextToSize(prepareText(conclusion), w - (margin * 2)), margin, y);

  // --- SIGNATURES ---
  y = h - 60;
  doc.setLineWidth(1);
  doc.setDrawColor(0, 0, 0);

  doc.setFontSize(11);
  doc.setFont(effectiveFont, 'bold');

  doc.text(prepareText(tFin.signatureCashier), margin + 30, y, { align: 'center' });
  doc.text(prepareText(tFin.signatureAccounting), w - margin - 30, y, { align: 'center' });

  doc.setLineWidth(0.2);
  doc.line(margin + 5, y + 2, margin + 55, y + 2);
  doc.line(w - margin - 55, y + 2, w - margin - 5, y + 2);

  if (schoolInfo.stamp) {
    try {
      doc.addImage(schoolInfo.stamp, 'PNG', w - margin - 40, y + 5, 20, 20);
    } catch(e) {}
  }

  // --- FOOTER ---
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont(effectiveFont, 'italic');
    doc.line(margin, h - 15, w - margin, h - 15);
    doc.text(prepareText(`${schoolInfo.name.toUpperCase()} - ${tFin.monthlyReportTitle} - ${tFin.page} ${i} / ${totalPages}`), w / 2, h - 10, { align: 'center' });
  }

  const cleanMonth = currentMonthName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '_');
  const fileName = `Bilan_Financier_${cleanMonth}.pdf`;
  doc.save(fileName);
};
