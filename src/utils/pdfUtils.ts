import jsPDF from 'jspdf';
import { Student, AppSettings } from '../types';
import { getCycleByClass } from '../data/classes';

const formatMoney = (amount: number, currency: string): string => {
  return new Intl.NumberFormat('fr-FR').format(amount) + ' ' + currency;
};

// Couleurs professionnelles
const COLORS = {
  primary: [37, 99, 235] as [number, number, number],      // Bleu
  success: [22, 163, 74] as [number, number, number],      // Vert
  danger: [220, 38, 38] as [number, number, number],       // Rouge
  warning: [234, 179, 8] as [number, number, number],      // Jaune
  dark: [31, 41, 55] as [number, number, number],          // Gris foncé
  light: [243, 244, 246] as [number, number, number],      // Gris clair
  white: [255, 255, 255] as [number, number, number],
};

// Fonction utilitaire pour dessiner un rectangle arrondi rempli
const drawRoundedRect = (doc: jsPDF, x: number, y: number, w: number, h: number, r: number, color: [number, number, number]) => {
  doc.setFillColor(...color);
  doc.roundedRect(x, y, w, h, r, r, 'F');
};

// En-tête commun pour tous les documents
const drawHeader = (doc: jsPDF, settings: AppSettings, title: string, schoolNameFontSize: number = 20) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Bandeau supérieur
  drawRoundedRect(doc, 0, 0, pageWidth, 45, 0, COLORS.primary);
  
  // Nom de l'école
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(schoolNameFontSize);
  doc.setFont('helvetica', 'bold');
  doc.text(settings.schoolName, pageWidth / 2, 18, { align: 'center' });
  
  // Coordonnées
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`${settings.schoolAddress || settings.adresse || ''} | Tél: ${settings.schoolPhone || settings.telephone || ''}`, pageWidth / 2, 28, { align: 'center' });
  doc.text(`Email: ${settings.schoolEmail || settings.email || ''} | Année scolaire: ${settings.academicYear || settings.schoolYear || settings.anneScolaire || ''}`, pageWidth / 2, 36, { align: 'center' });
  
  // Titre du document
  doc.setTextColor(...COLORS.dark);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(title, pageWidth / 2, 58, { align: 'center' });
  
  // Ligne décorative sous le titre
  doc.setDrawColor(...COLORS.primary);
  doc.setLineWidth(0.8);
  doc.line(pageWidth / 2 - 40, 62, pageWidth / 2 + 40, 62);
  
  return 75; // Position Y après l'en-tête
};

// Pied de page commun
const drawFooter = (doc: jsPDF, pageNum?: number, totalPages?: number) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  doc.setDrawColor(...COLORS.light);
  doc.setLineWidth(0.5);
  doc.line(15, pageHeight - 20, pageWidth - 15, pageHeight - 20);
  
  doc.setFontSize(8);
  doc.setTextColor(128, 128, 128);
  doc.setFont('helvetica', 'normal');
  doc.text(`Document généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`, 15, pageHeight - 12);
  
  if (pageNum && totalPages) {
    doc.text(`Page ${pageNum}/${totalPages}`, pageWidth - 15, pageHeight - 12, { align: 'right' });
  }
  
  doc.text('Signature et cachet:', pageWidth - 60, pageHeight - 12);
};

