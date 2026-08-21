import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { AppSettings, EvalConfig } from '../types/index.ts';
import { DEFAULT_EVAL_CONFIGS } from '../types/index.ts';
import { drawHeader } from './pdfUtils.ts';
import {
  initI18nPdfDoc,
  normalizeLanguage,
  isRtlLanguage,
  formatLocalizedDate,
  getStoredLanguage,
} from './pdfEngine.ts';
import { getAcademicTranslations } from './pdfAcademicTranslations.ts';

export interface BordereauStudent {
  nom: string;
  prenom: string;
  noteClasse: string;
  noteDevoir: string;
  noteCompo: string;
  moyenne: string;
}

export const generateBordereauPDF = async (
  classe: string,
  matiere: string,
  periode: string,
  professeur: string,
  students: BordereauStudent[],
  classAverage: string,
  settings: AppSettings,
  evalConfigs?: EvalConfig[],
  lang?: string
): Promise<jsPDF> => {
  const normLang = normalizeLanguage(lang || getStoredLanguage());
  const tAcad = getAcademicTranslations(normLang);
  const isRtl = isRtlLanguage(normLang);

  const pdfInst = await initI18nPdfDoc({ language: normLang, orientation: 'portrait' });
  const { doc, prepareText, effectiveFont } = pdfInst;
  const pageWidth = doc.internal.pageSize.getWidth();

  // 1. Draw standard internationalized header
  const headerEndY = drawHeader(doc, settings, tAcad.gradeSlipTitle, 20, normLang);

  // 2. Info de base
  doc.setFont(effectiveFont, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(31, 41, 55);

  let y = headerEndY + 6;

  const leftX = isRtl ? pageWidth - 14 : 14;
  const rightX = isRtl ? 14 : pageWidth - 14;
  const leftAlign = isRtl ? 'right' : 'left';
  const rightAlign = isRtl ? 'left' : 'right';

  doc.text(prepareText(`${tAcad.classLabel.toUpperCase()} : ${classe}`), leftX, y, { align: leftAlign } as any);
  doc.text(prepareText(`${tAcad.period.toUpperCase()} : ${periode}`), rightX, y, { align: rightAlign } as any);
  y += 8;
  doc.text(prepareText(`${tAcad.subject.toUpperCase()} : ${matiere}`), leftX, y, { align: leftAlign } as any);
  y += 8;
  doc.text(prepareText(`${tAcad.teacher.toUpperCase()} : ${professeur}`), leftX, y, { align: leftAlign } as any);
  y += 12;

  // 3. Table des notes
  const activeConfigs = (evalConfigs && evalConfigs.length > 0 ? evalConfigs : DEFAULT_EVAL_CONFIGS).filter(c => c.enabled);

  const tableData = students.map((s, index) => [
    index + 1,
    prepareText(`${s.nom} ${s.prenom}`),
    ...(activeConfigs.map(cfg => (s as any)[cfg.id] || '--')),
    s.moyenne
  ]);

  const headers = ['N°', prepareText(tAcad.fullName), ...activeConfigs.map(c => prepareText(c.label)), prepareText(tAcad.average)];

  autoTable(doc, {
    startY: y,
    head: [headers],
    body: tableData,
    theme: 'grid',
    headStyles: {
      font: effectiveFont,
      fillColor: [37, 99, 235],
      textColor: 255,
      fontStyle: 'bold',
      halign: 'center',
      fontSize: 9,
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 15 },
      1: { halign: isRtl ? 'right' : 'left' },
      ...Object.fromEntries(activeConfigs.map((_, i) => [i + 2, { halign: 'center', cellWidth: 25 }])),
      [activeConfigs.length + 2]: { halign: 'center', cellWidth: 25, fontStyle: 'bold', textColor: [220, 38, 38] }
    },
    styles: { font: effectiveFont, fontSize: 9, cellPadding: 3 },
    alternateRowStyles: { fillColor: [249, 250, 251] },
  });

  // 4. Pied de page
  const finalY = ((doc as any).lastAutoTable?.finalY || y + 40) + 10;

  if (classAverage !== '--') {
    doc.setFontSize(11);
    doc.setFont(effectiveFont, 'bold');
    doc.setTextColor(220, 38, 38);
    const avgText = `${tAcad.classAverage.toUpperCase()} : ${classAverage}`;
    doc.text(prepareText(avgText), leftX, finalY, { align: leftAlign } as any);
  }

  // Signature
  doc.setTextColor(31, 41, 55);
  doc.setFontSize(10);
  doc.setFont(effectiveFont, 'normal');
  const sigText = prepareText(tAcad.teacherSignature);
  const sigX = isRtl ? 60 : pageWidth - 60;
  doc.text(sigText, sigX, finalY + 15, { align: 'center' } as any);
  const lineX1 = isRtl ? 14 : pageWidth - 70;
  const lineX2 = isRtl ? 70 : pageWidth - 14;
  doc.line(lineX1, finalY + 30, lineX2, finalY + 30);

  // Date d'impression
  doc.setFontSize(8);
  doc.setFont(effectiveFont, 'italic');
  const now = new Date();
  const dateStr = `${tAcad.generatedOn} ${formatLocalizedDate(now, normLang)} ${tAcad.at} ${now.toLocaleTimeString(normLang === 'ar' ? 'ar-SA' : 'fr-FR')}`;
  doc.text(prepareText(dateStr), leftX, doc.internal.pageSize.getHeight() - 10, { align: leftAlign } as any);

  // Download the PDF if in browser
  const cleanClasse = classe.replace(/[^a-zA-Z0-9_\u0600-\u06FF\u0400-\u04FF\u4e00-\u9fa5]/g, '_');
  const cleanMatiere = matiere.replace(/[^a-zA-Z0-9_\u0600-\u06FF\u0400-\u04FF\u4e00-\u9fa5]/g, '_');
  const filename = `Bordereau_${cleanClasse}_${cleanMatiere}.pdf`;
  if (typeof window !== 'undefined' && doc.save) {
    doc.save(filename);
  }

  return doc;
};
