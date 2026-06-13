import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Student, AdminSettings } from '../types';
import { getStatusPaiement, getStatusLabel, formatMontant } from './helpers';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface jsPDFWithAutoTable extends jsPDF {
  lastAutoTable: { finalY: number };
}

const formatDate = (date: Date = new Date()): string => {
  return format(date, 'dd MMMM yyyy', { locale: fr });
};

export const generateReceipt = (student: Student, settings: AdminSettings): void => {
  const doc = new jsPDF() as jsPDFWithAutoTable;
  const status = getStatusPaiement(student, settings.seuilDeuxiemeTranche);
  
  // Header
  doc.setFillColor(0, 51, 102);
  doc.rect(0, 0, 210, 40, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(settings.nomEcole || settings.schoolName, 105, 18, { align: 'center' });
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`${settings.adresse || ''} | ${settings.telephone || ''}`, 105, 28, { align: 'center' });
  doc.text(`Année scolaire: ${settings.anneScolaire || settings.schoolYear}`, 105, 35, { align: 'center' });
  
  // Title
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('REÇU DE PAIEMENT', 105, 55, { align: 'center' });
  
  // Receipt number & date
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`N° Reçu: ${student.recu || 'REC-' + Date.now()}`, 20, 65);
  doc.text(`Date: ${formatDate()}`, 150, 65);
  
  // Student info
  doc.setFillColor(245, 245, 245);
  doc.rect(15, 72, 180, 35, 'F');
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('INFORMATIONS ÉLÈVE', 20, 82);
  
  doc.setFont('helvetica', 'normal');
  doc.text(`Nom complet: ${student.nom} ${student.prenom}`, 20, 92);
  doc.text(`Classe: ${student.classe} (${student.cycle})`, 20, 100);
  doc.text(`Téléphone parent: ${student.telephone}`, 120, 92);
  doc.text(`Sexe: ${student.sexe === 'M' ? 'Masculin' : 'Féminin'}`, 120, 100);
  
  // Financial details
  autoTable(doc, {
    startY: 115,
    head: [['Description', 'Montant']],
    body: [
      ['Frais de scolarité', formatMontant(student.ecolage)],
      ['Montant déjà payé', formatMontant(student.dejaPaye)],
      ['Reste à payer', student.restant === 0 ? 'SOLDÉ' : formatMontant(student.restant)]
    ],
    styles: {
      fontSize: 11,
      cellPadding: 8
    },
    headStyles: {
      fillColor: [0, 51, 102],
      textColor: 255,
      fontStyle: 'bold'
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245]
    },
    columnStyles: {
      0: { cellWidth: 100 },
      1: { cellWidth: 70, halign: 'right' }
    }
  });
  
  const finalY = doc.lastAutoTable.finalY + 10;
  
  // Status badge
  let badgeColor: [number, number, number];
  let badgeText: string;
  
  switch (status) {
    case 'solde':
      badgeColor = [34, 197, 94];
      badgeText = '✓ PARENT RESPONSABLE - ÉLÈVE SOLDÉ';
      break;
    case 'tranche_validee':
      badgeColor = [59, 130, 246];
      badgeText = '✓ 2ÈME TRANCHE VALIDÉE';
      break;
    case 'tranche_partielle':
      badgeColor = [234, 179, 8];
      badgeText = 'TRANCHE PARTIELLE - NON SOLDÉ';
      break;
    default:
      badgeColor = [239, 68, 68];
      badgeText = 'NON SOLDÉ';
  }
  
  doc.setFillColor(...badgeColor);
  doc.roundedRect(45, finalY, 120, 12, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(badgeText, 105, finalY + 8, { align: 'center' });
  
  // Message
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'italic');
  
  const message = status === 'solde' || status === 'tranche_validee' 
    ? settings.messageRemerciement 
    : settings.messageRappel;
  
  const splitMessage = doc.splitTextToSize(message, 170);
  doc.text(splitMessage, 20, finalY + 25);
  
  // Payment history
  const history = student.paiements || student.historiquesPaiements || [];
  if (history.length > 0) {
    autoTable(doc, {
      startY: finalY + 45,
      head: [['Date', 'Montant', 'Méthode', 'Référence']],
      body: history.map(p => [
        format(new Date(p.date), 'dd/MM/yyyy'),
        formatMontant(p.montant),
        p.methode || p.mode || '',
        p.reference || ''
      ]),
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [100, 116, 139], fontStyle: 'bold' }
    });
  }
  
  // Footer
  doc.setFillColor(0, 51, 102);
  doc.rect(0, 275, 210, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.text(`${settings.nomEcole} - ${settings.adresse}`, 105, 283, { align: 'center' });
  doc.text(`Document généré le ${formatDate()} - Ce reçu fait foi de paiement`, 105, 290, { align: 'center' });
  
  doc.save(`Recu_${student.nom}_${student.prenom}.pdf`);
};