export const generateReceipt = (student: Student, settings: AppSettings): void => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  let y = drawHeader(doc, settings, 'REÇU DE PAIEMENT', 10);
  
  // Numéro de reçu
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.dark);
  doc.text(`N° ${student.recu || 'REC-' + Date.now()}`, pageWidth - 20, y - 10, { align: 'right' });
  
  // Section Informations Élève
  drawRoundedRect(doc, 15, y, pageWidth - 30, 50, 3, COLORS.light);
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.primary);
  doc.text('INFORMATIONS ÉLÈVE', 25, y + 12);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.dark);
  
  const col1X = 25;
  const col2X = 110;
  let infoY = y + 24;
  
  // Colonne 1
  doc.setFont('helvetica', 'bold');
  doc.text('Nom:', col1X, infoY);
  doc.setFont('helvetica', 'normal');
  doc.text(student.nom, col1X + 25, infoY);
  
  doc.setFont('helvetica', 'bold');
  doc.text('Prénom:', col1X, infoY + 10);
  doc.setFont('helvetica', 'normal');
  doc.text(student.prenom, col1X + 25, infoY + 10);
  
  doc.setFont('helvetica', 'bold');
  doc.text('Classe:', col1X, infoY + 20);
  doc.setFont('helvetica', 'normal');
  doc.text(student.classe, col1X + 25, infoY + 20);
  
  // Colonne 2
  doc.setFont('helvetica', 'bold');
  doc.text('Téléphone:', col2X, infoY);
  doc.setFont('helvetica', 'normal');
  doc.text(student.telephone || 'Non renseigné', col2X + 30, infoY);
  
  doc.setFont('helvetica', 'bold');
  doc.text('Sexe:', col2X, infoY + 10);
  doc.setFont('helvetica', 'normal');
  doc.text(student.sexe === 'F' ? 'Féminin' : 'Masculin', col2X + 30, infoY + 10);
  
  y += 60;
  
  // Section Situation Financière
  drawRoundedRect(doc, 15, y, pageWidth - 30, 55, 3, COLORS.light);
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.primary);
  doc.text('SITUATION FINANCIÈRE', 25, y + 12);
  
  // Tableau financier
  const tableY = y + 20;
  const tableWidth = pageWidth - 50;
  const colWidth = tableWidth / 3;
  
  // En-têtes du tableau
  doc.setFillColor(...COLORS.primary);
  doc.rect(25, tableY, tableWidth, 10, 'F');
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Écolage Total', 25 + colWidth / 2, tableY + 7, { align: 'center' });
  doc.text('Montant Payé', 25 + colWidth + colWidth / 2, tableY + 7, { align: 'center' });
  doc.text('Reste à Payer', 25 + colWidth * 2 + colWidth / 2, tableY + 7, { align: 'center' });
  
  // Valeurs du tableau
  doc.setFillColor(...COLORS.white);
  doc.rect(25, tableY + 10, tableWidth, 15, 'F');
  doc.setTextColor(...COLORS.dark);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(formatMoney(student.ecolage, settings.currency), 25 + colWidth / 2, tableY + 20, { align: 'center' });
  
  doc.setTextColor(...COLORS.success);
  doc.text(formatMoney(student.dejaPaye, settings.currency), 25 + colWidth + colWidth / 2, tableY + 20, { align: 'center' });
  
  if (student.restant === 0) {
    doc.setTextColor(...COLORS.success);
    doc.text('SOLDÉ', 25 + colWidth * 2 + colWidth / 2, tableY + 20, { align: 'center' });
  } else {
    doc.setTextColor(...COLORS.danger);
    doc.text(formatMoney(student.restant, settings.currency), 25 + colWidth * 2 + colWidth / 2, tableY + 20, { align: 'center' });
  }
  
  y += 65;
  
  // Badge et message selon le statut
  if (student.restant === 0) {
    // Badge Parent Responsable
    drawRoundedRect(doc, 25, y, 70, 12, 3, COLORS.success);
    doc.setTextColor(...COLORS.white);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(settings.badgeParentResponsable, 60, y + 8, { align: 'center' });
    
    // Message de remerciement
    y += 20;
    drawRoundedRect(doc, 15, y, pageWidth - 30, 25, 3, [232, 245, 233]);
    doc.setTextColor(...COLORS.success);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'italic');
    const lines = doc.splitTextToSize(settings.messageSolde || settings.messageRemerciement, pageWidth - 50);
    doc.text(lines, 25, y + 10);
    y += 30;
  } else if (student.dejaPaye >= student.ecolage * 0.5) {
    // Badge 2ème Tranche
    drawRoundedRect(doc, 25, y, 70, 12, 3, COLORS.primary);
    doc.setTextColor(...COLORS.white);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(settings.badge2emeTranche, 60, y + 8, { align: 'center' });
    
    y += 20;
    drawRoundedRect(doc, 15, y, pageWidth - 30, 25, 3, [239, 246, 255]);
    doc.setTextColor(...COLORS.primary);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'italic');
    const lines = doc.splitTextToSize(settings.messagePartiel || settings.messageRappel, pageWidth - 50);
    doc.text(lines, 25, y + 10);
    y += 30;
  } else {
    // Message de rappel
    drawRoundedRect(doc, 15, y, pageWidth - 30, 25, 3, [254, 242, 242]);
    doc.setTextColor(...COLORS.danger);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'italic');
    const lines = doc.splitTextToSize(settings.messageNonPaye || settings.messageRappel, pageWidth - 50);
    doc.text(lines, 25, y + 10);
    y += 30;
  }
  
  // Historique des paiements
  if (student.paiements && student.paiements.length > 0) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.primary);
    doc.text('HISTORIQUE DES PAIEMENTS', 25, y + 5);
    y += 12;
    
    // En-tête tableau paiements
    doc.setFillColor(...COLORS.primary);
    doc.rect(25, y, pageWidth - 50, 8, 'F');
    doc.setTextColor(...COLORS.white);
    doc.setFontSize(8);
    doc.text('Date', 30, y + 5.5);
    doc.text('Montant', 70, y + 5.5);
    doc.text('Mode', 110, y + 5.5);
    doc.text('Référence', 145, y + 5.5);
    
    y += 8;
    doc.setTextColor(...COLORS.dark);
    doc.setFont('helvetica', 'normal');
    
    student.paiements.forEach((p, index) => {
      if (index % 2 === 0) {
        doc.setFillColor(...COLORS.light);
        doc.rect(25, y, pageWidth - 50, 7, 'F');
      }
      doc.text(p.date, 30, y + 5);
      doc.text(formatMoney(p.montant, settings.currency), 70, y + 5);
      doc.text(p.mode || '', 110, y + 5);
      doc.text(p.reference || '-', 145, y + 5);
      y += 7;
    });
  }
  
  drawFooter(doc);
  doc.save(`Recu_${student.nom}_${student.prenom}.pdf`);
};

