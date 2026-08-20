// ============================================================
// GÉNÉRATEUR PDF — jsPDF + jspdf-autotable
// Mise en forme professionnelle et institutionnelle
// LOGIQUE MÉTIER INCHANGÉE — seule la présentation est améliorée
// ============================================================
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Student } from '../types';
import { useStore } from '../store/useStore';
import { formatMontant } from './helpers';
import {
  initI18nPdfDoc,
  formatLocalizedDate,
  formatLocalizedCurrency,
  prepareTextForPdf,
  normalizeLanguage,
  isRtlLanguage,
  getFontDescriptorForLanguage,
  ensureFontRegistered,
} from './pdfEngine';
import { getFinancialTranslations } from './pdfFinancialTranslations';
import { getStoredLanguage } from '../i18n';

// ── Utilitaires ──────────────────────────────────
const fmtDate = (d?: string, lang?: string) => {
  const normLang = normalizeLanguage(lang || getStoredLanguage());
  return formatLocalizedDate(d ? new Date(d) : new Date(), normLang);
};

const getBadgeLabel = (student: Student): string => {
  if (student.restant <= 0) return '✓ ÉLÈVE SOLDÉ — Parent Responsable';
  const taux = student.ecolage > 0 ? student.dejaPaye / student.ecolage : 0;
  if (taux >= 0.7) return '✓ 2ème Tranche Validée (>=70%)';
  return '⚠ Tranche Partielle / Non Soldé';
};

const getBadgeColor = (student: Student): [number, number, number] => {
  if (student.restant <= 0) return [22, 163, 74];
  const taux = student.ecolage > 0 ? student.dejaPaye / student.ecolage : 0;
  if (taux >= 0.7) return [37, 99, 235];
  return [234, 88, 12];
};

// Génère un numéro de document formaté : YZIOW-2026-XXXXX
const genDocNumber = (student: Student): string => {
  const year = new Date().getFullYear();
  const id = String(student.id || Math.floor(Math.random() * 99999)).padStart(5, '0');
  return `YZIOW-${year}-${id}`;
};

