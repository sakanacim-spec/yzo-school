import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { AppSettings } from '../types';
import { drawHeader } from './pdfUtils';

export interface BordereauStudent {
  nom: string;
  prenom: string;
  noteClasse: string;
  noteDevoir: string;
  noteCompo: string;
  moyenne: string;
}

export const generateBordereauPDF = (
  classe: string,
  matiere: string,
  periode: string,
  professeur: string,
  students: BordereauStudent[],
  classAverage: string,
  settings: AppSettings
) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // 1. Draw standard header
  drawHeader(doc, settings, 'BORDEREAU DE NOTES');

  // 2. Info de base
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(31, 41, 55);

  let y = 70;
  
  doc.text(`CLASSE : ${classe}`, 14, y);
  doc.text(`PÉRIODE : ${periode}`, pageWidth - 14, y, { align: 'right' });
  y += 8;
  doc.text(`MATIÈRE : ${matiere}`, 14, y);
  y += 8;
  doc.text(`PROFESSEUR : ${professeur}`, 14, y);
  y += 12;

  // 3. Table des notes
  const tableData = students.map((s, index) => [
    index + 1,
    `${s.nom} ${s.prenom}`,
    s.noteClasse,
    s.noteDevoir,
    s.noteCompo,
    s.moyenne
  ]);

  (doc as any).autoTable({
    startY: y,
    head: [['N°', 'Nom & Prénom(s)', 'Interro.', 'Devoir', 'Compo.', 'Moyenne']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      0: { halign: 'center', cellWidth: 15 },
      1: { halign: 'left' },
      2: { halign: 'center', cellWidth: 25 },
      3: { halign: 'center', cellWidth: 25 },
      4: { halign: 'center', cellWidth: 25 },
      5: { halign: 'center', cellWidth: 25, fontStyle: 'bold', textColor: [220, 38, 38] }
    },
    styles: { fontSize: 10, cellPadding: 3 },
    alternateRowStyles: { fillColor: [249, 250, 251] },
  });

  // 4. Pied de page
  const finalY = (doc as any).lastAutoTable.finalY + 10;
  
  if (classAverage !== '--') {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(220, 38, 38);
    doc.text(`MOYENNE GÉNÉRALE DE LA CLASSE : ${classAverage}`, 14, finalY);
  }

  // Signature
  doc.setTextColor(31, 41, 55);
  doc.setFontSize(10);
  doc.text('Signature du Professeur', pageWidth - 60, finalY + 15);
  doc.line(pageWidth - 70, finalY + 30, pageWidth - 14, finalY + 30);

  // Date d'impression
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.text(`Imprimé le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`, 14, doc.internal.pageSize.getHeight() - 10);

  // Download the PDF
  const filename = `Bordereau_${classe.replace(/[^a-zA-Z0-9]/g, '_')}_${matiere.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
  doc.save(filename);
};
