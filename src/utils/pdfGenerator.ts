// ============================================================
// GÉNÉRATEUR PDF — jsPDF + jspdf-autotable
// Mise en forme professionnelle et institutionnelle
// LOGIQUE MÉTIER INCHANGÉE — seule la présentation est améliorée
// ============================================================
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Student } from '../types';

// ── Utilitaires (inchangés) ──────────────────────────────────
const fmtMoney = (n: number) => new Intl.NumberFormat('fr-FR').format(n).replace(/\s/g, '.') + ' FCFA';
const fmtDate = (d?: string) => {
  const date = d ? new Date(d) : new Date();
  return date.toLocaleDateString('fr-FR').replace(/\//g, '.');
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

// Génère un numéro de document formaté : YZO-2026-XXXXX
const genDocNumber = (student: Student): string => {
  const year = new Date().getFullYear();
  const id = String(student.id || Math.floor(Math.random() * 99999)).padStart(5, '0');
  return `YZO-${year}-${id}`;
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
  schoolNameFontSize: number = 18
): number => {
  const w = doc.internal.pageSize.getWidth();
  let y = 14;

  doc.setTextColor(0, 0, 0);
  doc.setFont('times', 'bold');

  // 1. SCEAU (Extrême Gauche - Réduit et poussé)
  if (schoolStamp) {
      try {
          doc.addImage(schoolStamp, 'PNG', 8, y, 18, 18);
      } catch(e) {}
  }

  // 2. TEXTE CENTRAL (Flex-like spacing - SATURÉ)
  const centerX = w / 2;
  
  // Bloc Ministère (Centre-Gauche)
  doc.setFontSize(10);
  doc.text('RÉPUBLIQUE TOGOLAISE', centerX - 35, y, { align: 'center' });
  doc.setFont('times', 'italic');
  doc.setFontSize(8);
  doc.text('Travail - Liberté - Patrie', centerX - 35, y + 5, { align: 'center' });
  doc.setLineWidth(0.3);
  doc.line(centerX - 42, y + 7, centerX - 28, y + 7);
  doc.setFont('times', 'bold');
  doc.setFontSize(10.5);
  doc.text('MINISTERE DE L\'EDUCATION NATIONALE', centerX - 35, y + 13, { align: 'center' });
  doc.setFontSize(9.5);
  doc.text('DIRECTION RÉGIONALE DE L\'ÉDUCATION', centerX - 35, y + 18, { align: 'center' });
  doc.text('INSPECTION DE L\'ENSEIGNEMENT GENERAL', centerX - 35, y + 23, { align: 'center' });

  // Bloc Établissement (Centre-Droite)
  doc.setFontSize(schoolNameFontSize);
  doc.setFont('times', 'bold');
  doc.text(schoolName.toUpperCase(), centerX + 35, y, { align: 'center' });
  doc.setFontSize(11);
  doc.setFont('times', 'italic');
  doc.text('Travail-Rigueur-Succès', centerX + 35, y + 7, { align: 'center' });
  doc.setFont('times', 'bold');
  doc.setFontSize(10);
  doc.text('Tél: +228 90 17 79 66 / 99 41 40 47', centerX + 35, y + 14, { align: 'center' });
  doc.text('BP: 80159 Apéssito - TOGO', centerX + 35, y + 19, { align: 'center' });

  // 3. LOGO (Extrême Droite - Réduit et poussé)
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
  doc.setFont('times', 'bold');
  doc.text(title, w / 2, y, { align: 'center' });
  y += 7;
  doc.setFontSize(11);
  doc.setFont('times', 'normal');
  doc.text(`Année scolaire : ${schoolYear}`, w / 2, y, { align: 'center' });
  
  y += 10;
  doc.setFontSize(10);
  doc.text(`Fait à Apéssito, le ${fmtDate()}`, 14, y);
  doc.text(`N° : ${docNumber}`, w - 14, y, { align: 'right' });
  
  y += 5;
  doc.setLineWidth(0.2);
  doc.line(14, y, w - 14, y);

  return y + 10;
};

// ── BLOC ÉLÈVE EN DEUX COLONNES ───────────────────────────────
const drawStudentBlock = (
  doc: jsPDF,
  student: Student,
  startY: number
): number => {
  const pageW = doc.internal.pageSize.getWidth();
  const blockH = 44;
  const margin = 14;
  const colW = (pageW - margin * 2) / 2 - 4;

  // Fond gris très clair avec bordure
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, startY, pageW - margin * 2, blockH, 3, 3, 'FD');

  // Bande titre "INFORMATIONS ÉLÈVE"
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(margin, startY, pageW - margin * 2, 8, 3, 3, 'F');
  doc.rect(margin, startY + 5, pageW - margin * 2, 3, 'F'); // carré bas pour coins droits
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont('times', 'bold');
  doc.text('INFORMATIONS DE L\'ÉLÈVE', pageW / 2, startY + 5.5, { align: 'center' });

  // Contenu deux colonnes
  const leftX = margin + 5;
  const rightX = margin + colW + 12;
  let rowY = startY + 14;
  const rowH = 6;

  const leftInfos: [string, string][] = [
    ['Nom complet', `${student.prenom} ${student.nom}`],
    ['Classe', student.classe],
    ['Cycle', student.cycle],
    ['Sexe', student.sexe === 'M' ? 'Masculin' : 'Féminin'],
  ];
  const rightInfos: [string, string][] = [
    ['Redoublant', student.redoublant ? 'Oui' : 'Non'],
    ['Téléphone parent', student.telephone],
    ['École de provenance', student.ecoleProvenance || 'N/A'],
    ['N° Reçu', student.recu || '—'],
  ];

  leftInfos.forEach(([label, val]) => {
    doc.setFont('times', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`${label} :`, leftX, rowY);
    doc.setFont('times', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(val, leftX + 36, rowY);
    rowY += rowH;
  });

  rowY = startY + 14;
  rightInfos.forEach(([label, val]) => {
    doc.setFont('times', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`${label} :`, rightX, rowY);
    doc.setFont('times', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(val, rightX + 38, rowY);
    rowY += rowH;
  });

  // Ligne verticale séparatrice au centre du bloc
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
  startY: number
): number => {
  // Titre section
  doc.setFontSize(8);
  doc.setFont('times', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('SITUATION FINANCIÈRE', 14, startY);
  doc.setDrawColor(37, 99, 235);
  doc.setLineWidth(0.5);
  doc.line(14, startY + 1.5, 70, startY + 1.5);

  autoTable(doc, {
    startY: startY + 5,
    head: [['Désignation', 'Montant (FCFA)']],
    body: [
      ['Écolage annuel dû', fmtMoney(student.ecolage)],
      ['Montant déjà réglé', fmtMoney(student.dejaPaye)],
      ['Solde restant à payer', student.restant <= 0 ? 'SOLDÉ ✓' : fmtMoney(student.restant)],
    ],
    styles: {
      fontSize: 10,
      cellPadding: { top: 5, bottom: 5, left: 8, right: 8 },
      font: 'times',
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

  return (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
};

// ── BADGE STATUT ENCADRÉ ──────────────────────────────────────
const drawStatusBadge = (
  doc: jsPDF,
  student: Student,
  startY: number
): number => {
  const w = doc.internal.pageSize.getWidth();
  const [r, g, b] = getBadgeColor(student);
  const label = getBadgeLabel(student);

  // Fond coloré avec bordure
  doc.setFillColor(r, g, b);
  doc.setDrawColor(r, g, b);
  doc.setLineWidth(0.5);
  doc.roundedRect(14, startY, w - 28, 13, 3, 3, 'FD');

  // Icône carré blanc à gauche
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(19, startY + 3, 7, 7, 1, 1, 'F');

  // Texte statut
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('times', 'bold');
  doc.text(label, w / 2, startY + 8.5, { align: 'center' });

  doc.setTextColor(0, 0, 0);
  return startY + 18;
};

// ── MESSAGE INSTITUTIONNEL ────────────────────────────────────
const drawMessage = (
  doc: jsPDF,
  student: Student,
  message: string,
  startY: number
): number => {
  const w = doc.internal.pageSize.getWidth();
  const isSolde = student.restant <= 0;

  // Fond adapté au statut
  if (isSolde) {
    doc.setFillColor(240, 253, 244);
    doc.setDrawColor(187, 247, 208);
  } else {
    doc.setFillColor(255, 251, 235);
    doc.setDrawColor(253, 230, 138);
  }
  doc.setLineWidth(0.4);

  const lines = doc.splitTextToSize(message, w - 44);
  const boxH = lines.length * 5 + 10;
  doc.roundedRect(14, startY, w - 28, boxH, 3, 3, 'FD');

  // Barre colorée à gauche
  doc.setFillColor(isSolde ? 22 : 234, isSolde ? 163 : 88, isSolde ? 74 : 12);
  doc.rect(14, startY, 3, boxH, 'F');

  doc.setTextColor(isSolde ? 20 : 120, isSolde ? 83 : 53, isSolde ? 45 : 15);
  doc.setFontSize(8.5);
  doc.setFont('times', 'normal');
  doc.text(lines, 22, startY + 7);

  doc.setTextColor(0, 0, 0);
  return startY + boxH + 10;
};

// ── ZONE SIGNATURES PROFESSIONNELLE ──────────────────────────
const drawSignatureZone = (doc: jsPDF, startY: number): void => {
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
  doc.setFont('times', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text('Signature du Parent / Tuteur', leftX + sigWidth / 2, startY + 6, { align: 'center' });
  doc.setDrawColor(210, 218, 230);
  doc.line(leftX + 8, startY + 22, leftX + sigWidth - 8, startY + 22);
  doc.setFont('times', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text('Signature', leftX + sigWidth / 2, startY + 26, { align: 'center' });

  // Bloc cachet droite (établissement)
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(rightX, startY, sigWidth, 28, 2, 2, 'FD');
  doc.setFontSize(7.5);
  doc.setFont('times', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text("Cachet de l'Établissement", rightX + sigWidth / 2, startY + 6, { align: 'center' });
  // Cercle cachet
  doc.setDrawColor(200, 210, 225);
  doc.setLineWidth(0.5);
  doc.circle(rightX + sigWidth / 2, startY + 17, 7, 'D');
  doc.setFontSize(5.5);
  doc.setTextColor(180, 190, 205);
  doc.text('CACHET', rightX + sigWidth / 2, startY + 18, { align: 'center' });
};

// ── PIED DE PAGE DISCRET ──────────────────────────────────────
const drawFooter = (doc: jsPDF, schoolName: string): void => {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const pages = doc.getNumberOfPages();

  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);

    // Bande accent bas
    doc.setFillColor(37, 99, 235);
    doc.rect(0, h - 10, w, 1.5, 'F');

    // Fond pied de page
    doc.setFillColor(15, 23, 42);
    doc.rect(0, h - 8.5, w, 8.5, 'F');

    doc.setTextColor(148, 163, 184);
    doc.setFontSize(6.5);
    doc.setFont('times', 'normal');
    doc.text(schoolName.toUpperCase(), 14, h - 3.5);
    doc.text(`Document généré le ${fmtDate()} — Confidentiel`, w / 2, h - 3.5, { align: 'center' });
    doc.text(`Page ${i} sur ${pages}`, w - 14, h - 3.5, { align: 'right' });
  }
  doc.setTextColor(0, 0, 0);
};

// ══════════════════════════════════════════════════════════════
// REÇU INDIVIDUEL OFFICIEL
// ══════════════════════════════════════════════════════════════
export const generateRecuPDF = (
  student: Student,
  schoolName: string,
  schoolYear: string,
  messageRemerciement: string,
  messageRappel: string,
  schoolLogo?: string,
  schoolStamp?: string
): void => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const docNumber = genDocNumber(student);
  const h = doc.internal.pageSize.getHeight();

  // En-tête officiel centré
  let y = drawOfficialHeader(doc, schoolName, schoolYear, 'RÉCAPITULATIF FINANCIER DE SCOLARITÉ', docNumber, schoolLogo, schoolStamp, 10);

  // Bloc élève deux colonnes
  y = drawStudentBlock(doc, student, y);

  // Tableau financier professionnel
  y = drawFinanceTable(doc, student, y);

  // Encadré statut coloré
  y = drawStatusBadge(doc, student, y);

  // Message institutionnel adapté au statut
  const message = student.restant <= 0 ? messageRemerciement : messageRappel;
  y = drawMessage(doc, student, message, y);

  // Zone signatures (fixée en bas si assez de place, sinon positionnée dynamiquement)
  const sigY = Math.max(y + 6, h - 55);
  drawSignatureZone(doc, sigY);

  // Pied de page
  drawFooter(doc, schoolName);

  doc.save(`fiche_${student.nom}_${student.prenom}_${student.classe}.pdf`);
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
  const docNumber = `YZO-${new Date().getFullYear()}-CL${classe.replace(/\s/g, '').toUpperCase()}`;

  let y = drawOfficialHeader(doc, schoolName, schoolYear, `LISTE FINANCIÈRE — ${classe.toUpperCase()}`, docNumber, schoolLogo, schoolStamp);

  // Statistiques condensées sur une ligne
  const totalEcolage = students.reduce((a, s) => a + s.ecolage, 0);
  const totalPaye = students.reduce((a, s) => a + s.dejaPaye, 0);
  const totalRestant = students.reduce((a, s) => a + s.restant, 0);
  const taux = totalEcolage > 0 ? Math.round((totalPaye / totalEcolage) * 100) : 0;
  const nbSoldes = students.filter(s => s.restant <= 0).length;

  // Bandeau résumé compact
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(10, y, w - 20, 10, 2, 2, 'FD');
  doc.setFontSize(8);
  doc.setFont('times', 'bold');
  doc.setTextColor(15, 23, 42);
  const summary = `Effectif: ${students.length}  |  Écolage: ${fmtMoney(totalEcolage)}  |  Perçu: ${fmtMoney(totalPaye)}  |  Restant: ${fmtMoney(totalRestant)}  |  Taux: ${taux}%  |  Soldés: ${nbSoldes}`;
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
      fmtMoney(s.ecolage),
      fmtMoney(s.dejaPaye),
      s.restant <= 0 ? 'SOLDÉ' : fmtMoney(s.restant),
      s.status,
    ]),
    foot: [[
      '',
      'TOTAL',
      `${students.length} élèves`,
      '',
      '',
      fmtMoney(totalEcolage),
      fmtMoney(totalPaye),
      fmtMoney(totalRestant),
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
export const generateNonSoldesPDF = (
  students: Student[],
  schoolName: string,
  schoolYear: string,
  messageRappel: string,
  schoolLogo?: string,
  schoolStamp?: string
): void => {
  if (!students.length) return;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const w = doc.internal.pageSize.getWidth();
  const docNumber = `YZO-${new Date().getFullYear()}-NONSOL`;

  let y = drawOfficialHeader(doc, schoolName, schoolYear, 'LISTE DES ÉLÈVES NON SOLDÉS — RAPPEL DE PAIEMENT', docNumber, schoolLogo, schoolStamp);

  // Encadré rappel institutionnel
  doc.setFillColor(255, 241, 242);
  doc.setDrawColor(254, 205, 211);
  doc.setLineWidth(0.4);
  const msgLines = doc.splitTextToSize(messageRappel, w - 44);
  const boxH = msgLines.length * 5 + 14;
  doc.roundedRect(14, y, w - 28, boxH, 3, 3, 'FD');
  // Barre rouge gauche
  doc.setFillColor(220, 38, 38);
  doc.rect(14, y, 3, boxH, 'F');
  doc.setTextColor(159, 18, 57);
  doc.setFontSize(8);
  doc.setFont('times', 'bold');
  doc.text('⚠ AVIS DE RAPPEL OFFICIEL', 22, y + 7);
  doc.setFont('times', 'normal');
  doc.setFontSize(7.5);
  doc.text(msgLines, 22, y + 13);
  doc.setTextColor(0, 0, 0);
  y += boxH + 6;

  // Statistiques rapides
  const totalEcolage = students.reduce((a, s) => a + s.ecolage, 0);
  const totalPaye = students.reduce((a, s) => a + s.dejaPaye, 0);
  const totalRestant = students.reduce((a, s) => a + s.restant, 0);

  doc.setFillColor(254, 242, 242);
  doc.setDrawColor(254, 205, 211);
  doc.roundedRect(14, y, w - 28, 10, 2, 2, 'FD');
  doc.setFontSize(8);
  doc.setFont('times', 'bold');
  doc.setTextColor(153, 27, 27);
  doc.text(
    `${students.length} élève(s) non soldé(s)  ·  Restant total : ${fmtMoney(totalRestant)}  ·  Perçu : ${fmtMoney(totalPaye)}  ·  Attendu : ${fmtMoney(totalEcolage)}`,
    w / 2, y + 6.5, { align: 'center' }
  );
  doc.setTextColor(0, 0, 0);
  y += 16;

  autoTable(doc, {
    startY: y,
    head: [['#', 'Nom & Prénom', 'Classe', 'Cycle', 'Téléphone', 'Écolage', 'Payé', 'Restant', 'Taux %', 'Statut']],
    body: students.map((s, i) => {
      const taux = s.ecolage > 0 ? Math.round((s.dejaPaye / s.ecolage) * 100) : 0;
      return [
        i + 1,
        `${s.prenom} ${s.nom}`,
        s.classe,
        s.cycle,
        s.telephone,
        fmtMoney(s.ecolage),
        fmtMoney(s.dejaPaye),
        fmtMoney(s.restant),
        `${taux}%`,
        s.status,
      ];
    }),
    foot: [['', `TOTAL — ${students.length} élève(s)`, '', '', '',
      fmtMoney(totalEcolage),
      fmtMoney(totalPaye),
      fmtMoney(totalRestant),
      '', '',
    ]],
    styles: {
      fontSize: 8,
      cellPadding: { top: 3.5, bottom: 3.5, left: 4, right: 4 },
      font: 'times',
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
        const val = String(data.cell.raw);
        if (val === 'Partiel') data.cell.styles.textColor = [202, 138, 4];
        else data.cell.styles.textColor = [220, 38, 38];
      }
    },
    alternateRowStyles: { fillColor: [255, 251, 235] },
    margin: { left: 10, right: 10 },
  });

  drawFooter(doc, schoolName);
  doc.save(`non_soldes_${schoolYear}.pdf`);
};