export const generateStudentCard = (student: Student, settings: AdminSettings): void => {
  const doc = new jsPDF() as jsPDFWithAutoTable;
  const status = getStatusPaiement(student, settings.seuilDeuxiemeTranche);
  const pourcentage = Math.round((student.dejaPaye / student.ecolage) * 100);
  
  // Header
  doc.setFillColor(0, 51, 102);
  doc.rect(0, 0, 210, 45, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text(settings.nomEcole || settings.schoolName, 105, 20, { align: 'center' });
  
  doc.setFontSize(12);
  doc.text('FICHE FINANCIÈRE ÉLÈVE', 105, 32, { align: 'center' });
  doc.setFontSize(10);
  doc.text(`Année scolaire: ${settings.anneScolaire || settings.schoolYear}`, 105, 40, { align: 'center' });
  
  // Student photo placeholder
  doc.setFillColor(220, 220, 220);
  doc.rect(155, 55, 40, 50, 'F');
  doc.setTextColor(150, 150, 150);
  doc.setFontSize(8);
  doc.text('PHOTO', 175, 82, { align: 'center' });
  
  // Student details
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(`${student.nom} ${student.prenom}`, 20, 62);
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  
  const infoY = 75;
  const lineHeight = 8;
  
  doc.text(`Classe: ${student.classe}`, 20, infoY);
  doc.text(`Cycle: ${student.cycle}`, 20, infoY + lineHeight);
  doc.text(`Sexe: ${student.sexe === 'M' ? 'Masculin' : 'Féminin'}`, 20, infoY + lineHeight * 2);
  doc.text(`Redoublant: ${student.redoublant ? 'Oui' : 'Non'}`, 20, infoY + lineHeight * 3);
  doc.text(`Téléphone: ${student.telephone}`, 20, infoY + lineHeight * 4);
  doc.text(`École d'origine: ${student.ecoleProvenance || 'N/A'}`, 20, infoY + lineHeight * 5);
  
  // Financial summary box
  doc.setFillColor(245, 247, 250);
  doc.rect(15, 130, 180, 50, 'F');
  doc.setDrawColor(0, 51, 102);
  doc.setLineWidth(0.5);
  doc.rect(15, 130, 180, 50, 'S');
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('SITUATION FINANCIÈRE', 105, 142, { align: 'center' });
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`Frais de scolarité:`, 25, 155);
  doc.text(formatMontant(student.ecolage), 180, 155, { align: 'right' });
  
  doc.text(`Montant payé:`, 25, 165);
  doc.setTextColor(34, 197, 94);
  doc.text(formatMontant(student.dejaPaye), 180, 165, { align: 'right' });
  
  doc.setTextColor(0, 0, 0);
  doc.text(`Reste à payer:`, 25, 175);
  doc.setTextColor(student.restant > 0 ? 239 : 34, student.restant > 0 ? 68 : 197, student.restant > 0 ? 68 : 94);
  doc.text(student.restant === 0 ? 'SOLDÉ' : formatMontant(student.restant), 180, 175, { align: 'right' });
  
  // Progress bar
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.text(`Taux de paiement: ${pourcentage}%`, 20, 195);
  
  doc.setFillColor(229, 231, 235);
  doc.rect(20, 200, 170, 8, 'F');
  
  const progressColor: [number, number, number] = pourcentage >= 100 ? [34, 197, 94] : pourcentage >= 70 ? [59, 130, 246] : [234, 179, 8];
  doc.setFillColor(...progressColor);
  doc.rect(20, 200, Math.min(170, (pourcentage / 100) * 170), 8, 'F');
  
  // Status badge
  let badgeColor: [number, number, number];
  switch (status) {
    case 'solde': badgeColor = [34, 197, 94]; break;
    case 'tranche_validee': badgeColor = [59, 130, 246]; break;
    case 'tranche_partielle': badgeColor = [234, 179, 8]; break;
    default: badgeColor = [239, 68, 68];
  }
  
  doc.setFillColor(...badgeColor);
  doc.roundedRect(60, 215, 90, 12, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(getStatusLabel(status), 105, 223, { align: 'center' });
  
  // Payment history
  const history = student.paiements || student.historiquesPaiements || [];
  if (history.length > 0) {
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('HISTORIQUE DES PAIEMENTS', 20, 240);
    
    autoTable(doc, {
      startY: 245,
      head: [['Date', 'Montant', 'Méthode', 'Référence']],
      body: history.map(p => [
        format(new Date(p.date), 'dd/MM/yyyy'),
        formatMontant(p.montant),
        p.methode || p.mode || '',
        p.reference || ''
      ]),
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [0, 51, 102], fontStyle: 'bold' },
      margin: { left: 20, right: 20 }
    });
  }
  
  // Footer
  doc.setFillColor(0, 51, 102);
  doc.rect(0, 280, 210, 17, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.text(`${settings.nomEcole || settings.schoolName} | ${settings.adresse || ''} | ${settings.telephone || ''}`, 105, 288, { align: 'center' });
  doc.text(`Document généré le ${formatDate()}`, 105, 294, { align: 'center' });
  
  doc.save(`Fiche_${student.nom}_${student.prenom}.pdf`);
};

export const generateClassReport = (students: Student[], classe: string, settings: AdminSettings): void => {
  const doc = new jsPDF('landscape') as jsPDFWithAutoTable;
  const classStudents = students.filter(s => s.classe === classe);
  
  // Header
  doc.setFillColor(0, 51, 102);
  doc.rect(0, 0, 297, 30, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(settings.nomEcole || settings.schoolName, 148.5, 12, { align: 'center' });
  doc.setFontSize(12);
  doc.text(`Rapport Financier - Classe ${classe} - ${settings.anneScolaire || settings.schoolYear}`, 148.5, 23, { align: 'center' });
  
  // Summary
  const totalEcolage = classStudents.reduce((sum, s) => sum + s.ecolage, 0);
  const totalPaye = classStudents.reduce((sum, s) => sum + s.dejaPaye, 0);
  const totalRestant = classStudents.reduce((sum, s) => sum + s.restant, 0);
  const taux = totalEcolage > 0 ? Math.round((totalPaye / totalEcolage) * 100) : 0;
  
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.text(`Effectif: ${classStudents.length} élèves | Total attendu: ${formatMontant(totalEcolage)} | Payé: ${formatMontant(totalPaye)} | Restant: ${formatMontant(totalRestant)} | Taux: ${taux}%`, 148.5, 40, { align: 'center' });
  
  // Table
  autoTable(doc, {
    startY: 48,
    head: [['N°', 'Nom', 'Prénom', 'Sexe', 'Écolage', 'Payé', 'Restant', 'Taux', 'Statut']],
    body: classStudents.map((s, i) => {
      const status = getStatusPaiement(s, settings.seuilDeuxiemeTranche);
      const pct = Math.round((s.dejaPaye / s.ecolage) * 100);
      return [
        i + 1,
        s.nom,
        s.prenom,
        s.sexe,
        formatMontant(s.ecolage),
        formatMontant(s.dejaPaye),
        s.restant === 0 ? 'SOLDÉ' : formatMontant(s.restant),
        `${pct}%`,
        getStatusLabel(status)
      ];
    }),
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [0, 51, 102], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 12 },
      1: { cellWidth: 35 },
      2: { cellWidth: 35 },
      3: { cellWidth: 15 },
      4: { cellWidth: 35, halign: 'right' },
      5: { cellWidth: 35, halign: 'right' },
      6: { cellWidth: 35, halign: 'right' },
      7: { cellWidth: 20, halign: 'center' },
      8: { cellWidth: 40 }
    }
  });
  
  // Footer
  const pageHeight = doc.internal.pageSize.height;
  doc.setFontSize(8);
  doc.text(`Document généré le ${formatDate()} - ${settings.nomEcole || settings.schoolName}`, 148.5, pageHeight - 10, { align: 'center' });
  
  doc.save(`Rapport_${classe.replace(/\s/g, '_')}.pdf`);
};