// ── EN-TÊTE INSTITUTIONNEL CENTRÉ ─────────────────────────────
const drawOfficialHeader = (
  doc: jsPDF,
  schoolName: string,
  schoolYear: string,
  title: string,
  docNumber: string,
  schoolLogo?: string,
  schoolStamp?: string,
  schoolNameFontSize: number = 18,
  lang?: string
): number => {
  const normLang = normalizeLanguage(lang || getStoredLanguage());
  const isRtl = isRtlLanguage(normLang);
  const fontDesc = getFontDescriptorForLanguage(normLang);
  const fontName = ensureFontRegistered(doc, fontDesc);
  const tFin = getFinancialTranslations(normLang);

  const w = doc.internal.pageSize.getWidth();
  let y = 14;

  doc.setTextColor(0, 0, 0);
  doc.setFont(fontName, 'bold');

  const centerX = w / 2;
  
  const state = useStore.getState();
  const address = state.schoolAddress || tFin.noData;
  const phone = state.schoolPhone || tFin.noData;
  const slogan = state.schoolSlogan || 'Travail-Rigueur-Succès';

  // Bloc Ministère (Centre-Gauche)
  doc.setFontSize(10);
  doc.setFont(fontName, 'bold');
  
  if (state.schoolMinistry) {
    const ministryLines = state.schoolMinistry.split('\n');
    let ministryY = y;
    ministryLines.forEach(line => {
      doc.text(prepareTextForPdf(line.trim().toUpperCase(), normLang), centerX - 35, ministryY, { align: 'center' });
      ministryY += 5;
    });
  } else {
    // Fallback si vide
    doc.text(prepareTextForPdf("MINISTERE DE L'EDUCATION NATIONALE", normLang), centerX - 35, y, { align: 'center' });
    doc.setFontSize(9.5);
    doc.text(prepareTextForPdf("DIRECTION RÉGIONALE DE L'ÉDUCATION", normLang), centerX - 35, y + 5, { align: 'center' });
    doc.text(prepareTextForPdf("INSPECTION DE L'ENSEIGNEMENT GENERAL", normLang), centerX - 35, y + 10, { align: 'center' });
  }

  // Bloc Établissement (Centre-Droite)
  doc.setFontSize(schoolNameFontSize);
  doc.setFont(fontName, 'bold');
  doc.text(prepareTextForPdf(schoolName.toUpperCase(), normLang), centerX + 35, y, { align: 'center' });
  doc.setFontSize(11);
  doc.setFont(fontName, 'italic');
  doc.text(prepareTextForPdf(`« ${slogan} »`, normLang), centerX + 35, y + 7, { align: 'center' });
  doc.setFont(fontName, 'bold');
  doc.setFontSize(10);
  doc.text(prepareTextForPdf(`${tFin.phone}: ${phone}`, normLang), centerX + 35, y + 14, { align: 'center' });
  doc.text(prepareTextForPdf(address, normLang), centerX + 35, y + 19, { align: 'center' });

  // LOGO
  if (schoolLogo) {
      try {
          doc.addImage(schoolLogo, 'PNG', w - 8 - 18, y, 18, 18);
      } catch(e) {}
  }

  y = y + 32;

  // --- TITRE DU DOCUMENT ---
  doc.setLineWidth(0.8);
  doc.line(14, y, w - 14, y);
  y += 8;
  doc.setFontSize(16);
  doc.setFont(fontName, 'bold');
  doc.text(prepareTextForPdf(title, normLang), w / 2, y, { align: 'center' });
  y += 7;
  doc.setFontSize(11);
  doc.setFont(fontName, 'normal');
  doc.text(prepareTextForPdf(`${tFin.academicYear} : ${schoolYear}`, normLang), w / 2, y, { align: 'center' });
  
  y += 5;
  doc.setFontSize(10);
  const cityFromAddress = (state.schoolAddress || '').split(',')[0].trim() || schoolName;
  const dateStr = fmtDate(undefined, normLang);
  if (isRtl) {
    doc.text(prepareTextForPdf(`${tFin.ref} : ${docNumber}`), 14, y);
    doc.text(prepareTextForPdf(`${cityFromAddress}, ${dateStr}`), w - 14, y, { align: 'right' });
  } else {
    doc.text(`Fait à ${cityFromAddress}, le ${dateStr}`, 14, y);
    doc.text(`N° : ${docNumber}`, w - 14, y, { align: 'right' });
  }
  
  y += 5;
  doc.setLineWidth(0.2);
  doc.line(14, y, w - 14, y);

  return y + 10;
};