export const generateStudentCard = (student: Student, settings: AppSettings): void => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  let y = drawHeader(doc, settings, 'FICHE FINANCIÈRE ÉLÈVE');
  
  // Avatar simulé
  const avatarColor = student.sexe === 'F' ? [236, 72, 153] as [number, number, number] : COLORS.primary;
  drawRoundedRect(doc, 25, y, 35, 35, 5, avatarColor);
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(`${student.nom.charAt(0)}${student.prenom.charAt(0)}`, 42.5, y + 23, { align: 'center' });
  
  // Nom et classe à côté de l'avatar
  doc.setTextColor(...COLORS.dark);
  doc.setFontSize(16);
  doc.text(`${student.nom} ${student.prenom}`, 70, y + 15);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text(`Classe: ${student.classe} | Cycle: ${getCycleByClass(student.classe)}`, 70, y + 25);
  
  // Badge statut
  if (student.restant === 0) {
    drawRoundedRect(doc, 70, y + 28, 35, 8, 2, COLORS.success);
    doc.setTextColor(...COLORS.white);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('SOLDÉ', 87.5, y + 34, { align: 'center' });
  } else {
    drawRoundedRect(doc, 70, y + 28, 35, 8, 2, COLORS.danger);
    doc.setTextColor(...COLORS.white);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('NON SOLDÉ', 87.5, y + 34, { align: 'center' });
  }
  
  y += 50;
  
  // Informations personnelles
  drawRoundedRect(doc, 15, y, pageWidth - 30, 45, 3, COLORS.light);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.primary);
  doc.text('INFORMATIONS PERSONNELLES', 25, y + 12);
  
  const fields = [
    ['Téléphone', student.telephone || 'Non renseigné'],
    ['Sexe', student.sexe === 'F' ? 'Féminin' : 'Masculin'],
    ['Redoublant', student.redoublant ? 'Oui' : 'Non'],
    ['École de provenance', student.ecoleProvenance || 'Non renseignée'],
  ];
  
  doc.setFontSize(10);
  let fieldY = y + 22;
  fields.forEach((field, index) => {
    const x = index % 2 === 0 ? 25 : 110;
    if (index === 2) fieldY += 10;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.dark);
    doc.text(`${field[0]}:`, x, fieldY);
    doc.setFont('helvetica', 'normal');
    doc.text(field[1], x + 45, fieldY);
  });
  
  y += 55;
  
  // Situation financière détaillée
  drawRoundedRect(doc, 15, y, pageWidth - 30, 60, 3, COLORS.light);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.primary);
  doc.text('SITUATION FINANCIÈRE DÉTAILLÉE', 25, y + 12);
  
  // 3 boîtes pour les montants
  const boxWidth = (pageWidth - 70) / 3;
  const boxY = y + 20;
  
  // Écolage
  drawRoundedRect(doc, 25, boxY, boxWidth, 30, 3, COLORS.white);
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text('Écolage Total', 25 + boxWidth / 2, boxY + 10, { align: 'center' });
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.dark);
  doc.text(formatMoney(student.ecolage, settings.currency), 25 + boxWidth / 2, boxY + 22, { align: 'center' });
  
  // Payé
  drawRoundedRect(doc, 30 + boxWidth, boxY, boxWidth, 30, 3, COLORS.white);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text('Montant Payé', 30 + boxWidth + boxWidth / 2, boxY + 10, { align: 'center' });
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.success);
  doc.text(formatMoney(student.dejaPaye, settings.currency), 30 + boxWidth + boxWidth / 2, boxY + 22, { align: 'center' });
  
  // Restant
  drawRoundedRect(doc, 35 + boxWidth * 2, boxY, boxWidth, 30, 3, COLORS.white);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text('Reste à Payer', 35 + boxWidth * 2 + boxWidth / 2, boxY + 10, { align: 'center' });
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  if (student.restant === 0) {
    doc.setTextColor(...COLORS.success);
    doc.text('SOLDÉ', 35 + boxWidth * 2 + boxWidth / 2, boxY + 22, { align: 'center' });
  } else {
    doc.setTextColor(...COLORS.danger);
    doc.text(formatMoney(student.restant, settings.currency), 35 + boxWidth * 2 + boxWidth / 2, boxY + 22, { align: 'center' });
  }
  
  y += 70;
  
  // Barre de progression
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.dark);
  const taux = Math.round((student.dejaPaye / student.ecolage) * 100);
  doc.text(`Progression du paiement: ${taux}%`, 25, y);
  y += 5;
  
  // Fond de la barre
  drawRoundedRect(doc, 25, y, pageWidth - 50, 8, 2, [229, 231, 235]);
  // Barre de progression
  const progressWidth = ((pageWidth - 50) * Math.min(100, taux)) / 100;
  if (progressWidth > 0) {
    const progressColor = taux >= 100 ? COLORS.success : taux >= 50 ? COLORS.primary : COLORS.warning;
    drawRoundedRect(doc, 25, y, progressWidth, 8, 2, progressColor);
  }
  
  y += 20;
  
  // Historique des paiements
  if (student.paiements && student.paiements.length > 0) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.primary);
    doc.text('HISTORIQUE DES PAIEMENTS', 25, y);
    y += 8;
    
    doc.setFillColor(...COLORS.primary);
    doc.rect(25, y, pageWidth - 50, 8, 'F');
    doc.setTextColor(...COLORS.white);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('Date', 30, y + 5.5);
    doc.text('Montant', 65, y + 5.5);
    doc.text('Mode', 105, y + 5.5);
    doc.text('Référence', 140, y + 5.5);
    doc.text('Commentaire', 175, y + 5.5);
    
    y += 8;
    doc.setTextColor(...COLORS.dark);
    doc.setFont('helvetica', 'normal');
    
    student.paiements.forEach((p, index) => {
      if (index % 2 === 0) {
        doc.setFillColor(...COLORS.light);
        doc.rect(25, y, pageWidth - 50, 7, 'F');
      }
      doc.text(p.date, 30, y + 5);
      doc.setTextColor(...COLORS.success);
      doc.text(formatMoney(p.montant, settings.currency), 65, y + 5);
      doc.setTextColor(...COLORS.dark);
      doc.text(p.mode || '', 105, y + 5);
      doc.text(p.reference || '-', 140, y + 5);
      doc.text((p.commentaire || '-').substring(0, 15), 175, y + 5);
      y += 7;
    });
  }
  
  drawFooter(doc);
  doc.save(`Fiche_${student.nom}_${student.prenom}.pdf`);
};