export const generateNonSoldesReport = (students: Student[], settings: AdminSettings): void => {
  const doc = new jsPDF('landscape') as jsPDFWithAutoTable;
  const nonSoldes = students.filter(s => s.restant > 0);
  
  // Header
  doc.setFillColor(220, 38, 38);
  doc.rect(0, 0, 297, 30, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(settings.nomEcole || settings.schoolName, 148.5, 12, { align: 'center' });
  doc.setFontSize(12);
  doc.text(`LISTE DES ÉLÈVES NON SOLDÉS - ${settings.anneScolaire || settings.schoolYear}`, 148.5, 23, { align: 'center' });
  
  const totalRestant = nonSoldes.reduce((sum, s) => sum + s.restant, 0);
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11);
  doc.text(`Total élèves: ${nonSoldes.length} | Total restant à recouvrer: ${formatMontant(totalRestant)}`, 148.5, 40, { align: 'center' });
  
  // Table
  autoTable(doc, {
    startY: 48,
    head: [['N°', 'Nom & Prénom', 'Classe', 'Téléphone', 'Écolage', 'Payé', 'Restant', 'Taux']],
    body: nonSoldes.map((s, i) => [
      i + 1,
      `${s.nom} ${s.prenom}`,
      s.classe,
      s.telephone,
      formatMontant(s.ecolage),
      formatMontant(s.dejaPaye),
      formatMontant(s.restant),
      `${Math.round((s.dejaPaye / s.ecolage) * 100)}%`
    ]),
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [220, 38, 38], fontStyle: 'bold' }
  });
  
  doc.save(`Eleves_Non_Soldes_${formatDate().replace(/\s/g, '_')}.pdf`);
};