// ── BLOC ÉLÈVE EN DEUX COLONNES ───────────────────────────────
const drawStudentBlock = (
  doc: jsPDF,
  student: Student,
  startY: number,
  lang?: string
): number => {
  const normLang = normalizeLanguage(lang || getStoredLanguage());
  const isRtl = isRtlLanguage(normLang);
  const fontDesc = getFontDescriptorForLanguage(normLang);
  const fontName = ensureFontRegistered(doc, fontDesc);
  const tFin = getFinancialTranslations(normLang);

  const pageW = doc.internal.pageSize.getWidth();
  const blockH = 44;
  const margin = 14;
  const colW = (pageW - margin * 2) / 2 - 4;

  // Fond gris très clair avec bordure
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, startY, pageW - margin * 2, blockH, 3, 3, 'FD');

  // Bande titre
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(margin, startY, pageW - margin * 2, 8, 3, 3, 'F');
  doc.rect(margin, startY + 5, pageW - margin * 2, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont(fontName, 'bold');
  doc.text(prepareTextForPdf(tFin.student.toUpperCase(), normLang), pageW / 2, startY + 5.5, { align: 'center' });

  // Contenu deux colonnes
  const leftX = margin + 5;
  const rightX = margin + colW + 12;
  let rowY = startY + 14;
  const rowH = 6;

  const leftInfos: [string, string][] = [
    [tFin.student, `${student.prenom || ''} ${student.nom || ''}`.trim()],
    [tFin.classLabel, student.classe || ''],
    [tFin.cycle, student.cycle || ''],
    ['Sexe', student.sexe === 'M' ? 'Masculin' : 'Féminin'],
  ];
  const rightInfos: [string, string][] = [
    ['Redoublant', student.redoublant ? 'Oui' : 'Non'],
    [tFin.parent, student.telephone || tFin.noData],
    ['École provenance', student.ecoleProvenance || 'N/A'],
    [tFin.ref, student.recu || '—'],
  ];

  if (isRtl) {
    leftInfos.forEach(([label, val]) => {
      doc.setFont(fontName, 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text(prepareTextForPdf(`${label} :`), rightX + colW - 5, rowY, { align: 'right' });
      doc.setFont(fontName, 'normal');
      doc.setTextColor(15, 23, 42);
      doc.text(prepareTextForPdf(val), rightX + colW - 35, rowY, { align: 'right' });
      rowY += rowH;
    });

    rowY = startY + 14;
    rightInfos.forEach(([label, val]) => {
      doc.setFont(fontName, 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text(prepareTextForPdf(`${label} :`), leftX + colW - 5, rowY, { align: 'right' });
      doc.setFont(fontName, 'normal');
      doc.setTextColor(15, 23, 42);
      doc.text(prepareTextForPdf(val), leftX + colW - 35, rowY, { align: 'right' });
      rowY += rowH;
    });
  } else {
    leftInfos.forEach(([label, val]) => {
      doc.setFont(fontName, 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text(`${label} :`, leftX, rowY);
      doc.setFont(fontName, 'normal');
      doc.setTextColor(15, 23, 42);
      doc.text(val, leftX + 36, rowY);
      rowY += rowH;
    });

    rowY = startY + 14;
    rightInfos.forEach(([label, val]) => {
      doc.setFont(fontName, 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text(`${label} :`, rightX, rowY);
      doc.setFont(fontName, 'normal');
      doc.setTextColor(15, 23, 42);
      doc.text(val, rightX + 38, rowY);
      rowY += rowH;
    });
  }

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(pageW / 2, startY + 9, pageW / 2, startY + blockH - 3);

  doc.setTextColor(0, 0, 0);
  return startY + blockH + 6;
};

// ── TABLEAU FINANCIER PROFESSIONNEL ───────────────────────────
const drawFinanceTable = (
  doc: jsPDF,
  student: Student,
  startY: number,
  lang?: string
): number => {
  const normLang = normalizeLanguage(lang || getStoredLanguage());
  const fontDesc = getFontDescriptorForLanguage(normLang);
  const fontName = ensureFontRegistered(doc, fontDesc);
  const tFin = getFinancialTranslations(normLang);
  const currency = useStore.getState().currency;

  doc.setFontSize(8);
  doc.setFont(fontName, 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(prepareTextForPdf('SITUATION FINANCIÈRE', normLang), 14, startY);
  doc.setDrawColor(37, 99, 235);
  doc.setLineWidth(0.5);
  doc.line(14, startY + 1.5, 70, startY + 1.5);

  autoTable(doc, {
    startY: startY + 5,
    head: [[prepareTextForPdf(tFin.description, normLang), prepareTextForPdf(`${tFin.amount} (${currency})`, normLang)]],
    body: [
      [prepareTextForPdf(tFin.totalTuition, normLang), formatLocalizedCurrency(student.ecolage, currency, normLang)],
      [prepareTextForPdf(tFin.totalPaid, normLang), formatLocalizedCurrency(student.dejaPaye, currency, normLang)],
      [prepareTextForPdf(tFin.balanceDue, normLang), student.restant <= 0 ? prepareTextForPdf(`${tFin.statusSettled} ✓`, normLang) : formatLocalizedCurrency(student.restant, currency, normLang)],
    ],
    styles: {
      fontSize: 10,
      cellPadding: { top: 5, bottom: 5, left: 8, right: 8 },
      font: fontName as any,
      lineColor: [226, 232, 240],
      lineWidth: 0.3,
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
      halign: 'left',
    },
    columnStyles: {
      0: { cellWidth: 110, textColor: [51, 65, 85] },
      1: { cellWidth: 70, halign: 'right', fontStyle: 'bold', textColor: [15, 23, 42] },
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 1 && data.row.index === 2) {
        data.cell.styles.textColor = student.restant <= 0 ? [22, 163, 74] : [220, 38, 38];
      }
    },
  });

  let currentY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  // Historique des paiements
  if (student.historiquesPaiements && student.historiquesPaiements.length > 0) {
    doc.setFontSize(8);
    doc.setFont(fontName, 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(prepareTextForPdf(tFin.paymentsMade, normLang), 14, currentY);
    doc.setDrawColor(37, 99, 235);
    doc.setLineWidth(0.5);
    doc.line(14, currentY + 1.5, 70, currentY + 1.5);

    const historyBody = student.historiquesPaiements.map(p => [
      formatLocalizedDate(p.date ? new Date(p.date) : new Date(), normLang),
      p.recu || '—',
      prepareTextForPdf(p.mode || 'Espèces', normLang),
      formatLocalizedCurrency(p.montant, currency, normLang)
    ]);

    autoTable(doc, {
      startY: currentY + 5,
      head: [[prepareTextForPdf(tFin.date, normLang), prepareTextForPdf(tFin.ref, normLang), prepareTextForPdf(tFin.paymentMethod, normLang), prepareTextForPdf(`${tFin.amount} (${currency})`, normLang)]],
      body: historyBody,
      styles: {
        fontSize: 9,
        cellPadding: { top: 4, bottom: 4, left: 6, right: 6 },
        font: fontName as any,
        lineColor: [226, 232, 240],
        lineWidth: 0.3,
      },
      headStyles: {
        fillColor: [241, 245, 249],
        textColor: [51, 65, 85],
        fontStyle: 'bold',
        fontSize: 8.5,
      },
      columnStyles: {
        3: { halign: 'right', fontStyle: 'bold', textColor: [22, 163, 74] },
      },
      margin: { left: 14, right: 14 },
    });
    
    currentY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  return currentY;
};

// ── BADGE STATUT ENCADRÉ ──────────────────────────────────────
const drawStatusBadge = (
  doc: jsPDF,
  student: Student,
  startY: number,
  lang?: string
): number => {
  const normLang = normalizeLanguage(lang || getStoredLanguage());
  const fontDesc = getFontDescriptorForLanguage(normLang);
  const fontName = ensureFontRegistered(doc, fontDesc);
  const tFin = getFinancialTranslations(normLang);

  const w = doc.internal.pageSize.getWidth();
  const [r, g, b] = getBadgeColor(student);
  const label = student.restant <= 0 ? `✓ ${tFin.statusSettled}` : `⚠ ${tFin.statusPending}`;

  doc.setFillColor(r, g, b);
  doc.setDrawColor(r, g, b);
  doc.setLineWidth(0.5);
  doc.roundedRect(14, startY, w - 28, 13, 3, 3, 'FD');

  doc.setFillColor(255, 255, 255);
  doc.roundedRect(19, startY + 3, 7, 7, 1, 1, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont(fontName, 'bold');
  doc.text(prepareTextForPdf(label, normLang), w / 2, startY + 8.5, { align: 'center' });

  doc.setTextColor(0, 0, 0);
  return startY + 18;
};

// ── MESSAGE INSTITUTIONNEL ────────────────────────────────────
const drawMessage = (
  doc: jsPDF,
  student: Student,
  message: string,
  startY: number,
  lang?: string
): number => {
  const normLang = normalizeLanguage(lang || getStoredLanguage());
  const fontDesc = getFontDescriptorForLanguage(normLang);
  const fontName = ensureFontRegistered(doc, fontDesc);

  const w = doc.internal.pageSize.getWidth();
  const isSolde = student.restant <= 0;

  if (isSolde) {
    doc.setFillColor(240, 253, 244);
    doc.setDrawColor(187, 247, 208);
  } else {
    doc.setFillColor(255, 251, 235);
    doc.setDrawColor(253, 230, 138);
  }
  doc.setLineWidth(0.4);

  const lines = doc.splitTextToSize(prepareTextForPdf(message, normLang), w - 44);
  const boxH = lines.length * 5 + 10;
  doc.roundedRect(14, startY, w - 28, boxH, 3, 3, 'FD');

  doc.setFillColor(isSolde ? 22 : 234, isSolde ? 163 : 88, isSolde ? 74 : 12);
  doc.rect(14, startY, 3, boxH, 'F');

  doc.setTextColor(isSolde ? 20 : 120, isSolde ? 83 : 53, isSolde ? 45 : 15);
  doc.setFontSize(8.5);
  doc.setFont(fontName, 'normal');
  doc.text(lines, 22, startY + 7);

  doc.setTextColor(0, 0, 0);
  return startY + boxH + 10;
};

// ── ZONE SIGNATURES PROFESSIONNELLE ──────────────────────────
const drawSignatureZone = (doc: jsPDF, startY: number, schoolStamp?: string, lang?: string): void => {
  const normLang = normalizeLanguage(lang || getStoredLanguage());
  const fontDesc = getFontDescriptorForLanguage(normLang);
  const fontName = ensureFontRegistered(doc, fontDesc);
  const tFin = getFinancialTranslations(normLang);

  const w = doc.internal.pageSize.getWidth();
  const sigWidth = 65;
  const leftX = 14;
  const rightX = w - 14 - sigWidth;

  // Bloc signature gauche (parent)
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(leftX, startY, sigWidth, 28, 2, 2, 'FD');
  doc.setFontSize(7.5);
  doc.setFont(fontName, 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text(prepareTextForPdf(tFin.parent, normLang), leftX + sigWidth / 2, startY + 6, { align: 'center' });
  doc.setDrawColor(210, 218, 230);
  doc.line(leftX + 8, startY + 22, leftX + sigWidth - 8, startY + 22);
  doc.setFont(fontName, 'normal');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(prepareTextForPdf('Signature', normLang), leftX + sigWidth / 2, startY + 26, { align: 'center' });

  // Bloc cachet droite (établissement)
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(rightX, startY, sigWidth, 28, 2, 2, 'FD');
  doc.setFontSize(7.5);
  doc.setFont(fontName, 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text(prepareTextForPdf(tFin.signatureAccounting, normLang), rightX + sigWidth / 2, startY + 6, { align: 'center' });
  
  if (schoolStamp) {
    try {
        doc.addImage(schoolStamp, 'PNG', rightX + (sigWidth - 18) / 2, startY + 8, 18, 18);
    } catch(e) {
        doc.setDrawColor(200, 210, 225);
        doc.setLineWidth(0.5);
        doc.circle(rightX + sigWidth / 2, startY + 17, 7, 'D');
        doc.setFontSize(5.5);
        doc.setTextColor(180, 190, 205);
        doc.text('CACHET', rightX + sigWidth / 2, startY + 18, { align: 'center' });
    }
  } else {
    doc.setDrawColor(200, 210, 225);
    doc.setLineWidth(0.5);
    doc.circle(rightX + sigWidth / 2, startY + 17, 7, 'D');
    doc.setFontSize(5.5);
    doc.setTextColor(180, 190, 205);
    doc.text('CACHET', rightX + sigWidth / 2, startY + 18, { align: 'center' });
  }
};

// ── PIED DE PAGE DISCRET ──────────────────────────────────────
const drawFooter = (doc: jsPDF, schoolName: string, lang?: string): void => {
  const normLang = normalizeLanguage(lang || getStoredLanguage());
  const fontDesc = getFontDescriptorForLanguage(normLang);
  const fontName = ensureFontRegistered(doc, fontDesc);
  const tFin = getFinancialTranslations(normLang);

  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const pages = doc.getNumberOfPages();

  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);

    doc.setFillColor(37, 99, 235);
    doc.rect(0, h - 10, w, 1.5, 'F');

    doc.setFillColor(15, 23, 42);
    doc.rect(0, h - 8.5, w, 8.5, 'F');

    doc.setTextColor(148, 163, 184);
    doc.setFontSize(6.5);
    doc.setFont(fontName, 'normal');
    doc.text(prepareTextForPdf(schoolName.toUpperCase(), normLang), 14, h - 3.5);
    doc.text(prepareTextForPdf(`${tFin.generatedOn} ${fmtDate(undefined, normLang)}`, normLang), w / 2, h - 3.5, { align: 'center' });
    doc.text(prepareTextForPdf(`${tFin.page} ${i} / ${pages}`, normLang), w - 14, h - 3.5, { align: 'right' });
  }
  doc.setTextColor(0, 0, 0);
};

// ══════════════════════════════════════════════════════════════
// REÇU INDIVIDUEL OFFICIEL
// ══════════════════════════════════════════════════════════════
export const generateRecuPDF = async (
  student: Student,
  schoolName: string,
  schoolYear: string,
  messageRemerciement: string,
  messageRappel: string,
  schoolLogo?: string,
  schoolStamp?: string,
  targetLang?: string
): Promise<void> => {
  const lang = targetLang || getStoredLanguage();
  const tFin = getFinancialTranslations(lang);
  const pdfInst = await initI18nPdfDoc({
    language: lang,
    format: 'a4',
    orientation: 'portrait',
    currency: useStore.getState().currency,
  });
  const { doc } = pdfInst;
  const docNumber = genDocNumber(student);
  const h = doc.internal.pageSize.getHeight();

  let y = drawOfficialHeader(doc, schoolName, schoolYear, tFin.receiptTitle, docNumber, schoolLogo, schoolStamp, 10, lang);
  y = drawStudentBlock(doc, student, y, lang);
  y = drawFinanceTable(doc, student, y, lang);
  y = drawStatusBadge(doc, student, y, lang);

  const template = student.restant <= 0 ? messageRemerciement : messageRappel;
  const currency = useStore.getState().currency;
  let message = template || '';
  if (template) {
    message = template
      .replace(/{nom_eleve}/g, `${student.prenom || ''} ${student.nom || ''}`.trim())
      .replace(/{reste_a_payer}/g, formatLocalizedCurrency(student.restant, currency, lang))
      .replace(/{classe}/g, student.classe || '')
      .replace(/{montant_paye}/g, formatLocalizedCurrency(student.dejaPaye, currency, lang));
  }
  y = drawMessage(doc, student, message, y, lang);

  const sigY = Math.max(y + 6, h - 55);
  drawSignatureZone(doc, sigY, schoolStamp, lang);
  drawFooter(doc, schoolName, lang);

  doc.save(`fiche_${student.nom || 'eleve'}_${student.prenom || ''}_${student.classe || ''}.pdf`);
};

// ══════════════════════════════════════════════════════════════
// PDF PAR CLASSE — TABLEAU MINIMALISTE ET BIEN ALIGNÉ
// ══════════════════════════════════════════════════════════════
export const generateClassePDF = (
  students: Student[],
  classe: string,
  schoolName: string,
  schoolYear: string,
  messageRemerciement: string,
  messageRappel: string,
  schoolLogo?: string,
  schoolStamp?: string
): void => {
  if (!students.length) return;
  void messageRemerciement;
  void messageRappel;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const w = doc.internal.pageSize.getWidth();
  const docNumber = `YZIOW-${new Date().getFullYear()}-CL${classe.replace(/\s/g, '').toUpperCase()}`;

  let y = drawOfficialHeader(doc, schoolName, schoolYear, `LISTE FINANCIÈRE — ${classe.toUpperCase()}`, docNumber, schoolLogo, schoolStamp);

  // Statistiques condensées sur une ligne
  const totalEcolage = students.reduce((a, s) => a + s.ecolage, 0);
  const totalPaye = students.reduce((a, s) => a + s.dejaPaye, 0);
  const totalRestant = students.reduce((a, s) => a + s.restant, 0);
  const taux = totalEcolage > 0 ? Math.round((totalPaye / totalEcolage) * 100) : 0;
  const nbSoldes = students.filter(s => s.restant <= 0).length;

  const currency = useStore.getState().currency;

  // Bandeau résumé compact
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(10, y, w - 20, 10, 2, 2, 'FD');
  doc.setFontSize(8);
  doc.setFont('times', 'bold');
  doc.setTextColor(15, 23, 42);
  const summary = `Effectif: ${students.length}  |  Écolage: ${formatMontant(totalEcolage, currency)}  |  Perçu: ${formatMontant(totalPaye, currency)}  |  Restant: ${formatMontant(totalRestant, currency)}  |  Taux: ${taux}%  |  Soldés: ${nbSoldes}`;
  doc.text(summary, w / 2, y + 6.5, { align: 'center' });
  y += 14;

  // Tableau minimaliste avec colonnes fixes et compactes
  autoTable(doc, {
    startY: y,
    head: [['N°', 'Nom', 'Prénom', 'Sexe', 'Téléphone', 'Écolage', 'Payé', 'Restant', 'Statut']],
    body: students.map((s, i) => [
      (i + 1).toString(),
      s.nom.toUpperCase(),
      s.prenom,
      s.sexe,
      s.telephone,
      formatMontant(s.ecolage, currency),
      formatMontant(s.dejaPaye, currency),
      s.restant <= 0 ? 'SOLDÉ' : formatMontant(s.restant, currency),
      s.status,
    ]),
    foot: [[
      '',
      'TOTAL',
      `${students.length} élèves`,
      '',
      '',
      formatMontant(totalEcolage, currency),
      formatMontant(totalPaye, currency),
      formatMontant(totalRestant, currency),
      `${taux}%`,
    ]],
    styles: {
      fontSize: 7.5,
      cellPadding: 2,
      font: 'times',
      lineColor: [200, 200, 200],
      lineWidth: 0.1,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
      halign: 'center',
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 7.5,
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 35 },
      2: { cellWidth: 30 },
      3: { cellWidth: 12, halign: 'center' },
      4: { cellWidth: 30 },
      5: { cellWidth: 28, halign: 'right' },
      6: { cellWidth: 28, halign: 'right' },
      7: { cellWidth: 28, halign: 'right' },
      8: { cellWidth: 22, halign: 'center' },
    },
    didParseCell: (data) => {
      // Colonne Payé en vert
      if (data.column.index === 6 && data.section === 'body') {
        data.cell.styles.textColor = [22, 163, 74];
      }
      // Colonne Restant : vert si soldé, rouge sinon
      if (data.column.index === 7 && data.section === 'body') {
        const val = String(data.cell.raw);
        if (val === 'SOLDÉ') {
          data.cell.styles.textColor = [22, 163, 74];
          data.cell.styles.fontStyle = 'bold';
        } else {
          data.cell.styles.textColor = [220, 38, 38];
        }
      }
      // Colonne Statut
      if (data.column.index === 8 && data.section === 'body') {
        const val = String(data.cell.raw);
        if (val === 'Soldé') data.cell.styles.textColor = [22, 163, 74];
        else if (val === 'Partiel') data.cell.styles.textColor = [202, 138, 4];
        else data.cell.styles.textColor = [220, 38, 38];
      }
    },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    margin: { left: 10, right: 10 },
    tableWidth: 'auto',
  });

  drawFooter(doc, schoolName);
  doc.save(`liste_${classe}_${schoolYear}.pdf`);
};

// ══════════════════════════════════════════════════════════════
// PDF ÉLÈVES NON SOLDÉS
// ══════════════════════════════════════════════════════════════
export const generateNonSoldesPDF = async (
  students: Student[],
  schoolName: string,
  schoolYear: string,
  messageRappel: string,
  schoolLogo?: string,
  schoolStamp?: string,
  targetLang?: string
): Promise<void> => {
  if (!students.length) return;

  const lang = targetLang || getStoredLanguage();
  const tFin = getFinancialTranslations(lang);
  const pdfInst = await initI18nPdfDoc({
    language: lang,
    format: 'a4',
    orientation: 'landscape',
    currency: useStore.getState().currency,
  });
  const { doc, formatMoney, prepareText, effectiveFont } = pdfInst;
  const w = doc.internal.pageSize.getWidth();
  const docNumber = `YZO-${new Date().getFullYear()}-NONSOL`;

  let y = drawOfficialHeader(doc, schoolName, schoolYear, tFin.nonSoldesTitle, docNumber, schoolLogo, schoolStamp, 16, lang);

  // Encadré rappel institutionnel
  doc.setFillColor(255, 241, 242);
  doc.setDrawColor(254, 205, 211);
  doc.setLineWidth(0.4);
  const msgLines = doc.splitTextToSize(prepareText(messageRappel), w - 44);
  const boxH = msgLines.length * 5 + 14;
  doc.roundedRect(14, y, w - 28, boxH, 3, 3, 'FD');

  doc.setFillColor(220, 38, 38);
  doc.rect(14, y, 3, boxH, 'F');
  doc.setTextColor(159, 18, 57);
  doc.setFontSize(8);
  doc.setFont(effectiveFont, 'bold');
  doc.text(prepareText(`⚠ ${tFin.nonSoldesTitle}`), 22, y + 7);
  doc.setFont(effectiveFont, 'normal');
  doc.setFontSize(7.5);
  doc.text(msgLines, 22, y + 13);
  doc.setTextColor(0, 0, 0);
  y += boxH + 6;

  // Statistiques rapides
  const totalEcolage = students.reduce((a, s) => a + Number(s.ecolage || 0), 0);
  const totalPaye = students.reduce((a, s) => a + Number(s.dejaPaye || 0), 0);
  const totalRestant = students.reduce((a, s) => a + Number(s.restant || 0), 0);
  const currency = useStore.getState().currency;

  doc.setFillColor(254, 242, 242);
  doc.setDrawColor(254, 205, 211);
  doc.roundedRect(14, y, w - 28, 10, 2, 2, 'FD');
  doc.setFontSize(8);
  doc.setFont(effectiveFont, 'bold');
  doc.setTextColor(153, 27, 27);

  const statsSummary = `${students.length} ${tFin.recoverySummary}  ·  ${tFin.balanceDue} : ${formatMoney(totalRestant, currency)}  ·  ${tFin.amountPaid} : ${formatMoney(totalPaye, currency)}  ·  ${tFin.totalExpected} : ${formatMoney(totalEcolage, currency)}`;
  doc.text(prepareText(statsSummary), w / 2, y + 6.5, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  y += 16;

  autoTable(doc, {
    startY: y,
    head: [[
      '#',
      prepareText(tFin.student),
      prepareText(tFin.classLabel),
      prepareText(tFin.cycle),
      prepareText(tFin.phone),
      prepareText(tFin.totalTuition),
      prepareText(tFin.amountPaid),
      prepareText(tFin.balanceDue),
      'Taux %',
      prepareText(tFin.status)
    ]],
    body: students.map((s, i) => {
      const taux = s.ecolage > 0 ? Math.round((s.dejaPaye / s.ecolage) * 100) : 0;
      return [
        i + 1,
        prepareText(`${s.prenom || ''} ${s.nom || ''}`.trim()),
        prepareText(s.classe || ''),
        prepareText(s.cycle || ''),
        s.telephone || '—',
        formatMoney(s.ecolage, currency),
        formatMoney(s.dejaPaye, currency),
        formatMoney(s.restant, currency),
        `${taux}%`,
        prepareText(s.restant <= 0 ? tFin.statusSettled : (s.dejaPaye > 0 ? tFin.statusPartial : tFin.statusPending)),
      ];
    }),
    foot: [['', prepareText(`TOTAL — ${students.length} ${tFin.recoverySummary}`), '', '', '',
      formatMoney(totalEcolage, currency),
      formatMoney(totalPaye, currency),
      formatMoney(totalRestant, currency),
      '', '',
    ]],
    styles: {
      fontSize: 8,
      cellPadding: { top: 3.5, bottom: 3.5, left: 4, right: 4 },
      font: effectiveFont as any,
      lineColor: [254, 205, 211],
      lineWidth: 0.25,
    },
    headStyles: {
      fillColor: [153, 27, 27],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    footStyles: {
      fillColor: [254, 242, 242],
      textColor: [153, 27, 27],
      fontStyle: 'bold',
      fontSize: 8,
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      5: { halign: 'right' },
      6: { halign: 'right', textColor: [22, 163, 74] },
      7: { halign: 'right', textColor: [220, 38, 38], fontStyle: 'bold' },
      8: { halign: 'center' },
      9: { halign: 'center' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 9) {
        const rowStudent = students[data.row.index];
        if (rowStudent && rowStudent.restant <= 0) {
          data.cell.styles.textColor = [22, 163, 74];
        } else if (rowStudent && rowStudent.dejaPaye > 0) {
          data.cell.styles.textColor = [202, 138, 4];
        } else {
          data.cell.styles.textColor = [220, 38, 38];
        }
      }
    },
    alternateRowStyles: { fillColor: [255, 251, 235] },
    margin: { left: 10, right: 10 },
  });

  drawFooter(doc, schoolName, lang);
  doc.save(`non_soldes_${schoolYear}.pdf`);
};