export const generateClassReport = (students: Student[], className: string, settings: AppSettings): void => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  let y = drawHeader(doc, settings, `RAPPORT FINANCIER - ${className}`);
  
  // Statistiques
  const totalEcolage = students.reduce((sum, s) => sum + s.ecolage, 0);
  const totalPaye = students.reduce((sum, s) => sum + s.dejaPaye, 0);
  const totalRestant = students.reduce((sum, s) => sum + s.restant, 0);
  const soldes = students.filter(s => s.restant === 0).length;
  const taux = totalEcolage > 0 ? Math.round((totalPaye / totalEcolage) * 100) : 0;
  
  // Boîtes de statistiques
  const statBoxWidth = (pageWidth - 50) / 4;
  
  const drawStatBox = (x: number, label: string, value: string, color: [number, number, number]) => {
    drawRoundedRect(doc, x, y, statBoxWidth - 5, 30, 3, COLORS.light);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(label, x + (statBoxWidth - 5) / 2, y + 10, { align: 'center' });
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...color);
    doc.text(value, x + (statBoxWidth - 5) / 2, y + 22, { align: 'center' });
  };
  
  drawStatBox(15, 'Élèves', `${students.length}`, COLORS.primary);
  drawStatBox(15 + statBoxWidth, 'Soldés', `${soldes}`, COLORS.success);
  drawStatBox(15 + statBoxWidth * 2, 'Non Soldés', `${students.length - soldes}`, COLORS.danger);
  drawStatBox(15 + statBoxWidth * 3, 'Taux', `${taux}%`, COLORS.primary);
  
  y += 40;
  
  // Résumé financier
  drawRoundedRect(doc, 15, y, pageWidth - 30, 25, 3, COLORS.light);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.dark);
  doc.text(`Total Attendu: ${formatMoney(totalEcolage, settings.currency)}`, 25, y + 10);
  doc.setTextColor(...COLORS.success);
  doc.text(`Total Payé: ${formatMoney(totalPaye, settings.currency)}`, 25, y + 18);
  doc.setTextColor(...COLORS.danger);
  doc.text(`Total Restant: ${formatMoney(totalRestant, settings.currency)}`, pageWidth / 2, y + 10);
  
  y += 35;
  
  // Tableau des élèves
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.primary);
  doc.text('LISTE DES ÉLÈVES', 15, y);
  y += 8;
  
  // En-tête du tableau
  doc.setFillColor(...COLORS.primary);
  doc.rect(15, y, pageWidth - 30, 10, 'F');
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('N°', 18, y + 7);
  doc.text('Nom & Prénom', 30, y + 7);
  doc.text('Écolage', 90, y + 7);
  doc.text('Payé', 120, y + 7);
  doc.text('Restant', 150, y + 7);
  doc.text('Statut', 180, y + 7);
  
  y += 10;
  let pageNum = 1;
  
  students.forEach((s, index) => {
    if (y > 270) {
      drawFooter(doc, pageNum, Math.ceil(students.length / 30) + 1);
      doc.addPage();
      pageNum++;
      y = 20;
      
      // Réafficher l'en-tête du tableau
      doc.setFillColor(...COLORS.primary);
      doc.rect(15, y, pageWidth - 30, 10, 'F');
      doc.setTextColor(...COLORS.white);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('N°', 18, y + 7);
      doc.text('Nom & Prénom', 30, y + 7);
      doc.text('Écolage', 90, y + 7);
      doc.text('Payé', 120, y + 7);
      doc.text('Restant', 150, y + 7);
      doc.text('Statut', 180, y + 7);
      y += 10;
    }
    
    if (index % 2 === 0) {
      doc.setFillColor(...COLORS.light);
      doc.rect(15, y, pageWidth - 30, 8, 'F');
    }
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.dark);
    doc.text(`${index + 1}`, 18, y + 5.5);
    doc.text(`${s.nom} ${s.prenom}`.substring(0, 30), 30, y + 5.5);
    doc.text(formatMoney(s.ecolage, settings.currency), 90, y + 5.5);
    doc.setTextColor(...COLORS.success);
    doc.text(formatMoney(s.dejaPaye, settings.currency), 120, y + 5.5);
    
    if (s.restant === 0) {
      doc.setTextColor(...COLORS.success);
      doc.text('SOLDÉ', 150, y + 5.5);
      // Badge vert
      drawRoundedRect(doc, 177, y + 1, 16, 6, 1, COLORS.success);
      doc.setTextColor(...COLORS.white);
      doc.setFontSize(6);
      doc.text('OK', 185, y + 5, { align: 'center' });
    } else {
      doc.setTextColor(...COLORS.danger);
      doc.text(formatMoney(s.restant, settings.currency), 150, y + 5.5);
      // Badge rouge
      drawRoundedRect(doc, 177, y + 1, 16, 6, 1, COLORS.danger);
      doc.setTextColor(...COLORS.white);
      doc.setFontSize(6);
      doc.text('DÛ', 185, y + 5, { align: 'center' });
    }
    
    y += 8;
  });
  
  drawFooter(doc, pageNum, pageNum);
  doc.save(`Rapport_${className}.pdf`);
};

export const generateGlobalReport = (students: Student[], settings: AppSettings): void => {
  const doc = new jsPDF('landscape');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  // En-tête personnalisé pour le mode paysage
  drawRoundedRect(doc, 0, 0, pageWidth, 35, 0, COLORS.primary);
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(settings.schoolName, pageWidth / 2, 15, { align: 'center' });
  doc.setFontSize(12);
  doc.text(`RAPPORT FINANCIER GLOBAL - ${settings.academicYear}`, pageWidth / 2, 25, { align: 'center' });
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`, pageWidth / 2, 32, { align: 'center' });
  
  let y = 45;
  
  // Statistiques globales
  const totalEcolage = students.reduce((sum, s) => sum + s.ecolage, 0);
  const totalPaye = students.reduce((sum, s) => sum + s.dejaPaye, 0);
  const totalRestant = students.reduce((sum, s) => sum + s.restant, 0);
  const soldes = students.filter(s => s.restant === 0).length;
  const taux = totalEcolage > 0 ? Math.round((totalPaye / totalEcolage) * 100) : 0;
  
  // 5 boîtes de statistiques
  const statBoxWidth = (pageWidth - 60) / 5;
  
  const drawStatBoxLand = (x: number, label: string, value: string, subValue: string, color: [number, number, number]) => {
    drawRoundedRect(doc, x, y, statBoxWidth - 5, 35, 3, COLORS.light);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(label, x + (statBoxWidth - 5) / 2, y + 10, { align: 'center' });
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...color);
    doc.text(value, x + (statBoxWidth - 5) / 2, y + 22, { align: 'center' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(subValue, x + (statBoxWidth - 5) / 2, y + 30, { align: 'center' });
  };
  
  drawStatBoxLand(15, 'Total Élèves', `${students.length}`, `${soldes} soldés`, COLORS.primary);
  drawStatBoxLand(15 + statBoxWidth, 'Écolage Attendu', formatMoney(totalEcolage, settings.currency), '100%', COLORS.dark);
  drawStatBoxLand(15 + statBoxWidth * 2, 'Total Payé', formatMoney(totalPaye, settings.currency), `${taux}%`, COLORS.success);
  drawStatBoxLand(15 + statBoxWidth * 3, 'Total Restant', formatMoney(totalRestant, settings.currency), `${100 - taux}%`, COLORS.danger);
  drawStatBoxLand(15 + statBoxWidth * 4, 'Taux Recouvrement', `${taux}%`, `${soldes}/${students.length} soldés`, taux >= 80 ? COLORS.success : taux >= 50 ? COLORS.warning : COLORS.danger);
  
  y += 45;
  
  // Statistiques par cycle
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.primary);
  doc.text('RÉPARTITION PAR CYCLE', 15, y);
  y += 8;
  
  const cycles = ['Primaire', 'Collège', 'Lycée'];
  const cycleBoxWidth = (pageWidth - 50) / 3;
  
  cycles.forEach((cycle, index) => {
    const cycleStudents = students.filter(s => getCycleByClass(s.classe) === cycle);
    const cycleEcolage = cycleStudents.reduce((sum, s) => sum + s.ecolage, 0);
    const cyclePaye = cycleStudents.reduce((sum, s) => sum + s.dejaPaye, 0);
    const cycleSoldes = cycleStudents.filter(s => s.restant === 0).length;
    const cycleTaux = cycleEcolage > 0 ? Math.round((cyclePaye / cycleEcolage) * 100) : 0;
    
    const boxX = 15 + index * cycleBoxWidth + index * 5;
    drawRoundedRect(doc, boxX, y, cycleBoxWidth, 40, 3, COLORS.light);
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.primary);
    doc.text(cycle, boxX + cycleBoxWidth / 2, y + 12, { align: 'center' });
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.dark);
    doc.text(`${cycleStudents.length} élèves (${cycleSoldes} soldés)`, boxX + cycleBoxWidth / 2, y + 22, { align: 'center' });
    doc.text(`Payé: ${formatMoney(cyclePaye, settings.currency)}`, boxX + cycleBoxWidth / 2, y + 30, { align: 'center' });
    doc.text(`Taux: ${cycleTaux}%`, boxX + cycleBoxWidth / 2, y + 38, { align: 'center' });
  });
  
  y += 50;
  
  // Tableau par classe
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.primary);
  doc.text('DÉTAIL PAR CLASSE', 15, y);
  y += 8;
  
  // En-tête du tableau
  doc.setFillColor(...COLORS.primary);
  doc.rect(15, y, pageWidth - 30, 10, 'F');
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Classe', 20, y + 7);
  doc.text('Cycle', 55, y + 7);
  doc.text('Élèves', 85, y + 7);
  doc.text('Soldés', 105, y + 7);
  doc.text('Non Soldés', 125, y + 7);
  doc.text('Écolage Total', 155, y + 7);
  doc.text('Total Payé', 195, y + 7);
  doc.text('Total Restant', 235, y + 7);
  doc.text('Taux', 275, y + 7);
  
  y += 10;
  
  // Grouper par classe
  const classesList = [...new Set(students.map(s => s.classe))].sort();
  let pageNum = 1;
  
  classesList.forEach((classe, index) => {
    if (y > pageHeight - 25) {
      doc.setFontSize(8);
      doc.setTextColor(128, 128, 128);
      doc.text(`Page ${pageNum}`, pageWidth - 20, pageHeight - 10, { align: 'right' });
      doc.addPage();
      pageNum++;
      y = 20;
      
      // Réafficher l'en-tête
      doc.setFillColor(...COLORS.primary);
      doc.rect(15, y, pageWidth - 30, 10, 'F');
      doc.setTextColor(...COLORS.white);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('Classe', 20, y + 7);
      doc.text('Cycle', 55, y + 7);
      doc.text('Élèves', 85, y + 7);
      doc.text('Soldés', 105, y + 7);
      doc.text('Non Soldés', 125, y + 7);
      doc.text('Écolage Total', 155, y + 7);
      doc.text('Total Payé', 195, y + 7);
      doc.text('Total Restant', 235, y + 7);
      doc.text('Taux', 275, y + 7);
      y += 10;
    }
    
    const classStudents = students.filter(s => s.classe === classe);
    const classEcolage = classStudents.reduce((sum, s) => sum + s.ecolage, 0);
    const classPaye = classStudents.reduce((sum, s) => sum + s.dejaPaye, 0);
    const classRestant = classStudents.reduce((sum, s) => sum + s.restant, 0);
    const classSoldes = classStudents.filter(s => s.restant === 0).length;
    const classTaux = classEcolage > 0 ? Math.round((classPaye / classEcolage) * 100) : 0;
    
    if (index % 2 === 0) {
      doc.setFillColor(...COLORS.light);
      doc.rect(15, y, pageWidth - 30, 8, 'F');
    }
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.dark);
    doc.text(classe, 20, y + 5.5);
    doc.text(getCycleByClass(classe), 55, y + 5.5);
    doc.text(`${classStudents.length}`, 90, y + 5.5);
    doc.setTextColor(...COLORS.success);
    doc.text(`${classSoldes}`, 110, y + 5.5);
    doc.setTextColor(...COLORS.danger);
    doc.text(`${classStudents.length - classSoldes}`, 130, y + 5.5);
    doc.setTextColor(...COLORS.dark);
    doc.text(formatMoney(classEcolage, settings.currency), 155, y + 5.5);
    doc.setTextColor(...COLORS.success);
    doc.text(formatMoney(classPaye, settings.currency), 195, y + 5.5);
    doc.setTextColor(...COLORS.danger);
    doc.text(formatMoney(classRestant, settings.currency), 235, y + 5.5);
    
    // Badge taux
    const tauxColor = classTaux >= 80 ? COLORS.success : classTaux >= 50 ? COLORS.warning : COLORS.danger;
    drawRoundedRect(doc, 272, y + 1, 15, 6, 1, tauxColor);
    doc.setTextColor(...COLORS.white);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text(`${classTaux}%`, 279.5, y + 5, { align: 'center' });
    
    y += 8;
  });
  
  // Ligne totale
  y += 3;
  doc.setFillColor(...COLORS.primary);
  doc.rect(15, y, pageWidth - 30, 10, 'F');
  doc.setTextColor(...COLORS.white);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL', 20, y + 7);
  doc.text(`${students.length}`, 90, y + 7);
  doc.text(`${soldes}`, 110, y + 7);
  doc.text(`${students.length - soldes}`, 130, y + 7);
  doc.text(formatMoney(totalEcolage, settings.currency), 155, y + 7);
  doc.text(formatMoney(totalPaye, settings.currency), 195, y + 7);
  doc.text(formatMoney(totalRestant, settings.currency), 235, y + 7);
  doc.text(`${taux}%`, 277, y + 7);
  
  // Pied de page
  doc.setFontSize(8);
  doc.setTextColor(128, 128, 128);
  doc.setFont('helvetica', 'normal');
  doc.text(`Page ${pageNum}`, pageWidth - 20, pageHeight - 10, { align: 'right' });
  doc.text(`Document généré le ${new Date().toLocaleDateString('fr-FR')}`, 15, pageHeight - 10);
  
  doc.save('Rapport_Global.pdf');
};
